import { getPlatformFromHeaders } from '@/utils/user-agent';
import { COLLECTIONS_KEY, SUBS_KEY } from '@/constants';
import { findByName } from '@/utils/database';
import { getFlowHeaders } from '@/utils/flow';
import $ from '@/core/app';
import { failed } from '@/restful/response';
import { InternalServerError, ResourceNotFoundError } from '@/restful/errors';
import { produceArtifact } from '@/restful/sync';
// eslint-disable-next-line no-unused-vars
import { isIPv4, isIPv6 } from '@/utils';
import { getISO } from '@/utils/geo';
import env from '@/utils/env';

export default function register($app) {
    $app.get('/download/collection/:name', downloadCollection);
    $app.get('/download/:name', downloadSubscription);
    $app.get(
        '/download/collection/:name/api/v1/server/details',
        async (req, res) => {
            req.query.platform = 'JSON';
            req.query.produceType = 'internal';
            req.query.resultFormat = 'nezha';
            await downloadCollection(req, res);
        },
    );
    $app.get('/download/:name/api/v1/server/details', async (req, res) => {
        req.query.platform = 'JSON';
        req.query.produceType = 'internal';
        req.query.resultFormat = 'nezha';
        await downloadSubscription(req, res);
    });
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
        resultFormat,
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
            let output = await produceArtifact({
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
                ['localFirst', 'remoteFirst'].includes(sub.mergeSources)
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
                if (resultFormat === 'nezha') {
                    output = nezhaTransform(output);
                }
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

    let {
        ignoreFailedRemoteSub,
        produceType,
        includeUnsupportedProxy,
        resultFormat,
    } = req.query;

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
            let output = await produceArtifact({
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
                if (resultFormat === 'nezha') {
                    output = nezhaTransform(output);
                }
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

function nezhaTransform(output) {
    const result = {
        code: 0,
        message: 'success',
        result: [],
    };
    output.map((proxy, index) => {
        // 如果节点上有数据 就取节点上的数据
        let CountryCode = proxy._geo?.countryCode || proxy._geo?.country;
        // 简单判断下
        if (!/^[a-z]{2}$/i.test(CountryCode)) {
            CountryCode = getISO(proxy.name);
        }
        // 简单判断下
        if (/^[a-z]{2}$/i.test(CountryCode)) {
            // 如果节点上有数据 就取节点上的数据
            let time = proxy._unavailable ? 0 : Date.now();
            result.result.push({
                id: index,
                name: proxy.name,
                tag: `${proxy._tag ?? ''}`,
                last_active: time,
                // 暂时不用处理 现在 VPings App 端的接口支持域名查询
                // 其他场景使用 自己在 Sub-Store 加一步域名解析
                valid_ip: proxy._IP || proxy.server,
                ipv4: proxy._IPv4 || proxy.server,
                ipv6: proxy._IPv6 || (isIPv6(proxy.server) ? proxy.server : ''),
                host: {
                    Platform: 'Sub-Store',
                    PlatformVersion: env.version,
                    CPU: [],
                    MemTotal: 1024,
                    DiskTotal: 1024,
                    SwapTotal: 1024,
                    Arch: '',
                    Virtualization: '',
                    BootTime: time,
                    CountryCode, // 目前需要
                    Version: '',
                },
                status: {
                    CPU: 0,
                    MemUsed: 0,
                    SwapUsed: 0,
                    DiskUsed: 0,
                    NetInTransfer: 0,
                    NetOutTransfer: 0,
                    NetInSpeed: 0,
                    NetOutSpeed: 0,
                    Uptime: parseInt(proxy._uptime ?? index, 10),
                    Load1: 0,
                    Load5: 0,
                    Load15: 0,
                    TcpConnCount: 0,
                    UdpConnCount: 0,
                    ProcessCount: 0,
                },
            });
        }
    });
    return JSON.stringify(result, null, 2);
}
