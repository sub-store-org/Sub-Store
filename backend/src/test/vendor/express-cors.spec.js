import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';

import express from '@/vendor/express';

const ENV_KEY = 'SUB_STORE_CORS_ALLOWED_ORIGINS';
const CUSTOM_NAME_ENV_KEY = 'SUB_STORE_BACKEND_CUSTOM_NAME';
const HOST = '127.0.0.1';

describe('express CORS allowlist adapter', function () {
    let originalCorsEnv;
    let originalCustomName;

    afterEach(function () {
        if (originalCorsEnv == null) {
            delete process.env[ENV_KEY];
        } else {
            process.env[ENV_KEY] = originalCorsEnv;
        }
        if (originalCustomName == null) {
            delete process.env[CUSTOM_NAME_ENV_KEY];
        } else {
            process.env[CUSTOM_NAME_ENV_KEY] = originalCustomName;
        }
    });

    it('uses and logs the bundled frontend origins by default', async function () {
        await withServer(
            undefined,
            async ({ baseUrl, getRouteCalls, logs }) => {
                const res = await fetch(`${baseUrl}/probe`, {
                    headers: {
                        Origin: 'https://evil.example',
                    },
                });

                expect(res.status).to.equal(403);
                expect(getRouteCalls()).to.equal(0);
                expect(
                    logs.filter((log) => log.startsWith('[CORS]')),
                ).to.deep.equal([
                    '[CORS] SUB_STORE_CORS_ALLOWED_ORIGINS is not set; using default allowed origins: https://sub-store.vercel.app,http://substore.stash,https://substore.stash',
                ]);
            },
        );
    });

    it('allows only bundled and local origins for custom backends without logging the bypass', async function () {
        await withServer(
            undefined,
            async ({ baseUrl, logs }) => {
                const official = await fetch(`${baseUrl}/probe`, {
                    headers: {
                        Origin: 'https://sub-store.vercel.app',
                    },
                });
                const localhost = await fetch(`${baseUrl}/probe`, {
                    headers: { Origin: 'http://localhost:5173' },
                });
                const loopback = await fetch(`${baseUrl}/probe`, {
                    headers: { Origin: 'http://127.0.0.1:8888' },
                });
                const rejected = await fetch(`${baseUrl}/probe`, {
                    headers: { Origin: 'https://evil.example' },
                });

                expect(official.status).to.equal(200);
                expect(localhost.status).to.equal(200);
                expect(loopback.status).to.equal(200);
                expect(rejected.status).to.equal(403);
                expect(
                    localhost.headers.get('access-control-allow-origin'),
                ).to.equal('http://localhost:5173');
                expect(
                    loopback.headers.get('access-control-allow-origin'),
                ).to.equal('http://127.0.0.1:8888');
                expect(
                    rejected.headers.get('access-control-allow-origin'),
                ).to.equal(null);
                expect(
                    official.headers.get('access-control-allow-origin'),
                ).to.equal('https://sub-store.vercel.app');
                expect(logs.some((log) => log.includes('is not set'))).to.equal(
                    false,
                );
                expect(
                    logs.filter((log) => log.startsWith('[CORS]')),
                ).to.deep.equal([
                    '[CORS] allowed origins: https://sub-store.vercel.app,http://substore.stash,https://substore.stash,http://localhost:<any-port>,http://127.0.0.1:<any-port> (default:node)',
                ]);
            },
            'custom',
        );
    });

    it('rejects disallowed actual requests before route handlers run', async function () {
        await withServer(
            'https://sub-store.vercel.app',
            async ({ baseUrl, getRouteCalls }) => {
                const res = await fetch(`${baseUrl}/probe`, {
                    headers: {
                        Origin: 'https://evil.example',
                    },
                });

                expect(res.status).to.equal(403);
                expect(getRouteCalls()).to.equal(0);
                expect(res.headers.get('access-control-allow-origin')).to.equal(
                    null,
                );
            },
        );
    });

    it('rejects disallowed preflight requests', async function () {
        await withServer(
            'https://sub-store.vercel.app',
            async ({ baseUrl, getRouteCalls }) => {
                const res = await fetch(`${baseUrl}/probe`, {
                    method: 'OPTIONS',
                    headers: {
                        Origin: 'https://evil.example',
                        'Access-Control-Request-Method': 'GET',
                    },
                });

                expect(res.status).to.equal(403);
                expect(getRouteCalls()).to.equal(0);
            },
        );
    });

    it('allows configured exact origins and returns readable CORS headers', async function () {
        await withServer(
            'https://sub-store.vercel.app,http://127.0.0.1:8888',
            async ({ baseUrl, getRouteCalls }) => {
                const official = await fetch(`${baseUrl}/probe`, {
                    headers: {
                        Origin: 'https://sub-store.vercel.app',
                    },
                });
                const local = await fetch(`${baseUrl}/probe`, {
                    headers: {
                        Origin: 'http://127.0.0.1:8888',
                    },
                });

                expect(official.status).to.equal(200);
                expect(local.status).to.equal(200);
                expect(getRouteCalls()).to.equal(2);
                expect(
                    official.headers.get('access-control-allow-origin'),
                ).to.equal('https://sub-store.vercel.app');
                expect(
                    local.headers.get('access-control-allow-origin'),
                ).to.equal('http://127.0.0.1:8888');
                expect(official.headers.get('vary')).to.include('Origin');
            },
        );
    });

    it('continues no-origin requests through the existing route flow', async function () {
        await withServer(
            'https://sub-store.vercel.app',
            async ({ baseUrl, getRouteCalls }) => {
                const res = await fetch(`${baseUrl}/probe`);

                expect(res.status).to.equal(200);
                expect(getRouteCalls()).to.equal(1);
                expect(res.headers.get('access-control-allow-origin')).to.equal(
                    null,
                );
            },
        );
    });

    it('logs the resolved allowlist value and source', async function () {
        await withServer(
            'https://sub-store.vercel.app,http://127.0.0.1:8888',
            async ({ logs }) => {
                expect(logs).to.include(
                    '[CORS] allowed origins: https://sub-store.vercel.app,http://127.0.0.1:8888 (env:SUB_STORE_CORS_ALLOWED_ORIGINS)',
                );
            },
        );
    });

    async function withServer(corsEnv, run, customName) {
        originalCorsEnv = process.env[ENV_KEY];
        originalCustomName = process.env[CUSTOM_NAME_ENV_KEY];
        if (corsEnv == null) {
            delete process.env[ENV_KEY];
        } else {
            process.env[ENV_KEY] = corsEnv;
        }
        if (customName == null) {
            delete process.env[CUSTOM_NAME_ENV_KEY];
        } else {
            process.env[CUSTOM_NAME_ENV_KEY] = customName;
        }

        const logs = [];
        let routeCalls = 0;
        const app = express({
            substore: {
                info(message) {
                    logs.push(message);
                },
            },
        });

        app.get('/probe', (req, res) => {
            routeCalls += 1;
            res.json({ status: 'success' });
        });

        const server = await listen(app);
        const { port } = server.address();

        try {
            await run({
                baseUrl: `http://${HOST}:${port}`,
                logs,
                getRouteCalls: () => routeCalls,
            });
        } finally {
            await close(server);
        }
    }

    function listen(app) {
        return new Promise((resolve) => {
            const server = app.listen(0, HOST, () => resolve(server));
        });
    }

    function close(server) {
        return new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
});
