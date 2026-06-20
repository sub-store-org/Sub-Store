import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';

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
let remoteFilePath;
let state;

function cleanupRemoteFile() {
    if (remoteFilePath && fs.existsSync(remoteFilePath)) {
        fs.unlinkSync(remoteFilePath);
    }
    remoteFilePath = null;
}

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

async function requestWholeFiles() {
    const handler = getHandler('/api/wholeFiles');
    const res = createResponse('/api/wholeFiles');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: {},
            path: '/api/wholeFiles',
            query: {},
            socket: {},
            url: '/api/wholeFiles',
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

describe('mihomo config file routes', function () {
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
        cleanupRemoteFile();
    });

    afterEach(function () {
        cleanupRemoteFile();
    });

    beforeEach(function () {
        remoteFilePath = path.join(
            os.tmpdir(),
            `sub-store-mihomo-config-${Date.now()}.yaml`,
        );
        fs.writeFileSync(
            remoteFilePath,
            'mixed-port: 7890\n' +
                'proxies:\n' +
                '  - {name: Remote Supported, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret}',
            'utf8',
        );
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

    it('keeps legacy mihomoProfile file type unchanged when reading files', async function () {
        state[FILES_KEY] = [
            {
                name: 'legacy-file',
                type: 'mihomoProfile',
                sourceType: 'subscription',
                sourceName: 'demo-sub',
                includeUnsupportedProxy: false,
                process: [],
            },
        ];

        const res = await requestWholeFiles();

        expect(res.statusCode).to.equal(200);
        expect(res.sent.data[0].type).to.equal('mihomoProfile');
        expect(state[FILES_KEY][0].type).to.equal('mihomoProfile');
    });

    it('builds legacy mihomoProfile files without rewriting stored type', async function () {
        state[FILES_KEY] = [
            {
                name: 'legacy-runtime-file',
                type: 'mihomoProfile',
                sourceType: 'subscription',
                sourceName: 'demo-sub',
                includeUnsupportedProxy: false,
                process: [],
            },
        ];

        const res = await requestFile('legacy-runtime-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('proxies:');
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.not.include('name: Unsupported');
        expect(state[FILES_KEY][0].type).to.equal('mihomoProfile');
    });

    it('builds mihomoConfig proxies before file processors run', async function () {
        state[FILES_KEY] = [
            {
                name: 'base-file',
                type: 'mihomoConfig',
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

    it('previews mihomoConfig proxies before file processors run', async function () {
        const res = await previewFile({
            name: 'preview-file',
            type: 'mihomoConfig',
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

    it('keeps unsupported proxies for YAML mihomoConfig overrides when enabled', async function () {
        state[FILES_KEY] = [
            {
                name: 'yaml-file',
                type: 'mihomoConfig',
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

    it('filters unsupported proxies for JS mihomoConfig overrides when disabled', async function () {
        state[FILES_KEY] = [
            {
                name: 'js-file',
                type: 'mihomoConfig',
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

    it('query includeUnsupportedProxy presence enables unsupported proxies for mihomoConfig files', async function () {
        state[FILES_KEY] = [
            {
                name: 'query-true-file',
                type: 'mihomoConfig',
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
            includeUnsupportedProxy: 'false',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7892');
        expect(res.sent).to.include('name: Unsupported');
    });

    it('query mihomoConfig fields override the stored file source when downloading', async function () {
        state[FILES_KEY] = [
            {
                name: 'override-file',
                type: 'mihomoConfig',
                sourceType: 'subscription',
                sourceName: 'demo-sub',
                includeUnsupportedProxy: false,
                process: [],
            },
        ];

        const res = await requestFile('override-file', {
            sourceType: 'local',
            mode: 'proxy',
            content:
                'mixed-port: 7890\n' +
                'proxies:\n' +
                '  - {name: Query Supported, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret}\n' +
                '  - {name: Query Unsupported, type: naive, server: naive.example.com, port: 443, username: user, password: pass, sni: naive.example.com}',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.not.include('mixed-port: 7890');
        expect(res.sent).to.include('name: Query Supported');
        expect(res.sent).to.not.include('name: Query Unsupported');
        expect(res.sent).to.not.include('name: Supported');
    });

    it('fakeFile can parse provided local content as mihomoConfig proxies', async function () {
        state[FILES_KEY] = [];

        const res = await requestFile('missing-file', {
            fakeFile: '1',
            type: 'mihomoConfig',
            sourceType: 'local',
            mode: 'proxy',
            content:
                'mixed-port: 7890\n' +
                'proxies:\n' +
                '  - {name: Fake Supported, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret}\n' +
                '  - {name: Fake Unsupported, type: naive, server: naive.example.com, port: 443, username: user, password: pass, sni: naive.example.com}',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.not.include('mixed-port: 7890');
        expect(res.sent).to.include('name: Fake Supported');
        expect(res.sent).to.not.include('name: Fake Unsupported');
    });

    it('fakeFile can build a mihomoConfig from a subscription source', async function () {
        state[FILES_KEY] = [];

        const res = await requestFile('missing-file', {
            fakeFile: '1',
            type: 'mihomoConfig',
            sourceType: 'subscription',
            sourceName: 'demo-sub',
        });

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.not.include('name: Unsupported');
    });

    it('uses local mihomoConfig source content as a full mihomo config by default', async function () {
        state[FILES_KEY] = [
            {
                name: 'local-config-file',
                type: 'mihomoConfig',
                sourceType: 'local',
                content:
                    'mixed-port: 7890\n' +
                    'proxies:\n' +
                    '  - {name: Supported, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret}\n' +
                    '  - {name: Unsupported, type: naive, server: naive.example.com, port: 443, username: user, password: pass, sni: naive.example.com}',
                process: [],
            },
        ];

        const res = await requestFile('local-config-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7890');
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.include('name: Unsupported');
    });

    it('uses remote mihomoConfig source url instead of stale content by default', async function () {
        state[FILES_KEY] = [
            {
                name: 'remote-config-file',
                type: 'mihomoConfig',
                sourceType: 'remote',
                url: remoteFilePath,
                content:
                    'mixed-port: 7891\n' +
                    'proxies:\n' +
                    '  - {name: Stale Local, type: ss, server: stale.example.com, port: 8388, cipher: aes-128-gcm, password: secret}',
                process: [],
            },
        ];

        const res = await requestFile('remote-config-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7890');
        expect(res.sent).to.include('name: Remote Supported');
        expect(res.sent).to.not.include('mixed-port: 7891');
        expect(res.sent).to.not.include('name: Stale Local');
    });

    it('uses local mihomoConfig source content instead of url by default', async function () {
        state[FILES_KEY] = [
            {
                name: 'local-config-with-url-file',
                type: 'mihomoConfig',
                sourceType: 'local',
                url: remoteFilePath,
                content:
                    'mixed-port: 7892\n' +
                    'proxies:\n' +
                    '  - {name: Local Supported, type: ss, server: local.example.com, port: 8388, cipher: aes-128-gcm, password: secret}',
                process: [],
            },
        ];

        const res = await requestFile('local-config-with-url-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7892');
        expect(res.sent).to.include('name: Local Supported');
        expect(res.sent).to.not.include('mixed-port: 7890');
        expect(res.sent).to.not.include('name: Remote Supported');
    });

    it('merges local and remote mihomoConfig file sources when requested', async function () {
        state[FILES_KEY] = [
            {
                name: 'merged-local-config-file',
                type: 'mihomoConfig',
                sourceType: 'local',
                mergeSources: 'localFirst',
                url: remoteFilePath,
                content:
                    'mixed-port: 7892\n' +
                    'proxies:\n' +
                    '  - {name: Local Supported, type: ss, server: local.example.com, port: 8388, cipher: aes-128-gcm, password: secret}',
                process: [],
            },
        ];

        const res = await requestFile('merged-local-config-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('mixed-port: 7892');
        expect(res.sent).to.include('name: Local Supported');
        expect(res.sent).to.include('mixed-port: 7890');
        expect(res.sent).to.include('name: Remote Supported');
        expect(res.sent.indexOf('mixed-port: 7892')).to.be.lessThan(
            res.sent.indexOf('mixed-port: 7890'),
        );
    });

    it('parses local mihomoConfig source content as proxies when selected', async function () {
        state[FILES_KEY] = [
            {
                name: 'local-proxy-file',
                type: 'mihomoConfig',
                sourceType: 'local',
                mode: 'proxy',
                includeUnsupportedProxy: false,
                content:
                    'mixed-port: 7890\n' +
                    'proxies:\n' +
                    '  - {name: Supported, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret}\n' +
                    '  - {name: Unsupported, type: naive, server: naive.example.com, port: 443, username: user, password: pass, sni: naive.example.com}',
                process: [],
            },
        ];

        const res = await requestFile('local-proxy-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.not.include('mixed-port: 7890');
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.not.include('name: Unsupported');
    });

    it('keeps unsupported proxies when parsing local mihomoConfig source content as proxies with the option enabled', async function () {
        state[FILES_KEY] = [
            {
                name: 'local-proxy-unsupported-file',
                type: 'mihomoConfig',
                sourceType: 'local',
                mode: 'proxy',
                includeUnsupportedProxy: true,
                content:
                    'mixed-port: 7890\n' +
                    'proxies:\n' +
                    '  - {name: Supported, type: ss, server: ss.example.com, port: 8388, cipher: aes-128-gcm, password: secret}\n' +
                    '  - {name: Unsupported, type: naive, server: naive.example.com, port: 443, username: user, password: pass, sni: naive.example.com}',
                process: [],
            },
        ];

        const res = await requestFile('local-proxy-unsupported-file');

        expect(res.statusCode).to.equal(200);
        expect(res.sent).to.include('name: Supported');
        expect(res.sent).to.include('name: Unsupported');
    });

    it('adds subscription proxies to mihomoConfig files without moving an existing proxies key', async function () {
        state[FILES_KEY] = [
            {
                name: 'add-proxies-file',
                type: 'mihomoConfig',
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

    it('can insert subscription proxies before existing mihomoConfig proxies', async function () {
        state[FILES_KEY] = [
            {
                name: 'insert-proxies-file',
                type: 'mihomoConfig',
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
