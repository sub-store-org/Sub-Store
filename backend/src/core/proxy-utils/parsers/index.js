import { getIfNotBlank, isPresent, isNotBlank, getIfPresent } from '@/utils';
import getSurgeParser from './peggy/surge';
import getLoonParser from './peggy/loon';
import getQXParser from './peggy/qx';
import getTrojanURIParser from './peggy/trojan-uri';

import { Base64 } from 'js-base64';

// Parse SS URI format (only supports new SIP002, legacy format is depreciated).
// reference: https://github.com/shadowsocks/shadowsocks-org/wiki/SIP002-URI-Scheme
function URI_SS() {
    const name = 'URI SS Parser';
    const test = (line) => {
        return /^ss:\/\//.test(line);
    };
    const parse = (line) => {
        // parse url
        let content = line.split('ss://')[1];

        const proxy = {
            name: decodeURIComponent(line.split('#')[1]),
            type: 'ss',
        };
        content = content.split('#')[0]; // strip proxy name
        // handle IPV4 and IPV6
        const serverAndPort = content.match(/@([^/]*)(\/|$)/)[1];
        const portIdx = serverAndPort.lastIndexOf(':');
        proxy.server = serverAndPort.substring(0, portIdx);
        proxy.port = serverAndPort.substring(portIdx + 1);

        const userInfo = Base64.decode(content.split('@')[0]).split(':');
        proxy.cipher = userInfo[0];
        proxy.password = userInfo[1];

        // handle obfs
        const idx = content.indexOf('?plugin=');
        if (idx !== -1) {
            const pluginInfo = (
                'plugin=' +
                decodeURIComponent(content.split('?plugin=')[1].split('&')[0])
            ).split(';');
            const params = {};
            for (const item of pluginInfo) {
                const [key, val] = item.split('=');
                if (key) params[key] = val || true; // some options like "tls" will not have value
            }
            switch (params.plugin) {
                case 'obfs-local':
                case 'simple-obfs':
                    proxy.plugin = 'obfs';
                    proxy['plugin-opts'] = {
                        mode: params.obfs,
                        host: getIfNotBlank(params['obfs-host']),
                    };
                    break;
                case 'v2ray-plugin':
                    proxy.obfs = 'v2ray-plugin';
                    proxy['plugin-opts'] = {
                        mode: 'websocket',
                        host: getIfNotBlank(params['obfs-host']),
                        path: getIfNotBlank(params.path),
                        tls: getIfPresent(params.tls),
                    };
                    break;
                default:
                    throw new Error(
                        `Unsupported plugin option: ${params.plugin}`,
                    );
            }
        }
        return proxy;
    };
    return { name, test, parse };
}

// Parse URI SSR format, such as ssr://xxx
function URI_SSR() {
    const name = 'URI SSR Parser';
    const test = (line) => {
        return /^ssr:\/\//.test(line);
    };
    const parse = (line) => {
        line = Base64.decode(line.split('ssr://')[1]);

        // handle IPV6 & IPV4 format
        let splitIdx = line.indexOf(':origin');
        if (splitIdx === -1) {
            splitIdx = line.indexOf(':auth_');
        }
        const serverAndPort = line.substring(0, splitIdx);
        const server = serverAndPort.substring(
            0,
            serverAndPort.lastIndexOf(':'),
        );
        const port = serverAndPort.substring(
            serverAndPort.lastIndexOf(':') + 1,
        );

        let params = line
            .substring(splitIdx + 1)
            .split('/?')[0]
            .split(':');
        let proxy = {
            type: 'ssr',
            server,
            port,
            protocol: params[0],
            cipher: params[1],
            obfs: params[2],
            password: Base64.decode(params[3]),
        };
        // get other params
        const other_params = {};
        line = line.split('/?')[1].split('&');
        if (line.length > 1) {
            for (const item of line) {
                let [key, val] = item.split('=');
                val = val.trim();
                if (val.length > 0) {
                    other_params[key] = val;
                }
            }
        }
        proxy = {
            ...proxy,
            name: other_params.remarks
                ? Base64.decode(other_params.remarks)
                : proxy.server,
            'protocol-param': getIfNotBlank(
                Base64.decode(other_params.protoparam || '').replace(/\s/g, ''),
            ),
            'obfs-param': getIfNotBlank(
                Base64.decode(other_params.obfsparam || '').replace(/\s/g, ''),
            ),
        };
        return proxy;
    };

    return { name, test, parse };
}

// V2rayN URI VMess format
// reference: https://github.com/2dust/v2rayN/wiki/%E5%88%86%E4%BA%AB%E9%93%BE%E6%8E%A5%E6%A0%BC%E5%BC%8F%E8%AF%B4%E6%98%8E(ver-2)

// Quantumult VMess format
function URI_VMess() {
    const name = 'URI VMess Parser';
    const test = (line) => {
        return /^vmess:\/\//.test(line);
    };
    const parse = (line) => {
        line = line.split('vmess://')[1];
        const content = Base64.decode(line);
        if (/=\s*vmess/.test(content)) {
            // Quantumult VMess URI format
            const partitions = content.split(',').map((p) => p.trim());
            // get keyword params
            const params = {};
            for (const part of partitions) {
                if (part.indexOf('=') !== -1) {
                    const [key, val] = part.split('=');
                    params[key.trim()] = val.trim();
                }
            }

            const proxy = {
                name: partitions[0].split('=')[0].trim(),
                type: 'vmess',
                server: partitions[1],
                port: partitions[2],
                cipher: getIfNotBlank(partitions[3], 'auto'),
                uuid: partitions[4].match(/^"(.*)"$/)[1],
                tls: params.obfs === 'wss',
                udp: getIfPresent(params['udp-relay']),
                tfo: getIfPresent(params['fast-open']),
                'skip-cert-verify': isPresent(params['tls-verification'])
                    ? !params['tls-verification']
                    : undefined,
            };

            // handle ws headers
            if (isPresent(params.obfs)) {
                if (params.obfs === 'ws' || params.obfs === 'wss') {
                    proxy.network = 'ws';
                    proxy['ws-opts'].path = (
                        getIfNotBlank(params['obfs-path']) || '"/"'
                    ).match(/^"(.*)"$/)[1];
                    let obfs_host = params['obfs-header'];
                    if (obfs_host && obfs_host.indexOf('Host') !== -1) {
                        obfs_host = obfs_host.match(
                            /Host:\s*([a-zA-Z0-9-.]*)/,
                        )[1];
                    }
                    if (isNotBlank(obfs_host)) {
                        proxy['ws-opts'].headers = {
                            Host: obfs_host,
                        };
                    }
                } else {
                    throw new Error(`Unsupported obfs: ${params.obfs}`);
                }
            }
            return proxy;
        } else {
            // V2rayN URI format
            const params = JSON.parse(content);
            const proxy = {
                name: params.ps,
                type: 'vmess',
                server: params.add,
                port: params.port,
                cipher: 'auto', // V2rayN has no default cipher! use aes-128-gcm as default.
                uuid: params.id,
                alterId: getIfPresent(params.aid, 0),
                tls: params.tls === 'tls' || params.tls === true,
                'skip-cert-verify': isPresent(params.verify_cert)
                    ? !params.verify_cert
                    : undefined,
            };
            // handle obfs
            if (params.net === 'ws') {
                proxy.network = 'ws';
                proxy['ws-opts'] = {
                    path: getIfNotBlank(params.path),
                    headers: { Host: getIfNotBlank(params.host) },
                };
                if (proxy.tls && params.host) {
                    proxy.sni = params.host;
                }
            }
            return proxy;
        }
    };
    return { name, test, parse };
}

// Trojan URI format
function URI_Trojan() {
    const name = 'URI Trojan Parser';
    const test = (line) => {
        return /^trojan:\/\//.test(line);
    };

    const parse = (line) => {
        const parser = getTrojanURIParser();
        const proxy = parser.parse(line);
        return proxy;
    };
    return { name, test, parse };
}

function Clash_All() {
    const name = 'Clash Parser';
    const test = (line) => {
        try {
            JSON.parse(line);
        } catch (e) {
            return false;
        }
        return true;
    };
    const parse = (line) => {
        const proxy = JSON.parse(line);
        if (
            ![
                'ss',
                'ssr',
                'vmess',
                'socks',
                'http',
                'snell',
                'trojan',
            ].includes(proxy.type)
        ) {
            throw new Error(
                `Clash does not support proxy with type: ${proxy.type}`,
            );
        }

        // handle vmess sni
        if (proxy.type === 'vmess') {
            proxy.sni = proxy.servername;
            delete proxy.servername;
        }

        return proxy;
    };
    return { name, test, parse };
}

function QX_SS() {
    const name = 'QX SS Parser';
    const test = (line) => {
        return (
            /^shadowsocks\s*=/.test(line.split(',')[0].trim()) &&
            line.indexOf('ssr-protocol') === -1
        );
    };
    const parse = (line) => {
        const parser = getQXParser();
        return parser.parse(line);
    };
    return { name, test, parse };
}

function QX_SSR() {
    const name = 'QX SSR Parser';
    const test = (line) => {
        return (
            /^shadowsocks\s*=/.test(line.split(',')[0].trim()) &&
            line.indexOf('ssr-protocol') !== -1
        );
    };
    const parse = (line) => getQXParser().parse(line);
    return { name, test, parse };
}

function QX_VMess() {
    const name = 'QX VMess Parser';
    const test = (line) => {
        return /^vmess\s*=/.test(line.split(',')[0].trim());
    };
    const parse = (line) => getQXParser().parse(line);
    return { name, test, parse };
}

function QX_Trojan() {
    const name = 'QX Trojan Parser';
    const test = (line) => {
        return /^trojan\s*=/.test(line.split(',')[0].trim());
    };
    const parse = (line) => getQXParser().parse(line);
    return { name, test, parse };
}

function QX_Http() {
    const name = 'QX HTTP Parser';
    const test = (line) => {
        return /^http\s*=/.test(line.split(',')[0].trim());
    };
    const parse = (line) => getQXParser().parse(line);
    return { name, test, parse };
}

function QX_Socks5() {
    const name = 'QX Socks5 Parser';
    const test = (line) => {
        return /^socks5\s*=/.test(line.split(',')[0].trim());
    };
    const parse = (line) => getQXParser().parse(line);
    return { name, test, parse };
}

function Loon_SS() {
    const name = 'Loon SS Parser';
    const test = (line) => {
        return (
            line.split(',')[0].split('=')[1].trim().toLowerCase() ===
            'shadowsocks'
        );
    };
    const parse = (line) => getLoonParser().parse(line);
    return { name, test, parse };
}

function Loon_SSR() {
    const name = 'Loon SSR Parser';
    const test = (line) => {
        return (
            line.split(',')[0].split('=')[1].trim().toLowerCase() ===
            'shadowsocksr'
        );
    };
    const parse = (line) => getLoonParser().parse(line);
    return { name, test, parse };
}

function Loon_VMess() {
    const name = 'Loon VMess Parser';
    const test = (line) => {
        // distinguish between surge vmess
        return (
            /^.*=\s*vmess/i.test(line.split(',')[0]) &&
            line.indexOf('username') === -1
        );
    };
    const parse = (line) => getLoonParser().parse(line);
    return { name, test, parse };
}

function Loon_Vless() {
    const name = 'Loon Vless Parser';
    const test = (line) => {
        return /^.*=\s*vless/i.test(line.split(',')[0]);
    };
    const parse = (line) => getLoonParser().parse(line);
    return { name, test, parse };
}

function Loon_Trojan() {
    const name = 'Loon Trojan Parser';
    const test = (line) => {
        return /^.*=\s*trojan/i.test(line.split(',')[0]);
    };

    const parse = (line) => getLoonParser().parse(line);
    return { name, test, parse };
}

function Loon_Http() {
    const name = 'Loon HTTP Parser';
    const test = (line) => {
        return /^.*=\s*http/i.test(line.split(',')[0]);
    };

    const parse = (line) => getLoonParser().parse(line);
    return { name, test, parse };
}

function Surge_SS() {
    const name = 'Surge SS Parser';
    const test = (line) => {
        return /^.*=\s*ss/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

function Surge_VMess() {
    const name = 'Surge VMess Parser';
    const test = (line) => {
        return (
            /^.*=\s*vmess/.test(line.split(',')[0]) &&
            line.indexOf('username') !== -1
        );
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

function Surge_Trojan() {
    const name = 'Surge Trojan Parser';
    const test = (line) => {
        return /^.*=\s*trojan/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

function Surge_Http() {
    const name = 'Surge HTTP Parser';
    const test = (line) => {
        return /^.*=\s*https?/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

function Surge_Socks5() {
    const name = 'Surge Socks5 Parser';
    const test = (line) => {
        return /^.*=\s*socks5(-tls)?/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

function Surge_Snell() {
    const name = 'Surge Snell Parser';
    const test = (line) => {
        return /^.*=\s*snell?/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

export default [
    URI_SS(),
    URI_SSR(),
    URI_VMess(),
    URI_Trojan(),
    Clash_All(),
    Surge_SS(),
    Surge_VMess(),
    Surge_Trojan(),
    Surge_Http(),
    Surge_Snell(),
    Surge_Socks5(),
    Loon_SS(),
    Loon_SSR(),
    Loon_VMess(),
    Loon_Vless(),
    Loon_Trojan(),
    Loon_Http(),
    QX_SS(),
    QX_SSR(),
    QX_VMess(),
    QX_Trojan(),
    QX_Http(),
    QX_Socks5(),
];
