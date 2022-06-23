import { Result, isPresent } from './utils';
import { isNotBlank } from '@/utils';
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

    // transport
    handleTransport(result, proxy);

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

    // transport
    handleTransport(result, proxy);

    // AEAD
    if (isPresent(proxy, 'aead')) {
        result.append(`,vmess-aead=${proxy.aead}`);
    } else {
        result.append(`,vmess-aead=${proxy.alterId === 0}`);
    }

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
    const type = proxy.tls ? 'socks5-tls' : 'socks5';
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

function handleTransport(result, proxy) {
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,ws=true`);
            if (isPresent(proxy, 'ws-opts')) {
                result.appendIfPresent(
                    `,ws-path=${proxy['ws-opts'].path}`,
                    'ws-opts.path',
                );
                if (isPresent(proxy, 'ws-opts.headers')) {
                    const headers = proxy['ws-opts'].headers;
                    const value = Object.keys(headers)
                        .map((k) => `${k}:${headers[k]}`)
                        .join('|');
                    if (isNotBlank(value)) {
                        result.append(`,ws-headers=${value}`);
                    }
                }
            }
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }
}
