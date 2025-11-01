/* eslint-disable no-undef */
const isQX = typeof $task !== 'undefined';
const isLoon = typeof $loon !== 'undefined';
const isSurge = typeof $httpClient !== 'undefined' && !isLoon;
const isNode = eval(`typeof process !== "undefined"`); // eval is needed in order to avoid browserify processing
const isStash =
    'undefined' !== typeof $environment && $environment['stash-version'];
const isShadowRocket = 'undefined' !== typeof $rocket;
const isEgern = 'object' == typeof egern;
const isLanceX = 'undefined' != typeof $native;
const isGUIforCores = typeof $Plugins !== 'undefined';
import { Base64 } from 'js-base64';

function isPlainObject(obj) {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        [null, Object.prototype].includes(Object.getPrototypeOf(obj))
    );
}

function parseSocks5Uri(uri) {
    // eslint-disable-next-line no-unused-vars
    let [__, username, password, server, port, query, name] = uri.match(
        /^socks5:\/\/(?:(.*?):(.*?)@)?(.*?)(?::(\d+?))?(\?.*?)?(?:#(.*?))?$/,
    );
    if (port) {
        port = parseInt(port, 10);
    } else {
        $.error(`port is not present in line: ${uri}`);
        throw new Error(`port is not present in line: ${uri}`);
    }
    return {
        type: 5,
        host: server,
        port,

        userId: username != null ? decodeURIComponent(username) : undefined,
        password: password != null ? decodeURIComponent(password) : undefined,
    };
}
export class OpenAPI {
    constructor(name = 'untitled', debug = false) {
        this.name = name;
        this.debug = debug;

        this.http = HTTP();
        this.env = ENV();

        const isNode = this.env.isNode && Object.values(this.env).filter((a) => a).length == 1;

        if (isNode) {
            const dotenv = eval(`require("dotenv")`);
            dotenv.config();
        }

        this.node = (() => {
            if (isNode) {
                const fs = eval("require('fs')");

                return {
                    fs,
                };
            } else {
                return null;
            }
        })();
        this.initCache();

        const delay = (t, v) =>
            new Promise(function (resolve) {
                setTimeout(resolve.bind(null, v), t);
            });

        Promise.prototype.delay = async function (t) {
            const v = await this;
            return await delay(t, v);
        };
    }

    // persistence
    // initialize cache
    initCache() {
        if (isQX)
            this.cache = JSON.parse($prefs.valueForKey(this.name) || '{}');
        else if (isLoon || isSurge)
            this.cache = JSON.parse($persistentStore.read(this.name) || '{}');
        else if (isGUIforCores)
            this.cache = JSON.parse(
                $Plugins.SubStoreCache.get(this.name) || '{}',
            );
        else if (isNode) {
            // create a json for root cache
            const basePath =
                eval('process.env.SUB_STORE_DATA_BASE_PATH') || '.';
            let rootPath = `${basePath}/root.json`;
            const backupRootPath = `${basePath}/root_${Date.now()}.json`;

            this.log(`Root path: ${rootPath}`);
            if (this.node.fs.existsSync(rootPath)) {
                try {
                    this.root = JSON.parse(
                        this.node.fs.readFileSync(`${rootPath}`),
                    );
                } catch (e) {
                    this.node.fs.copyFileSync(rootPath, backupRootPath);
                    this.error(
                        `Failed to parse ${rootPath}: ${e.message}. Backup created at ${backupRootPath}`,
                    );
                }
            }
            if (!isPlainObject(this.root)) {
                this.node.fs.writeFileSync(rootPath, JSON.stringify({}), {
                    flag: 'w',
                });
                this.root = {};
            }

            // create a json file with the given name if not exists
            let fpath = `${basePath}/${this.name}.json`;
            const backupPath = `${basePath}/${this.name}_${Date.now()}.json`;

            this.log(`Data path: ${fpath}`);
            if (this.node.fs.existsSync(fpath)) {
                try {
                    this.cache = JSON.parse(
                        this.node.fs.readFileSync(`${fpath}`, 'utf-8'),
                    );
                    if (!isPlainObject(this.cache))
                        throw new Error('Invalid Data');
                } catch (e) {
                    try {
                        const str = Base64.decode(
                            this.node.fs.readFileSync(`${fpath}`, 'utf-8'),
                        );
                        this.cache = JSON.parse(str);
                        this.node.fs.writeFileSync(fpath, str, {
                            flag: 'w',
                        });
                        if (!isPlainObject(this.cache))
                            throw new Error('Invalid Data');
                    } catch (e) {
                        this.node.fs.copyFileSync(fpath, backupPath);
                        this.error(
                            `Failed to parse ${fpath}: ${e.message}. Backup created at ${backupPath}`,
                        );
                    }
                }
            }
            if (!isPlainObject(this.cache)) {
                this.node.fs.writeFileSync(fpath, JSON.stringify({}), {
                    flag: 'w',
                });
                this.cache = {};
            }
        }
    }

    // store cache
    persistCache() {
        const data = JSON.stringify(this.cache, null, 2);
        if (isQX) $prefs.setValueForKey(data, this.name);
        else if (isLoon || isSurge) $persistentStore.write(data, this.name);
        else if (isGUIforCores) $Plugins.SubStoreCache.set(this.name, data);
        else if (isNode) {
            const basePath =
                eval('process.env.SUB_STORE_DATA_BASE_PATH') || '.';

            this.node.fs.writeFileSync(
                `${basePath}/${this.name}.json`,
                data,
                { flag: 'w' },
                (err) => console.log(err),
            );
            this.node.fs.writeFileSync(
                `${basePath}/root.json`,
                JSON.stringify(this.root, null, 2),
                { flag: 'w' },
                (err) => console.log(err),
            );
        }
    }

    write(data, key) {
        this.log(`SET ${key}`);
        if (key.indexOf('#') !== -1) {
            key = key.substr(1);
            if (isSurge || isLoon) {
                return $persistentStore.write(data, key);
            }
            else if (isQX) {
                return $prefs.setValueForKey(data, key);
            }
            else if (isNode) {
                this.root[key] = data;
            }
            else if (isGUIforCores) {
                return $Plugins.SubStoreCache.set(key, data);
            }
        } else {
            this.cache[key] = data;
        }
        this.persistCache();
    }

    read(key) {
        this.log(`READ ${key}`);
        if (key.indexOf('#') !== -1) {
            key = key.substr(1);
            if (isSurge || isLoon) {
                return $persistentStore.read(key);
            }
            else if (isQX) {
                return $prefs.valueForKey(key);
            }
            else if (isNode) {
                return this.root[key];
            }
            else if (isGUIforCores) {
                return $Plugins.SubStoreCache.get(key);
            }
        } else {
            return this.cache[key];
        }
    }

    delete(key) {
        this.log(`DELETE ${key}`);
        if (key.indexOf('#') !== -1) {
            key = key.substr(1);
            if (isSurge || isLoon) {
                return $persistentStore.write(null, key);
            }
            else if (isQX) {
                return $prefs.removeValueForKey(key);
            }
            else if (isNode) {
                delete this.root[key];
            }
            else if (isGUIforCores) {
                return $Plugins.SubStoreCache.remove(key);
            }
        } else {
            delete this.cache[key];
        }
        this.persistCache();
    }

    // notification
    notify(title, subtitle = '', content = '', options = {}) {
        const openURL = options['open-url'];
        const mediaURL = options['media-url'];

        if (isQX) $notify(title, subtitle, content, options);
        else if (isSurge) {
            $notification.post(
                title,
                subtitle,
                content + `${mediaURL ? '\n多媒体:' + mediaURL : ''}`,
                {
                    url: openURL,
                },
            );
        }
        else if (isLoon) {
            let opts = {};
            if (openURL) opts['openUrl'] = openURL;
            if (mediaURL) opts['mediaUrl'] = mediaURL;
            if (JSON.stringify(opts) === '{}') {
                $notification.post(title, subtitle, content);
            } else {
                $notification.post(title, subtitle, content, opts);
            }
        }
        else if (isNode) {
            const content_ =
                content +
                (openURL ? `\n点击跳转: ${openURL}` : '') +
                (mediaURL ? `\n多媒体: ${mediaURL}` : '');
            console.log(`${title}\n${subtitle}\n${content_}\n\n`);

            let push = eval('process.env.SUB_STORE_PUSH_SERVICE');
            if (push) {
                if (/^https?:\/\//.test(push)) {
                    // 处理 HTTP/HTTPS URL
                    const url = push
                        .replace(
                            '[推送标题]',
                            encodeURIComponent(title || 'Sub-Store'),
                        )
                        .replace(
                            '[推送内容]',
                            encodeURIComponent(
                                [subtitle, content_].map((i) => i).join('\n'),
                            ),
                        );
                    const $http = HTTP();
                    $http
                        .get({ url })
                        .then((resp) => {
                            console.log(
                                `[Push Service] URL: ${url}\nRES: ${resp.statusCode} ${resp.body}`,
                            );
                        })
                        .catch((e) => {
                            console.log(
                                `[Push Service] URL: ${url}\nERROR: ${e}`,
                            );
                        });
                } else {
                    const { execFile } = eval(`require("child_process")`);
                    execFile(
                        'shoutrrr',
                        [
                            'send',
                            '--url',
                            push,
                            '--message',
                            `${title}\n${subtitle}\n${content_}`,
                        ],
                        (error, stdout, stderr) => {
                            if (error) {
                                console.log(
                                    `[Push Service] URL: ${push}\nERROR: ${error}`,
                                );
                                return;
                            }
                            if (stderr) {
                                console.log(
                                    `[Push Service] URL: ${push}\nstderr: ${stderr}`,
                                );
                            }
                            console.log(
                                `[Push Service] URL: ${push}\nstdout: ${stdout}`,
                            );
                        },
                    );
                }
            }
        }
        else if (isGUIforCores) {
            $Plugins.Notify(title, subtitle + '\n' + content);
        }
    }

    // other helper functions
    log(msg) {
        if (this.debug) console.log(`[${this.name}] LOG: ${msg}`);
    }

    info(msg) {
        console.log(`[${this.name}] INFO: ${msg}`);
    }

    error(msg) {
        console.log(`[${this.name}] ERROR: ${msg}`);
    }

    wait(millisec) {
        return new Promise((resolve) => setTimeout(resolve, millisec));
    }

    done(value = {}) {
        if (isQX || isLoon || isSurge || isGUIforCores) {
            $done(value);
        } else if (isNode) {
            if (typeof $context !== 'undefined') {
                $context.headers = value.headers;
                $context.statusCode = value.statusCode;
                $context.body = value.body;
            }
        }
    }
}

export function ENV() {
    return {
        isQX,
        isLoon,
        isSurge,
        isNode,
        isStash,
        isShadowRocket,
        isEgern,
        isLanceX,
        isGUIforCores,
    };
}

export function HTTP(defaultOptions = { baseURL: '' }) {
    const { isQX, isLoon, isSurge, isNode, isGUIforCores } = ENV();
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

    function send(method, options) {
        options = typeof options === 'string' ? { url: options } : options;
        const baseURL = defaultOptions.baseURL;
        if (baseURL && !URL_REGEX.test(options.url || '')) {
            options.url = baseURL ? baseURL + options.url : options.url;
        }
        options = { ...defaultOptions, ...options };
        const timeout = options.timeout;
        const events = {
            ...{
                onRequest: () => {},
                onResponse: (resp) => resp,
                onTimeout: () => {},
            },
            ...options.events,
        };

        events.onRequest(method, options);

        if (options.node) {
            // Surge & Loon allow connecting to a server using a specified proxy node
            if (isSurge) {
                const build = $environment['surge-build'];
                if (build && parseInt(build) >= 2407) {
                    options['policy-descriptor'] = options.node;
                    delete options.node;
                }
            }
        }

        let worker;
        if (isQX) {
            worker = $task.fetch({
                method,
                url: options.url,
                headers: options.headers,
                body: options.body,
                opts: options.opts,
            });
        } else if (isLoon || isSurge || isNode) {
            worker = new Promise(async (resolve, reject) => {
                const body = options.body;
                const opts = JSON.parse(JSON.stringify(options));
                opts.body = body;
                opts.timeout = opts.timeout || 8000;
                if (opts.timeout) {
                    opts.timeout++;
                    if (isNaN(opts.timeout)) {
                        opts.timeout = 8000;
                    }
                    if (!isNode) {
                        let unit = 'ms';
                        // 这些客户端单位为 s
                        if (isSurge || isStash || isShadowRocket) {
                            opts.timeout = Math.ceil(opts.timeout / 1000);
                            unit = 's';
                        }
                        // Loon 为 ms
                        // console.log(`[httpClient timeout] ${opts.timeout}${unit}`);
                    }
                }
                if (isNode) {
                    const undici = eval("require('undici')");
                    const { socksDispatcher } = eval("require('fetch-socks')");
                    const {
                        ProxyAgent,
                        EnvHttpProxyAgent,
                        request,
                        interceptors,
                    } = undici;
                    const agentOpts = {
                        connect: {
                            rejectUnauthorized:
                                opts.strictSSL === false ||
                                opts.insecure === true
                                    ? false
                                    : true,
                        },
                        bodyTimeout: opts.timeout,
                        headersTimeout: opts.timeout,
                    };
                    try {
                        const url = new URL(opts.url);
                        if (url.username || url.password) {
                            opts.headers = {
                                ...(opts.headers || {}),
                                Authorization: `Basic ${Buffer.from(
                                    `${url.username || ''}:${
                                        url.password || ''
                                    }`,
                                ).toString('base64')}`,
                            };
                        }
                        let dispatcher;
                        if (!opts.proxy) {
                            const allProxy =
                                eval('process.env.all_proxy') ||
                                eval('process.env.ALL_PROXY');
                            if (allProxy && /^socks5:\/\//.test(allProxy)) {
                                opts.proxy = allProxy;
                            }
                        }
                        if (opts.proxy) {
                            if (/^socks5:\/\//.test(opts.proxy)) {
                                dispatcher = socksDispatcher(
                                    parseSocks5Uri(opts.proxy),
                                    agentOpts,
                                );
                            } else {
                                dispatcher = new ProxyAgent({
                                    ...agentOpts,
                                    uri: opts.proxy,
                                });
                            }
                        } else {
                            dispatcher = new EnvHttpProxyAgent(agentOpts);
                        }
                        const response = await request(opts.url, {
                            ...opts,
                            method: method.toUpperCase(),
                            dispatcher: dispatcher.compose(
                                interceptors.redirect({
                                    maxRedirections: 3,
                                    throwOnMaxRedirects: true,
                                }),
                            ),
                        });
                        resolve({
                            statusCode: response.statusCode,
                            headers: response.headers,
                            body:
                                opts.encoding === null
                                    ? await response.body.arrayBuffer()
                                    : await response.body.text(),
                        });
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    $httpClient[method.toLowerCase()](
                        opts,
                        (err, response, body) => {
                            // if (err) {
                            //     console.log(err);
                            // } else {
                            //     console.log({
                            //         statusCode:
                            //             response.status || response.statusCode,
                            //         headers: response.headers,
                            //         body,
                            //     });
                            // }

                            if (err) reject(err);
                            else
                                resolve({
                                    statusCode:
                                        response.status || response.statusCode,
                                    headers: response.headers,
                                    body,
                                });
                        },
                    );
                }
            });
        } else if (isGUIforCores) {
            worker = new Promise(async (resolve, reject) => {
                try {
                    const response = await $Plugins.Requests({
                        method,
                        url: options.url,
                        headers: options.headers,
                        body: options.body,
                        autoTransformBody: false,
                        options: {
                            Proxy: options.proxy,
                            Timeout: options.timeout
                                ? options.timeout / 1000
                                : 15,
                        },
                    });
                    resolve({
                        statusCode: response.status,
                        headers: response.headers,
                        body: response.body,
                    });
                } catch (error) {
                    reject(error);
                }
            });
        }

        let timeoutid;

        const timer = timeout
            ? new Promise((_, reject) => {
                  //   console.log(`[request timeout] ${timeout}ms`);
                  timeoutid = setTimeout(() => {
                      events.onTimeout();
                      return reject(
                          `${method} URL: ${options.url} exceeds the timeout ${timeout} ms`,
                      );
                  }, timeout);
              })
            : null;

        return (
            timer
                ? Promise.race([timer, worker]).then((res) => {
                      if (typeof clearTimeout !== 'undefined') {
                          clearTimeout(timeoutid);
                      }
                      return res;
                  })
                : worker
        ).then((resp) => events.onResponse(resp));
    }

    const http = {};
    methods.forEach(
        (method) =>
            (http[method.toLowerCase()] = (options) => send(method, options)),
    );
    return http;
}
