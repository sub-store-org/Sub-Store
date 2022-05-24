/* eslint-disable no-case-declarations */
import { safeLoad } from 'static-js-yaml';
import { Base64 } from 'js-base64';

import { AND, FULL } from '../utils/logical';
import download from '../utils/download';
import { getFlag } from '../utils/geo';

import $ from './app';

const PROXY_PREPROCESSORS = (function () {
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
            'dm1lc3M',
            'c3NyOi8v',
            'dHJvamFu',
            'c3M6Ly',
            'c3NkOi8v',
            'c2hhZG93',
            'aHR0c',
        ];

        const test = function (raw) {
            return keys.some((k) => raw.indexOf(k) !== -1);
        };
        const parse = function (raw) {
            raw = Base64.decode(raw);
            return raw;
        };
        return { name, test, parse };
    }

    function Clash() {
        const name = 'Clash Pre-processor';
        const test = function (raw) {
            return /proxies/.test(raw);
        };
        const parse = function (raw) {
            // Clash YAML format
            const proxies = safeLoad(raw).proxies;
            return proxies.map((p) => JSON.stringify(p)).join('\n');
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

    return [HTML(), Base64Encoded(), Clash(), SSD()];
})();
const PROXY_PARSERS = (function () {
    // Parse SS URI format (only supports new SIP002, legacy format is depreciated).
    // reference: https://shadowsocks.org/en/spec/SIP002-URI-Scheme.html
    function URI_SS() {
        const name = 'URI SS Parser';
        const test = (line) => {
            return /^ss:\/\//.test(line);
        };
        const parse = (line) => {
            const supported = {};
            // parse url
            let content = line.split('ss://')[1];

            const proxy = {
                name: decodeURIComponent(line.split('#')[1]),
                type: 'ss',
                supported,
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
                    decodeURIComponent(
                        content.split('?plugin=')[1].split('&')[0],
                    )
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
                            host: params['obfs-host'],
                        };
                        break;
                    case 'v2ray-plugin':
                        proxy.supported = {
                            ...supported,
                            Loon: false,
                            Surge: false,
                        };
                        proxy.obfs = 'v2ray-plugin';
                        proxy['plugin-opts'] = {
                            mode: 'websocket',
                            host: params['obfs-host'],
                            path: params.path || '',
                            tls: params.tls || false,
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
        const supported = {
            Surge: false,
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
                supported,
            };
            // get other params
            const other_params = {};
            line = line.split('/?')[1].split('&');
            if (line.length > 1) {
                for (const item of line) {
                    const [key, val] = item.split('=');
                    other_params[key] = val.trim();
                }
            }
            proxy = {
                ...proxy,
                name: other_params.remarks
                    ? Base64.decode(other_params.remarks)
                    : proxy.server,
                'protocol-param': Base64.decode(
                    other_params.protoparam || '',
                ).replace(/\s/g, ''),
                'obfs-param': Base64.decode(
                    other_params.obfsparam || '',
                ).replace(/\s/g, ''),
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
            const supported = {};
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
                    cipher: partitions[3],
                    uuid: partitions[4].match(/^"(.*)"$/)[1],
                    tls: params.obfs === 'over-tls' || params.obfs === 'wss',
                };

                if (typeof params['udp-relay'] !== 'undefined')
                    proxy.udp = JSON.parse(params['udp-relay']);
                if (typeof params['fast-open'] !== 'undefined')
                    proxy.udp = JSON.parse(params['fast-open']);

                // handle ws headers
                if (params.obfs === 'ws' || params.obfs === 'wss') {
                    proxy.network = 'ws';
                    proxy['ws-opts'].path = (
                        params['obfs-path'] || '"/"'
                    ).match(/^"(.*)"$/)[1];
                    let obfs_host = params['obfs-header'];
                    if (obfs_host && obfs_host.indexOf('Host') !== -1) {
                        obfs_host = obfs_host.match(
                            /Host:\s*([a-zA-Z0-9-.]*)/,
                        )[1];
                    }
                    proxy['ws-opts'].headers = {
                        Host: obfs_host || proxy.server, // if no host provided, use the same as server
                    };
                }

                // handle scert
                if (proxy.tls && params['"tls-verification"'] === 'false') {
                    proxy['skip-cert-verify'] = true;
                }

                // handle sni
                if (proxy.tls && params['obfs-host']) {
                    proxy.sni = params['obfs-host'];
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
                    alterId: params.aid || 0,
                    tls: params.tls === 'tls' || params.tls === true,
                    supported,
                };
                // handle obfs
                if (params.net === 'ws') {
                    proxy.network = 'ws';
                    proxy['ws-opts'] = {
                        path: params.path,
                        headers: { Host: params.host || params.add },
                    };
                    if (proxy.tls && params.host) {
                        proxy.sni = params.host;
                    }
                }
                // handle scert
                if (params.verify_cert === false) {
                    proxy['skip-cert-verify'] = true;
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
            const supported = {};
            line = line.split('trojan://')[1];
            const [server, port] = line.split('@')[1].split('?')[0].split(':');
            const name = decodeURIComponent(line.split('#')[1].trim());
            let paramArr = line.split('?');
            let sni = null;
            if (paramArr.length > 1) {
                paramArr = paramArr[1].split('#')[0].split('&');
                const params = new Map(
                    paramArr.map((item) => {
                        return item.split('=');
                    }),
                );
                sni = params.get('sni');
            }

            return {
                name: name || `[Trojan] ${server}`, // trojan uri may have no server tag!
                type: 'trojan',
                server,
                port,
                password: line.split('@')[0],
                sni,
                supported,
            };
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
        const parse = (line) => JSON.parse(line);
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
            const supported = {};
            const params = getQXParams(line);
            const proxy = {
                name: params.tag,
                type: 'ss',
                server: params.server,
                port: params.port,
                cipher: params.method,
                password: params.password,
                udp: JSON.parse(params['udp-relay'] || 'false'),
                tfo: JSON.parse(params['fast-open'] || 'false'),
                supported,
            };
            // handle obfs options
            if (params.obfs) {
                proxy['plugin-opts'] = {
                    host: params['obfs-host'] || proxy.server,
                };
                switch (params.obfs) {
                    case 'http':
                    case 'tls':
                        proxy.plugin = 'obfs';
                        proxy['plugin-opts'].mode = params.obfs;
                        break;
                    case 'ws':
                    case 'wss':
                        proxy['plugin-opts'] = {
                            ...proxy['plugin-opts'],
                            mode: 'websocket',
                            path: params['obfs-uri'] || '/',
                            tls: params.obfs === 'wss',
                        };
                        if (
                            proxy['plugin-opts'].tls &&
                            typeof params['tls-verification'] !== 'undefined'
                        ) {
                            proxy['plugin-opts']['skip-cert-verify'] =
                                params['tls-verification'];
                        }
                        proxy.plugin = 'v2ray-plugin';
                        // Surge and Loon lack support for v2ray-plugin obfs
                        proxy.supported.Surge = false;
                        proxy.supported.Loon = false;
                        break;
                }
            }
            return proxy;
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

        const parse = (line) => {
            const supported = {
                Surge: false,
            };
            const params = getQXParams(line);
            const proxy = {
                name: params.tag,
                type: 'ssr',
                server: params.server,
                port: params.port,
                cipher: params.method,
                password: params.password,
                protocol: params['ssr-protocol'],
                obfs: 'plain', // default obfs
                'protocol-param': params['ssr-protocol-param'],
                udp: JSON.parse(params['udp-relay'] || 'false'),
                tfo: JSON.parse(params['fast-open'] || 'false'),
                supported,
            };
            // handle obfs options
            if (params.obfs) {
                proxy.obfs = params.obfs;
                proxy['obfs-param'] = params['obfs-host'];
            }
            return proxy;
        };
        return { name, test, parse };
    }

    function QX_VMess() {
        const name = 'QX VMess Parser';
        const test = (line) => {
            return /^vmess\s*=/.test(line.split(',')[0].trim());
        };
        const parse = (line) => {
            const params = getQXParams(line);
            const proxy = {
                type: 'vmess',
                name: params.tag,
                server: params.server,
                port: params.port,
                cipher: params.method || 'none',
                uuid: params.password,
                alterId: 0,
                tls: params.obfs === 'over-tls' || params.obfs === 'wss',
                udp: JSON.parse(params['udp-relay'] || 'false'),
                tfo: JSON.parse(params['fast-open'] || 'false'),
            };
            if (proxy.tls) {
                proxy.sni = params['obfs-host'] || params.server;
                proxy['skip-cert-verify'] = !JSON.parse(
                    params['tls-verification'] || 'true',
                );
            }
            // handle ws headers
            if (params.obfs === 'ws' || params.obfs === 'wss') {
                proxy.network = 'ws';
                proxy['ws-opts'] = {
                    path: params['obfs-uri'],
                    headers: {
                        Host: params['obfs-host'] || params.server, // if no host provided, use the same as server
                    },
                };
            }
            return proxy;
        };

        return { name, test, parse };
    }

    function QX_Trojan() {
        const name = 'QX Trojan Parser';
        const test = (line) => {
            return /^trojan\s*=/.test(line.split(',')[0].trim());
        };
        const parse = (line) => {
            const params = getQXParams(line);
            const proxy = {
                type: 'trojan',
                name: params.tag,
                server: params.server,
                port: params.port,
                password: params.password,
                sni: params['tls-host'] || params.server,
                udp: JSON.parse(params['udp-relay'] || 'false'),
                tfo: JSON.parse(params['fast-open'] || 'false'),
            };
            proxy['skip-cert-verify'] = !JSON.parse(
                params['tls-verification'] || 'true',
            );
            return proxy;
        };
        return { name, test, parse };
    }

    function QX_Http() {
        const name = 'QX HTTP Parser';
        const test = (line) => {
            return /^http\s*=/.test(line.split(',')[0].trim());
        };
        const parse = (line) => {
            const params = getQXParams(line);
            const proxy = {
                type: 'http',
                name: params.tag,
                server: params.server,
                port: params.port,
                tls: JSON.parse(params['over-tls'] || 'false'),
                udp: JSON.parse(params['udp-relay'] || 'false'),
                tfo: JSON.parse(params['fast-open'] || 'false'),
            };
            if (params.username && params.username !== 'none')
                proxy.username = params.username;
            if (params.password && params.password !== 'none')
                proxy.password = params.password;
            if (proxy.tls) {
                proxy.sni = params['tls-host'] || proxy.server;
                proxy['skip-cert-verify'] = !JSON.parse(
                    params['tls-verification'] || 'true',
                );
            }
            return proxy;
        };

        return { name, test, parse };
    }

    function getQXParams(line) {
        const groups = line.split(',');
        const params = {};
        const protocols = ['shadowsocks', 'vmess', 'http', 'trojan'];
        groups.forEach((g) => {
            let [key, value] = g.split('=');
            key = key.trim();
            value = value.trim();
            if (protocols.indexOf(key) !== -1) {
                params.type = key;
                const conf = value.split(':');
                params.server = conf[0];
                params.port = conf[1];
            } else {
                params[key.trim()] = value.trim();
            }
        });
        return params;
    }

    function Loon_SS() {
        const name = 'Loon SS Parser';
        const test = (line) => {
            return (
                line.split(',')[0].split('=')[1].trim().toLowerCase() ===
                'shadowsocks'
            );
        };
        const parse = (line) => {
            const params = line.split('=')[1].split(',');
            const proxy = {
                name: line.split('=')[0].trim(),
                type: 'ss',
                server: params[1],
                port: params[2],
                cipher: params[3],
                password: params[4].replace(/"/g, ''),
            };
            // handle obfs
            if (params.length > 5) {
                proxy.plugin = 'obfs';
                proxy['plugin-opts'] = {
                    mode: params[5],
                    host: params[6],
                };
            }
            return proxy;
        };
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
        const parse = (line) => {
            const params = line.split('=')[1].split(',');
            const supported = {
                Surge: false,
            };
            return {
                name: line.split('=')[0].trim(),
                type: 'ssr',
                server: params[1],
                port: params[2],
                cipher: params[3],
                password: params[4].replace(/"/g, ''),
                protocol: params[5],
                'protocol-param': params[6].match(/{(.*)}/)[1],
                supported,
                obfs: params[7],
                'obfs-param': params[8].match(/{(.*)}/)[1],
            };
        };
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
        const parse = (line) => {
            let params = line.split('=')[1].split(',');
            const proxy = {
                name: line.split('=')[0].trim(),
                type: 'vmess',
                server: params[1],
                port: params[2],
                cipher: params[3] || 'none',
                uuid: params[4].replace(/"/g, ''),
                alterId: 0,
            };
            // get transport options
            params = params.splice(5);
            for (const item of params) {
                const [key, val] = item.split(':');
                params[key] = val;
            }
            proxy.tls = JSON.parse(params['over-tls'] || 'false');
            if (proxy.tls) {
                proxy.sni = params['tls-name'] || proxy.server;
                proxy['skip-cert-verify'] = JSON.parse(
                    params['skip-cert-verify'] || 'false',
                );
            }
            switch (params.transport) {
                case 'tcp':
                    break;
                case 'ws':
                    proxy.network = params.transport;
                    proxy['ws-opts'] = {
                        path: params.path,
                        headers: {
                            Host: params.host,
                        },
                    };
            }
            if (proxy.tls) {
                proxy['skip-cert-verify'] = JSON.parse(
                    params['skip-cert-verify'] || 'false',
                );
            }
            return proxy;
        };
        return { name, test, parse };
    }

    function Loon_Trojan() {
        const name = 'Loon Trojan Parser';
        const test = (line) => {
            return (
                /^.*=\s*trojan/i.test(line.split(',')[0]) &&
                line.indexOf('password') === -1
            );
        };

        const parse = (line) => {
            const params = line.split('=')[1].split(',');
            const proxy = {
                name: line.split('=')[0].trim(),
                type: 'trojan',
                server: params[1],
                port: params[2],
                password: params[3].replace(/"/g, ''),
                sni: params[1], // default sni is the server itself
                'skip-cert-verify': JSON.parse(
                    params['skip-cert-verify'] || 'false',
                ),
            };
            // trojan sni
            if (params.length > 4) {
                const [key, val] = params[4].split(':');
                if (key === 'tls-name') proxy.sni = val;
                else
                    throw new Error(
                        `Unknown option ${key} for line: \n${line}`,
                    );
            }
            return proxy;
        };

        return { name, test, parse };
    }

    function Loon_Http() {
        const name = 'Loon HTTP Parser';
        const test = (line) => {
            return (
                /^.*=\s*http/i.test(line.split(',')[0]) &&
                line.split(',').length === 5 &&
                line.indexOf('username') === -1 &&
                line.indexOf('password') === -1
            );
        };

        const parse = (line) => {
            const params = line.split('=')[1].split(',');
            const proxy = {
                name: line.split('=')[0].trim(),
                type: 'http',
                server: params[1],
                port: params[2],
                tls: params[2] === '443', // port 443 is considered as https type
            };
            if (params[3]) proxy.username = params[3];
            if (params[4]) proxy.password = params[4];

            if (proxy.tls) {
                proxy.sni = params['tls-name'] || proxy.server;
                proxy['skip-cert-verify'] = JSON.parse(
                    params['skip-cert-verify'] || 'false',
                );
            }

            return proxy;
        };
        return { name, test, parse };
    }

    function Surge_SS() {
        const name = 'Surge SS Parser';
        const test = (line) => {
            return /^.*=\s*ss/.test(line.split(',')[0]);
        };
        const parse = (line) => {
            const params = getSurgeParams(line);
            const proxy = {
                name: params.name,
                type: 'ss',
                server: params.server,
                port: params.port,
                cipher: params['encrypt-method'],
                password: params.password,
                tfo: JSON.parse(params.tfo || 'false'),
                udp: JSON.parse(params['udp-relay'] || 'false'),
            };
            // handle obfs
            if (params.obfs) {
                proxy.plugin = 'obfs';
                proxy['plugin-opts'] = {
                    mode: params.obfs,
                    host: params['obfs-host'],
                };
            }
            return proxy;
        };
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
        const parse = (line) => {
            const params = getSurgeParams(line);
            const proxy = {
                name: params.name,
                type: 'vmess',
                server: params.server,
                port: params.port,
                uuid: params.username,
                alterId: 0, // surge does not have this field
                cipher: 'none', // surge does not have this field
                tls: JSON.parse(params.tls || 'false'),
                tfo: JSON.parse(params.tfo || 'false'),
            };
            if (proxy.tls) {
                if (typeof params['skip-cert-verify'] !== 'undefined') {
                    proxy['skip-cert-verify'] =
                        params['skip-cert-verify'] === true ||
                        params['skip-cert-verify'] === '1';
                }
                proxy.sni = params['sni'] || params.server;
            }
            // use websocket
            if (JSON.parse(params.ws || 'false')) {
                proxy.network = 'ws';
                proxy['ws-opts'] = {
                    path: params['ws-path'],
                };

                const res = params['ws-headers'].match(
                    /(,|^|\s)*HOST:\s*(.*?)(,|$)/,
                );
                const host = res ? res[2] : proxy.server;
                proxy['ws-opts'].headers = {
                    Host: host || params.server,
                };
            }
            return proxy;
        };
        return { name, test, parse };
    }

    function Surge_Trojan() {
        const name = 'Surge Trojan Parser';
        const test = (line) => {
            return (
                /^.*=\s*trojan/.test(line.split(',')[0]) &&
                line.indexOf('sni') !== -1
            );
        };
        const parse = (line) => {
            const params = getSurgeParams(line);
            const proxy = {
                name: params.name,
                type: 'trojan',
                server: params.server,
                port: params.port,
                password: params.password,
                sni: params.sni || params.server,
                tfo: JSON.parse(params.tfo || 'false'),
            };
            if (typeof params['skip-cert-verify'] !== 'undefined') {
                proxy['skip-cert-verify'] =
                    params['skip-cert-verify'] === true ||
                    params['skip-cert-verify'] === '1';
            }
            return proxy;
        };

        return { name, test, parse };
    }

    function Surge_Http() {
        const name = 'Surge HTTP Parser';
        const test = (line) => {
            return (
                /^.*=\s*http/.test(line.split(',')[0]) &&
                !Loon_Http().test(line)
            );
        };
        const parse = (line) => {
            const params = getSurgeParams(line);
            const proxy = {
                name: params.name,
                type: 'http',
                server: params.server,
                port: params.port,
                tls: JSON.parse(params.tls || 'false'),
                tfo: JSON.parse(params.tfo || 'false'),
            };
            if (proxy.tls) {
                if (typeof params['skip-cert-verify'] !== 'undefined') {
                    proxy['skip-cert-verify'] =
                        params['skip-cert-verify'] === true ||
                        params['skip-cert-verify'] === '1';
                }
                proxy.sni = params.sni || params.server;
            }
            if (params.username && params.username !== 'none')
                proxy.username = params.username;
            if (params.password && params.password !== 'none')
                proxy.password = params.password;
            return proxy;
        };
        return { name, test, parse };
    }

    function getSurgeParams(line) {
        const params = {};
        params.name = line.split('=')[0].trim();
        const segments = line.split(',');
        params.server = segments[1].trim();
        params.port = segments[2].trim();
        for (let i = 3; i < segments.length; i++) {
            const item = segments[i];
            if (item.indexOf('=') !== -1) {
                const [key, value] = item.split('=');
                params[key.trim()] = value.trim();
            }
        }
        return params;
    }

    return [
        URI_SS(),
        URI_SSR(),
        URI_VMess(),
        URI_Trojan(),
        Clash_All(),
        Surge_SS(),
        Surge_VMess(),
        Surge_Trojan(),
        Surge_Http(),
        Loon_SS(),
        Loon_SSR(),
        Loon_VMess(),
        Loon_Trojan(),
        Loon_Http(),
        QX_SS(),
        QX_SSR(),
        QX_VMess(),
        QX_Trojan(),
        QX_Http(),
    ];
})();
const PROXY_PROCESSORS = (function () {
    // force to set some properties (e.g., skip-cert-verify, udp, tfo, etc.)
    function SetPropertyOperator({ key, value }) {
        return {
            name: 'Set Property Operator',
            func: (proxies) => {
                return proxies.map((p) => {
                    p[key] = value;
                    return p;
                });
            },
        };
    }

    // add or remove flag for proxies
    function FlagOperator(add = true) {
        return {
            name: 'Flag Operator',
            func: (proxies) => {
                return proxies.map((proxy) => {
                    if (!add) {
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
    // eslint-disable-next-line no-unused-vars
    function ScriptOperator(script, targetPlatform, $arguments) {
        return {
            name: 'Script Operator',
            func: (proxies) => {
                let output = proxies;
                (function () {
                    // interface to get internal operators

                    // eslint-disable-next-line no-unused-vars
                    const $get = (name, args) => {
                        const item = PROXY_PROCESSORS[name];
                        return item(args);
                    };
                    // eslint-disable-next-line no-unused-vars
                    const $process = ApplyProcessor;

                    eval(script);

                    // eslint-disable-next-line no-undef
                    output = operator(proxies, targetPlatform);
                })();
                return output;
            },
        };
    }

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
            str = str.substr(4);
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
                return proxies.map((proxy) =>
                    types.some((t) => proxy.type === t),
                );
            },
        };
    }

    /**
     Script Example
     function func(proxies) {
            const selected = FULL(proxies.length, true);
            // do something
            return selected;
         }
     WARNING:
     1. This function name should be `func`!
     2. Always declare variables before using them!
     */
    // eslint-disable-next-line no-unused-vars
    function ScriptFilter(script, targetPlatform, $arguments) {
        return {
            name: 'Script Filter',
            func: (proxies) => {
                let output = FULL(proxies.length, true);
                !(function () {
                    eval(script);
                    // eslint-disable-next-line no-undef
                    output = filter(proxies, targetPlatform);
                })();
                return output;
            },
        };
    }

    return {
        'Useless Filter': UselessFilter,
        'Region Filter': RegionFilter,
        'Regex Filter': RegexFilter,
        'Type Filter': TypeFilter,
        'Script Filter': ScriptFilter,

        'Set Property Operator': SetPropertyOperator,
        'Flag Operator': FlagOperator,
        'Sort Operator': SortOperator,
        'Regex Sort Operator': RegexSortOperator,
        'Regex Rename Operator': RegexRenameOperator,
        'Regex Delete Operator': RegexDeleteOperator,
        'Script Operator': ScriptOperator,
        'Handle Duplicate Operator': HandleDuplicateOperator,
    };
})();
const PROXY_PRODUCERS = (function () {
    function QX_Producer() {
        const targetPlatform = 'QX';
        const produce = (proxy) => {
            let obfs_opts;
            let tls_opts;
            switch (proxy.type) {
                case 'ss':
                    obfs_opts = '';
                    if (proxy.plugin === 'obfs') {
                        const { host, mode } = proxy['plugin-opts'];
                        obfs_opts = `,obfs=${mode}${
                            host ? ',obfs-host=' + host : ''
                        }`;
                    }
                    if (proxy.plugin === 'v2ray-plugin') {
                        const { tls, host, path } = proxy['plugin-opts'];
                        obfs_opts = `,obfs=${tls ? 'wss' : 'ws'}${
                            host ? ',obfs-host=' + host : ''
                        }${path ? ',obfs-uri=' + path : ''}`;
                    }
                    return `shadowsocks=${proxy.server}:${proxy.port},method=${
                        proxy.cipher
                    },password=${proxy.password}${obfs_opts}${
                        proxy.tfo ? ',fast-open=true' : ',fast-open=false'
                    }${
                        proxy.udp ? ',udp-relay=true' : ',udp-relay=false'
                    },tag=${proxy.name}`;
                case 'ssr':
                    return `shadowsocks=${proxy.server}:${proxy.port},method=${
                        proxy.cipher
                    },password=${proxy.password},ssr-protocol=${
                        proxy.protocol
                    }${
                        proxy['protocol-param']
                            ? ',ssr-protocol-param=' + proxy['protocol-param']
                            : ''
                    }${proxy.obfs ? ',obfs=' + proxy.obfs : ''}${
                        proxy['obfs-param']
                            ? ',obfs-host=' + proxy['obfs-param']
                            : ''
                    },fast-open=${proxy.tfo || false}${
                        proxy.udp ? ',udp-relay=true' : ',udp-relay=false'
                    },tag=${proxy.name}`;
                case 'vmess':
                    obfs_opts = '';
                    if (proxy.network === 'ws') {
                        // websocket
                        if (proxy.tls) {
                            // ws-tls
                            obfs_opts = `,obfs=wss${
                                proxy.sni ? ',obfs-host=' + proxy.sni : ''
                            }${
                                proxy['ws-opts'].path
                                    ? ',obfs-uri=' + proxy['ws-opts'].path
                                    : ''
                            },tls-verification=${
                                proxy['skip-cert-verify'] ? 'false' : 'true'
                            }`;
                        } else {
                            // ws
                            obfs_opts = `,obfs=ws${
                                proxy['ws-opts'].headers.Host
                                    ? ',obfs-host=' +
                                      proxy['ws-opts'].headers.Host
                                    : ''
                            }${
                                proxy['ws-opts'].path
                                    ? ',obfs-uri=' + proxy['ws-opts'].path
                                    : ''
                            }`;
                        }
                    } else {
                        // tcp
                        if (proxy.tls) {
                            obfs_opts = `,obfs=over-tls${
                                proxy.sni ? ',obfs-host=' + proxy.sni : ''
                            },tls-verification=${
                                proxy['skip-cert-verify'] ? 'false' : 'true'
                            }`;
                        }
                    }
                    let result = `vmess=${proxy.server}:${proxy.port},method=${
                        proxy.cipher === 'auto' ? 'none' : proxy.cipher
                    },password=${proxy.uuid}${obfs_opts},fast-open=${
                        proxy.tfo || false
                    }${proxy.udp ? ',udp-relay=true' : ',udp-relay=false'}`;
                    if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                    if (typeof proxy['vmess-aead'] !== 'undefined') {
                        result += `,aead=${proxy['vmess-aead']}`;
                    }
                    result += `,tag=${proxy.name}`;
                    return result;
                case 'trojan':
                    return `trojan=${proxy.server}:${proxy.port},password=${
                        proxy.password
                    }${
                        proxy.sni ? ',tls-host=' + proxy.sni : ''
                    },over-tls=true,tls-verification=${
                        proxy['skip-cert-verify'] ? 'false' : 'true'
                    },fast-open=${proxy.tfo || false}${
                        proxy.udp ? ',udp-relay=true' : ',udp-relay=false'
                    },tag=${proxy.name}`;
                case 'http':
                    tls_opts = '';
                    if (proxy.tls) {
                        tls_opts = `,over-tls=true,tls-verification=${
                            proxy['skip-cert-verify'] ? 'false' : 'true'
                        }${proxy.sni ? ',tls-host=' + proxy.sni : ''}`;
                    }
                    return `http=${proxy.server}:${proxy.port},username=${
                        proxy.username
                    },password=${proxy.password}${tls_opts},fast-open=${
                        proxy.tfo || false
                    },tag=${proxy.name}`;
            }
            throw new Error(
                `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
            );
        };
        return { produce };
    }

    function Loon_Producer() {
        const targetPlatform = 'Loon';
        const produce = (proxy) => {
            let obfs_opts = '',
                tls_opts = '',
                udp_opts = '',
                tfo_opts = '';
            if (typeof proxy.udp !== 'undefined') {
                udp_opts = proxy.udp ? ',udp=true' : ',udp=false';
            }
            tfo_opts = `,fast-open=${proxy.tfo || false}`;

            switch (proxy.type) {
                case 'ss':
                    obfs_opts = ',,';
                    if (proxy.plugin) {
                        if (proxy.plugin === 'obfs') {
                            const { mode, host } = proxy['plugin-opts'];
                            obfs_opts = `,${mode},${host || ''}`;
                        } else {
                            throw new Error(
                                `Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`,
                            );
                        }
                    }
                    return `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"${obfs_opts}${udp_opts}${tfo_opts}`;
                case 'ssr':
                    return `${proxy.name}=shadowsocksr,${proxy.server},${
                        proxy.port
                    },${proxy.cipher},"${proxy.password}",${proxy.protocol},{${
                        proxy['protocol-param'] || ''
                    }},${proxy.obfs},{${
                        proxy['obfs-param'] || ''
                    }}${udp_opts}${tfo_opts}`;
                case 'vmess':
                    obfs_opts = '';
                    if (proxy.network === 'ws') {
                        const host =
                            proxy['ws-opts'].headers.Host || proxy.server;
                        obfs_opts = `,transport:ws,host:${host},path:${
                            proxy['ws-opts'].path || '/'
                        }`;
                    } else {
                        obfs_opts = `,transport:tcp`;
                    }
                    if (proxy.tls) {
                        obfs_opts += `${
                            proxy.sni ? ',tls-name:' + proxy.sni : ''
                        },skip-cert-verify:${
                            proxy['skip-cert-verify'] || 'false'
                        }`;
                    }
                    let result = `${proxy.name}=vmess,${proxy.server},${
                        proxy.port
                    },${proxy.cipher === 'auto' ? 'none' : proxy.cipher},"${
                        proxy.uuid
                    }",over-tls:${proxy.tls || 'false'}${obfs_opts}`;
                    if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                    if (typeof proxy['vmess-aead'] !== 'undefined') {
                        result += `,vmess-aead=${proxy['vmess-aead']}`;
                    }
                    return result;
                case 'trojan':
                    return `${proxy.name}=trojan,${proxy.server},${
                        proxy.port
                    },"${proxy.password}"${
                        proxy.sni ? ',tls-name:' + proxy.sni : ''
                    },skip-cert-verify:${
                        proxy['skip-cert-verify'] || 'false'
                    }${udp_opts}`;
                case 'http':
                    tls_opts = '';
                    const base = `${proxy.name}=${
                        proxy.tls ? 'http' : 'https'
                    },${proxy.server},${proxy.port},${proxy.username || ''},${
                        proxy.password || ''
                    }`;
                    if (proxy.tls) {
                        // https
                        tls_opts = `${
                            proxy.sni ? ',tls-name:' + proxy.sni : ''
                        },skip-cert-verify:${proxy['skip-cert-verify']}`;
                        return base + tls_opts;
                    } else return base;
            }
            throw new Error(
                `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
            );
        };
        return { produce };
    }

    function Surge_Producer() {
        const targetPlatform = 'Surge';
        const produce = (proxy) => {
            let result = '';
            let obfs_opts, tls_opts;
            switch (proxy.type) {
                case 'ss':
                    obfs_opts = '';
                    if (proxy.plugin) {
                        const { host, mode } = proxy['plugin-opts'];
                        if (proxy.plugin === 'obfs') {
                            obfs_opts = `,obfs=${mode}${
                                host ? ',obfs-host=' + host : ''
                            }`;
                        } else {
                            throw new Error(
                                `Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`,
                            );
                        }
                    }
                    result = `${proxy.name}=ss,${proxy.server}, ${
                        proxy.port
                    },encrypt-method=${proxy.cipher},password=${
                        proxy.password
                    }${obfs_opts},tfo=${proxy.tfo || 'false'},udp-relay=${
                        proxy.udp || 'false'
                    }`;
                    break;
                case 'vmess':
                    tls_opts = '';
                    result = `${proxy.name}=vmess,${proxy.server},${
                        proxy.port
                    },username=${proxy.uuid},tls=${proxy.tls || 'false'},tfo=${
                        proxy.tfo || 'false'
                    }`;

                    if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                    if (typeof proxy['vmess-aead'] !== 'undefined') {
                        result += `,vmess-aead=${proxy['vmess-aead']}`;
                    }
                    if (proxy.network === 'ws') {
                        const path = proxy['ws-opts'].path || '/';
                        const wsHeaders = Object.entries(
                            proxy['ws-opts'].headers,
                        )
                            .map(([key, value]) => `${key}:"${value}"`)
                            .join('|');
                        result += `,ws=true${path ? ',ws-path=' + path : ''}${
                            wsHeaders ? ',ws-headers=' + wsHeaders : ''
                        }`;
                    }
                    if (proxy.tls) {
                        result += `${
                            typeof proxy['skip-cert-verify'] !== 'undefined'
                                ? ',skip-cert-verify=' +
                                  proxy['skip-cert-verify']
                                : ''
                        }`;
                        result += proxy.sni ? `,sni=${proxy.sni}` : '';
                    }
                    break;
                case 'trojan':
                    result = `${proxy.name}=trojan,${proxy.server},${
                        proxy.port
                    },password=${proxy.password}${
                        typeof proxy['skip-cert-verify'] !== 'undefined'
                            ? ',skip-cert-verify=' + proxy['skip-cert-verify']
                            : ''
                    }${proxy.sni ? ',sni=' + proxy.sni : ''},tfo=${
                        proxy.tfo || 'false'
                    },udp-relay=${proxy.udp || 'false'}`;
                    break;
                case 'http':
                    tls_opts = ', tls=false';
                    if (proxy.tls) {
                        tls_opts = `,tls=true,skip-cert-verify=${proxy['skip-cert-verify']},sni=${proxy.sni}`;
                    }
                    result = `${proxy.name}=http, ${proxy.server}, ${
                        proxy.port
                    }${proxy.username ? ',username=' + proxy.username : ''}${
                        proxy.password ? ',password=' + proxy.password : ''
                    }${tls_opts},tfo=${proxy.tfo || 'false'}`;
                    break;
                default:
                    throw new Error(
                        `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
                    );
            }

            // handle surge hybrid param
            result +=
                proxy['surge-hybrid'] !== undefined
                    ? `,hybrid=${proxy['surge-hybrid']}`
                    : '';
            return result;
        };
        return { produce };
    }

    function Clash_Producer() {
        const type = 'ALL';
        const produce = (proxies) => {
            return (
                'proxies:\n' +
                proxies
                    .map((proxy) => {
                        delete proxy.supported;
                        return '  - ' + JSON.stringify(proxy) + '\n';
                    })
                    .join('')
            );
        };
        return { type, produce };
    }

    function URI_Producer() {
        const type = 'SINGLE';
        const produce = (proxy) => {
            let result = '';
            switch (proxy.type) {
                case 'ss':
                    const userinfo = `${proxy.cipher}:${proxy.password}`;
                    result = `ss://${Base64.encode(userinfo)}@${proxy.server}:${
                        proxy.port
                    }/`;
                    if (proxy.plugin) {
                        result += '?plugin=';
                        const opts = proxy['plugin-opts'];
                        switch (proxy.plugin) {
                            case 'obfs':
                                result += encodeURIComponent(
                                    `simple-obfs;obfs=${opts.mode}${
                                        opts.host
                                            ? ';obfs-host=' + opts.host
                                            : ''
                                    }`,
                                );
                                break;
                            case 'v2ray-plugin':
                                result += encodeURIComponent(
                                    `v2ray-plugin;obfs=${opts.mode}${
                                        opts.host
                                            ? ';obfs-host' + opts.host
                                            : ''
                                    }${opts.tls ? ';tls' : ''}`,
                                );
                                break;
                            default:
                                throw new Error(
                                    `Unsupported plugin option: ${proxy.plugin}`,
                                );
                        }
                    }
                    result += `#${encodeURIComponent(proxy.name)}`;
                    break;
                case 'ssr':
                    result = `${proxy.server}:${proxy.port}:${proxy.protocol}:${
                        proxy.cipher
                    }:${proxy.obfs}:${Base64.encode(proxy.password)}/`;
                    result += `?remarks=${Base64.encode(proxy.name)}${
                        proxy['obfs-param']
                            ? '&obfsparam=' + Base64.encode(proxy['obfs-param'])
                            : ''
                    }${
                        proxy['protocol-param']
                            ? '&protocolparam=' +
                              Base64.encode(proxy['protocol-param'])
                            : ''
                    }`;
                    result = 'ssr://' + Base64.encode(result);
                    break;
                case 'vmess':
                    // V2RayN URI format
                    result = {
                        ps: proxy.name,
                        add: proxy.server,
                        port: proxy.port,
                        id: proxy.uuid,
                        type: '',
                        aid: 0,
                        net: proxy.network || 'tcp',
                        tls: proxy.tls ? 'tls' : '',
                    };
                    // obfs
                    if (proxy.network === 'ws') {
                        result.path = proxy['ws-opts'].path || '/';
                        result.host =
                            proxy['ws-opts'].headers.Host || proxy.server;
                    }
                    result = 'vmess://' + Base64.encode(JSON.stringify(result));
                    break;
                case 'trojan':
                    result = `trojan://${proxy.password}@${proxy.server}:${
                        proxy.port
                    }#${encodeURIComponent(proxy.name)}`;
                    break;
                default:
                    throw new Error(`Cannot handle proxy type: ${proxy.type}`);
            }
            return result;
        };
        return { type, produce };
    }

    function JSON_Producer() {
        const type = 'ALL';
        const produce = (proxies) => JSON.stringify(proxies, null, 2);
        return { type, produce };
    }

    return {
        QX: QX_Producer(),
        Surge: Surge_Producer(),
        Loon: Loon_Producer(),
        Clash: Clash_Producer(),
        URI: URI_Producer(),
        JSON: JSON_Producer(),
    };
})();

export const ProxyUtils = (function () {
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

    function safeMatch(p, line) {
        let patternMatched;
        try {
            patternMatched = p.test(line);
        } catch (err) {
            patternMatched = false;
        }
        return patternMatched;
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
            let matched = lastParser && safeMatch(lastParser, line);
            if (!matched) {
                for (const parser of PROXY_PARSERS) {
                    if (safeMatch(parser, line)) {
                        lastParser = parser;
                        matched = true;
                        $.info(`Proxy parser: ${parser.name} is activated`);
                        break;
                    }
                }
            }
            if (!matched) {
                $.error(`Failed to find a rule to parse line: \n${line}\n`);
            } else {
                try {
                    const proxy = lastParser.parse(line);
                    if (!proxy) {
                        $.error(
                            `Parser ${lastParser.name} return nothing for \n${line}\n`,
                        );
                    }
                    proxies.push(proxy);
                } catch (err) {
                    $.error(
                        `Failed to parse line: \n ${line}\n Reason: ${err.stack}`,
                    );
                }
            }
        }

        return proxies;
    }

    async function process(proxies, operators = [], targetPlatform) {
        for (const item of operators) {
            // process script
            let script;
            const $arguments = {};
            if (item.type.indexOf('Script') !== -1) {
                const { mode, content } = item.args;
                if (mode === 'link') {
                    const url = content;
                    // extract link arguments
                    const rawArgs = url.split('#');
                    if (rawArgs.length > 1) {
                        for (const pair of rawArgs[1].split('&')) {
                            const key = pair.split('=')[0];
                            const value = pair.split('=')[1] || true;
                            $arguments[key] = value;
                        }
                    }

                    // if this is remote script, download it
                    try {
                        script = await download(url.split('#')[0]);
                        $.info(`Script loaded: >>>\n ${script}`);
                    } catch (err) {
                        $.error(
                            `Error when downloading remote script: ${item.args.content}.\n Reason: ${err}`,
                        );
                        // skip the script if download failed.
                        continue;
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
                );
            } else {
                processor = PROXY_PROCESSORS[item.type](item.args);
            }
            proxies = ApplyProcessor(processor, proxies);
        }
        return proxies;
    }

    function produce(proxies, targetPlatform) {
        const producer = PROXY_PRODUCERS[targetPlatform];
        if (!producer) {
            throw new Error(
                `Target platform: ${targetPlatform} is not supported!`,
            );
        }

        // filter unsupported proxies
        proxies = proxies.filter(
            (proxy) =>
                !(proxy.supported && proxy.supported[targetPlatform] === false),
        );

        $.info(`Producing proxies for target: ${targetPlatform}`);
        if (
            typeof producer.type === 'undefined' ||
            producer.type === 'SINGLE'
        ) {
            return proxies
                .map((proxy) => {
                    try {
                        return producer.produce(proxy);
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
                .filter((line) => line.length > 0)
                .join('\n');
        } else if (producer.type === 'ALL') {
            return producer.produce(proxies);
        }
    }

    return {
        parse,
        process,
        produce,
    };
})();

export function ApplyProcessor(processor, objs) {
    function ApplyFilter(filter, objs) {
        // select proxies
        let selected = FULL(objs.length, true);
        try {
            selected = AND(selected, filter.func(objs));
        } catch (err) {
            // print log and skip this filter
            console.log(`Cannot apply filter ${filter.name}\n Reason: ${err}`);
        }
        return objs.filter((_, i) => selected[i]);
    }

    function ApplyOperator(operator, objs) {
        let output = clone(objs);
        try {
            const output_ = operator.func(output);
            if (output_) output = output_;
        } catch (err) {
            // print log and skip this operator
            console.log(
                `Cannot apply operator ${operator.name}! Reason: ${err}`,
            );
        }
        return output;
    }

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
