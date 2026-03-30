import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    FILES_KEY,
    ARCHIVES_KEY,
    SETTINGS_KEY,
    SUBS_KEY,
    TOKENS_KEY,
} from '@/constants';

let $;
let registerCollectionRoutes;
let registerArtifactRoutes;
let registerMiscRoutes;
let registerArchiveRoutes;
let registerSortingRoutes;
let registerSubscriptionRoutes;
let registerTokenRoutes;
let originalError;
let originalInfo;
let originalRead;
let originalWrite;
let state;
let tempDir;
let previousDataBasePath;

function createRouteApp() {
    const handlers = new Map();
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'all'];

    const app = {
        handlers,
        route(pattern) {
            const chain = {};
            methods
                .filter((method) => method !== 'all')
                .forEach((method) => {
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
        body: null,
        headers: {},
        req: {
            route: {
                path: routePath,
            },
        },
        sent: null,
        statusCode: 200,
        json(payload) {
            this.body = payload;
            return this;
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

describe('archive routes', function () {
    before(async function () {
        previousDataBasePath = process.env.SUB_STORE_DATA_BASE_PATH;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-store-archives-'));
        process.env.SUB_STORE_DATA_BASE_PATH = tempDir;

        ({ default: $ } = require('@/core/app'));
        ({ default: registerSubscriptionRoutes } = require(
            '@/restful/subscriptions'
        ));
        ({ default: registerCollectionRoutes } = require('@/restful/collections'));
        ({ default: registerArtifactRoutes } = require('@/restful/artifacts'));
        ({ default: registerTokenRoutes } = require('@/restful/token'));
        ({ default: registerArchiveRoutes } = require('@/restful/archives'));
        ({ default: registerSortingRoutes } = require('@/restful/sort'));
        ({ default: registerMiscRoutes } = require('@/restful/miscs'));

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
            [ARCHIVES_KEY]: [],
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

    it('archives and restores subscriptions through the live delete route', async function () {
        state[SUBS_KEY] = [
            {
                name: 'demo-sub',
                displayName: 'Demo Sub',
                source: 'remote',
                tag: ['alpha'],
                url: 'https://example.com/sub',
                process: [],
            },
        ];
        state[COLLECTIONS_KEY] = [
            {
                name: 'demo-collection',
                subscriptions: ['demo-sub'],
            },
        ];

        const deleteHandler = getHandler(
            registerSubscriptionRoutes,
            'DELETE',
            '/api/sub/:name',
        );
        const deleteRes = createResponse('/api/sub/:name');

        deleteHandler(
            {
                params: { name: 'demo-sub' },
                query: { mode: 'archive' },
            },
            deleteRes,
        );

        expect(deleteRes.body.status).to.equal('success');
        expect(state[SUBS_KEY]).to.deep.equal([]);
        expect(state[COLLECTIONS_KEY][0].subscriptions).to.deep.equal([]);
        expect(state[ARCHIVES_KEY]).to.have.length(1);
        expect(state[ARCHIVES_KEY][0].itemType).to.equal('sub');
        expect(state[ARCHIVES_KEY][0].snapshot.name).to.equal('demo-sub');

        const restoreHandler = getHandler(
            registerArchiveRoutes,
            'POST',
            '/api/archives/:id/restore',
        );
        const restoreRes = createResponse('/api/archives/:id/restore');

        restoreHandler(
            {
                params: { id: state[ARCHIVES_KEY][0].id },
                query: {},
            },
            restoreRes,
        );

        expect(restoreRes.body.status).to.equal('success');
        expect(state[SUBS_KEY]).to.have.length(1);
        expect(state[SUBS_KEY][0].name).to.equal('demo-sub');
        expect(state[ARCHIVES_KEY]).to.deep.equal([]);
    });

    it('keeps archived entries when restore fails and preserves share tokens on success', async function () {
        state[SUBS_KEY] = [
            {
                name: 'shared-sub',
                source: 'remote',
                process: [],
            },
        ];
        state[TOKENS_KEY] = [
            {
                token: 'keep-me',
                type: 'sub',
                name: 'shared-sub',
                displayName: 'Shared Link',
                expiresIn: '1d',
            },
        ];

        const deleteHandler = getHandler(
            registerTokenRoutes,
            'DELETE',
            '/api/token/:token',
        );
        const deleteRes = createResponse('/api/token/:token');

        deleteHandler(
            {
                params: { token: 'keep-me' },
                query: {
                    mode: 'archive',
                    type: 'sub',
                    name: 'shared-sub',
                },
            },
            deleteRes,
        );

        expect(deleteRes.body.status).to.equal('success');
        expect(state[TOKENS_KEY]).to.deep.equal([]);
        expect(state[ARCHIVES_KEY]).to.have.length(1);
        expect(state[ARCHIVES_KEY][0].itemType).to.equal('share');
        expect(state[ARCHIVES_KEY][0].snapshot.token).to.equal('keep-me');

        const archivedId = state[ARCHIVES_KEY][0].id;
        state[TOKENS_KEY].push({
            token: 'keep-me',
            type: 'sub',
            name: 'shared-sub',
        });

        const restoreHandler = getHandler(
            registerArchiveRoutes,
            'POST',
            '/api/archives/:id/restore',
        );
        const failedRestoreRes = createResponse('/api/archives/:id/restore');

        restoreHandler(
            {
                params: { id: archivedId },
                query: {},
            },
            failedRestoreRes,
        );

        expect(failedRestoreRes.body.status).to.equal('failed');
        expect(failedRestoreRes.statusCode).to.equal(400);
        expect(failedRestoreRes.body.error.code).to.equal('DUPLICATE_TOKEN');
        expect(state[ARCHIVES_KEY]).to.have.length(1);

        state[TOKENS_KEY] = [];
        const successfulRestoreRes = createResponse(
            '/api/archives/:id/restore',
        );

        restoreHandler(
            {
                params: { id: archivedId },
                query: {},
            },
            successfulRestoreRes,
        );

        expect(successfulRestoreRes.body.status).to.equal('success');
        expect(state[TOKENS_KEY]).to.have.length(1);
        expect(state[TOKENS_KEY][0].token).to.equal('keep-me');
        expect(state[ARCHIVES_KEY]).to.deep.equal([]);
    });

    it('restores artifacts without stale sync metadata', async function () {
        state[ARTIFACTS_KEY] = [
            {
                name: 'demo-artifact',
                type: 'subscription',
                source: 'demo-sub',
                platform: 'Clash',
                sync: true,
                updated: 1711111111111,
                url: 'https://gist.example.com/demo-artifact',
            },
        ];

        const deleteHandler = getHandler(
            registerArtifactRoutes,
            'DELETE',
            '/api/artifact/:name',
        );
        const deleteRes = createResponse('/api/artifact/:name');

        await deleteHandler(
            {
                params: { name: 'demo-artifact' },
                query: { mode: 'archive' },
            },
            deleteRes,
        );

        expect(deleteRes.body.status).to.equal('success');
        expect(state[ARTIFACTS_KEY]).to.deep.equal([]);
        expect(state[ARCHIVES_KEY]).to.have.length(1);
        expect(state[ARCHIVES_KEY][0].itemType).to.equal('artifact');
        expect(state[ARCHIVES_KEY][0].snapshot.updated).to.equal(1711111111111);
        expect(state[ARCHIVES_KEY][0].snapshot.url).to.equal(
            'https://gist.example.com/demo-artifact',
        );

        const restoreHandler = getHandler(
            registerArchiveRoutes,
            'POST',
            '/api/archives/:id/restore',
        );
        const restoreRes = createResponse('/api/archives/:id/restore');

        restoreHandler(
            {
                params: { id: state[ARCHIVES_KEY][0].id },
                query: {},
            },
            restoreRes,
        );

        expect(restoreRes.body.status).to.equal('success');
        expect(state[ARTIFACTS_KEY]).to.have.length(1);
        expect(state[ARTIFACTS_KEY][0].name).to.equal('demo-artifact');
        expect(state[ARTIFACTS_KEY][0].sync).to.equal(true);
        expect(state[ARTIFACTS_KEY][0]).to.not.have.property('updated');
        expect(state[ARTIFACTS_KEY][0]).to.not.have.property('url');
        expect(state[ARCHIVES_KEY]).to.deep.equal([]);
    });

    it('sorts archive entries by id order', function () {
        state[ARCHIVES_KEY] = [
            { id: 'entry-b', itemType: 'sub', name: 'b' },
            { id: 'entry-a', itemType: 'sub', name: 'a' },
        ];

        const sortHandler = getHandler(
            registerSortingRoutes,
            'POST',
            '/api/sort/archives',
        );
        const sortRes = createResponse('/api/sort/archives');

        sortHandler(
            {
                body: ['entry-a', 'entry-b'],
                query: {},
            },
            sortRes,
        );

        expect(sortRes.body.status).to.equal('success');
        expect(state[ARCHIVES_KEY].map((item) => item.id)).to.deep.equal([
            'entry-a',
            'entry-b',
        ]);
    });

    it('advertises archive capability in env payload', function () {
        const envHandler = getHandler(registerMiscRoutes, 'GET', '/api/utils/env');
        const envRes = createResponse('/api/utils/env');

        envHandler({ query: {} }, envRes);

        const payload = JSON.parse(envRes.sent);
        expect(payload.status).to.equal('success');
        expect(payload.data.feature.archive).to.equal(true);
    });
});
