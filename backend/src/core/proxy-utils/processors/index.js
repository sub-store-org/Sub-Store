import resourceCache from '@/utils/resource-cache';
import scriptResourceCache from '@/utils/script-resource-cache';
import { isIPv4, isIPv6 } from '@/utils';
import { FULL } from '@/utils/logical';
import { getFlag } from '@/utils/geo';
import lodash from 'lodash';
import $ from '@/core/app';
import { hex_md5 } from '@/vendor/md5';
import { ProxyUtils } from '@/core/proxy-utils';
import { produceArtifact } from '@/restful/sync';

import env from '@/utils/env';
import {
    getFlowField,
    getFlowHeaders,
    parseFlowHeaders,
    flowTransfer,
} from '@/utils/flow';

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
                proxies.filter((_, i) => selected[i]);
            }

            return proxies.map((proxy) => {
                proxy.udp = get(args.udp, proxy.udp);
                proxy.tfo = get(args.tfo, proxy.tfo);
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
function FlagOperator({ mode }) {
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
                    proxy.name = proxy.name.replace(/🇹🇼/g, '🇨🇳');
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
function ScriptOperator(script, targetPlatform, $arguments, source) {
    return {
        name: 'Script Operator',
        func: async (proxies) => {
            let output = proxies;
            await (async function () {
                const operator = createDynamicFunction(
                    'operator',
                    script,
                    $arguments,
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
                        if (input?.$files || input?.$content) {
                            let { $content, $files } = input
                            ${script}
                            return { $content, $files }
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
                );
                output = operator(proxies, targetPlatform, { source, ...env });
            })();
            return output;
        },
    };
}

const DOMAIN_RESOLVERS = {
    Google: async function (domain) {
        const id = hex_md5(`GOOGLE:${domain}`);
        const cached = resourceCache.get(id);
        if (cached) return cached;
        const resp = await $.http.get({
            url: `https://8.8.4.4/resolve?name=${encodeURIComponent(
                domain,
            )}&type=A`,
            headers: {
                accept: 'application/dns-json',
            },
        });
        const body = JSON.parse(resp.body);
        if (body['Status'] !== 0) {
            throw new Error(`Status is ${body['Status']}`);
        }
        const answers = body['Answer'];
        if (answers.length === 0) {
            throw new Error('No answers');
        }
        const result = answers[answers.length - 1].data;
        resourceCache.set(id, result);
        return result;
    },
    'IP-API': async function (domain) {
        const id = hex_md5(`IP-API:${domain}`);
        const cached = resourceCache.get(id);
        if (cached) return cached;
        const resp = await $.http.get({
            url: `http://ip-api.com/json/${encodeURIComponent(
                domain,
            )}?lang=zh-CN`,
        });
        const body = JSON.parse(resp.body);
        if (body['status'] !== 'success') {
            throw new Error(`Status is ${body['status']}`);
        }
        const result = body.query;
        resourceCache.set(id, result);
        return result;
    },
    Cloudflare: async function (domain) {
        const id = hex_md5(`CLOUDFLARE:${domain}`);
        const cached = resourceCache.get(id);
        if (cached) return cached;
        const resp = await $.http.get({
            url: `https://1.0.0.1/dns-query?name=${encodeURIComponent(
                domain,
            )}&type=A`,
            headers: {
                accept: 'application/dns-json',
            },
        });
        const body = JSON.parse(resp.body);
        if (body['Status'] !== 0) {
            throw new Error(`Status is ${body['Status']}`);
        }
        const answers = body['Answer'];
        if (answers.length === 0) {
            throw new Error('No answers');
        }
        const result = answers[answers.length - 1].data;
        resourceCache.set(id, result);
        return result;
    },
    Ali: async function (domain) {
        const id = hex_md5(`ALI:${domain}`);
        const cached = resourceCache.get(id);
        if (cached) return cached;
        const resp = await $.http.get({
            url: `http://223.6.6.6/resolve?name=${encodeURIComponent(
                domain,
            )}&type=A&short=1`,
            headers: {
                accept: 'application/dns-json',
            },
        });
        const answers = JSON.parse(resp.body);
        if (answers.length === 0) {
            throw new Error('No answers');
        }
        const result = answers[answers.length - 1];
        resourceCache.set(id, result);
        return result;
    },
    Tencent: async function (domain) {
        const id = hex_md5(`ALI:${domain}`);
        const cached = resourceCache.get(id);
        if (cached) return cached;
        const resp = await $.http.get({
            url: `http://119.28.28.28/d?type=A&dn=${encodeURIComponent(
                domain,
            )}`,
            headers: {
                accept: 'application/dns-json',
            },
        });
        const answers = resp.body.split(';').map((i) => i.split(',')[0]);
        if (answers.length === 0) {
            throw new Error('No answers');
        }
        const result = answers[answers.length - 1];
        resourceCache.set(id, result);
        return result;
    },
};

function ResolveDomainOperator({ provider }) {
    const resolver = DOMAIN_RESOLVERS[provider];
    if (!resolver) {
        throw new Error(`Cannot find resolver: ${provider}`);
    }
    return {
        name: 'Resolve Domain Operator',
        func: async (proxies) => {
            const results = {};
            const limit = 15; // more than 20 concurrency may result in surge TCP connection shortage.
            const totalDomain = [
                ...new Set(
                    proxies
                        .filter((p) => !isIP(p.server) && !p['no-resolve'])
                        .map((c) => c.server),
                ),
            ];
            const totalBatch = Math.ceil(totalDomain.length / limit);
            for (let i = 0; i < totalBatch; i++) {
                const currentBatch = [];
                for (let domain of totalDomain.splice(0, limit)) {
                    currentBatch.push(
                        resolver(domain)
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
                if (!p['no-resolve']) {
                    if (results[p.server]) {
                        p.server = results[p.server];
                        p.resolved = true;
                    } else {
                        p.resolved = false;
                    }
                }
            });

            return proxies;
        },
    };
}

function isIP(ip) {
    return isIPv4(ip) || isIPv6(ip);
}

ResolveDomainOperator.resolver = DOMAIN_RESOLVERS;

/**************************** Filters ***************************************/
// filter useless proxies
function UselessFilter() {
    const KEYWORDS = [
        '网址',
        '流量',
        '时间',
        '应急',
        '过期',
        'Bandwidth',
        'expire',
    ];
    return {
        name: 'Useless Filter',
        func: RegexFilter({
            regex: KEYWORDS,
            keep: false,
        }).func,
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
function ScriptFilter(script, targetPlatform, $arguments, source) {
    return {
        name: 'Script Filter',
        func: async (proxies) => {
            let output = FULL(proxies.length, true);
            await (async function () {
                const filter = createDynamicFunction(
                    'filter',
                    script,
                    $arguments,
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

// remove flag
function removeFlag(str) {
    return str
        .replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '')
        .trim();
}

function createDynamicFunction(name, script, $arguments) {
    const flowUtils = {
        getFlowField,
        getFlowHeaders,
        parseFlowHeaders,
        flowTransfer,
    };
    if ($.env.isLoon) {
        return new Function(
            '$arguments',
            '$substore',
            'lodash',
            '$persistentStore',
            '$httpClient',
            '$notification',
            'ProxyUtils',
            'scriptResourceCache',
            'flowUtils',
            'produceArtifact',
            `${script}\n return ${name}`,
        )(
            $arguments,
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
        );
    } else {
        return new Function(
            '$arguments',
            '$substore',
            'lodash',
            'ProxyUtils',
            'scriptResourceCache',
            'flowUtils',
            'produceArtifact',

            `${script}\n return ${name}`,
        )(
            $arguments,
            $,
            lodash,
            ProxyUtils,
            scriptResourceCache,
            flowUtils,
            produceArtifact,
        );
    }
}
