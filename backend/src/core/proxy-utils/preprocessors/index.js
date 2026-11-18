import { safeLoad } from '@/utils/yaml';
import { Base64 } from 'js-base64';
import { isAlias, isScalar, isSeq, parseDocument, visit } from 'yaml';
import $ from '@/core/app';

const YAML_SHORT_ID_KEY_ANCHOR_RE = /&\S+\s+['"]?short-id['"]?/;

function isSafeShortIdScalar(val) {
    if (!val) return false;
    const first = val[0];
    if (first === '"' || first === "'") {
        return val.length >= 2 && val[val.length - 1] === first;
    }
    if (!/^[0-9a-fA-F]+$/.test(val)) return false;
    if (/^[0-9]+$/.test(val)) return false;
    if (/^0[xXbBoO]/.test(val)) return false;
    if (/^[0-9]+[eE][0-9]+$/.test(val)) return false;
    return true;
}

function needsShortIdNormalization(raw) {
    if (YAML_SHORT_ID_KEY_ANCHOR_RE.test(raw)) {
        return true;
    }

    for (
        let idx = raw.indexOf('short-id');
        idx !== -1;
        idx = raw.indexOf('short-id', idx + 8)
    ) {
        let i = idx + 8;
        if (raw[i] === '"' || raw[i] === "'") i++;
        while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++;
        if (raw[i] !== ':') continue;

        i++;
        while (i < raw.length && (raw[i] === ' ' || raw[i] === '\t')) i++;
        if (i >= raw.length || raw[i] === '\r' || raw[i] === '\n') {
            return true;
        }

        const quote = raw[i];
        if (quote === '"' || quote === "'") {
            let j = i + 1;
            let closed = false;
            while (j < raw.length && raw[j] !== '\r' && raw[j] !== '\n') {
                if (quote === '"' && raw[j] === '\\') {
                    j += 2;
                    continue;
                }
                if (quote === "'" && raw[j] === "'" && raw[j + 1] === "'") {
                    j += 2;
                    continue;
                }
                if (raw[j] === quote) {
                    closed = true;
                    j++;
                    break;
                }
                j++;
            }
            if (!closed) return true;
            while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t')) j++;
            if (
                j < raw.length &&
                raw[j] !== ',' &&
                raw[j] !== '}' &&
                raw[j] !== '\r' &&
                raw[j] !== '\n' &&
                raw[j] !== '#'
            ) {
                return true;
            }
            continue;
        }

        let j = i;
        while (j < raw.length) {
            const ch = raw[j];
            if (
                ch === ',' ||
                ch === '}' ||
                ch === '\r' ||
                ch === '\n' ||
                ch === '#'
            ) {
                break;
            }
            j++;
        }
        const val = raw.slice(i, j).trim();
        if (!isSafeShortIdScalar(val)) {
            return true;
        }
    }

    return false;
}

export function normalizeClashYaml(raw) {
    if (typeof raw !== 'string' || !raw.includes('short-id')) {
        return raw;
    }
    if (!needsShortIdNormalization(raw)) {
        return raw;
    }

    let document;
    try {
        document = parseDocument(raw, {
            merge: true,
            logLevel: 'error',
        });
        // legacy !<str> 可由 safeLoad 恢复；AST 仅用于定位原文。
        const content =
            document.errors.length > 0 ? safeLoad(raw) : document.toJS();
        if (
            ![content.proxies, content.listeners].some(
                (items) => Array.isArray(items) && items.length > 0,
            )
        )
            return raw;
    } catch (e) {
        return raw;
    }
    const anchors = new Map();
    const aliases = new Map();
    visit(document, {
        Node(_, node) {
            if (isAlias(node)) {
                aliases.set(node.range[0], anchors.get(node.source));
            } else if (node.anchor) {
                anchors.set(node.anchor, node);
            }
        },
    });
    const resolveAlias = (node) =>
        isAlias(node) ? aliases.get(node.range[0]) : node;
    const needsQuotes = (node) =>
        isScalar(node) &&
        typeof node.value !== 'string' &&
        node.value !== null &&
        !node.tag &&
        node.source;
    const realityConfigs = new Set();
    visit(document, {
        Pair(_, { key, value }) {
            const name = resolveAlias(key)?.value;
            if (['reality-opts', 'reality-config'].includes(name)) {
                realityConfigs.add(value);
            }
        },
    });
    // alias 和 merge 引用的节点也属于 REALITY 上下文。
    for (const config of realityConfigs) {
        visit(config, {
            Alias(_, alias) {
                realityConfigs.add(resolveAlias(alias));
            },
        });
    }

    const shortIds = new Set();
    visit(document, {
        Pair(_, { key, value }, path) {
            if (
                resolveAlias(key)?.value === 'short-id' &&
                path.some((node) => realityConfigs.has(node))
            ) {
                shortIds.add(value);
            }
        },
    });
    const replacements = new Map();
    // shortcut: 直接修改 anchor；跨字段共享时若需保留原类型，再隔离引用。
    for (const value of shortIds) {
        const node = resolveAlias(value);
        if (isSeq(node)) {
            for (const item of node.items) shortIds.add(item);
        } else if (needsQuotes(node)) {
            replacements.set(node, JSON.stringify(node.source));
        }
    }

    if (replacements.size === 0) {
        return raw;
    }

    const chunks = [];
    let offset = 0;
    for (const [node, content] of [...replacements].sort(
        ([left], [right]) => left.range[0] - right.range[0],
    )) {
        chunks.push(raw.slice(offset, node.range[0]), content);
        offset = node.range[1];
    }
    return chunks.join('') + raw.slice(offset);
}

function HTML() {
    const name = 'HTML';
    const test = (raw) => /^<!DOCTYPE html>/.test(raw);
    // simply discard HTML
    const parse = () => '';
    return { name, test, parse };
}

function Base64Encoded() {
    const name = 'Base64 Pre-processor';

    const keys = [
        'dm1lc3M', // vmess
        'c3NyOi8v', // ssr://
        'c29ja3M6Ly', // socks://
        'dHJvamFu', // trojan
        'c3M6Ly', // ss:/
        'c3NkOi8v', // ssd://
        'c2hhZG93', // shadow
        'aHR0c', // htt
        'dmxlc3M=', // vless
        'aHlzdGVyaWEy', // hysteria2
        'aHkyOi8v', // hy2://
        'd2lyZWd1YXJkOi8v', // wireguard://
        'd2c6Ly8=', // wg://
        'dHVpYzovLw==', // tuic://
    ];

    const test = function (raw) {
        return (
            Base64.isValid(raw) &&
            !/^\w+:\/\/\w+/im.test(raw) &&
            keys.some((k) => raw.indexOf(k) !== -1)
        );
    };
    const parse = function (raw) {
        const decoded = Base64.decode(raw);
        if (!/^\w+(:\/\/|\s*?=\s*?)\w+/m.test(decoded)) {
            $.error(
                `Base64 Pre-processor error: decoded line does not start with protocol`,
            );
            return raw;
        }

        return decoded;
    };
    return { name, test, parse };
}

function fallbackBase64Encoded() {
    const name = 'Fallback Base64 Pre-processor';

    const test = function (raw) {
        return Base64.isValid(raw);
    };
    const parse = function (raw) {
        const decoded = Base64.decode(raw);
        if (!/^\w+(:\/\/|\s*?=\s*?)\w+/m.test(decoded)) {
            $.error(
                `Fallback Base64 Pre-processor error: decoded line does not start with protocol`,
            );
            return raw;
        }

        return decoded;
    };
    return { name, test, parse };
}

function parseClashJsonLines(raw) {
    if (!raw.startsWith('proxies:\n') && !raw.startsWith('proxies:\r\n')) {
        return null;
    }
    if (
        raw.includes('short-id') &&
        /["']?short-id["']?\s*:\s*[^"'\s]/.test(raw)
    ) {
        return null;
    }
    const lines = raw.split(/\r?\n/);
    const proxies = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (!line.startsWith('  - {') || !line.endsWith('}')) {
            return null;
        }
        try {
            proxies.push(JSON.parse(line.slice(4)));
        } catch (e) {
            return null;
        }
    }
    return proxies;
}

function Clash() {
    const name = 'Clash Pre-processor';
    let lastRaw = null;
    let lastProxies = null;
    let lastIsValid = false;

    const test = function (raw) {
        if (!/proxies/.test(raw)) {
            lastRaw = null;
            lastProxies = null;
            lastIsValid = false;
            return false;
        }
        const jsonProxies = parseClashJsonLines(raw);
        if (jsonProxies) {
            lastRaw = raw;
            lastProxies = jsonProxies;
            lastIsValid = true;
            return true;
        }
        const content = safeLoad(raw);
        const valid = Boolean(
            content &&
                (Array.isArray(content.proxies) ||
                    Array.isArray(content['proxy-groups'])),
        );
        if (valid) {
            lastRaw = raw;
            lastProxies = Array.isArray(content.proxies) ? content.proxies : [];
            lastIsValid = true;
        } else {
            lastRaw = null;
            lastProxies = null;
            lastIsValid = false;
        }
        return valid;
    };
    const parse = function (raw, includeProxies) {
        // Clash YAML format
        let proxies;
        if (lastIsValid && lastRaw === raw) {
            proxies = lastProxies;
            lastRaw = null;
            lastProxies = null;
            lastIsValid = false;
            if (raw.includes('short-id')) {
                const afterReplace = normalizeClashYaml(raw);
                if (afterReplace !== raw) {
                    proxies = safeLoad(afterReplace)?.proxies;
                }
            }
        } else {
            lastRaw = null;
            lastProxies = null;
            lastIsValid = false;
            proxies = parseClashJsonLines(raw);
            if (!proxies) {
                const afterReplace = normalizeClashYaml(raw);
                proxies = safeLoad(afterReplace)?.proxies;
            }
        }
        return (
            (includeProxies ? 'proxies:\n' : '') +
            (Array.isArray(proxies) ? proxies : [])
                .map((p) => {
                    return `${includeProxies ? '  - ' : ''}${JSON.stringify(
                        p,
                    )}\n`;
                })
                .join('')
        );
    };
    return { name, test, parse };
}

function SSD() {
    const name = 'SSD Pre-processor';
    const test = function (raw) {
        return raw.indexOf('ssd://') === 0;
    };
    const parse = function (raw) {
        // preprocessing for SSD subscription format
        const output = [];
        let ssdinfo = JSON.parse(Base64.decode(raw.split('ssd://')[1]));
        let port = ssdinfo.port;
        let method = ssdinfo.encryption;
        let password = ssdinfo.password;
        // servers config
        let servers = ssdinfo.servers;
        for (let i = 0; i < servers.length; i++) {
            let server = servers[i];
            method = server.encryption ? server.encryption : method;
            password = server.password ? server.password : password;
            let userinfo = Base64.encode(method + ':' + password);
            let hostname = server.server;
            port = server.port ? server.port : port;
            let tag = server.remarks ? server.remarks : i;
            let plugin = server.plugin_options
                ? '/?plugin=' +
                  encodeURIComponent(
                      server.plugin + ';' + server.plugin_options,
                  )
                : '';
            output[i] =
                'ss://' +
                userinfo +
                '@' +
                hostname +
                ':' +
                port +
                plugin +
                '#' +
                tag;
        }
        return output.join('\n');
    };
    return { name, test, parse };
}

function FullConfig() {
    const name = 'Full Config Preprocessor';
    const test = function (raw) {
        return /^(\[server_local\]|\[Proxy\])/gm.test(raw);
    };
    const parse = function (raw) {
        const match = raw.match(
            /^\[server_local|Proxy\]([\s\S]+?)^\[.+?\](\r?\n|$)/im,
        )?.[1];
        return match || raw;
    };
    return { name, test, parse };
}

export default [
    HTML(),
    Clash(),
    Base64Encoded(),
    SSD(),
    FullConfig(),
    fallbackBase64Encoded(),
];
