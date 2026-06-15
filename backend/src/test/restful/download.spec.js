import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { COLLECTIONS_KEY, SUBS_KEY } from '@/constants';

const UUID = '11111111-1111-4111-8111-111111111111';
const VLESS_WS = `vless://${UUID}@1.1.1.1:443?security=tls&type=ws&host=cdn.example.com&path=%2Fws&sni=sni.example.com#VLESS%20WS`;

let $;
let registerDownloadRoutes;
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
    };
}

function getHandler(pattern) {
    const app = createRouteApp();
    registerDownloadRoutes(app);
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
        ({ default: registerDownloadRoutes } = require('@/restful/download'));
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
