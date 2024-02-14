import { SETTINGS_KEY } from '@/constants';
import { HTTP, ENV } from '@/vendor/open-api';
import { hex_md5 } from '@/vendor/md5';
import resourceCache from '@/utils/resource-cache';
import headersResourceCache from '@/utils/headers-resource-cache';
import {
    getFlowField,
    getFlowHeaders,
    parseFlowHeaders,
    validCheck,
} from '@/utils/flow';
import $ from '@/core/app';

const tasks = new Map();

export default async function download(rawUrl, ua, timeout) {
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

    const { isNode } = ENV();
    const { defaultUserAgent, defaultTimeout } = $.read(SETTINGS_KEY);
    const userAgent = ua || defaultUserAgent || 'clash.meta';
    const requestTimeout = timeout || defaultTimeout;
    const id = hex_md5(userAgent + url);
    if (!isNode && tasks.has(id)) {
        return tasks.get(id);
    }

    const http = HTTP({
        headers: {
            'User-Agent': userAgent,
        },
        timeout: requestTimeout,
    });

    let result;

    // try to find in app cache
    const cached = resourceCache.get(id);
    if (!$arguments?.noCache && cached) {
        $.info(`使用缓存: ${url}`);
        result = cached;
    } else {
        $.info(
            `Downloading...\nUser-Agent: ${userAgent}\nTimeout: ${requestTimeout}\nURL: ${url}`,
        );
        try {
            const { body, headers } = await http.get(url);

            if (headers) {
                const flowInfo = getFlowField(headers);
                if (flowInfo) {
                    headersResourceCache.set(url, flowInfo);
                }
            }
            if (body.replace(/\s/g, '').length === 0)
                throw new Error(new Error('远程资源内容为空'));

            resourceCache.set(id, body);
            result = body;
        } catch (e) {
            throw new Error(`无法下载 URL ${url}: ${e.message ?? e}`);
        }
    }

    // 检查订阅有效性

    if ($arguments?.validCheck) {
        await validCheck(parseFlowHeaders(await getFlowHeaders(url)));
    }

    if (!isNode) {
        tasks.set(id, result);
    }
    return result;
}
