export default function Egern_Producer() {
    const type = 'ALL';
    const produce = (proxies, type, opts = {}) => {
        // https://egernapp.com/zh-CN/docs/configuration/proxies
        const list = proxies
            .filter((proxy) => {
                // if (opts['include-unsupported-proxy']) return true;
                if (
                    ![
                        'http',
                        'socks5',
                        'ss',
                        'trojan',
                        'hysteria2',
                        'vless',
                        'vmess',
                    ].includes(proxy.type) ||
                    (proxy.type === 'ss' &&
                        ((proxy.plugin === 'obfs' &&
                            !['http', 'tls'].includes(
                                proxy['plugin-opts']?.mode,
                            )) ||
                            ![
                                'chacha20-ietf-poly1305',
                                'chacha20-poly1305',
                                'aes-256-gcm',
                                'aes-128-gcm',
                                'none',
                                'tbale',
                                'rc4',
                                'rc4-md5',
                                'aes-128-cfb',
                                'aes-192-cfb',
                                'aes-256-cfb',
                                'aes-128-ctr',
                                'aes-192-ctr',
                                'aes-256-ctr',
                                'bf-cfb',
                                'camellia-128-cfb',
                                'camellia-192-cfb',
                                'camellia-256-cfb',
                                'cast5-cfb',
                                'des-cfb',
                                'idea-cfb',
                                'rc2-cfb',
                                'seed-cfb',
                                'salsa20',
                                'chacha20',
                                'chacha20-ietf',
                                ...(opts['include-unsupported-proxy']
                                    ? [
                                          '2022-blake3-aes-128-gcm',
                                          '2022-blake3-aes-256-gcm',
                                      ]
                                    : []),
                            ].includes(proxy.cipher))) ||
                    (proxy.type === 'vmess' &&
                        (![
                            'auto',
                            'aes-128-gcm',
                            'chacha20-poly1305',
                            'none',
                            'zero',
                        ].includes(proxy.cipher) ||
                            (!['http', 'ws', 'tcp'].includes(proxy.network) &&
                                proxy.network))) ||
                    (proxy.type === 'trojan' &&
                        !['http', 'ws', 'tcp'].includes(proxy.network) &&
                        proxy.network) ||
                    (proxy.type === 'vless' &&
                        (typeof proxy.flow !== 'undefined' ||
                            proxy['reality-opts'] ||
                            (!['http', 'ws', 'tcp'].includes(proxy.network) &&
                                proxy.network)))
                ) {
                    return false;
                }
                return true;
            })
            .map((proxy) => {
                if (proxy.tls && !proxy.sni) {
                    proxy.sni = proxy.server;
                }
                const prev_hop =
                    proxy.prev_hop ||
                    proxy['underlying-proxy'] ||
                    proxy['dialer-proxy'] ||
                    proxy.detour;

                if (proxy.type === 'http') {
                    proxy = {
                        type: 'http',
                        name: proxy.name,
                        server: proxy.server,
                        port: proxy.port,
                        username: proxy.username,
                        password: proxy.password,
                        tfo: proxy.tfo || proxy['fast-open'],
                        next_hop: proxy.next_hop,
                    };
                } else if (proxy.type === 'socks5') {
                    proxy = {
                        type: 'socks5',
                        name: proxy.name,
                        server: proxy.server,
                        port: proxy.port,
                        username: proxy.username,
                        password: proxy.password,
                        tfo: proxy.tfo || proxy['fast-open'],
                        udp_relay:
                            proxy.udp || proxy.udp_relay || proxy.udp_relay,
                        next_hop: proxy.next_hop,
                    };
                } else if (proxy.type === 'ss') {
                    proxy = {
                        type: 'shadowsocks',
                        name: proxy.name,
                        method:
                            proxy.cipher === 'chacha20-ietf-poly1305'
                                ? 'chacha20-poly1305'
                                : proxy.cipher,
                        server: proxy.server,
                        port: proxy.port,
                        password: proxy.password,
                        tfo: proxy.tfo || proxy['fast-open'],
                        udp_relay:
                            proxy.udp || proxy.udp_relay || proxy.udp_relay,
                        next_hop: proxy.next_hop,
                    };
                    if (proxy.plugin === 'obfs') {
                        proxy.obfs = proxy['plugin-opts'].mode;
                        proxy.obfs_host = proxy['plugin-opts'].host;
                        proxy.obfs_uri = proxy['plugin-opts'].path;
                    }
                } else if (proxy.type === 'hysteria2') {
                    proxy = {
                        type: 'hysteria2',
                        name: proxy.name,
                        server: proxy.server,
                        port: proxy.port,
                        auth: proxy.password,
                        tfo: proxy.tfo || proxy['fast-open'],
                        udp_relay:
                            proxy.udp || proxy.udp_relay || proxy.udp_relay,
                        next_hop: proxy.next_hop,
                        sni: proxy.sni,
                        skip_tls_verify: proxy['skip-cert-verify'],
                        port_hopping: proxy.ports,
                        port_hopping_interval: proxy['hop-interval'],
                    };
                    if (proxy['obfs-password'] && proxy.obfs == 'salamander') {
                        proxy.obfs = 'salamander';
                        proxy.obfs_password = proxy['obfs-password'];
                    }
                } else if (proxy.type === 'trojan') {
                    if (proxy.network === 'ws') {
                        proxy.websocket = {
                            path: proxy['ws-opts']?.path,
                            host: proxy['ws-opts']?.headers?.Host,
                        };
                    }
                    proxy = {
                        type: 'trojan',
                        name: proxy.name,
                        server: proxy.server,
                        port: proxy.port,
                        password: proxy.password,
                        tfo: proxy.tfo || proxy['fast-open'],
                        udp_relay:
                            proxy.udp || proxy.udp_relay || proxy.udp_relay,
                        next_hop: proxy.next_hop,
                        sni: proxy.sni,
                        skip_tls_verify: proxy['skip-cert-verify'],
                        websocket: proxy.websocket,
                    };
                } else if (proxy.type === 'vmess') {
                    if (proxy.network === 'ws') {
                        proxy.transport = {
                            [proxy.tls ? 'wss' : 'ws']: {
                                path: proxy['ws-opts']?.path,
                                headers: {
                                    Host: proxy['ws-opts']?.headers?.Host,
                                },
                                sni: proxy.tls ? proxy.sni : undefined,
                                skip_tls_verify: proxy.tls
                                    ? proxy['skip-cert-verify']
                                    : undefined,
                            },
                        };
                    } else if (proxy.network === 'http') {
                        proxy.transport = {
                            http: {
                                method: proxy['http-opts']?.method,
                                path: proxy['http-opts']?.path,
                                headers: {
                                    Host: Array.isArray(
                                        proxy['http-opts']?.headers?.Host,
                                    )
                                        ? proxy['http-opts']?.headers?.Host[0]
                                        : proxy['http-opts']?.headers?.Host,
                                },
                                skip_tls_verify: proxy['skip-cert-verify'],
                            },
                        };
                    } else if (proxy.network === 'tcp' || !proxy.network) {
                        proxy.transport = {
                            [proxy.tls ? 'tls' : 'tcp']: {
                                sni: proxy.tls ? proxy.sni : undefined,
                                skip_tls_verify: proxy.tls
                                    ? proxy['skip-cert-verify']
                                    : undefined,
                            },
                        };
                    }
                    proxy = {
                        type: 'vmess',
                        name: proxy.name,
                        server: proxy.server,
                        port: proxy.port,
                        user_id: proxy.uuid,
                        security: proxy.cipher,
                        tfo: proxy.tfo || proxy['fast-open'],
                        legacy: proxy.legacy,
                        udp_relay:
                            proxy.udp || proxy.udp_relay || proxy.udp_relay,
                        next_hop: proxy.next_hop,
                        transport: proxy.transport,
                        // sni: proxy.sni,
                        // skip_tls_verify: proxy['skip-cert-verify'],
                    };
                } else if (proxy.type === 'vless') {
                    if (proxy.network === 'ws') {
                        proxy.transport = {
                            [proxy.tls ? 'wss' : 'ws']: {
                                path: proxy['ws-opts']?.path,
                                headers: {
                                    Host: proxy['ws-opts']?.headers?.Host,
                                },
                                sni: proxy.tls ? proxy.sni : undefined,
                                skip_tls_verify: proxy.tls
                                    ? proxy['skip-cert-verify']
                                    : undefined,
                            },
                        };
                    } else if (proxy.network === 'http') {
                        proxy.transport = {
                            http: {
                                method: proxy['http-opts']?.method,
                                path: proxy['http-opts']?.path,
                                headers: {
                                    Host: Array.isArray(
                                        proxy['http-opts']?.headers?.Host,
                                    )
                                        ? proxy['http-opts']?.headers?.Host[0]
                                        : proxy['http-opts']?.headers?.Host,
                                },
                                skip_tls_verify: proxy['skip-cert-verify'],
                            },
                        };
                    } else if (proxy.network === 'tcp' || !proxy.network) {
                        proxy.transport = {
                            [proxy.tls ? 'tls' : 'tcp']: {
                                sni: proxy.tls ? proxy.sni : undefined,
                                skip_tls_verify: proxy.tls
                                    ? proxy['skip-cert-verify']
                                    : undefined,
                            },
                        };
                    }
                    proxy = {
                        type: 'vless',
                        name: proxy.name,
                        server: proxy.server,
                        port: proxy.port,
                        user_id: proxy.uuid,
                        security: proxy.cipher,
                        tfo: proxy.tfo || proxy['fast-open'],
                        legacy: proxy.legacy,
                        udp_relay:
                            proxy.udp || proxy.udp_relay || proxy.udp_relay,
                        next_hop: proxy.next_hop,
                        transport: proxy.transport,
                        // sni: proxy.sni,
                        // skip_tls_verify: proxy['skip-cert-verify'],
                    };
                }

                delete proxy.subName;
                delete proxy.collectionName;
                delete proxy.id;
                delete proxy.resolved;
                delete proxy['no-resolve'];
                if (type !== 'internal') {
                    for (const key in proxy) {
                        if (proxy[key] == null || /^_/i.test(key)) {
                            delete proxy[key];
                        }
                    }
                }
                return {
                    [proxy.type]: {
                        ...proxy,
                        type: undefined,
                        prev_hop,
                    },
                };
            });
        return type === 'internal'
            ? list
            : 'proxies:\n' +
                  list
                      .map((proxy) => '  - ' + JSON.stringify(proxy) + '\n')
                      .join('');
    };
    return { type, produce };
}
