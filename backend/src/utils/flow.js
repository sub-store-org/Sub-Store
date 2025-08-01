import { SETTINGS_KEY } from '@/constants';
import { HTTP, ENV } from '@/vendor/open-api';
import { hex_md5 } from '@/vendor/md5';
import { getPolicyDescriptor } from '@/utils';
import $ from '@/core/app';
import headersResourceCache from '@/utils/headers-resource-cache';

export function getFlowField(headers) {
    const keys = Object.keys(headers);
    let sub = '';
    let webPage = '';
    for (let k of keys) {
        const lower = k.toLowerCase();
        if (lower === 'subscription-userinfo') {
            sub = headers[k];
        } else if (lower === 'profile-web-page-url') {
            webPage = headers[k];
        }
    }

    return `${sub || ''}${
        webPage ? `; app_url=${encodeURIComponent(webPage)}` : ''
    }`;
}
export async function getFlowHeaders(
    rawUrl,
    ua,
    timeout,
    customProxy,
    flowUrl,
) {
    let url = flowUrl || rawUrl || '';
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
    if ($arguments?.noFlow || !/^https?/.test(url)) {
        return;
    }
    const { isStash, isLoon, isShadowRocket, isQX } = ENV();
    const insecure = $arguments?.insecure
        ? $.env.isNode
            ? { strictSSL: false }
            : { insecure: true }
        : undefined;
    const { defaultProxy, defaultFlowUserAgent, defaultTimeout } =
        $.read(SETTINGS_KEY);
    let proxy = customProxy || defaultProxy;
    if ($.env.isNode) {
        proxy = proxy || eval('process.env.SUB_STORE_BACKEND_DEFAULT_PROXY');
    }
    const userAgent = ua || defaultFlowUserAgent || 'clash';
    const requestTimeout = timeout || defaultTimeout || 8000;
    const id = hex_md5(userAgent + url);
    const cached = headersResourceCache.get(id);
    let flowInfo;
    if (!$arguments?.noCache && cached) {
        $.info(`使用缓存的流量信息: ${url}, ${userAgent}`);
        flowInfo = cached;
    } else {
        const http = HTTP();
        if (flowUrl) {
            $.info(
                `使用 GET 方法从响应体获取流量信息: ${flowUrl}, User-Agent: ${
                    userAgent || ''
                }, Insecure: ${!!insecure}, Proxy: ${proxy}`,
            );
            const { body } = await http.get({
                url: flowUrl,
                headers: {
                    'User-Agent': userAgent,
                },
                timeout: requestTimeout,
                ...(proxy ? { proxy } : {}),
                ...(isLoon && proxy ? { node: proxy } : {}),
                ...(isQX && proxy ? { opts: { policy: proxy } } : {}),
                ...(proxy ? getPolicyDescriptor(proxy) : {}),
                ...(insecure ? insecure : {}),
            });
            flowInfo = body;
        } else {
            try {
                $.info(
                    `使用 HEAD 方法从响应头获取流量信息: ${url}, User-Agent: ${
                        userAgent || ''
                    }, Insecure: ${!!insecure}, Proxy: ${proxy}`,
                );
                const { headers } = await http.head({
                    url: url
                        .split(/[\r\n]+/)
                        .map((i) => i.trim())
                        .filter((i) => i.length)[0],
                    headers: {
                        'User-Agent': userAgent,
                        ...(isStash && proxy
                            ? {
                                  'X-Stash-Selected-Proxy':
                                      encodeURIComponent(proxy),
                              }
                            : {}),
                        ...(isShadowRocket && proxy
                            ? { 'X-Surge-Policy': proxy }
                            : {}),
                    },
                    timeout: requestTimeout,
                    ...(proxy ? { proxy } : {}),
                    ...(isLoon && proxy ? { node: proxy } : {}),
                    ...(isQX && proxy ? { opts: { policy: proxy } } : {}),
                    ...(proxy ? getPolicyDescriptor(proxy) : {}),
                    ...(insecure ? insecure : {}),
                });
                flowInfo = getFlowField(headers);
            } catch (e) {
                $.error(
                    `使用 HEAD 方法从响应头获取流量信息失败: ${url}, User-Agent: ${
                        userAgent || ''
                    }, Insecure: ${!!insecure}, Proxy: ${proxy}: ${
                        e.message ?? e
                    }`,
                );
            }
            if (!flowInfo) {
                $.info(
                    `使用 GET 方法获取流量信息: ${url}, User-Agent: ${
                        userAgent || ''
                    }, Insecure: ${!!insecure}, Proxy: ${proxy}`,
                );
                const { headers } = await http.get({
                    url: url
                        .split(/[\r\n]+/)
                        .map((i) => i.trim())
                        .filter((i) => i.length)[0],
                    headers: {
                        'User-Agent': userAgent,
                        ...(isStash && proxy
                            ? {
                                  'X-Stash-Selected-Proxy':
                                      encodeURIComponent(proxy),
                              }
                            : {}),
                        ...(isShadowRocket && proxy
                            ? { 'X-Surge-Policy': proxy }
                            : {}),
                    },
                    timeout: requestTimeout,
                    ...(proxy ? { proxy } : {}),
                    ...(isLoon && proxy ? { node: proxy } : {}),
                    ...(isQX && proxy ? { opts: { policy: proxy } } : {}),
                    ...(proxy ? getPolicyDescriptor(proxy) : {}),
                    ...(insecure ? insecure : {}),
                });
                flowInfo = getFlowField(headers);
            }
        }
        if (flowInfo) {
            flowInfo = flowInfo.trim();
        }
        if (flowInfo) {
            headersResourceCache.set(id, flowInfo);
        }
    }

    return flowInfo;
}
export function parseFlowHeaders(flowHeaders) {
    if (!flowHeaders) return;
    // unit is KB
    const uploadMatch = flowHeaders.match(
        /upload=([-+]?)([0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/,
    );
    const upload = Number(uploadMatch[1] + uploadMatch[2]);

    const downloadMatch = flowHeaders.match(
        /download=([-+]?)([0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/,
    );
    const download = Number(downloadMatch[1] + downloadMatch[2]);
    const totalMatch = flowHeaders.match(
        /total=([-+]?)([0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/,
    );
    const total = Number(totalMatch[1] + totalMatch[2]);

    // optional expire timestamp
    const expireMatch = flowHeaders.match(
        /expire=([-+]?)([0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/,
    );
    const expires = expireMatch
        ? Number(expireMatch[1] + expireMatch[2])
        : undefined;

    const remainingDaysMatch = flowHeaders.match(/reset_day=([0-9]+)/);
    const remainingDays = remainingDaysMatch
        ? Number(remainingDaysMatch[1])
        : undefined;

    const appUrlMatch = flowHeaders.match(/app_url=(.*?)\s*?(;|$)/);
    const appUrl = appUrlMatch ? decodeURIComponent(appUrlMatch[1]) : undefined;

    const planNameMatch = flowHeaders.match(/plan_name=(.*?)\s*?(;|$)/);
    const planName = planNameMatch
        ? decodeURIComponent(planNameMatch[1])
        : undefined;

    return {
        expires,
        total,
        usage: { upload, download },
        remainingDays,
        appUrl,
        planName,
    };
}

export function flowTransfer(flow, unit = 'B') {
    const unitList = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let unitIndex = unitList.indexOf(unit);

    return flow < 1024 || unitIndex === unitList.length - 1
        ? { value: (Math.round(flow * 100) / 100).toString(), unit: unit }
        : flowTransfer(flow / 1024, unitList[++unitIndex]);
}

export function validCheck(flow) {
    if (!flow) {
        throw new Error('没有流量信息');
    }
    if (flow?.expires && flow.expires * 1000 < Date.now()) {
        const date = new Date(flow.expires * 1000).toLocaleDateString();
        throw new Error(`订阅已过期: ${date}`);
    }
    if (flow?.total) {
        const upload = flow.usage?.upload || 0;
        const download = flow.usage?.download || 0;
        if (flow.total - upload - download < 0) {
            const current = upload + download;
            const currT = flowTransfer(Math.abs(current));
            currT.value = current < 0 ? '-' + currT.value : currT.value;
            const totalT = flowTransfer(flow.total);
            throw new Error(
                `流量已用完: ${currT.value} ${currT.unit} / ${totalT.value} ${totalT.unit}`,
            );
        }
    }
}

export function getRmainingDays(opt = {}) {
    try {
        let { resetDay, startDate, cycleDays } = opt;
        if (['string', 'number'].includes(typeof opt)) {
            resetDay = opt;
        }

        if (startDate && cycleDays) {
            cycleDays = parseInt(cycleDays);
            if (isNaN(cycleDays) || cycleDays <= 0)
                throw new Error('重置周期应为正整数');
            if (!startDate || !Date.parse(startDate))
                throw new Error('开始日期不合法');

            const start = new Date(startDate);
            const today = new Date();
            start.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            if (start.getTime() > today.getTime())
                throw new Error('开始日期应早于现在');

            let resetDate = new Date(startDate);
            resetDate.setDate(resetDate.getDate() + cycleDays);

            while (resetDate < today) {
                resetDate.setDate(resetDate.getDate() + cycleDays);
            }

            resetDate.setHours(0, 0, 0, 0);
            const timeDiff = resetDate.getTime() - today.getTime();
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

            return daysDiff;
        } else {
            if (!resetDay) return;
            resetDay = parseInt(resetDay);
            if (isNaN(resetDay) || resetDay <= 0 || resetDay > 31)
                throw new Error('月重置日应为 1-31 之间的整数');
            let now = new Date();
            let today = now.getDate();
            let month = now.getMonth();
            let year = now.getFullYear();
            let daysInMonth;

            if (resetDay > today) {
                daysInMonth = 0;
            } else {
                daysInMonth = new Date(year, month + 1, 0).getDate();
            }

            return daysInMonth - today + resetDay;
        }
    } catch (e) {
        $.error(`getRmainingDays failed: ${e.message ?? e}`);
    }
}

export function normalizeFlowHeader(flowHeaders) {
    try {
        // 使用 Map 保持顺序并处理重复键
        const kvMap = new Map();

        flowHeaders
            .split(';')
            .map((p) => p.trim())
            .filter(Boolean)
            .forEach((pair) => {
                const eqIndex = pair.indexOf('=');
                if (eqIndex === -1) return;

                const key = pair.slice(0, eqIndex).trim();
                const encodedValue = pair.slice(eqIndex + 1).trim();

                // 只保留第一个出现的 key
                if (!kvMap.has(key)) {
                    try {
                        // 解码 URI 组件并保留原始值作为 fallback
                        let decodedValue = decodeURIComponent(encodedValue);
                        if (
                            ['upload', 'download', 'total', 'expire'].includes(
                                key,
                            )
                        ) {
                            try {
                                decodedValue = Number(decodedValue).toFixed(0);
                                if (
                                    ['expire'].includes(key) &&
                                    decodedValue <= 0
                                ) {
                                    decodedValue = '';
                                }
                            } catch (e) {
                                $.error(
                                    `Failed to convert value for key "${key}=${encodedValue}": ${
                                        e.message ?? e
                                    }`,
                                );
                            }
                        }
                        kvMap.set(key, decodedValue);
                    } catch (e) {
                        kvMap.set(key, encodedValue);
                    }
                }
            });

        // 拼接标准化字符串
        return Array.from(kvMap.entries())
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`) // 重新编码保持兼容性
            .join('; ');
    } catch (e) {
        $.error(`normalizeFlowHeader failed: ${e.message ?? e}`);
        return flowHeaders;
    }
}
