/* eslint-disable no-case-declarations */

export default function Surge_Producer() {
    const targetPlatform = 'Surge';
    const produce = (proxy) => {
        let result = '';
        let obfs_opts, tls_opts;
        switch (proxy.type) {
            case 'ss':
                obfs_opts = '';
                if (proxy.plugin) {
                    const { host, mode } = proxy['plugin-opts'];
                    if (proxy.plugin === 'obfs') {
                        obfs_opts = `,obfs=${mode}${
                            host ? ',obfs-host=' + host : ''
                        }`;
                    } else {
                        throw new Error(
                            `Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`,
                        );
                    }
                }
                result = `${proxy.name}=ss,${proxy.server}, ${
                    proxy.port
                },encrypt-method=${proxy.cipher},password=${
                    proxy.password
                }${obfs_opts},tfo=${proxy.tfo || 'false'},udp-relay=${
                    proxy.udp || 'false'
                }`;
                break;
            case 'vmess':
                tls_opts = '';
                result = `${proxy.name}=vmess,${proxy.server},${
                    proxy.port
                },username=${proxy.uuid},tls=${proxy.tls || 'false'},tfo=${
                    proxy.tfo || 'false'
                }`;

                if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                if (typeof proxy['vmess-aead'] !== 'undefined') {
                    result += `,vmess-aead=${proxy['vmess-aead']}`;
                }
                if (proxy.network === 'ws') {
                    const path = proxy['ws-opts'].path || '/';
                    const wsHeaders = Object.entries(proxy['ws-opts'].headers)
                        .map(([key, value]) => `${key}:"${value}"`)
                        .join('|');
                    result += `,ws=true${path ? ',ws-path=' + path : ''}${
                        wsHeaders ? ',ws-headers=' + wsHeaders : ''
                    }`;
                }
                if (proxy.tls) {
                    result += `${
                        typeof proxy['skip-cert-verify'] !== 'undefined'
                            ? ',skip-cert-verify=' + proxy['skip-cert-verify']
                            : ''
                    }`;
                    result += proxy.sni ? `,sni=${proxy.sni}` : '';
                }
                break;
            case 'trojan':
                result = `${proxy.name}=trojan,${proxy.server},${
                    proxy.port
                },password=${proxy.password}${
                    typeof proxy['skip-cert-verify'] !== 'undefined'
                        ? ',skip-cert-verify=' + proxy['skip-cert-verify']
                        : ''
                }${proxy.sni ? ',sni=' + proxy.sni : ''},tfo=${
                    proxy.tfo || 'false'
                },udp-relay=${proxy.udp || 'false'}`;
                break;
            case 'http':
                if (proxy.tls) {
                    tls_opts = `,skip-cert-verify=${proxy['skip-cert-verify']},sni=${proxy.sni}`;
                }
                result = `${proxy.name}=${proxy.tls ? 'https' : 'http'},${
                    proxy.server
                },${proxy.port}${
                    proxy.username ? ',username=' + proxy.username : ''
                }${
                    proxy.password ? ',password=' + proxy.password : ''
                }${tls_opts},tfo=${proxy.tfo || 'false'}`;
                break;
            default:
                throw new Error(
                    `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
                );
        }

        // handle surge hybrid param
        result +=
            proxy['surge-hybrid'] !== undefined
                ? `,hybrid=${proxy['surge-hybrid']}`
                : '';
        return result;
    };
    return { produce };
}
