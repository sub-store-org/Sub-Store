import { HTTP, ENV } from '@/vendor/open-api';
import { getPolicyDescriptor } from '@/utils';
import $ from '@/core/app';
import { SETTINGS_KEY } from '@/constants';

/**
 * Gist backup
 */
export default class Gist {
    constructor({ token, key, syncPlatform }) {
        const { isStash, isLoon, isShadowRocket, isQX } = ENV();
        const {
            defaultProxy,
            defaultTimeout: timeout,
            githubProxy,
        } = $.read(SETTINGS_KEY);
        let proxy = defaultProxy;
        if ($.env.isNode) {
            proxy =
                proxy || eval('process.env.SUB_STORE_BACKEND_DEFAULT_PROXY');
        }

        if (syncPlatform === 'gitlab') {
            this.headers = {
                'PRIVATE-TOKEN': `${token}`,
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36',
            };
            this.http = HTTP({
                baseURL: 'https://gitlab.com/api/v4',
                headers: {
                    ...this.headers,
                    ...(isStash && proxy
                        ? {
                              'X-Stash-Selected-Proxy':
                                  encodeURIComponent(proxy),
                          }
                        : {}),
                    ...(isShadowRocket && proxy
                        ? { 'X-Surge-Policy': proxy }
                        : {}),
                },

                ...(proxy ? { proxy } : {}),
                ...(isLoon && proxy ? { node: proxy } : {}),
                ...(isQX && proxy ? { opts: { policy: proxy } } : {}),
                ...(proxy ? getPolicyDescriptor(proxy) : {}),
                timeout: timeout || 8000,

                events: {
                    onResponse: (resp) => {
                        if (/^[45]/.test(String(resp.statusCode))) {
                            const body = JSON.parse(resp.body);
                            return Promise.reject(
                                `ERROR: ${body.message?.error ?? body.message}`,
                            );
                        } else {
                            return resp;
                        }
                    },
                },
            });
        } else {
            this.headers = {
                Authorization: `token ${token}`,
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36',
            };
            this.http = HTTP({
                baseURL: `${
                    githubProxy ? `${githubProxy}/` : ''
                }https://api.github.com`,
                headers: {
                    ...this.headers,
                    ...(isStash && proxy
                        ? {
                              'X-Stash-Selected-Proxy':
                                  encodeURIComponent(proxy),
                          }
                        : {}),
                    ...(isShadowRocket && proxy
                        ? { 'X-Surge-Policy': proxy }
                        : {}),
                },

                ...(proxy ? { proxy } : {}),
                ...(isLoon && proxy ? { node: proxy } : {}),
                ...(isQX && proxy ? { opts: { policy: proxy } } : {}),
                ...(proxy ? getPolicyDescriptor(proxy) : {}),
                timeout: timeout || 8000,

                events: {
                    onResponse: (resp) => {
                        if (/^[45]/.test(String(resp.statusCode))) {
                            return Promise.reject(
                                `ERROR: ${JSON.parse(resp.body).message}`,
                            );
                        } else {
                            return resp;
                        }
                    },
                },
            });
        }

        this.key = key;
        this.syncPlatform = syncPlatform;
    }

    async locate() {
        if (this.syncPlatform === 'gitlab') {
            return this.http.get('/snippets').then((response) => {
                const gists = JSON.parse(response.body);

                for (let g of gists) {
                    if (g.title === this.key) {
                        return g;
                    }
                }
                return;
            });
        } else {
            return this.http
                .get('/gists?per_page=100&page=1')
                .then((response) => {
                    const gists = JSON.parse(response.body);
                    $.info(`获取到当前 GitHub 用户的 gist: ${gists.length} 个`);
                    for (let g of gists) {
                        if (g.description === this.key) {
                            return g;
                        }
                    }
                    return;
                });
        }
    }

    async upload(input) {
        if (Object.keys(input).length === 0) {
            return Promise.reject('未提供需上传的文件');
        }

        const gist = await this.locate();

        let files = input;

        if (gist?.id) {
            if (this.syncPlatform === 'gitlab') {
                gist.files = gist.files.reduce((acc, item) => {
                    acc[item.path] = item;
                    return acc;
                }, {});
            }
            // console.log(`files`, files);
            // console.log(`gist`, gist.files);
            let actions = [];
            const result = { ...gist.files };
            Object.keys(files).map((key) => {
                if (result[key]) {
                    if (
                        files[key].content == null ||
                        files[key].content === ''
                    ) {
                        delete result[key];
                        actions.push({
                            action: 'delete',
                            file_path: key,
                        });
                    } else {
                        result[key] = files[key];
                        actions.push({
                            action: 'update',
                            file_path: key,
                            content: files[key].content,
                        });
                    }
                } else {
                    if (
                        files[key].content == null ||
                        files[key].content === ''
                    ) {
                        delete result[key];
                        delete files[key];
                    } else {
                        result[key] = files[key];
                        actions.push({
                            action: 'create',
                            file_path: key,
                            content: files[key].content,
                        });
                    }
                }
            });
            // console.log(`result`, result);
            // console.log(`files`, files);
            // console.log(`actions`, actions);

            if (this.syncPlatform === 'gitlab') {
                if (Object.keys(result).length === 0) {
                    return Promise.reject(
                        '本次操作将导致所有文件的内容都为空, 无法更新 snippet',
                    );
                }
                if (Object.keys(result).length > 10) {
                    return Promise.reject(
                        '本次操作将导致 snippet 的文件数超过 10, 无法更新 snippet',
                    );
                }
                files = actions;
                return this.http.put({
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/json',
                    },
                    url: `/snippets/${gist.id}`,
                    body: JSON.stringify({ files }),
                });
            } else {
                if (Object.keys(result).length === 0) {
                    return Promise.reject(
                        '本次操作将导致所有文件的内容都为空, 无法更新 gist',
                    );
                }
                return this.http.patch({
                    url: `/gists/${gist.id}`,
                    body: JSON.stringify({ files }),
                });
            }
        } else {
            files = Object.entries(files).reduce((acc, [key, file]) => {
                if (file.content !== null && file.content !== '') {
                    acc[key] = file;
                }
                return acc;
            }, {});
            if (this.syncPlatform === 'gitlab') {
                if (Object.keys(files).length === 0) {
                    return Promise.reject(
                        '所有文件的内容都为空, 无法创建 snippet',
                    );
                }
                files = Object.keys(files).map((key) => ({
                    file_path: key,
                    content: files[key].content,
                }));
                return this.http.post({
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/json',
                    },
                    url: '/snippets',
                    body: JSON.stringify({
                        title: this.key,
                        visibility: 'private',
                        files,
                    }),
                });
            } else {
                if (Object.keys(files).length === 0) {
                    return Promise.reject(
                        '所有文件的内容都为空, 无法创建 gist',
                    );
                }
                return this.http.post({
                    url: '/gists',
                    body: JSON.stringify({
                        description: this.key,
                        public: false,
                        files,
                    }),
                });
            }
        }
    }

    async download(filename) {
        const gist = await this.locate();
        if (gist?.id) {
            try {
                const { files } = await this.http
                    .get(`/gists/${gist.id}`)
                    .then((resp) => JSON.parse(resp.body));
                const url = files[filename].raw_url;
                return await this.http.get(url).then((resp) => resp.body);
            } catch (err) {
                return Promise.reject(err);
            }
        } else {
            return Promise.reject(`找不到 Sub-Store Gist (${this.key})`);
        }
    }
}
