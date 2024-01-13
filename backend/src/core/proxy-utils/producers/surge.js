import { Result, isPresent } from './utils';
import { isNotBlank } from '@/utils';
import $ from '@/core/app';

const targetPlatform = 'Surge';

const ipVersions = {
    dual: 'dual',
    ipv4: 'v4-only',
    ipv6: 'v6-only',
    'ipv4-prefer': 'prefer-v4',
    'ipv6-prefer': 'prefer-v6',
};

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
            case 'tuic':
                return tuic(proxy);
            case 'wireguard-surge':
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
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.append(`,encrypt-method=${proxy.cipher}`);
    result.appendIfPresent(`,password=${proxy.password}`, 'password');

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

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

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    return result.toString();
}

function trojan(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,password=${proxy.password}`, 'password');

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

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

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    return result.toString();
}

function vmess(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username=${proxy.uuid}`, 'uuid');

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

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

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    return result.toString();
}

function http(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'https' : 'http';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,${proxy.password}`, 'password');

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

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

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    return result.toString();
}

function socks5(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'socks5-tls' : 'socks5';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,${proxy.password}`, 'password');

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

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

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    return result.toString();
}

function snell(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,version=${proxy.version}`, 'version');
    result.appendIfPresent(`,psk=${proxy.psk}`, 'psk');

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    // obfs
    result.appendIfPresent(
        `,obfs=${proxy['obfs-opts']?.mode}`,
        'obfs-opts.mode',
    );
    result.appendIfPresent(
        `,obfs-host=${proxy['obfs-opts']?.host}`,
        'obfs-opts.host',
    );
    result.appendIfPresent(
        `,obfs-uri=${proxy['obfs-opts']?.path}`,
        'obfs-opts.path',
    );

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    // reuse
    result.appendIfPresent(`,reuse=${proxy['reuse']}`, 'reuse');

    return result.toString();
}

function tuic(proxy) {
    const result = new Result(proxy);
    // https://github.com/MetaCubeX/Clash.Meta/blob/Alpha/adapter/outbound/tuic.go#L197
    let type = proxy.type;
    if (!proxy.token || proxy.token.length === 0) {
        type = 'tuic-v5';
    }
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,uuid=${proxy.uuid}`, 'uuid');
    result.appendIfPresent(`,password=${proxy.password}`, 'password');
    result.appendIfPresent(`,token=${proxy.token}`, 'token');

    result.appendIfPresent(
        `,alpn=${Array.isArray(proxy.alpn) ? proxy.alpn[0] : proxy.alpn}`,
        'alpn',
    );

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    // tls verification
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // tls fingerprint
    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );

    // tfo
    if (isPresent(proxy, 'tfo')) {
        result.append(`,tfo=${proxy['tfo']}`);
    } else if (isPresent(proxy, 'fast-open')) {
        result.append(`,tfo=${proxy['fast-open']}`);
    }

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    result.appendIfPresent(`,ecn=${proxy.ecn}`, 'ecn');

    return result.toString();
}

function wireguard(proxy) {
    const result = new Result(proxy);

    result.append(`${proxy.name}=wireguard`);

    result.appendIfPresent(
        `,section-name=${proxy['section-name']}`,
        'section-name',
    );
    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    return result.toString();
}

function hysteria2(proxy) {
    if (proxy.obfs || proxy['obfs-password']) {
        throw new Error(`obfs is unsupported`);
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=hysteria2,${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,password=${proxy.password}`, 'password');

    result.appendIfPresent(
        `,ip-version=${ipVersions[proxy['ip-version']] || proxy['ip-version']}`,
        'ip-version',
    );

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    // tls verification
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );
    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );

    // tfo
    if (isPresent(proxy, 'tfo')) {
        result.append(`,tfo=${proxy['tfo']}`);
    } else if (isPresent(proxy, 'fast-open')) {
        result.append(`,tfo=${proxy['fast-open']}`);
    }

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

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
    }

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    // underlying-proxy
    result.appendIfPresent(
        `,underlying-proxy=${proxy['underlying-proxy']}`,
        'underlying-proxy',
    );

    // download-bandwidth
    result.appendIfPresent(
        `,download-bandwidth=${`${proxy['down']}`.match(/\d+/)?.[0] || 0}`,
        'down',
    );

    result.appendIfPresent(`,ecn=${proxy.ecn}`, 'ecn');

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
                        .map((k) => {
                            let v = headers[k];
                            if (['Host'].includes(k)) {
                                v = `"${v}"`;
                            }
                            return `${k}:${v}`;
                        })
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
