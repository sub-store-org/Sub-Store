import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { FILES_KEY, SUBS_KEY } from '@/constants';

let $;
let registerFileRoutes;
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

describe('mihomo profile file routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({ default: registerFileRoutes } = require('@/restful/file'));

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
});
