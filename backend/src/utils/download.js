import { SETTINGS_KEY } from '@/constants';
import { HTTP, ENV } from '@/vendor/open-api';
import { hex_md5 } from '@/vendor/md5';
import { getPolicyDescriptor } from '@/utils';
import resourceCache from '@/utils/resource-cache';
import headersResourceCache from '@/utils/headers-resource-cache';
import {
    getFlowField,
    getFlowHeaders,
    parseFlowHeaders,
    validCheck,
} from '@/utils/flow';
import $ from '@/core/app';
import PROXY_PREPROCESSORS from '@/core/proxy-utils/preprocessors';
const clashPreprocessor = PROXY_PREPROCESSORS.find(
    (processor) => processor.name === 'Clash Pre-processor',
);

const tasks = new Map();

export default async function download(
    rawUrl = '',
    ua,
    timeout,
    customProxy,
    skipCustomCache,
    awaitCustomCache,
    noCache,
    preprocess,
) {
    let $arguments = {};
    let url = rawUrl.replace(/#noFlow$/, '');
    const rawArgs = url.split('#');
    url = url.split('#')[0];
    if (rawArgs.length > 1) {
        try {
            // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
            $arguments = JSON.parse(decodeURIComponent(rawArgs[1]));
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
    const { isNode, isStash, isLoon, isShadowRocket, isQX } = ENV();
    const {
        defaultProxy,
        defaultUserAgent,
        defaultTimeout,
        cacheThreshold: defaultCacheThreshold,
    } = $.read(SETTINGS_KEY);
    const cacheThreshold = defaultCacheThreshold || 1024;
    let proxy = customProxy || defaultProxy;
    if ($.env.isNode) {
        proxy = proxy || eval('process.env.SUB_STORE_BACKEND_DEFAULT_PROXY');
    }
    const userAgent = ua || defaultUserAgent || 'clash.meta';
    const requestTimeout = timeout || defaultTimeout || 8000;
    const id = hex_md5(userAgent + url);

    if ($arguments?.cacheKey === true) {
        $.error(`使用自定义缓存时 cacheKey 的值不能为空`);
        $arguments.cacheKey = undefined;
    }

    const customCacheKey = $arguments?.cacheKey
        ? `#sub-store-cached-custom-${$arguments?.cacheKey}`
        : undefined;

    if (customCacheKey && !skipCustomCache) {
        const customCached = $.read(customCacheKey);
        const cached = resourceCache.get(id);
        if (!noCache && !$arguments?.noCache && cached) {
            $.info(
                `乐观缓存: URL ${url}\n存在有效的常规缓存\n使用常规缓存以避免重复请求`,
            );
            return cached;
        }
        if (customCached) {
            if (awaitCustomCache) {
                $.info(`乐观缓存: URL ${url}\n本次进行请求 尝试更新缓存`);
                try {
                    await download(
                        rawUrl.replace(/(\?|&)cacheKey=.*?(&|$)/, ''),
                        ua,
                        timeout,
                        proxy,
                        true,
                        undefined,
                        undefined,
                        preprocess,
                    );
                } catch (e) {
                    $.error(
                        `乐观缓存: URL ${url} 更新缓存发生错误 ${
                            e.message ?? e
                        }`,
                    );
                    $.info('使用乐观缓存的数据刷新缓存, 防止后续请求');
                    resourceCache.set(id, customCached);
                }
            } else {
                $.info(
                    `乐观缓存: URL ${url}\n本次返回自定义缓存 ${$arguments?.cacheKey}\n并进行请求 尝试异步更新缓存`,
                );
                download(
                    rawUrl.replace(/(\?|&)cacheKey=.*?(&|$)/, ''),
                    ua,
                    timeout,
                    proxy,
                    true,
                    undefined,
                    undefined,
                    preprocess,
                ).catch((e) => {
                    $.error(
                        `乐观缓存: URL ${url} 异步更新缓存发生错误 ${
                            e.message ?? e
                        }`,
                    );
                });
            }
            return customCached;
        }
    }

    // const downloadUrlMatch = url.match(/^\/api\/(file|module)\/(.+)/);
    // if (downloadUrlMatch) {
    //     let type = downloadUrlMatch?.[1];
    //     let name = downloadUrlMatch?.[2];
    //     if (name == null) {
    //         throw new Error(`本地 ${type} URL 无效: ${url}`);
    //     }
    //     name = decodeURIComponent(name);
    //     const key = type === 'module' ? MODULES_KEY : FILES_KEY;
    //     const item = findByName($.read(key), name);
    //     if (!item) {
    //         throw new Error(`找不到本地 ${type}: ${name}`);
    //     }

    //     return item.content;
    // }

    if (!isNode && tasks.has(id)) {
        return tasks.get(id);
    }

    const http = HTTP({
        headers: {
            'User-Agent': userAgent,
            ...(isStash && proxy
                ? { 'X-Stash-Selected-Proxy': encodeURIComponent(proxy) }
                : {}),
            ...(isShadowRocket && proxy ? { 'X-Surge-Policy': proxy } : {}),
        },
        timeout: requestTimeout,
    });

    let result;

    // try to find in app cache
    const cached = resourceCache.get(id);
    if (!noCache && !$arguments?.noCache && cached) {
        $.info(`使用缓存: ${url}, ${userAgent}`);
        result = cached;
        if (customCacheKey) {
            $.info(`URL ${url}\n写入自定义缓存 ${$arguments?.cacheKey}`);
            $.write(cached, customCacheKey);
        }
    } else {
        const insecure = $arguments?.insecure
            ? isNode
                ? { strictSSL: false }
                : { insecure: true }
            : undefined;
        $.info(
            `Downloading...\nUser-Agent: ${userAgent}\nTimeout: ${requestTimeout}\nProxy: ${proxy}\nInsecure: ${!!insecure}\nPreprocess: ${preprocess}\nURL: ${url}`,
        );
        try {
            let { body, headers, statusCode } = await http.get({
                url,
                ...(proxy ? { proxy } : {}),
                ...(isLoon && proxy ? { node: proxy } : {}),
                ...(isQX && proxy ? { opts: { policy: proxy } } : {}),
                ...(proxy ? getPolicyDescriptor(proxy) : {}),
                ...(insecure ? insecure : {}),
            });
            $.info(`statusCode: ${statusCode}`);
            if (statusCode < 200 || statusCode >= 400) {
                throw new Error(`statusCode: ${statusCode}`);
            }

            if (headers) {
                const flowInfo = getFlowField(headers);
                if (flowInfo) {
                    headersResourceCache.set(id, flowInfo);
                }
            }
            if (body.replace(/\s/g, '').length === 0)
                throw new Error(new Error('远程资源内容为空'));
            if (preprocess) {
                try {
                    if (clashPreprocessor.test(body)) {
                        body = clashPreprocessor.parse(body, true);
                    }
                } catch (e) {
                    $.error(`Clash Pre-processor error: ${e}`);
                }
            }
            let shouldCache = true;
            if (cacheThreshold) {
                const size = body.length / 1024;
                if (size > cacheThreshold) {
                    $.info(
                        `资源大小 ${size.toFixed(
                            2,
                        )} KB 超过了 ${cacheThreshold} KB, 不缓存`,
                    );
                    shouldCache = false;
                }
            }
            if (shouldCache) {
                resourceCache.set(id, body);
                if (customCacheKey) {
                    $.info(
                        `URL ${url}\n写入自定义缓存 ${$arguments?.cacheKey}`,
                    );
                    $.write(body, customCacheKey);
                }
            }

            result = body;
        } catch (e) {
            if (customCacheKey) {
                const cached = $.read(customCacheKey);
                if (cached) {
                    $.info(
                        `无法下载 URL ${url}: ${
                            e.message ?? e
                        }\n使用自定义缓存 ${$arguments?.cacheKey}`,
                    );
                    return cached;
                }
            }
            throw new Error(`无法下载 URL ${url}: ${e.message ?? e}`);
        }
    }

    // 检查订阅有效性

    if ($arguments?.validCheck) {
        await validCheck(
            parseFlowHeaders(
                await getFlowHeaders(
                    url,
                    $arguments.flowUserAgent,
                    undefined,
                    proxy,
                    $arguments.flowUrl,
                ),
            ),
        );
    }

    if (!isNode) {
        tasks.set(id, result);
    }
    return result;
}
