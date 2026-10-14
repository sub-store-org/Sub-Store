import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    FILES_KEY,
    SETTINGS_KEY,
    SUBS_KEY,
} from '@/constants';

const VLESS_WS =
    'vless://11111111-1111-4111-8111-111111111111@1.1.1.1:443?security=tls&type=ws&host=cdn.example.com&path=%2Fws&sni=sni.example.com#VLESS%20WS';

let $;
let registerArtifactRoutes;
let registerSyncRoutes;
let produceArtifact;
let produceSyncArtifactOutput;
let originalError;
let originalInfo;
let originalRead;
let originalWrite;
let state;
let ageUtils;

function createRouteApp() {
    const handlers = new Map();
    const methods = ['get', 'post', 'put', 'patch', 'delete'];
    const app = {
        handlers,
        route(pattern) {
            const chain = {};
            methods.forEach((method) => {
                chain[method] = (handler) => {
                    handlers.set(`${method.toUpperCase()} ${pattern}`, handler);
                    return chain;
                };
            });
            return chain;
        },
    };

    methods.forEach((method) => {
        app[method] = (pattern, handler) => {
            handlers.set(`${method.toUpperCase()} ${pattern}`, handler);
            return app;
        };
    });

    return app;
}

function getHandler(pattern) {
    const app = createRouteApp();
    registerSyncRoutes(app);
    return app.handlers.get(`GET ${pattern}`);
}

function createResponse(routePath) {
    return {
        req: {
            route: {
                path: routePath,
            },
        },
        body: null,
        statusCode: 200,
        json(payload) {
            this.body = payload;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
    };
}

async function requestSyncArtifact(name) {
    const handler = getHandler('/api/sync/artifact/:name');
    const res = createResponse('/api/sync/artifact/:name');

    await handler(
        {
            body: {},
            params: { name },
            query: {},
        },
        res,
    );

    return res;
}

async function requestDeleteArtifact(name) {
    const app = createRouteApp();
    registerArtifactRoutes(app);
    const handler = app.handlers.get('DELETE /api/artifact/:name');
    const res = createResponse('/api/artifact/:name');

    await handler(
        {
            params: { name },
            query: {},
        },
        res,
    );

    return res;
}

describe('sync routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({ default: registerArtifactRoutes } = require('@/restful/artifacts'));
        ({
            default: registerSyncRoutes,
            produceArtifact,
            produceSyncArtifactOutput,
        } = require('@/restful/sync'));
        ageUtils = require('@/utils/age');

        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
        originalInfo = $.info.bind($);
        originalError = $.error.bind($);
    });

    after(function () {
        if ($) {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            $.error = originalError;
        }
    });

    beforeEach(function () {
        state = {
            [SETTINGS_KEY]: {},
            [SUBS_KEY]: [
                { name: 'raw-sub', source: 'local', content: VLESS_WS },
            ],
            [COLLECTIONS_KEY]: [
                { name: 'raw-col', subscriptions: ['raw-sub'] },
            ],
            [ARTIFACTS_KEY]: [
                {
                    name: 'local-artifact',
                    type: 'file',
                    source: 'local-file',
                    sync: true,
                    upload: false,
                    updated: 1711111111111,
                    url: 'https://gist.example.com/old',
                },
            ],
            [FILES_KEY]: [
                {
                    name: 'local-file',
                    source: 'local',
                    content: 'local content',
                },
            ],
        };

        $.read = (key) => state[key] || [];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = () => {};
        $.error = () => {};
    });

    it('returns subscription output and raw only when requested', async function () {
        state[SUBS_KEY][0].process = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        return proxies.map(proxy => ({ ...proxy, name: context.raw[0] }));
                    }`,
                },
            },
        ];

        for (const type of ['subscription', 'sub']) {
            for (const produceType of [undefined, 'internal', 'raw']) {
                const options = { type, name: 'raw-sub', produceType };
                const original = await produceArtifact(options);
                const output = await produceArtifact({
                    ...options,
                    includeRaw: true,
                });

                expect(output).to.deep.equal({
                    result: original,
                    raw: [VLESS_WS],
                });
                expect(
                    await produceArtifact({ ...options, includeRaw: false }),
                ).to.deep.equal(original);
                if (produceType !== 'raw') {
                    const proxies = Array.isArray(output.result)
                        ? output.result
                        : JSON.parse(output.result);
                    expect(proxies[0].name).to.equal(output.raw[0]);
                }
            }
        }
    });

    it('keeps processor raw arguments unchanged regardless of includeRaw', async function () {
        const { ProxyUtils } = require('@/core/proxy-utils');
        const originalProcess = ProxyUtils.process;
        let passedRaw;
        ProxyUtils.process = (...args) => {
            passedRaw = args[5];
            return originalProcess(...args);
        };

        try {
            for (const content of [VLESS_WS, [VLESS_WS]]) {
                state[SUBS_KEY][0].content = content;
                for (const options of [
                    {},
                    { includeRaw: false },
                    { includeRaw: true },
                ]) {
                    const output = await produceArtifact({
                        type: 'subscription',
                        name: 'raw-sub',
                        ...options,
                    });

                    expect(passedRaw).to.equal(content);
                    const result = options.includeRaw ? output.result : output;
                    expect(JSON.parse(result)).to.have.length(1);
                }
            }
        } finally {
            ProxyUtils.process = originalProcess;
        }
    });

    it('returns collection raw keyed by subscription name including tag matches', async function () {
        const taggedContent = VLESS_WS.replace('#VLESS%20WS', '#Tagged');
        state[SUBS_KEY].push({
            name: 'tagged-sub',
            source: 'local',
            content: taggedContent,
            tag: ['raw-tag'],
        });
        state[COLLECTIONS_KEY][0].subscriptionTags = ['raw-tag'];

        for (const type of ['collection', 'col']) {
            const options = { type, name: 'raw-col', produceType: 'internal' };
            const output = await produceArtifact({
                ...options,
                includeRaw: true,
            });

            expect(output.result).to.deep.equal(await produceArtifact(options));
            expect(output.result.map((proxy) => proxy.name)).to.deep.equal([
                'VLESS WS',
                'Tagged',
            ]);
            expect(output.raw).to.deep.equal({
                'raw-sub': [VLESS_WS],
                'tagged-sub': [taggedContent],
            });
        }
    });

    it('preserves unpreprocessed remote raw and merged source order', async function () {
        const openApi = require('@/vendor/open-api');
        const originalHTTP = openApi.HTTP;
        const remoteContent = [
            'proxies:',
            '  - name: Remote',
            '    type: ss',
            '    server: example.com',
            '    port: 443',
            '    cipher: aes-128-gcm',
            '    password: pass',
            '',
        ].join('\n');
        const secondContent = VLESS_WS.replace('#VLESS%20WS', '#Second');
        const url =
            'https://example.com/raw-first\nhttps://example.com/raw-second';
        openApi.HTTP = () => ({
            get: async ({ url }) => ({
                body: url.endsWith('raw-first') ? remoteContent : secondContent,
                headers: {},
                statusCode: 200,
            }),
        });

        try {
            for (const mergeSources of ['localFirst', 'remoteFirst']) {
                Object.assign(state[SUBS_KEY][0], {
                    source: 'remote',
                    url,
                    mergeSources,
                });
                const expectedRaw = [remoteContent, secondContent];
                if (mergeSources === 'localFirst')
                    expectedRaw.unshift(VLESS_WS);
                else expectedRaw.push(VLESS_WS);

                for (const [type, override] of [
                    ['subscription', false],
                    ['subscription', true],
                    ['collection', false],
                ]) {
                    const output = await produceArtifact({
                        type,
                        name: type === 'collection' ? 'raw-col' : 'raw-sub',
                        produceType: type === 'collection' ? 'internal' : 'raw',
                        ...(override
                            ? { url, content: VLESS_WS, mergeSources }
                            : {}),
                        noCache: true,
                        noFlow: true,
                        includeRaw: true,
                    });

                    expect(output.raw).to.deep.equal(
                        type === 'collection'
                            ? { 'raw-sub': expectedRaw }
                            : expectedRaw,
                    );
                    if (type === 'subscription') {
                        const remoteIndex =
                            mergeSources === 'localFirst' ? 1 : 0;
                        expect(
                            JSON.parse(output.result)[remoteIndex],
                        ).to.not.equal(remoteContent);
                    } else {
                        expect(output.result).to.have.length(3);
                    }
                }
            }
        } finally {
            openApi.HTTP = originalHTTP;
        }
    });

    it('returns available raw alongside subscription and collection fallback output', async function () {
        const failingProcess = [
            {
                type: 'Script Operator',
                args: { mode: 'script', content: "throw new Error('boom')" },
            },
        ];

        for (const type of ['subscription', 'collection']) {
            state[SUBS_KEY][0].process =
                type === 'subscription' ? failingProcess : [];
            state[COLLECTIONS_KEY][0].process =
                type === 'collection' ? failingProcess : [];
            const output = await produceArtifact({
                type,
                name: type === 'subscription' ? 'raw-sub' : 'raw-col',
                produceType: 'internal',
                ignoreFailedRemoteSub: 'fallbackQuiet',
                includeRaw: true,
            });

            expect(output).to.deep.equal({
                result: [],
                raw:
                    type === 'subscription'
                        ? [VLESS_WS]
                        : { 'raw-sub': [VLESS_WS] },
            });
        }
    });

    it('preserves ignored and fallback child failures in returned collection raw', async function () {
        state[SUBS_KEY].push({
            name: 'broken-sub',
            source: 'local',
            content: VLESS_WS,
            process: [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: "throw new Error('boom')",
                    },
                },
            ],
        });
        state[COLLECTIONS_KEY][0].subscriptions.push('broken-sub');

        for (const mode of ['quiet', 'fallbackQuiet']) {
            const output = await produceArtifact({
                type: 'collection',
                name: 'raw-col',
                ignoreFailedRemoteSub: mode,
                includeRaw: true,
            });

            expect(JSON.parse(output.result)).to.have.length(1);
            expect(output.raw).to.deep.equal({
                'raw-sub': [VLESS_WS],
                'broken-sub': mode === 'quiet' ? undefined : [],
            });
        }
    });

    it('updates run time without requiring a Gist URL when upload is disabled', async function () {
        const startedAt = new Date().getTime();

        const res = await requestSyncArtifact('local-artifact');

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.updated).to.be.at.least(startedAt);
        expect(res.body.data).to.not.have.property('url');
        expect(state[ARTIFACTS_KEY][0].updated).to.be.at.least(startedAt);
        expect(state[ARTIFACTS_KEY][0]).to.not.have.property('url');
    });

    it('preserves artifact edits made while a single artifact sync is running', async function () {
        const startedAt = new Date().getTime();
        let artifactReads = 0;
        $.read = (key) => {
            if (key === ARTIFACTS_KEY) {
                artifactReads++;
                if (artifactReads === 2) {
                    state[ARTIFACTS_KEY] = [
                        {
                            ...state[ARTIFACTS_KEY][0],
                            remark: 'edited while syncing',
                            cron: '55 23 * * *',
                        },
                    ];
                }
            }
            return state[key] || [];
        };

        const res = await requestSyncArtifact('local-artifact');

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.remark).to.equal('edited while syncing');
        expect(res.body.data.cron).to.equal('55 23 * * *');
        expect(res.body.data.updated).to.be.at.least(startedAt);
        expect(res.body.data).to.not.have.property('url');
        expect(state[ARTIFACTS_KEY][0].remark).to.equal('edited while syncing');
        expect(state[ARTIFACTS_KEY][0].cron).to.equal('55 23 * * *');
        expect(state[ARTIFACTS_KEY][0].updated).to.be.at.least(startedAt);
        expect(state[ARTIFACTS_KEY][0]).to.not.have.property('url');
    });

    it('does not try to delete a remote file when only run time exists', async function () {
        delete state[ARTIFACTS_KEY][0].url;

        const res = await requestDeleteArtifact('local-artifact');

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.remote).to.deep.equal({
            attempted: false,
            status: 'not_attempted',
        });
        expect(state[ARTIFACTS_KEY]).to.deep.equal([]);
    });

    it('encrypts sync artifact output with artifact age-public-key', async function () {
        const pair = await ageUtils.generateKeyPair();
        state[ARTIFACTS_KEY][0]['age-public-key'] = pair['age-public-key'];

        const output = await produceSyncArtifactOutput(state[ARTIFACTS_KEY][0]);
        const decrypted = await ageUtils.decryptArmorIfPresent(
            output,
            pair['age-secret-key'],
        );

        expect(output).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('local content');
    });

    it('uses source age-public-key when artifact has no key', async function () {
        const pair = await ageUtils.generateKeyPair();
        state[FILES_KEY][0]['age-public-key'] = pair['age-public-key'];

        const output = await produceSyncArtifactOutput(state[ARTIFACTS_KEY][0]);
        const decrypted = await ageUtils.decryptArmorIfPresent(
            output,
            pair['age-secret-key'],
        );

        expect(output).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('local content');
    });

    it('uses artifact age-public-key before source key', async function () {
        const sourcePair = await ageUtils.generateKeyPair();
        const artifactPair = await ageUtils.generateKeyPair();
        state[FILES_KEY][0]['age-public-key'] = sourcePair['age-public-key'];
        state[ARTIFACTS_KEY][0]['age-public-key'] =
            artifactPair['age-public-key'];

        const output = await produceSyncArtifactOutput(state[ARTIFACTS_KEY][0]);
        const decrypted = await ageUtils.decryptArmorIfPresent(
            output,
            artifactPair['age-secret-key'],
        );

        expect(output).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('local content');
        try {
            await ageUtils.decryptArmorIfPresent(
                output,
                sourcePair['age-secret-key'],
            );
            throw new Error('Expected source key decrypt to fail');
        } catch (e) {
            expect(e.message).to.contain('age 解密失败');
        }
    });
});
