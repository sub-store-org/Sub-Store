import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    FILES_KEY,
    SETTINGS_KEY,
    SUBS_KEY,
    TOKENS_KEY,
} from '@/constants';
import { insertByPosition } from '@/utils/database';
import { getCreateItemPosition } from '@/utils/create-item-position';

let $;
let registerSubscriptionRoutes;
let registerCollectionRoutes;
let registerFileRoutes;
let registerArtifactRoutes;
let registerTokenRoutes;
let originalRead;
let originalWrite;
let originalInfo;
let originalError;
let state;
let tempDir;
let previousDataBasePath;

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

function getHandler(register, method, pattern) {
    const app = createRouteApp();
    register(app);
    return app.handlers.get(`${method} ${pattern}`);
}

function createResponse(routePath) {
    return {
        statusCode: 200,
        body: null,
        req: {
            route: {
                path: routePath,
            },
        },
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

describe('create position behavior', function () {
    before(async function () {
        previousDataBasePath = process.env.SUB_STORE_DATA_BASE_PATH;
        tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'sub-store-create-position-'),
        );
        process.env.SUB_STORE_DATA_BASE_PATH = tempDir;

        ({ default: $ } = require('@/core/app'));
        ({ default: registerSubscriptionRoutes } = require(
            '@/restful/subscriptions'
        ));
        ({ default: registerCollectionRoutes } = require('@/restful/collections'));
        ({ default: registerFileRoutes } = require('@/restful/file'));
        ({ default: registerArtifactRoutes } = require('@/restful/artifacts'));
        ({ default: registerTokenRoutes } = require('@/restful/token'));

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

        if (previousDataBasePath == null) {
            delete process.env.SUB_STORE_DATA_BASE_PATH;
        } else {
            process.env.SUB_STORE_DATA_BASE_PATH = previousDataBasePath;
        }

        if (tempDir) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    beforeEach(function () {
        state = {
            [SUBS_KEY]: [],
            [COLLECTIONS_KEY]: [],
            [FILES_KEY]: [],
            [ARTIFACTS_KEY]: [],
            [TOKENS_KEY]: [],
            [SETTINGS_KEY]: {},
        };

        $.read = (key) => state[key];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = () => {};
        $.error = () => {};
    });

    describe('insertByPosition', function () {
        it('prepends when position is top', function () {
            const list = ['existing'];

            insertByPosition(list, 'new', 'top');

            expect(list).to.deep.equal(['new', 'existing']);
        });

        it('appends when position is bottom', function () {
            const list = ['existing'];

            insertByPosition(list, 'new', 'bottom');

            expect(list).to.deep.equal(['existing', 'new']);
        });
    });

    describe('getCreateItemPosition', function () {
        it('reads top from synced settings', function () {
            state[SETTINGS_KEY] = {
                appearanceSetting: {
                    createItemPosition: 'top',
                },
            };

            expect(getCreateItemPosition()).to.equal('top');
        });

        it('falls back to bottom when settings are absent', function () {
            expect(getCreateItemPosition()).to.equal('bottom');
        });
    });

    describe('create route insertion position', function () {
        beforeEach(function () {
            state[SETTINGS_KEY] = {
                appearanceSetting: {
                    createItemPosition: 'top',
                },
            };
        });

        it('creates subscriptions at the top when settings request it', function () {
            state[SUBS_KEY] = [{ name: 'older-sub' }];
            const handler = getHandler(
                registerSubscriptionRoutes,
                'POST',
                '/api/subs',
            );
            const res = createResponse('/api/subs');

            handler(
                {
                    body: { name: 'new-sub', subscriptions: ['ignored'] },
                    query: {},
                },
                res,
            );

            expect(state[SUBS_KEY].map((item) => item.name)).to.deep.equal([
                'new-sub',
                'older-sub',
            ]);
            expect(state[SUBS_KEY][0]).to.not.have.property('subscriptions');
            expect(res.statusCode).to.equal(201);
        });

        it('creates collections at the top when settings request it', function () {
            state[COLLECTIONS_KEY] = [{ name: 'older-collection' }];
            const handler = getHandler(
                registerCollectionRoutes,
                'POST',
                '/api/collections',
            );
            const res = createResponse('/api/collections');

            handler(
                {
                    body: { name: 'new-collection', subscriptions: [] },
                    query: {},
                },
                res,
            );

            expect(state[COLLECTIONS_KEY].map((item) => item.name)).to.deep.equal([
                'new-collection',
                'older-collection',
            ]);
            expect(res.statusCode).to.equal(201);
        });

        it('creates files at the top when settings request it', function () {
            state[FILES_KEY] = [{ name: 'older-file' }];
            const handler = getHandler(registerFileRoutes, 'POST', '/api/files');
            const res = createResponse('/api/files');

            handler(
                {
                    body: { name: 'new-file' },
                    query: {},
                },
                res,
            );

            expect(state[FILES_KEY].map((item) => item.name)).to.deep.equal([
                'new-file',
                'older-file',
            ]);
            expect(res.statusCode).to.equal(201);
        });

        it('creates artifacts at the top when settings request it', function () {
            state[ARTIFACTS_KEY] = [{ name: 'older-artifact' }];
            const handler = getHandler(
                registerArtifactRoutes,
                'POST',
                '/api/artifacts',
            );
            const res = createResponse('/api/artifacts');

            handler(
                {
                    body: {
                        name: 'new-artifact',
                        type: 'file',
                        source: 'demo',
                        platform: 'JSON',
                    },
                    query: {},
                },
                res,
            );

            expect(state[ARTIFACTS_KEY].map((item) => item.name)).to.deep.equal([
                'new-artifact',
                'older-artifact',
            ]);
            expect(res.statusCode).to.equal(201);
        });

        it('creates tokens at the top when settings request it without persisting transport metadata', async function () {
            state[SUBS_KEY] = [{ name: 'sub-1' }];
            state[TOKENS_KEY] = [
                { token: 'older-token', type: 'sub', name: 'sub-1' },
            ];
            const handler = getHandler(registerTokenRoutes, 'POST', '/api/token');
            const res = createResponse('/api/token');

            await handler(
                {
                    body: {
                        payload: {
                            type: 'sub',
                            name: 'sub-1',
                            token: 'new-token',
                        },
                        options: {},
                    },
                    query: {},
                },
                res,
            );

            expect(state[TOKENS_KEY].map((item) => item.token)).to.deep.equal([
                'new-token',
                'older-token',
            ]);
            expect(state[TOKENS_KEY][0]).to.not.have.property('position');
            expect(res.statusCode).to.equal(200);
        });

        it('defaults to bottom insertion when no position is provided', function () {
            state[SUBS_KEY] = [{ name: 'older-sub' }];
            state[SETTINGS_KEY] = {};
            const handler = getHandler(
                registerSubscriptionRoutes,
                'POST',
                '/api/subs',
            );
            const res = createResponse('/api/subs');

            handler(
                {
                    body: { name: 'new-sub' },
                    query: {},
                },
                res,
            );

            expect(state[SUBS_KEY].map((item) => item.name)).to.deep.equal([
                'older-sub',
                'new-sub',
            ]);
            expect(res.statusCode).to.equal(201);
        });
    });
});
