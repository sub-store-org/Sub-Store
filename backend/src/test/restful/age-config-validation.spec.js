import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    FILES_KEY,
    SUBS_KEY,
    TOKENS_KEY,
} from '@/constants';

let $;
let createArtifactItem;
let createCollectionItem;
let createFileItem;
let createSubscriptionItem;
let createTokenItem;
let registerArtifactRoutes;
let registerCollectionRoutes;
let registerFileRoutes;
let registerSubscriptionRoutes;
let originalRead;
let originalWrite;
let originalInfo;
let originalError;
let originalWarn;
let originalNotify;
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

function createResponse(routePath) {
    return {
        payload: null,
        req: {
            route: {
                path: routePath,
            },
        },
        statusCode: 200,
        json(data) {
            this.payload = data;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
    };
}

async function requestReplace(registerRoutes, path, body) {
    const app = createRouteApp();
    registerRoutes(app);
    const handler = app.handlers.get(`PUT ${path}`);
    const res = createResponse(path);

    await handler({ body }, res);
    return res;
}

describe('age config validation', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({ default: registerSubscriptionRoutes } = require('@/restful/subscriptions'));
        ({ default: registerCollectionRoutes } = require('@/restful/collections'));
        ({ default: registerFileRoutes } = require('@/restful/file'));
        ({ default: registerArtifactRoutes } = require('@/restful/artifacts'));
        ({ createSubscriptionItem } = require('@/restful/subscriptions'));
        ({ createCollectionItem } = require('@/restful/collections'));
        ({ createFileItem } = require('@/restful/file'));
        ({ createArtifactItem } = require('@/restful/artifacts'));
        ({ createTokenItem } = require('@/restful/token'));

        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
        originalInfo = $.info.bind($);
        originalError = $.error.bind($);
        originalWarn = $.warn.bind($);
        originalNotify = $.notify.bind($);
    });

    after(function () {
        if ($) {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            $.error = originalError;
            $.warn = originalWarn;
            $.notify = originalNotify;
        }
    });

    beforeEach(function () {
        state = {
            [SUBS_KEY]: [{ name: 'shared-sub' }],
            [COLLECTIONS_KEY]: [{ name: 'shared-col', subscriptions: [] }],
            [FILES_KEY]: [{ name: 'shared-file' }],
            [ARTIFACTS_KEY]: [{ name: 'shared-artifact', type: 'file' }],
            [TOKENS_KEY]: [],
        };

        $.read = (key) => state[key] || [];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = () => {};
        $.error = () => {};
        $.warn = () => {};
        $.notify = () => {};
    });

    it('rejects invalid age-public-key in create helpers', function () {
        const operations = [
            () =>
                createSubscriptionItem({
                    name: 'new-sub',
                    'age-public-key': 'invalid-public-key',
                }),
            () =>
                createCollectionItem({
                    name: 'new-col',
                    subscriptions: [],
                    'age-public-key': 'invalid-public-key',
                }),
            () =>
                createFileItem({
                    name: 'new-file',
                    source: 'local',
                    content: 'demo',
                    'age-public-key': 'invalid-public-key',
                }),
            () =>
                createArtifactItem({
                    name: 'new-artifact',
                    type: 'file',
                    source: 'new-file',
                    'age-public-key': 'invalid-public-key',
                }),
            () =>
                createTokenItem(
                    {
                        type: 'sub',
                        name: 'shared-sub',
                        token: 'token-with-bad-key',
                        'age-public-key': 'invalid-public-key',
                    },
                    {
                        mode: 'duration',
                        expiresIn: '1d',
                    },
                ),
        ];

        for (const operation of operations) {
            let capturedError;

            try {
                operation();
            } catch (error) {
                capturedError = error;
            }

            expect(capturedError).to.include({
                type: 'RequestInvalidError',
                code: 'INVALID_AGE_PUBLIC_KEY',
            });
            expect(capturedError.message).to.contain('age-public-key 仅支持');
        }
    });

    it('rejects invalid age-public-key in bulk replace routes', async function () {
        const expectations = [
            {
                registerRoutes: registerSubscriptionRoutes,
                path: '/api/subs',
                body: [{ name: 'shared-sub', 'age-public-key': 'bad-key' }],
                storeKey: SUBS_KEY,
            },
            {
                registerRoutes: registerCollectionRoutes,
                path: '/api/collections',
                body: [
                    {
                        name: 'shared-col',
                        subscriptions: [],
                        'age-public-key': 'bad-key',
                    },
                ],
                storeKey: COLLECTIONS_KEY,
            },
            {
                registerRoutes: registerFileRoutes,
                path: '/api/files',
                body: [
                    {
                        name: 'shared-file',
                        source: 'local',
                        content: 'demo',
                        'age-public-key': 'bad-key',
                    },
                ],
                storeKey: FILES_KEY,
            },
            {
                registerRoutes: registerArtifactRoutes,
                path: '/api/artifacts',
                body: [
                    {
                        name: 'shared-artifact',
                        type: 'file',
                        source: 'shared-file',
                        'age-public-key': 'bad-key',
                    },
                ],
                storeKey: ARTIFACTS_KEY,
            },
        ];

        for (const expectation of expectations) {
            const previousState = JSON.parse(
                JSON.stringify(state[expectation.storeKey]),
            );
            const res = await requestReplace(
                expectation.registerRoutes,
                expectation.path,
                expectation.body,
            );

            expect(res.statusCode).to.equal(500);
            expect(res.payload.status).to.equal('failed');
            expect(res.payload.error).to.include({
                code: 'INVALID_AGE_PUBLIC_KEY',
                type: 'RequestInvalidError',
            });
            expect(state[expectation.storeKey]).to.deep.equal(previousState);
        }
    });
});
