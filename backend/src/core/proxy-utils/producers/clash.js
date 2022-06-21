export default function Clash_Producer() {
    const type = 'ALL';
    const produce = (proxies) => {
        proxies.filter((proxy) => {
            if (proxy.type === 'vless') return false;
            return true;
        });
        return (
            'proxies:\n' +
            proxies
                .map((proxy) => {
                    delete proxy['tls-fingerprint'];
                    delete proxy['aead'];
                    return '  - ' + JSON.stringify(proxy) + '\n';
                })
                .join('')
        );
    };
    return { type, produce };
}
