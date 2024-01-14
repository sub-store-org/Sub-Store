import { InternalServerError } from './errors';
import { ProxyUtils } from '@/core/proxy-utils';
import { findByName } from '@/utils/database';
import { success, failed } from './response';
import download from '@/utils/download';
import { SUBS_KEY } from '@/constants';
import $ from '@/core/app';

export default function register($app) {
    $app.post('/api/preview/sub', compareSub);
    $app.post('/api/preview/collection', compareCollection);
    $app.post('/api/preview/file', previewFile);
}

async function previewFile(req, res) {
    try {
        const file = req.body;
        let content;
        if (
            file.source === 'local' &&
            !['localFirst', 'remoteFirst'].includes(file.mergeSources)
        ) {
            content = file.content;
        } else {
            const errors = {};
            content = await Promise.all(
                file.url
                    .split(/[\r\n]+/)
                    .map((i) => i.trim())
                    .filter((i) => i.length)
                    .map(async (url) => {
                        try {
                            return await download(url, file.ua);
                        } catch (err) {
                            errors[url] = err;
                            $.error(
                                `文件 ${file.name} 的远程文件 ${url} 发生错误: ${err}`,
                            );
                            return '';
                        }
                    }),
            );

            if (
                !file.ignoreFailedRemoteFile &&
                Object.keys(errors).length > 0
            ) {
                throw new Error(
                    `文件 ${file.name} 的远程文件 ${Object.keys(errors).join(
                        ', ',
                    )} 发生错误, 请查看日志`,
                );
            }
            if (file.mergeSources === 'localFirst') {
                content.unshift(file.content);
            } else if (file.mergeSources === 'remoteFirst') {
                content.push(file.content);
            }
        }
        // parse proxies
        const files = (Array.isArray(content) ? content : [content]).flat();
        let filesContent = files
            .filter((i) => i != null && i !== '')
            .join('\n');

        // apply processors
        const processed =
            Array.isArray(file.process) && file.process.length > 0
                ? await ProxyUtils.process(
                      { $files: files, $content: filesContent },
                      file.process,
                  )
                : { $content: filesContent, $files: files };

        // produce
        success(res, {
            original: filesContent,
            processed: processed?.$content ?? '',
        });
    } catch (err) {
        $.error(err.message ?? err);
        failed(
            res,
            new InternalServerError(
                `INTERNAL_SERVER_ERROR`,
                `Failed to preview file`,
                `Reason: ${err.message ?? err}`,
            ),
        );
    }
}

async function compareSub(req, res) {
    try {
        const sub = req.body;
        const target = req.query.target || 'JSON';
        let content;
        if (
            sub.source === 'local' &&
            !['localFirst', 'remoteFirst'].includes(sub.mergeSources)
        ) {
            content = sub.content;
        } else {
            const errors = {};
            content = await Promise.all(
                sub.url
                    .split(/[\r\n]+/)
                    .map((i) => i.trim())
                    .filter((i) => i.length)
                    .map(async (url) => {
                        try {
                            return await download(url, sub.ua);
                        } catch (err) {
                            errors[url] = err;
                            $.error(
                                `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                            );
                            return '';
                        }
                    }),
            );

            if (!sub.ignoreFailedRemoteSub && Object.keys(errors).length > 0) {
                throw new Error(
                    `订阅 ${sub.name} 的远程订阅 ${Object.keys(errors).join(
                        ', ',
                    )} 发生错误, 请查看日志`,
                );
            }
            if (sub.mergeSources === 'localFirst') {
                content.unshift(sub.content);
            } else if (sub.mergeSources === 'remoteFirst') {
                content.push(sub.content);
            }
        }
        // parse proxies
        const original = (Array.isArray(content) ? content : [content])
            .map((i) => ProxyUtils.parse(i))
            .flat();

        // add id
        original.forEach((proxy, i) => {
            proxy.id = i;
            proxy.subName = sub.name;
        });

        // apply processors
        const processed = await ProxyUtils.process(
            original,
            sub.process || [],
            target,
            { [sub.name]: sub },
        );

        // produce
        success(res, { original, processed });
    } catch (err) {
        $.error(err.message ?? err);
        failed(
            res,
            new InternalServerError(
                `INTERNAL_SERVER_ERROR`,
                `Failed to preview subscription`,
                `Reason: ${err.message ?? err}`,
            ),
        );
    }
}

async function compareCollection(req, res) {
    try {
        const allSubs = $.read(SUBS_KEY);
        const collection = req.body;
        const subnames = collection.subscriptions;
        const results = {};
        const errors = {};
        await Promise.all(
            subnames.map(async (name) => {
                const sub = findByName(allSubs, name);
                try {
                    let raw;
                    if (
                        sub.source === 'local' &&
                        !['localFirst', 'remoteFirst'].includes(
                            sub.mergeSources,
                        )
                    ) {
                        raw = sub.content;
                    } else {
                        const errors = {};
                        raw = await Promise.all(
                            sub.url
                                .split(/[\r\n]+/)
                                .map((i) => i.trim())
                                .filter((i) => i.length)
                                .map(async (url) => {
                                    try {
                                        return await download(url, sub.ua);
                                    } catch (err) {
                                        errors[url] = err;
                                        $.error(
                                            `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                                        );
                                        return '';
                                    }
                                }),
                        );
                        if (
                            !sub.ignoreFailedRemoteSub &&
                            Object.keys(errors).length > 0
                        ) {
                            throw new Error(
                                `订阅 ${sub.name} 的远程订阅 ${Object.keys(
                                    errors,
                                ).join(', ')} 发生错误, 请查看日志`,
                            );
                        }
                        if (sub.mergeSources === 'localFirst') {
                            raw.unshift(sub.content);
                        } else if (sub.mergeSources === 'remoteFirst') {
                            raw.push(sub.content);
                        }
                    }
                    // parse proxies
                    let currentProxies = (Array.isArray(raw) ? raw : [raw])
                        .map((i) => ProxyUtils.parse(i))
                        .flat();

                    currentProxies.forEach((proxy) => {
                        proxy.subName = sub.name;
                        proxy.collectionName = collection.name;
                    });

                    // apply processors
                    currentProxies = await ProxyUtils.process(
                        currentProxies,
                        sub.process || [],
                        'JSON',
                        { [sub.name]: sub, _collection: collection },
                    );
                    results[name] = currentProxies;
                } catch (err) {
                    errors[name] = err;

                    $.error(
                        `❌ 处理组合订阅中的子订阅: ${
                            sub.name
                        }时出现错误：${err}！进度--${
                            100 * (processed / subnames.length).toFixed(1)
                        }%`,
                    );
                }
            }),
        );
        if (
            !collection.ignoreFailedRemoteSub &&
            Object.keys(errors).length > 0
        ) {
            throw new Error(
                `组合订阅 ${collection.name} 中的子订阅 ${Object.keys(
                    errors,
                ).join(', ')} 发生错误, 请查看日志`,
            );
        }
        // merge proxies with the original order
        const original = Array.prototype.concat.apply(
            [],
            subnames.map((name) => results[name] || []),
        );

        original.forEach((proxy, i) => {
            proxy.id = i;
            proxy.collectionName = collection.name;
        });

        const processed = await ProxyUtils.process(
            original,
            collection.process || [],
            'JSON',
            { _collection: collection },
        );

        success(res, { original, processed });
    } catch (err) {
        $.error(err.message ?? err);
        failed(
            res,
            new InternalServerError(
                `INTERNAL_SERVER_ERROR`,
                `Failed to preview collection`,
                `Reason: ${err.message ?? err}`,
            ),
        );
    }
}
