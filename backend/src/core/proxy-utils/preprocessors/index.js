import { safeLoad } from '@/utils/yaml';
import { Base64 } from 'js-base64';
import $ from '@/core/app';

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

function Clash() {
    const name = 'Clash Pre-processor';
    const test = function (raw) {
        if (!/proxies/.test(raw)) return false;
        const content = safeLoad(raw);
        return content.proxies && Array.isArray(content.proxies);
    };
    const parse = function (raw, includeProxies) {
        // Clash YAML format

        // 防止 VLESS节点 reality-opts 选项中的 short-id 被解析成 Infinity
        // 匹配 short-id 冒号后面的值(包含空格和引号)
        const afterReplace = raw.replace(
            /short-id:([ ]*[^,\n}]*)/g,
            (matched, value) => {
                const afterTrim = value.trim();

                // 为空
                if (!afterTrim || afterTrim === '') {
                    return 'short-id: ""';
                }

                // 是否被引号包裹
                if (/^(['"]).*\1$/.test(afterTrim)) {
                    return `short-id: ${afterTrim}`;
                } else {
                    return `short-id: "${afterTrim}"`;
                }
            },
        );

        const {
            proxies,
            'global-client-fingerprint': globalClientFingerprint,
        } = safeLoad(afterReplace);
        return (
            (includeProxies ? 'proxies:\n' : '') +
            proxies
                .map((p) => {
                    // https://github.com/MetaCubeX/mihomo/blob/Alpha/docs/config.yaml#L73C1-L73C26
                    if (globalClientFingerprint && !p['client-fingerprint']) {
                        p['client-fingerprint'] = globalClientFingerprint;
                    }
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

export default [HTML(), Clash(), Base64Encoded(), SSD(), FullConfig()];
