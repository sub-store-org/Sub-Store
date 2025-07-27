/* eslint-disable no-undef */
import { ENV } from './open-api';

export default function express({ substore: $, port, host }) {
    const { isNode } = ENV();
    const DEFAULT_HEADERS = {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,GET,OPTIONS,PATCH,PUT,DELETE',
        'Access-Control-Allow-Headers':
            'Origin, X-Requested-With, Content-Type, Accept',
        'X-Powered-By': 'Sub-Store',
    };

    // node support
    if (isNode) {
        const express_ = eval(`require("express")`);
        const bodyParser = eval(`require("body-parser")`);
        const app = express_();
        const limit = eval('process.env.SUB_STORE_BODY_JSON_LIMIT') || '1mb';
        $.info(`[BACKEND] body JSON limit: ${limit}`);
        app.use(
            bodyParser.json({
                verify: rawBodySaver,
                limit,
            }),
        );
        app.use(
            bodyParser.urlencoded({ verify: rawBodySaver, extended: true }),
        );
        app.use(bodyParser.raw({ verify: rawBodySaver, type: '*/*' }));
        app.use((_, res, next) => {
            res.set(DEFAULT_HEADERS);
            next();
        });

        // adapter
        app.start = () => {
            app.get('*', function (req, res) {
                res.status(404).end();
            });
            const listener = app.listen(port, host, () => {
                const { address, port } = listener.address();
                $.info(`[BACKEND] listening on ${address}:${port}`);
            });
        };
        return app;
    }

    // route handlers
    const handlers = [];

    // http methods
    const METHODS_NAMES = [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'PATCH',
        'OPTIONS',
        "HEAD'",
        'ALL',
    ];

    // dispatch url to route
    const dispatch = (request, start = 0) => {
        let { method, url, headers, body } = request;
        headers = formatHeaders(headers);
        if (/json/i.test(headers['content-type'])) {
            body = JSON.parse(body);
        }

        method = method.toUpperCase();
        const { path, query } = extractURL(url);

        // pattern match
        let handler = null;
        let i;
        let longestMatchedPattern = 0;
        for (i = start; i < handlers.length; i++) {
            if (handlers[i].method === 'ALL' || method === handlers[i].method) {
                const { pattern } = handlers[i];
                if (patternMatched(pattern, path)) {
                    if (pattern.split('/').length > longestMatchedPattern) {
                        handler = handlers[i];
                        longestMatchedPattern = pattern.split('/').length;
                    }
                }
            }
        }
        if (handler) {
            // dispatch to next handler
            const next = () => {
                dispatch(method, url, i);
            };
            const req = {
                method,
                url,
                path,
                query,
                params: extractPathParams(handler.pattern, path),
                headers,
                body,
            };
            const res = Response();
            const cb = handler.callback;

            const errFunc = (err) => {
                res.status(500).json({
                    status: 'failed',
                    message: `Internal Server Error: ${err}`,
                });
            };

            if (cb.constructor.name === 'AsyncFunction') {
                cb(req, res, next).catch(errFunc);
            } else {
                try {
                    cb(req, res, next);
                } catch (err) {
                    errFunc(err);
                }
            }
        } else {
            // no route, return 404
            const res = Response();
            res.status(404).json({
                status: 'failed',
                message: 'ERROR: 404 not found',
            });
        }
    };

    const app = {};

    // attach http methods
    METHODS_NAMES.forEach((method) => {
        app[method.toLowerCase()] = (pattern, callback) => {
            // add handler
            handlers.push({ method, pattern, callback });
        };
    });

    // chainable route
    app.route = (pattern) => {
        const chainApp = {};
        METHODS_NAMES.forEach((method) => {
            chainApp[method.toLowerCase()] = (callback) => {
                // add handler
                handlers.push({ method, pattern, callback });
                return chainApp;
            };
        });
        return chainApp;
    };

    // start service
    app.start = () => {
        dispatch($request);
    };

    return app;

    /************************************************
     Utility Functions
     *************************************************/
    function rawBodySaver(req, res, buf, encoding) {
        if (buf && buf.length) {
            req.rawBody = buf.toString(encoding || 'utf8');
        }
    }

    function Response() {
        let statusCode = 200;
        const { isQX, isLoon, isSurge, isGUIforCores } = ENV();
        const headers = DEFAULT_HEADERS;
        const STATUS_CODE_MAP = {
            200: 'HTTP/1.1 200 OK',
            201: 'HTTP/1.1 201 Created',
            302: 'HTTP/1.1 302 Found',
            307: 'HTTP/1.1 307 Temporary Redirect',
            308: 'HTTP/1.1 308 Permanent Redirect',
            404: 'HTTP/1.1 404 Not Found',
            500: 'HTTP/1.1 500 Internal Server Error',
        };
        return new (class {
            status(code) {
                statusCode = code;
                return this;
            }

            send(body = '') {
                const response = {
                    status: isQX ? STATUS_CODE_MAP[statusCode] : statusCode,
                    body,
                    headers,
                };
                if (isQX || isGUIforCores) {
                    $done(response);
                } else if (isLoon || isSurge) {
                    $done({
                        response,
                    });
                }
            }

            end() {
                this.send();
            }

            html(data) {
                this.set('Content-Type', 'text/html;charset=UTF-8');
                this.send(data);
            }

            json(data) {
                this.set('Content-Type', 'application/json;charset=UTF-8');
                this.send(JSON.stringify(data));
            }

            set(key, val) {
                headers[key] = val;
                return this;
            }
        })();
    }
}

function formatHeaders(headers) {
    const result = {};
    for (const k of Object.keys(headers)) {
        result[k.toLowerCase()] = headers[k];
    }
    return result;
}

function patternMatched(pattern, path) {
    if (pattern instanceof RegExp && pattern.test(path)) {
        return true;
    } else {
        // root pattern, match all
        if (pattern === '/') return true;
        // normal string pattern
        if (pattern.indexOf(':') === -1) {
            const spath = path.split('/');
            const spattern = pattern.split('/');
            for (let i = 0; i < spattern.length; i++) {
                if (spath[i] !== spattern[i]) {
                    return false;
                }
            }
            return true;
        } else if (extractPathParams(pattern, path)) {
            // string pattern with path parameters
            return true;
        }
    }
    return false;
}

function extractURL(url) {
    // extract path
    const match = url.match(/https?:\/\/[^/]+(\/[^?]*)/) || [];
    const path = match[1] || '/';

    // extract query string
    const split = url.indexOf('?');
    const query = {};
    if (split !== -1) {
        let hashes = url.slice(url.indexOf('?') + 1).split('&');
        for (let i = 0; i < hashes.length; i++) {
            const hash = hashes[i].split('=');
            query[hash[0]] = decodeURIComponent(hash[1]);
        }
    }
    return {
        path,
        query,
    };
}

function extractPathParams(pattern, path) {
    if (pattern.indexOf(':') === -1) {
        return null;
    } else {
        const params = {};
        for (let i = 0, j = 0; i < pattern.length; i++, j++) {
            if (pattern[i] === ':') {
                let key = [];
                let val = [];
                while (pattern[++i] !== '/' && i < pattern.length) {
                    key.push(pattern[i]);
                }
                while (path[j] !== '/' && j < path.length) {
                    val.push(path[j++]);
                }
                params[key.join('')] = decodeURIComponent(val.join(''));
            } else {
                if (pattern[i] !== path[j]) {
                    return null;
                }
            }
        }
        return params;
    }
}
