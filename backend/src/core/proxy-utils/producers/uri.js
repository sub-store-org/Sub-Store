/* eslint-disable no-case-declarations */
import { Base64 } from 'js-base64';
import { isIPv6 } from '@/utils';

export default function URI_Producer() {
    const type = 'SINGLE';
    const produce = (proxy) => {
        let result = '';
        delete proxy.subName;
        delete proxy.collectionName;
        delete proxy.id;
        delete proxy.resolved;
        delete proxy['no-resolve'];
        for (const key in proxy) {
            if (proxy[key] == null || /^_/i.test(key)) {
                delete proxy[key];
            }
        }
        if (
            ['trojan', 'tuic', 'hysteria', 'hysteria2', 'juicity'].includes(
                proxy.type,
            )
        ) {
            delete proxy.tls;
        }
        if (proxy.server && isIPv6(proxy.server)) {
            proxy.server = `[${proxy.server}]`;
        }
        switch (proxy.type) {
            case 'ss':
                const userinfo = `${proxy.cipher}:${proxy.password}`;
                result = `ss://${Base64.encode(userinfo)}@${proxy.server}:${
                    proxy.port
                }${proxy.plugin ? '/' : ''}`;
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
                if (proxy['udp-over-tcp']) {
                    result = `${result}${proxy.plugin ? '&' : '?'}uot=1`;
                }
                if (proxy.tfo) {
                    result = `${result}${
                        proxy.plugin || proxy['udp-over-tcp'] ? '&' : '?'
                    }tfo=1`;
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
                let type = '';
                let net = proxy.network || 'tcp';
                if (proxy.network === 'http') {
                    net = 'tcp';
                    type = 'http';
                } else if (
                    proxy.network === 'ws' &&
                    proxy['ws-opts']?.['v2ray-http-upgrade']
                ) {
                    net = 'httpupgrade';
                }
                result = {
                    v: '2',
                    ps: proxy.name,
                    add: proxy.server,
                    port: proxy.port,
                    id: proxy.uuid,
                    type,
                    aid: proxy.alterId || 0,
                    net,
                    tls: proxy.tls ? 'tls' : '',
                };
                if (proxy.tls && proxy.sni) {
                    result.sni = proxy.sni;
                }
                // obfs
                if (proxy.network) {
                    let vmessTransportPath =
                        proxy[`${proxy.network}-opts`]?.path;
                    let vmessTransportHost =
                        proxy[`${proxy.network}-opts`]?.headers?.Host;
                    if (vmessTransportPath) {
                        result.path = Array.isArray(vmessTransportPath)
                            ? vmessTransportPath[0]
                            : vmessTransportPath;
                    }
                    if (vmessTransportHost) {
                        result.host = Array.isArray(vmessTransportHost)
                            ? vmessTransportHost[0]
                            : vmessTransportHost;
                    }
                    if (['grpc'].includes(proxy.network)) {
                        result.path =
                            proxy[`${proxy.network}-opts`]?.[
                                'grpc-service-name'
                            ];
                        // https://github.com/XTLS/Xray-core/issues/91
                        result.type =
                            proxy[`${proxy.network}-opts`]?.['_grpc-type'] ||
                            'gun';
                        result.host =
                            proxy[`${proxy.network}-opts`]?.['_grpc-authority'];
                    }
                }
                result = 'vmess://' + Base64.encode(JSON.stringify(result));
                break;
            case 'vless':
                let security = 'none';
                const isReality = proxy['reality-opts'];
                let sid = '';
                let pbk = '';
                if (isReality) {
                    security = 'reality';
                    const publicKey = proxy['reality-opts']?.['public-key'];
                    if (publicKey) {
                        pbk = `&pbk=${encodeURIComponent(publicKey)}`;
                    }
                    const shortId = proxy['reality-opts']?.['short-id'];
                    if (shortId) {
                        sid = `&sid=${encodeURIComponent(shortId)}`;
                    }
                } else if (proxy.tls) {
                    security = 'tls';
                }
                let alpn = '';
                if (proxy.alpn) {
                    alpn = `&alpn=${encodeURIComponent(
                        Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : proxy.alpn.join(','),
                    )}`;
                }
                let allowInsecure = '';
                if (proxy['skip-cert-verify']) {
                    allowInsecure = `&allowInsecure=1`;
                }
                let sni = '';
                if (proxy.sni) {
                    sni = `&sni=${encodeURIComponent(proxy.sni)}`;
                }
                let fp = '';
                if (proxy['client-fingerprint']) {
                    fp = `&fp=${encodeURIComponent(
                        proxy['client-fingerprint'],
                    )}`;
                }
                let flow = '';
                if (proxy.flow) {
                    flow = `&flow=${encodeURIComponent(proxy.flow)}`;
                }
                let vlessType = proxy.network;
                if (
                    proxy.network === 'ws' &&
                    proxy['ws-opts']?.['v2ray-http-upgrade']
                ) {
                    vlessType = 'httpupgrade';
                }

                let vlessTransport = `&type=${encodeURIComponent(vlessType)}`;
                if (['grpc'].includes(proxy.network)) {
                    // https://github.com/XTLS/Xray-core/issues/91
                    vlessTransport += `&mode=${encodeURIComponent(
                        proxy[`${proxy.network}-opts`]?.['_grpc-type'] || 'gun',
                    )}`;
                    const authority =
                        proxy[`${proxy.network}-opts`]?.['_grpc-authority'];
                    if (authority) {
                        vlessTransport += `&authority=${encodeURIComponent(
                            authority,
                        )}`;
                    }
                }

                let vlessTransportServiceName =
                    proxy[`${proxy.network}-opts`]?.[
                        `${proxy.network}-service-name`
                    ];
                let vlessTransportPath = proxy[`${proxy.network}-opts`]?.path;
                let vlessTransportHost =
                    proxy[`${proxy.network}-opts`]?.headers?.Host;
                if (vlessTransportPath) {
                    vlessTransport += `&path=${encodeURIComponent(
                        Array.isArray(vlessTransportPath)
                            ? vlessTransportPath[0]
                            : vlessTransportPath,
                    )}`;
                }
                if (vlessTransportHost) {
                    vlessTransport += `&host=${encodeURIComponent(
                        Array.isArray(vlessTransportHost)
                            ? vlessTransportHost[0]
                            : vlessTransportHost,
                    )}`;
                }
                if (vlessTransportServiceName) {
                    vlessTransport += `&serviceName=${encodeURIComponent(
                        vlessTransportServiceName,
                    )}`;
                }
                if (proxy.network === 'kcp') {
                    if (proxy.seed) {
                        vlessTransport += `&seed=${encodeURIComponent(
                            proxy.seed,
                        )}`;
                    }
                    if (proxy.headerType) {
                        vlessTransport += `&headerType=${encodeURIComponent(
                            proxy.headerType,
                        )}`;
                    }
                }

                result = `vless://${proxy.uuid}@${proxy.server}:${
                    proxy.port
                }?security=${encodeURIComponent(
                    security,
                )}${vlessTransport}${alpn}${allowInsecure}${sni}${fp}${flow}${sid}${pbk}#${encodeURIComponent(
                    proxy.name,
                )}`;
                break;
            case 'trojan':
                let trojanTransport = '';
                if (proxy.network) {
                    let trojanType = proxy.network;
                    if (
                        proxy.network === 'ws' &&
                        proxy['ws-opts']?.['v2ray-http-upgrade']
                    ) {
                        trojanType = 'httpupgrade';
                    }
                    trojanTransport = `&type=${encodeURIComponent(trojanType)}`;
                    if (['grpc'].includes(proxy.network)) {
                        let trojanTransportServiceName =
                            proxy[`${proxy.network}-opts`]?.[
                                `${proxy.network}-service-name`
                            ];
                        let trojanTransportAuthority =
                            proxy[`${proxy.network}-opts`]?.['_grpc-authority'];
                        if (trojanTransportServiceName) {
                            trojanTransport += `&serviceName=${encodeURIComponent(
                                trojanTransportServiceName,
                            )}`;
                        }
                        if (trojanTransportAuthority) {
                            trojanTransport += `&authority=${encodeURIComponent(
                                trojanTransportAuthority,
                            )}`;
                        }
                        trojanTransport += `&mode=${encodeURIComponent(
                            proxy[`${proxy.network}-opts`]?.['_grpc-type'] ||
                                'gun',
                        )}`;
                    }
                    let trojanTransportPath =
                        proxy[`${proxy.network}-opts`]?.path;
                    let trojanTransportHost =
                        proxy[`${proxy.network}-opts`]?.headers?.Host;
                    if (trojanTransportPath) {
                        trojanTransport += `&path=${encodeURIComponent(
                            Array.isArray(trojanTransportPath)
                                ? trojanTransportPath[0]
                                : trojanTransportPath,
                        )}`;
                    }
                    if (trojanTransportHost) {
                        trojanTransport += `&host=${encodeURIComponent(
                            Array.isArray(trojanTransportHost)
                                ? trojanTransportHost[0]
                                : trojanTransportHost,
                        )}`;
                    }
                }
                let trojanFp = '';
                if (proxy['client-fingerprint']) {
                    trojanFp = `&fp=${encodeURIComponent(
                        proxy['client-fingerprint'],
                    )}`;
                }
                let trojanAlpn = '';
                if (proxy.alpn) {
                    trojanAlpn = `&alpn=${encodeURIComponent(
                        Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : proxy.alpn.join(','),
                    )}`;
                }
                result = `trojan://${proxy.password}@${proxy.server}:${
                    proxy.port
                }?sni=${encodeURIComponent(proxy.sni || proxy.server)}${
                    proxy['skip-cert-verify'] ? '&allowInsecure=1' : ''
                }${trojanTransport}${trojanAlpn}${trojanFp}#${encodeURIComponent(
                    proxy.name,
                )}`;
                break;
            case 'hysteria2':
                let hysteria2params = [];
                if (proxy['skip-cert-verify']) {
                    hysteria2params.push(`insecure=1`);
                }
                if (proxy.obfs) {
                    hysteria2params.push(
                        `obfs=${encodeURIComponent(proxy.obfs)}`,
                    );
                    if (proxy['obfs-password']) {
                        hysteria2params.push(
                            `obfs-password=${encodeURIComponent(
                                proxy['obfs-password'],
                            )}`,
                        );
                    }
                }
                if (proxy.sni) {
                    hysteria2params.push(
                        `sni=${encodeURIComponent(proxy.sni)}`,
                    );
                }
                if (proxy.ports) {
                    hysteria2params.push(`mport=${proxy.ports}`);
                }
                if (proxy['tls-fingerprint']) {
                    hysteria2params.push(
                        `pinSHA256=${encodeURIComponent(
                            proxy['tls-fingerprint'],
                        )}`,
                    );
                }
                if (proxy.tfo) {
                    hysteria2params.push(`fastopen=1`);
                }
                result = `hysteria2://${encodeURIComponent(proxy.password)}@${
                    proxy.server
                }:${proxy.port}?${hysteria2params.join(
                    '&',
                )}#${encodeURIComponent(proxy.name)}`;
                break;
            case 'hysteria':
                let hysteriaParams = [];
                Object.keys(proxy).forEach((key) => {
                    if (!['name', 'type', 'server', 'port'].includes(key)) {
                        const i = key.replace(/-/, '_');
                        if (['alpn'].includes(key)) {
                            if (proxy[key]) {
                                hysteriaParams.push(
                                    `${i}=${encodeURIComponent(
                                        Array.isArray(proxy[key])
                                            ? proxy[key][0]
                                            : proxy[key],
                                    )}`,
                                );
                            }
                        } else if (['skip-cert-verify'].includes(key)) {
                            if (proxy[key]) {
                                hysteriaParams.push(`insecure=1`);
                            }
                        } else if (['tfo', 'fast-open'].includes(key)) {
                            if (
                                proxy[key] &&
                                !hysteriaParams.includes('fastopen=1')
                            ) {
                                hysteriaParams.push(`fastopen=1`);
                            }
                        } else if (['ports'].includes(key)) {
                            hysteriaParams.push(`mport=${proxy[key]}`);
                        } else if (['auth-str'].includes(key)) {
                            hysteriaParams.push(`auth=${proxy[key]}`);
                        } else if (['up'].includes(key)) {
                            hysteriaParams.push(`upmbps=${proxy[key]}`);
                        } else if (['down'].includes(key)) {
                            hysteriaParams.push(`downmbps=${proxy[key]}`);
                        } else if (['_obfs'].includes(key)) {
                            hysteriaParams.push(`obfs=${proxy[key]}`);
                        } else if (['obfs'].includes(key)) {
                            hysteriaParams.push(`obfsParam=${proxy[key]}`);
                        } else if (['sni'].includes(key)) {
                            hysteriaParams.push(`peer=${proxy[key]}`);
                        } else if (proxy[key]) {
                            hysteriaParams.push(
                                `${i}=${encodeURIComponent(proxy[key])}`,
                            );
                        }
                    }
                });

                result = `hysteria://${proxy.server}:${
                    proxy.port
                }?${hysteriaParams.join('&')}#${encodeURIComponent(
                    proxy.name,
                )}`;
                break;

            case 'tuic':
                if (!proxy.token || proxy.token.length === 0) {
                    let tuicParams = [];
                    Object.keys(proxy).forEach((key) => {
                        if (
                            ![
                                'name',
                                'type',
                                'uuid',
                                'password',
                                'server',
                                'port',
                            ].includes(key)
                        ) {
                            const i = key.replace(/-/, '_');
                            if (['alpn'].includes(key)) {
                                if (proxy[key]) {
                                    tuicParams.push(
                                        `${i}=${encodeURIComponent(
                                            Array.isArray(proxy[key])
                                                ? proxy[key][0]
                                                : proxy[key],
                                        )}`,
                                    );
                                }
                            } else if (['skip-cert-verify'].includes(key)) {
                                if (proxy[key]) {
                                    tuicParams.push(`allow_insecure=1`);
                                }
                            } else if (['tfo', 'fast-open'].includes(key)) {
                                if (
                                    proxy[key] &&
                                    !tuicParams.includes('fast_open=1')
                                ) {
                                    tuicParams.push(`fast_open=1`);
                                }
                            } else if (
                                ['disable-sni', 'reduce-rtt'].includes(key) &&
                                proxy[key]
                            ) {
                                tuicParams.push(`${i}=1`);
                            } else if (proxy[key]) {
                                tuicParams.push(
                                    `${i}=${encodeURIComponent(proxy[key])}`,
                                );
                            }
                        }
                    });

                    result = `tuic://${encodeURIComponent(
                        proxy.uuid,
                    )}:${encodeURIComponent(proxy.password)}@${proxy.server}:${
                        proxy.port
                    }?${tuicParams.join('&')}#${encodeURIComponent(
                        proxy.name,
                    )}`;
                }
                break;
            case 'wireguard':
                let wireguardParams = [];

                Object.keys(proxy).forEach((key) => {
                    if (
                        ![
                            'name',
                            'type',
                            'server',
                            'port',
                            'ip',
                            'ipv6',
                            'private-key',
                        ].includes(key)
                    ) {
                        if (['public-key'].includes(key)) {
                            wireguardParams.push(`publickey=${proxy[key]}`);
                        } else if (['udp'].includes(key)) {
                            if (proxy[key]) {
                                wireguardParams.push(`${key}=1`);
                            }
                        } else if (proxy[key]) {
                            wireguardParams.push(
                                `${key}=${encodeURIComponent(proxy[key])}`,
                            );
                        }
                    }
                });
                if (proxy.ip && proxy.ipv6) {
                    wireguardParams.push(
                        `address=${proxy.ip}/32,${proxy.ipv6}/128`,
                    );
                } else if (proxy.ip) {
                    wireguardParams.push(`address=${proxy.ip}/32`);
                } else if (proxy.ipv6) {
                    wireguardParams.push(`address=${proxy.ipv6}/128`);
                }
                result = `wireguard://${encodeURIComponent(
                    proxy['private-key'],
                )}@${proxy.server}:${proxy.port}/?${wireguardParams.join(
                    '&',
                )}#${encodeURIComponent(proxy.name)}`;
                break;
        }
        return result;
    };
    return { type, produce };
}
