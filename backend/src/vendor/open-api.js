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

export class OpenAPI {
    constructor(name = 'untitled', debug = false) {
        this.name = name;
        this.debug = debug;

        this.http = HTTP();
        this.env = ENV();

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
        if (isLoon || isSurge)
            this.cache = JSON.parse($persistentStore.read(this.name) || '{}');
        if (isGUIforCores)
            this.cache = JSON.parse(
                $Plugins.SubStoreCache.get(this.name) || '{}',
            );
        if (isNode) {
            // create a json for root cache
            const basePath =
                eval('process.env.SUB_STORE_DATA_BASE_PATH') || '.';
            let rootPath = `${basePath}/root.json`;

            this.log(`Root path: ${rootPath}`);
            if (!this.node.fs.existsSync(rootPath)) {
                this.node.fs.writeFileSync(rootPath, JSON.stringify({}), {
                    flag: 'wx',
                });
                this.root = {};
            } else {
                this.root = JSON.parse(
                    this.node.fs.readFileSync(`${rootPath}`),
                );
            }

            // create a json file with the given name if not exists
            let fpath = `${basePath}/${this.name}.json`;
            this.log(`Data path: ${fpath}`);
            if (!this.node.fs.existsSync(fpath)) {
                this.node.fs.writeFileSync(fpath, JSON.stringify({}), {
                    flag: 'wx',
                });
                this.cache = {};
            } else {
                this.cache = JSON.parse(this.node.fs.readFileSync(`${fpath}`));
            }
        }
    }

    // store cache
    persistCache() {
        const data = JSON.stringify(this.cache, null, 2);
        if (isQX) $prefs.setValueForKey(data, this.name);
        if (isLoon || isSurge) $persistentStore.write(data, this.name);
        if (isGUIforCores) $Plugins.SubStoreCache.set(this.name, data);
        if (isNode) {
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
            if (isQX) {
                return $prefs.setValueForKey(data, key);
            }
            if (isNode) {
                this.root[key] = data;
            }
            if (isGUIforCores) {
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
            if (isQX) {
                return $prefs.valueForKey(key);
            }
            if (isNode) {
                return this.root[key];
            }
            if (isGUIforCores) {
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
            if (isQX) {
                return $prefs.removeValueForKey(key);
            }
            if (isNode) {
                delete this.root[key];
            }
            if (isGUIforCores) {
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
        if (isSurge) {
            $notification.post(
                title,
                subtitle,
                content + `${mediaURL ? '\n多媒体:' + mediaURL : ''}`,
                {
                    url: openURL,
                },
            );
        }
        if (isLoon) {
            let opts = {};
            if (openURL) opts['openUrl'] = openURL;
            if (mediaURL) opts['mediaUrl'] = mediaURL;
            if (JSON.stringify(opts) === '{}') {
                $notification.post(title, subtitle, content);
            } else {
                $notification.post(title, subtitle, content, opts);
            }
        }
        if (isNode) {
            const content_ =
                content +
                (openURL ? `\n点击跳转: ${openURL}` : '') +
                (mediaURL ? `\n多媒体: ${mediaURL}` : '');
            console.log(`${title}\n${subtitle}\n${content_}\n\n`);

            let push = eval('process.env.SUB_STORE_PUSH_SERVICE');
            if (push) {
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
                        console.log(`[Push Service] URL: ${url}\nERROR: ${e}`);
                    });
            }
        }
        if (isGUIforCores) {
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
            worker = new Promise((resolve, reject) => {
                const request = isNode
                    ? eval("require('request')")
                    : $httpClient;
                const body = options.body;
                const opts = JSON.parse(JSON.stringify(options));
                opts.body = body;

                if (!isNode && opts.timeout) {
                    opts.timeout++;
                    let unit = 'ms';
                    // 这些客户端单位为 s
                    if (isSurge || isStash || isShadowRocket) {
                        opts.timeout = Math.ceil(opts.timeout / 1000);
                        unit = 's';
                    }
                    // Loon 为 ms
                    // console.log(`[httpClient timeout] ${opts.timeout}${unit}`);
                }
                request[method.toLowerCase()](opts, (err, response, body) => {
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
                            statusCode: response.status || response.statusCode,
                            headers: response.headers,
                            body,
                        });
                });
            });
        } else if (isGUIforCores) {
            worker = new Promise(async (resolve, reject) => {
                try {
                    const response = await $Plugins.Requests({
                        method,
                        url: options.url,
                        headers: options.headers,
                        body: options.body,
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
