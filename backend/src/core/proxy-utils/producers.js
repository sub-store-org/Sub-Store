/* eslint-disable no-case-declarations */
import { Base64 } from 'js-base64';

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
                }${proxy.udp ? ',udp-relay=true' : ',udp-relay=false'},tag=${
                    proxy.name
                }`;
            case 'ssr':
                return `shadowsocks=${proxy.server}:${proxy.port},method=${
                    proxy.cipher
                },password=${proxy.password},ssr-protocol=${proxy.protocol}${
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
                                ? ',obfs-host=' + proxy['ws-opts'].headers.Host
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
                    const host = proxy['ws-opts'].headers.Host || proxy.server;
                    obfs_opts = `,transport:ws,host:${host},path:${
                        proxy['ws-opts'].path || '/'
                    }`;
                } else {
                    obfs_opts = `,transport:tcp`;
                }
                if (proxy.tls) {
                    obfs_opts += `${
                        proxy.sni ? ',tls-name:' + proxy.sni : ''
                    },skip-cert-verify:${proxy['skip-cert-verify'] || 'false'}`;
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
                return `${proxy.name}=trojan,${proxy.server},${proxy.port},"${
                    proxy.password
                }"${
                    proxy.sni ? ',tls-name:' + proxy.sni : ''
                },skip-cert-verify:${
                    proxy['skip-cert-verify'] || 'false'
                }${udp_opts}`;
            case 'http':
                tls_opts = '';
                const base = `${proxy.name}=${proxy.tls ? 'http' : 'https'},${
                    proxy.server
                },${proxy.port},${proxy.username || ''},${
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
                    const wsHeaders = Object.entries(proxy['ws-opts'].headers)
                        .map(([key, value]) => `${key}:"${value}"`)
                        .join('|');
                    result += `,ws=true${path ? ',ws-path=' + path : ''}${
                        wsHeaders ? ',ws-headers=' + wsHeaders : ''
                    }`;
                }
                if (proxy.tls) {
                    result += `${
                        typeof proxy['skip-cert-verify'] !== 'undefined'
                            ? ',skip-cert-verify=' + proxy['skip-cert-verify']
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
                if (proxy.tls) {
                    tls_opts = `,skip-cert-verify=${proxy['skip-cert-verify']},sni=${proxy.sni}`;
                }
                result = `${proxy.name}=${proxy.tls ? 'https' : 'http'},${
                    proxy.server
                },${proxy.port}${
                    proxy.username ? ',username=' + proxy.username : ''
                }${
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
                                    opts.host ? ';obfs-host=' + opts.host : ''
                                }`,
                            );
                            break;
                        case 'v2ray-plugin':
                            result += encodeURIComponent(
                                `v2ray-plugin;obfs=${opts.mode}${
                                    opts.host ? ';obfs-host' + opts.host : ''
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
                    result.host = proxy['ws-opts'].headers.Host || proxy.server;
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

export default {
    QX: QX_Producer(),
    Surge: Surge_Producer(),
    Loon: Loon_Producer(),
    Clash: Clash_Producer(),
    URI: URI_Producer(),
    JSON: JSON_Producer(),
};
