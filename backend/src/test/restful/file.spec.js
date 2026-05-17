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

describe('file routes', function () {
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
});
