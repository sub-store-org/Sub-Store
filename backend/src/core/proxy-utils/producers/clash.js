export default function Clash_Producer() {
    const type = 'ALL';
    const produce = (proxies) => {
        return (
            'proxies:\n' +
            proxies
                .map((proxy) => {
                    delete proxy.supported;
                    return '  - ' + JSON.stringify(proxy) + '\n';
                })
                .join('')
        );
    };
    return { type, produce };
}
