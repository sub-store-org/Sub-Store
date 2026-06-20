import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { FILES_KEY, SUBS_KEY } from '@/constants';

let $;
let registerFileRoutes;
let registerPreviewRoutes;
let originalError;
let originalInfo;
let originalNotify;
let originalRead;
let originalWarn;
let originalWrite;
let state;

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
    registerFileRoutes(app);
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

async function requestFile(name, query = {}) {
    const handler = getHandler('/api/file/:name');
    const res = createResponse('/api/file/:name');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: { name },
            path: `/api/file/${name}`,
            query,
            socket: {},
            url: `/api/file/${name}`,
        },
        res,
    );

    return res;
}

async function previewFile(file) {
    const app = createRouteApp();
    registerPreviewRoutes(app);
    const handler = app.handlers.get('POST /api/preview/file');
    const res = createResponse('/api/preview/file');

    await handler(
        {
            body: file,
            headers: {},
            method: 'POST',
            path: '/api/preview/file',
            query: {},
            socket: {},
            url: '/api/preview/file',
        },
        res,
    );

    return res;
}

describe('mihomo profile file routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({ default: registerFileRoutes } = require('@/restful/file'));
        ({ default: registerPreviewRoutes } = require('@/restful/preview'));

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
                    name: 'demo-sub',
                    source: 'local',
                    content:
                        'proxies:\n' +
                        '  - {name: Supported, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret}\n' +
                        '  - {name: Unsupported, type: naive, server: naive.example.com, port: 443, username: user, password: pass, sni: naive.example.com}',
                    process: [],
                },
            ],
            [FILES_KEY]: [],
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

    it('builds mihomoProfile proxies before file processors run', async function () {
        state[FILES_KEY] = [
            {
                name: 'base-file',
                type: 'mihomoProfile',
                sourceType: 'subscription',
                sourceName: 'demo-sub',
                includeUnsupportedProxy: false,
                process: [],
            },
        ];

        const res = await requestFile('base-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('proxies:');
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.not.include('name: Unsupported');
    });

    it('previews mihomoProfile proxies before file processors run', async function () {
        const res = await previewFile({
            name: 'preview-file',
            type: 'mihomoProfile',
            sourceType: 'subscription',
            sourceName: 'demo-sub',
            includeUnsupportedProxy: false,
            process: [],
        });

        expect(res.statusCode).to.equal(200);
        expect(res.sent.status).to.equal('success');
        expect(res.sent.data.original).to.include('proxies:');
        expect(res.sent.data.original).to.include('name: Supported');
        expect(res.sent.data.original).to.not.include('name: Unsupported');
        expect(res.sent.data.processed).to.include('name: Supported');
    });

    it('keeps unsupported proxies for YAML mihomoProfile overrides when enabled', async function () {
        state[FILES_KEY] = [
            {
                name: 'yaml-file',
                type: 'mihomoProfile',
                sourceType: 'subscription',
                sourceName: 'demo-sub',
                includeUnsupportedProxy: true,
                process: [
                    {
                        type: 'Script Operator',
                        args: {
                            mode: 'script',
                            content: 'mixed-port: 7890',
                        },
                    },
                ],
            },
        ];

        const res = await requestFile('yaml-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7890');
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.include('name: Unsupported');
    });

    it('filters unsupported proxies for JS mihomoProfile overrides when disabled', async function () {
        state[FILES_KEY] = [
            {
                name: 'js-file',
                type: 'mihomoProfile',
                sourceType: 'subscription',
                sourceName: 'demo-sub',
                includeUnsupportedProxy: false,
                process: [
                    {
                        type: 'Script Operator',
                        args: {
                            mode: 'script',
                            content:
                                'async function main(config) { config["mixed-port"] = 7891; return config; }',
                        },
                    },
                ],
            },
        ];

        const res = await requestFile('js-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7891');
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.not.include('name: Unsupported');
    });

    it('query includeUnsupportedProxy overrides stored false for mihomoProfile files', async function () {
        state[FILES_KEY] = [
            {
                name: 'query-true-file',
                type: 'mihomoProfile',
                sourceType: 'subscription',
                sourceName: 'demo-sub',
                includeUnsupportedProxy: false,
                process: [
                    {
                        type: 'Script Operator',
                        args: {
                            mode: 'script',
                            content: 'mixed-port: 7892',
                        },
                    },
                ],
            },
        ];

        const res = await requestFile('query-true-file', {
            includeUnsupportedProxy: 'true',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7892');
        expect(res.sent).to.include('name: Unsupported');
    });

    it('adds subscription proxies to mihomoProfile files without moving an existing proxies key', async function () {
        state[FILES_KEY] = [
            {
                name: 'add-proxies-file',
                type: 'mihomoProfile',
                sourceType: 'none',
                process: [
                    {
                        type: 'Script Operator',
                        args: {
                            mode: 'script',
                            content:
                                'mixed-port: 7890\n' +
                                'proxies:\n' +
                                '  note: not-array\n' +
                                'proxy-groups:\n' +
                                '  - name: Auto\n' +
                                '    type: select\n' +
                                '    proxies: [Supported]',
                        },
                    },
                    {
                        type: 'Add Proxies From Subscription Operator',
                        args: {
                            sourceType: 'subscription',
                            sourceName: 'demo-sub',
                            includeUnsupportedProxy: false,
                            position: 'back',
                        },
                    },
                ],
            },
        ];

        const res = await requestFile('add-proxies-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent.indexOf('mixed-port:')).to.be.lessThan(
            res.sent.indexOf('proxies:'),
        );
        expect(res.sent.indexOf('proxies:')).to.be.lessThan(
            res.sent.indexOf('proxy-groups:'),
        );
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.not.include('name: Unsupported');
    });

    it('can insert subscription proxies before existing mihomoProfile proxies', async function () {
        state[FILES_KEY] = [
            {
                name: 'insert-proxies-file',
                type: 'mihomoProfile',
                sourceType: 'none',
                process: [
                    {
                        type: 'Script Operator',
                        args: {
                            mode: 'script',
                            content:
                                'proxies:\n' +
                                '  - name: Existing\n' +
                                '    type: direct',
                        },
                    },
                    {
                        type: 'Add Proxies From Subscription Operator',
                        args: {
                            sourceType: 'subscription',
                            sourceName: 'demo-sub',
                            includeUnsupportedProxy: false,
                            position: 'front',
                        },
                    },
                ],
            },
        ];

        const res = await requestFile('insert-proxies-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent.indexOf('name: Supported')).to.be.lessThan(
            res.sent.indexOf('name: Existing'),
        );
    });
});
