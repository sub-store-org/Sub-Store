/* eslint-disable no-case-declarations */
export default function QX_Producer() {
    const targetPlatform = 'QX';
    const produce = (proxy) => {
        let obfs_opts;
        let tls_opts;
        switch (proxy.type) {
            case 'ss':
                obfs_opts = '';
                if (proxy.plugin === 'obfs') {
                    const { host, mode } = proxy['plugin-opts'];
                    obfs_opts = `,obfs=${mode}${
                        host ? ',obfs-host=' + host : ''
                    }`;
                }
                if (proxy.plugin === 'v2ray-plugin') {
                    const { tls, host, path } = proxy['plugin-opts'];
                    obfs_opts = `,obfs=${tls ? 'wss' : 'ws'}${
                        host ? ',obfs-host=' + host : ''
                    }${path ? ',obfs-uri=' + path : ''}`;
                }
                return `shadowsocks=${proxy.server}:${proxy.port},method=${
                    proxy.cipher
                },password=${proxy.password}${obfs_opts}${
                    proxy.tfo ? ',fast-open=true' : ',fast-open=false'
                }${proxy.udp ? ',udp-relay=true' : ',udp-relay=false'},tag=${
                    proxy.name
                }`;
            case 'ssr':
                return `shadowsocks=${proxy.server}:${proxy.port},method=${
                    proxy.cipher
                },password=${proxy.password},ssr-protocol=${proxy.protocol}${
                    proxy['protocol-param']
                        ? ',ssr-protocol-param=' + proxy['protocol-param']
                        : ''
                }${proxy.obfs ? ',obfs=' + proxy.obfs : ''}${
                    proxy['obfs-param']
                        ? ',obfs-host=' + proxy['obfs-param']
                        : ''
                },fast-open=${proxy.tfo || false}${
                    proxy.udp ? ',udp-relay=true' : ',udp-relay=false'
                },tag=${proxy.name}`;
            case 'vmess':
                obfs_opts = '';
                if (proxy.network === 'ws') {
                    // websocket
                    if (proxy.tls) {
                        // ws-tls
                        obfs_opts = `,obfs=wss${
                            proxy.sni ? ',obfs-host=' + proxy.sni : ''
                        }${
                            proxy['ws-opts'].path
                                ? ',obfs-uri=' + proxy['ws-opts'].path
                                : ''
                        },tls-verification=${
                            proxy['skip-cert-verify'] ? 'false' : 'true'
                        }`;
                    } else {
                        // ws
                        obfs_opts = `,obfs=ws${
                            proxy['ws-opts'].headers.Host
                                ? ',obfs-host=' + proxy['ws-opts'].headers.Host
                                : ''
                        }${
                            proxy['ws-opts'].path
                                ? ',obfs-uri=' + proxy['ws-opts'].path
                                : ''
                        }`;
                    }
                } else {
                    // tcp
                    if (proxy.tls) {
                        obfs_opts = `,obfs=over-tls${
                            proxy.sni ? ',obfs-host=' + proxy.sni : ''
                        },tls-verification=${
                            proxy['skip-cert-verify'] ? 'false' : 'true'
                        }`;
                    }
                }
                let result = `vmess=${proxy.server}:${proxy.port},method=${
                    proxy.cipher === 'auto' ? 'none' : proxy.cipher
                },password=${proxy.uuid}${obfs_opts},fast-open=${
                    proxy.tfo || false
                }${proxy.udp ? ',udp-relay=true' : ',udp-relay=false'}`;
                if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                if (typeof proxy['vmess-aead'] !== 'undefined') {
                    result += `,aead=${proxy['vmess-aead']}`;
                }
                result += `,tag=${proxy.name}`;
                return result;
            case 'trojan':
                return `trojan=${proxy.server}:${proxy.port},password=${
                    proxy.password
                }${
                    proxy.sni ? ',tls-host=' + proxy.sni : ''
                },over-tls=true,tls-verification=${
                    proxy['skip-cert-verify'] ? 'false' : 'true'
                },fast-open=${proxy.tfo || false}${
                    proxy.udp ? ',udp-relay=true' : ',udp-relay=false'
                },tag=${proxy.name}`;
            case 'http':
                tls_opts = '';
                if (proxy.tls) {
                    tls_opts = `,over-tls=true,tls-verification=${
                        proxy['skip-cert-verify'] ? 'false' : 'true'
                    }${proxy.sni ? ',tls-host=' + proxy.sni : ''}`;
                }
                return `http=${proxy.server}:${proxy.port},username=${
                    proxy.username
                },password=${proxy.password}${tls_opts},fast-open=${
                    proxy.tfo || false
                },tag=${proxy.name}`;
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}
