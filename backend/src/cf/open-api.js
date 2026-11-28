import { Base64 } from 'js-base64';
import { installConsoleLogCapture } from '@/utils/debug-logs';
import { getCFEnvVar, waitUntilCF } from '@/cf/env';

function normalizeRequestHeaders(headers) {
    const normalized = [];
    let hasAccept = false;

    for (const [key, value] of Object.entries(headers || {})) {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey === 'accept') {
            hasAccept = true;
            if (value == null) continue;
        }
        normalized.push([normalizedKey, value]);
    }

    if (!hasAccept) {
        normalized.push(['accept', '*/*']);
    }

    return Object.fromEntries(normalized);
}

export function ENV() {
    return {
        isQX: false,
        isLoon: false,
        isSurge: false,
        isNode: false,
        isServer: true,
        supportsShareToken: true,
        isStash: false,
        isShadowRocket: false,
        isEgern: false,
        isLanceX: false,
        isGUIforCores: false,
        isSubsCheckPro: false,
    };
}

export class OpenAPI {
    constructor(name = 'untitled', debug = false) {
        this.name = name;
        this.debug = debug;
        this.http = HTTP();
        this.env = ENV();
        this.node = null;
        this.cache = {};
        this.root = {};

        installConsoleLogCapture(this);

        const delay = (t, v) =>
            new Promise((resolve) => {
                setTimeout(resolve.bind(null, v), t);
            });

        Promise.prototype.delay = async function (t) {
            const v = await this;
            return await delay(t, v);
        };
    }

    initCache() {
        this.cache = {};
        this.root = {};
    }

    persistCache() {
        if (typeof this._onPersistAll === 'function') {
            this._onPersistAll();
        }
    }

    write(data, key) {
        this.log(`SET ${key}`);
        if (key.indexOf('#') !== -1) {
            const rootKey = key.substr(1);
            this.root[rootKey] = data;
            if (typeof this._onWrite === 'function') {
                this._onWrite('root', rootKey);
            }
            return;
        }
        this.cache[key] = data;
        if (typeof this._onWrite === 'function') {
            this._onWrite('cache', key);
        }
    }

    read(key) {
        this.log(`READ ${key}`);
        if (key.indexOf('#') !== -1) {
            return this.root[key.substr(1)];
        }
        return this.cache[key];
    }

    delete(key) {
        this.log(`DELETE ${key}`);
        if (key.indexOf('#') !== -1) {
            const rootKey = key.substr(1);
            delete this.root[rootKey];
            if (typeof this._onDelete === 'function') {
                this._onDelete('root', rootKey);
            }
            return;
        }
        delete this.cache[key];
        if (typeof this._onDelete === 'function') {
            this._onDelete('cache', key);
        }
    }

    notify(title, subtitle = '', content = '', options = {}) {
        const openURL = options['open-url'];
        const mediaURL = options['media-url'];
        const content_ =
            content +
            (openURL ? `\n点击跳转: ${openURL}` : '') +
            (mediaURL ? `\n多媒体: ${mediaURL}` : '');
        console.log(`[Notify] ${title}\n${subtitle}\n${content_}\n\n`);

        const push = getCFEnvVar('SUB_STORE_PUSH_SERVICE');
        if (push && /^https?:\/\//.test(push)) {
            const url = push
                .replace('[推送标题]', encodeURIComponent(title || 'Sub-Store'))
                .replace(
                    '[推送内容]',
                    encodeURIComponent(
                        [subtitle, content_].map((i) => i).join('\n'),
                    ),
                );
            const task = HTTP()
                .get({ url })
                .then((resp) => {
                    console.log(
                        `[Push Service] URL: ${url}\nRES: ${resp.statusCode} ${resp.body}`,
                    );
                })
                .catch((e) => {
                    console.log(`[Push Service] URL: ${url}\nERROR: ${e}`);
                });
            waitUntilCF(task);
        }
    }

    log(msg) {
        if (this.debug) console.log(`[${this.name}] LOG: ${msg}`);
    }

    info(msg) {
        console.log(`[${this.name}] INFO: ${msg}`);
    }

    warn(msg) {
        console.log(`[${this.name}] WARN: ${msg}`);
    }

    error(msg) {
        console.log(`[${this.name}] ERROR: ${msg}`);
    }

    wait(millisec) {
        return new Promise((resolve) => setTimeout(resolve, millisec));
    }

    done() {}
}

export function HTTP(defaultOptions = { baseURL: '' }) {
    const methods = [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'HEAD',
        'OPTIONS',
        'PATCH',
    ];
    const URL_REGEX =
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

    let requestIdCounter = 0;

    function generateRequestId() {
        return `${Date.now()}-${++requestIdCounter}`;
    }

    async function send(method, options) {
        options = typeof options === 'string' ? { url: options } : options;
        const baseURL = defaultOptions.baseURL;
        if (baseURL && !URL_REGEX.test(options.url || '')) {
            options.url = baseURL ? baseURL + options.url : options.url;
        }
        options = { ...defaultOptions, ...options };
        const timeout = options.timeout;
        const requestId = options.requestId || generateRequestId();
        const events = {
            onRequest: () => {},
            onResponse: (resp) => resp,
            onTimeout: () => {},
            ...options.events,
        };

        events.onRequest(method, options);

        const worker = (async () => {
            const requestMethod = method.toUpperCase();
            const fetchHeaders = new Headers();
            const rawHeaders = normalizeRequestHeaders(options.headers);
            for (const [k, v] of Object.entries(rawHeaders)) {
                if (v != null) {
                    fetchHeaders.set(k, String(v));
                }
            }

            const parsedUrl = new URL(options.url);
            if (parsedUrl.username || parsedUrl.password) {
                if (!fetchHeaders.has('authorization')) {
                    fetchHeaders.set(
                        'authorization',
                        `Basic ${Base64.encode(
                            `${decodeURIComponent(
                                parsedUrl.username,
                            )}:${decodeURIComponent(parsedUrl.password)}`,
                        )}`,
                    );
                }
                parsedUrl.username = '';
                parsedUrl.password = '';
            }

            const controller =
                typeof AbortController !== 'undefined'
                    ? new AbortController()
                    : null;
            const reqTimeout = Number(options.timeout) || 8000;
            const abortTimer =
                controller && reqTimeout > 0
                    ? setTimeout(() => controller.abort(), reqTimeout)
                    : null;

            try {
                const init = {
                    method: requestMethod,
                    headers: fetchHeaders,
                    redirect: 'follow',
                    ...(controller ? { signal: controller.signal } : {}),
                };
                if (
                    options.body != null &&
                    requestMethod !== 'GET' &&
                    requestMethod !== 'HEAD'
                ) {
                    init.body = options.body;
                }

                const response = await fetch(parsedUrl.toString(), init);
                const responseHeaders = {};
                response.headers.forEach((value, key) => {
                    responseHeaders[key.toLowerCase()] = value;
                });
                const responseBody =
                    options.encoding === null
                        ? await response.arrayBuffer()
                        : await response.text();

                return {
                    statusCode: response.status,
                    headers: responseHeaders,
                    body: responseBody,
                    requestId,
                };
            } finally {
                if (abortTimer !== null) {
                    clearTimeout(abortTimer);
                }
            }
        })();

        return new Promise((resolve, reject) => {
            let settled = false;
            let settling = false;
            let timeoutid = null;

            const cleanup = () => {
                if (timeoutid !== null) {
                    clearTimeout(timeoutid);
                    timeoutid = null;
                }
            };

            const resolveOnce = async (value) => {
                if (settled || settling) return;
                settling = true;

                try {
                    await Promise.resolve(events.onResponse(value));
                    if (settled) return;
                    settled = true;
                    cleanup();
                    resolve({ ...value, requestId });
                } catch (error) {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(error);
                }
            };

            const rejectOnce = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };

            worker.then(resolveOnce, rejectOnce);

            if (timeout) {
                timeoutid = setTimeout(() => {
                    if (settled) return;
                    try {
                        events.onTimeout();
                    } catch {
                        // ignore timeout hook error
                    }
                    rejectOnce(
                        new Error(
                            `${method} URL: ${options.url} exceeds the timeout ${timeout} ms`,
                        ),
                    );
                }, timeout);
            }
        });
    }

    const http = {
        request: (options) => send(options.method || 'GET', options),
    };
    methods.forEach((method) => {
        http[method.toLowerCase()] = (options) => send(method, options);
    });
    return http;
}
