import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { ARTIFACTS_KEY, FILES_KEY, SETTINGS_KEY } from '@/constants';

let $;
let registerArtifactRoutes;
let registerSyncRoutes;
let originalError;
let originalInfo;
let originalRead;
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
    registerSyncRoutes(app);
    return app.handlers.get(`GET ${pattern}`);
}

function createResponse(routePath) {
    return {
        req: {
            route: {
                path: routePath,
            },
        },
        body: null,
        statusCode: 200,
        json(payload) {
            this.body = payload;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
    };
}

async function requestSyncArtifact(name) {
    const handler = getHandler('/api/sync/artifact/:name');
    const res = createResponse('/api/sync/artifact/:name');

    await handler(
        {
            body: {},
            params: { name },
            query: {},
        },
        res,
    );

    return res;
}

async function requestDeleteArtifact(name) {
    const app = createRouteApp();
    registerArtifactRoutes(app);
    const handler = app.handlers.get('DELETE /api/artifact/:name');
    const res = createResponse('/api/artifact/:name');

    await handler(
        {
            params: { name },
            query: {},
        },
        res,
    );

    return res;
}

describe('sync routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({ default: registerArtifactRoutes } = require('@/restful/artifacts'));
        ({ default: registerSyncRoutes } = require('@/restful/sync'));

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
    });

    beforeEach(function () {
        state = {
            [SETTINGS_KEY]: {},
            [ARTIFACTS_KEY]: [
                {
                    name: 'local-artifact',
                    type: 'file',
                    source: 'local-file',
                    sync: true,
                    upload: false,
                    updated: 1711111111111,
                    url: 'https://gist.example.com/old',
                },
            ],
            [FILES_KEY]: [
                {
                    name: 'local-file',
                    source: 'local',
                    content: 'local content',
                },
            ],
        };

        $.read = (key) => state[key] || [];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = () => {};
        $.error = () => {};
    });

    it('updates run time without requiring a Gist URL when upload is disabled', async function () {
        const startedAt = new Date().getTime();

        const res = await requestSyncArtifact('local-artifact');

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.updated).to.be.at.least(startedAt);
        expect(res.body.data).to.not.have.property('url');
        expect(state[ARTIFACTS_KEY][0].updated).to.be.at.least(startedAt);
        expect(state[ARTIFACTS_KEY][0]).to.not.have.property('url');
    });

    it('does not try to delete a remote file when only run time exists', async function () {
        delete state[ARTIFACTS_KEY][0].url;

        const res = await requestDeleteArtifact('local-artifact');

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.remote).to.deep.equal({
            attempted: false,
            status: 'not_attempted',
        });
        expect(state[ARTIFACTS_KEY]).to.deep.equal([]);
    });
});
