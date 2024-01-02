/* eslint-disable no-undef */
const isQX = typeof $task !== 'undefined';
const isLoon = typeof $loon !== 'undefined';
const isSurge = typeof $httpClient !== 'undefined' && !isLoon;
const isNode = eval(`typeof process !== "undefined"`); // eval is needed in order to avoid browserify processing
const isStash =
    'undefined' !== typeof $environment && $environment['stash-version'];
const isShadowRocket = 'undefined' !== typeof $rocket;

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
        if (isQX || isLoon || isSurge) {
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
    return { isQX, isLoon, isSurge, isNode, isStash, isShadowRocket };
}

export function HTTP(defaultOptions = { baseURL: '' }) {
    const { isQX, isLoon, isSurge, isNode } = ENV();
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
            });
        } else if (isLoon || isSurge || isNode) {
            worker = new Promise((resolve, reject) => {
                const request = isNode
                    ? eval("require('request')")
                    : $httpClient;
                request[method.toLowerCase()](
                    options,
                    (err, response, body) => {
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
            });
        }

        let timeoutid;
        const timer = timeout
            ? new Promise((_, reject) => {
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
