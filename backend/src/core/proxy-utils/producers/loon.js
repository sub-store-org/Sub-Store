/* eslint-disable no-case-declarations */
const targetPlatform = 'Loon';
import { isPresent, Result } from './utils';
import { isIPv4, isIPv6 } from '@/utils';

const ipVersions = {
    dual: 'dual',
    ipv4: 'v4-only',
    ipv6: 'v6-only',
    'ipv4-prefer': 'prefer-v4',
    'ipv6-prefer': 'prefer-v6',
};

export default function Loon_Producer() {
    const produce = (proxy, type, opts = {}) => {
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy, opts['include-unsupported-proxy']);
            case 'ssr':
                return shadowsocksr(proxy, opts['include-unsupported-proxy']);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy);
            case 'vless':
                return vless(proxy);
            case 'http':
                return http(proxy);
            case 'socks5':
                return socks5(proxy);
            case 'wireguard':
                return wireguard(proxy);
            case 'hysteria2':
                return hysteria2(proxy);
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}

function shadowsocks(proxy, includeUnsupportedProxy) {
    const result = new Result(proxy);
    if (
        ![
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
            'salsa20',
            'chacha20',
            'chacha20-ietf',
            'aes-128-gcm',
            'aes-192-gcm',
            'aes-256-gcm',
            'chacha20-ietf-poly1305',
            'xchacha20-ietf-poly1305',
            '2022-blake3-aes-128-gcm',
            '2022-blake3-aes-256-gcm',
        ].includes(proxy.cipher)
    ) {
        throw new Error(`cipher ${proxy.cipher} is not supported`);
    }
    result.append(
        `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"`,
    );

    let isShadowTLS;

    // obfs
    if (isPresent(proxy, 'plugin')) {
        if (proxy.plugin === 'obfs') {
            result.append(`,obfs-name=${proxy['plugin-opts'].mode}`);
            result.appendIfPresent(
                `,obfs-host=${proxy['plugin-opts'].host}`,
                'plugin-opts.host',
            );
            result.appendIfPresent(
                `,obfs-uri=${proxy['plugin-opts'].path}`,
                'plugin-opts.path',
            );
        } else if (!['shadow-tls'].includes(proxy.plugin)) {
            throw new Error(`plugin ${proxy.plugin} is not supported`);
        }
    }

    // shadow-tls
    if (isPresent(proxy, 'shadow-tls-password')) {
        result.append(`,shadow-tls-password=${proxy['shadow-tls-password']}`);

        result.appendIfPresent(
            `,shadow-tls-version=${proxy['shadow-tls-version']}`,
            'shadow-tls-version',
        );
        result.appendIfPresent(
            `,shadow-tls-sni=${proxy['shadow-tls-sni']}`,
            'shadow-tls-sni',
        );
        // udp-port
        result.appendIfPresent(`,udp-port=${proxy['udp-port']}`, 'udp-port');
        isShadowTLS = true;
    } else if (['shadow-tls'].includes(proxy.plugin) && proxy['plugin-opts']) {
        const password = proxy['plugin-opts'].password;
        const host = proxy['plugin-opts'].host;
        const version = proxy['plugin-opts'].version;
        if (password) {
            result.append(`,shadow-tls-password=${password}`);
            if (host) {
                result.append(`,shadow-tls-sni=${host}`);
            }
            if (version) {
                if (version < 2) {
                    throw new Error(
                        `shadow-tls version ${version} is not supported`,
                    );
                }
                result.append(`,shadow-tls-version=${version}`);
            }
            // udp-port
            result.appendIfPresent(
                `,udp-port=${proxy['udp-port']}`,
                'udp-port',
            );
            isShadowTLS = true;
        }
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }

    if (!includeUnsupportedProxy && isShadowTLS) {
        throw new Error(
            `shadow-tls is not supported(请使用 includeUnsupportedProxy 参数)`,
        );
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function shadowsocksr(proxy, includeUnsupportedProxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=shadowsocksr,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"`,
    );

    // ssr protocol
    result.append(`,protocol=${proxy.protocol}`);
    result.appendIfPresent(
        `,protocol-param=${proxy['protocol-param']}`,
        'protocol-param',
    );

    // obfs
    result.appendIfPresent(`,obfs=${proxy.obfs}`, 'obfs');
    result.appendIfPresent(`,obfs-param=${proxy['obfs-param']}`, 'obfs-param');

    let isShadowTLS;

    // shadow-tls
    if (isPresent(proxy, 'shadow-tls-password')) {
        result.append(`,shadow-tls-password=${proxy['shadow-tls-password']}`);

        result.appendIfPresent(
            `,shadow-tls-version=${proxy['shadow-tls-version']}`,
            'shadow-tls-version',
        );
        result.appendIfPresent(
            `,shadow-tls-sni=${proxy['shadow-tls-sni']}`,
            'shadow-tls-sni',
        );
        // udp-port
        result.appendIfPresent(`,udp-port=${proxy['udp-port']}`, 'udp-port');
        isShadowTLS = true;
    } else if (['shadow-tls'].includes(proxy.plugin) && proxy['plugin-opts']) {
        const password = proxy['plugin-opts'].password;
        const host = proxy['plugin-opts'].host;
        const version = proxy['plugin-opts'].version;
        if (password) {
            result.append(`,shadow-tls-password=${password}`);
            if (host) {
                result.append(`,shadow-tls-sni=${host}`);
            }
            if (version) {
                if (version < 2) {
                    throw new Error(
                        `shadow-tls version ${version} is not supported`,
                    );
                }
                result.append(`,shadow-tls-version=${version}`);
            }
            // udp-port
            result.appendIfPresent(
                `,udp-port=${proxy['udp-port']}`,
                'udp-port',
            );
            isShadowTLS = true;
        }
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }

    if (!includeUnsupportedProxy && isShadowTLS) {
        throw new Error(
            `shadow-tls is not supported(请使用 includeUnsupportedProxy 参数)`,
        );
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function trojan(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=trojan,${proxy.server},${proxy.port},"${proxy.password}"`,
    );
    if (proxy.network === 'tcp') {
        delete proxy.network;
    }
    // transport
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,transport=ws`);
            result.appendIfPresent(
                `,path=${proxy['ws-opts']?.path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['ws-opts']?.headers?.Host}`,
                'ws-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );
    result.appendIfPresent(
        `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
        'tls-pubkey-sha256',
    );

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function vmess(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=vmess,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.uuid}"`,
    );
    if (proxy.network === 'tcp') {
        delete proxy.network;
    }
    // transport
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,transport=ws`);
            result.appendIfPresent(
                `,path=${proxy['ws-opts']?.path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['ws-opts']?.headers?.Host}`,
                'ws-opts.headers.Host',
            );
        } else if (proxy.network === 'http') {
            result.append(`,transport=http`);
            let httpPath = proxy['http-opts']?.path;
            let httpHost = proxy['http-opts']?.headers?.Host;
            result.appendIfPresent(
                `,path=${Array.isArray(httpPath) ? httpPath[0] : httpPath}`,
                'http-opts.path',
            );
            result.appendIfPresent(
                `,host=${Array.isArray(httpHost) ? httpHost[0] : httpHost}`,
                'http-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    } else {
        result.append(`,transport=tcp`);
    }

    // tls
    result.appendIfPresent(`,over-tls=${proxy.tls}`, 'tls');

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );
    result.appendIfPresent(
        `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
        'tls-pubkey-sha256',
    );

    // AEAD
    if (isPresent(proxy, 'aead')) {
        result.append(`,alterId=0`);
    } else {
        result.append(`,alterId=${proxy.alterId}`);
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
        const ip_version =
            ipVersions[proxy['ip-version']] || proxy['ip-version'];
        result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');
    }
    return result.toString();
}

function vless(proxy) {
    if (typeof proxy.flow !== 'undefined' || proxy['reality-opts']) {
        throw new Error(`VLESS XTLS/REALITY is not supported`);
    }
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=vless,${proxy.server},${proxy.port},"${proxy.uuid}"`,
    );
    if (proxy.network === 'tcp') {
        delete proxy.network;
    }
    // transport
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,transport=ws`);
            result.appendIfPresent(
                `,path=${proxy['ws-opts']?.path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['ws-opts']?.headers?.Host}`,
                'ws-opts.headers.Host',
            );
        } else if (proxy.network === 'http') {
            result.append(`,transport=http`);
            let httpPath = proxy['http-opts']?.path;
            let httpHost = proxy['http-opts']?.headers?.Host;
            result.appendIfPresent(
                `,path=${Array.isArray(httpPath) ? httpPath[0] : httpPath}`,
                'http-opts.path',
            );
            result.appendIfPresent(
                `,host=${Array.isArray(httpHost) ? httpHost[0] : httpHost}`,
                'http-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    } else {
        result.append(`,transport=tcp`);
    }

    // tls
    result.appendIfPresent(`,over-tls=${proxy.tls}`, 'tls');

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );
    result.appendIfPresent(
        `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
        'tls-pubkey-sha256',
    );

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
        const ip_version =
            ipVersions[proxy['ip-version']] || proxy['ip-version'];
        result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');
    }
    return result.toString();
}

function http(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'https' : 'http';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    // sni
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}
function socks5(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=socks5,${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    // tls
    result.appendIfPresent(`,over-tls=${proxy.tls}`, 'tls');

    // sni
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function wireguard(proxy) {
    if (Array.isArray(proxy.peers) && proxy.peers.length > 0) {
        proxy.server = proxy.peers[0].server;
        proxy.port = proxy.peers[0].port;
        proxy.ip = proxy.peers[0].ip;
        proxy.ipv6 = proxy.peers[0].ipv6;
        proxy['public-key'] = proxy.peers[0]['public-key'];
        proxy['preshared-key'] = proxy.peers[0]['pre-shared-key'];
        // https://github.com/MetaCubeX/mihomo/blob/0404e35be8736b695eae018a08debb175c1f96e6/docs/config.yaml#L717
        proxy['allowed-ips'] = proxy.peers[0]['allowed-ips'];
        proxy.reserved = proxy.peers[0].reserved;
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=wireguard`);

    result.appendIfPresent(`,interface-ip=${proxy.ip}`, 'ip');
    result.appendIfPresent(`,interface-ipv6=${proxy.ipv6}`, 'ipv6');

    result.appendIfPresent(
        `,private-key="${proxy['private-key']}"`,
        'private-key',
    );
    result.appendIfPresent(`,mtu=${proxy.mtu}`, 'mtu');

    if (proxy.dns) {
        if (Array.isArray(proxy.dns)) {
            proxy.dnsv6 = proxy.dns.find((i) => isIPv6(i));
            let dns = proxy.dns.find((i) => isIPv4(i));
            if (!dns) {
                dns = proxy.dns.find((i) => !isIPv4(i) && !isIPv6(i));
            }
            proxy.dns = dns;
        }
    }
    result.appendIfPresent(`,dns=${proxy.dns}`, 'dns');
    result.appendIfPresent(`,dnsv6=${proxy.dnsv6}`, 'dnsv6');
    result.appendIfPresent(
        `,keepalive=${proxy['persistent-keepalive']}`,
        'persistent-keepalive',
    );
    result.appendIfPresent(`,keepalive=${proxy.keepalive}`, 'keepalive');
    const allowedIps = Array.isArray(proxy['allowed-ips'])
        ? proxy['allowed-ips'].join(',')
        : proxy['allowed-ips'];
    let reserved = Array.isArray(proxy.reserved)
        ? proxy.reserved.join(',')
        : proxy.reserved;
    if (reserved) {
        reserved = `,reserved=[${reserved}]`;
    }
    let presharedKey = proxy['preshared-key'] ?? proxy['pre-shared-key'];
    if (presharedKey) {
        presharedKey = `,preshared-key="${presharedKey}"`;
    }
    result.append(
        `,peers=[{public-key="${proxy['public-key']}",allowed-ips="${
            allowedIps ?? '0.0.0.0/0,::/0'
        }",endpoint=${proxy.server}:${proxy.port}${reserved ?? ''}${
            presharedKey ?? ''
        }}]`,
    );
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function hysteria2(proxy) {
    if (proxy['obfs-password'] && proxy.obfs != 'salamander') {
        throw new Error(`only salamander obfs is supported`);
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=Hysteria2,${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );
    result.appendIfPresent(
        `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
        'tls-pubkey-sha256',
    );
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    if (proxy['obfs-password'] && proxy.obfs == 'salamander') {
        result.append(`,salamander-password=${proxy['obfs-password']}`);
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }

    // download-bandwidth
    result.appendIfPresent(
        `,download-bandwidth=${`${proxy['down']}`.match(/\d+/)?.[0] || 0}`,
        'down',
    );

    result.appendIfPresent(`,ecn=${proxy.ecn}`, 'ecn');
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}
