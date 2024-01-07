import { SETTINGS_KEY } from '@/constants';
import { HTTP } from '@/vendor/open-api';
import $ from '@/core/app';

export async function getFlowHeaders(url, ua, timeout) {
    const { defaultFlowUserAgent, defaultTimeout } = $.read(SETTINGS_KEY);
    const userAgent =
        ua ||
        defaultFlowUserAgent ||
        'Quantumult%20X/1.0.30 (iPhone14,2; iOS 15.6)';
    const requestTimeout = timeout || defaultTimeout;
    const http = HTTP();
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
    const subkey = Object.keys(headers).filter((k) =>
        /SUBSCRIPTION-USERINFO/i.test(k),
    )[0];
    return headers[subkey];
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
