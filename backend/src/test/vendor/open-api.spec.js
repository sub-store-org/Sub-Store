import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';

import { HTTP } from '@/vendor/open-api';

const undici = eval("require('undici')");

describe('open-api HTTP adapter', function () {
    const proxyEnvKeys = [
        'all_proxy',
        'ALL_PROXY',
        'http_proxy',
        'HTTP_PROXY',
        'https_proxy',
        'HTTPS_PROXY',
        'no_proxy',
        'NO_PROXY',
    ];
    let originalEnv;
    let originalEnvHttpProxyAgent;
    let originalProxyAgent;
    let originalRedirect;
    let originalRequest;
    let agentOptions;
    let redirectOptions;
    let requestOptions;

    beforeEach(function () {
        originalEnv = Object.fromEntries(
            proxyEnvKeys.map((key) => [key, process.env[key]]),
        );
        proxyEnvKeys.forEach((key) => {
            delete process.env[key];
        });

        originalEnvHttpProxyAgent = undici.EnvHttpProxyAgent;
        originalProxyAgent = undici.ProxyAgent;
        originalRedirect = undici.interceptors.redirect;
        originalRequest = undici.request;
        agentOptions = [];
        redirectOptions = undefined;
        requestOptions = undefined;

        class CapturingAgent {
            constructor(options) {
                agentOptions.push(options);
            }

            compose() {
                return this;
            }
        }

        undici.EnvHttpProxyAgent = CapturingAgent;
        undici.ProxyAgent = CapturingAgent;
        undici.interceptors.redirect = (options) => {
            redirectOptions = options;
            return () => {};
        };
        undici.request = async (_url, options) => {
            requestOptions = options;
            return {
                statusCode: 200,
                headers: {},
                body: {
                    text: async () => '',
                    arrayBuffer: async () => new ArrayBuffer(0),
                },
            };
        };
    });

    afterEach(function () {
        undici.EnvHttpProxyAgent = originalEnvHttpProxyAgent;
        undici.ProxyAgent = originalProxyAgent;
        undici.interceptors.redirect = originalRedirect;
        undici.request = originalRequest;
        proxyEnvKeys.forEach((key) => {
            if (originalEnv[key] == null) {
                delete process.env[key];
            } else {
                process.env[key] = originalEnv[key];
            }
        });
    });

    it('enables undici HTTP/2 by default in Node.js', async function () {
        await HTTP().get('https://example.com/dns-query');

        expect(agentOptions).to.have.length(1);
        expect(agentOptions[0].allowH2).to.equal(true);
        expect(agentOptions[0].connect.allowH2).to.equal(true);
        expect(agentOptions[0].requestTls.allowH2).to.equal(true);
    });

    it('allows callers to force undici HTTP/2 off', async function () {
        await HTTP().get({
            url: 'https://example.com/dns-query',
            allowH2: false,
        });

        expect(agentOptions).to.have.length(1);
        expect(agentOptions[0].allowH2).to.equal(false);
        expect(agentOptions[0].connect.allowH2).to.equal(false);
        expect(agentOptions[0].requestTls.allowH2).to.equal(false);
    });

    it('passes proxyTunnel to undici proxy agents', async function () {
        await HTTP().get({
            url: 'http://example.com/subscription',
            proxy: 'http://127.0.0.1:8080',
            proxyTunnel: true,
        });
        await HTTP().get({
            url: 'http://example.com/subscription',
            proxyTunnel: true,
        });

        expect(agentOptions).to.have.length(2);
        expect(agentOptions.map(({ proxyTunnel }) => proxyTunnel)).to.deep.equal([
            true,
            true,
        ]);
    });

    it('uses the Undici option that throws at the redirect limit', async function () {
        await HTTP().get('https://example.com/subscription');

        expect(redirectOptions).to.deep.equal({
            maxRedirections: 3,
            throwOnMaxRedirect: true,
        });
    });

    it('rejects request setup errors', async function () {
        let timeoutCalls = 0;
        const options = {
            url: 'https://example.com/subscription',
            timeout: 5,
            events: {
                onTimeout() {
                    timeoutCalls += 1;
                },
            },
        };
        options.circular = options;

        let error;
        try {
            await HTTP().get(options);
        } catch (e) {
            error = e;
        }

        expect(error).to.be.instanceOf(TypeError);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(timeoutCalls).to.equal(0);
    });

    it('normalizes Node.js request header names to lowercase', async function () {
        await HTTP({
            headers: {
                'User-Agent': 'Surge',
            },
        }).get('https://example.com/subscription');

        expect(requestOptions.headers).to.include({
            'user-agent': 'Surge',
            accept: '*/*',
        });
    });

    it('keeps an explicit Accept header in Node.js', async function () {
        await HTTP({
            headers: {
                Accept: 'application/json',
            },
        }).get('https://example.com/subscription');

        expect(requestOptions.headers).to.deep.equal({
            accept: 'application/json',
        });
    });

    it('preserves __proto__ headers when normalizing names', async function () {
        await HTTP({
            headers: Object.fromEntries([['__proto__', 'sent']]),
        }).get('https://example.com/subscription');

        expect(
            Object.prototype.hasOwnProperty.call(
                requestOptions.headers,
                '__proto__',
            ),
        ).to.equal(true);
        expect(requestOptions.headers.__proto__).to.equal('sent');
    });

    it('omits Accept when callers set it to null in Node.js', async function () {
        await HTTP({
            headers: {
                'User-Agent': 'Surge',
                Accept: null,
            },
        }).get('https://example.com/subscription');

        expect(requestOptions.headers).to.deep.equal({
            'user-agent': 'Surge',
        });
    });
});
