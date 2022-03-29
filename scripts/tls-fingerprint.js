function operator(proxies) {
    const fingerprint = "你的指纹";
    proxies.forEach(proxy => {
        if ($.env.isSurge) {
            proxy.tfo = `${proxy.tfo || false}, server-cert-fingerprint-sha256=${fingerprint}`;
        } else if ($.env.isQX) {
            proxy.tfo = `${proxy.tfo || false}, tls-cert-sha256=${fingerprint}`;
        }
    });
    return proxies;
}