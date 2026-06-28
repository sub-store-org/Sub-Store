import resourceCache from '@/utils/resource-cache';
import scriptResourceCache from '@/utils/script-resource-cache';
import { isIPv4, isIPv6, ipAddress, isPlainObject } from '@/utils';
import { FULL } from '@/utils/logical';
import { getFlag, removeFlag } from '@/utils/geo';
import { resolveDns } from '@/utils/dns';
import lodash from 'lodash';
import $ from '@/core/app';
import { hex_md5 } from '@/vendor/md5';
import { ProxyUtils } from '@/core/proxy-utils';
import { produceArtifact } from '@/restful/sync';
import { isMihomoConfigFile } from '@/utils/file-type';
import { SETTINGS_KEY } from '@/constants';
import YAML from '@/utils/yaml';

import env from '@/utils/env';
import {
    getFlowField,
    getFlowHeaders,
    parseFlowHeaders,
    validCheck,
    flowTransfer,
    getRmainingDays,
    normalizeFlowHeader,
} from '@/utils/flow';

export const RESPONSE_TRANSFORMER = 'Response Transformer';

export function isResponseTransformerType(type) {
    return type === RESPONSE_TRANSFORMER;
}

function trimWrap(str) {
    if (str.startsWith('<') && str.endsWith('>')) {
        return str.slice(1, -1);
    }
    return str;
}
function deepMerge(target, _other) {
    const other = typeof _other === 'string' ? JSON.parse(_other) : _other;
    for (const key in other) {
        // Only recurse into JSON-like patch objects. YAML can surface non-plain
        // objects (for example timestamps), and those should be assigned as
        // values instead of being treated as nested config maps.
        if (isPlainObject(other[key])) {
            if (key.endsWith('!')) {
                const k = trimWrap(key.slice(0, -1));
                target[k] = other[key];
            } else {
                const k = trimWrap(key);
                if (!target[k]) Object.assign(target, { [k]: {} });
                deepMerge(target[k], other[k]);
            }
        } else if (Array.isArray(other[key])) {
            if (key.startsWith('+')) {
                const k = trimWrap(key.slice(1));
                if (!target[k]) Object.assign(target, { [k]: [] });
                target[k] = [...other[key], ...target[k]];
            } else if (key.endsWith('+')) {
                const k = trimWrap(key.slice(0, -1));
                if (!target[k]) Object.assign(target, { [k]: [] });
                target[k] = [...target[k], ...other[key]];
            } else {
                const k = trimWrap(key);
                Object.assign(target, { [k]: other[key] });
            }
        } else {
            Object.assign(target, { [key]: other[key] });
        }
    }
    return target;
}
/**
 The rule "(name CONTAINS "🇨🇳") AND (port IN [80, 443])" can be expressed as follows:
 {
    operator: "AND",
    child: [
        {
            attr: "name",
            proposition: "CONTAINS",
            value: "🇨🇳"
        },
        {
            attr: "port",
            proposition: "IN",
            value: [80, 443]
        }
    ]
}
 */

function ConditionalFilter({ rule }) {
    return {
        name: 'Conditional Filter',
        func: (proxies) => {
            return proxies.map((proxy) => isMatch(rule, proxy));
        },
    };
}

function isMatch(rule, proxy) {
    // leaf node
    if (!rule.operator) {
        switch (rule.proposition) {
            case 'IN':
                return rule.value.indexOf(proxy[rule.attr]) !== -1;
            case 'CONTAINS':
                if (typeof proxy[rule.attr] !== 'string') return false;
                return proxy[rule.attr].indexOf(rule.value) !== -1;
            case 'EQUALS':
                return proxy[rule.attr] === rule.value;
            case 'EXISTS':
                return (
                    proxy[rule.attr] !== null ||
                    typeof proxy[rule.attr] !== 'undefined'
                );
            default:
                throw new Error(`Unknown proposition: ${rule.proposition}`);
        }
    }

    // operator nodes
    switch (rule.operator) {
        case 'AND':
            return rule.child.every((child) => isMatch(child, proxy));
        case 'OR':
            return rule.child.some((child) => isMatch(child, proxy));
        case 'NOT':
            return !isMatch(rule.child, proxy);
        default:
            throw new Error(`Unknown operator: ${rule.operator}`);
    }
}

function QuickSettingOperator(args) {
    return {
        name: 'Quick Setting Operator',
        func: (proxies) => {
            if (get(args.useless)) {
                const filter = UselessFilter();
                const selected = filter.func(proxies);
                proxies = proxies.filter(
                    (p, i) => selected[i] && p.port > 0 && p.port <= 65535,
                );
            }

            return proxies.map((proxy) => {
                proxy.udp = get(args.udp, proxy.udp);
                proxy.tfo = get(args.tfo, proxy.tfo);
                proxy['fast-open'] = get(args.tfo, proxy['fast-open']);
                proxy['skip-cert-verify'] = get(
                    args.scert,
                    proxy['skip-cert-verify'],
                );
                if (proxy.type === 'vmess') {
                    proxy.aead = get(args['vmess aead'], proxy.aead);
                }
                if (['snell', 'anytls', 'trusttunnel'].includes(proxy.type)) {
                    proxy.reuse = get(args.reuse, proxy.reuse);
                }
                if (['tuic', 'hysteria2'].includes(proxy.type)) {
                    proxy.ecn = get(args.ecn, proxy.ecn);
                }
                proxy['block-quic'] = getBlockQuic(
                    args['block-quic'],
                    proxy['block-quic'],
                );
                proxy['ip-version'] = getValue(
                    args['ip-version'],
                    proxy['ip-version'],
                );
                return proxy;
            });
        },
    };

    function get(value, defaultValue) {
        switch (value) {
            case 'ENABLED':
                return true;
            case 'DISABLED':
                return false;
            default:
                return defaultValue;
        }
    }

    function getBlockQuic(value, defaultValue) {
        switch (value) {
            case 'auto':
            case 'on':
            case 'off':
                return value;
            default:
                return defaultValue;
        }
    }

    function getValue(value, defaultValue) {
        switch (value) {
            case undefined:
            case null:
            case '':
            case 'DEFAULT':
                return defaultValue;
            default:
                return value;
        }
    }
}

// add or remove flag for proxies
function FlagOperator({ mode, tw }) {
    return {
        name: 'Flag Operator',
        func: (proxies) => {
            return proxies.map((proxy) => {
                if (mode === 'remove') {
                    // no flag
                    proxy.name = removeFlag(proxy.name);
                } else {
                    // get flag
                    const newFlag = getFlag(proxy.name);
                    // remove old flag
                    proxy.name = removeFlag(proxy.name);
                    proxy.name = newFlag + ' ' + proxy.name;
                    if (tw == 'ws') {
                        proxy.name = proxy.name.replace(/🇹🇼/g, '🇼🇸');
                    } else if (tw == 'tw') {
                        // 不变
                    } else {
                        proxy.name = proxy.name.replace(/🇹🇼/g, '🇨🇳');
                    }
                }
                return proxy;
            });
        },
    };
}

// duplicate handler
function HandleDuplicateOperator(arg) {
    const { action, template, link, position, field } = {
        ...{
            action: 'rename',
            template: '0 1 2 3 4 5 6 7 8 9',
            link: '-',
            position: 'back',
            field: ['name'],
        },
        ...arg,
    };
    return {
        name: 'Handle Duplicate Operator',
        func: (proxies) => {
            if (action === 'delete') {
                const chosen = {};
                return proxies.filter((p) => {
                    const key = field
                        .map((f) => lodash.get(p, f, '-'))
                        .join('_');
                    if (chosen[key]) {
                        return false;
                    }
                    chosen[key] = true;
                    return true;
                });
            } else if (action === 'rename') {
                const numbers = template.split(' ');
                // count occurrences of each name
                const counter = {};
                let maxLen = 0;
                proxies.forEach((p) => {
                    const key = field
                        .map((f) => lodash.get(p, f, '-'))
                        .join('_');
                    if (typeof counter[key] === 'undefined') counter[key] = 1;
                    else counter[key]++;
                    maxLen = Math.max(counter[key].toString().length, maxLen);
                });
                const increment = {};
                return proxies.map((p) => {
                    const key = field
                        .map((f) => lodash.get(p, f, '-'))
                        .join('_');
                    if (counter[key] > 1) {
                        if (typeof increment[key] == 'undefined')
                            increment[key] = 1;
                        let num = '';
                        let cnt = increment[key]++;
                        let numDigits = 0;
                        while (cnt > 0) {
                            num = numbers[cnt % 10] + num;
                            cnt = parseInt(cnt / 10);
                            numDigits++;
                        }
                        // padding
                        while (numDigits++ < maxLen) {
                            num = numbers[0] + num;
                        }
                        if (position === 'front') {
                            p.name = num + link + p.name;
                        } else if (position === 'back') {
                            p.name = p.name + link + num;
                        }
                    }
                    return p;
                });
            }
        },
    };
}

// sort proxies according to their names
function SortOperator(order = 'asc') {
    return {
        name: 'Sort Operator',
        func: (proxies) => {
            switch (order) {
                case 'asc':
                case 'desc':
                    return proxies.sort((a, b) => {
                        let res = a.name > b.name ? 1 : -1;
                        res *= order === 'desc' ? -1 : 1;
                        return res;
                    });
                case 'random':
                    return shuffle(proxies);
                default:
                    throw new Error('Unknown sort option: ' + order);
            }
        },
    };
}

// sort by regex
function RegexSortOperator(input) {
    const order = input.order || 'asc';
    let expressions = input.expressions;
    if (Array.isArray(input)) {
        expressions = input;
    }
    if (!Array.isArray(expressions)) {
        expressions = [];
    }
    return {
        name: 'Regex Sort Operator',
        func: (proxies) => {
            expressions = expressions.map((expr) => buildRegex(expr));
            return proxies.sort((a, b) => {
                const oA = getRegexOrder(expressions, a.name);
                const oB = getRegexOrder(expressions, b.name);
                if (oA && !oB) return -1;
                if (oB && !oA) return 1;
                if (oA && oB) return oA < oB ? -1 : 1;
                if (order === 'original') {
                    return 0;
                } else if (order === 'desc') {
                    return a.name < b.name ? 1 : -1;
                } else {
                    return a.name < b.name ? -1 : 1;
                }
            });
        },
    };
}

function getRegexOrder(expressions, str) {
    let order = null;
    for (let i = 0; i < expressions.length; i++) {
        if (expressions[i].test(str)) {
            order = i + 1; // plus 1 is important! 0 will be treated as false!!!
            break;
        }
    }
    return order;
}

// rename by regex
// keywords: [{expr: "string format regex", now: "now"}]
function RegexRenameOperator(regex) {
    return {
        name: 'Regex Rename Operator',
        func: (proxies) => {
            return proxies.map((proxy) => {
                for (const { expr, now } of regex) {
                    proxy.name = proxy.name
                        .replace(buildRegex(expr, 'g'), now)
                        .trim();
                }
                return proxy;
            });
        },
    };
}

// delete regex operator
// regex: ['a', 'b', 'c']
function RegexDeleteOperator(regex) {
    const regex_ = regex.map((r) => {
        return {
            expr: r,
            now: '',
        };
    });
    return {
        name: 'Regex Delete Operator',
        func: RegexRenameOperator(regex_).func,
    };
}

/** Script Operator
 function operator(proxies) {
            const {arg1} = $arguments;

            // do something
            return proxies;
         }

 WARNING:
 1. This function name should be `operator`!
 2. Always declare variables before using them!
 */
function ScriptOperator(
    script,
    targetPlatform,
    $arguments,
    source,
    $options,
    context,
) {
    context.source = source;
    context.env = env;
    return {
        name: 'Script Operator',
        func: async (proxies) => {
            let output = proxies;
            if (isMihomoConfigFile(output?.$file)) {
                try {
                    let patch = YAML.safeLoad(script);
                    let config;
                    if (output?.$content) {
                        try {
                            config = YAML.safeLoad(output?.$content);
                        } catch (e) {
                            $.error(e.message ?? e);
                        }
                    }
                    // if (typeof patch !== 'object') patch = {};
                    if (typeof patch !== 'object')
                        throw new Error('patch is not an object');
                    output.$content = ProxyUtils.yaml.safeDump(
                        deepMerge(config || {}, patch),
                    );
                    return output;
                } catch (e) {
                    // console.log(e);
                }
            }
            await (async function () {
                const operator = createDynamicFunction(
                    'operator',
                    script,
                    $arguments,
                    $options,
                );
                output = operator(proxies, targetPlatform, context);
            })();
            return output;
        },
        nodeFunc: async (proxies) => {
            let output = proxies;
            await (async function () {
                const operator = createDynamicFunction(
                    'operator',
                    `async function operator(input = [], targetPlatform, context) {
                        if (input && (input.$files || input.$content)) {
                            let { $content, $files, $options, $file } = input
                            if (['mihomoConfig', 'mihomoProfile'].includes($file?.type)) {
                                ${script}
                                if(typeof main === 'function') {
                                    let config;
                                    if ($content) {
                                        try {
                                            config = ProxyUtils.yaml.safeLoad($content);
                                        } catch (e) {
                                            console.log(e.message ?? e);
                                        }
                                    }
                                    $content = ProxyUtils.yaml.safeDump(await main(config || {}))
                                }
                            } else {
                                ${script}
                            }
                            return { $content, $files, $options, $file }
                        } else {
                            let proxies = input
                            let list = []
                            for await (let $server of proxies) {
                                ${script}
                                list.push($server)
                            }
                            return list
                        }
                      }`,
                    $arguments,
                    $options,
                );
                output = operator(proxies, targetPlatform, context);
            })();
            return output;
        },
    };
}

const ADD_PROXIES_FROM_SUBSCRIPTION_OPERATOR =
    'Add Proxies From Subscription Operator';

function normalizeMihomoConfig(content) {
    if (!content) return {};

    const config = YAML.safeLoad(content);
    return isPlainObject(config) ? config : {};
}

function getMihomoProfileProxies(config) {
    return Array.isArray(config?.proxies) ? config.proxies : [];
}

function AddProxiesFromSubscriptionOperator({
    sourceType = 'subscription',
    sourceName,
    includeUnsupportedProxy,
    position = 'replace',
} = {}) {
    const apply = async (input) => {
        if (!isMihomoConfigFile(input?.$file)) return input;

        const config = normalizeMihomoConfig(input.$content);
        const currentProxies = getMihomoProfileProxies(config);
        const proxies = await produceArtifact({
            type: sourceType,
            name: sourceName,
            platform: 'mihomo',
            produceType: 'internal',
            produceOpts: {
                'delete-underscore-fields': true,
                'include-unsupported-proxy': includeUnsupportedProxy,
            },
        });

        switch (position) {
            case 'front':
                config.proxies = [...proxies, ...currentProxies];
                break;
            case 'back':
                config.proxies = [...currentProxies, ...proxies];
                break;
            case 'replace':
            default:
                config.proxies = proxies;
                break;
        }

        input.$content = ProxyUtils.yaml.safeDump(config);
        return input;
    };

    return {
        name: ADD_PROXIES_FROM_SUBSCRIPTION_OPERATOR,
        func: apply,
        nodeFunc: apply,
    };
}

function parseIP4P(IP4P) {
    let server;
    let port;
    try {
        let array = IP4P.split(':');

        port = parseInt(array[2], 16);
        let ipab = parseInt(array[3], 16);
        let ipcd = parseInt(array[4], 16);
        let ipa = ipab >> 8;
        let ipb = ipab & 0xff;
        let ipc = ipcd >> 8;
        let ipd = ipcd & 0xff;
        server = `${ipa}.${ipb}.${ipc}.${ipd}`;
        if (port <= 0 || port > 65535) {
            throw new Error(`Invalid port number: ${port}`);
        }
        if (!isIPv4(server)) {
            throw new Error(`Invalid IP address: ${server}`);
        }
    } catch (e) {
        // throw new Error(`IP4P 解析失败: ${e}`);
        $.error(`IP4P 解析失败: ${e}`);
    }
    return { server, port };
}

const DEFAULT_RESOLVE_DOMAIN_CONCURRENCY = 10;
const DEFAULT_RESOLVE_DOMAIN_CUSTOM_DNS_CONCURRENCY = 2;
const RESOLVE_DOMAIN_CONCURRENCY_WARN_THRESHOLD = 20;

function normalizeResolveDomainConcurrency(concurrency) {
    if (
        typeof concurrency === 'undefined' ||
        concurrency === null ||
        (typeof concurrency === 'string' && concurrency.trim() === '')
    ) {
        return DEFAULT_RESOLVE_DOMAIN_CONCURRENCY;
    }

    const parsed = Number(concurrency);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('域名解析并发数应为大于 0 的整数');
    }

    return parsed;
}

function normalizeResolveDomainCustomDnsConcurrency(concurrency) {
    if (
        typeof concurrency === 'undefined' ||
        concurrency === null ||
        (typeof concurrency === 'string' && concurrency.trim() === '')
    ) {
        return DEFAULT_RESOLVE_DOMAIN_CUSTOM_DNS_CONCURRENCY;
    }

    const parsed = Number(concurrency);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('多 DNS 并发数应为大于 0 的整数');
    }

    return parsed;
}

function normalizeResolveDomainTimeout(timeout, defaultTimeout) {
    const hasExplicitTimeout = !(
        typeof timeout === 'undefined' ||
        timeout === null ||
        (typeof timeout === 'string' && timeout.trim() === '')
    );

    if (hasExplicitTimeout) {
        const parsed = Number(timeout);
        if (!Number.isInteger(parsed) || parsed < 1) {
            throw new Error('DNS 超时应为大于 0 的整数');
        }
        return parsed;
    }

    if (
        typeof defaultTimeout === 'undefined' ||
        defaultTimeout === null ||
        (typeof defaultTimeout === 'string' &&
            defaultTimeout.trim() === '')
    ) {
        return 8000;
    }

    const parsedDefaultTimeout = Number(defaultTimeout);
    if (!isFinite(parsedDefaultTimeout) || parsedDefaultTimeout <= 0) {
        return 8000;
    }

    return parsedDefaultTimeout;
}

function normalizeResolveDomainCacheTtl(cacheTtl) {
    if (
        typeof cacheTtl === 'undefined' ||
        cacheTtl === null ||
        (typeof cacheTtl === 'string' && cacheTtl.trim() === '')
    ) {
        return undefined;
    }

    const parsed = Number(cacheTtl);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('域名解析缓存时长应为大于 0 的整数');
    }

    return parsed * 1000;
}

function parseCustomDnsUrls(url) {
    const urls = `${url || ''}`
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item);
    if (urls.length === 0) throw new Error('自定义 DNS 不能为空');
    return urls;
}

function normalizeCustomDnsUrlList(url) {
    return parseCustomDnsUrls(url).join('\n');
}

async function resolveDomainsWithConcurrency(
    domains,
    concurrency,
    resolveDomain,
) {
    let nextIndex = 0;
    const workerCount = Math.min(concurrency, domains.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < domains.length) {
            const domain = domains[nextIndex];
            nextIndex += 1;
            await resolveDomain(domain);
        }
    });

    await Promise.all(workers);
}

async function resolveWithCustomDnsConcurrency(urls, concurrency, resolveUrl) {
    return new Promise((resolve, reject) => {
        let nextIndex = 0;
        let activeCount = 0;
        let finishedCount = 0;
        let settled = false;
        const errors = [];
        const workerCount = Math.min(concurrency, urls.length);

        function maybeReject() {
            if (!settled && finishedCount === urls.length) {
                reject(
                    new Error(
                        errors.length > 0 ? errors.join('; ') : 'No answers',
                    ),
                );
            }
        }

        function startNext() {
            if (settled) return;
            while (activeCount < workerCount && nextIndex < urls.length) {
                const resolverUrl = urls[nextIndex];
                nextIndex += 1;
                activeCount += 1;
                Promise.resolve()
                    .then(() => resolveUrl(resolverUrl))
                    .then((result) => {
                        activeCount -= 1;
                        finishedCount += 1;
                        if (settled) return;
                        settled = true;
                        resolve({ result, resolverUrl });
                    })
                    .catch((err) => {
                        activeCount -= 1;
                        finishedCount += 1;
                        errors.push(`${resolverUrl}: ${err}`);
                        startNext();
                        maybeReject();
                    });
            }
            maybeReject();
        }

        startNext();
    });
}

function getDomainResolverCacheId(
    provider,
    domain,
    type,
    url,
    tlsSkipCertVerify,
) {
    switch (provider) {
        case 'Custom':
            return hex_md5(
                `CUSTOM:${
                    tlsSkipCertVerify ? 'INSECURE:' : ''
                }${url}:${domain}:${type}`,
            );
        case 'Google':
            return hex_md5(`GOOGLE:${domain}:${type}`);
        case 'IP-API':
            return hex_md5(`IP-API:${domain}`);
        case 'Cloudflare':
            return hex_md5(`CLOUDFLARE:${domain}:${type}`);
        case 'Ali':
            return hex_md5(`ALI:${domain}:${type}`);
        case 'Tencent':
            return hex_md5(`TENCENT:${domain}:${type}`);
    }
}

function getCachedDomainResolverResult(
    provider,
    domain,
    type,
    cache,
    url,
    tlsSkipCertVerify,
) {
    if (cache === 'disabled') return null;
    const id = getDomainResolverCacheId(
        provider,
        domain,
        type,
        url,
        tlsSkipCertVerify,
    );
    const cached = id ? resourceCache.get(id) : null;
    return provider === 'Custom'
        ? unpackCustomDnsCachedResult(cached)
        : cached;
}

function formatResolverUrlLog(provider, resolverUrl) {
    if (provider !== 'Custom' || !resolverUrl) return '';
    const urls = `${resolverUrl}`
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item);
    if (urls.length <= 1) return ` via ${resolverUrl}`;
    return ` via ${urls.length} custom DNS`;
}

function formatResolverUrlInfo(provider, resolverUrl) {
    if (provider !== 'Custom' || !resolverUrl) return resolverUrl || '';
    const urls = `${resolverUrl}`
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item);
    if (urls.length <= 1) return resolverUrl;
    return `${urls.length} custom DNS`;
}

function annotateCustomDnsResult(result, resolverUrl) {
    if (result && typeof result === 'object') {
        Object.defineProperty(result, '_resolverUrl', {
            value: resolverUrl,
            enumerable: false,
            configurable: true,
        });
    }
    return result;
}

function packCustomDnsCachedResult(result, resolverUrl) {
    return {
        result,
        resolverUrl,
    };
}

function unpackCustomDnsCachedResult(cached) {
    if (
        cached &&
        typeof cached === 'object' &&
        !Array.isArray(cached) &&
        Array.isArray(cached.result)
    ) {
        return annotateCustomDnsResult(cached.result, cached.resolverUrl);
    }
    return cached;
}

function getCustomDnsResultResolverUrl(result) {
    return result && typeof result === 'object' ? result._resolverUrl : null;
}

const DOMAIN_RESOLVERS = {
    Custom: async function (
        domain,
        type,
        noCache,
        timeout,
        edns,
        url,
        tlsSkipCertVerify,
        dnsConcurrency,
        cacheTtl,
    ) {
        const urls = parseCustomDnsUrls(url);
        const normalizedUrl = urls.join('\n');
        const customDnsConcurrency =
            normalizeResolveDomainCustomDnsConcurrency(dnsConcurrency);
        const id = hex_md5(
            `CUSTOM:${
                tlsSkipCertVerify ? 'INSECURE:' : ''
            }${normalizedUrl}:${domain}:${type}`,
        );
        const cached = unpackCustomDnsCachedResult(resourceCache.get(id));
        if (!noCache && cached) return cached;
        const answerType = type === 'IPv6' ? 'AAAA' : 'A';
        const resolveUrl = async (resolverUrl) => {
            const res = await resolveDns({
                url: resolverUrl,
                domain,
                type: answerType,
                timeout,
                edns,
                skipCertVerify: tlsSkipCertVerify,
            });

            const { answers } = res;
            if (!Array.isArray(answers) || answers.length === 0) {
                throw new Error('No answers');
            }
            const result = answers
                .filter((i) => i?.type === answerType)
                .map((i) => i?.data)
                .filter((i) => i);
            if (result.length === 0) {
                throw new Error('No answers');
            }
            return result;
        };
        const { result, resolverUrl } =
            urls.length === 1
                ? { result: await resolveUrl(urls[0]), resolverUrl: urls[0] }
                : await resolveWithCustomDnsConcurrency(
                      urls,
                      customDnsConcurrency,
                      resolveUrl,
                  );
        resourceCache.set(
            id,
            packCustomDnsCachedResult(result, resolverUrl),
            cacheTtl,
        );
        return annotateCustomDnsResult(result, resolverUrl);
    },
    Google: async function (
        domain,
        type,
        noCache,
        timeout,
        edns,
        url,
        tlsSkipCertVerify,
        dnsConcurrency,
        cacheTtl,
    ) {
        const id = hex_md5(`GOOGLE:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const answerType = type === 'IPv6' ? 'AAAA' : 'A';
        const res = await resolveDns({
            url: 'https://8.8.4.4/dns-query',
            domain,
            type: answerType,
            timeout,
            edns,
        });

        const { answers } = res;
        if (!Array.isArray(answers) || answers.length === 0) {
            throw new Error('No answers');
        }
        const result = answers
            .filter((i) => i?.type === answerType)
            .map((i) => i?.data)
            .filter((i) => i);
        if (result.length === 0) {
            throw new Error('No answers');
        }
        resourceCache.set(id, result, cacheTtl);
        return result;
    },
    'IP-API': async function (
        domain,
        type,
        noCache,
        timeout,
        edns,
        url,
        tlsSkipCertVerify,
        dnsConcurrency,
        cacheTtl,
    ) {
        if (['IPv6'].includes(type)) {
            throw new Error(`域名解析服务提供方 IP-API 不支持 ${type}`);
        }
        const id = hex_md5(`IP-API:${domain}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const resp = await $.http.get({
            url: `http://ip-api.com/json/${encodeURIComponent(
                domain,
            )}?lang=zh-CN`,
            timeout,
        });
        const body = JSON.parse(resp.body);
        if (body['status'] !== 'success') {
            throw new Error(`Status is ${body['status']}`);
        }
        if (!body.query || body.query === 0) {
            throw new Error('No answers');
        }
        const result = [body.query];
        if (result.length === 0) {
            throw new Error('No answers');
        }
        resourceCache.set(id, result, cacheTtl);
        return result;
    },
    Cloudflare: async function (
        domain,
        type,
        noCache,
        timeout,
        edns,
        url,
        tlsSkipCertVerify,
        dnsConcurrency,
        cacheTtl,
    ) {
        const id = hex_md5(`CLOUDFLARE:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const answerType = type === 'IPv6' ? 'AAAA' : 'A';
        const res = await resolveDns({
            url: 'https://1.0.0.1/dns-query',
            domain,
            type: answerType,
            timeout,
            edns,
        });

        const { answers } = res;
        if (!Array.isArray(answers) || answers.length === 0) {
            throw new Error('No answers');
        }
        const result = answers
            .filter((i) => i?.type === answerType)
            .map((i) => i?.data)
            .filter((i) => i);
        if (result.length === 0) {
            throw new Error('No answers');
        }
        resourceCache.set(id, result, cacheTtl);
        return result;
    },
    Ali: async function (
        domain,
        type,
        noCache,
        timeout,
        edns,
        url,
        tlsSkipCertVerify,
        dnsConcurrency,
        cacheTtl,
    ) {
        const id = hex_md5(`ALI:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const resp = await $.http.get({
            url: `http://223.6.6.6/resolve?edns_client_subnet=${edns}/${
                isIPv4(edns) ? 24 : 56
            }&name=${encodeURIComponent(domain)}&type=${
                type === 'IPv6' ? 'AAAA' : 'A'
            }&short=1`,
            headers: {
                accept: 'application/dns-json',
            },
            timeout,
        });
        const answers = JSON.parse(resp.body);
        if (!Array.isArray(answers) || answers.length === 0) {
            throw new Error('No answers');
        }
        const result = answers;
        if (result.length === 0) {
            throw new Error('No answers');
        }
        resourceCache.set(id, result, cacheTtl);
        return result;
    },
    Tencent: async function (
        domain,
        type,
        noCache,
        timeout,
        edns,
        url,
        tlsSkipCertVerify,
        dnsConcurrency,
        cacheTtl,
    ) {
        const id = hex_md5(`TENCENT:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const resp = await $.http.get({
            url: `http://119.28.28.28/d?ip=${edns}&type=${
                type === 'IPv6' ? 'AAAA' : 'A'
            }&dn=${encodeURIComponent(domain)}`,
            headers: {
                accept: 'application/dns-json',
            },
            timeout,
        });
        const answers = resp.body.split(';').map((i) => i.split(',')[0]);
        if (answers.length === 0 || String(answers) === '0') {
            throw new Error('No answers');
        }
        const result = answers;
        if (result.length === 0) {
            throw new Error('No answers');
        }
        resourceCache.set(id, result, cacheTtl);
        return result;
    },
};

function ResolveDomainOperator({
    provider,
    type: _type,
    filter,
    cache,
    url,
    tlsSkipCertVerify,
    timeout,
    cacheTtl,
    edns: _edns,
    concurrency: _concurrency,
    dnsConcurrency: _dnsConcurrency,
}) {
    if (['IPv6', 'IP4P'].includes(_type) && ['IP-API'].includes(provider)) {
        throw new Error(`域名解析服务提供方 ${provider} 不支持 ${_type}`);
    }
    const { defaultTimeout } = $.read(SETTINGS_KEY) || {};
    const requestTimeout = normalizeResolveDomainTimeout(
        timeout,
        defaultTimeout,
    );
    const domainResolverCacheTtl = normalizeResolveDomainCacheTtl(cacheTtl);
    let type = ['IPv6', 'IP4P'].includes(_type) ? 'IPv6' : 'IPv4';

    const resolver = DOMAIN_RESOLVERS[provider];
    if (!resolver) {
        throw new Error(`找不到域名解析服务提供方: ${provider}`);
    }
    let edns = _edns || '223.6.6.6';
    if (!isIP(edns)) throw new Error(`域名解析 EDNS 应为 IP`);
    const concurrency = normalizeResolveDomainConcurrency(_concurrency);
    const customDnsUrl =
        provider === 'Custom' ? normalizeCustomDnsUrlList(url) : url;
    const customDnsCount =
        provider === 'Custom' ? parseCustomDnsUrls(customDnsUrl).length : 1;
    const customDnsConcurrency =
        provider === 'Custom'
            ? normalizeResolveDomainCustomDnsConcurrency(_dnsConcurrency)
            : 1;
    const totalConcurrency =
        concurrency * Math.min(customDnsConcurrency, customDnsCount);
    const customDnsTlsSkipCertVerify =
        provider === 'Custom' &&
        (tlsSkipCertVerify === true || tlsSkipCertVerify === 'enabled');
    if (totalConcurrency > RESOLVE_DOMAIN_CONCURRENCY_WARN_THRESHOLD) {
        $.warn(
            `域名解析总并发数上限 ${totalConcurrency} 超过建议值 ${RESOLVE_DOMAIN_CONCURRENCY_WARN_THRESHOLD}, 可能导致代理 App TCP 连接数激增`,
        );
    }
    $.info(
        `Domain Resolver: [${_type}] ${provider} ${edns || ''} ${
            formatResolverUrlInfo(provider, customDnsUrl)
        }${
            customDnsTlsSkipCertVerify ? ' tlsSkipCertVerify=enabled' : ''
        } concurrency=${concurrency}${
            provider === 'Custom'
                ? ` dnsConcurrency=${customDnsConcurrency}`
                : ''
        }`,
    );
    return {
        name: 'Resolve Domain Operator',
        func: async (proxies) => {
            proxies.forEach((p, i) => {
                if (!p['_no-resolve'] && p['no-resolve']) {
                    proxies[i]['_no-resolve'] = p['no-resolve'];
                }
            });
            const results = {};
            const domains = [
                ...new Map(
                    proxies
                        .filter((p) => !isIP(p.server) && !p['_no-resolve'])
                        .map((p) => {
                            const id = getDomainResolverCacheId(
                                provider,
                                p.server,
                                type,
                                customDnsUrl,
                                customDnsTlsSkipCertVerify,
                            );
                            return [id, { id, domain: p.server }];
                        }),
                ).values(),
            ];
            const domainsToResolve = [];
            domains.forEach(({ id, domain }) => {
                const cached = getCachedDomainResolverResult(
                    provider,
                    domain,
                    type,
                    cache,
                    customDnsUrl,
                    customDnsTlsSkipCertVerify,
                );
                if (cached) {
                    results[id] = cached;
                    const resolverUrl =
                        provider === 'Custom'
                            ? getCustomDnsResultResolverUrl(cached) ||
                              customDnsUrl
                            : customDnsUrl;
                    $.info(
                        `Using cached resolved domain: ${domain}${formatResolverUrlLog(
                            provider,
                            resolverUrl,
                        )} ➟ ${cached}`,
                    );
                } else {
                    domainsToResolve.push({ id, domain });
                }
            });
            await resolveDomainsWithConcurrency(
                domainsToResolve,
                concurrency,
                async ({ id, domain }) => {
                    try {
                        const ip = await resolver(
                            domain,
                            type,
                            cache === 'disabled',
                            requestTimeout,
                            edns,
                            customDnsUrl,
                            customDnsTlsSkipCertVerify,
                            customDnsConcurrency,
                            domainResolverCacheTtl,
                        );
                        results[id] = ip;
                        const resolverUrl =
                            provider === 'Custom'
                                ? getCustomDnsResultResolverUrl(ip) ||
                                  customDnsUrl
                                : customDnsUrl;
                        $.info(
                            `Successfully resolved domain: ${domain}${formatResolverUrlLog(
                                provider,
                                resolverUrl,
                            )} ➟ ${ip}`,
                        );
                    } catch (err) {
                        $.error(
                            `Failed to resolve domain: ${domain}${formatResolverUrlLog(
                                provider,
                                customDnsUrl,
                            )} with resolver [${provider}]: ${err}`,
                        );
                    }
                },
            );
            proxies.forEach((p) => {
                if (!p['_no-resolve']) {
                    const id = getDomainResolverCacheId(
                        provider,
                        p.server,
                        type,
                        customDnsUrl,
                        customDnsTlsSkipCertVerify,
                    );
                    if (id && results[id]) {
                        p._resolved_ips = results[id];
                        let ip = Array.isArray(results[id])
                            ? results[id][
                                  Math.floor(Math.random() * results[id].length)
                              ]
                            : results[id];
                        if (type === 'IPv6' && isIPv6(ip)) {
                            try {
                                ip = new ipAddress.Address6(ip).correctForm();
                            } catch (e) {
                                $.error(
                                    `Failed to parse IPv6 address: ${ip}: ${e}`,
                                );
                            }
                            if (/^2001::[^:]+:[^:]+:[^:]+$/.test(ip)) {
                                p._IP4P = ip;
                                const { server, port } = parseIP4P(ip);
                                if (server && port) {
                                    p._domain = p.server;
                                    p.server = server;
                                    p.port = port;
                                    p.resolved = true;
                                    p._IPv4 = p.server;
                                    if (!isIP(p._IP)) {
                                        p._IP = p.server;
                                    }
                                } else if (!p.resolved) {
                                    p.resolved = false;
                                }
                            } else {
                                p._domain = p.server;
                                p.server = ip;
                                p.resolved = true;
                                p[`_${type}`] = p.server;
                                if (!isIP(p._IP)) {
                                    p._IP = p.server;
                                }
                            }
                        } else {
                            p._domain = p.server;
                            p.server = ip;
                            p.resolved = true;
                            p[`_${type}`] = p.server;
                            if (!isIP(p._IP)) {
                                p._IP = p.server;
                            }
                        }
                    } else if (!p.resolved) {
                        p.resolved = false;
                    }
                }
            });

            return proxies.filter((p) => {
                if (filter === 'removeFailed') {
                    return isIP(p.server) || p['_no-resolve'] || p.resolved;
                } else if (filter === 'IPOnly') {
                    return isIP(p.server);
                } else if (filter === 'IPv4Only') {
                    return isIPv4(p.server);
                } else if (filter === 'IPv6Only') {
                    return isIPv6(p.server);
                } else {
                    return true;
                }
            });
        },
    };
}

function isIP(ip) {
    return isIPv4(ip) || isIPv6(ip);
}

ResolveDomainOperator.resolver = DOMAIN_RESOLVERS;

function isAscii(str) {
    // eslint-disable-next-line no-control-regex
    var pattern = /^[\x00-\x7F]+$/; // ASCII 范围的 Unicode 编码
    return pattern.test(str);
}

/**************************** Filters ***************************************/
// filter useless proxies
function UselessFilter() {
    return {
        name: 'Useless Filter',
        func: (proxies) => {
            return proxies.map((proxy) => {
                if (proxy.cipher && !isAscii(proxy.cipher)) {
                    return false;
                } else if (proxy.password && !isAscii(proxy.password)) {
                    return false;
                } else {
                    if (proxy.network) {
                        let transportHosts =
                            proxy[`${proxy.network}-opts`]?.headers?.Host ||
                            proxy[`${proxy.network}-opts`]?.headers?.host;
                        transportHosts = Array.isArray(transportHosts)
                            ? transportHosts
                            : [transportHosts];
                        if (
                            transportHosts.some(
                                (host) => host && !isAscii(host),
                            )
                        ) {
                            return false;
                        }
                    }
                    return !/网址|流量|时间|应急|过期|Bandwidth|expire/.test(
                        proxy.name,
                    );
                }
            });
        },
    };
}

// filter by regions
function RegionFilter(input) {
    let regions = input?.value || input;
    if (!Array.isArray(regions)) {
        regions = [];
    }
    const keep = input?.keep ?? true;
    const REGION_MAP = {
        HK: '🇭🇰',
        TW: '🇹🇼',
        US: '🇺🇸',
        SG: '🇸🇬',
        JP: '🇯🇵',
        UK: '🇬🇧',
        DE: '🇩🇪',
        KR: '🇰🇷',
    };
    return {
        name: 'Region Filter',
        func: (proxies) => {
            // this would be high memory usage
            return proxies.map((proxy) => {
                const flag = getFlag(proxy.name);
                const selected = regions.some((r) => REGION_MAP[r] === flag);
                return keep ? selected : !selected;
            });
        },
    };
}

// filter by regex
function RegexFilter({ regex = [], keep = true }) {
    return {
        name: 'Regex Filter',
        func: (proxies) => {
            return proxies.map((proxy) => {
                const selected = regex.some((r) => {
                    return buildRegex(r).test(proxy.name);
                });
                return keep ? selected : !selected;
            });
        },
    };
}

function buildRegex(str, ...options) {
    options = options.join('');
    if (str.startsWith('(?i)')) {
        str = str.substring(4);
        return new RegExp(str, 'i' + options);
    } else {
        return new RegExp(str, options);
    }
}

// filter by proxy types
function TypeFilter(input) {
    let types = input?.value || input;
    if (!Array.isArray(types)) {
        types = [];
    }
    const keep = input?.keep ?? true;
    return {
        name: 'Type Filter',
        func: (proxies) => {
            return proxies.map((proxy) => {
                const selected = types.some((t) => proxy.type === t);
                return keep ? selected : !selected;
            });
        },
    };
}

/**
 Script Example

 function filter(proxies) {
        return proxies.map(p => {
            return p.name.indexOf('🇭🇰') !== -1;
        });
     }

 WARNING:
 1. This function name should be `filter`!
 2. Always declare variables before using them!
 */
function ScriptFilter(
    script,
    targetPlatform,
    $arguments,
    source,
    $options,
    context,
) {
    context.source = source;
    context.env = env;
    return {
        name: 'Script Filter',
        func: async (proxies) => {
            let output = FULL(proxies.length, true);
            await (async function () {
                const filter = createDynamicFunction(
                    'filter',
                    script,
                    $arguments,
                    $options,
                );
                output = filter(proxies, targetPlatform, context);
            })();
            return output;
        },
        nodeFunc: async (proxies) => {
            let output = FULL(proxies.length, true);
            await (async function () {
                const filter = createDynamicFunction(
                    'filter',
                    `async function filter(input = [], targetPlatform, context) {
                        let proxies = input
                        let list = []
                        const fn = async ($server) => {
                            ${script}
                        }
                        for await (let $server of proxies) {
                            list.push(await fn($server))
                        }
                        return list
                      }`,
                    $arguments,
                    $options,
                );
                output = filter(proxies, targetPlatform, context);
            })();
            return output;
        },
    };
}

function ResponseTransformer(
    script,
    targetPlatform,
    $arguments,
    source,
    $options,
    context,
) {
    context.source = source;
    context.env = env;
    return {
        name: RESPONSE_TRANSFORMER,
        func: async (res) => {
            let output = res;
            await (async function () {
                const transformFunction = createDynamicFunction(
                    'transformFunction',
                    script,
                    $arguments,
                    $options,
                );
                output = transformFunction(res, context);
            })();
            return output;
        },
        shortcutFunc: async (res) => {
            let output = res;
            await (async function () {
                const transformFunction = createDynamicFunction(
                    'transformFunction',
                    `async function transformFunction(res = {}, context) {
                        let $res = res
                        ${script}
                        return $res
                      }`,
                    $arguments,
                    $options,
                );
                output = transformFunction(res, context);
            })();
            return output;
        },
    };
}

export default {
    'Useless Filter': UselessFilter,
    'Region Filter': RegionFilter,
    'Regex Filter': RegexFilter,
    'Type Filter': TypeFilter,
    'Script Filter': ScriptFilter,
    'Conditional Filter': ConditionalFilter,

    'Quick Setting Operator': QuickSettingOperator,
    'Flag Operator': FlagOperator,
    'Sort Operator': SortOperator,
    'Regex Sort Operator': RegexSortOperator,
    'Regex Rename Operator': RegexRenameOperator,
    'Regex Delete Operator': RegexDeleteOperator,
    'Script Operator': ScriptOperator,
    [ADD_PROXIES_FROM_SUBSCRIPTION_OPERATOR]:
        AddProxiesFromSubscriptionOperator,
    [RESPONSE_TRANSFORMER]: ResponseTransformer,
    'Handle Duplicate Operator': HandleDuplicateOperator,
    'Resolve Domain Operator': ResolveDomainOperator,
};

export async function ApplyResponseTransformer(transformer, res) {
    let output = res;
    try {
        const output_ = await transformer.func(output);
        if (output_) output = output_;
    } catch (err) {
        let funcErr = '';
        const funcErrMsg = `${err.message ?? err}`;
        if (!funcErrMsg.includes('$res is not defined')) {
            $.error(
                `Cannot apply ${transformer.name}(function transformFunction)! Reason: ${err}`,
            );
            funcErr = `执行 function transformFunction 失败 ${funcErrMsg}; `;
        }
        try {
            const output_ = await transformer.shortcutFunc(output);
            if (output_) output = output_;
        } catch (shortcutErr) {
            $.error(
                `Cannot apply ${transformer.name}(shortcut script)! Reason: ${shortcutErr}`,
            );
            let shortcutErrText = '';
            const shortcutErrMsg = `${shortcutErr.message ?? shortcutErr}`;
            if (funcErr && shortcutErrMsg === funcErrMsg) {
                shortcutErrText = '';
                funcErr = `执行失败 ${funcErrMsg}`;
            } else {
                shortcutErrText = `执行快捷脚本失败 ${shortcutErrMsg}`;
            }
            throw new Error(`响应修改 ${funcErr}${shortcutErrText}`);
        }
    }
    return output;
}

async function ApplyFilter(filter, objs) {
    // select proxies
    let selected = FULL(objs.length, true);
    try {
        selected = await filter.func(objs);
    } catch (err) {
        let funcErr = '';
        let funcErrMsg = `${err.message ?? err}`;
        if (funcErrMsg.includes('$server is not defined')) {
            funcErr = '';
        } else {
            $.error(
                `Cannot apply filter ${filter.name}(function filter)! Reason: ${err}`,
            );
            funcErr = `执行 function filter 失败 ${funcErrMsg}; `;
        }
        try {
            selected = await filter.nodeFunc(objs);
        } catch (err) {
            $.error(
                `Cannot apply filter ${filter.name}(shortcut script)! Reason: ${err}`,
            );
            let nodeErr = '';
            let nodeErrMsg = `${err.message ?? err}`;
            if (funcErr && nodeErrMsg === funcErrMsg) {
                nodeErr = '';
                funcErr = `执行失败 ${funcErrMsg}`;
            } else {
                nodeErr = `执行快捷过滤脚本 失败 ${nodeErrMsg}`;
            }
            throw new Error(`脚本过滤 ${funcErr}${nodeErr}`);
        }
    }
    return objs.filter((_, i) => selected[i]);
}

async function ApplyOperator(operator, objs) {
    let output = clone(objs);
    try {
        const output_ = await operator.func(output);
        if (output_) output = output_;
    } catch (err) {
        let funcErr = '';
        let funcErrMsg = `${err.message ?? err}`;
        if (
            funcErrMsg.includes('$server is not defined') ||
            funcErrMsg.includes('$content is not defined') ||
            funcErrMsg.includes('$files is not defined') ||
            output?.$files ||
            output?.$content
        ) {
            funcErr = '';
        } else {
            $.error(
                `Cannot apply operator ${operator.name}(function operator)! Reason: ${err}`,
            );
            funcErr = `执行 function operator 失败 ${funcErrMsg}; `;
        }
        try {
            const output_ = await operator.nodeFunc(output);
            if (output_) output = output_;
        } catch (err) {
            $.error(
                `Cannot apply operator ${operator.name}(shortcut script)! Reason: ${err}`,
            );
            let nodeErr = '';
            let nodeErrMsg = `${err.message ?? err}`;
            if (funcErr && nodeErrMsg === funcErrMsg) {
                nodeErr = '';
                funcErr = `执行失败 ${funcErrMsg}`;
            } else {
                nodeErr = `执行快捷脚本 失败 ${nodeErrMsg}`;
            }
            throw new Error(`脚本操作 ${funcErr}${nodeErr}`);
        }
    }
    return output;
}

export async function ApplyProcessor(processor, objs) {
    if (processor.name.indexOf('Filter') !== -1) {
        return ApplyFilter(processor, objs);
    } else if (processor.name.indexOf('Operator') !== -1) {
        return ApplyOperator(processor, objs);
    }
}

// shuffle array
function shuffle(array) {
    let currentIndex = array.length,
        temporaryValue,
        randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

// deep clone object
function clone(object) {
    return JSON.parse(JSON.stringify(object));
}

function createDynamicFunction(name, script, $arguments, $options) {
    const flowUtils = {
        getFlowField,
        getFlowHeaders,
        parseFlowHeaders,
        flowTransfer,
        validCheck,
        getRmainingDays,
        normalizeFlowHeader,
    };
    if ($.env.isLoon) {
        return new Function(
            '$arguments',
            '$options',
            '$substore',
            'lodash',
            '$persistentStore',
            '$httpClient',
            '$notification',
            'ProxyUtils',
            'yaml',
            'Buffer',
            'b64d',
            'b64e',
            'DOMAIN_RESOLVERS',
            'scriptResourceCache',
            'flowUtils',
            'produceArtifact',
            'require',
            `${script}\n return ${name}`,
        )(
            $arguments,
            $options,
            $,
            lodash,
            // eslint-disable-next-line no-undef
            $persistentStore,
            // eslint-disable-next-line no-undef
            $httpClient,
            // eslint-disable-next-line no-undef
            $notification,
            ProxyUtils,
            ProxyUtils.yaml,
            ProxyUtils.Buffer,
            ProxyUtils.Base64.decode,
            ProxyUtils.Base64.encode,
            DOMAIN_RESOLVERS,
            scriptResourceCache,
            flowUtils,
            produceArtifact,
            eval(`typeof require !== "undefined"`) ? require : undefined,
        );
    } else {
        return new Function(
            '$arguments',
            '$options',
            '$substore',
            'lodash',
            'ProxyUtils',
            'yaml',
            'Buffer',
            'b64d',
            'b64e',
            'DOMAIN_RESOLVERS',
            'scriptResourceCache',
            'flowUtils',
            'produceArtifact',
            'require',
            `${script}\n return ${name}`,
        )(
            $arguments,
            $options,
            $,
            lodash,
            ProxyUtils,
            ProxyUtils.yaml,
            ProxyUtils.Buffer,
            ProxyUtils.Base64.decode,
            ProxyUtils.Base64.encode,
            DOMAIN_RESOLVERS,
            scriptResourceCache,
            flowUtils,
            produceArtifact,
            eval(`typeof require !== "undefined"`) ? require : undefined,
        );
    }
}
