import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { FILES_KEY } from '@/constants';

let $;
let registerFileRoutes;
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
        getHeaders() {
            return this.headers;
        },
        send(payload) {
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

async function requestFile(query = {}) {
    const handler = getHandler('/api/file/:name');
    const res = createResponse('/api/file/:name');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: { name: 'local-file' },
            path: '/api/file/local-file',
            query,
            url: '/api/file/local-file',
        },
        res,
    );

    return res;
}

async function requestShareFile({ query = {}, shareToken } = {}) {
    const handler = getHandler('/share/file/:name');
    const res = createResponse('/share/file/:name');

    await handler(
        {
            body: {},
            headers: {},
            method: 'GET',
            params: { name: 'local-file' },
            path: '/share/file/local-file',
            query,
            subStoreShareToken: shareToken,
            url: '/share/file/local-file',
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

describe('file routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({ default: registerFileRoutes } = require('@/restful/file'));
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
            [FILES_KEY]: [
                {
                    name: 'local-file',
                    source: 'local',
                    content: 'base',
                    process: [],
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

    it('passes Script Operator $options changes to response transformers', async function () {
        state[FILES_KEY][0].process = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content:
                        "$options.fromOperator = 'carried'\n$content = `${$content}-script`",
                },
            },
            {
                type: 'Response Transformer',
                args: {
                    mode: 'script',
                    content:
                        "$res.header['x-from-options'] = $options.fromOperator\n$res.body = `${$res.body}-${$options.fromOperator}`",
                },
            },
        ];

        const res = await requestFile();

        expect(res.headers['x-from-options']).to.equal('carried');
        expect(res.sent).to.equal('base-script-carried');
    });

    it('encrypts transformed file output with file age-public-key', async function () {
        const pair = await ageUtils.generateKeyPair();
        state[FILES_KEY][0]['age-public-key'] = pair['age-public-key'];
        state[FILES_KEY][0].process = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content:
                        "$options.fromOperator = 'carried'\n$content = `${$content}-script`",
                },
            },
            {
                type: 'Response Transformer',
                args: {
                    mode: 'script',
                    content:
                        "$res.header['x-from-options'] = $options.fromOperator\n$res.body = `${$res.body}-${$options.fromOperator}`",
                },
            },
        ];

        const res = await requestFile();
        const decrypted = await ageUtils.decryptArmorIfPresent(
            res.sent,
            pair['age-secret-key'],
        );

        expect(res.headers['x-from-options']).to.equal('carried');
        expect(res.headers['Content-Type']).to.equal(
            'text/plain; charset=utf-8',
        );
        expect(res.sent).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('base-script-carried');
    });

    it('uses share age-public-key before source file key', async function () {
        const sourcePair = await ageUtils.generateKeyPair();
        const sharePair = await ageUtils.generateKeyPair();
        state[FILES_KEY][0]['age-public-key'] = sourcePair['age-public-key'];

        const res = await requestShareFile({
            shareToken: {
                type: 'file',
                name: 'local-file',
                'age-public-key': sharePair['age-public-key'],
            },
        });
        const decrypted = await ageUtils.decryptArmorIfPresent(
            res.sent,
            sharePair['age-secret-key'],
        );

        expect(res.sent).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('base');
        await expectDecryptFailure(res.sent, sourcePair['age-secret-key']);
    });
});
