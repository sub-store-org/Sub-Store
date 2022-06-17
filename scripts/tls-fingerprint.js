/**
 * 为节点添加 tls 证书指纹
 * 示例
 * #fingerprint=...
 */
function operator(proxies) {
    const { fingerprint } = $arguments;
    proxies.forEach(proxy => {
        proxy['tls-fingerprint'] = fingerprint;
    });
    return proxies;
}