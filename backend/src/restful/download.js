import { getPlatformFromHeaders } from '@/utils/platform';
import { COLLECTIONS_KEY, SUBS_KEY } from '@/constants';
import { findByName } from '@/utils/database';
import { getFlowHeaders } from '@/utils/flow';
import $ from '@/core/app';
import { failed } from '@/restful/response';
import { InternalServerError, ResourceNotFoundError } from '@/restful/errors';
import { produceArtifact } from '@/restful/sync';

export default function register($app) {
    $app.get('/download/collection/:name', downloadCollection);
    $app.get('/download/:name', downloadSubscription);
}

async function downloadSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);

    const platform =
        req.query.target || getPlatformFromHeaders(req.headers) || 'JSON';

    $.info(`正在下载订阅：${name}`);
    let {
        url,
        ua,
        content,
        mergeSources,
        ignoreFailedRemoteSub,
        produceType,
        includeUnsupportedProxy,
    } = req.query;
    if (url) {
        url = decodeURIComponent(url);
        $.info(`指定远程订阅 URL: ${url}`);
    }
    if (ua) {
        ua = decodeURIComponent(ua);
        $.info(`指定远程订阅 User-Agent: ${ua}`);
    }
    if (content) {
        content = decodeURIComponent(content);
        $.info(`指定本地订阅: ${content}`);
    }
    if (mergeSources) {
        mergeSources = decodeURIComponent(mergeSources);
        $.info(`指定合并来源: ${mergeSources}`);
    }
    if (ignoreFailedRemoteSub != null && ignoreFailedRemoteSub !== '') {
        ignoreFailedRemoteSub = decodeURIComponent(ignoreFailedRemoteSub);
        $.info(`指定忽略失败的远程订阅: ${ignoreFailedRemoteSub}`);
    }
    if (produceType) {
        produceType = decodeURIComponent(produceType);
        $.info(`指定生产类型: ${produceType}`);
    }
    if (includeUnsupportedProxy) {
        includeUnsupportedProxy = decodeURIComponent(includeUnsupportedProxy);
        $.info(`包含不支持的节点: ${includeUnsupportedProxy}`);
    }

    const allSubs = $.read(SUBS_KEY);
    const sub = findByName(allSubs, name);
    if (sub) {
        try {
            const output = await produceArtifact({
                type: 'subscription',
                name,
                platform,
                url,
                ua,
                content,
                mergeSources,
                ignoreFailedRemoteSub,
                produceType,
                produceOpts: {
                    'include-unsupported-proxy': includeUnsupportedProxy,
                },
            });

            if (
                sub.source !== 'local' ||
                ['localFirst', 'remoteFirst'].includes(sub.mergeSources) ||
                url
            ) {
                try {
                    url = `${url || sub.url}`
                        .split(/[\r\n]+/)
                        .map((i) => i.trim())
                        .filter((i) => i.length)?.[0];

                    let $arguments = {};
                    const rawArgs = url.split('#');
                    url = url.split('#')[0];
                    if (rawArgs.length > 1) {
                        try {
                            // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
                            $arguments = JSON.parse(
                                decodeURIComponent(rawArgs[1]),
                            );
                        } catch (e) {
                            for (const pair of rawArgs[1].split('&')) {
                                const key = pair.split('=')[0];
                                const value = pair.split('=')[1];
                                // 部分兼容之前的逻辑 const value = pair.split('=')[1] || true;
                                $arguments[key] =
                                    value == null || value === ''
                                        ? true
                                        : decodeURIComponent(value);
                            }
                        }
                    }
                    if (!$arguments.noFlow) {
                        // forward flow headers
                        const flowInfo = await getFlowHeaders(
                            url,
                            $arguments.flowUserAgent,
                            undefined,
                            sub.proxy,
                        );
                        if (flowInfo) {
                            res.set('subscription-userinfo', flowInfo);
                        }
                    }
                } catch (err) {
                    $.error(
                        `订阅 ${name} 获取流量信息时发生错误: ${JSON.stringify(
                            err,
                        )}`,
                    );
                }
            }
            if (sub.subUserinfo) {
                res.set('subscription-userinfo', sub.subUserinfo);
            }

            if (platform === 'JSON') {
                res.set('Content-Type', 'application/json;charset=utf-8').send(
                    output,
                );
            } else {
                res.send(output);
            }
        } catch (err) {
            $.notify(
                `🌍 Sub-Store 下载订阅失败`,
                `❌ 无法下载订阅：${name}！`,
                `🤔 原因：${err.message ?? err}`,
            );
            $.error(err.message ?? err);
            failed(
                res,
                new InternalServerError(
                    'INTERNAL_SERVER_ERROR',
                    `Failed to download subscription: ${name}`,
                    `Reason: ${err.message ?? err}`,
                ),
            );
        }
    } else {
        $.notify(`🌍 Sub-Store 下载订阅失败`, `❌ 未找到订阅：${name}！`);
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Subscription ${name} does not exist!`,
            ),
            404,
        );
    }
}

async function downloadCollection(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);

    const platform =
        req.query.target || getPlatformFromHeaders(req.headers) || 'JSON';

    const allCols = $.read(COLLECTIONS_KEY);
    const collection = findByName(allCols, name);

    $.info(`正在下载组合订阅：${name}`);

    let { ignoreFailedRemoteSub, produceType, includeUnsupportedProxy } =
        req.query;

    if (ignoreFailedRemoteSub != null && ignoreFailedRemoteSub !== '') {
        ignoreFailedRemoteSub = decodeURIComponent(ignoreFailedRemoteSub);
        $.info(`指定忽略失败的远程订阅: ${ignoreFailedRemoteSub}`);
    }
    if (produceType) {
        produceType = decodeURIComponent(produceType);
        $.info(`指定生产类型: ${produceType}`);
    }

    if (includeUnsupportedProxy) {
        includeUnsupportedProxy = decodeURIComponent(includeUnsupportedProxy);
        $.info(`包含不支持的节点: ${includeUnsupportedProxy}`);
    }

    if (collection) {
        try {
            const output = await produceArtifact({
                type: 'collection',
                name,
                platform,
                ignoreFailedRemoteSub,
                produceType,
                produceOpts: {
                    'include-unsupported-proxy': includeUnsupportedProxy,
                },
            });

            // forward flow header from the first subscription in this collection
            const allSubs = $.read(SUBS_KEY);
            const subnames = collection.subscriptions;
            if (subnames.length > 0) {
                const sub = findByName(allSubs, subnames[0]);
                if (
                    sub.source !== 'local' ||
                    ['localFirst', 'remoteFirst'].includes(sub.mergeSources)
                ) {
                    try {
                        let url = `${sub.url}`
                            .split(/[\r\n]+/)
                            .map((i) => i.trim())
                            .filter((i) => i.length)?.[0];

                        let $arguments = {};
                        const rawArgs = url.split('#');
                        url = url.split('#')[0];
                        if (rawArgs.length > 1) {
                            try {
                                // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
                                $arguments = JSON.parse(
                                    decodeURIComponent(rawArgs[1]),
                                );
                            } catch (e) {
                                for (const pair of rawArgs[1].split('&')) {
                                    const key = pair.split('=')[0];
                                    const value = pair.split('=')[1];
                                    // 部分兼容之前的逻辑 const value = pair.split('=')[1] || true;
                                    $arguments[key] =
                                        value == null || value === ''
                                            ? true
                                            : decodeURIComponent(value);
                                }
                            }
                        }
                        if (!$arguments.noFlow) {
                            const flowInfo = await getFlowHeaders(
                                url,
                                $arguments.flowUserAgent,
                                undefined,
                                sub.proxy,
                            );
                            if (flowInfo) {
                                res.set('subscription-userinfo', flowInfo);
                            }
                        }
                    } catch (err) {
                        $.error(
                            `组合订阅 ${name} 中的子订阅 ${
                                sub.name
                            } 获取流量信息时发生错误: ${err.message ?? err}`,
                        );
                    }
                }
                if (sub.subUserinfo) {
                    res.set('subscription-userinfo', sub.subUserinfo);
                }
            }

            if (platform === 'JSON') {
                res.set('Content-Type', 'application/json;charset=utf-8').send(
                    output,
                );
            } else {
                res.send(output);
            }
        } catch (err) {
            $.notify(
                `🌍 Sub-Store 下载组合订阅失败`,
                `❌ 下载组合订阅错误：${name}！`,
                `🤔 原因：${err}`,
            );
            failed(
                res,
                new InternalServerError(
                    'INTERNAL_SERVER_ERROR',
                    `Failed to download collection: ${name}`,
                    `Reason: ${err.message ?? err}`,
                ),
            );
        }
    } else {
        $.notify(
            `🌍 Sub-Store 下载组合订阅失败`,
            `❌ 未找到组合订阅：${name}！`,
        );
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Collection ${name} does not exist!`,
            ),
            404,
        );
    }
}
