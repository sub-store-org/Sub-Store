import $ from '@/core/app';
import express from '@/vendor/express';
import migrate from '@/utils/migration';
import resourceCache from '@/utils/resource-cache';
import headersResourceCache from '@/utils/headers-resource-cache';
import scriptResourceCache from '@/utils/script-resource-cache';
import { matchesBackendPath, stripBackendPath } from '@/restful';
import registerSubscriptionRoutes from '@/restful/subscriptions';
import registerCollectionRoutes from '@/restful/collections';
import registerArtifactRoutes from '@/restful/artifacts';
import registerFileRoutes from '@/restful/file';
import registerTokenRoutes, { consumeShareToken } from '@/restful/token';
import registerArchiveRoutes from '@/restful/archives';
import registerModuleRoutes from '@/restful/module';
import registerSyncRoutes, { syncArtifacts } from '@/restful/sync';
import registerDownloadRoutes from '@/restful/download';
import registerSettingRoutes from '@/restful/settings';
import registerPreviewRoutes from '@/restful/preview';
import registerSortingRoutes from '@/restful/sort';
import registerMiscRoutes, { gistBackupAction } from '@/restful/miscs';
import registerNodeInfoRoutes from '@/restful/node-info';
import registerParserRoutes from '@/restful/parser';
import registerLogRoutes from '@/restful/logs';
import registerAgeRoutes from '@/restful/age';
import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    FILES_KEY,
    MODULES_KEY,
    SETTINGS_KEY,
    SUBS_KEY,
    TOKENS_KEY,
} from '@/constants';
import { clearCFContext, getCFEnvVar, setCFContext } from '@/cf/env';
import {
    attachD1Hooks,
    flushToD1,
    hasDirtyCache,
    hasDirtyRoot,
    loadFromD1,
    resetDirtyState,
    resolveD1Database,
    withStoreLock,
} from '@/cf/d1-store';

function registerAllRoutes($app) {
    registerCollectionRoutes($app);
    registerSubscriptionRoutes($app);
    registerDownloadRoutes($app);
    registerPreviewRoutes($app);
    registerSortingRoutes($app);
    registerSettingRoutes($app);
    registerArtifactRoutes($app);
    registerFileRoutes($app);
    registerTokenRoutes($app);
    registerArchiveRoutes($app);
    registerModuleRoutes($app);
    registerSyncRoutes($app);
    registerNodeInfoRoutes($app);
    registerMiscRoutes($app);
    registerParserRoutes($app);
    registerLogRoutes($app);
    registerAgeRoutes($app);
}

let $app = null;

function ensureDefaults() {
    if (!$.read(SETTINGS_KEY)) $.write({}, SETTINGS_KEY);
    if (!$.read(SUBS_KEY)) $.write([], SUBS_KEY);
    if (!$.read(COLLECTIONS_KEY)) $.write([], COLLECTIONS_KEY);
    if (!$.read(ARTIFACTS_KEY)) $.write([], ARTIFACTS_KEY);
    if (!$.read(FILES_KEY)) $.write([], FILES_KEY);
    if (!$.read(MODULES_KEY)) $.write([], MODULES_KEY);
    if (!$.read(TOKENS_KEY)) $.write([], TOKENS_KEY);
}

function reloadResourceCaches() {
    resourceCache.reload();
    headersResourceCache.reload();
    scriptResourceCache.reload();
}

function resolveBackendPath() {
    const raw = (
        getCFEnvVar('SUB_STORE_FRONTEND_BACKEND_PATH') ||
        getCFEnvVar('SUB_STORE_TOKEN') ||
        ''
    ).trim();
    if (!raw || raw === '/') return '/';
    const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withLeadingSlash.replace(/\/+$/, '') || '/';
}

function initApp() {
    if ($app) return $app;

    attachD1Hooks($);
    $app = express({ substore: $ });

    $app.use((req, res, next) => {
        const feBePath = resolveBackendPath();
        const hasPrefix = feBePath !== '/';

        if (hasPrefix) {
            if (matchesBackendPath(req.path, feBePath, true)) {
                req.url = stripBackendPath(req.url, feBePath);
                if (req.url.startsWith('/api/')) {
                    req.query.share = 'true';
                }
                next();
                return;
            }
        }

        if (req.path.startsWith('/share/')) {
            if (!req.query.token) {
                res.status(404).end();
                return;
            }
            if (req.method.toLowerCase() !== 'get') {
                res.status(405).send('Method not allowed');
                return;
            }
            let pathname = '/';
            try {
                pathname = decodeURIComponent(req.path) || '/';
            } catch {
                pathname = req.path || '/';
            }
            const token = consumeShareToken({
                token: req.query.token,
                pathname,
            });
            if (token) {
                req.subStoreShareToken = token;
                next();
                return;
            }
            const settings = $.read(SETTINGS_KEY) || {};
            if (settings?.appearanceSetting?.invalidShareFakeNode) {
                req.query._fakeNode = true;
                req.url = req.url.replace(/\/share\/.*?\//, '/share/sub/');
                next();
                return;
            }
            res.status(404).end();
            return;
        }

        if (hasPrefix) {
            res.status(404).end();
            return;
        }

        if (req.path.startsWith('/api/')) {
            req.query.share = 'true';
        }
        next();
    });

    registerAllRoutes($app);
    // Discard any empty defaults written during cold-start route registration.
    resetDirtyState();

    return $app;
}

async function serveFrontendAsset(request, env) {
    if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
        return null;
    }
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        return null;
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse && assetResponse.status !== 404) {
        return assetResponse;
    }

    const indexUrl = new URL('/index.html', request.url);
    const indexResponse = await env.ASSETS.fetch(
        new Request(indexUrl.toString(), {
            method,
            headers: request.headers,
        }),
    );
    if (indexResponse && indexResponse.status !== 404) {
        return indexResponse;
    }
    return null;
}

export async function handleFetch(request, env, ctx) {
    const app = initApp();

    return withStoreLock(async () => {
        setCFContext(env, ctx);
        try {
            // Fast-path CORS preflight without touching D1.
            if (
                request.method.toUpperCase() === 'OPTIONS' &&
                request.headers.get('origin')
            ) {
                return await app.handleRequest(request);
            }

            const parsedUrl = new URL(request.url);
            const pathname = parsedUrl.pathname;
            const feBePath = resolveBackendPath();
            const isReservedBackendRoute = matchesBackendPath(
                pathname,
                '/',
                false,
            );

            // Fast-path frontend & unmatched paths without touching D1.
            if (feBePath !== '/') {
                const matchesPrefix =
                    pathname === feBePath ||
                    pathname.startsWith(`${feBePath}/`);
                const isShareWithToken =
                    pathname.startsWith('/share/') &&
                    Boolean(parsedUrl.searchParams.get('token'));
                if (!matchesPrefix && !isShareWithToken) {
                    if (!isReservedBackendRoute) {
                        const frontendRes = await serveFrontendAsset(
                            request,
                            env,
                        );
                        if (frontendRes) return frontendRes;
                    }
                    return new Response('', { status: 404 });
                }
            } else if (!isReservedBackendRoute && env?.ASSETS) {
                const frontendRes = await serveFrontendAsset(request, env);
                if (frontendRes) return frontendRes;
            }

            const db = resolveD1Database(env);
            await loadFromD1(db, $);
            reloadResourceCaches();
            migrate();
            ensureDefaults();

            const response = await app.handleRequest(request);

            if (hasDirtyCache()) {
                await flushToD1(db, $);
            } else if (hasDirtyRoot()) {
                const flushPromise = flushToD1(db, $);
                if (ctx && typeof ctx.waitUntil === 'function') {
                    ctx.waitUntil(flushPromise);
                } else {
                    await flushPromise;
                }
            }

            return response;
        } catch (err) {
            $.error(`[CF Worker] Request failed: ${err?.stack ?? err}`);
            return new Response(
                JSON.stringify({
                    status: 'failed',
                    message: err?.message ?? String(err),
                }),
                {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json;charset=UTF-8',
                    },
                },
            );
        } finally {
            clearCFContext();
        }
    });
}

export async function handleScheduled(event, env, ctx) {
    initApp();

    const task = withStoreLock(async () => {
        setCFContext(env, ctx);
        try {
            const db = resolveD1Database(env);
            await loadFromD1(db, $);
            reloadResourceCaches();
            migrate();
            ensureDefaults();

            const rawTasks = getCFEnvVar('SUB_STORE_CF_CRON_TASKS') || 'sync';
            const tasks = rawTasks
                .split(/[\s,]+/)
                .map((item) => item.trim().toLowerCase())
                .filter(Boolean);

            for (const name of tasks) {
                if (name === 'sync') {
                    $.info('[CF CRON] sync artifacts started');
                    await syncArtifacts({ skipCronArtifacts: false });
                    $.info('[CF CRON] sync artifacts finished');
                } else if (name === 'upload') {
                    $.info('[CF CRON] gist backup upload started');
                    await gistBackupAction('upload');
                    $.info('[CF CRON] gist backup upload finished');
                } else if (name === 'download') {
                    $.info('[CF CRON] gist backup download started');
                    await gistBackupAction('download');
                    $.info('[CF CRON] gist backup download finished');
                } else {
                    $.warn(`[CF CRON] unknown task ignored: ${name}`);
                }
            }

            await flushToD1(db, $);
        } catch (err) {
            $.error(`[CF CRON] scheduled job failed: ${err?.stack ?? err}`);
            throw err;
        } finally {
            clearCFContext();
        }
    });

    if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(task);
    }
    return task;
}

export default {
    fetch: handleFetch,
    scheduled: handleScheduled,
};
