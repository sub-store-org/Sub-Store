import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';

import $ from '@/core/app';
import { SETTINGS_KEY } from '@/constants';
import registerSettingsRoutes, {
    getGithubAvatarApiUrl,
    shouldRefreshArtifactStoreForSettingsPatch,
} from '@/restful/settings';
import { AGE_SECRET_KEY, generateKeyPair } from '@/utils/age';

function createRouteApp() {
    const handlers = new Map();
    const app = {
        handlers,
        route(pattern) {
            const chain = {};
            chain.get = (handler) => {
                handlers.set(`GET ${pattern}`, handler);
                return chain;
            };
            chain.patch = (handler) => {
                handlers.set(`PATCH ${pattern}`, handler);
                return chain;
            };
            return chain;
        },
    };

    return app;
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

describe('settings routes', function () {
    describe('artifact store refresh detection', function () {
        it('refreshes when GitHub API URL changes', function () {
            expect(
                shouldRefreshArtifactStoreForSettingsPatch({
                    githubApiUrl: 'https://litegist.example.com/api',
                }),
            ).to.equal(true);
        });

        it('refreshes when a Gist-affecting setting is cleared', function () {
            expect(
                shouldRefreshArtifactStoreForSettingsPatch({
                    githubProxy: '',
                }),
            ).to.equal(true);
        });

        it('does not refresh for unrelated settings', function () {
            expect(
                shouldRefreshArtifactStoreForSettingsPatch({
                    logsMaxCount: 100,
                }),
            ).to.equal(false);
        });

        it('does not refresh when only GitHub username changes', function () {
            expect(
                shouldRefreshArtifactStoreForSettingsPatch({
                    githubUser: 'xream',
                }),
            ).to.equal(false);
        });
    });

    describe('GitHub avatar API URL', function () {
        it('uses the default GitHub users API when no custom API URL is set', function () {
            expect(
                getGithubAvatarApiUrl({
                    username: 'xream',
                }),
            ).to.equal('https://api.github.com/users/xream');
        });

        it('applies GitHub proxy only to the default GitHub users API', function () {
            expect(
                getGithubAvatarApiUrl({
                    username: 'xream',
                    githubProxy: 'https://proxy.example.com/',
                }),
            ).to.equal(
                'https://proxy.example.com/https://api.github.com/users/xream',
            );
        });

        it('does not apply GitHub proxy to a custom GitHub users API', function () {
            expect(
                getGithubAvatarApiUrl({
                    username: 'xream',
                    githubApiUrl: 'https://litegist.example.com/api/',
                    githubProxy: 'https://proxy.example.com/',
                }),
            ).to.equal('https://litegist.example.com/api/users/xream');
        });
    });

    describe('age key settings', function () {
        const originalRead = $.read.bind($);
        const originalWrite = $.write.bind($);

        afterEach(function () {
            $.read = originalRead;
            $.write = originalWrite;
        });

        async function patchSettings(initialSettings, body) {
            const state = {
                [SETTINGS_KEY]: initialSettings,
            };
            $.read = (key) => state[key];
            $.write = (data, key) => {
                state[key] = data;
                return true;
            };

            const app = createRouteApp();
            registerSettingsRoutes(app);
            const patchHandler = app.handlers.get('PATCH /api/settings');
            const res = createResponse('/api/settings');

            await patchHandler({ body }, res);

            return {
                res,
                settings: state[SETTINGS_KEY],
            };
        }

        it('does not validate existing age-secret-key on unrelated patches', async function () {
            const { res, settings } = await patchSettings(
                {
                    gistUpload: 'age',
                    [AGE_SECRET_KEY]: '恢复后请重新设置 age 解密私钥',
                    logsMaxCount: 1,
                },
                { logsMaxCount: 2 },
            );

            expect(res.body.status).to.equal('success');
            expect(settings.logsMaxCount).to.equal(2);
            expect(settings[AGE_SECRET_KEY]).to.equal(
                '恢复后请重新设置 age 解密私钥',
            );
        });

        it('does not validate submitted age secret key outside age mode', async function () {
            const { res, settings } = await patchSettings(
                {},
                {
                    gistUpload: 'base64',
                    [AGE_SECRET_KEY]: 'invalid-secret-key',
                },
            );

            expect(res.body.status).to.equal('success');
            expect(settings[AGE_SECRET_KEY]).to.equal('invalid-secret-key');
        });

        it('accepts valid age secret key in age mode', async function () {
            const pair = await generateKeyPair();
            const { res, settings } = await patchSettings(
                {},
                {
                    gistUpload: 'age',
                    [AGE_SECRET_KEY]: ` ${pair[AGE_SECRET_KEY]} `,
                },
            );

            expect(res.body.status).to.equal('success');
            expect(settings[AGE_SECRET_KEY]).to.equal(pair[AGE_SECRET_KEY]);
        });

        it('requires age secret key in age mode', async function () {
            const { res } = await patchSettings({}, { gistUpload: 'age' });

            expect(res.body.status).to.equal('failed');
            expect(res.body.error.message).to.contain(
                'age 加密模式需要配置 age-secret-key',
            );
        });

        it('rejects invalid submitted age secret key in age mode', async function () {
            const { res } = await patchSettings(
                {},
                {
                    gistUpload: 'age',
                    [AGE_SECRET_KEY]: 'invalid-secret-key',
                },
            );

            expect(res.body.status).to.equal('failed');
            expect(res.body.error.message).to.contain(
                'age-secret-key 仅支持',
            );
        });
    });

    describe('appearance settings', function () {
        const originalRead = $.read.bind($);
        const originalWrite = $.write.bind($);

        afterEach(function () {
            $.read = originalRead;
            $.write = originalWrite;
        });

        async function patchSettings(initialSettings, body) {
            const state = {
                [SETTINGS_KEY]: initialSettings,
            };
            $.read = (key) => state[key];
            $.write = (data, key) => {
                state[key] = data;
                return true;
            };

            const app = createRouteApp();
            registerSettingsRoutes(app);
            const patchHandler = app.handlers.get('PATCH /api/settings');
            const res = createResponse('/api/settings');

            await patchHandler({ body }, res);

            expect(res.body.status).to.equal('success');
            return state[SETTINGS_KEY];
        }

        it('merges appearanceSetting patches without dropping unrelated fields', async function () {
            const settings = await patchSettings(
                {
                    appearanceSetting: {
                        isSimpleMode: false,
                        editorGroupingMode: 'always',
                        editorCommonDisplayMode: 'collapsed',
                    },
                },
                {
                    appearanceSetting: {
                        isSimpleMode: true,
                    },
                },
            );

            expect(settings.appearanceSetting).to.deep.equal({
                isSimpleMode: true,
                editorGroupingMode: 'always',
                editorCommonDisplayMode: 'collapsed',
            });
        });
    });

    describe('backend request concurrency settings', function () {
        const originalRead = $.read.bind($);
        const originalWrite = $.write.bind($);

        afterEach(function () {
            $.read = originalRead;
            $.write = originalWrite;
        });

        async function patchSettings(initialSettings, body) {
            const state = {
                [SETTINGS_KEY]: initialSettings,
            };
            $.read = (key) => state[key];
            $.write = (data, key) => {
                state[key] = data;
                return true;
            };

            const app = createRouteApp();
            registerSettingsRoutes(app);
            const patchHandler = app.handlers.get('PATCH /api/settings');
            const res = createResponse('/api/settings');

            await patchHandler({ body }, res);

            expect(res.body.status).to.equal('success');
            return state[SETTINGS_KEY];
        }

        it('persists positive integer backend request concurrency', async function () {
            const settings = await patchSettings(
                {},
                { backendRequestConcurrency: '15' },
            );

            expect(settings).to.deep.include({
                backendRequestConcurrency: '15',
            });
        });

        it('allows backend request concurrency above proxy app guidance', async function () {
            const settings = await patchSettings(
                {},
                { backendRequestConcurrency: 21 },
            );

            expect(settings).to.deep.include({
                backendRequestConcurrency: 21,
            });
        });

        it('clears invalid backend request concurrency values', async function () {
            const invalidValues = ['', 'abc', '1.5', 0, -1, null];

            for (const value of invalidValues) {
                const settings = await patchSettings(
                    { backendRequestConcurrency: 8 },
                    { backendRequestConcurrency: value },
                );

                expect(settings).to.not.have.property(
                    'backendRequestConcurrency',
                );
            }
        });

        it('persists backend request concurrency wait time values', async function () {
            const zeroWaitSettings = await patchSettings(
                {},
                { backendRequestConcurrencyWaitTime: 0 },
            );
            const positiveWaitSettings = await patchSettings(
                {},
                { backendRequestConcurrencyWaitTime: '50' },
            );

            expect(zeroWaitSettings).to.deep.include({
                backendRequestConcurrencyWaitTime: 0,
            });
            expect(positiveWaitSettings).to.deep.include({
                backendRequestConcurrencyWaitTime: '50',
            });
        });

        it('clears invalid backend request concurrency wait time values', async function () {
            const invalidValues = ['', 'abc', '1.5', -1, null];

            for (const value of invalidValues) {
                const settings = await patchSettings(
                    { backendRequestConcurrencyWaitTime: 8 },
                    { backendRequestConcurrencyWaitTime: value },
                );

                expect(settings).to.not.have.property(
                    'backendRequestConcurrencyWaitTime',
                );
            }
        });
    });
});
