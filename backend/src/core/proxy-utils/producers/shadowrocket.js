import {
    getWireGuardAddressWithCIDR,
    isPresent,
    isShadowsocksOverTls,
    produceProxyListOutput,
    supportsShadowsocksV2rayPluginMode,
} from '@/core/proxy-utils/producers/utils';
import {
    deleteHttpUpgradeEarlyDataMetadata,
    normalizeWebSocketEarlyDataPath,
} from '../transport-path';
import $ from '@/core/app';
import { normalizeVmessSecurity } from '../vmess-security';

export default function Shadowrocket_Producer() {
    const type = 'ALL';
    const produce = (proxies, type, opts = {}) => {
        const list = proxies
            .filter((proxy) => {
                if (opts['include-unsupported-proxy']) return true;
                if (
                    !supportsShadowsocksV2rayPluginMode(proxy, [
                        'websocket',
                        'quic',
                        'http2',
                        'mkcp',
                        'grpc',
                    ])
                ) {
                    return false;
                } else if (
                    proxy.type === 'snell' &&
                    ![1, 2, 3, 4, 5].includes(proxy.version)
                ) {
                    return false;
                } else if (hasShadowrocketSnellShadowTlsObfsConflict(proxy)) {
                    $.error(
                        `Platform Shadowrocket does not support Snell shadow-tls with obfs for proxy ${proxy.name}. Proxy has been filtered.`,
                    );
                    return false;
                } else if (
                    [
                        'tailscale',
                        'sudoku',
                        'naive',
                        'openvpn',
                        'gost-relay',
                        'shadowquic',
                    ].includes(proxy.type)
                ) {
                    return false;
                } else if (['xhttp'].includes(proxy.network)) {
                    $.warn(
                        `VLESS XHTTP 结构复杂, Shadowrocket 可能无法完全兼容`,
                    );
                    return true;
                }
                return true;
            })
            .map((proxy) => {
                if (proxy.type === 'vmess') {
                    // handle vmess aead
                    if (isPresent(proxy, 'aead')) {
                        if (proxy.aead) {
                            proxy.alterId = 0;
                        }
                        delete proxy.aead;
                    }
                    if (isPresent(proxy, 'sni')) {
                        proxy.servername = proxy.sni;
                        delete proxy.sni;
                    }
                    // https://github.com/MetaCubeX/Clash.Meta/blob/Alpha/docs/config.yaml#L400
                    // https://stash.wiki/proxy-protocols/proxy-types#vmess
                    proxy.cipher = normalizeVmessSecurity(proxy.cipher);
                } else if (proxy.type === 'tuic') {
                    if (isPresent(proxy, 'alpn')) {
                        proxy.alpn = Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : [proxy.alpn];
                    }
                    //  else {
                    //     proxy.alpn = ['h3'];
                    // }
                    if (
                        isPresent(proxy, 'tfo') &&
                        !isPresent(proxy, 'fast-open')
                    ) {
                        proxy['fast-open'] = proxy.tfo;
                    }
                    // https://github.com/MetaCubeX/Clash.Meta/blob/Alpha/adapter/outbound/tuic.go#L197
                    if (
                        (!proxy.token || proxy.token.length === 0) &&
                        !isPresent(proxy, 'version')
                    ) {
                        proxy.version = 5;
                    }
                } else if (proxy.type === 'hysteria') {
                    // auth_str 将会在未来某个时候删除 但是有的机场不规范
                    if (
                        isPresent(proxy, 'auth_str') &&
                        !isPresent(proxy, 'auth-str')
                    ) {
                        proxy['auth-str'] = proxy['auth_str'];
                    }
                    if (isPresent(proxy, 'alpn')) {
                        proxy.alpn = Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : [proxy.alpn];
                    }
                    if (
                        isPresent(proxy, 'tfo') &&
                        !isPresent(proxy, 'fast-open')
                    ) {
                        proxy['fast-open'] = proxy.tfo;
                    }
                } else if (proxy.type === 'hysteria2') {
                    // 新版已更改
                    // if (proxy['obfs-password'] && proxy.obfs == 'salamander') {
                    //     proxy.obfs = proxy['obfs-password'];
                    //     delete proxy['obfs-password'];
                    // }
                    if (isPresent(proxy, 'alpn')) {
                        proxy.alpn = Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : [proxy.alpn];
                    }
                    if (
                        isPresent(proxy, 'tfo') &&
                        !isPresent(proxy, 'fast-open')
                    ) {
                        proxy['fast-open'] = proxy.tfo;
                    }
                } else if (proxy.type === 'wireguard') {
                    proxy.keepalive =
                        proxy.keepalive ?? proxy['persistent-keepalive'];
                    proxy['persistent-keepalive'] = proxy.keepalive;
                    proxy['preshared-key'] =
                        proxy['preshared-key'] ?? proxy['pre-shared-key'];
                    proxy['pre-shared-key'] = proxy['preshared-key'];
                    proxy.ip = getWireGuardAddressWithCIDR(proxy, 'ipv4');
                    proxy.ipv6 = getWireGuardAddressWithCIDR(proxy, 'ipv6');
                } else if (proxy.type === 'snell') {
                    if (proxy.version < 3) {
                        delete proxy.udp;
                    }
                    if (proxy.plugin === 'shadow-tls' && proxy['plugin-opts']) {
                        proxy['obfs-opts'] = {
                            mode: 'shadow-tls',
                            host: proxy['plugin-opts'].host,
                            password: proxy['plugin-opts'].password,
                            version: proxy['plugin-opts'].version,
                        };
                        if (proxy['plugin-opts'].alpn) {
                            proxy['obfs-opts'].alpn = proxy['plugin-opts'].alpn;
                        }
                        delete proxy.plugin;
                        delete proxy['plugin-opts'];
                    }
                } else if (proxy.type === 'vless') {
                    if (isPresent(proxy, 'sni')) {
                        proxy.servername = proxy.sni;
                        delete proxy.sni;
                    }
                } else if (proxy.type === 'ss') {
                    if (isShadowsocksOverTls(proxy)) {
                        if (isPresent(proxy, 'sni')) {
                            proxy.servername = proxy.sni;
                            // 先不删 没有明确的规范
                            // delete proxy.sni;
                        }
                    }
                }

                if (
                    ['vmess', 'vless'].includes(proxy.type) &&
                    proxy.network === 'http'
                ) {
                    let httpPath = proxy['http-opts']?.path;
                    if (
                        isPresent(proxy, 'http-opts.path') &&
                        !Array.isArray(httpPath)
                    ) {
                        proxy['http-opts'].path = [httpPath];
                    }
                    let httpHost = proxy['http-opts']?.headers?.Host;
                    if (
                        isPresent(proxy, 'http-opts.headers.Host') &&
                        !Array.isArray(httpHost)
                    ) {
                        proxy['http-opts'].headers.Host = [httpHost];
                    }
                }
                if (
                    ['vmess', 'vless'].includes(proxy.type) &&
                    proxy.network === 'h2'
                ) {
                    let path = proxy['h2-opts']?.path;
                    if (
                        isPresent(proxy, 'h2-opts.path') &&
                        Array.isArray(path)
                    ) {
                        proxy['h2-opts'].path = path[0];
                    }
                    let host =
                        proxy['h2-opts']?.host ??
                        proxy['h2-opts']?.headers?.host ??
                        proxy['h2-opts']?.headers?.Host;
                    if (
                        isPresent(proxy, 'h2-opts.host') ||
                        isPresent(proxy, 'h2-opts.headers.host') ||
                        isPresent(proxy, 'h2-opts.headers.Host')
                    ) {
                        proxy['h2-opts'].host = Array.isArray(host)
                            ? host
                            : [host];
                    }
                    if (proxy['h2-opts']?.headers) {
                        delete proxy['h2-opts'].headers.host;
                        delete proxy['h2-opts'].headers.Host;
                        if (
                            Object.keys(proxy['h2-opts'].headers).length === 0
                        ) {
                            delete proxy['h2-opts'].headers;
                        }
                    }
                }
                if (['ws'].includes(proxy.network)) {
                    const networkOptsKey = `${proxy.network}-opts`;
                    proxy[networkOptsKey] = proxy[networkOptsKey] || {};
                    if (!proxy[networkOptsKey].path) {
                        proxy[networkOptsKey].path = '/';
                    }
                    normalizeWebSocketEarlyDataPath(proxy[networkOptsKey]);
                }

                if (proxy['plugin-opts']?.tls) {
                    if (isPresent(proxy, 'skip-cert-verify')) {
                        proxy['plugin-opts']['skip-cert-verify'] =
                            proxy['plugin-opts']['skip-cert-verify'] ||
                            proxy['skip-cert-verify'];
                    }
                }
                if (
                    [
                        'trojan',
                        'tuic',
                        'hysteria',
                        'hysteria2',
                        'juicity',
                        'anytls',
                        'trusttunnel',
                        'naive',
                    ].includes(proxy.type)
                ) {
                    delete proxy.tls;
                }

                if (proxy['tls-fingerprint']) {
                    proxy.fingerprint = proxy['tls-fingerprint'];
                }
                delete proxy['tls-fingerprint'];

                if (proxy['underlying-proxy']) {
                    proxy['dialer-proxy'] = proxy['underlying-proxy'];
                }
                delete proxy['underlying-proxy'];

                if (isPresent(proxy, 'tls') && typeof proxy.tls !== 'boolean') {
                    delete proxy.tls;
                }
                delete proxy.subName;
                delete proxy.collectionName;
                delete proxy.id;
                delete proxy.resolved;
                delete proxy['no-resolve'];
                delete proxy['ip-cidr'];
                delete proxy['ipv6-cidr'];
                if (type !== 'internal') {
                    for (const key in proxy) {
                        if (proxy[key] == null || /^_/i.test(key)) {
                            delete proxy[key];
                        }
                    }
                    deleteHttpUpgradeEarlyDataMetadata(
                        proxy[`${proxy.network}-opts`],
                    );
                }
                if (
                    ['grpc'].includes(proxy.network) &&
                    proxy[`${proxy.network}-opts`]
                ) {
                    delete proxy[`${proxy.network}-opts`]['_grpc-type'];
                    delete proxy[`${proxy.network}-opts`]['_grpc-authority'];
                }
                return proxy;
            });
        return produceProxyListOutput(list, type, opts);
    };
    return { type, produce };
}

function hasShadowrocketSnellShadowTlsObfsConflict(proxy) {
    return (
        proxy?.type === 'snell' &&
        proxy?.plugin === 'shadow-tls' &&
        (isPresent(proxy, 'obfs-opts.mode') ||
            isPresent(proxy, 'obfs-opts.host') ||
            isPresent(proxy, 'obfs-opts.path'))
    );
}
