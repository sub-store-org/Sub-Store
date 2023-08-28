import { isPresent } from '@/core/proxy-utils/producers/utils';

export default function ShadowRocket_Producer() {
    const type = 'ALL';
    const produce = (proxies) => {
        return (
            'proxies:\n' +
            proxies
                .filter((proxy) => {
                    if (
                        proxy.type === 'snell' &&
                        String(proxy.version) === '4'
                    ) {
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

                    if (['trojan', 'tuic', 'hysteria'].includes(proxy.type)) {
                        delete proxy.tls;
                    }

                    delete proxy['tls-fingerprint'];
                    return '  - ' + JSON.stringify(proxy) + '\n';
                })
                .join('')
        );
    };
    return { type, produce };
}
