import { isPresent } from '@/core/proxy-utils/producers/utils';

export default function Stash_Producer() {
    const type = 'ALL';
    const produce = (proxies) => {
        // https://stash.wiki/proxy-protocols/proxy-types#shadowsocks
        return (
            'proxies:\n' +
            proxies
                .filter((proxy) => {
                    if (
                        ![
                            'ss',
                            'ssr',
                            'vmess',
                            'socks5',
                            'http',
                            'snell',
                            'trojan',
                            'tuic',
                            'vless',
                            'wireguard',
                            'hysteria',
                            'hysteria2',
                        ].includes(proxy.type) ||
                        (proxy.type === 'ss' &&
                            ![
                                'aes-128-gcm',
                                'aes-192-gcm',
                                'aes-256-gcm',
                                'aes-128-cfb',
                                'aes-192-cfb',
                                'aes-256-cfb',
                                'aes-128-ctr',
                                'aes-192-ctr',
                                'aes-256-ctr',
                                'rc4-md5',
                                'chacha20-ietf',
                                'xchacha20',
                                'chacha20-ietf-poly1305',
                                'xchacha20-ietf-poly1305',
                            ].includes(proxy.cipher)) ||
                        (proxy.type === 'snell' &&
                            String(proxy.version) === '4') ||
                        (proxy.type === 'vless' && proxy['reality-opts'])
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
                            delete proxy.tfo;
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
                            delete proxy.tfo;
                        }
                        if (
                            isPresent(proxy, 'down') &&
                            !isPresent(proxy, 'down-speed')
                        ) {
                            proxy['down-speed'] = proxy.down;
                            delete proxy.down;
                        }
                        if (
                            isPresent(proxy, 'up') &&
                            !isPresent(proxy, 'up-speed')
                        ) {
                            proxy['up-speed'] = proxy.up;
                            delete proxy.up;
                        }
                        if (isPresent(proxy, 'down-speed')) {
                            proxy['down-speed'] =
                                `${proxy['down-speed']}`.match(/\d+/)?.[0] || 0;
                        }
                        if (isPresent(proxy, 'up-speed')) {
                            proxy['up-speed'] =
                                `${proxy['up-speed']}`.match(/\d+/)?.[0] || 0;
                        }
                    } else if (proxy.type === 'hysteria2') {
                        if (
                            isPresent(proxy, 'password') &&
                            !isPresent(proxy, 'auth')
                        ) {
                            proxy.auth = proxy.password;
                            delete proxy.password;
                        }
                        if (
                            isPresent(proxy, 'tfo') &&
                            !isPresent(proxy, 'fast-open')
                        ) {
                            proxy['fast-open'] = proxy.tfo;
                            delete proxy.tfo;
                        }
                        if (
                            isPresent(proxy, 'down') &&
                            !isPresent(proxy, 'down-speed')
                        ) {
                            proxy['down-speed'] = proxy.down;
                            delete proxy.down;
                        }
                        if (
                            isPresent(proxy, 'up') &&
                            !isPresent(proxy, 'up-speed')
                        ) {
                            proxy['up-speed'] = proxy.up;
                            delete proxy.up;
                        }
                        if (isPresent(proxy, 'down-speed')) {
                            proxy['down-speed'] =
                                `${proxy['down-speed']}`.match(/\d+/)?.[0] || 0;
                        }
                        if (isPresent(proxy, 'up-speed')) {
                            proxy['up-speed'] =
                                `${proxy['up-speed']}`.match(/\d+/)?.[0] || 0;
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
                        ['trojan', 'tuic', 'hysteria', 'hysteria2'].includes(
                            proxy.type,
                        )
                    ) {
                        delete proxy.tls;
                    }
                    if (proxy['tls-fingerprint']) {
                        proxy.fingerprint = proxy['tls-fingerprint'];
                    }
                    delete proxy['tls-fingerprint'];

                    if (proxy['test-url']) {
                        proxy['benchmark-url'] = proxy['test-url'];
                        delete proxy['test-url'];
                    }

                    delete proxy.subName;
                    delete proxy.collectionName;
                    if (
                        ['grpc'].includes(proxy.network) &&
                        proxy[`${proxy.network}-opts`]
                    ) {
                        delete proxy[`${proxy.network}-opts`]['_grpc-type'];
                    }
                    return '  - ' + JSON.stringify(proxy) + '\n';
                })
                .join('')
        );
    };
    return { type, produce };
}
