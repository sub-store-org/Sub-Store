import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { ARTIFACTS_KEY, FILES_KEY, SETTINGS_KEY } from '@/constants';

let $;
let registerArtifactRoutes;
let registerSyncRoutes;
let produceSyncArtifactOutput;
let originalError;
let originalInfo;
let originalRead;
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
        ({ default: registerSyncRoutes, produceSyncArtifactOutput } = require(
            '@/restful/sync'
        ));
        ageUtils = require('@/utils/age');

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

    it('preserves artifact edits made while a single artifact sync is running', async function () {
        const startedAt = new Date().getTime();
        let artifactReads = 0;
        $.read = (key) => {
            if (key === ARTIFACTS_KEY) {
                artifactReads++;
                if (artifactReads === 2) {
                    state[ARTIFACTS_KEY] = [
                        {
                            ...state[ARTIFACTS_KEY][0],
                            remark: 'edited while syncing',
                            cron: '55 23 * * *',
                        },
                    ];
                }
            }
            return state[key] || [];
        };

        const res = await requestSyncArtifact('local-artifact');

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.remark).to.equal('edited while syncing');
        expect(res.body.data.cron).to.equal('55 23 * * *');
        expect(res.body.data.updated).to.be.at.least(startedAt);
        expect(res.body.data).to.not.have.property('url');
        expect(state[ARTIFACTS_KEY][0].remark).to.equal('edited while syncing');
        expect(state[ARTIFACTS_KEY][0].cron).to.equal('55 23 * * *');
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

    it('encrypts sync artifact output with artifact age-public-key', async function () {
        const pair = await ageUtils.generateKeyPair();
        state[ARTIFACTS_KEY][0]['age-public-key'] = pair['age-public-key'];

        const output = await produceSyncArtifactOutput(state[ARTIFACTS_KEY][0]);
        const decrypted = await ageUtils.decryptArmorIfPresent(
            output,
            pair['age-secret-key'],
        );

        expect(output).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('local content');
    });

    it('uses source age-public-key when artifact has no key', async function () {
        const pair = await ageUtils.generateKeyPair();
        state[FILES_KEY][0]['age-public-key'] = pair['age-public-key'];

        const output = await produceSyncArtifactOutput(state[ARTIFACTS_KEY][0]);
        const decrypted = await ageUtils.decryptArmorIfPresent(
            output,
            pair['age-secret-key'],
        );

        expect(output).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('local content');
    });

    it('uses artifact age-public-key before source key', async function () {
        const sourcePair = await ageUtils.generateKeyPair();
        const artifactPair = await ageUtils.generateKeyPair();
        state[FILES_KEY][0]['age-public-key'] = sourcePair['age-public-key'];
        state[ARTIFACTS_KEY][0]['age-public-key'] =
            artifactPair['age-public-key'];

        const output = await produceSyncArtifactOutput(state[ARTIFACTS_KEY][0]);
        const decrypted = await ageUtils.decryptArmorIfPresent(
            output,
            artifactPair['age-secret-key'],
        );

        expect(output).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(decrypted).to.equal('local content');
        try {
            await ageUtils.decryptArmorIfPresent(
                output,
                sourcePair['age-secret-key'],
            );
            throw new Error('Expected source key decrypt to fail');
        } catch (e) {
            expect(e.message).to.contain('age 解密失败');
        }
    });
});
