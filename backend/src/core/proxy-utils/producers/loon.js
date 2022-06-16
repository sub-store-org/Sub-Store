/* eslint-disable no-case-declarations */

export default function Loon_Producer() {
    const targetPlatform = 'Loon';
    const produce = (proxy) => {
        let obfs_opts = '',
            tls_opts = '',
            udp_opts = '',
            tfo_opts = '';
        if (typeof proxy.udp !== 'undefined') {
            udp_opts = proxy.udp ? ',udp=true' : ',udp=false';
        }
        tfo_opts = `,fast-open=${proxy.tfo || false}`;

        switch (proxy.type) {
            case 'ss':
                obfs_opts = ',,';
                if (proxy.plugin) {
                    if (proxy.plugin === 'obfs') {
                        const { mode, host } = proxy['plugin-opts'];
                        obfs_opts = `,${mode},${host || ''}`;
                    } else {
                        throw new Error(
                            `Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`,
                        );
                    }
                }
                return `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"${obfs_opts}${udp_opts}${tfo_opts}`;
            case 'ssr':
                return `${proxy.name}=shadowsocksr,${proxy.server},${
                    proxy.port
                },${proxy.cipher},"${proxy.password}",${proxy.protocol},{${
                    proxy['protocol-param'] || ''
                }},${proxy.obfs},{${
                    proxy['obfs-param'] || ''
                }}${udp_opts}${tfo_opts}`;
            case 'vmess':
                obfs_opts = '';
                if (proxy.network === 'ws') {
                    const host = proxy['ws-opts'].headers.Host || proxy.server;
                    obfs_opts = `,transport:ws,host:${host},path:${
                        proxy['ws-opts'].path || '/'
                    }`;
                } else {
                    obfs_opts = `,transport:tcp`;
                }
                if (proxy.tls) {
                    obfs_opts += `${
                        proxy.sni ? ',tls-name:' + proxy.sni : ''
                    },skip-cert-verify:${proxy['skip-cert-verify'] || 'false'}`;
                }
                let result = `${proxy.name}=vmess,${proxy.server},${
                    proxy.port
                },${proxy.cipher === 'auto' ? 'none' : proxy.cipher},"${
                    proxy.uuid
                }",over-tls:${proxy.tls || 'false'}${obfs_opts}`;
                if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                if (typeof proxy['vmess-aead'] !== 'undefined') {
                    result += `,vmess-aead=${proxy['vmess-aead']}`;
                }
                return result;
            case 'trojan':
                return `${proxy.name}=trojan,${proxy.server},${proxy.port},"${
                    proxy.password
                }"${
                    proxy.sni ? ',tls-name:' + proxy.sni : ''
                },skip-cert-verify:${
                    proxy['skip-cert-verify'] || 'false'
                }${udp_opts}`;
            case 'http':
                tls_opts = '';
                const base = `${proxy.name}=${proxy.tls ? 'http' : 'https'},${
                    proxy.server
                },${proxy.port},${proxy.username || ''},${
                    proxy.password || ''
                }`;
                if (proxy.tls) {
                    // https
                    tls_opts = `${
                        proxy.sni ? ',tls-name:' + proxy.sni : ''
                    },skip-cert-verify:${proxy['skip-cert-verify']}`;
                    return base + tls_opts;
                } else return base;
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}
