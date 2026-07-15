import { expect } from 'chai';
import crypto from 'crypto';
import http from 'http';
import zlib from 'zlib';
import { after, before, beforeEach, describe, it } from 'mocha';

import { SETTINGS_KEY } from '@/constants';

let $;
let provider;
let originalRead;
let originalWrite;
let originalInfo;
let originalError;
let state;

function listen(server) {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}

function getServerURL(server) {
    const address = server.address();
    return `http://127.0.0.1:${address.port}`;
}

function createSub(cfgUrl, extra = {}) {
    return {
        name: 'api-demo',
        source: 'api',
        content: [
            'cfgUrls:',
            `  - ${cfgUrl}`,
            'username: user@example.com',
            'password: secret',
            'headers:',
            '  User-Agent: ProviderUA',
            '  X-Provider: enabled',
            'decrypt: null',
        ].join('\n'),
        ...extra,
    };
}

describe('provider subscription utils', function () {
    before(function () {
        ({ default: $ } = require('@/core/app'));
        provider = require('@/utils/provider');
        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
        originalInfo = $.info.bind($);
        originalError = $.error.bind($);
    });

    after(function () {
        $.read = originalRead;
        $.write = originalWrite;
        $.info = originalInfo;
        $.error = originalError;
    });

    beforeEach(function () {
        state = { [SETTINGS_KEY]: { defaultTimeout: 3000 } };
        $.read = (key) => state[key];
        $.write = (value, key) => {
            state[key] = value;
            return true;
        };
        $.info = () => {};
        $.error = () => {};
    });

    it('parses provider YAML and deliberately ignores subscribeUrl input', function () {
        const config = provider.parseProviderConfig(
            [
                'cfgUrls: https://example.com/cfg',
                'username: user',
                'password: pass',
                'headers:',
                '  User-Agent: DemoUA',
                'decrypt: null',
                'subscribeUrl: https://should-not-be-used.example/sub',
            ].join('\n'),
        );

        expect(config).to.deep.equal({
            cfgUrls: ['https://example.com/cfg'],
            username: 'user',
            password: 'pass',
            headers: { 'User-Agent': 'DemoUA' },
            decrypt: null,
        });
        expect(config).not.to.have.property('subscribeUrl');
    });

    it('normalizes provider API base URL candidates', function () {
        expect(
            provider.baseURLCandidates('https://example.com/'),
        ).to.deep.equal(['https://example.com/api/v1']);
        expect(
            provider.baseURLCandidates('https://example.com/api'),
        ).to.deep.equal([
            'https://example.com/api',
            'https://example.com/api/v1',
        ]);
        expect(
            provider.baseURLCandidates('https://example.com/api/v1'),
        ).to.deep.equal(['https://example.com/api/v1']);
    });

    it('decodes the provider AES-CBC payload with optional gzip wrapping', function () {
        const key = '1234567890abcdef';
        const iv = 'abcdef1234567890';
        const content = 'proxies:\n  - {name: Demo, type: ss}';
        const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
        const encrypted = Buffer.concat([
            cipher.update(Buffer.from(content).toString('base64')),
            cipher.final(),
        ]).toString('base64');

        expect(
            provider.decodeProviderSubscriptionBody(encrypted, { key, iv }),
        ).to.equal(content);
        expect(
            provider.decodeProviderSubscriptionBody(
                zlib.gzipSync(Buffer.from(encrypted)),
                { key, iv },
            ),
        ).to.equal(content);
    });

    it('refreshes once, caches subscribeUrl, and reuses configured headers', async function () {
        let baseURL;
        let cfgHits = 0;
        let loginHits = 0;
        let subscribeHits = 0;
        const server = http.createServer((req, res) => {
            if (req.url === '/cfg') {
                cfgHits++;
                const body = Buffer.from(
                    JSON.stringify({ hosts: [baseURL] }),
                ).toString('base64');
                res.end(body);
                return;
            }
            if (req.url === '/api/v1/passport/auth/login') {
                loginHits++;
                expect(req.headers['user-agent']).to.equal('ProviderUA');
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ data: { auth_data: 'Bearer auth' } }));
                return;
            }
            if (req.url === '/api/v1/user/getSubscribe') {
                subscribeHits++;
                expect(req.headers.authorization).to.equal('Bearer auth');
                res.setHeader('content-type', 'application/json');
                res.end(
                    JSON.stringify({
                        data: { subscribe_url: `${baseURL}/subscription` },
                    }),
                );
                return;
            }
            res.statusCode = 404;
            res.end();
        });
        await listen(server);
        baseURL = getServerURL(server);

        const requested = [];
        const download = async (url) => {
            requested.push(url);
            return {
                result: 'proxies:\n  - {name: Demo, type: ss}',
                raw: 'proxies:\n  - {name: Demo, type: ss}',
            };
        };
        try {
            const sub = createSub(`${baseURL}/cfg`);
            const first = await provider.fetchProviderSubscription(sub, {
                download,
            });
            const second = await provider.fetchProviderSubscription(sub, {
                download,
            });

            expect(first.subscribeUrl).to.equal(`${baseURL}/subscription`);
            expect(second.subscribeUrl).to.equal(`${baseURL}/subscription`);
            expect(cfgHits).to.equal(1);
            expect(loginHits).to.equal(1);
            expect(subscribeHits).to.equal(1);
            expect(requested).to.have.length(2);
            const args = JSON.parse(
                decodeURIComponent(requested[0].split('#')[1]),
            );
            expect(JSON.parse(args.headers)).to.deep.equal({
                'User-Agent': 'ProviderUA',
                'X-Provider': 'enabled',
            });
        } finally {
            await close(server);
        }
    });

    it('shares an initial refresh and falls back to the token URL', async function () {
        let baseURL;
        let cfgHits = 0;
        let loginHits = 0;
        const server = http.createServer((req, res) => {
            if (req.url === '/cfg') {
                cfgHits++;
                res.end(
                    Buffer.from(JSON.stringify({ hosts: [baseURL] })).toString(
                        'base64',
                    ),
                );
                return;
            }
            if (req.url === '/api/v1/passport/auth/login') {
                loginHits++;
                res.end(JSON.stringify({ data: { auth_data: 'auth' } }));
                return;
            }
            if (req.url === '/api/v1/user/getSubscribe') {
                res.end(
                    JSON.stringify({
                        data: {
                            token: 'new token',
                            subscribe_url: `${baseURL}/expired`,
                        },
                    }),
                );
                return;
            }
            res.statusCode = 404;
            res.end();
        });
        await listen(server);
        baseURL = getServerURL(server);
        const fallback = `${baseURL}/api/v1/client/subscribe?token=new%20token`;
        let fallbackHits = 0;
        const download = async (url) => {
            const plainUrl = url.split('#')[0];
            if (plainUrl.endsWith('/expired')) throw new Error('expired');
            expect(plainUrl).to.equal(fallback);
            fallbackHits++;
            return { result: 'proxies: []', raw: 'proxies: []' };
        };
        try {
            const sub = createSub(`${baseURL}/cfg`, {
                name: 'api-concurrent-demo',
            });
            const [first, second] = await Promise.all([
                provider.fetchProviderSubscription(sub, { download }),
                provider.fetchProviderSubscription(sub, { download }),
            ]);
            expect(first.subscribeUrl).to.equal(fallback);
            expect(second.subscribeUrl).to.equal(fallback);
            expect(cfgHits).to.equal(1);
            expect(loginHits).to.equal(1);
            expect(fallbackHits).to.equal(1);
        } finally {
            await close(server);
        }
    });
});
