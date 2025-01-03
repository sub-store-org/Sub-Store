import resourceCache from '@/utils/resource-cache';
import scriptResourceCache from '@/utils/script-resource-cache';
import { isIPv4, isIPv6, ipAddress } from '@/utils';
import { FULL } from '@/utils/logical';
import { getFlag, removeFlag } from '@/utils/geo';
import { doh } from '@/utils/dns';
import lodash from 'lodash';
import $ from '@/core/app';
import { hex_md5 } from '@/vendor/md5';
import { ProxyUtils } from '@/core/proxy-utils';
import { produceArtifact } from '@/restful/sync';
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
} from '@/utils/flow';

function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
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
        if (isObject(other[key])) {
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
    const { action, template, link, position } = {
        ...{
            action: 'rename',
            template: '0 1 2 3 4 5 6 7 8 9',
            link: '-',
            position: 'back',
        },
        ...arg,
    };
    return {
        name: 'Handle Duplicate Operator',
        func: (proxies) => {
            if (action === 'delete') {
                const chosen = {};
                return proxies.filter((p) => {
                    if (chosen[p.name]) {
                        return false;
                    }
                    chosen[p.name] = true;
                    return true;
                });
            } else if (action === 'rename') {
                const numbers = template.split(' ');
                // count occurrences of each name
                const counter = {};
                let maxLen = 0;
                proxies.forEach((p) => {
                    if (typeof counter[p.name] === 'undefined')
                        counter[p.name] = 1;
                    else counter[p.name]++;
                    maxLen = Math.max(
                        counter[p.name].toString().length,
                        maxLen,
                    );
                });
                const increment = {};
                return proxies.map((p) => {
                    if (counter[p.name] > 1) {
                        if (typeof increment[p.name] == 'undefined')
                            increment[p.name] = 1;
                        let num = '';
                        let cnt = increment[p.name]++;
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
function RegexSortOperator(expressions) {
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
                if ((!oA && !oB) || (oA && oB && oA === oB))
                    return a.name < b.name ? -1 : 1; // fallback to normal sort
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
function ScriptOperator(script, targetPlatform, $arguments, source, $options) {
    return {
        name: 'Script Operator',
        func: async (proxies) => {
            let output = proxies;
            if (output?.$file?.type === 'mihomoProfile') {
                try {
                    let patch = YAML.safeLoad(script);
                    if (typeof patch !== 'object') patch = {};
                    output.$content = ProxyUtils.yaml.safeDump(
                        deepMerge(
                            {
                                proxies: await produceArtifact({
                                    type:
                                        output?.$file?.sourceType ||
                                        'collection',
                                    name: output?.$file?.sourceName,
                                    platform: 'mihomo',
                                    produceType: 'internal',
                                    produceOpts: {
                                        'delete-underscore-fields': true,
                                    },
                                }),
                            },
                            patch,
                        ),
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
                output = operator(proxies, targetPlatform, { source, ...env });
            })();
            return output;
        },
        nodeFunc: async (proxies) => {
            let output = proxies;
            await (async function () {
                const operator = createDynamicFunction(
                    'operator',
                    `async function operator(input = []) {
                        if (input && (input.$files || input.$content)) {
                            let { $content, $files, $options, $file } = input
                            if($file.type === 'mihomoProfile') {
                                ${script}
                                if(typeof main === 'function') {
                                    const config = {
                                        proxies: await produceArtifact({
                                            type: $file.sourceType || 'collection',
                                            name: $file.sourceName,
                                            platform: 'mihomo',
                                            produceType: 'internal',
                                            produceOpts: {
                                                'delete-underscore-fields': true
                                            }
                                        }),
                                    }
                                    $content = ProxyUtils.yaml.safeDump(await main(config))
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
                output = operator(proxies, targetPlatform, { source, ...env });
            })();
            return output;
        },
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

const DOMAIN_RESOLVERS = {
    Custom: async function (domain, type, noCache, timeout, edns, url) {
        const id = hex_md5(`CUSTOM:${url}:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const answerType = type === 'IPv6' ? 'AAAA' : 'A';
        const res = await doh({
            url,
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
        resourceCache.set(id, result);
        return result;
    },
    Google: async function (domain, type, noCache, timeout, edns) {
        const id = hex_md5(`GOOGLE:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const answerType = type === 'IPv6' ? 'AAAA' : 'A';
        const res = await doh({
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
        resourceCache.set(id, result);
        return result;
    },
    'IP-API': async function (domain, type, noCache, timeout) {
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
        resourceCache.set(id, result);
        return result;
    },
    Cloudflare: async function (domain, type, noCache, timeout, edns) {
        const id = hex_md5(`CLOUDFLARE:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const answerType = type === 'IPv6' ? 'AAAA' : 'A';
        const res = await doh({
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
        resourceCache.set(id, result);
        return result;
    },
    Ali: async function (domain, type, noCache, timeout, edns) {
        const id = hex_md5(`ALI:${domain}:${type}`);
        const cached = resourceCache.get(id);
        if (!noCache && cached) return cached;
        const resp = await $.http.get({
            url: `http://223.6.6.6/resolve?edns_client_subnet=${edns}/24&name=${encodeURIComponent(
                domain,
            )}&type=${type === 'IPv6' ? 'AAAA' : 'A'}&short=1`,
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
        resourceCache.set(id, result);
        return result;
    },
    Tencent: async function (domain, type, noCache, timeout, edns) {
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
        resourceCache.set(id, result);
        return result;
    },
};

function ResolveDomainOperator({
    provider,
    type: _type,
    filter,
    cache,
    url,
    timeout,
    edns: _edns,
}) {
    if (['IPv6', 'IP4P'].includes(_type) && ['IP-API'].includes(provider)) {
        throw new Error(`域名解析服务提供方 ${provider} 不支持 ${_type}`);
    }
    const { defaultTimeout } = $.read(SETTINGS_KEY);
    const requestTimeout = timeout || defaultTimeout || 8000;
    let type = ['IPv6', 'IP4P'].includes(_type) ? 'IPv6' : 'IPv4';

    const resolver = DOMAIN_RESOLVERS[provider];
    if (!resolver) {
        throw new Error(`找不到域名解析服务提供方: ${provider}`);
    }
    let edns = _edns || '223.6.6.6';
    if (!isIP(edns)) throw new Error(`域名解析 EDNS 应为 IP`);
    $.info(
        `Domain Resolver: [${_type}] ${provider} ${edns || ''} ${url || ''}`,
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
            const limit = 15; // more than 20 concurrency may result in surge TCP connection shortage.
            const totalDomain = [
                ...new Set(
                    proxies
                        .filter((p) => !isIP(p.server) && !p['_no-resolve'])
                        .map((c) => c.server),
                ),
            ];
            const totalBatch = Math.ceil(totalDomain.length / limit);
            for (let i = 0; i < totalBatch; i++) {
                const currentBatch = [];
                for (let domain of totalDomain.splice(0, limit)) {
                    currentBatch.push(
                        resolver(
                            domain,
                            type,
                            cache === 'disabled',
                            requestTimeout,
                            edns,
                            url,
                        )
                            .then((ip) => {
                                results[domain] = ip;
                                $.info(
                                    `Successfully resolved domain: ${domain} ➟ ${ip}`,
                                );
                            })
                            .catch((err) => {
                                $.error(
                                    `Failed to resolve domain: ${domain} with resolver [${provider}]: ${err}`,
                                );
                            }),
                    );
                }
                await Promise.all(currentBatch);
            }
            proxies.forEach((p) => {
                if (!p['_no-resolve']) {
                    if (results[p.server]) {
                        p._resolved_ips = results[p.server];
                        let ip = Array.isArray(results[p.server])
                            ? results[p.server][
                                  Math.floor(
                                      Math.random() * results[p.server].length,
                                  )
                              ]
                            : results[p.server];
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
function RegionFilter(regions) {
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
                return regions.some((r) => REGION_MAP[r] === flag);
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
function TypeFilter(types) {
    return {
        name: 'Type Filter',
        func: (proxies) => {
            return proxies.map((proxy) => types.some((t) => proxy.type === t));
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
function ScriptFilter(script, targetPlatform, $arguments, source, $options) {
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
                output = filter(proxies, targetPlatform, { source, ...env });
            })();
            return output;
        },
        nodeFunc: async (proxies) => {
            let output = FULL(proxies.length, true);
            await (async function () {
                const filter = createDynamicFunction(
                    'filter',
                    `async function filter(input = []) {
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
                output = filter(proxies, targetPlatform, { source, ...env });
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
    'Handle Duplicate Operator': HandleDuplicateOperator,
    'Resolve Domain Operator': ResolveDomainOperator,
};

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
            scriptResourceCache,
            flowUtils,
            produceArtifact,
            eval(`typeof require !== "undefined"`) ? require : undefined,
        );
    }
}
