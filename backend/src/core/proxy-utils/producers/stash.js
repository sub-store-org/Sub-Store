import { isPresent } from '@/core/proxy-utils/producers/utils';

export default function Stash_Producer() {
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
                    } else if (proxy.type === 'tuic') {
                        if (isPresent(proxy, 'alpn')) {
                            proxy.alpn = Array.isArray(proxy.alpn)
                                ? proxy.alpn
                                : [proxy.alpn];
                        } else {
                            proxy.alpn = ['h3'];
                        }
                        // https://github.com/MetaCubeX/Clash.Meta/blob/Alpha/adapter/outbound/tuic.go#L197
                        if (
                            (!proxy.token || proxy.token.length === 0) &&
                            !isPresent(proxy, 'version')
                        ) {
                            proxy.version = 5;
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
