import { isPresent } from '@/core/proxy-utils/producers/utils';

export default function Clash_Producer() {
    const type = 'ALL';
    const produce = (proxies) => {
        // filter unsupported proxies
        proxies = proxies.filter((proxy) => {
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
                return false;
            } else if (
                proxy.type === 'snell' &&
                String(proxy.version) === '4'
            ) {
                return false;
            }
            return true;
        });
        return (
            'proxies:\n' +
            proxies
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
                        // https://dreamacro.github.io/clash/configuration/outbound.html#vmess
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

                    delete proxy['tls-fingerprint'];
                    return '  - ' + JSON.stringify(proxy) + '\n';
                })
                .join('')
        );
    };
    return { type, produce };
}
