/* eslint-disable no-case-declarations */
import { Base64 } from 'js-base64';
import { isIPv6 } from '@/utils';

export default function URI_Producer() {
    const type = 'SINGLE';
    const produce = (proxy) => {
        let result = '';
        if (proxy.server && isIPv6(proxy.server)) {
            proxy.server = `[${proxy.server}]`;
        }
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
                let type = '';
                let net = proxy.network || 'tcp';
                if (proxy.network === 'http') {
                    net = 'tcp';
                    type = 'http';
                }
                result = {
                    v: '2',
                    ps: proxy.name,
                    add: proxy.server,
                    port: proxy.port,
                    id: proxy.uuid,
                    type,
                    aid: 0,
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
                let vlessTransport = `&type=${encodeURIComponent(
                    proxy.network,
                )}`;
                if (['grpc'].includes(proxy.network)) {
                    // https://github.com/XTLS/Xray-core/issues/91
                    vlessTransport += `&mode=${encodeURIComponent(
                        proxy[`${proxy.network}-opts`]?.['_grpc-type'] || 'gun',
                    )}`;
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

                result = `vless://${proxy.uuid}@${proxy.server}:${
                    proxy.port
                }?${vlessTransport}&security=${encodeURIComponent(
                    security,
                )}${alpn}${allowInsecure}${sni}${fp}${flow}${sid}${pbk}#${encodeURIComponent(
                    proxy.name,
                )}`;
                break;
            case 'trojan':
                let trojanTransport = '';
                if (proxy.network) {
                    trojanTransport = `&type=${proxy.network}`;
                    if (['grpc'].includes(proxy.network)) {
                        let trojanTransportServiceName =
                            proxy[`${proxy.network}-opts`]?.[
                                `${proxy.network}-service-name`
                            ];
                        if (trojanTransportServiceName) {
                            trojanTransport += `&serviceName=${encodeURIComponent(
                                trojanTransportServiceName,
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
                result = `trojan://${proxy.password}@${proxy.server}:${
                    proxy.port
                }?sni=${encodeURIComponent(proxy.sni || proxy.server)}${
                    proxy['skip-cert-verify'] ? '&allowInsecure=1' : ''
                }${trojanTransport}#${encodeURIComponent(proxy.name)}`;
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
        }
        return result;
    };
    return { type, produce };
}
