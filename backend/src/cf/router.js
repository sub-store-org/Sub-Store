import {
    getCorsHeaders,
    isOriginAllowed,
    NODE_CORS_ALLOWED_ORIGINS_ENV,
    resolveCorsPolicy,
} from '@/utils/cors';
import { getCFEnvVar } from '@/cf/env';

const DEFAULT_CF_HEADERS = {
    'Content-Type': 'text/plain;charset=UTF-8',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS,PATCH,PUT,DELETE',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept',
    'X-Powered-By': 'Sub-Store',
};

const METHODS_NAMES = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'OPTIONS',
    'HEAD',
    'ALL',
];

function normalizeHeaderValue(name, value) {
    if (typeof value !== 'string') return value;
    if (name.toLowerCase() === 'profile-web-page-url') {
        try {
            return new URL(value).href;
        } catch {
            return value;
        }
    }
    return value;
}

function parseQueryParams(searchParams) {
    const query = {};
    for (const [key, value] of searchParams.entries()) {
        if (Object.prototype.hasOwnProperty.call(query, key)) {
            if (Array.isArray(query[key])) {
                query[key].push(value);
            } else {
                query[key] = [query[key], value];
            }
        } else {
            query[key] = value;
        }
    }
    return query;
}

function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function matchRoutePattern(pattern, path) {
    if (pattern === '*') {
        return { matched: true, params: {} };
    }
    if (pattern instanceof RegExp) {
        const match = pattern.exec(path);
        return match ? { matched: true, params: {} } : { matched: false };
    }
    if (typeof pattern !== 'string') {
        return { matched: false };
    }

    const normalizedPattern =
        pattern.length > 1 ? pattern.replace(/\/+$/, '') : pattern;
    const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;

    if (normalizedPattern === normalizedPath && !normalizedPattern.includes(':')) {
        return { matched: true, params: {} };
    }

    const patternSegments = normalizedPattern.split('/');
    const pathSegments = normalizedPath.split('/');

    if (patternSegments.length !== pathSegments.length) {
        return { matched: false };
    }

    const params = {};
    for (let i = 0; i < patternSegments.length; i++) {
        const pat = patternSegments[i];
        const seg = pathSegments[i];
        if (pat.startsWith(':')) {
            const key = pat.slice(1);
            if (!seg) return { matched: false };
            params[key] = safeDecodeURIComponent(seg);
        } else if (pat !== seg) {
            return { matched: false };
        }
    }

    return { matched: true, params };
}

async function parseRequestBody(request, headers) {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
        return { body: undefined, rawBody: undefined };
    }

    const contentType = headers['content-type'] || '';
    const rawBody = await request.text();
    if (!rawBody) {
        return { body: {}, rawBody: '' };
    }

    if (/json/i.test(contentType)) {
        try {
            return { body: JSON.parse(rawBody), rawBody };
        } catch (err) {
            const parseError = new Error(`Invalid JSON body: ${err.message}`);
            parseError.statusCode = 400;
            throw parseError;
        }
    }

    if (/application\/x-www-form-urlencoded/i.test(contentType)) {
        const params = new URLSearchParams(rawBody);
        return { body: parseQueryParams(params), rawBody };
    }

    return { body: rawBody, rawBody };
}

export function createCFRouter({ substore: $, defaultHeaders = {} }) {
    const middlewares = [];
    const routes = [];

    const app = {
        use(fn) {
            if (typeof fn === 'function') {
                middlewares.push(fn);
            }
            return app;
        },
        route(pattern) {
            const chainApp = {};
            METHODS_NAMES.forEach((method) => {
                chainApp[method.toLowerCase()] = (callback) => {
                    routes.push({ method, pattern, callback });
                    return chainApp;
                };
            });
            return chainApp;
        },
        start() {
            // No-op in CF Workers; requests are dispatched via handleRequest().
        },
    };

    METHODS_NAMES.forEach((method) => {
        app[method.toLowerCase()] = (pattern, callback) => {
            routes.push({ method, pattern, callback });
            return app;
        };
    });

    app.handleRequest = async (request) => {
        const corsPolicy = resolveCorsPolicy({
            isNode: true,
            envValue: getCFEnvVar(NODE_CORS_ALLOWED_ORIGINS_ENV),
            customBackendName: getCFEnvVar('SUB_STORE_BACKEND_CUSTOM_NAME'),
        });
        const headersObj = {};
        request.headers.forEach((value, key) => {
            headersObj[key.toLowerCase()] = value;
        });

        const method = request.method.toUpperCase();
        const origin = headersObj.origin;
        const corsAllowed = isOriginAllowed(corsPolicy, origin);
        const corsHeaders = corsAllowed
            ? getCorsHeaders(corsPolicy, origin)
            : {};

        const baseHeaders = {
            ...defaultHeaders,
            'X-Powered-By':
                getCFEnvVar('SUB_STORE_X_POWERED_BY') ||
                defaultHeaders['X-Powered-By'] ||
                'Sub-Store',
            ...corsHeaders,
        };

        if (!corsAllowed) {
            return new Response('CORS origin not allowed', {
                status: 403,
                headers: baseHeaders,
            });
        }

        if (Boolean(origin) && method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: baseHeaders,
            });
        }

        const parsedUrl = new URL(request.url);
        let parsedBody;
        try {
            parsedBody = await parseRequestBody(request, headersObj);
        } catch (err) {
            return new Response(
                JSON.stringify({
                    status: 'failed',
                    message: err.message,
                }),
                {
                    status: err.statusCode || 400,
                    headers: {
                        ...baseHeaders,
                        'Content-Type': 'application/json;charset=UTF-8',
                    },
                },
            );
        }

        const req = {
            method,
            url: `${parsedUrl.pathname}${parsedUrl.search}`,
            originalUrl: `${parsedUrl.pathname}${parsedUrl.search}`,
            path: parsedUrl.pathname,
            _parsedUrl: { pathname: parsedUrl.pathname },
            query: parseQueryParams(parsedUrl.searchParams),
            params: {},
            headers: headersObj,
            body: parsedBody.body,
            rawBody: parsedBody.rawBody,
            socket: {
                remoteAddress:
                    headersObj['cf-connecting-ip'] ||
                    headersObj['x-forwarded-for'] ||
                    undefined,
            },
            route: null,
        };

        // Sync req.path and req.query if middleware rewrites req.url
        const syncUrlFields = () => {
            try {
                const updated = new URL(req.url, parsedUrl.origin);
                req.path = updated.pathname;
                req._parsedUrl = { pathname: updated.pathname };
                // Preserve any programmatic query mutations (like req.query.share = 'true')
                for (const [k, v] of updated.searchParams.entries()) {
                    if (!(k in req.query)) {
                        req.query[k] = v;
                    }
                }
            } catch {
                // ignore malformed rewrite
            }
        };

        let responseResolved = false;
        let finalResponse = null;
        let resolveResponse;
        const responsePromise = new Promise((resolve) => {
            resolveResponse = resolve;
        });

        const resHeaders = new Headers();
        for (const [k, v] of Object.entries(baseHeaders)) {
            if (v != null) {
                try {
                    resHeaders.set(k, String(v));
                } catch {
                    // ignore invalid header
                }
            }
        }

        let statusCode = 200;

        const finishResponse = (body = '') => {
            if (responseResolved) return;
            responseResolved = true;
            const noBodyStatus = [204, 205, 304].includes(statusCode);
            finalResponse = new Response(noBodyStatus ? null : body, {
                status: statusCode,
                headers: resHeaders,
            });
            resolveResponse(finalResponse);
        };

        const res = {
            req,
            status(code) {
                statusCode = code;
                return this;
            },
            set(key, val) {
                if (key && typeof key === 'object') {
                    for (const [k, v] of Object.entries(key)) {
                        this.setHeader(k, v);
                    }
                    return this;
                }
                this.setHeader(key, val);
                return this;
            },
            setHeader(name, value) {
                try {
                    if (Array.isArray(value)) {
                        resHeaders.delete(name);
                        for (const item of value) {
                            resHeaders.append(
                                name,
                                String(normalizeHeaderValue(name, item)),
                            );
                        }
                    } else if (value != null) {
                        resHeaders.set(
                            name,
                            String(normalizeHeaderValue(name, value)),
                        );
                    }
                } catch {
                    $.warn?.(`Invalid header ignored\n${name}: ${value}`);
                }
                return this;
            },
            removeHeader(name) {
                resHeaders.delete(name);
                return this;
            },
            send(body = '') {
                if (
                    body !== null &&
                    typeof body === 'object' &&
                    !(body instanceof Uint8Array) &&
                    !(body instanceof ArrayBuffer)
                ) {
                    return this.json(body);
                }
                finishResponse(body);
                return this;
            },
            json(data) {
                this.set('Content-Type', 'application/json;charset=UTF-8');
                finishResponse(JSON.stringify(data));
                return this;
            },
            html(data) {
                this.set('Content-Type', 'text/html;charset=UTF-8');
                finishResponse(data);
                return this;
            },
            end(body = '') {
                finishResponse(body);
                return this;
            },
        };

        try {
            // Run registered middlewares sequentially
            for (const mw of middlewares) {
                if (responseResolved) return finalResponse;
                let nextCalled = false;
                await new Promise((resolve, reject) => {
                    const next = (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        nextCalled = true;
                        syncUrlFields();
                        resolve();
                    };
                    try {
                        const result = mw(req, res, next);
                        if (result && typeof result.then === 'function') {
                            result.then(
                                () => {
                                    if (!nextCalled && responseResolved) {
                                        resolve();
                                    }
                                },
                                (err) => reject(err),
                            );
                        } else if (responseResolved) {
                            resolve();
                        }
                    } catch (err) {
                        reject(err);
                    }
                });
                if (responseResolved) return finalResponse;
                if (!nextCalled) break;
            }

            if (responseResolved) return finalResponse;

            // Dispatch matching route handlers in registration order
            let routeIndex = 0;
            const dispatchNext = async () => {
                while (routeIndex < routes.length) {
                    const candidate = routes[routeIndex++];
                    if (
                        candidate.method !== 'ALL' &&
                        candidate.method !== method
                    ) {
                        continue;
                    }
                    const match = matchRoutePattern(candidate.pattern, req.path);
                    if (!match.matched) {
                        continue;
                    }

                    req.params = match.params;
                    req.route = { path: candidate.pattern };

                    let calledNext = false;
                    await candidate.callback(req, res, () => {
                        calledNext = true;
                    });
                    if (responseResolved) return;
                    if (!calledNext) return;
                }
            };

            await dispatchNext();

            if (!responseResolved) {
                res.status(404).json({
                    status: 'failed',
                    message: 'ERROR: 404 not found',
                });
            }
            return await responsePromise;
        } catch (err) {
            $.error?.(
                `[CF Worker] Unhandled route error: ${err?.stack ?? err}`,
            );
            if (!responseResolved) {
                res.status(500).json({
                    status: 'failed',
                    message: `Internal Server Error: ${err?.message ?? err}`,
                });
            }
            return await responsePromise;
        }
    };

    return app;
}

export default function express({ substore: $ }) {
    return createCFRouter({
        substore: $,
        defaultHeaders: DEFAULT_CF_HEADERS,
    });
}

