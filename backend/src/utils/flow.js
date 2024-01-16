import { SETTINGS_KEY } from '@/constants';
import { HTTP } from '@/vendor/open-api';
import $ from '@/core/app';
import headersResourceCache from '@/utils/headers-resource-cache';

export function getFlowField(headers) {
    const subkey = Object.keys(headers).filter((k) =>
        /SUBSCRIPTION-USERINFO/i.test(k),
    )[0];
    return headers[subkey];
}
export async function getFlowHeaders(rawUrl, ua, timeout) {
    let url = rawUrl;
    let $arguments = {};
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
    if ($arguments?.noFlow) {
        return;
    }
    const cached = headersResourceCache.get(url);
    let flowInfo;
    if (!$arguments?.noCache && cached) {
        // $.info(`使用缓存的流量信息: ${url}`);
        flowInfo = cached;
    } else {
        const { defaultFlowUserAgent, defaultTimeout } = $.read(SETTINGS_KEY);
        const userAgent =
            ua ||
            defaultFlowUserAgent ||
            'Quantumult%20X/1.0.30 (iPhone14,2; iOS 15.6)';
        const requestTimeout = timeout || defaultTimeout;
        const http = HTTP();
        try {
            // $.info(`使用 HEAD 方法获取流量信息: ${url}`);
            const { headers } = await http.head({
                url: url
                    .split(/[\r\n]+/)
                    .map((i) => i.trim())
                    .filter((i) => i.length)[0],
                headers: {
                    'User-Agent': userAgent,
                },
                timeout: requestTimeout,
            });
            flowInfo = getFlowField(headers);
        } catch (e) {
            $.error(
                `使用 HEAD 方法获取流量信息失败: ${url}: ${e.message ?? e}`,
            );
        }
        if (!flowInfo) {
            $.info(`使用 GET 方法获取流量信息: ${url}`);
            const { headers } = await http.get({
                url: url
                    .split(/[\r\n]+/)
                    .map((i) => i.trim())
                    .filter((i) => i.length)[0],
                headers: {
                    'User-Agent': userAgent,
                },
                timeout: requestTimeout,
            });
            flowInfo = getFlowField(headers);
        }
        if (flowInfo) {
            headersResourceCache.set(url, flowInfo);
        }
    }

    return flowInfo;
}
export function parseFlowHeaders(flowHeaders) {
    if (!flowHeaders) return;
    // unit is KB
    const uploadMatch = flowHeaders.match(/upload=(-?)(\d+)/);
    const upload = Number(uploadMatch[1] + uploadMatch[2]);

    const downloadMatch = flowHeaders.match(/download=(-?)(\d+)/);
    const download = Number(downloadMatch[1] + downloadMatch[2]);

    const total = Number(flowHeaders.match(/total=(\d+)/)[1]);

    // optional expire timestamp
    const match = flowHeaders.match(/expire=(\d+)/);
    const expires = match ? Number(match[1]) : undefined;

    return { expires, total, usage: { upload, download } };
}
export function flowTransfer(flow, unit = 'B') {
    const unitList = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    let unitIndex = unitList.indexOf(unit);

    return flow < 1024
        ? { value: flow.toFixed(1), unit: unit }
        : flowTransfer(flow / 1024, unitList[++unitIndex]);
}
