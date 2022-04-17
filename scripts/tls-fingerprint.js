function operator(proxies, targetPlatform) {
    const fingerprint = "你的指纹";
    proxies.forEach(proxy => {
        if (targetPlatform === "Surge") {
            proxy.tfo = `${proxy.tfo || false}, server-cert-fingerprint-sha256=${fingerprint}`;
        } else if (targetPlatform === "QX") {
            proxy.tfo = `${proxy.tfo || false}, tls-cert-sha256=${fingerprint}`;
        }
    });
    return proxies;
}