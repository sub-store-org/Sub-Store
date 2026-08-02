import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { COLLECTIONS_KEY, FILES_KEY, SUBS_KEY } from '@/constants';

const UUID = '11111111-1111-4111-8111-111111111111';
const VLESS_WS = `vless://${UUID}@1.1.1.1:443?security=tls&type=ws&host=cdn.example.com&path=%2Fws&sni=sni.example.com#VLESS%20WS`;

let $;
let openApi;
let registerDownloadRoutes;
let registerSubscriptionRoutes;
let originalError;
let originalInfo;
let originalNotify;
let originalRead;
let originalWarn;
let originalWrite;
let state;
let ageUtils;

function createRouteApp() {
    const handlers = new Map();

    return {
        handlers,
        get(pattern, handler) {
            handlers.set(`GET ${pattern}`, handler);
            return this;
        },
        route(pattern) {
            const chain = {
                get(handler) {
                    handlers.set(`GET ${pattern}`, handler);
                    return chain;
                },
                patch(handler) {
                    handlers.set(`PATCH ${pattern}`, handler);
                    return chain;
                },
                delete(handler) {
                    handlers.set(`DELETE ${pattern}`, handler);
                    return chain;
                },
                post(handler) {
                    handlers.set(`POST ${pattern}`, handler);
                    return chain;
                },
                put(handler) {
                    handlers.set(`PUT ${pattern}`, handler);
                    return chain;
                },
            };
            return chain;
        },
    };
}

function getHandler(pattern) {
    const app = createRouteApp();
    registerDownloadRoutes(app);
    return app.handlers.get(`GET ${pattern}`);
}

function getSubscriptionHandler(pattern) {
    const app = createRouteApp();
    registerSubscriptionRoutes(app);
    return app.handlers.get(`GET ${pattern}`);
}

function createResponse(routePath) {
    return {
        headers: {},
        req: {
            route: {
                path: routePath,
            },
        },
        sent: null,
        statusCode: 200,
        removeHeader(key) {
            delete this.headers[key];
            return this;
        },
        getHeaders() {
            return this.headers;
        },
        send(payload) {
            this.sent = payload;
            return this;
        },
        json(payload) {
            this.sent = payload;
            return this;
        },
        set(key, value) {
            this.headers[key] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
    };
}

async function requestDownloadSubscription(query) {
    const handler = getHandler('/download/:name');
    const res = createResponse('/download/:name');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: { name: 'local-vless' },
            path: '/download/local-vless',
            query,
            url: '/download/local-vless',
        },
        res,
    );

    return res;
}

async function downloadSubscription(query) {
    const res = await requestDownloadSubscription(query);
    return res.sent;
}

async function downloadCollection(query) {
    const handler = getHandler('/download/collection/:name');
    const res = createResponse('/download/collection/:name');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: { name: 'local-col' },
            path: '/download/collection/local-col',
            query,
            url: '/download/collection/local-col',
        },
        res,
    );

    return res.sent;
}

async function requestDownloadCollection(query) {
    const handler = getHandler('/download/collection/:name');
    const res = createResponse('/download/collection/:name');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: { name: 'local-col' },
            path: '/download/collection/local-col',
            query,
            url: '/download/collection/local-col',
        },
        res,
    );

    return res;
}

async function requestSubscriptionFlow(query) {
    const handler = getSubscriptionHandler('/api/sub/flow/:name');
    const res = createResponse('/api/sub/flow/:name');

    await handler(
        {
            params: { name: 'local-vless' },
            query,
        },
        res,
    );

    return res;
}

async function requestShareSubscription({ query = {}, shareToken } = {}) {
    const handler = getHandler('/share/sub/:name');
    const res = createResponse('/share/sub/:name');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: { name: 'local-vless' },
            path: '/share/sub/local-vless',
            query,
            subStoreShareToken: shareToken,
            url: '/share/sub/local-vless',
        },
        res,
    );

    return res;
}

async function expectDecryptFailure(armored, secretKey) {
    try {
        await ageUtils.decryptArmorIfPresent(armored, secretKey);
    } catch (e) {
        expect(e.message).to.contain('age 解密失败');
        return;
    }

    throw new Error('Expected age decrypt to fail');
}

describe('download routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        openApi = require('@/vendor/open-api');
        ({ default: registerDownloadRoutes } = require('@/restful/download'));
        ({ default: registerSubscriptionRoutes } = require(
            '@/restful/subscriptions'
        ));
        ageUtils = require('@/utils/age');

        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
        originalInfo = $.info.bind($);
        originalWarn = $.warn.bind($);
        originalError = $.error.bind($);
        originalNotify = $.notify.bind($);
    });

    after(function () {
        if ($) {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            $.warn = originalWarn;
            $.error = originalError;
            $.notify = originalNotify;
        }
    });

    beforeEach(function () {
        state = {
            [SUBS_KEY]: [
                {
                    name: 'local-vless',
                    source: 'local',
                    content: VLESS_WS,
                },
            ],
            [COLLECTIONS_KEY]: [
                {
                    name: 'local-col',
                    subscriptions: ['local-vless'],
                    firstSubFlow: false,
                },
            ],
        };

        $.read = (key) => state[key] || [];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = () => {};
        $.warn = () => {};
        $.error = () => {};
        $.notify = () => {};
    });

    it('uses truthiness for subscription noFlow query values', async function () {
        state[SUBS_KEY][0].subUserinfo =
            'upload=1; download=2; total=3; expire=4';

        const queryOmitted = await requestDownloadSubscription({
            target: 'JSON',
        });
        expect(queryOmitted.headers).to.have.property('subscription-userinfo');

        const bareQuery = await requestDownloadSubscription({
            target: 'JSON',
            noFlow: '',
        });
        expect(bareQuery.headers).to.have.property('subscription-userinfo');

        const queryDisabled = await requestDownloadSubscription({
            target: 'JSON',
            noFlow: 'false',
        });
        expect(queryDisabled.headers).to.not.have.property(
            'subscription-userinfo',
        );

        state[SUBS_KEY][0].noFlow = true;
        const settingDisabled = await requestDownloadSubscription({
            target: 'JSON',
        });
        expect(settingDisabled.headers).to.not.have.property(
            'subscription-userinfo',
        );
    });

    it('logs noFlow query overrides for subscriptions and collections', async function () {
        const logs = [];
        $.info = (message) => logs.push(message);

        for (const request of [
            requestDownloadSubscription,
            requestDownloadCollection,
        ]) {
            logs.length = 0;
            await request({ target: 'JSON', noFlow: 'false' });
            expect(logs).to.include('指定不查询订阅流量信息: false');
        }
    });

    it('returns 400 when noFlow disables the flow endpoint', async function () {
        state[SUBS_KEY][0].subUserinfo =
            'upload=1; download=2; total=3; expire=4';
        const bareQuery = await requestSubscriptionFlow({ noFlow: '' });
        expect(bareQuery.statusCode).to.equal(200);

        const res = await requestSubscriptionFlow({ noFlow: 'false' });
        expect(res.statusCode).to.equal(400);
        expect(res.sent.error.code).to.equal('NO_FLOW_INFO');
    });

    it('skips validCheck flow requests for direct and internal file noFlow links', async function () {
        const originalHTTP = openApi.HTTP;

        try {
            for (const [sourceUrl, request, viaFile] of [
                [
                    'https://example.com/subscription#validCheck',
                    requestDownloadSubscription,
                ],
                [
                    'https://example.com/collection#validCheck',
                    requestDownloadCollection,
                ],
                [
                    'https://example.com/nested-file-subscription#validCheck',
                    requestDownloadSubscription,
                    true,
                ],
                [
                    'https://example.com/nested-file-collection#validCheck',
                    requestDownloadCollection,
                    true,
                ],
            ]) {
                const requestedUrls = [];
                state[SUBS_KEY][0] = {
                    name: 'local-vless',
                    source: 'remote',
                    url: viaFile ? '/api/file/nested-flow' : sourceUrl,
                };
                if (viaFile) {
                    state[FILES_KEY] = [
                        {
                            name: 'nested-flow',
                            source: 'remote',
                            url: sourceUrl,
                        },
                    ];
                }
                openApi.HTTP = () => ({
                    get: async ({ url }) => {
                        requestedUrls.push(url);
                        return {
                            body: VLESS_WS,
                            headers:
                                requestedUrls.length > 1
                                    ? {
                                          'subscription-userinfo':
                                              'upload=1; download=2; total=3; expire=4102444800',
                                      }
                                    : {},
                            statusCode: 200,
                        };
                    },
                    head: async ({ url }) => {
                        requestedUrls.push(url);
                        return {
                            headers: {
                                'subscription-userinfo':
                                    'upload=1; download=2; total=3; expire=4102444800',
                            },
                            statusCode: 200,
                        };
                    },
                });

                const res = await request({
                    target: 'JSON',
                    noCache: 'true',
                    noFlow: 'false',
                });

                expect(res.statusCode).to.equal(200);
                expect(requestedUrls).to.deep.equal([
                    sourceUrl.split('#')[0],
                ]);
            }
        } finally {
            openApi.HTTP = originalHTTP;
        }
    });

    it('keeps noFlow for processor-triggered downloads', async function () {
        const originalHTTP = openApi.HTTP;

        try {
            for (const [sourceName, request] of [
                ['subscription', requestDownloadSubscription],
                ['collection', requestDownloadCollection],
            ]) {
                const scriptUrl = `https://example.com/processor-script-${sourceName}`;
                const nestedUrl = `https://example.com/processor-sub-${sourceName}`;
                const requests = [];
                state[SUBS_KEY] = [
                    {
                        name: 'local-vless',
                        source: 'remote',
                        url: '/api/file/processor-flow',
                    },
                    {
                        name: 'processor-sub',
                        source: 'remote',
                        url: `${nestedUrl}#validCheck&noCache`,
                    },
                ];
                state[FILES_KEY] = [
                    {
                        name: 'processor-flow',
                        type: 'mihomoConfig',
                        sourceType: 'none',
                        process: [
                            {
                                type: 'Script Operator',
                                args: {
                                    mode: 'link',
                                    content: `${scriptUrl}#validCheck&noCache`,
                                },
                            },
                            {
                                type: 'Add Proxies From Subscription Operator',
                                args: {
                                    sourceName: 'processor-sub',
                                },
                            },
                        ],
                    },
                ];
                openApi.HTTP = () => ({
                    get: async ({ url }) => {
                        requests.push(['GET', url]);
                        return {
                            body: url.includes('processor-script')
                                ? 'mixed-port: 7890'
                                : VLESS_WS,
                            headers: {},
                            statusCode: 200,
                        };
                    },
                    head: async ({ url }) => {
                        requests.push(['HEAD', url]);
                        return {
                            headers: {
                                'subscription-userinfo':
                                    'upload=1; download=2; total=3; expire=4102444800',
                            },
                            statusCode: 200,
                        };
                    },
                });

                const res = await request({
                    target: 'JSON',
                    noCache: 'true',
                    noFlow: 'false',
                });

                expect(res.statusCode).to.equal(200);
                expect(requests).to.deep.equal([
                    ['GET', scriptUrl],
                    ['GET', nestedUrl],
                ]);
            }
        } finally {
            openApi.HTTP = originalHTTP;
        }
    });

    it('skips validCheck for noFlow URLs in multiline sources', async function () {
        const originalHTTP = openApi.HTTP;
        const requests = [];

        try {
            state[SUBS_KEY][0] = {
                name: 'local-vless',
                source: 'remote',
                url: [
                    'https://example.com/first#validCheck&noFlow=false',
                    'https://example.com/second',
                ].join('\n'),
            };
            openApi.HTTP = () => ({
                get: async ({ url }) => {
                    requests.push(['GET', url]);
                    return {
                        body: VLESS_WS,
                        headers: {},
                        statusCode: 200,
                    };
                },
                head: async ({ url }) => {
                    requests.push(['HEAD', url]);
                    return {
                        headers: {
                            'subscription-userinfo':
                                'upload=1; download=2; total=3; expire=4102444800',
                        },
                        statusCode: 200,
                    };
                },
            });

            const res = await requestDownloadSubscription({
                target: 'JSON',
                noCache: 'true',
            });

            expect(res.statusCode).to.equal(200);
            expect(requests).to.deep.equal([
                ['GET', 'https://example.com/first'],
                ['GET', 'https://example.com/second'],
            ]);
        } finally {
            openApi.HTTP = originalHTTP;
        }
    });

    it('uses truthiness for collection noFlow query values', async function () {
        state[COLLECTIONS_KEY][0].subUserinfo =
            'upload=1; download=2; total=3; expire=4';

        const queryOmitted = await requestDownloadCollection({
            target: 'JSON',
        });
        expect(queryOmitted.headers).to.have.property('subscription-userinfo');

        const bareQuery = await requestDownloadCollection({
            target: 'JSON',
            noFlow: '',
        });
        expect(bareQuery.headers).to.have.property('subscription-userinfo');

        const queryDisabled = await requestDownloadCollection({
            target: 'JSON',
            noFlow: 'false',
        });
        expect(queryDisabled.headers).to.not.have.property(
            'subscription-userinfo',
        );

        state[COLLECTIONS_KEY][0].noFlow = true;
        const settingDisabled = await requestDownloadCollection({
            target: 'JSON',
        });
        expect(settingDisabled.headers).to.not.have.property(
            'subscription-userinfo',
        );
    });

    it('keeps SurgeMac Mihomo external output unmerged by default', async function () {
        const output = await downloadSubscription({ target: 'SurgeMac' });

        expect(output).to.include(
            'VLESS WS=external,exec="/usr/local/bin/mihomo"',
        );
        expect(output).to.not.include('VLESS WS=socks5');
        expect(output).to.not.include('mihomo merged=external');
    });

    it('enables merged Mihomo external output when the query parameter is present', async function () {
        const output = await downloadSubscription({
            target: 'SurgeMac',
            mihomoMerge: 'true',
            mihomoMergeName: 'Shared Mihomo',
        });

        expect(output).to.include('VLESS WS=socks5,127.0.0.1,65535');
        expect(output).to.include(
            'Shared Mihomo=external,exec="/usr/local/bin/mihomo"',
        );
        expect(output).to.not.include(
            'VLESS WS=external,exec="/usr/local/bin/mihomo"',
        );
    });

    it('treats mihomoMerge=false as enabled because query flags are presence-based', async function () {
        const output = await downloadSubscription({
            target: 'SurgeMac',
            mihomoMerge: 'false',
            mihomoMergeName: 'Shared Mihomo',
        });

        expect(output).to.include('VLESS WS=socks5,127.0.0.1,65535');
        expect(output).to.include(
            'Shared Mihomo=external,exec="/usr/local/bin/mihomo"',
        );
        expect(output).to.not.include(
            'VLESS WS=external,exec="/usr/local/bin/mihomo"',
        );
    });

    it('keeps merged Mihomo process external when mihomoExternal is enabled', async function () {
        const output = await downloadSubscription({
            target: 'SurgeMac',
            mihomoExternal: 'true',
            mihomoMerge: 'true',
        });

        expect(output).to.include('VLESS WS=socks5,127.0.0.1,65535');
        expect(output).to.include(
            'mihomo merged=external,exec="/usr/local/bin/mihomo",local-port=65534',
        );
        expect(output).to.not.include('mihomo merged=socks5');
    });

    it('enables merged Mihomo external output for collection downloads', async function () {
        const output = await downloadCollection({
            target: 'SurgeMac',
            mihomoMerge: 'true',
            mihomoMergeName: 'Shared Mihomo',
        });

        expect(output).to.include('VLESS WS=socks5,127.0.0.1,65535');
        expect(output).to.include(
            'Shared Mihomo=external,exec="/usr/local/bin/mihomo"',
        );
    });

    it('passes collection raw by subscription name to collection processors', async function () {
        state[COLLECTIONS_KEY][0].process = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: [
                                proxy.name,
                                Array.isArray(context.raw),
                                Object.keys(context.raw).join(','),
                                Array.isArray(context.raw['local-vless']),
                                context.raw['local-vless'].length,
                            ].join('|'),
                        }));
                    }`,
                },
            },
        ];

        const output = await downloadCollection({ target: 'JSON' });
        const proxies = JSON.parse(output);

        expect(proxies[0].name).to.equal('VLESS WS|false|local-vless|true|1');
    });

    it('keeps failed fallback subscriptions in collection raw', async function () {
        state[SUBS_KEY].push({
            name: 'broken-vless',
            source: 'local',
            content: VLESS_WS,
            ignoreFailedRemoteSub: 'fallbackQuiet',
            process: [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `throw new Error('boom')`,
                    },
                },
            ],
        });
        state[COLLECTIONS_KEY][0].subscriptions = [
            'local-vless',
            'broken-vless',
        ];
        state[COLLECTIONS_KEY][0].process = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: [
                                proxy.name,
                                Object.keys(context.raw).sort().join(','),
                                Object.prototype.hasOwnProperty.call(context.raw, 'broken-vless'),
                                Array.isArray(context.raw['broken-vless']),
                                context.raw['broken-vless'].length,
                            ].join('|'),
                        }));
                    }`,
                },
            },
        ];

        const output = await downloadCollection({ target: 'JSON' });
        const proxies = JSON.parse(output);

        expect(proxies[0].name).to.equal(
            'VLESS WS|broken-vless,local-vless|true|true|0',
        );
    });

    it('uses undefined raw for non-fallback ignored collection failures', async function () {
        state[SUBS_KEY].push({
            name: 'broken-vless',
            source: 'local',
            content: VLESS_WS,
            process: [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `throw new Error('boom')`,
                    },
                },
            ],
        });
        state[COLLECTIONS_KEY][0].ignoreFailedRemoteSub = 'enabled';
        state[COLLECTIONS_KEY][0].subscriptions = [
            'broken-vless',
            'local-vless',
        ];
        state[COLLECTIONS_KEY][0].process = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: [
                                proxy.name,
                                Object.keys(context.raw).sort().join(','),
                                Object.prototype.hasOwnProperty.call(context.raw, 'broken-vless'),
                                context.raw['broken-vless'] === undefined,
                            ].join('|'),
                        }));
                    }`,
                },
            },
        ];

        const output = await downloadCollection({ target: 'JSON' });
        const proxies = JSON.parse(output);

        expect(proxies.map((proxy) => proxy.name)).to.deep.equal([
            'VLESS WS|broken-vless,local-vless|true|true',
        ]);
    });

    it('runs collection processors when fallback partial failure leaves empty successful results', async function () {
        state[SUBS_KEY][0].process = [
            {
                type: 'Script Filter',
                args: {
                    mode: 'script',
                    content: `function filter() {
                        return [false];
                    }`,
                },
            },
        ];
        state[SUBS_KEY].push({
            name: 'broken-vless',
            source: 'local',
            content: VLESS_WS,
            process: [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `throw new Error('boom')`,
                    },
                },
            ],
        });
        state[COLLECTIONS_KEY][0].ignoreFailedRemoteSub = 'fallbackQuiet';
        state[COLLECTIONS_KEY][0].subscriptions = [
            'broken-vless',
            'local-vless',
        ];
        state[COLLECTIONS_KEY][0].process = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        return [
                            {
                                type: 'direct',
                                name: [
                                    'collection-ran',
                                    proxies.length,
                                    Object.keys(context.raw).sort().join(','),
                                    Object.prototype.hasOwnProperty.call(context.raw, 'broken-vless'),
                                    Array.isArray(context.raw['broken-vless']),
                                    context.raw['broken-vless'].length,
                                    Array.isArray(context.raw['local-vless']),
                                    context.raw['local-vless'].length,
                                ].join('|'),
                            },
                        ];
                    }`,
                },
            },
        ];

        const output = await downloadCollection({ target: 'JSON' });
        const proxies = JSON.parse(output);

        expect(proxies.map((proxy) => proxy.name)).to.deep.equal([
            'collection-ran|0|broken-vless,local-vless|true|true|0|true|1',
        ]);
    });

    it('applies shortcut response transformers before sending subscription output', async function () {
        state[SUBS_KEY][0].process = [
            {
                type: 'Response Transformer',
                args: {
                    mode: 'script',
                    content:
                        "$res.status = 202\n$res.header['x-test'] = 'ok'\n$res.body = 'changed'",
                },
            },
        ];

        const res = await requestDownloadSubscription({ target: 'JSON' });

        expect(res.statusCode).to.equal(202);
        expect(res.headers['x-test']).to.equal('ok');
        expect(res.sent).to.equal('changed');
    });

    it('applies transformFunction response transformers before sending subscription output', async function () {
        state[SUBS_KEY][0].process = [
            {
                type: 'Response Transformer',
                args: {
                    mode: 'script',
                    content: `async function transformFunction(res, context) {
                        res.status = 201;
                        res.body = context.source['local-vless'].name;
                        return res;
                    }`,
                },
            },
        ];

        const res = await requestDownloadSubscription({ target: 'JSON' });

        expect(res.statusCode).to.equal(201);
        expect(res.sent).to.equal('local-vless');
    });

    it('rejects fakeSub on share routes', async function () {
        const res = await requestShareSubscription({
            query: {
                fakeSub: '1',
                content: VLESS_WS,
            },
            shareToken: {
                type: 'sub',
                name: 'local-vless',
            },
        });

        expect(res.statusCode).to.equal(400);
        expect(res.sent.status).to.equal('failed');
        expect(res.sent.error.code).to.equal('UNSUPPORTED_SHARE_FAKE_SUB');
        expect(res.sent.error.type).to.equal('RequestInvalidError');
    });

    it('allows _fakeNode on share routes for invalid-share fallback', async function () {
        const res = await requestShareSubscription({
            query: {
                _fakeNode: '1',
                target: 'JSON',
            },
            shareToken: {
                type: 'sub',
                name: 'local-vless',
            },
        });

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.be.a('string');
        expect(res.sent).to.include('fakeNodeInfo');
    });

    it('rejects url on share routes', async function () {
        const res = await requestShareSubscription({
            query: {
                url: 'https://example.com/sub.txt',
            },
            shareToken: {
                type: 'sub',
                name: 'local-vless',
            },
        });

        expect(res.statusCode).to.equal(400);
        expect(res.sent.status).to.equal('failed');
        expect(res.sent.error.code).to.equal(
            'UNSUPPORTED_SHARE_SUB_SOURCE_OVERRIDE',
        );
        expect(res.sent.error.type).to.equal('RequestInvalidError');
    });

    it('rejects content on share routes', async function () {
        const res = await requestShareSubscription({
            query: {
                content: VLESS_WS,
            },
            shareToken: {
                type: 'sub',
                name: 'local-vless',
            },
        });

        expect(res.statusCode).to.equal(400);
        expect(res.sent.status).to.equal('failed');
        expect(res.sent.error.code).to.equal(
            'UNSUPPORTED_SHARE_SUB_SOURCE_OVERRIDE',
        );
        expect(res.sent.error.type).to.equal('RequestInvalidError');
    });

    it('rejects mergeSources on share routes', async function () {
        const res = await requestShareSubscription({
            query: {
                mergeSources: 'remoteFirst',
            },
            shareToken: {
                type: 'sub',
                name: 'local-vless',
            },
        });

        expect(res.statusCode).to.equal(400);
        expect(res.sent.status).to.equal('failed');
        expect(res.sent.error.code).to.equal(
            'UNSUPPORTED_SHARE_SUB_MERGE_SOURCES',
        );
        expect(res.sent.error.type).to.equal('RequestInvalidError');
    });

    it('encrypts transformed subscription output with source age-public-key', async function () {
        const pair = await ageUtils.generateKeyPair();
        state[SUBS_KEY][0]['age-public-key'] = pair['age-public-key'];
        state[SUBS_KEY][0].process = [
            {
                type: 'Response Transformer',
                args: {
                    mode: 'script',
                    content:
                        "$res.header['x-test'] = 'ok'\n$res.body = 'changed'",
                },
            },
        ];

        const res = await requestDownloadSubscription({ target: 'JSON' });
        const decrypted = await ageUtils.decryptArmorIfPresent(
            res.sent,
            pair['age-secret-key'],
        );

        expect(res.headers['x-test']).to.equal('ok');
        expect(res.headers['Content-Type']).to.equal(
            'text/plain; charset=utf-8',
        );
        expect(res.sent).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('changed');
    });

    it('encrypts collection output with collection age-public-key', async function () {
        const pair = await ageUtils.generateKeyPair();
        state[COLLECTIONS_KEY][0]['age-public-key'] = pair['age-public-key'];

        const res = await requestDownloadCollection({ target: 'JSON' });
        const decrypted = await ageUtils.decryptArmorIfPresent(
            res.sent,
            pair['age-secret-key'],
        );

        expect(res.headers['Content-Type']).to.equal(
            'text/plain; charset=utf-8',
        );
        expect(res.sent).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.include('VLESS WS');
    });

    it('uses share age-public-key before source subscription key', async function () {
        const sourcePair = await ageUtils.generateKeyPair();
        const sharePair = await ageUtils.generateKeyPair();
        state[SUBS_KEY][0]['age-public-key'] = sourcePair['age-public-key'];

        const res = await requestShareSubscription({
            query: { target: 'JSON' },
            shareToken: {
                type: 'sub',
                name: 'local-vless',
                'age-public-key': sharePair['age-public-key'],
            },
        });
        const decrypted = await ageUtils.decryptArmorIfPresent(
            res.sent,
            sharePair['age-secret-key'],
        );

        expect(res.sent).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.include('VLESS WS');
        await expectDecryptFailure(res.sent, sourcePair['age-secret-key']);
    });

});
