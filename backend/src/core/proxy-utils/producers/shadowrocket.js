import { isPresent } from '@/core/proxy-utils/producers/utils';

export default function ShadowRocket_Producer() {
    const type = 'ALL';
    const produce = (proxies, type, opts = {}) => {
        const list = proxies
            .filter((proxy) => {
                if (opts['include-unsupported-proxy']) return true;
                if (proxy.type === 'snell' && String(proxy.version) === '4') {
                    return false;
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
                    if (
                        isPresent(proxy, 'cipher') &&
                        ![
                            'auto',
                            'aes-128-gcm',
                            'chacha20-poly1305',
                            'none',
                        ].includes(proxy.cipher)
                    ) {
                        proxy.cipher = 'auto';
                    }
                } else if (proxy.type === 'tuic') {
                    if (isPresent(proxy, 'alpn')) {
                        proxy.alpn = Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : [proxy.alpn];
                    } else {
                        proxy.alpn = ['h3'];
                    }
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
                    if (proxy['obfs-password'] && proxy.obfs == 'salamander') {
                        proxy.obfs = proxy['obfs-password'];
                        delete proxy['obfs-password'];
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
                } else if (proxy.type === 'wireguard') {
                    proxy.keepalive =
                        proxy.keepalive ?? proxy['persistent-keepalive'];
                    proxy['persistent-keepalive'] = proxy.keepalive;
                    proxy['preshared-key'] =
                        proxy['preshared-key'] ?? proxy['pre-shared-key'];
                    proxy['pre-shared-key'] = proxy['preshared-key'];
                } else if (proxy.type === 'vless') {
                    if (isPresent(proxy, 'sni')) {
                        proxy.servername = proxy.sni;
                        delete proxy.sni;
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
                    let host = proxy['h2-opts']?.headers?.host;
                    if (
                        isPresent(proxy, 'h2-opts.headers.Host') &&
                        !Array.isArray(host)
                    ) {
                        proxy['h2-opts'].headers.host = [host];
                    }
                }
                if (proxy['plugin-opts']?.tls) {
                    if (isPresent(proxy, 'skip-cert-verify')) {
                        proxy['plugin-opts']['skip-cert-verify'] =
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
                if (type !== 'internal') {
                    for (const key in proxy) {
                        if (proxy[key] == null || /^_/i.test(key)) {
                            delete proxy[key];
                        }
                    }
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
        return type === 'internal'
            ? list
            : 'proxies:\n' +
                  list
                      .map((proxy) => {
                          return '  - ' + JSON.stringify(proxy) + '\n';
                      })
                      .join('');
    };
    return { type, produce };
}
