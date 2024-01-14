import YAML from 'static-js-yaml';
import download from '@/utils/download';
import { isIPv4, isIPv6, isValidPortNumber } from '@/utils';
import PROXY_PROCESSORS, { ApplyProcessor } from './processors';
import PROXY_PREPROCESSORS from './preprocessors';
import PROXY_PRODUCERS from './producers';
import PROXY_PARSERS from './parsers';
import $ from '@/core/app';

function preprocess(raw) {
    for (const processor of PROXY_PREPROCESSORS) {
        try {
            if (processor.test(raw)) {
                $.info(`Pre-processor [${processor.name}] activated`);
                return processor.parse(raw);
            }
        } catch (e) {
            $.error(`Parser [${processor.name}] failed\n Reason: ${e}`);
        }
    }
    return raw;
}

function parse(raw) {
    raw = preprocess(raw);
    // parse
    const lines = raw.split('\n');
    const proxies = [];
    let lastParser;

    for (let line of lines) {
        line = line.trim();
        if (line.length === 0) continue; // skip empty line
        let success = false;

        // try to parse with last used parser
        if (lastParser) {
            const [proxy, error] = tryParse(lastParser, line);
            if (!error) {
                proxies.push(lastParse(proxy));
                success = true;
            }
        }

        if (!success) {
            // search for a new parser
            for (const parser of PROXY_PARSERS) {
                const [proxy, error] = tryParse(parser, line);
                if (!error) {
                    proxies.push(lastParse(proxy));
                    lastParser = parser;
                    success = true;
                    $.info(`${parser.name} is activated`);
                    break;
                }
            }
        }

        if (!success) {
            $.error(`Failed to parse line: ${line}`);
        }
    }
    return proxies;
}

async function process(proxies, operators = [], targetPlatform, source) {
    for (const item of operators) {
        // process script
        let script;
        let $arguments = {};
        if (item.type.indexOf('Script') !== -1) {
            const { mode, content } = item.args;
            if (mode === 'link') {
                let noCache;
                let url = content;
                if (url.endsWith('#noCache')) {
                    url = url.replace(/#noCache$/, '');
                    noCache = true;
                }
                // extract link arguments
                const rawArgs = url.split('#');
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

                // if this is a remote script, download it
                try {
                    script = await download(
                        `${url.split('#')[0]}${noCache ? '#noCache' : ''}`,
                    );
                    // $.info(`Script loaded: >>>\n ${script}`);
                } catch (err) {
                    $.error(
                        `Error when downloading remote script: ${item.args.content}.\n Reason: ${err}`,
                    );
                    throw new Error(`无法下载脚本: ${url}`);
                }
            } else {
                script = content;
            }
        }

        if (!PROXY_PROCESSORS[item.type]) {
            $.error(`Unknown operator: "${item.type}"`);
            continue;
        }

        $.info(
            `Applying "${item.type}" with arguments:\n >>> ${
                JSON.stringify(item.args, null, 2) || 'None'
            }`,
        );
        let processor;
        if (item.type.indexOf('Script') !== -1) {
            processor = PROXY_PROCESSORS[item.type](
                script,
                targetPlatform,
                $arguments,
                source,
            );
        } else {
            processor = PROXY_PROCESSORS[item.type](item.args || {});
        }
        proxies = await ApplyProcessor(processor, proxies);
    }
    return proxies;
}

function produce(proxies, targetPlatform, type, opts = {}) {
    const producer = PROXY_PRODUCERS[targetPlatform];
    if (!producer) {
        throw new Error(`Target platform: ${targetPlatform} is not supported!`);
    }

    // filter unsupported proxies
    proxies = proxies.filter(
        (proxy) =>
            !(proxy.supported && proxy.supported[targetPlatform] === false),
    );

    $.info(`Producing proxies for target: ${targetPlatform}`);
    if (typeof producer.type === 'undefined' || producer.type === 'SINGLE') {
        let localPort = 10000;
        const list = proxies
            .map((proxy) => {
                try {
                    let line = producer.produce(proxy, type, opts);
                    if (
                        line.length > 0 &&
                        line.includes('__SubStoreLocalPort__')
                    ) {
                        line = line.replace(
                            /__SubStoreLocalPort__/g,
                            localPort++,
                        );
                    }
                    return line;
                } catch (err) {
                    $.error(
                        `Cannot produce proxy: ${JSON.stringify(
                            proxy,
                            null,
                            2,
                        )}\nReason: ${err}`,
                    );
                    return '';
                }
            })
            .filter((line) => line.length > 0);
        return type === 'internal' ? list : list.join('\n');
    } else if (producer.type === 'ALL') {
        return producer.produce(proxies, type, opts);
    }
}

export const ProxyUtils = {
    parse,
    process,
    produce,
    isIPv4,
    isIPv6,
    isIP,
    yaml: YAML,
};

function tryParse(parser, line) {
    if (!safeMatch(parser, line)) return [null, new Error('Parser mismatch')];
    try {
        const proxy = parser.parse(line);
        return [proxy, null];
    } catch (err) {
        return [null, err];
    }
}

function safeMatch(parser, line) {
    try {
        return parser.test(line);
    } catch (err) {
        return false;
    }
}

function lastParse(proxy) {
    if (isValidPortNumber(proxy.port)) {
        proxy.port = parseInt(proxy.port, 10);
    }
    if (proxy.server) {
        proxy.server = `${proxy.server}`
            .trim()
            .replace(/^\[/, '')
            .replace(/\]$/, '');
    }
    if (proxy.type === 'trojan') {
        if (proxy.network === 'tcp') {
            delete proxy.network;
        }
    }
    if (['trojan', 'tuic', 'hysteria', 'hysteria2'].includes(proxy.type)) {
        proxy.tls = true;
    }
    if (proxy.network) {
        let transportHost = proxy[`${proxy.network}-opts`]?.headers?.Host;
        let transporthost = proxy[`${proxy.network}-opts`]?.headers?.host;
        if (transporthost && !transportHost) {
            proxy[`${proxy.network}-opts`].headers.Host = transporthost;
            delete proxy[`${proxy.network}-opts`].headers.host;
        }
    }
    if (proxy.tls && !proxy.sni) {
        if (proxy.network) {
            let transportHost = proxy[`${proxy.network}-opts`]?.headers?.Host;
            transportHost = Array.isArray(transportHost)
                ? transportHost[0]
                : transportHost;
            if (transportHost) {
                proxy.sni = transportHost;
            }
        }
        if (!proxy.sni && !isIP(proxy.server)) {
            proxy.sni = proxy.server;
        }
    }
    // 非 tls, 有 ws/http 传输层, 使用域名的节点, 将设置传输层 Host 防止之后域名解析后丢失域名(不覆盖现有的 Host)
    if (
        !proxy.tls &&
        ['ws', 'http'].includes(proxy.network) &&
        !proxy[`${proxy.network}-opts`]?.headers?.Host &&
        !isIP(proxy.server)
    ) {
        proxy[`${proxy.network}-opts`] = proxy[`${proxy.network}-opts`] || {};
        proxy[`${proxy.network}-opts`].headers =
            proxy[`${proxy.network}-opts`].headers || {};
        proxy[`${proxy.network}-opts`].headers.Host =
            ['vmess', 'vless'].includes(proxy.type) && proxy.network === 'http'
                ? [proxy.server]
                : proxy.server;
    }
    // 统一将 VMess 和 VLESS 的 http 传输层的 path 和 Host 处理为数组
    if (['vmess', 'vless'].includes(proxy.type) && proxy.network === 'http') {
        let transportPath = proxy[`${proxy.network}-opts`]?.path;
        let transportHost = proxy[`${proxy.network}-opts`]?.headers?.Host;
        if (transportHost && !Array.isArray(transportHost)) {
            proxy[`${proxy.network}-opts`].headers.Host = [transportHost];
        }
        if (transportPath && !Array.isArray(transportPath)) {
            proxy[`${proxy.network}-opts`].path = [transportPath];
        }
    }
    if (['hysteria', 'hysteria2'].includes(proxy.type) && !proxy.ports) {
        delete proxy.ports;
    }
    return proxy;
}

function isIP(ip) {
    return isIPv4(ip) || isIPv6(ip);
}
