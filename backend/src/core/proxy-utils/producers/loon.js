/* eslint-disable no-case-declarations */
const targetPlatform = 'Loon';
import { isPresent, Result } from './utils';
import { isIPv4, isIPv6 } from '@/utils';

export default function Loon_Producer() {
    const produce = (proxy) => {
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy);
            case 'ssr':
                return shadowsocksr(proxy);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy);
            case 'vless':
                return vless(proxy);
            case 'http':
                return http(proxy);
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

function shadowsocks(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"`,
    );

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
        } else {
            throw new Error(`plugin ${proxy.plugin} is not supported`);
        }
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');

    return result.toString();
}

function shadowsocksr(proxy) {
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

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');

    return result.toString();
}

function trojan(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=trojan,${proxy.server},${proxy.port},"${proxy.password}"`,
    );

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

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');

    return result.toString();
}

function vmess(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=vmess,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.uuid}"`,
    );

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

    // AEAD
    if (isPresent(proxy, 'aead')) {
        result.append(`,alterId=0`);
    } else {
        result.append(`,alterId=${proxy.alterId}`);
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');
    return result.toString();
}

function vless(proxy) {
    if (proxy['reality-opts']) {
        throw new Error(`reality is unsupported`);
    }
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=vless,${proxy.server},${proxy.port},"${proxy.uuid}"`,
    );

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

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');
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

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
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
            proxy.dns = proxy.dns.find((i) => isIPv4(i));
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

    return result.toString();
}

function hysteria2(proxy) {
    if (proxy.obfs || proxy['obfs-password']) {
        throw new Error(`obfs is unsupported`);
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=Hysteria2,${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');

    // download-bandwidth
    result.appendIfPresent(
        `,download-bandwidth=${`${proxy['down']}`.match(/\d+/)?.[0] || 0}`,
        'down',
    );

    result.appendIfPresent(`,ecn=${proxy.ecn}`, 'ecn');

    return result.toString();
}
