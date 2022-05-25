/**
 * 为节点添加 tls 证书指纹
 */
function operator(proxies, targetPlatform) {
    const {fingerprint} = $arguments;
    proxies.forEach(proxy => {
        if (targetPlatform === "Surge") {
            proxy.tfo = `${proxy.tfo || false}, server-cert-fingerprint-sha256=${fingerprint}`;
        } else if (targetPlatform === "QX") {
            proxy.tfo = `${proxy.tfo || false}, tls-cert-sha256=${fingerprint}`;
        }
    });
    return proxies;
}