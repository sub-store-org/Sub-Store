import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const backendPath = path.resolve(__dirname, '../../..');
const workerBundlePath = path.join(backendPath, 'dist/cf-worker.mjs');

/**
 * Minimal in-memory Cloudflare D1 mock supporting prepare/bind/run/all/batch
 * for the kv_store table used by Sub-Store's D1 store.
 */
function createMockD1() {
    const rows = new Map(); // `${scope}\0${key}` -> { scope, key, value, updated_at }
    let tableCreated = false;
    let batchCount = 0;

    function executeStatement(sql, params) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        if (normalized.startsWith('CREATE TABLE IF NOT EXISTS kv_store')) {
            tableCreated = true;
            return { success: true, results: [] };
        }
        if (normalized === 'SELECT scope, key, value FROM kv_store') {
            return {
                success: true,
                results: Array.from(rows.values()).map((r) => ({
                    scope: r.scope,
                    key: r.key,
                    value: r.value,
                })),
            };
        }
        if (normalized === 'DELETE FROM kv_store WHERE scope = ?') {
            const [scope] = params;
            for (const [k, v] of rows.entries()) {
                if (v.scope === scope) rows.delete(k);
            }
            return { success: true, results: [] };
        }
        if (
            normalized === 'DELETE FROM kv_store WHERE scope = ? AND key = ?'
        ) {
            const [scope, key] = params;
            rows.delete(`${scope}\0${key}`);
            return { success: true, results: [] };
        }
        if (
            normalized.startsWith(
                'INSERT OR REPLACE INTO kv_store (scope, key, value, updated_at) VALUES (?, ?, ?, ?)',
            )
        ) {
            const [scope, key, value, updatedAt] = params;
            rows.set(`${scope}\0${key}`, {
                scope,
                key,
                value,
                updated_at: updatedAt,
            });
            return { success: true, results: [] };
        }
        throw new Error(`Unsupported mock D1 SQL: ${normalized}`);
    }

    function makeStmt(sql, params = []) {
        return {
            bind(...args) {
                return makeStmt(sql, args);
            },
            async run() {
                return executeStatement(sql, params);
            },
            async all() {
                return executeStatement(sql, params);
            },
            _exec() {
                return executeStatement(sql, params);
            },
        };
    }

    return {
        rows,
        get tableCreated() {
            return tableCreated;
        },
        get batchCount() {
            return batchCount;
        },
        prepare(sql) {
            return makeStmt(sql);
        },
        async batch(statements) {
            batchCount += 1;
            return statements.map((stmt) => stmt._exec());
        },
    };
}

function createMockCtx() {
    const pending = [];
    return {
        waitUntil(promise) {
            pending.push(Promise.resolve(promise));
        },
        async drain() {
            await Promise.all(pending.splice(0));
        },
    };
}

describe('Cloudflare Workers D1 backend bundle', function () {
    this.timeout(30000);

    let worker;

    before(async function () {
        const buildResult = spawnSync(process.execPath, ['bundle-cf.js'], {
            cwd: backendPath,
            encoding: 'utf8',
        });
        expect(buildResult.status, buildResult.stderr).to.equal(0);
        expect(fs.existsSync(workerBundlePath)).to.equal(true);

        const nativeImport = new Function('specifier', 'return import(specifier)');
        const mod = await nativeImport(
            `${pathToFileURL(workerBundlePath).href}?t=${Date.now()}`,
        );
        worker = mod.default;
        expect(worker).to.be.an('object');
        expect(worker.fetch).to.be.a('function');
        expect(worker.scheduled).to.be.a('function');
    });

    it('serves /api/utils/env and persists subscriptions in D1', async function () {
        const db = createMockD1();
        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/',
        };
        const ctx = createMockCtx();

        const envRes = await worker.fetch(
            new Request('https://example.workers.dev/api/utils/env'),
            env,
            ctx,
        );
        await ctx.drain();
        expect(envRes.status).to.equal(200);
        const envJson = await envRes.json();
        expect(envJson.status).to.equal('success');
        expect(envJson.data.backend).to.equal('Cloudflare Workers');
        expect(envJson.data.feature.share).to.equal(true);
        expect(db.tableCreated).to.equal(true);

        // Create a local subscription
        const createRes = await worker.fetch(
            new Request('https://example.workers.dev/api/subs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'cf-test-sub',
                    source: 'local',
                    content:
                        'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:8388#HK-Node-1\nss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@5.6.7.8:8388#US-Node-2',
                    process: [],
                }),
            }),
            env,
            ctx,
        );
        await ctx.drain();
        expect(createRes.status).to.equal(201);
        expect(db.rows.has('cache\0subs')).to.equal(true);

        // Download as ClashMeta YAML
        const dlRes = await worker.fetch(
            new Request(
                'https://example.workers.dev/download/cf-test-sub?target=ClashMeta',
            ),
            env,
            ctx,
        );
        await ctx.drain();
        expect(dlRes.status).to.equal(200);
        const yamlText = await dlRes.text();
        expect(yamlText).to.include('HK-Node-1');
        expect(yamlText).to.include('US-Node-2');
    });

    it('executes Script Operator and Script Filter via sval without eval/new Function', async function () {
        const db = createMockD1();
        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/',
        };
        const ctx = createMockCtx();

        const createRes = await worker.fetch(
            new Request('https://example.workers.dev/api/subs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'sval-sub',
                    source: 'local',
                    content:
                        'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:8388#HK-Node\nss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@5.6.7.8:8388#US-Node',
                    process: [
                        {
                            type: 'Script Filter',
                            args: {
                                mode: 'script',
                                content:
                                    'function filter(proxies) { return proxies.map(p => p.name.includes("HK")); }',
                            },
                        },
                        {
                            type: 'Script Operator',
                            args: {
                                mode: 'script',
                                content:
                                    'async function operator(proxies) { return proxies.map(p => ({ ...p, name: "[CF] " + p.name })); }',
                            },
                        },
                    ],
                }),
            }),
            env,
            ctx,
        );
        await ctx.drain();
        expect(createRes.status).to.equal(201);

        // Simulate workerd disallowing eval and new Function at runtime.
        const origEval = globalThis.eval;
        const origFunction = globalThis.Function;
        globalThis.eval = () => {
            throw new EvalError('Code generation from strings disallowed');
        };
        globalThis.Function = function () {
            throw new EvalError('Code generation from strings disallowed');
        };

        try {
            const dlRes = await worker.fetch(
                new Request(
                    'https://example.workers.dev/download/sval-sub?target=JSON',
                ),
                env,
                ctx,
            );
            await ctx.drain();
            expect(dlRes.status).to.equal(200);
            const proxies = await dlRes.json();
            expect(proxies).to.have.lengthOf(1);
            expect(proxies[0].name).to.equal('[CF] HK-Node');
        } finally {
            globalThis.eval = origEval;
            globalThis.Function = origFunction;
        }
    });

    it('enforces secret path prefix and supports count-limited /share/ tokens', async function () {
        const db = createMockD1();
        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/my-secret-api',
        };
        const ctx = createMockCtx();

        // Direct unprefixed API request must be blocked with 404
        const blockedRes = await worker.fetch(
            new Request('https://example.workers.dev/api/subs'),
            env,
            ctx,
        );
        expect(blockedRes.status).to.equal(404);

        // Prefixed API creates a subscription
        const createRes = await worker.fetch(
            new Request('https://example.workers.dev/my-secret-api/api/subs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'shared-sub',
                    source: 'local',
                    content:
                        'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.2.3.4:8388#Shared-Node',
                    process: [],
                }),
            }),
            env,
            ctx,
        );
        await ctx.drain();
        expect(createRes.status).to.equal(201);

        // Sign a 1-use share token
        const tokenRes = await worker.fetch(
            new Request('https://example.workers.dev/my-secret-api/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payload: { type: 'sub', name: 'shared-sub' },
                    options: { mode: 'count', count: 1 },
                }),
            }),
            env,
            ctx,
        );
        await ctx.drain();
        expect(tokenRes.status).to.equal(200);
        const { data: tokenData } = await tokenRes.json();
        expect(tokenData.token).to.be.a('string').and.not.be.empty;

        // First public share request succeeds
        const shareRes1 = await worker.fetch(
            new Request(
                `https://example.workers.dev/share/sub/shared-sub?token=${encodeURIComponent(
                    tokenData.token,
                )}&target=JSON`,
            ),
            env,
            ctx,
        );
        await ctx.drain();
        expect(shareRes1.status).to.equal(200);
        const sharedProxies = await shareRes1.json();
        expect(sharedProxies).to.have.lengthOf(1);
        expect(sharedProxies[0].name).to.equal('Shared-Node');

        // Second share request is rejected because count=1 was exhausted and persisted in D1
        const shareRes2 = await worker.fetch(
            new Request(
                `https://example.workers.dev/share/sub/shared-sub?token=${encodeURIComponent(
                    tokenData.token,
                )}&target=JSON`,
            ),
            env,
            ctx,
        );
        await ctx.drain();
        expect(shareRes2.status).to.equal(404);
    });

    it('enforces SUB_STORE_CORS_ALLOWED_ORIGINS and handles preflight', async function () {
        const db = createMockD1();
        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/',
            SUB_STORE_CORS_ALLOWED_ORIGINS: 'https://allowed.example.com',
        };
        const ctx = createMockCtx();

        const deniedRes = await worker.fetch(
            new Request('https://example.workers.dev/api/utils/env', {
                headers: { Origin: 'https://evil.example.com' },
            }),
            env,
            ctx,
        );
        expect(deniedRes.status).to.equal(403);

        const preflightRes = await worker.fetch(
            new Request('https://example.workers.dev/api/utils/env', {
                method: 'OPTIONS',
                headers: { Origin: 'https://allowed.example.com' },
            }),
            env,
            ctx,
        );
        expect(preflightRes.status).to.equal(200);
        expect(
            preflightRes.headers.get('access-control-allow-origin'),
        ).to.equal('https://allowed.example.com');
    });

    it('runs scheduled cron handler without errors when no artifacts exist', async function () {
        const db = createMockD1();
        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_CF_CRON_TASKS: 'sync',
        };
        const ctx = createMockCtx();

        await worker.scheduled({ cron: '0 */6 * * *' }, env, ctx);
        await ctx.drain();
        expect(db.tableCreated).to.equal(true);
    });

    it('matches jsrsasign SHA-256 PEM fingerprint byte-for-byte', async function () {
        const { generateFingerprint: cfFingerprint } = await import(
            '../../cf/rs'
        );
        const { generateFingerprint: jsrsasignFingerprint } = await import(
            '../../utils/rs'
        );

        const samplePem = [
            '-----BEGIN CERTIFICATE-----',
            'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWy',
            'F8PbnGy0AHB7MhgwJ6L6b2M5+8fH4r5h7L8Q9w0E1R2T3Y4U5I6O7P8A9S0D1F2G',
            '-----END CERTIFICATE-----',
        ].join('\n');

        expect(cfFingerprint(samplePem)).to.equal(
            jsrsasignFingerprint(samplePem),
        );
    });

    it('stores remote subscription caches as per-entry D1 rows, prunes expired entries, and clears on refresh', async function () {
        const db = createMockD1();
        // Pre-seed an expired cache entry to verify automatic pruning on load.
        db.rows.set('rc:resource\0expired-entry-id', {
            scope: 'rc:resource',
            key: 'expired-entry-id',
            value: JSON.stringify({ time: Date.now() - 10000, data: 'stale' }),
            updated_at: Date.now() - 20000,
        });

        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/',
        };
        const ctx = createMockCtx();

        // Create a remote subscription
        const createRes = await worker.fetch(
            new Request('https://example.workers.dev/api/subs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'remote-cached-sub',
                    source: 'remote',
                    url: 'https://mock-airport.example.com/sub1',
                    process: [],
                }),
            }),
            env,
            ctx,
        );
        await ctx.drain();
        expect(createRes.status).to.equal(201);

        let fetchCount = 0;
        const origFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            fetchCount += 1;
            return new Response(
                'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@9.9.9.9:8388#Cached-Remote-Node',
                {
                    status: 200,
                    headers: { 'content-type': 'text/plain; charset=utf-8' },
                },
            );
        };

        try {
            // First download fetches upstream and stores in an individual rc:resource row
            const dl1 = await worker.fetch(
                new Request(
                    'https://example.workers.dev/download/remote-cached-sub?target=JSON&noFlow=1',
                ),
                env,
                ctx,
            );
            await ctx.drain();
            expect(dl1.status).to.equal(200);
            expect(fetchCount).to.equal(1);

            const rcRows = Array.from(db.rows.values()).filter(
                (r) => r.scope === 'rc:resource',
            );
            expect(rcRows).to.have.lengthOf(1);
            expect(db.rows.has('rc:resource\0expired-entry-id')).to.equal(false);
            expect(db.rows.has('root\0sub-store-cached-resource')).to.equal(
                false,
            );

            // Second download hits the per-entry D1 cache without calling fetch()
            const dl2 = await worker.fetch(
                new Request(
                    'https://example.workers.dev/download/remote-cached-sub?target=JSON&noFlow=1',
                ),
                env,
                ctx,
            );
            await ctx.drain();
            expect(dl2.status).to.equal(200);
            expect(fetchCount).to.equal(1);
            const proxies = await dl2.json();
            expect(proxies[0].name).to.equal('Cached-Remote-Node');

            // /api/utils/refresh clears all rc:resource rows
            const refreshRes = await worker.fetch(
                new Request('https://example.workers.dev/api/utils/refresh'),
                env,
                ctx,
            );
            await ctx.drain();
            expect(refreshRes.status).to.equal(200);
            const rcRowsAfterRefresh = Array.from(db.rows.values()).filter(
                (r) => r.scope === 'rc:resource',
            );
            expect(rcRowsAfterRefresh).to.have.lengthOf(0);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('serves frontend static assets and SPA fallback at "/" without touching D1 when secret prefix is set', async function () {
        const db = createMockD1();
        const staticFiles = new Map([
            [
                '/index.html',
                {
                    body: '<!DOCTYPE html><title>Sub-Store</title>',
                    contentType: 'text/html; charset=utf-8',
                },
            ],
            [
                '/chunks/main-12345678.js',
                {
                    body: 'console.log("sub-store");',
                    contentType: 'application/javascript; charset=utf-8',
                },
            ],
        ]);
        const fetchedPaths = [];
        const ASSETS = {
            async fetch(req) {
                const url = new URL(
                    typeof req === 'string' ? req : req.url,
                );
                fetchedPaths.push(url.pathname);
                const key =
                    url.pathname === '/' ? '/index.html' : url.pathname;
                const entry = staticFiles.get(key);
                if (!entry) {
                    return new Response('Not Found', { status: 404 });
                }
                return new Response(
                    req.method === 'HEAD' ? null : entry.body,
                    {
                        status: 200,
                        headers: { 'Content-Type': entry.contentType },
                    },
                );
            },
        };

        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/my-secret',
            ASSETS,
        };
        const ctx = createMockCtx();

        // 1. Root "/" serves index.html without touching D1
        const rootRes = await worker.fetch(
            new Request('https://example.workers.dev/'),
            env,
            ctx,
        );
        expect(rootRes.status).to.equal(200);
        expect(await rootRes.text()).to.include('<title>Sub-Store</title>');
        expect(db.tableCreated).to.equal(false);

        // 2. Static asset serves directly without touching D1
        const jsRes = await worker.fetch(
            new Request(
                'https://example.workers.dev/chunks/main-12345678.js',
            ),
            env,
            ctx,
        );
        expect(jsRes.status).to.equal(200);
        expect(await jsRes.text()).to.equal('console.log("sub-store");');
        expect(db.tableCreated).to.equal(false);

        // 3. SPA routes (including paths containing dots) fall back to /index.html without touching D1
        for (const spaPath of [
            '/subs',
            '/shares',
            '/settings/api',
            '/edit/subs/airport.com',
        ]) {
            const spaRes = await worker.fetch(
                new Request(`https://example.workers.dev${spaPath}`),
                env,
                ctx,
            );
            expect(spaRes.status, spaPath).to.equal(200);
            expect(await spaRes.text()).to.include('<title>Sub-Store</title>');
        }
        expect(db.tableCreated).to.equal(false);

        // 4. HEAD request on SPA route works without touching D1
        const headRes = await worker.fetch(
            new Request('https://example.workers.dev/subs', { method: 'HEAD' }),
            env,
            ctx,
        );
        expect(headRes.status).to.equal(200);
        expect(db.tableCreated).to.equal(false);

        // 5. Unprefixed backend routes & non-GET requests return 404 without touching D1
        for (const req of [
            new Request('https://example.workers.dev/api/utils/env'),
            new Request('https://example.workers.dev/download/test-sub'),
            new Request('https://example.workers.dev/share/sub/test-sub'),
            new Request('https://example.workers.dev/subs', { method: 'POST' }),
        ]) {
            const res = await worker.fetch(req, env, ctx);
            expect(res.status, `${req.method} ${req.url}`).to.equal(404);
        }
        expect(db.tableCreated).to.equal(false);

        // 6. Secret-prefixed backend API still works and allows same-origin POST without extra CORS config
        const createRes = await worker.fetch(
            new Request('https://example.workers.dev/my-secret/api/subs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://example.workers.dev',
                },
                body: JSON.stringify({
                    name: 'same-origin-sub',
                    source: 'local',
                    content:
                        'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@1.1.1.1:8388#SameOriginNode',
                    process: [],
                }),
            }),
            env,
            ctx,
        );
        await ctx.drain();
        expect(createRes.status).to.equal(201);
        expect(db.tableCreated).to.equal(true);

        // 7. Untrusted cross-origin POST is still rejected with 403
        const evilRes = await worker.fetch(
            new Request('https://example.workers.dev/my-secret/api/subs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://evil.example.com',
                },
                body: JSON.stringify({ name: 'evil' }),
            }),
            env,
            ctx,
        );
        expect(evilRes.status).to.equal(403);
    });

    it('serves frontend at "/" while keeping /api and /download working when no secret prefix is set', async function () {
        const db = createMockD1();
        const ASSETS = {
            async fetch(req) {
                const url = new URL(
                    typeof req === 'string' ? req : req.url,
                );
                if (url.pathname === '/' || url.pathname === '/index.html') {
                    return new Response('<html>SPA Root</html>', {
                        status: 200,
                        headers: { 'Content-Type': 'text/html; charset=utf-8' },
                    });
                }
                return new Response('Not Found', { status: 404 });
            },
        };
        const env = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/',
            ASSETS,
        };
        const ctx = createMockCtx();

        // Frontend SPA route returns index.html without touching D1
        const spaRes = await worker.fetch(
            new Request('https://example.workers.dev/my'),
            env,
            ctx,
        );
        expect(spaRes.status).to.equal(200);
        expect(await spaRes.text()).to.equal('<html>SPA Root</html>');
        expect(db.tableCreated).to.equal(false);

        // Backend API at /api/utils/env still works
        const apiRes = await worker.fetch(
            new Request('https://example.workers.dev/api/utils/env'),
            env,
            ctx,
        );
        await ctx.drain();
        expect(apiRes.status).to.equal(200);
        const body = await apiRes.json();
        expect(body.data.backend).to.equal('Cloudflare Workers');
        expect(db.tableCreated).to.equal(true);
    });

    it('behaves as backend-only when ASSETS is empty (default build without SUB_STORE_CF_FRONTEND)', async function () {
        const db = createMockD1();
        const emptyAssets = {
            async fetch() {
                return new Response('Not Found', { status: 404 });
            },
        };
        const ctx = createMockCtx();

        // With secret prefix: "/" and SPA routes return 404 without touching D1
        const prefixedEnv = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/my-secret',
            ASSETS: emptyAssets,
        };
        const root404 = await worker.fetch(
            new Request('https://example.workers.dev/'),
            prefixedEnv,
            ctx,
        );
        expect(root404.status).to.equal(404);
        expect(db.tableCreated).to.equal(false);

        // Without secret prefix: "/" falls through to backend getEnv handler
        const rootEnv = {
            SUB_STORE_DB: db,
            SUB_STORE_FRONTEND_BACKEND_PATH: '/',
            ASSETS: emptyAssets,
        };
        const rootRes = await worker.fetch(
            new Request('https://example.workers.dev/'),
            rootEnv,
            ctx,
        );
        await ctx.drain();
        expect(rootRes.status).to.equal(200);
        const body = await rootRes.json();
        expect(body.data.backend).to.equal('Cloudflare Workers');
        expect(db.tableCreated).to.equal(true);
    });
});
