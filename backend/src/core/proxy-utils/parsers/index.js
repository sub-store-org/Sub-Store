import {
    isIPv4,
    isIPv6,
    getIfNotBlank,
    isPresent,
    isNotBlank,
    getIfPresent,
    getRandomPort,
} from '@/utils';
import getSurgeParser from './peggy/surge';
import getLoonParser from './peggy/loon';
import getQXParser from './peggy/qx';
import getTrojanURIParser from './peggy/trojan-uri';
import $ from '@/core/app';
import JSON5 from 'json5';
import YAML from '@/utils/yaml';

import { Base64 } from 'js-base64';

function surge_port_hopping(raw) {
    const [parts, port_hopping] =
        raw.match(
            /,\s*?port-hopping\s*?=\s*?["']?\s*?((\d+(-\d+)?)([,;]\d+(-\d+)?)*)\s*?["']?\s*?/,
        ) || [];
    return {
        port_hopping: port_hopping
            ? port_hopping.replace(/;/g, ',')
            : undefined,
        line: parts ? raw.replace(parts, '') : raw,
    };
}

function URI_PROXY() {
    // socks5+tls
    // socks5
    // http, https(可以这么写)
    const name = 'URI PROXY Parser';
    const test = (line) => {
        return /^(socks5\+tls|socks5|http|https):\/\//.test(line);
    };
    const parse = (line) => {
        // parse url
        // eslint-disable-next-line no-unused-vars
        let [__, type, tls, username, password, server, port, query, name] =
            line.match(
                /^(socks5|http|http)(\+tls|s)?:\/\/(?:(.*?):(.*?)@)?(.*?)(?::(\d+?))?(\?.*?)?(?:#(.*?))?$/,
            );
        if (port) {
            port = parseInt(port, 10);
        } else {
            if (tls) {
                port = 443;
            } else if (type === 'http') {
                port = 80;
            } else {
                $.error(`port is not present in line: ${line}`);
                throw new Error(`port is not present in line: ${line}`);
            }
            $.info(`port is not present in line: ${line}, set to ${port}`);
        }

        const proxy = {
            name:
                name != null
                    ? decodeURIComponent(name)
                    : `${type} ${server}:${port}`,
            type,
            tls: tls ? true : false,
            server,
            port,
            username:
                username != null ? decodeURIComponent(username) : undefined,
            password:
                password != null ? decodeURIComponent(password) : undefined,
        };

        return proxy;
    };
    return { name, test, parse };
}
function URI_SOCKS() {
    const name = 'URI SOCKS Parser';
    const test = (line) => {
        return /^socks:\/\//.test(line);
    };
    const parse = (line) => {
        // parse url
        // eslint-disable-next-line no-unused-vars
        let [__, type, auth, server, port, query, name] = line.match(
            /^(socks)?:\/\/(?:(.*)@)?(.*?)(?::(\d+?))?(\?.*?)?(?:#(.*?))?$/,
        );
        if (port) {
            port = parseInt(port, 10);
        } else {
            $.error(`port is not present in line: ${line}`);
            throw new Error(`port is not present in line: ${line}`);
        }
        let username, password;
        if (auth) {
            const parsed = Base64.decode(decodeURIComponent(auth)).split(':');
            username = parsed[0];
            password = parsed[1];
        }

        const proxy = {
            name:
                name != null
                    ? decodeURIComponent(name)
                    : `${type} ${server}:${port}`,
            type: 'socks5',
            server,
            port,
            username,
            password,
        };

        return proxy;
    };
    return { name, test, parse };
}
// Parse SS URI format (only supports new SIP002, legacy format is depreciated).
// reference: https://github.com/shadowsocks/shadowsocks-org/wiki/SIP002-URI-Scheme
function URI_SS() {
    // TODO: 暂不支持 httpupgrade
    const name = 'URI SS Parser';
    const test = (line) => {
        return /^ss:\/\//.test(line);
    };
    const parse = (line) => {
        // parse url
        let content = line.split('ss://')[1];

        let name = line.split('#')[1];
        const proxy = {
            type: 'ss',
        };
        content = content.split('#')[0]; // strip proxy name
        // handle IPV4 and IPV6
        let serverAndPortArray = content.match(/@([^/?]*)(\/|\?|$)/);

        let rawUserInfoStr = decodeURIComponent(content.split('@')[0]); // 其实应该分隔之后, 用户名和密码再 decodeURIComponent. 但是问题不大
        let userInfoStr;
        if (rawUserInfoStr?.startsWith('2022-blake3-')) {
            userInfoStr = rawUserInfoStr;
        } else {
            userInfoStr = Base64.decode(rawUserInfoStr);
        }

        let query = '';
        if (!serverAndPortArray) {
            if (content.includes('?')) {
                const parsed = content.match(/^(.*)(\?.*)$/);
                content = parsed[1];
                query = parsed[2];
            }
            content = Base64.decode(content);

            if (query) {
                if (/(&|\?)v2ray-plugin=/.test(query)) {
                    const parsed = query.match(/(&|\?)v2ray-plugin=(.*?)(&|$)/);
                    let v2rayPlugin = parsed[2];
                    if (v2rayPlugin) {
                        proxy.plugin = 'v2ray-plugin';
                        proxy['plugin-opts'] = JSON.parse(
                            Base64.decode(v2rayPlugin),
                        );
                    }
                }
                content = `${content}${query}`;
            }
            userInfoStr = content.match(/(^.*)@/)?.[1];
            serverAndPortArray = content.match(/@([^/@]*)(\/|$)/);
        } else if (content.includes('?')) {
            const parsed = content.match(/(\?.*)$/);
            query = parsed[1];
        }

        const serverAndPort = serverAndPortArray[1];
        const portIdx = serverAndPort.lastIndexOf(':');
        proxy.server = serverAndPort.substring(0, portIdx);
        proxy.port = `${serverAndPort.substring(portIdx + 1)}`.match(
            /\d+/,
        )?.[0];
        let userInfo = userInfoStr.match(/(^.*?):(.*$)/);
        proxy.cipher = userInfo?.[1];
        proxy.password = userInfo?.[2];
        // if (!proxy.cipher || !proxy.password) {
        //     userInfo = rawUserInfoStr.match(/(^.*?):(.*$)/);
        //     proxy.cipher = userInfo?.[1];
        //     proxy.password = userInfo?.[2];
        // }

        // handle obfs
        const pluginMatch = content.match(/[?&]plugin=([^&]+)/);
        const shadowTlsMatch = content.match(/[?&]shadow-tls=([^&]+)/);

        if (pluginMatch) {
            const pluginInfo = (
                'plugin=' + decodeURIComponent(pluginMatch[1])
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
                    proxy.plugin = 'v2ray-plugin';
                    proxy['plugin-opts'] = {
                        mode: 'websocket',
                        host: getIfNotBlank(params['obfs-host']),
                        path: getIfNotBlank(params.path),
                        tls: getIfPresent(params.tls),
                    };
                    break;
                case 'shadow-tls': {
                    proxy.plugin = 'shadow-tls';
                    const version = getIfNotBlank(params['version']);
                    proxy['plugin-opts'] = {
                        host: getIfNotBlank(params['host']),
                        password: getIfNotBlank(params['password']),
                        version: version ? parseInt(version, 10) : undefined,
                    };
                    break;
                }
                default:
                    throw new Error(
                        `Unsupported plugin option: ${params.plugin}`,
                    );
            }
        }
        // Shadowrocket
        if (shadowTlsMatch) {
            const params = JSON.parse(Base64.decode(shadowTlsMatch[1]));
            const version = getIfNotBlank(params['version']);
            const address = getIfNotBlank(params['address']);
            const port = getIfNotBlank(params['port']);
            proxy.plugin = 'shadow-tls';
            proxy['plugin-opts'] = {
                host: getIfNotBlank(params['host']),
                password: getIfNotBlank(params['password']),
                version: version ? parseInt(version, 10) : undefined,
            };
            if (address) {
                proxy.server = address;
            }
            if (port) {
                proxy.port = parseInt(port, 10);
            }
        }
        if (/(&|\?)uot=(1|true)/i.test(query)) {
            proxy['udp-over-tcp'] = true;
        }
        if (/(&|\?)tfo=(1|true)/i.test(query)) {
            proxy.tfo = true;
        }
        if (name != null) {
            name = decodeURIComponent(name);
        }
        proxy.name = name ?? `SS ${proxy.server}:${proxy.port}`;
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
                if (val.length > 0 && val !== '(null)') {
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
        let content = Base64.decode(line.replace(/\?.*?$/, ''));
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
            let params = {};

            try {
                // V2rayN URI format
                params = JSON.parse(content);
            } catch (e) {
                // Shadowrocket URI format
                // eslint-disable-next-line no-unused-vars
                let [__, base64Line, qs] = /(^[^?]+?)\/?\?(.*)$/.exec(line);
                content = Base64.decode(base64Line);

                for (const addon of qs.split('&')) {
                    const [key, valueRaw] = addon.split('=');
                    let value = valueRaw;
                    value = decodeURIComponent(valueRaw);
                    if (value.indexOf(',') === -1) {
                        params[key] = value;
                    } else {
                        params[key] = value.split(',');
                    }
                }
                // eslint-disable-next-line no-unused-vars
                let [___, cipher, uuid, server, port] =
                    /(^[^:]+?):([^:]+?)@(.*):(\d+)$/.exec(content);

                params.scy = cipher;
                params.id = uuid;
                params.port = port;
                params.add = server;
            }
            const server = params.add;
            const port = parseInt(getIfPresent(params.port), 10);
            const proxy = {
                name:
                    params.ps ??
                    params.remarks ??
                    params.remark ??
                    `VMess ${server}:${port}`,
                type: 'vmess',
                server,
                port,
                // https://github.com/2dust/v2rayN/wiki/Description-of-VMess-share-link
                // https://github.com/XTLS/Xray-core/issues/91
                cipher: [
                    'auto',
                    'aes-128-gcm',
                    'chacha20-poly1305',
                    'none',
                ].includes(params.scy)
                    ? params.scy
                    : 'auto',
                uuid: params.id,
                alterId: parseInt(
                    getIfPresent(params.aid ?? params.alterId, 0),
                    10,
                ),
                tls: ['tls', true, 1, '1'].includes(params.tls),
                'skip-cert-verify': isPresent(params.verify_cert)
                    ? !params.verify_cert
                    : undefined,
            };
            if (!proxy['skip-cert-verify'] && isPresent(params.allowInsecure)) {
                proxy['skip-cert-verify'] = /(TRUE)|1/i.test(
                    params.allowInsecure,
                );
            }
            // https://github.com/2dust/v2rayN/wiki/%E5%88%86%E4%BA%AB%E9%93%BE%E6%8E%A5%E6%A0%BC%E5%BC%8F%E8%AF%B4%E6%98%8E(ver-2)
            if (proxy.tls) {
                if (params.sni && params.sni !== '') {
                    proxy.sni = params.sni;
                } else if (params.peer && params.peer !== '') {
                    proxy.sni = params.peer;
                }
            }
            let httpupgrade = false;
            // handle obfs
            if (params.net === 'ws' || params.obfs === 'websocket') {
                proxy.network = 'ws';
            } else if (
                ['http'].includes(params.net) ||
                ['http'].includes(params.obfs) ||
                ['http'].includes(params.type)
            ) {
                proxy.network = 'http';
            } else if (['grpc', 'kcp', 'quic'].includes(params.net)) {
                proxy.network = params.net;
            } else if (
                params.net === 'httpupgrade' ||
                proxy.network === 'httpupgrade'
            ) {
                proxy.network = 'ws';
                httpupgrade = true;
            } else if (params.net === 'h2' || proxy.network === 'h2') {
                proxy.network = 'h2';
            }
            // 暂不支持 tcp + host + path
            // else if (params.net === 'tcp' || proxy.network === 'tcp') {
            //     proxy.network = 'tcp';
            // }
            if (proxy.network) {
                let transportHost = params.host ?? params.obfsParam;
                try {
                    const parsedObfs = JSON.parse(transportHost);
                    const parsedHost = parsedObfs?.Host;
                    if (parsedHost) {
                        transportHost = parsedHost;
                    }
                    // eslint-disable-next-line no-empty
                } catch (e) {}
                let transportPath = params.path;

                // 补上默认 path
                if (['ws'].includes(proxy.network)) {
                    transportPath = transportPath || '/';
                }

                if (proxy.network === 'http') {
                    if (transportHost) {
                        // 1)http(tcp)->host中间逗号(,)隔开
                        transportHost = transportHost
                            .split(',')
                            .map((i) => i.trim());
                        transportHost = Array.isArray(transportHost)
                            ? transportHost[0]
                            : transportHost;
                    }
                    if (transportPath) {
                        transportPath = Array.isArray(transportPath)
                            ? transportPath[0]
                            : transportPath;
                    } else {
                        transportPath = '/';
                    }
                }
                // 传输层应该有配置, 暂时不考虑兼容不给配置的节点
                if (
                    transportPath ||
                    transportHost ||
                    ['kcp', 'quic'].includes(proxy.network)
                ) {
                    if (['grpc'].includes(proxy.network)) {
                        proxy[`${proxy.network}-opts`] = {
                            'grpc-service-name': getIfNotBlank(transportPath),
                            '_grpc-type': getIfNotBlank(params.type),
                            '_grpc-authority': getIfNotBlank(params.authority),
                        };
                    } else if (['kcp', 'quic'].includes(proxy.network)) {
                        proxy[`${proxy.network}-opts`] = {
                            [`_${proxy.network}-type`]: getIfNotBlank(
                                params.type,
                            ),
                            [`_${proxy.network}-host`]: getIfNotBlank(
                                getIfNotBlank(transportHost),
                            ),
                            [`_${proxy.network}-path`]:
                                getIfNotBlank(transportPath),
                        };
                    } else {
                        const opts = {
                            path: getIfNotBlank(transportPath),
                            headers: { Host: getIfNotBlank(transportHost) },
                        };
                        if (httpupgrade) {
                            opts['v2ray-http-upgrade'] = true;
                            opts['v2ray-http-upgrade-fast-open'] = true;
                        }
                        proxy[`${proxy.network}-opts`] = opts;
                    }
                } else {
                    delete proxy.network;
                }
            }

            proxy['client-fingerprint'] = params.fp;
            proxy.alpn = params.alpn ? params.alpn.split(',') : undefined;
            // 然而 wiki 和 app 实测中都没有字段表示这个
            // proxy['skip-cert-verify'] = /(TRUE)|1/i.test(params.allowInsecure);

            return proxy;
        }
    };
    return { name, test, parse };
}

function URI_VLESS() {
    const name = 'URI VLESS Parser';
    const test = (line) => {
        return /^vless:\/\//.test(line);
    };
    const parse = (line) => {
        line = line.split('vless://')[1];
        let isShadowrocket;
        let parsed = /^(.*?)@(.*?):(\d+)\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
        if (!parsed) {
            // eslint-disable-next-line no-unused-vars
            let [_, base64, other] = /^(.*?)(\?.*?$)/.exec(line);
            line = `${Base64.decode(base64)}${other}`;
            parsed = /^(.*?)@(.*?):(\d+)\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
            isShadowrocket = true;
        }
        // eslint-disable-next-line no-unused-vars
        let [__, uuid, server, port, ___, addons = '', name] = parsed;
        if (isShadowrocket) {
            uuid = uuid.replace(/^.*?:/g, '');
        }

        port = parseInt(`${port}`, 10);
        uuid = decodeURIComponent(uuid);
        if (name != null) {
            name = decodeURIComponent(name);
        }

        const proxy = {
            type: 'vless',
            name,
            server,
            port,
            uuid,
        };
        const params = {};
        for (const addon of addons.split('&')) {
            const [key, valueRaw] = addon.split('=');
            let value = valueRaw;
            value = decodeURIComponent(valueRaw);
            params[key] = value;
        }

        proxy.name =
            name ??
            params.remarks ??
            params.remark ??
            `VLESS ${server}:${port}`;

        proxy.tls = params.security && params.security !== 'none';
        if (isShadowrocket && /TRUE|1/i.test(params.tls)) {
            proxy.tls = true;
            params.security = params.security ?? 'reality';
        }
        proxy.sni = params.sni || params.peer;
        proxy.flow = params.flow;
        if (!proxy.flow && isShadowrocket && params.xtls) {
            // "none" is undefined
            const flow = [undefined, 'xtls-rprx-direct', 'xtls-rprx-vision'][
                params.xtls
            ];
            if (flow) {
                proxy.flow = flow;
            }
        }
        proxy['client-fingerprint'] = params.fp;
        proxy.alpn = params.alpn ? params.alpn.split(',') : undefined;
        proxy['skip-cert-verify'] = /(TRUE)|1/i.test(params.allowInsecure);

        if (['reality'].includes(params.security)) {
            const opts = {};
            if (params.pbk) {
                opts['public-key'] = params.pbk;
            }
            if (params.sid) {
                opts['short-id'] = params.sid;
            }
            if (params.spx) {
                opts['_spider-x'] = params.spx;
            }
            if (Object.keys(opts).length > 0) {
                // proxy[`${params.security}-opts`] = opts;
                proxy[`${params.security}-opts`] = opts;
            }
        }
        let httpupgrade = false;
        proxy.network = params.type;
        if (proxy.network === 'tcp' && params.headerType === 'http') {
            proxy.network = 'http';
        } else if (proxy.network === 'httpupgrade') {
            proxy.network = 'ws';
            httpupgrade = true;
        }
        if (!proxy.network && isShadowrocket && params.obfs) {
            proxy.network = params.obfs;
            if (['none'].includes(proxy.network)) {
                proxy.network = 'tcp';
            }
        }
        if (['websocket'].includes(proxy.network)) {
            proxy.network = 'ws';
        }
        if (proxy.network && !['tcp', 'none'].includes(proxy.network)) {
            const opts = {};
            const host = params.host ?? params.obfsParam;
            if (host) {
                if (params.obfsParam) {
                    try {
                        const parsed = JSON.parse(host);
                        opts.headers = parsed;
                    } catch (e) {
                        opts.headers = { Host: host };
                    }
                } else {
                    opts.headers = { Host: host };
                }
            }
            if (params.serviceName) {
                opts[`${proxy.network}-service-name`] = params.serviceName;
                if (['grpc'].includes(proxy.network) && params.authority) {
                    opts['_grpc-authority'] = params.authority;
                }
            } else if (isShadowrocket && params.path) {
                if (!['ws', 'http', 'h2'].includes(proxy.network)) {
                    opts[`${proxy.network}-service-name`] = params.path;
                    delete params.path;
                }
            }
            if (params.path) {
                opts.path = params.path;
            }
            // https://github.com/XTLS/Xray-core/issues/91
            if (['grpc'].includes(proxy.network)) {
                opts['_grpc-type'] = params.mode || 'gun';
            }
            if (httpupgrade) {
                opts['v2ray-http-upgrade'] = true;
                opts['v2ray-http-upgrade-fast-open'] = true;
            }
            if (Object.keys(opts).length > 0) {
                proxy[`${proxy.network}-opts`] = opts;
            }
            if (proxy.network === 'kcp') {
                // mKCP 种子。省略时不使用种子，但不可以为空字符串。建议 mKCP 用户使用 seed。
                if (params.seed) {
                    proxy.seed = params.seed;
                }
                // mKCP 的伪装头部类型。当前可选值有 none / srtp / utp / wechat-video / dtls / wireguard。省略时默认值为 none，即不使用伪装头部，但不可以为空字符串。
                proxy.headerType = params.headerType || 'none';
            }

            if (params.mode) {
                proxy._mode = params.mode;
            }
            if (params.extra) {
                proxy._extra = params.extra;
            }
        }

        return proxy;
    };
    return { name, test, parse };
}
function URI_AnyTLS() {
    const name = 'URI AnyTLS Parser';
    const test = (line) => {
        return /^anytls:\/\//.test(line);
    };
    const parse = (line) => {
        line = line.split(/anytls:\/\//)[1];
        // eslint-disable-next-line no-unused-vars
        let [__, password, server, port, addons = '', name] =
            /^(.*?)@(.*?)(?::(\d+))?\/?(?:\?(.*?))?(?:#(.*?))?$/.exec(line);
        password = decodeURIComponent(password);
        port = parseInt(`${port}`, 10);
        if (isNaN(port)) {
            port = 443;
        }
        password = decodeURIComponent(password);
        if (name != null) {
            name = decodeURIComponent(name);
        }
        name = name ?? `AnyTLS ${server}:${port}`;

        const proxy = {
            type: 'anytls',
            name,
            server,
            port,
            password,
        };

        for (const addon of addons.split('&')) {
            let [key, value] = addon.split('=');
            key = key.replace(/_/g, '-');
            value = decodeURIComponent(value);
            if (['alpn'].includes(key)) {
                proxy[key] = value ? value.split(',') : undefined;
            } else if (['insecure'].includes(key)) {
                proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value);
            } else if (['udp'].includes(key)) {
                proxy[key] = /(TRUE)|1/i.test(value);
            } else {
                proxy[key] = value;
            }
        }

        return proxy;
    };
    return { name, test, parse };
}
function URI_Hysteria2() {
    const name = 'URI Hysteria2 Parser';
    const test = (line) => {
        return /^(hysteria2|hy2):\/\//.test(line);
    };
    const parse = (line) => {
        line = line.split(/(hysteria2|hy2):\/\//)[2];
        // 端口跳跃有两种写法:
        // 1. 服务器的地址和可选端口。如果省略端口，则默认为 443。
        // 端口部分支持 端口跳跃 的「多端口地址格式」。
        // https://hysteria.network/zh/docs/advanced/Port-Hopping
        // 2. 参数 mport
        let ports;
        /* eslint-disable no-unused-vars */
        let [
            __,
            password,
            server,
            ___,
            port,
            ____,
            _____,
            ______,
            _______,
            ________,
            addons = '',
            name,
        ] = /^(.*?)@(.*?)(:((\d+(-\d+)?)([,;]\d+(-\d+)?)*))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(
            line,
        );

        /* eslint-enable no-unused-vars */
        if (/^\d+$/.test(port)) {
            port = parseInt(`${port}`, 10);
            if (isNaN(port)) {
                port = 443;
            }
        } else if (port) {
            ports = port;
            port = getRandomPort(ports);
        } else {
            port = 443;
        }

        password = decodeURIComponent(password);
        if (name != null) {
            name = decodeURIComponent(name);
        }
        name = name ?? `Hysteria2 ${server}:${port}`;

        const proxy = {
            type: 'hysteria2',
            name,
            server,
            port,
            ports,
            password,
        };

        const params = {};
        for (const addon of addons.split('&')) {
            const [key, valueRaw] = addon.split('=');
            let value = valueRaw;
            value = decodeURIComponent(valueRaw);
            params[key] = value;
        }

        proxy.sni = params.sni;
        if (!proxy.sni && params.peer) {
            proxy.sni = params.peer;
        }
        if (params.obfs && params.obfs !== 'none') {
            proxy.obfs = params.obfs;
        }
        if (params.mport) {
            proxy.ports = params.mport;
        }
        proxy['obfs-password'] = params['obfs-password'];
        proxy['skip-cert-verify'] = /(TRUE)|1/i.test(params.insecure);
        proxy.tfo = /(TRUE)|1/i.test(params.fastopen);
        proxy['tls-fingerprint'] = params.pinSHA256;
        let hop_interval = params['hop-interval'] || params['hop_interval'];

        if (/^\d+$/.test(hop_interval)) {
            proxy['hop-interval'] = parseInt(`${hop_interval}`, 10);
        }
        let keepalive = params['keepalive'];

        if (/^\d+$/.test(keepalive)) {
            proxy['keepalive'] = parseInt(`${keepalive}`, 10);
        }

        return proxy;
    };
    return { name, test, parse };
}
function URI_Hysteria() {
    const name = 'URI Hysteria Parser';
    const test = (line) => {
        return /^(hysteria|hy):\/\//.test(line);
    };
    const parse = (line) => {
        line = line.split(/(hysteria|hy):\/\//)[2];
        // eslint-disable-next-line no-unused-vars
        let [__, server, ___, port, ____, addons = '', name] =
            /^(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
        port = parseInt(`${port}`, 10);
        if (isNaN(port)) {
            port = 443;
        }
        if (name != null) {
            name = decodeURIComponent(name);
        }
        name = name ?? `Hysteria ${server}:${port}`;

        const proxy = {
            type: 'hysteria',
            name,
            server,
            port,
        };
        const params = {};
        for (const addon of addons.split('&')) {
            let [key, value] = addon.split('=');
            key = key.replace(/_/, '-');
            value = decodeURIComponent(value);
            if (['alpn'].includes(key)) {
                proxy[key] = value ? value.split(',') : undefined;
            } else if (['insecure'].includes(key)) {
                proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value);
            } else if (['auth'].includes(key)) {
                proxy['auth-str'] = value;
            } else if (['mport'].includes(key)) {
                proxy['ports'] = value;
            } else if (['obfsParam'].includes(key)) {
                proxy['obfs'] = value;
            } else if (['upmbps'].includes(key)) {
                proxy['up'] = value;
            } else if (['downmbps'].includes(key)) {
                proxy['down'] = value;
            } else if (['obfs'].includes(key)) {
                // obfs: Obfuscation mode (optional, empty or "xplus")
                proxy['_obfs'] = value || '';
            } else if (['fast-open', 'peer'].includes(key)) {
                params[key] = value;
            } else {
                proxy[key] = value;
            }
        }

        if (!proxy.sni && params.peer) {
            proxy.sni = params.peer;
        }
        if (!proxy['fast-open'] && params.fastopen) {
            proxy['fast-open'] = true;
        }
        if (!proxy.protocol) {
            // protocol: protocol to use ("udp", "wechat-video", "faketcp") (optional, default: "udp")
            proxy.protocol = 'udp';
        }

        return proxy;
    };
    return { name, test, parse };
}
function URI_TUIC() {
    const name = 'URI TUIC Parser';
    const test = (line) => {
        return /^tuic:\/\//.test(line);
    };
    const parse = (line) => {
        line = line.split(/tuic:\/\//)[1];
        // eslint-disable-next-line no-unused-vars
        let [__, auth, server, port, addons = '', name] =
            /^(.*?)@(.*?)(?::(\d+))?\/?(?:\?(.*?))?(?:#(.*?))?$/.exec(line);
        auth = decodeURIComponent(auth);
        let [uuid, ...passwordParts] = auth.split(':');
        let password = passwordParts.join(':');
        port = parseInt(`${port}`, 10);
        if (isNaN(port)) {
            port = 443;
        }
        password = decodeURIComponent(password);
        if (name != null) {
            name = decodeURIComponent(name);
        }
        name = name ?? `TUIC ${server}:${port}`;

        const proxy = {
            type: 'tuic',
            name,
            server,
            port,
            password,
            uuid,
        };

        for (const addon of addons.split('&')) {
            let [key, value] = addon.split('=');
            key = key.replace(/_/g, '-');
            value = decodeURIComponent(value);
            if (['alpn'].includes(key)) {
                proxy[key] = value ? value.split(',') : undefined;
            } else if (['allow-insecure'].includes(key)) {
                proxy['skip-cert-verify'] = /(TRUE)|1/i.test(value);
            } else if (['fast-open'].includes(key)) {
                proxy.tfo = true;
            } else if (['disable-sni', 'reduce-rtt'].includes(key)) {
                proxy[key] = /(TRUE)|1/i.test(value);
            } else if (key === 'congestion-control') {
                proxy['congestion-controller'] = value;
                delete proxy[key];
            } else {
                proxy[key] = value;
            }
        }

        return proxy;
    };
    return { name, test, parse };
}
function URI_WireGuard() {
    const name = 'URI WireGuard Parser';
    const test = (line) => {
        return /^(wireguard|wg):\/\//.test(line);
    };
    const parse = (line) => {
        line = line.split(/(wireguard|wg):\/\//)[2];
        /* eslint-disable no-unused-vars */
        let [
            __,
            ___,
            privateKey,
            server,
            ____,
            port,
            _____,
            addons = '',
            name,
        ] = /^((.*?)@)?(.*?)(:(\d+))?\/?(\?(.*?))?(?:#(.*?))?$/.exec(line);
        /* eslint-enable no-unused-vars */

        port = parseInt(`${port}`, 10);
        if (isNaN(port)) {
            port = 51820;
        }
        privateKey = decodeURIComponent(privateKey);
        if (name != null) {
            name = decodeURIComponent(name);
        }
        name = name ?? `WireGuard ${server}:${port}`;
        const proxy = {
            type: 'wireguard',
            name,
            server,
            port,
            'private-key': privateKey,
            udp: true,
        };
        for (const addon of addons.split('&')) {
            let [key, value] = addon.split('=');
            key = key.replace(/_/, '-');
            value = decodeURIComponent(value);
            if (['reserved'].includes(key)) {
                const parsed = value
                    .split(',')
                    .map((i) => parseInt(i.trim(), 10))
                    .filter((i) => Number.isInteger(i));
                if (parsed.length === 3) {
                    proxy[key] = parsed;
                }
            } else if (['address', 'ip'].includes(key)) {
                value.split(',').map((i) => {
                    const ip = i
                        .trim()
                        .replace(/\/\d+$/, '')
                        .replace(/^\[/, '')
                        .replace(/\]$/, '');
                    if (isIPv4(ip)) {
                        proxy.ip = ip;
                    } else if (isIPv6(ip)) {
                        proxy.ipv6 = ip;
                    }
                });
            } else if (['mtu'].includes(key)) {
                const parsed = parseInt(value.trim(), 10);
                if (Number.isInteger(parsed)) {
                    proxy[key] = parsed;
                }
            } else if (/publickey/i.test(key)) {
                proxy['public-key'] = value;
            } else if (/privatekey/i.test(key)) {
                proxy['private-key'] = value;
            } else if (['udp'].includes(key)) {
                proxy[key] = /(TRUE)|1/i.test(value);
            } else if (!['flag'].includes(key)) {
                proxy[key] = value;
            }
        }

        return proxy;
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
        const matched = /^(trojan:\/\/.*?@.*?)(:(\d+))?\/?(\?.*?)?$/.exec(line);
        const port = matched?.[2];
        if (!port) {
            line = line.replace(matched[1], `${matched[1]}:443`);
        }
        let [newLine, name] = line.split(/#(.+)/, 2);
        const parser = getTrojanURIParser();
        const proxy = parser.parse(newLine);
        if (isNotBlank(name)) {
            try {
                proxy.name = decodeURIComponent(name);
            } catch (e) {
                console.log(e);
            }
        }
        return proxy;
    };
    return { name, test, parse };
}

function Clash_All() {
    const name = 'Clash Parser';
    const test = (line) => {
        let proxy;
        try {
            proxy = JSON5.parse(line);
        } catch (e) {
            proxy = YAML.parse(line);
        }
        return !!proxy?.type;
    };
    const parse = (line) => {
        let proxy;
        try {
            proxy = JSON5.parse(line);
        } catch (e) {
            proxy = YAML.parse(line);
        }
        if (
            ![
                'anytls',
                'mieru',
                'juicity',
                'ss',
                'ssr',
                'vmess',
                'socks5',
                'http',
                'snell',
                'trojan',
                'tuic',
                'vless',
                'hysteria',
                'hysteria2',
                'wireguard',
                'ssh',
                'direct',
            ].includes(proxy.type)
        ) {
            throw new Error(
                `Clash does not support proxy with type: ${proxy.type}`,
            );
        }

        // handle vmess sni
        if (['vmess', 'vless'].includes(proxy.type)) {
            proxy.sni = proxy.servername;
            delete proxy.servername;
        }
        if (proxy['server-cert-fingerprint']) {
            proxy['tls-fingerprint'] = proxy['server-cert-fingerprint'];
        }
        if (proxy.fingerprint) {
            proxy['tls-fingerprint'] = proxy.fingerprint;
        }
        if (proxy['dialer-proxy']) {
            proxy['underlying-proxy'] = proxy['dialer-proxy'];
        }

        if (proxy['benchmark-url']) {
            proxy['test-url'] = proxy['benchmark-url'];
        }
        if (proxy['benchmark-timeout']) {
            proxy['test-timeout'] = proxy['benchmark-timeout'];
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

function QX_VLESS() {
    const name = 'QX VLESS Parser';
    const test = (line) => {
        return /^vless\s*=/.test(line.split(',')[0].trim());
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
function Loon_Hysteria2() {
    const name = 'Loon Hysteria2 Parser';
    const test = (line) => {
        return /^.*=\s*Hysteria2/i.test(line.split(',')[0]);
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
function Loon_Socks5() {
    const name = 'Loon SOCKS5 Parser';
    const test = (line) => {
        return /^.*=\s*socks5/i.test(line.split(',')[0]);
    };

    const parse = (line) => getLoonParser().parse(line);
    return { name, test, parse };
}

function Loon_WireGuard() {
    const name = 'Loon WireGuard Parser';
    const test = (line) => {
        return /^.*=\s*wireguard/i.test(line.split(',')[0]);
    };

    const parse = (line) => {
        const name = line.match(
            /(^.*?)\s*?=\s*?wireguard\s*?,.+?\s*?=\s*?.+?/i,
        )?.[1];
        line = line.replace(name, '').replace(/^\s*?=\s*?wireguard\s*/i, '');
        let peers = line.match(
            /,\s*?peers\s*?=\s*?\[\s*?\{\s*?(.+?)\s*?\}\s*?\]/i,
        )?.[1];
        let serverPort = peers.match(
            /(,|^)\s*?endpoint\s*?=\s*?"?(.+?):(\d+)"?\s*?(,|$)/i,
        );
        let server = serverPort?.[2];
        let port = parseInt(serverPort?.[3], 10);
        let mtu = line.match(/(,|^)\s*?mtu\s*?=\s*?"?(\d+?)"?\s*?(,|$)/i)?.[2];
        if (mtu) {
            mtu = parseInt(mtu, 10);
        }
        let keepalive = line.match(
            /(,|^)\s*?keepalive\s*?=\s*?"?(\d+?)"?\s*?(,|$)/i,
        )?.[2];
        if (keepalive) {
            keepalive = parseInt(keepalive, 10);
        }
        let reserved = peers.match(
            /(,|^)\s*?reserved\s*?=\s*?"?(\[\s*?.+?\s*?\])"?\s*?(,|$)/i,
        )?.[2];
        if (reserved) {
            reserved = JSON.parse(reserved);
        }

        let dns;
        let dnsv4 = line.match(/(,|^)\s*?dns\s*?=\s*?"?(.+?)"?\s*?(,|$)/i)?.[2];
        let dnsv6 = line.match(
            /(,|^)\s*?dnsv6\s*?=\s*?"?(.+?)"?\s*?(,|$)/i,
        )?.[2];
        if (dnsv4 || dnsv6) {
            dns = [];
            if (dnsv4) {
                dns.push(dnsv4);
            }
            if (dnsv6) {
                dns.push(dnsv6);
            }
        }
        let allowedIps = peers
            .match(/(,|^)\s*?allowed-ips\s*?=\s*?"(.+?)"\s*?(,|$)/i)?.[2]
            ?.split(',')
            .map((i) => i.trim());
        let preSharedKey = peers.match(
            /(,|^)\s*?preshared-key\s*?=\s*?"?(.+?)"?\s*?(,|$)/i,
        )?.[2];
        let ip = line.match(
            /(,|^)\s*?interface-ip\s*?=\s*?"?(.+?)"?\s*?(,|$)/i,
        )?.[2];
        let ipv6 = line.match(
            /(,|^)\s*?interface-ipv6\s*?=\s*?"?(.+?)"?\s*?(,|$)/i,
        )?.[2];
        let publicKey = peers.match(
            /(,|^)\s*?public-key\s*?=\s*?"?(.+?)"?\s*?(,|$)/i,
        )?.[2];
        // https://github.com/MetaCubeX/mihomo/blob/0404e35be8736b695eae018a08debb175c1f96e6/docs/config.yaml#L717
        const proxy = {
            type: 'wireguard',
            name,
            server,
            port,
            ip,
            ipv6,
            'private-key': line.match(
                /(,|^)\s*?private-key\s*?=\s*?"?(.+?)"?\s*?(,|$)/i,
            )?.[2],
            'public-key': publicKey,
            mtu,
            keepalive,
            reserved,
            'allowed-ips': allowedIps,
            'preshared-key': preSharedKey,
            dns,
            udp: true,
            peers: [
                {
                    server,
                    port,
                    ip,
                    ipv6,
                    'public-key': publicKey,
                    'pre-shared-key': preSharedKey,
                    'allowed-ips': allowedIps,
                    reserved,
                },
            ],
        };

        proxy;
        if (Array.isArray(proxy.dns) && proxy.dns.length > 0) {
            proxy['remote-dns-resolve'] = true;
        }
        return proxy;
    };
    return { name, test, parse };
}

function Surge_Direct() {
    const name = 'Surge Direct Parser';
    const test = (line) => {
        return /^.*=\s*direct/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}
function Surge_SSH() {
    const name = 'Surge SSH Parser';
    const test = (line) => {
        return /^.*=\s*ssh/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
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

function Surge_External() {
    const name = 'Surge External Parser';
    const test = (line) => {
        return /^.*=\s*external/.test(line.split(',')[0]);
    };
    const parse = (line) => {
        let parsed = /^\s*(.*?)\s*?=\s*?external\s*?,\s*(.*?)\s*$/.exec(line);

        // eslint-disable-next-line no-unused-vars
        let [_, name, other] = parsed;
        line = other;

        // exec = "/usr/bin/ssh" 或 exec = /usr/bin/ssh
        let exec = /(,|^)\s*?exec\s*?=\s*"(.*?)"\s*?(,|$)/.exec(line)?.[2];
        if (!exec) {
            exec = /(,|^)\s*?exec\s*?=\s*(.*?)\s*?(,|$)/.exec(line)?.[2];
        }

        // local-port = "1080" 或 local-port = 1080
        let localPort = /(,|^)\s*?local-port\s*?=\s*"(.*?)"\s*?(,|$)/.exec(
            line,
        )?.[2];
        if (!localPort) {
            localPort = /(,|^)\s*?local-port\s*?=\s*(.*?)\s*?(,|$)/.exec(
                line,
            )?.[2];
        }
        // args = "-m", args = "rc4-md5"
        // args = -m, args = rc4-md5
        const argsRegex = /(,|^)\s*?args\s*?=\s*("(.*?)"|(.*?))(?=\s*?(,|$))/g;
        let argsMatch;
        const args = [];
        while ((argsMatch = argsRegex.exec(line)) !== null) {
            if (argsMatch[3] != null) {
                args.push(argsMatch[3]);
            } else if (argsMatch[4] != null) {
                args.push(argsMatch[4]);
            }
        }
        // addresses = "[ipv6]",,addresses = "ipv6", addresses = "ipv4"
        // addresses = [ipv6], addresses = ipv6, addresses = ipv4
        const addressesRegex =
            /(,|^)\s*?addresses\s*?=\s*("(.*?)"|(.*?))(?=\s*?(,|$))/g;
        let addressesMatch;
        const addresses = [];
        while ((addressesMatch = addressesRegex.exec(line)) !== null) {
            let ip;
            if (addressesMatch[3] != null) {
                ip = addressesMatch[3];
            } else if (addressesMatch[4] != null) {
                ip = addressesMatch[4];
            }
            if (ip != null) {
                ip = `${ip}`.trim().replace(/^\[/, '').replace(/\]$/, '');
            }
            if (isIP(ip)) {
                addresses.push(ip);
            }
        }

        const proxy = {
            type: 'external',
            name,
            exec,
            'local-port': localPort,
            args,
            addresses,
        };
        return proxy;
    };
    return { name, test, parse };
}

function Surge_Snell() {
    const name = 'Surge Snell Parser';
    const test = (line) => {
        return /^.*=\s*snell/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

function Surge_Tuic() {
    const name = 'Surge Tuic Parser';
    const test = (line) => {
        return /^.*=\s*tuic(-v5)?/.test(line.split(',')[0]);
    };
    const parse = (raw) => {
        const { port_hopping, line } = surge_port_hopping(raw);
        const proxy = getSurgeParser().parse(line);
        proxy['ports'] = port_hopping;
        return proxy;
    };
    return { name, test, parse };
}
function Surge_WireGuard() {
    const name = 'Surge WireGuard Parser';
    const test = (line) => {
        return /^.*=\s*wireguard/.test(line.split(',')[0]);
    };
    const parse = (line) => getSurgeParser().parse(line);
    return { name, test, parse };
}

function Surge_Hysteria2() {
    const name = 'Surge Hysteria2 Parser';
    const test = (line) => {
        return /^.*=\s*hysteria2/.test(line.split(',')[0]);
    };
    const parse = (raw) => {
        const { port_hopping, line } = surge_port_hopping(raw);
        const proxy = getSurgeParser().parse(line);
        proxy['ports'] = port_hopping;
        return proxy;
    };
    return { name, test, parse };
}

function isIP(ip) {
    return isIPv4(ip) || isIPv6(ip);
}

export default [
    URI_PROXY(),
    URI_SOCKS(),
    URI_SS(),
    URI_SSR(),
    URI_VMess(),
    URI_VLESS(),
    URI_TUIC(),
    URI_WireGuard(),
    URI_Hysteria(),
    URI_Hysteria2(),
    URI_Trojan(),
    URI_AnyTLS(),
    Clash_All(),
    Surge_Direct(),
    Surge_SSH(),
    Surge_SS(),
    Surge_VMess(),
    Surge_Trojan(),
    Surge_Http(),
    Surge_Snell(),
    Surge_Tuic(),
    Surge_WireGuard(),
    Surge_Hysteria2(),
    Surge_Socks5(),
    Surge_External(),
    Loon_SS(),
    Loon_SSR(),
    Loon_VMess(),
    Loon_Vless(),
    Loon_Hysteria2(),
    Loon_Trojan(),
    Loon_Http(),
    Loon_Socks5(),
    Loon_WireGuard(),
    QX_SS(),
    QX_SSR(),
    QX_VMess(),
    QX_VLESS(),
    QX_Trojan(),
    QX_Http(),
    QX_Socks5(),
];
