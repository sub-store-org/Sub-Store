import { Result, isPresent } from './utils';
import $ from '@/core/app';

const targetPlatform = 'Surge';

export default function Surge_Producer() {
    const produce = (proxy) => {
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy);
            case 'http':
                return http(proxy);
            case 'socks5':
                return socks5(proxy);
            case 'snell':
                return snell(proxy);
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}

function shadowsocks(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.append(`,encrypt-method=${proxy.cipher}`);
    result.appendIfPresent(`,password=${proxy.password}`, 'password');

    // obfs
    if (isPresent(proxy, 'plugin')) {
        if (proxy.plugin === 'obfs') {
            result.append(`,obfs=${proxy['plugin-opts'].mode}`);
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
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
    return result.toString();
}

function trojan(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,password=${proxy.password}`, 'password');

    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,ws=true`);
            result.appendIfPresent(
                `,ws-path=${proxy['ws-opts'].path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,ws-headers=Host:${proxy['ws-opts'].headers.Host}`,
                'ws-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is not supported`);
        }
    }

    // tls
    result.appendIfPresent(`,tls=${proxy.tls}`, 'tls');

    // tls fingerprint
    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );

    // tls verification
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');
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

function vmess(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username=${proxy.uuid}`, 'uuid');

    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,ws=true`);
            result.appendIfPresent(
                `,ws-path=${proxy['ws-opts'].path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,ws-headers=Host:${proxy['ws-opts'].headers.Host}`,
                'ws-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }

    // AEAD
    result.appendIfPresent(`,vmess-aead=${proxy.alterId === 0}`, 'alterId');

    // tls fingerprint
    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );

    // tls
    result.appendIfPresent(`,tls=${proxy.tls}`, 'tls');

    // tls verification
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');
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

function http(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'https' : 'http';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,${proxy.password}`, 'password');

    // tls fingerprint
    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );

    // tls verification
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');
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

function socks5(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'socks5' : 'socks5-tls';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,${proxy.password}`, 'password');

    // tls fingerprint
    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );

    // tls verification
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // tfo
    if (proxy.tfo) {
        $.info(`Option tfo is not supported by Surge, thus omitted`);
    }

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
    return result.toString();
}

function snell(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,version=${proxy.version}`, 'version');
    result.appendIfPresent(`,psk=${proxy.psk}`, 'psk');

    // obfs
    result.appendIfPresent(
        `,obfs=${proxy['obfs-opts'].mode}`,
        'obfs-opts.mode',
    );
    result.appendIfPresent(
        `,obfs-host=${proxy['obfs-opts'].host}`,
        'obfs-opts.host',
    );
    result.appendIfPresent(
        `,obfs-uri=${proxy['obfs-opts'].path}`,
        'obfs-opts.path',
    );

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
    return result.toString();
}
