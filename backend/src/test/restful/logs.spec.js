import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { LOGS_KEY, SETTINGS_KEY } from '@/constants';

let $;
let appendLogEntry;
let getLogEntries;
let clearLogEntries;
let clearLogSettingsCache;
let registerLogRoutes;
let registerSettingsRoutes;
let originalRead;
let originalWrite;
let state;

const SUB_STORE_BANNER = `
${'\u2505'.repeat(44)}
     Sub-Store -- v2.22.6
${'\u2505'.repeat(44)}
`;
const SUB_STORE_PLATFORM_BANNER = `
${'\u2505'.repeat(44)}
     Sub-Store -- v2.22.6
     Loon -- Loon(842)
${'\u2505'.repeat(44)}
`;
const DEFAULT_IGNORED_NOISE_LOGS = [
    '[sub-store] INFO: Surge AnyTLS Parser is activated',
    '[sub-store] ERROR: Fallback Base64 Pre-processor error: decoded line does not start with protocol',
];
const DEFAULT_VISIBLE_PREPROCESSOR_LOGS = [
    '[sub-store] INFO: Pre-processor [Fallback Base64 Pre-processor] activated',
    '[sub-store] INFO: Pre-processor [Clash Pre-processor] activated',
];

function createRouteApp() {
    const handlers = new Map();
    const methods = ['get', 'delete', 'patch'];

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

function getHandler(method, pattern) {
    const app = createRouteApp();
    registerLogRoutes(app);
    return app.handlers.get(`${method} ${pattern}`);
}

function createResponse(routePath) {
    return {
        body: null,
        req: {
            route: {
                path: routePath,
            },
        },
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

describe('logs routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({
            appendLogEntry,
            getLogEntries,
            clearLogEntries,
            clearLogSettingsCache,
        } = require('@/utils/debug-logs'));
        ({ default: registerLogRoutes } = require('@/restful/logs'));
        ({ default: registerSettingsRoutes } = require('@/restful/settings'));

        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
    });

    after(function () {
        if ($) {
            $.read = originalRead;
            $.write = originalWrite;
        }
    });

    beforeEach(function () {
        state = {
            [SETTINGS_KEY]: { logsMaxCount: 500 },
            [LOGS_KEY]: '[]',
        };

        $.read = (key) => state[key];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        clearLogSettingsCache();
    });

    it('persists log entries and trims by logsMaxCount', function () {
        state[SETTINGS_KEY] = { logsMaxCount: 2 };

        appendLogEntry($, 'info', ['first']);
        appendLogEntry($, 'warn', ['second']);
        appendLogEntry($, 'error', ['third']);

        const storedLogs = JSON.parse(state[LOGS_KEY]);
        expect(storedLogs).to.have.length(2);
        expect(storedLogs[0].message).to.equal('[unknown] WARN: second');
        expect(storedLogs[1].message).to.equal('[unknown] ERROR: third');
    });

    it('disables persistent log cache IO when logsMaxCount is zero', function () {
        state[SETTINGS_KEY] = { logsMaxCount: 0 };
        state[LOGS_KEY] = JSON.stringify([
            {
                id: 'existing-log',
                time: 1,
                level: 'info',
                message: '[unknown] INFO: existing',
            },
        ]);
        const readKeys = [];
        const writeKeys = [];
        $.read = (key) => {
            readKeys.push(key);
            return state[key];
        };
        $.write = (data, key) => {
            writeKeys.push(key);
            state[key] = data;
            return true;
        };

        appendLogEntry($, 'info', ['disabled write']);

        expect(readKeys).to.deep.equal([SETTINGS_KEY]);
        expect(writeKeys).to.deep.equal([]);
        expect(
            JSON.parse(state[LOGS_KEY]).map((log) => log.message),
        ).to.deep.equal(['[unknown] INFO: existing']);

        readKeys.length = 0;
        const result = getLogEntries($, { limit: 10 });

        expect(result).to.deep.equal({
            logs: [],
            total: 0,
            maxCount: 0,
        });
        expect(readKeys).to.deep.equal([SETTINGS_KEY]);
        expect(writeKeys).to.deep.equal([]);
    });

    it('disables persistent log cache IO by default', function () {
        state[SETTINGS_KEY] = {};
        appendLogEntry($, 'info', ['default disabled write']);

        expect(JSON.parse(state[LOGS_KEY])).to.deep.equal([]);
        expect(getLogEntries($, { limit: 10 })).to.deep.equal({
            logs: [],
            total: 0,
            maxCount: 0,
        });
    });

    it('preserves explicit zero logsMaxCount in settings', async function () {
        const app = createRouteApp();
        registerSettingsRoutes(app);
        const patchHandler = app.handlers.get('PATCH /api/settings');

        const zeroRes = createResponse('/api/settings');
        await patchHandler({ body: { logsMaxCount: '0' } }, zeroRes);

        expect(zeroRes.body.status).to.equal('success');
        expect(state[SETTINGS_KEY]).to.deep.include({
            logsMaxCount: '0',
        });

        const emptyRes = createResponse('/api/settings');
        await patchHandler({ body: { logsMaxCount: '' } }, emptyRes);

        expect(emptyRes.body.status).to.equal('success');
        expect(state[SETTINGS_KEY]).to.not.have.property('logsMaxCount');
    });

    it('normalizes stored log messages with missing scope or level', function () {
        appendLogEntry($, 'log', [
            '[测试] 有 scope 无 level 的日志: 🇺🇸 Oracle [snell]',
        ]);
        appendLogEntry($, 'warn', [
            '测试无 scope 无 level 的日志: 🇺🇸 Oracle [snell]',
        ]);
        appendLogEntry($, 'error', [
            '[测试] ERROR: 已经完整的日志: 🇺🇸 Oracle [snell]',
        ]);

        expect(
            JSON.parse(state[LOGS_KEY]).map((log) => log.message),
        ).to.deep.equal([
            '[测试] LOG: 有 scope 无 level 的日志: 🇺🇸 Oracle [snell]',
            '[unknown] WARN: 测试无 scope 无 level 的日志: 🇺🇸 Oracle [snell]',
            '[测试] ERROR: 已经完整的日志: 🇺🇸 Oracle [snell]',
        ]);
    });

    it('skips Sub-Store startup banner logs when appending', function () {
        appendLogEntry($, 'log', [SUB_STORE_BANNER]);
        appendLogEntry($, 'log', [SUB_STORE_PLATFORM_BANNER]);

        expect(JSON.parse(state[LOGS_KEY])).to.deep.equal([]);
    });

    it('skips default noisy parser and fallback preprocessor error logs when appending', function () {
        DEFAULT_IGNORED_NOISE_LOGS.forEach((message) => {
            appendLogEntry($, 'info', [message]);
        });
        appendLogEntry($, 'info', ['normal message']);

        expect(
            JSON.parse(state[LOGS_KEY]).map((log) => log.message),
        ).to.deep.equal(['[unknown] INFO: normal message']);
    });

    it('filters previously persisted Sub-Store startup banner logs', function () {
        const normalLog = {
            id: 'normal-log',
            time: 2,
            level: 'info',
            message: 'normal message',
        };
        state[LOGS_KEY] = JSON.stringify([
            {
                id: 'banner-log',
                time: 1,
                level: 'log',
                message: SUB_STORE_BANNER,
            },
            {
                id: 'platform-banner-log',
                time: 2,
                level: 'log',
                message: `[sub-store] LOG: ${SUB_STORE_PLATFORM_BANNER}`,
            },
            {
                id: 'unknown-platform-banner-log',
                time: 3,
                level: 'log',
                message: `[unknown] LOG: ${SUB_STORE_PLATFORM_BANNER}`,
            },
            normalLog,
        ]);

        const result = getLogEntries($, { limit: 10 });

        expect(result.logs.map((log) => log.message)).to.deep.equal([
            'normal message',
        ]);
        expect(result.total).to.equal(1);
        expect(
            JSON.parse(state[LOGS_KEY]).map((log) => log.message),
        ).to.deep.equal(['normal message']);
    });

    it('filters previously persisted default noisy parser and fallback preprocessor error logs', function () {
        state[LOGS_KEY] = JSON.stringify([
            ...DEFAULT_IGNORED_NOISE_LOGS.map((message, index) => ({
                id: `noise-log-${index}`,
                time: index + 1,
                level: 'info',
                message,
            })),
            {
                id: 'normal-log',
                time: 4,
                level: 'info',
                message: 'normal message',
            },
        ]);

        const result = getLogEntries($, { limit: 10 });

        expect(result.logs.map((log) => log.message)).to.deep.equal([
            'normal message',
        ]);
        expect(result.total).to.equal(1);
        expect(
            JSON.parse(state[LOGS_KEY]).map((log) => log.message),
        ).to.deep.equal(['normal message']);
    });

    it('returns recent logs by limit', function () {
        appendLogEntry($, 'info', ['one']);
        appendLogEntry($, 'info', ['two']);
        appendLogEntry($, 'info', ['three']);

        const result = getLogEntries($, { limit: 2 });

        expect(result.logs.map((log) => log.message)).to.deep.equal([
            '[unknown] INFO: three',
            '[unknown] INFO: two',
        ]);
        expect(result.total).to.equal(3);
    });

    it('trims persisted logs when logsMaxCount is reduced', function () {
        appendLogEntry($, 'info', ['one']);
        appendLogEntry($, 'info', ['two']);
        appendLogEntry($, 'info', ['three']);

        state[SETTINGS_KEY] = { logsMaxCount: 2 };
        const result = getLogEntries($, { limit: 10 });

        expect(result.logs.map((log) => log.message)).to.deep.equal([
            '[unknown] INFO: three',
            '[unknown] INFO: two',
        ]);
        expect(
            JSON.parse(state[LOGS_KEY]).map((log) => log.message),
        ).to.deep.equal(['[unknown] INFO: two', '[unknown] INFO: three']);
    });

    it('filters logs by keyword', function () {
        appendLogEntry($, 'info', ['Alpha message']);
        appendLogEntry($, 'error', ['beta message']);

        const result = getLogEntries($, { keyword: 'Alpha' });

        expect(result.logs).to.have.length(1);
        expect(result.logs[0].message).to.equal(
            '[unknown] INFO: Alpha message',
        );
    });

    it('supports case-insensitive keyword filtering', function () {
        appendLogEntry($, 'info', ['Alpha message']);
        appendLogEntry($, 'error', ['beta message']);

        const result = getLogEntries($, {
            keyword: 'alpha',
            ignoreCase: 'true',
        });

        expect(result.logs).to.have.length(1);
        expect(result.logs[0].message).to.equal(
            '[unknown] INFO: Alpha message',
        );
    });

    it('supports regular expression keyword filtering', function () {
        appendLogEntry($, 'info', ['request GET /api/logs']);
        appendLogEntry($, 'warn', ['request POST /api/subs']);

        const result = getLogEntries($, {
            keyword: 'GET\\s+/api/logs',
            regex: 'true',
        });

        expect(result.logs).to.have.length(1);
        expect(result.logs[0].message).to.equal(
            '[unknown] INFO: request GET /api/logs',
        );
    });

    it('rejects invalid regular expressions from GET /api/logs', function () {
        const getHandler_ = getHandler('GET', '/api/logs');
        const getRes = createResponse('/api/logs');
        getHandler_(
            {
                query: {
                    keyword: '[',
                    regex: 'true',
                },
            },
            getRes,
        );

        expect(getRes.statusCode).to.equal(400);
        expect(getRes.body.status).to.equal('failed');
        expect(getRes.body.error.code).to.equal('INVALID_LOG_KEYWORD_REGEX');
    });

    it('serves logs from GET /api/logs and clears them with DELETE /api/logs', function () {
        appendLogEntry($, 'info', ['route log']);

        const getHandler_ = getHandler('GET', '/api/logs');
        const getRes = createResponse('/api/logs');
        getHandler_({ query: { limit: 10 } }, getRes);

        expect(getRes.body.status).to.equal('success');
        expect(getRes.body.data.logs).to.have.length(1);
        expect(getRes.body.data.logs[0].message).to.equal(
            '[unknown] INFO: route log',
        );

        const deleteHandler = getHandler('DELETE', '/api/logs');
        const deleteRes = createResponse('/api/logs');
        deleteHandler({ query: {} }, deleteRes);

        expect(deleteRes.body.status).to.equal('success');
        expect(JSON.parse(state[LOGS_KEY])).to.deep.equal([]);
        expect(clearLogEntries).to.be.a('function');
    });

    it('rejects negative logsMaxCount in settings PATCH', async function () {
        const app = createRouteApp();
        registerSettingsRoutes(app);
        const patchHandler = app.handlers.get('PATCH /api/settings');

        const res = createResponse('/api/settings');
        await patchHandler({ body: { logsMaxCount: -1 } }, res);

        expect(res.body.status).to.equal('success');
        expect(state[SETTINGS_KEY]).to.not.have.property('logsMaxCount');
    });

    it('rejects NaN logsMaxCount in settings PATCH', async function () {
        const app = createRouteApp();
        registerSettingsRoutes(app);
        const patchHandler = app.handlers.get('PATCH /api/settings');

        const res = createResponse('/api/settings');
        await patchHandler({ body: { logsMaxCount: 'abc' } }, res);

        expect(res.body.status).to.equal('success');
        expect(state[SETTINGS_KEY]).to.not.have.property('logsMaxCount');
    });

    it('rejects null logsMaxCount in settings PATCH', async function () {
        const app = createRouteApp();
        registerSettingsRoutes(app);
        const patchHandler = app.handlers.get('PATCH /api/settings');

        const res = createResponse('/api/settings');
        await patchHandler({ body: { logsMaxCount: null } }, res);

        expect(res.body.status).to.equal('success');
        expect(state[SETTINGS_KEY]).to.not.have.property('logsMaxCount');
    });

    it('accepts valid positive integer logsMaxCount in settings PATCH', async function () {
        const app = createRouteApp();
        registerSettingsRoutes(app);
        const patchHandler = app.handlers.get('PATCH /api/settings');

        const res = createResponse('/api/settings');
        await patchHandler({ body: { logsMaxCount: 300 } }, res);

        expect(res.body.status).to.equal('success');
        expect(state[SETTINGS_KEY]).to.deep.include({ logsMaxCount: 300 });
    });

    it('clears log settings cache after settings PATCH so new logsMaxCount takes effect immediately', async function () {
        const app = createRouteApp();
        registerSettingsRoutes(app);
        const patchHandler = app.handlers.get('PATCH /api/settings');

        state[SETTINGS_KEY] = { logsMaxCount: 500 };
        appendLogEntry($, 'info', ['before change']);
        appendLogEntry($, 'info', ['before change 2']);
        appendLogEntry($, 'info', ['before change 3']);

        await patchHandler({ body: { logsMaxCount: 1 } }, createResponse('/api/settings'));

        appendLogEntry($, 'info', ['after change']);

        const storedLogs = JSON.parse(state[LOGS_KEY]);
        expect(storedLogs).to.have.length(1);
        expect(storedLogs[0].message).to.equal('[unknown] INFO: after change');
    });

});
