import { Buffer } from 'buffer';
import { Base64 } from 'js-base64';

import $ from '@/core/app';
import { SETTINGS_KEY } from '@/constants';
import { getPolicyDescriptor } from '@/utils';
import { hex_md5 } from '@/vendor/md5';
import { ENV, HTTP } from '@/vendor/open-api';
import resourceCache from '@/utils/resource-cache';
import { safeLoad } from '@/utils/yaml';
import { runBackendRequestTask } from '@/utils/request-concurrency';

const CFG_USER_AGENT = 'Mozilla/5.0 (dart:io) SuperAccelerator';
const PROVIDER_SUBSCRIBE_URL_CACHE_PREFIX =
    '#sub-store-cached-provider-subscribe-url-';
const refreshTasks = new Map();

function normalizeString(value) {
    return value == null ? '' : `${value}`;
}

function normalizeHeaders(headers) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
        return {};
    }
    return Object.fromEntries(
        Object.entries(headers)
            .filter(([key, value]) => key && value != null)
            .map(([key, value]) => [`${key}`, `${value}`]),
    );
}

function normalizeDecrypt(decrypt) {
    if (decrypt == null) return null;
    if (typeof decrypt !== 'object' || Array.isArray(decrypt)) {
        throw new Error('API 订阅 decrypt 必须为 null 或对象');
    }
    return {
        key: normalizeString(decrypt.key),
        iv: normalizeString(decrypt.iv),
    };
}

function parseProviderConfig(content) {
    let raw;
    try {
        raw = safeLoad(normalizeString(content));
    } catch (e) {
        throw new Error(`API 订阅 YAML 解析失败: ${e.message ?? e}`);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('API 订阅 YAML 必须为对象');
    }

    const cfgUrls = (
        Array.isArray(raw.cfgUrls)
            ? raw.cfgUrls
            : raw.cfgUrls == null
            ? []
            : [raw.cfgUrls]
    )
        .map((url) => normalizeString(url).trim())
        .filter(Boolean);
    if (cfgUrls.length === 0) {
        throw new Error('API 订阅 cfgUrls 不能为空');
    }

    return {
        cfgUrls,
        username: normalizeString(raw.username),
        password: normalizeString(raw.password),
        headers: normalizeHeaders(raw.headers),
        decrypt: normalizeDecrypt(raw.decrypt),
    };
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${stableStringify(value[key])}`,
            )
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

function getProviderSubscribeUrlCacheKey(config) {
    return `${PROVIDER_SUBSCRIBE_URL_CACHE_PREFIX}${hex_md5(
        stableStringify(config),
    )}`;
}

function getCachedProviderSubscribeUrl(config) {
    return normalizeString(
        $.read(getProviderSubscribeUrlCacheKey(config)),
    ).trim();
}

function getCachedProviderRequestUrl(sub) {
    const config = parseProviderConfig(sub.content);
    const subscribeUrl = getCachedProviderSubscribeUrl(config);
    return subscribeUrl
        ? buildProviderDownloadUrl(subscribeUrl, config.headers)
        : '';
}

function setCachedProviderSubscribeUrl(config, url) {
    $.write(
        normalizeString(url).trim(),
        getProviderSubscribeUrlCacheKey(config),
    );
}

function getHeader(headers, name) {
    const target = name.toLowerCase();
    const entry = Object.entries(headers).find(
        ([key]) => key.toLowerCase() === target,
    );
    return entry?.[1];
}

function normalizeBaseURL(baseURL) {
    return normalizeString(baseURL).trim().replace(/\/+$/, '');
}

function baseURLCandidates(baseURL) {
    const normalized = normalizeBaseURL(baseURL);
    if (!normalized) return [];
    if (normalized.endsWith('/api/v1')) return [normalized];
    if (normalized.endsWith('/api')) {
        return [normalized, `${normalized}/v1`];
    }
    return [`${normalized}/api/v1`];
}

function fallbackSubscribeURL(baseURL, token) {
    return `${normalizeBaseURL(
        baseURL,
    )}/client/subscribe?token=${encodeURIComponent(token)}`;
}

function decodeBase64String(value) {
    const normalized = normalizeString(value)
        .trim()
        .replace(/^\uFEFF/, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    try {
        return Base64.decode(normalized);
    } catch (e) {
        throw new Error(`cfgUrl Base64 解码失败: ${e.message ?? e}`);
    }
}

function getProviderRequestOptions({ headers, proxy, url }) {
    const { isLoon, isShadowRocket, isQX, isStash } = ENV();
    return {
        url,
        ...(proxy ? { proxy } : {}),
        ...(isLoon && proxy ? { node: proxy } : {}),
        ...(isQX && proxy ? { opts: { policy: proxy } } : {}),
        ...(proxy ? getPolicyDescriptor(proxy) : {}),
        headers: {
            ...headers,
            ...(isStash && proxy
                ? { 'X-Stash-Selected-Proxy': encodeURIComponent(proxy) }
                : {}),
            ...(isShadowRocket && proxy ? { 'X-Surge-Policy': proxy } : {}),
        },
    };
}

async function providerRequest({
    method = 'get',
    url,
    encoding,
    headers = {},
    body,
    proxy: customProxy,
}) {
    const settings = $.read(SETTINGS_KEY) || {};
    let proxy = customProxy || settings.defaultProxy;
    if ($.env.isNode) {
        proxy = proxy || globalThis.process?.env?.SUB_STORE_BACKEND_DEFAULT_PROXY;
    }
    const timeout = settings.defaultTimeout || 8000;
    const http = HTTP({ timeout });
    const options = getProviderRequestOptions({ headers, proxy, url });
    if (body !== undefined) options.body = JSON.stringify(body);
    if (encoding !== undefined) options.encoding = encoding;
    const response = await runBackendRequestTask(
        () => http[method](options),
        'provider',
    );
    if (response.statusCode !== 200 || response.body == null) {
        throw new Error(`${url} 返回状态码 ${response.statusCode}`);
    }
    return response;
}

async function fetchConfigHosts(cfgUrl, proxy) {
    const response = await providerRequest({
        url: cfgUrl,
        headers: { 'User-Agent': CFG_USER_AGENT },
        proxy,
    });
    const decoded = decodeBase64String(response.body);
    let config;
    try {
        config = JSON.parse(decoded);
    } catch (e) {
        throw new Error(`cfgUrl JSON 解析失败: ${e.message ?? e}`);
    }
    const hosts = [
        ...(Array.isArray(config.hosts) ? config.hosts : []),
        config.host_source,
    ]
        .map((host) => normalizeString(host).trim())
        .filter(Boolean);
    if (hosts.length === 0) throw new Error('cfgUrl 未返回可用 hosts');
    return hosts;
}

async function fetchBaseURLs(config, proxy) {
    const results = await Promise.all(
        config.cfgUrls.map(async (cfgUrl) => {
            try {
                return await fetchConfigHosts(cfgUrl, proxy);
            } catch (error) {
                $.error(`API 订阅 cfgUrl ${cfgUrl} 获取失败: ${error}`);
                return [];
            }
        }),
    );
    const seen = new Set();
    const baseURLs = [];
    results.flat().forEach((host) => {
        baseURLCandidates(host).forEach((candidate) => {
            if (!seen.has(candidate)) {
                seen.add(candidate);
                baseURLs.push(candidate);
            }
        });
    });
    if (baseURLs.length === 0) {
        throw new Error('API 订阅未找到可用的服务地址');
    }
    return baseURLs;
}

async function login(baseURL, config, headers, proxy) {
    const response = await providerRequest({
        method: 'post',
        url: `${baseURL}/passport/auth/login`,
        headers: {
            ...headers,
            'Content-Type': 'application/json',
        },
        body: {
            email: config.username,
            password: config.password,
        },
        proxy,
    });
    const data = JSON.parse(response.body);
    const authData = normalizeString(data?.data?.auth_data);
    if (!authData) throw new Error('登录响应缺少 auth_data');
    return authData;
}

async function getSubscribe(baseURL, authData, headers, proxy) {
    const response = await providerRequest({
        url: `${baseURL}/user/getSubscribe`,
        headers: {
            ...headers,
            Authorization: authData,
        },
        proxy,
    });
    const data = JSON.parse(response.body)?.data || {};
    const subscribeUrl = normalizeString(data.subscribe_url).trim();
    const token = normalizeString(data.token).trim();
    if (!subscribeUrl && !token) {
        throw new Error('getSubscribe 响应缺少 subscribe_url 或 token');
    }
    return { subscribeUrl, token };
}

function buildProviderDownloadUrl(url, headers) {
    const normalizedHeaders = normalizeHeaders(headers);
    if (Object.keys(normalizedHeaders).length === 0) return url;
    const baseUrl = normalizeString(url).split('#')[0];
    return `${baseUrl}#${encodeURIComponent(
        JSON.stringify({ headers: JSON.stringify(normalizedHeaders) }),
    )}`;
}

function loadNodeBuiltin(name) {
    const processObject = globalThis.process;
    if (typeof processObject?.getBuiltinModule === 'function') {
        return processObject.getBuiltinModule(name);
    }
    const mainModule = processObject?.mainModule;
    if (typeof mainModule?.require !== 'function') {
        throw new Error(`当前 Node.js 环境无法加载内置模块 ${name}`);
    }
    return mainModule.require(name);
}

function gunzipIfNeeded(body) {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
    if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
        return bytes;
    }
    if (!$.env.isNode) {
        throw new Error('当前运行环境不支持 API 订阅 gzip 解密');
    }
    const zlib = loadNodeBuiltin('zlib');
    return zlib.gunzipSync(bytes);
}

function decodeProviderSubscriptionBody(body, decrypt) {
    if (!decrypt) return normalizeString(body);
    if (!$.env.isNode) {
        throw new Error('当前运行环境不支持 API 订阅 AES 解密');
    }
    const crypto = loadNodeBuiltin('crypto');
    const encoded = gunzipIfNeeded(body).toString('utf8').trim();
    const key = Buffer.from(decrypt.key);
    const iv = Buffer.from(decrypt.iv);
    if (key.length !== 16 || iv.length !== 16) {
        throw new Error('API 订阅 AES key 和 iv 必须均为 16 字节');
    }
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const plainText = Buffer.concat([
        decipher.update(Buffer.from(encoded, 'base64')),
        decipher.final(),
    ]);
    return Buffer.from(plainText.toString('utf8').trim(), 'base64').toString(
        'utf8',
    );
}

async function fetchEncryptedProviderContent({ url, headers, proxy, noCache }) {
    const id = hex_md5(`provider-encrypted:${stableStringify(headers)}:${url}`);
    let encoded = !noCache ? resourceCache.get(id) : null;
    let bytes;
    if (encoded) {
        bytes = Buffer.from(encoded, 'base64');
    } else {
        const response = await providerRequest({
            url,
            headers,
            proxy,
            encoding: null,
        });
        bytes = Buffer.from(response.body);
        if (bytes.length === 0) throw new Error('API 订阅内容为空');

        const settings = $.read(SETTINGS_KEY) || {};
        const cacheThreshold = settings.cacheThreshold || 1024;
        if (!cacheThreshold || bytes.length / 1024 <= cacheThreshold) {
            encoded = bytes.toString('base64');
            resourceCache.set(id, encoded);
        }
    }
    return bytes;
}

async function fetchProviderSubscription(sub, options = {}) {
    const config = parseProviderConfig(sub.content);
    const cacheKey = getProviderSubscribeUrlCacheKey(config);
    const proxy = options.proxy || sub.proxy;
    const authHeaders = {};
    const configuredUserAgent = getHeader(config.headers, 'user-agent');
    if (configuredUserAgent) authHeaders['User-Agent'] = configuredUserAgent;

    const fetchContent = async (subscribeUrl) => {
        const requestUrl = buildProviderDownloadUrl(
            subscribeUrl,
            config.headers,
        );
        const downloaded = config.decrypt
            ? await fetchEncryptedProviderContent({
                  url: subscribeUrl,
                  headers: config.headers,
                  proxy,
                  noCache: options.noCache || sub.noCache,
              })
            : await options.download(
                  requestUrl,
                  undefined,
                  undefined,
                  proxy,
                  undefined,
                  options.awaitCustomCache,
                  options.noCache || sub.noCache,
                  true,
                  { returnRaw: true },
              );
        if (!config.decrypt) {
            return {
                result: downloaded.result ?? downloaded,
                raw: downloaded.raw ?? downloaded,
                subscribeUrl,
                requestUrl,
            };
        }
        const decoded = decodeProviderSubscriptionBody(
            downloaded.raw ?? downloaded.result ?? downloaded,
            config.decrypt,
        );
        return {
            result: decoded,
            raw: decoded,
            subscribeUrl,
            requestUrl,
        };
    };

    const cachedUrl = getCachedProviderSubscribeUrl(config);
    if (cachedUrl) {
        try {
            return await fetchContent(cachedUrl);
        } catch (error) {
            $.info(`API 订阅缓存 subscribeUrl 已失效，将重新获取: ${error}`);
            setCachedProviderSubscribeUrl(config, '');
        }
    }

    if (refreshTasks.has(cacheKey)) return refreshTasks.get(cacheKey);

    const task = (async () => {
        const refreshedCachedUrl = getCachedProviderSubscribeUrl(config);
        if (refreshedCachedUrl) return fetchContent(refreshedCachedUrl);

        const baseURLs = await fetchBaseURLs(config, proxy);
        let lastError;
        for (const baseURL of baseURLs) {
            try {
                const authData = await login(
                    baseURL,
                    config,
                    authHeaders,
                    proxy,
                );
                const { subscribeUrl, token } = await getSubscribe(
                    baseURL,
                    authData,
                    authHeaders,
                    proxy,
                );
                const candidates = [subscribeUrl];
                if (token) {
                    baseURLs.forEach((fallbackBaseURL) => {
                        candidates.push(
                            fallbackSubscribeURL(fallbackBaseURL, token),
                        );
                    });
                }
                for (const candidate of candidates.filter(Boolean)) {
                    try {
                        const result = await fetchContent(candidate);
                        setCachedProviderSubscribeUrl(config, candidate);
                        return result;
                    } catch (error) {
                        lastError = error;
                    }
                }
            } catch (error) {
                lastError = error;
            }
        }
        throw new Error(
            `API 订阅获取失败: ${
                lastError?.message ?? lastError ?? '无可用订阅地址'
            }`,
        );
    })();
    refreshTasks.set(cacheKey, task);
    try {
        return await task;
    } finally {
        refreshTasks.delete(cacheKey);
    }
}

export {
    CFG_USER_AGENT,
    PROVIDER_SUBSCRIBE_URL_CACHE_PREFIX,
    baseURLCandidates,
    buildProviderDownloadUrl,
    decodeProviderSubscriptionBody,
    fallbackSubscribeURL,
    getCachedProviderRequestUrl,
    fetchProviderSubscription,
    getCachedProviderSubscribeUrl,
    getProviderSubscribeUrlCacheKey,
    parseProviderConfig,
};
