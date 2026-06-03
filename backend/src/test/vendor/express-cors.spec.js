import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';

import express from '@/vendor/express';

const ENV_KEY = 'SUB_STORE_CORS_ALLOWED_ORIGINS';
const HOST = '127.0.0.1';

describe('express CORS allowlist adapter', function () {
    let originalCorsEnv;

    afterEach(function () {
        if (originalCorsEnv == null) {
            delete process.env[ENV_KEY];
        } else {
            process.env[ENV_KEY] = originalCorsEnv;
        }
    });

    it('keeps Node default wildcard behavior', async function () {
        await withServer(undefined, async ({ baseUrl, getRouteCalls }) => {
            const res = await fetch(`${baseUrl}/probe`, {
                headers: {
                    Origin: 'https://evil.example',
                },
            });

            expect(res.status).to.equal(200);
            expect(getRouteCalls()).to.equal(1);
            expect(res.headers.get('access-control-allow-origin')).to.equal(
                '*',
            );
        });
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
                expect(local.headers.get('access-control-allow-origin')).to.equal(
                    'http://127.0.0.1:8888',
                );
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

    async function withServer(corsEnv, run) {
        originalCorsEnv = process.env[ENV_KEY];
        if (corsEnv == null) {
            delete process.env[ENV_KEY];
        } else {
            process.env[ENV_KEY] = corsEnv;
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
