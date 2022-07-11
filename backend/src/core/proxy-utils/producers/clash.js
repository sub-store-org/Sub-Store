import { isPresent } from '@/core/proxy-utils/producers/utils';

export default function Clash_Producer() {
    const type = 'ALL';
    const produce = (proxies) => {
        // filter unsupported proxies
        proxies = proxies.filter((proxy) =>
            ['ss', 'ssr', 'vmess', 'socks', 'http', 'snell', 'trojan'].includes(
                proxy.type,
            ),
        );
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
                    }

                    delete proxy['tls-fingerprint'];
                    return '  - ' + JSON.stringify(proxy) + '\n';
                })
                .join('')
        );
    };
    return { type, produce };
}
