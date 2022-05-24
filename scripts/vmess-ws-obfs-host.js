function operator(proxies) {
    const host = $arguments.host;
    proxies.forEach(p => {
        if (p.type === 'vmess') {
            p["ws-opts"]["headers"]["Host"] = host;
        }
    });
    return proxies;
}