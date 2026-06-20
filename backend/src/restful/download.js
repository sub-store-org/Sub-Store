import { getPlatformFromHeaders } from '@/utils/user-agent';
import { ProxyUtils } from '@/core/proxy-utils';
import { COLLECTIONS_KEY, SUBS_KEY } from '@/constants';
import { findByName } from '@/utils/database';
import { getFlowHeaders, normalizeFlowHeader } from '@/utils/flow';
import $ from '@/core/app';
import { failed } from '@/restful/response';
import {
    InternalServerError,
    RequestInvalidError,
    ResourceNotFoundError,
} from '@/restful/errors';
import { produceArtifact } from '@/restful/sync';
// eslint-disable-next-line no-unused-vars
import { isIPv4, isIPv6 } from '@/utils';
import { getISO } from '@/utils/geo';
import env from '@/utils/env';
import { applyResponseTransformers } from '@/restful/response-transformer';
import {
    applyAgeOutputEncryption,
    resolveShareAgeConfig,
} from '@/restful/age-output';
import { findShareToken } from '@/restful/token';
import { maskAgeSecretInUrl } from '@/utils/age';

function buildEmptyNezhaPayload() {
    return JSON.stringify(
        {
            code: 0,
            message: 'success',
            result: [],
        },
        null,
        2,
    );
}

function getMihomoExternalOptions(query) {
    const useMihomoExternal = query.target === 'SurgeMac';
    const mihomoExternal = useMihomoExternal ? query.mihomoExternal : undefined;
    const mihomoMerge = useMihomoExternal ? query.mihomoMerge : undefined;
    const mihomoMergeName = useMihomoExternal
        ? query.mihomoMergeName
        : undefined;

    return {
        useMihomoExternal,
        mihomoExternal,
        mihomoMerge,
        mihomoMergeName,
    };
}

export default function register($app) {
    $app.get('/share/col/:name/:target', async (req, res) => {
        const { target } = req.params;
        if (target) {
            req.query.target = target;
            $.info(`使用路由指定目标: ${target}`);
        }
        await downloadCollection(req, res);
    });
    $app.get('/share/col/:name', downloadCollection);
    $app.get('/share/sub/:name/:target', async (req, res) => {
        const { target } = req.params;
        if (target) {
            req.query.target = target;
            $.info(`使用路由指定目标: ${target}`);
        }
        await downloadSubscription(req, res);
    });
    $app.get('/share/sub/:name', downloadSubscription);

    $app.get('/download/collection/:name/:target', async (req, res) => {
        const { target } = req.params;
        if (target) {
            req.query.target = target;
            $.info(`使用路由指定目标: ${target}`);
        }
        await downloadCollection(req, res);
    });
    $app.get('/download/collection/:name', downloadCollection);
    $app.get('/download/:name/:target', async (req, res) => {
        const { target } = req.params;
        if (target) {
            req.query.target = target;
            $.info(`使用路由指定目标: ${target}`);
        }
        await downloadSubscription(req, res);
    });
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
    $app.get(
        '/download/collection/:name/api/v1/monitor/:nezhaIndex',
        async (req, res) => {
            req.query.platform = 'JSON';
            req.query.produceType = 'internal';
            req.query.resultFormat = 'nezha-monitor';
            await downloadCollection(req, res);
        },
    );
    $app.get('/download/:name/api/v1/monitor/:nezhaIndex', async (req, res) => {
        req.query.platform = 'JSON';
        req.query.produceType = 'internal';
        req.query.resultFormat = 'nezha-monitor';
        await downloadSubscription(req, res);
    });
}

async function downloadSubscription(req, res) {
    let { name, nezhaIndex } = req.params;
    const isShareRoute = req.path?.startsWith('/share/');

    const { useMihomoExternal, mihomoMerge, mihomoMergeName, mihomoExternal } =
        getMihomoExternalOptions(req.query);

    const platform =
        req.query.platform ||
        req.query.target ||
        getPlatformFromHeaders(req.headers) ||
        'JSON';
    const reqUA = req.headers['user-agent'] || req.headers['User-Agent'];
    $.info(
        `正在下载订阅：${name}\n请求 User-Agent: ${reqUA}\n请求 target: ${req.query.target}\n实际输出: ${platform}`,
    );
    let {
        url,
        ua,
        content,
        mergeSources,
        ignoreFailedRemoteSub,
        produceType,
        includeUnsupportedProxy,
        resultFormat,
        proxy,
        noCache,
        _fakeNode,
        fakeSub: _fakeSub,
    } = req.query;
    const prettyYaml = req.query.prettyYaml ?? req.query['pretty-yaml'];

    let $options = {
        _req: {
            method: req.method,
            url: req.url,
            path: req.path,
            query: req.query,
            params: req.params,
            headers: req.headers,
            body: req.body,
            socket: {
                remoteAddress: req.socket?.remoteAddress,
            },
        },
    };
    if (req.query.$options) {
        let options = {};
        try {
            // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
            options = JSON.parse(decodeURIComponent(req.query.$options));
        } catch (e) {
            for (const pair of req.query.$options.split('&')) {
                const key = pair.split('=')[0];
                const value = pair.split('=')[1];
                // 部分兼容之前的逻辑 const value = pair.split('=')[1] || true;
                options[key] =
                    value == null || value === ''
                        ? true
                        : decodeURIComponent(value);
            }
        }
        $.info(`传入 $options: ${JSON.stringify(options)}`);
        Object.assign($options, options);
    }
    if (isShareRoute && _fakeSub) {
        $.warn(`分享链接禁止使用 fakeSub: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_FAKE_SUB',
                'share/sub 不支持 fakeSub 参数',
            ),
            400,
        );
        return;
    }
    if (
        isShareRoute &&
        ((url != null && url !== '') || (content != null && content !== ''))
    ) {
        $.warn(`分享链接禁止使用 url/content: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_SUB_SOURCE_OVERRIDE',
                'share/sub 不支持 url 或 content 参数',
            ),
            400,
        );
        return;
    }
    if (isShareRoute && mergeSources) {
        $.warn(`分享链接禁止使用 mergeSources: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_SUB_MERGE_SOURCES',
                'share/sub 不支持 mergeSources 参数',
            ),
            400,
        );
        return;
    }
    if (url) {
        $.info(`指定远程订阅 URL: ${maskAgeSecretInUrl(url)}`);
        if (!/^https?:\/\//.test(url)) {
            content = url;
            $.info(`URL 不是链接，视为本地订阅`);
        }
    }
    if (_fakeSub) {
        $.info(`使用假订阅, 不再通过单条订阅名称 ${name} 查询`);
    }
    if (content) {
        $.info(`指定本地订阅: ${content}`);
    }
    if (proxy) {
        $.info(`指定远程订阅使用代理/策略 proxy: ${proxy}`);
    }
    if (ua) {
        $.info(`指定远程订阅 User-Agent: ${ua}`);
    }

    if (mergeSources) {
        $.info(`指定合并来源: ${mergeSources}`);
    }
    if (ignoreFailedRemoteSub != null && ignoreFailedRemoteSub !== '') {
        $.info(`指定忽略失败的远程订阅: ${ignoreFailedRemoteSub}`);
    }
    if (produceType) {
        $.info(`指定生产类型: ${produceType}`);
    }
    if (includeUnsupportedProxy) {
        $.info(`包含官方/商店版不支持的协议: ${includeUnsupportedProxy}`);
    }
    if (prettyYaml) {
        $.info(`指定输出易读 YAML: ${prettyYaml}`);
    }
    if (mihomoMerge) {
        $.info(`指定合并 mihomo External: ${mihomoMerge}`);
    }
    if (mihomoMergeName) {
        $.info(`指定合并 mihomo External 名称: ${mihomoMergeName}`);
    }

    if (useMihomoExternal) {
        $.info(`手动指定了 target 为 SurgeMac, 将使用 mihomo External`);
    }
    if (mihomoExternal) {
        $.info(`手动指定了 mihomo External 链接参数: ${mihomoExternal}`);
    }

    if (noCache) {
        $.info(`指定不使用缓存: ${noCache}`);
    }

    const allSubs = $.read(SUBS_KEY);
    const fakeSub = _fakeNode ? {
        name: 'fakeNodeInfo',
        source: 'local',
        content:
            'invalid share = ss, 1.0.0.1, 80, encrypt-method=aes-128-gcm, password=password',
    } : {
        name: 'fakeSub',
        source: 'remote',
        url: '',
    };
    const sub = (_fakeNode || _fakeSub) ? fakeSub : findByName(allSubs, name);
    if (sub) {
        try {
            const passThroughUA = sub.passThroughUA;
            if (passThroughUA) {
                $.info(
                    `订阅开启了透传 User-Agent, 使用请求的 User-Agent: ${reqUA}`,
                );
                ua = reqUA;
            }
            const opt = {
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
                    useMihomoExternal,
                    merge: mihomoMerge,
                    mergeName: mihomoMergeName,
                    mihomoExternal,
                    prettyYaml,
                },
                $options,
                proxy,
                noCache,
            };
            if (_fakeNode || _fakeSub) {
                if(_fakeNode) {
                    $.info(`返回假节点信息`);
                }
                delete opt.name;
                opt.subscription = fakeSub;
            }
            let output = await produceArtifact(opt);
            let flowInfo;
            if (
                sub.source !== 'local' ||
                ['localFirst', 'remoteFirst'].includes(sub.mergeSources)
            ) {
                try {
                    url =
                        `${url || sub.url}`
                            .split(/[\r\n]+/)
                            .map((i) => i.trim())
                            .filter((i) => i.length)?.[0] || '';

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
                    if (!$arguments.noFlow && /^https?/.test(url)) {
                        // forward flow headers
                        flowInfo = await getFlowHeaders(
                            $arguments?.insecure ? `${url}#insecure` : url,
                            $arguments.flowUserAgent,
                            undefined,
                            proxy || sub.proxy,
                            $arguments.flowUrl,
                            $arguments.flowHeaders,
                        );
                        if (flowInfo) {
                            const headers = normalizeFlowHeader(flowInfo, true);
                            if (headers?.['subscription-userinfo']) {
                                res.set(
                                    'subscription-userinfo',
                                    headers['subscription-userinfo'],
                                );
                            }
                            if (headers?.['profile-web-page-url']) {
                                res.set(
                                    'profile-web-page-url',
                                    headers['profile-web-page-url'],
                                );
                            }
                            if (headers?.['plan-name']) {
                                res.set('plan-name', headers['plan-name']);
                            }
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
                let subUserInfo;
                if (/^https?:\/\//.test(sub.subUserinfo)) {
                    try {
                        subUserInfo = await getFlowHeaders(
                            undefined,
                            undefined,
                            undefined,
                            proxy || sub.proxy,
                            sub.subUserinfo,
                        );
                    } catch (e) {
                        $.error(
                            `订阅 ${name} 使用自定义流量链接 ${
                                sub.subUserinfo
                            } 获取流量信息时发生错误: ${JSON.stringify(e)}`,
                        );
                    }
                } else {
                    subUserInfo = sub.subUserinfo;
                }

                const headers = normalizeFlowHeader(
                    [subUserInfo, flowInfo].filter((i) => i).join(';'),
                    true,
                );
                if (headers?.['subscription-userinfo']) {
                    res.set(
                        'subscription-userinfo',
                        headers['subscription-userinfo'],
                    );
                }
                if (headers?.['profile-web-page-url']) {
                    res.set(
                        'profile-web-page-url',
                        headers['profile-web-page-url'],
                    );
                }
                if (headers?.['plan-name']) {
                    res.set('plan-name', headers['plan-name']);
                }
            }

            if (platform === 'JSON') {
                if (resultFormat === 'nezha') {
                    output = nezhaTransform(output);
                } else if (resultFormat === 'nezha-monitor') {
                    if (!Array.isArray(output) || output.length === 0) {
                        output = buildEmptyNezhaPayload();
                    } else {
                        nezhaIndex = /^\d+$/.test(nezhaIndex)
                            ? parseInt(nezhaIndex, 10)
                            : output.findIndex((i) => i.name === nezhaIndex);
                        output = await nezhaMonitor(
                            output[nezhaIndex],
                            nezhaIndex,
                            req.query,
                        );
                    }
                }
                res.set('Content-Type', 'application/json;charset=utf-8');
            } else {
                res.set('Content-Type', 'text/plain; charset=utf-8');
            }
            if ($options?._res?.headers) {
                Object.entries($options._res.headers).forEach(
                    ([key, value]) => {
                        if (value == null) {
                            res.removeHeader(key);
                        } else {
                            res.set(key, value);
                        }
                    },
                );
            }
            if ($options?._res?.status) {
                res.status($options._res.status);
            }
            const body = await applyResponseTransformers({
                res,
                body: output,
                process: sub.process,
                targetPlatform: platform,
                source: { [sub.name]: sub },
                $options,
            });
            res.send(
                await applyAgeOutputEncryption({
                    res,
                    body,
                    configs: [
                        resolveShareAgeConfig({
                            req,
                            type: 'sub',
                            name,
                            findShareToken,
                        }),
                        sub,
                    ],
                }),
            );
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
        $.error(`🌍 Sub-Store 下载订阅失败\n❌ 未找到订阅：${name}！`);
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
    let { name, nezhaIndex } = req.params;

    const { useMihomoExternal, mihomoMerge, mihomoMergeName, mihomoExternal } =
        getMihomoExternalOptions(req.query);

    const platform =
        req.query.platform ||
        req.query.target ||
        getPlatformFromHeaders(req.headers) ||
        'JSON';

    const allCols = $.read(COLLECTIONS_KEY);
    const collection = findByName(allCols, name);
    const reqUA = req.headers['user-agent'] || req.headers['User-Agent'];
    $.info(
        `正在下载组合订阅：${name}\n请求 User-Agent: ${reqUA}\n请求 target: ${req.query.target}\n实际输出: ${platform}`,
    );
    let {
        ignoreFailedRemoteSub,
        produceType,
        includeUnsupportedProxy,
        resultFormat,
        proxy,
        noCache,
    } = req.query;
    const prettyYaml = req.query.prettyYaml ?? req.query['pretty-yaml'];

    let $options = {
        _req: {
            method: req.method,
            url: req.url,
            path: req.path,
            query: req.query,
            params: req.params,
            headers: req.headers,
            body: req.body,
            socket: {
                remoteAddress: req.socket?.remoteAddress,
            },
        },
    };
    if (req.query.$options) {
        let options = {};
        try {
            // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
            options = JSON.parse(decodeURIComponent(req.query.$options));
        } catch (e) {
            for (const pair of req.query.$options.split('&')) {
                const key = pair.split('=')[0];
                const value = pair.split('=')[1];
                // 部分兼容之前的逻辑 const value = pair.split('=')[1] || true;
                options[key] =
                    value == null || value === ''
                        ? true
                        : decodeURIComponent(value);
            }
        }
        $.info(`传入 $options: ${JSON.stringify(options)}`);
        Object.assign($options, options);
    }

    if (proxy) {
        $.info(`指定远程订阅使用代理/策略 proxy: ${proxy}`);
    }

    if (ignoreFailedRemoteSub != null && ignoreFailedRemoteSub !== '') {
        $.info(`指定忽略失败的远程订阅: ${ignoreFailedRemoteSub}`);
    }
    if (produceType) {
        $.info(`指定生产类型: ${produceType}`);
    }

    if (includeUnsupportedProxy) {
        $.info(`包含官方/商店版不支持的协议: ${includeUnsupportedProxy}`);
    }
    if (prettyYaml) {
        $.info(`指定输出易读 YAML: ${prettyYaml}`);
    }
    if (mihomoMerge) {
        $.info(`指定合并 mihomo External: ${mihomoMerge}`);
    }
    if (mihomoMergeName) {
        $.info(`指定合并 mihomo External 名称: ${mihomoMergeName}`);
    }

    if (useMihomoExternal) {
        $.info(`手动指定了 target 为 SurgeMac, 将使用 mihomo External`);
    }
    if (mihomoExternal) {
        $.info(`手动指定了 mihomo External 链接参数: ${mihomoExternal}`);
    }
    if (noCache) {
        $.info(`指定不使用缓存: ${noCache}`);
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
                    useMihomoExternal,
                    merge: mihomoMerge,
                    mergeName: mihomoMergeName,
                    mihomoExternal,
                    prettyYaml,
                },
                $options,
                proxy,
                noCache,
                ua: reqUA,
            });
            let subUserInfoOfSub;
            // 默认透传第一个子订阅的流量信息，除非 firstSubFlow 显式设置为 false
            if (collection.firstSubFlow !== false) {
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
                            let url =
                                `${sub.url}`
                                    .split(/[\r\n]+/)
                                    .map((i) => i.trim())
                                    .filter((i) => i.length)?.[0] || '';

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
                            if (!$arguments.noFlow && /^https?:/.test(url)) {
                                subUserInfoOfSub = await getFlowHeaders(
                                    $arguments?.insecure
                                        ? `${url}#insecure`
                                        : url,
                                    $arguments.flowUserAgent,
                                    undefined,
                                    proxy || sub.proxy || collection.proxy,
                                    $arguments.flowUrl,
                                    $arguments.flowHeaders,
                                );
                            }
                        } catch (err) {
                            $.error(
                                `组合订阅 ${name} 中的子订阅 ${
                                    sub.name
                                } 获取流量信息时发生错误: ${
                                    err.message ?? err
                                }`,
                            );
                        }
                    }
                    if (sub.subUserinfo) {
                        let subUserInfo;
                        if (/^https?:\/\//.test(sub.subUserinfo)) {
                            try {
                                subUserInfo = await getFlowHeaders(
                                    undefined,
                                    undefined,
                                    undefined,
                                    proxy || sub.proxy,
                                    sub.subUserinfo,
                                );
                            } catch (e) {
                                $.error(
                                    `组合订阅 ${name} 使用自定义流量链接 ${
                                        sub.subUserinfo
                                    } 获取流量信息时发生错误: ${JSON.stringify(
                                        e,
                                    )}`,
                                );
                            }
                        } else {
                            subUserInfo = sub.subUserinfo;
                        }
                        subUserInfoOfSub = [subUserInfo, subUserInfoOfSub]
                            .filter((i) => i)
                            .join('; ');
                    }
                }

                $.info(
                    `组合订阅 ${name} 透传的的流量信息: ${subUserInfoOfSub}`,
                );
            }

            let subUserInfoOfCol;
            if (/^https?:\/\//.test(collection.subUserinfo)) {
                try {
                    subUserInfoOfCol = await getFlowHeaders(
                        undefined,
                        undefined,
                        undefined,
                        proxy || collection.proxy,
                        collection.subUserinfo,
                    );
                } catch (e) {
                    $.error(
                        `组合订阅 ${name} 使用自定义流量链接 ${
                            collection.subUserinfo
                        } 获取流量信息时发生错误: ${JSON.stringify(e)}`,
                    );
                }
            } else {
                subUserInfoOfCol = collection.subUserinfo;
            }
            const subUserInfo = [subUserInfoOfCol, subUserInfoOfSub]
                .filter((i) => i)
                .join('; ');
            if (subUserInfo) {
                const headers = normalizeFlowHeader(subUserInfo, true);
                if (headers?.['subscription-userinfo']) {
                    res.set(
                        'subscription-userinfo',
                        headers['subscription-userinfo'],
                    );
                }
                if (headers?.['profile-web-page-url']) {
                    res.set(
                        'profile-web-page-url',
                        headers['profile-web-page-url'],
                    );
                }
                if (headers?.['plan-name']) {
                    res.set('plan-name', headers['plan-name']);
                }
            }
            if (platform === 'JSON') {
                if (resultFormat === 'nezha') {
                    output = nezhaTransform(output);
                } else if (resultFormat === 'nezha-monitor') {
                    if (!Array.isArray(output) || output.length === 0) {
                        output = buildEmptyNezhaPayload();
                    } else {
                        nezhaIndex = /^\d+$/.test(nezhaIndex)
                            ? parseInt(nezhaIndex, 10)
                            : output.findIndex((i) => i.name === nezhaIndex);
                        output = await nezhaMonitor(
                            output[nezhaIndex],
                            nezhaIndex,
                            req.query,
                        );
                    }
                }
                res.set('Content-Type', 'application/json;charset=utf-8');
            } else {
                res.set('Content-Type', 'text/plain; charset=utf-8');
            }
            if ($options?._res?.headers) {
                Object.entries($options._res.headers).forEach(
                    ([key, value]) => {
                        if (value == null) {
                            res.removeHeader(key);
                        } else {
                            res.set(key, value);
                        }
                    },
                );
            }
            if ($options?._res?.status) {
                res.status($options._res.status);
            }
            const body = await applyResponseTransformers({
                res,
                body: output,
                process: collection.process,
                targetPlatform: platform,
                source: { _collection: collection },
                $options,
            });
            res.send(
                await applyAgeOutputEncryption({
                    res,
                    body,
                    configs: [
                        resolveShareAgeConfig({
                            req,
                            type: 'col',
                            name,
                            findShareToken,
                        }),
                        collection,
                    ],
                }),
            );
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
        $.error(
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

async function nezhaMonitor(proxy, index, query) {
    const result = {
        code: 0,
        message: 'success',
        result: [],
    };

    try {
        const { isLoon, isSurge } = $.env;
        if (!isLoon && !isSurge)
            throw new Error('仅支持 Loon 和 Surge(ability=http-client-policy)');
        const node = ProxyUtils.produce([proxy], isLoon ? 'Loon' : 'Surge');
        if (!node) throw new Error('当前客户端不兼容此节点');
        const monitors = proxy._monitors || [
            {
                name: 'Cloudflare',
                url: 'http://cp.cloudflare.com/generate_204',
                method: 'HEAD',
                number: 3,
                timeout: 2000,
            },
            {
                name: 'Google',
                url: 'http://www.google.com/generate_204',
                method: 'HEAD',
                number: 3,
                timeout: 2000,
            },
        ];
        const number =
            query.number || Math.max(...monitors.map((i) => i.number)) || 3;
        for (const monitor of monitors) {
            const interval = 10 * 60 * 1000;
            const data = {
                monitor_id: monitors.indexOf(monitor),
                server_id: index,
                monitor_name: monitor.name,
                server_name: proxy.name,
                created_at: [],
                avg_delay: [],
            };
            for (let index = 0; index < number; index++) {
                const startedAt = Date.now();
                try {
                    await $.http[(monitor.method || 'HEAD').toLowerCase()]({
                        timeout: monitor.timeout || 2000,
                        url: monitor.url,
                        'policy-descriptor': node,
                        node,
                    });
                    const latency = Date.now() - startedAt;
                    $.info(`${monitor.name} latency: ${latency}`);
                    data.avg_delay.push(latency);
                } catch (e) {
                    $.error(e);
                    data.avg_delay.push(0);
                }

                data.created_at.push(
                    Date.now() - interval * (monitor.number - index - 1),
                );
            }

            result.result.push(data);
        }
    } catch (e) {
        $.error(e);
        result.result.push({
            monitor_id: 0,
            server_id: 0,
            monitor_name: `❌ ${e.message ?? e}`,
            server_name: proxy.name,
            created_at: [Date.now()],
            avg_delay: [0],
        });
    }

    return JSON.stringify(result, null, 2);
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
            let now = Math.round(new Date().getTime() / 1000);
            let time = proxy._unavailable ? 0 : now;

            const uptime = parseInt(proxy._uptime || 0, 10);

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
                    BootTime: now - uptime,
                    CountryCode, // 目前需要
                    Version: '0.0.1',
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
                    Uptime: uptime,
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
