import { validateShadowrocketNativeInput } from '../shadowrocket-native-validation';
import { safeLoad } from '@/utils/yaml';
import { Base64 } from 'js-base64';
import $ from '@/core/app';

export function normalizeClashYaml(raw) {
    if (
        typeof raw !== 'string' ||
        !raw.includes('proxies:') ||
        !raw.includes('short-id:')
    ) {
        return raw;
    }

    try {
        const content = safeLoad(raw);
        if (!Array.isArray(content.proxies) || content.proxies.length === 0)
            return raw;
    } catch (e) {
        return raw;
    }
    // 防止 VLESS 节点 reality-opts 里的 short-id 被 YAML 标量推断成数字
    // 例如 08 / 0088 在部分内核重新解析时会触发 invalid REALITY short ID
    return raw.replace(/short-id:([ \t]*[^#\n,}]*)/g, (matched, value) => {
        const afterTrim = value.trim();

        if (!afterTrim || afterTrim === '') {
            return 'short-id: ""';
        }

        if (/^(['"]).*\1$/.test(afterTrim)) {
            return `short-id: ${afterTrim}`;
        } else if (['null'].includes(afterTrim)) {
            return `short-id: ${afterTrim}`;
        } else {
            return `short-id: "${afterTrim}"`;
        }
    });
}

function HTML() {
    const name = 'HTML';
    const test = (raw) => /^<!DOCTYPE html>/.test(raw);
    // simply discard HTML
    const parse = (raw, includeProxies, { native = false } = {}) => {
        if (native) throw new Error('HTML is not a proxy subscription');
        return '';
    };
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

function Clash() {
    const name = 'Clash Pre-processor';
    const test = function (raw) {
        if (!/proxies/.test(raw)) return false;
        const content = safeLoad(raw);
        return (
            Array.isArray(content.proxies) ||
            Array.isArray(content['proxy-groups'])
        );
    };
    const parse = function (raw, includeProxies, { native = false } = {}) {
        // Clash YAML format

        const afterReplace = normalizeClashYaml(raw);

        const { proxies } = safeLoad(afterReplace);
        if (native && !Array.isArray(proxies)) {
            throw new Error('Invalid Clash proxies: expected array');
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
    const parse = function (raw, includeProxies, { native = false } = {}) {
        // preprocessing for SSD subscription format
        const output = [];
        let ssdinfo = JSON.parse(Base64.decode(raw.split('ssd://')[1]));
        // servers config
        let servers = ssdinfo.servers;
        if (native) {
            if (!Array.isArray(servers)) throw new Error('Invalid Shadowrocket native SSD servers');
            const allowed = ['airport', 'port', 'encryption', 'password', 'servers', 'traffic_used', 'traffic_total', 'expiry', 'url'];
            for (const key of Object.keys(ssdinfo)) {
                if (!allowed.includes(key)) throw new Error(`Unsupported Shadowrocket native SSD option: ${key}`);
            }
            validateShadowrocketNativeInput({type: 'ss', port: ssdinfo.port, cipher: ssdinfo.encryption, password: ssdinfo.password});
        }
        for (let i = 0; i < servers.length; i++) {
            const server = servers[i];
            const method = server.encryption ?? ssdinfo.encryption;
            const password = server.password ?? ssdinfo.password;
            const port = server.port ?? ssdinfo.port;
            if (native) {
                const allowed = ['id', 'server', 'port', 'encryption', 'password', 'remarks', 'ratio'];
                for (const key of Object.keys(server)) {
                    if (!allowed.includes(key)) throw new Error(`Unsupported Shadowrocket native SSD server option: ${key}`);
                }
                const proxy = {type: 'ss', name: server.remarks ?? String(i), server: server.server, port, cipher: method, password};
                validateShadowrocketNativeInput(proxy);
                // Preserve scalar types until required-value validation.
                output[i] = JSON.stringify(proxy);
                continue;
            }
            let userinfo = Base64.encode(method + ':' + password);
            let hostname = server.server;
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
                encodeURIComponent(tag);
        }
        return output.join('\n');
    };
    return { name, test, parse };
}

function FullConfig() {
    const name = 'Full Config Preprocessor';
    const section = /^\[(?:server_local|Proxy)\][ \t]*\r?$/im;
    const test = (raw) => section.test(raw);
    const parse = (raw) => {
        const header = raw.match(section);
        if (!header) return raw;
        const body = raw.slice(header.index + header[0].length);
        return body.split(/^\[[^\]\r\n]+\][ \t]*\r?$/m)[0];
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
