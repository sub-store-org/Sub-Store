import { InternalServerError } from './errors';
import { ProxyUtils } from '@/core/proxy-utils';
import { findByName } from '@/utils/database';
import { success, failed } from './response';
import download from '@/utils/download';
import { SUBS_KEY } from '@/constants';
import $ from '@/core/app';
import {
    handleIgnoreFailedRemoteSubError,
    notifyIgnoreFailedRemoteSubFallback,
    resolveIgnoreFailedRemoteSubMode,
    shouldFallbackIgnoreFailedRemoteSub,
} from '@/restful/ignore-failed-remote-sub';
import { normalizeClashYaml } from '@/core/proxy-utils/preprocessors';

export default function register($app) {
    $app.post('/api/preview/sub', compareSub);
    $app.post('/api/preview/collection', compareCollection);
    $app.post('/api/preview/file', previewFile);
}

async function previewFile(req, res) {
    try {
        const file = req.body;
        let content = '';
        if (file.type !== 'mihomoProfile') {
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
                                return await download(
                                    url,
                                    file.ua,
                                    undefined,
                                    file.proxy,
                                );
                            } catch (err) {
                                errors[url] = err;
                                $.error(
                                    `文件 ${file.name} 的远程文件 ${url} 发生错误: ${err}`,
                                );
                                return '';
                            }
                        }),
                );

                if (Object.keys(errors).length > 0) {
                    if (!file.ignoreFailedRemoteFile) {
                        throw new Error(
                            `文件 ${file.name} 的远程文件 ${Object.keys(
                                errors,
                            ).join(', ')} 发生错误, 请查看日志`,
                        );
                    } else if (file.ignoreFailedRemoteFile === 'enabled') {
                        $.notify(
                            `🌍 Sub-Store 预览文件失败`,
                            `❌ ${file.name}`,
                            `远程文件 ${Object.keys(errors).join(
                                ', ',
                            )} 发生错误, 请查看日志`,
                        );
                    }
                }
                if (file.mergeSources === 'localFirst') {
                    content.unshift(file.content);
                } else if (file.mergeSources === 'remoteFirst') {
                    content.push(file.content);
                }
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
                      { $files: files, $content: filesContent, $file: file },
                      file.process,
                  )
                : { $content: filesContent, $files: files };

        // produce
        success(res, {
            original: filesContent,
            processed: normalizeClashYaml(processed?.$content ?? ''),
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
    const sub = req.body;
    const mode = resolveIgnoreFailedRemoteSubMode(sub.ignoreFailedRemoteSub);

    try {
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
                            return await download(
                                url,
                                sub.ua,
                                undefined,
                                sub.proxy,
                                undefined,
                                undefined,
                                undefined,
                                true,
                            );
                        } catch (err) {
                            errors[url] = err;
                            $.error(
                                `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                            );
                            return '';
                        }
                    }),
            );

            if (Object.keys(errors).length > 0) {
                const message = `订阅 ${sub.name} 的远程订阅 ${Object.keys(
                    errors,
                ).join(', ')} 发生错误, 请查看日志`;
                handleIgnoreFailedRemoteSubError({
                    mode,
                    message,
                    notify: () => {
                        $.notify(
                            `🌍 Sub-Store 预览订阅失败`,
                            `❌ ${sub.name}`,
                            message,
                        );
                    },
                });
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
            proxy._subName = sub.name;
            proxy._subDisplayName = sub.displayName;
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
        if (shouldFallbackIgnoreFailedRemoteSub(mode)) {
            notifyIgnoreFailedRemoteSubFallback({
                mode,
                error: err,
                notify: (error) => {
                    $.notify(
                        `🌍 Sub-Store 预览订阅失败`,
                        `❌ ${sub.name}`,
                        `🤔 原因：${error.message ?? error}`,
                    );
                },
            });
            $.error(
                `订阅 ${sub.name} 预览启用兜底后返回空结果: ${
                    err.message ?? err
                }`,
            );
            success(res, { original: [], processed: [] });
            return;
        }

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
    const collection = req.body;
    const collectionMode = resolveIgnoreFailedRemoteSubMode(
        collection.ignoreFailedRemoteSub,
    );

    try {
        const allSubs = $.read(SUBS_KEY);
        const subnames = [...collection.subscriptions];
        let subscriptionTags = collection.subscriptionTags;
        if (Array.isArray(subscriptionTags) && subscriptionTags.length > 0) {
            allSubs.forEach((sub) => {
                if (
                    Array.isArray(sub.tag) &&
                    sub.tag.length > 0 &&
                    !subnames.includes(sub.name) &&
                    sub.tag.some((tag) => subscriptionTags.includes(tag))
                ) {
                    subnames.push(sub.name);
                }
            });
        }
        const results = {};
        const errors = {};
        await Promise.all(
            subnames.map(async (name) => {
                const sub = findByName(allSubs, name);
                const subMode = resolveIgnoreFailedRemoteSubMode(
                    sub.ignoreFailedRemoteSub,
                );
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
                                        return await download(
                                            url,
                                            sub.ua,
                                            undefined,
                                            sub.proxy,
                                            undefined,
                                            undefined,
                                            undefined,
                                            true,
                                        );
                                    } catch (err) {
                                        errors[url] = err;
                                        $.error(
                                            `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                                        );
                                        return '';
                                    }
                                }),
                        );

                        if (Object.keys(errors).length > 0) {
                            const message = `订阅 ${sub.name} 的远程订阅 ${Object.keys(
                                errors,
                            ).join(', ')} 发生错误, 请查看日志`;
                            handleIgnoreFailedRemoteSubError({
                                mode: subMode,
                                message,
                                notify: () => {
                                    $.notify(
                                        `🌍 Sub-Store 预览订阅失败`,
                                        `❌ ${sub.name}`,
                                        message,
                                    );
                                },
                            });
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
                        proxy._subName = sub.name;
                        proxy._subDisplayName = sub.displayName;
                        proxy._collectionName = collection.name;
                        proxy._collectionDisplayName = collection.displayName;
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
                    if (shouldFallbackIgnoreFailedRemoteSub(subMode)) {
                        notifyIgnoreFailedRemoteSubFallback({
                            mode: subMode,
                            error: err,
                            notify: (error) => {
                                $.notify(
                                    `🌍 Sub-Store 预览订阅失败`,
                                    `❌ ${sub.name}`,
                                    `🤔 原因：${error.message ?? error}`,
                                );
                            },
                        });
                        $.error(
                            `订阅 ${sub.name} 在组合订阅预览中启用兜底后返回空结果: ${
                                err.message ?? err
                            }`,
                        );
                        results[name] = [];
                        return;
                    }

                    errors[name] = err;

                    $.error(
                        `❌ 处理组合订阅 ${collection.name} 中的子订阅: ${sub.name} 时出现错误：${err}！`,
                    );
                }
            }),
        );

        if (Object.keys(errors).length > 0) {
            const message = `组合订阅 ${collection.name} 的子订阅 ${Object.keys(
                errors,
            ).join(', ')} 发生错误, 请查看日志`;
            handleIgnoreFailedRemoteSubError({
                mode: collectionMode,
                message,
                notify: () => {
                    $.notify(
                        `🌍 Sub-Store 预览组合订阅失败`,
                        `❌ ${collection.name}`,
                        message,
                    );
                },
            });
        }
        // merge proxies with the original order
        const original = Array.prototype.concat.apply(
            [],
            subnames.map((name) => results[name] || []),
        );

        original.forEach((proxy, i) => {
            proxy.id = i;
            proxy._collectionName = collection.name;
            proxy._collectionDisplayName = collection.displayName;
        });

        const processed = await ProxyUtils.process(
            original,
            collection.process || [],
            'JSON',
            { _collection: collection },
        );

        success(res, { original, processed });
    } catch (err) {
        if (shouldFallbackIgnoreFailedRemoteSub(collectionMode)) {
            notifyIgnoreFailedRemoteSubFallback({
                mode: collectionMode,
                error: err,
                notify: (error) => {
                    $.notify(
                        `🌍 Sub-Store 预览组合订阅失败`,
                        `❌ ${collection.name}`,
                        `🤔 原因：${error.message ?? error}`,
                    );
                },
            });
            $.error(
                `组合订阅 ${collection.name} 预览启用兜底后返回空结果: ${
                    err.message ?? err
                }`,
            );
            success(res, { original: [], processed: [] });
            return;
        }

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
