import { getPlatformFromHeaders } from '@/utils/user-agent';
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
import { applyResponseTransformers } from '@/restful/response-transformer';
import {
    applyAgeOutputEncryption,
    resolveShareAgeConfig,
} from '@/restful/age-output';
import { findShareToken } from '@/restful/token';
import { maskAgeSecretInUrl } from '@/utils/age';

function getMihomoExternalOptions(query) {
    const useMihomoExternal = query.target === 'SurgeMac';
    const mihomoExternal = useMihomoExternal ? query.mihomoExternal : undefined;
    const mihomoMerge = useMihomoExternal ? query.mihomoMerge : undefined;
    const mihomoMergeName = useMihomoExternal
        ? query.mihomoMergeName
        : undefined;
    let mihomoLocalPort;
    if (useMihomoExternal && query.mihomoLocalPort != null) {
        const parsed = parseInt(query.mihomoLocalPort, 10);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
            mihomoLocalPort = parsed;
        }
    }

    return {
        useMihomoExternal,
        mihomoExternal,
        mihomoMerge,
        mihomoMergeName,
        mihomoLocalPort,
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
}

async function downloadSubscription(req, res) {
    const { name } = req.params;
    const isShareRoute = req.path?.startsWith('/share/');

    const {
        useMihomoExternal,
        mihomoMerge,
        mihomoMergeName,
        mihomoExternal,
        mihomoLocalPort,
    } = getMihomoExternalOptions(req.query);

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
        proxy,
        noCache,
        _fakeNode,
        fakeSub: _fakeSub,
    } = req.query;
    const prettyYaml = req.query.prettyYaml ?? req.query['pretty-yaml'];
    const native = req.query.native != null;

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
    if (req.query.noFlow) {
        $.info(`指定不查询订阅流量信息: ${req.query.noFlow}`);
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
            const noFlow = req.query.noFlow || sub.noFlow;
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
                    localPort: mihomoLocalPort,
                    prettyYaml,
                    native,
                },
                $options,
                proxy,
                noCache,
                noFlow,
            };
            if (_fakeNode || _fakeSub) {
                if(_fakeNode) {
                    $.info(`返回假节点信息`);
                }
                delete opt.name;
                opt.subscription = fakeSub;
            }
            const output = await produceArtifact(opt);
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
                    if (
                        !noFlow &&
                        !$arguments.noFlow &&
                        /^https?/.test(url)
                    ) {
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
            if (!noFlow && sub.subUserinfo) {
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
                executionContext: { noFlow },
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
    const { name } = req.params;

    const {
        useMihomoExternal,
        mihomoMerge,
        mihomoMergeName,
        mihomoExternal,
        mihomoLocalPort,
    } = getMihomoExternalOptions(req.query);

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
        proxy,
        noCache,
    } = req.query;
    const prettyYaml = req.query.prettyYaml ?? req.query['pretty-yaml'];
    const native = req.query.native != null;

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
    if (req.query.noFlow) {
        $.info(`指定不查询订阅流量信息: ${req.query.noFlow}`);
    }

    if (collection) {
        try {
            const noFlow = req.query.noFlow || collection.noFlow;
            const output = await produceArtifact({
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
                    localPort: mihomoLocalPort,
                    prettyYaml,
                    native,
                },
                $options,
                proxy,
                noCache,
                noFlow,
                ua: reqUA,
            });
            let subUserInfoOfSub;
            // 默认透传第一个子订阅的流量信息，除非 firstSubFlow 显式设置为 false
            if (!noFlow && collection.firstSubFlow !== false) {
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
                            if (
                                !sub.noFlow &&
                                !$arguments.noFlow &&
                                /^https?:/.test(url)
                            ) {
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
                    if (!sub.noFlow && sub.subUserinfo) {
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
            if (!noFlow) {
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
                executionContext: { noFlow },
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
