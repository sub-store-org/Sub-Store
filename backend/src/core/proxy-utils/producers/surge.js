import { Result, isPresent } from './utils';
import { isNotBlank, getIfNotBlank } from '@/utils';
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
    const produce = (proxy, type, opts = {}) => {
        proxy.name = proxy.name.replace(/=|,/g, '');
        if (proxy.ports) {
            proxy.ports = String(proxy.ports);
        }
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy, opts['include-unsupported-proxy']);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy, opts['include-unsupported-proxy']);
            case 'http':
                return http(proxy);
            case 'direct':
                return direct(proxy);
            case 'socks5':
                return socks5(proxy);
            case 'snell':
                return snell(proxy);
            case 'tuic':
                return tuic(proxy);
            case 'wireguard-surge':
                return wireguard_surge(proxy);
            case 'hysteria2':
                return hysteria2(proxy);
            case 'ssh':
                return ssh(proxy);
        }

        if (opts['include-unsupported-proxy'] && proxy.type === 'wireguard') {
            return wireguard(proxy);
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
    if (!proxy.cipher) {
        proxy.cipher = 'none';
    }
    if (
        ![
            'aes-128-gcm',
            'aes-192-gcm',
            'aes-256-gcm',
            'chacha20-ietf-poly1305',
            'xchacha20-ietf-poly1305',
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
            'none',
            '2022-blake3-aes-128-gcm',
            '2022-blake3-aes-256-gcm',
        ].includes(proxy.cipher)
    ) {
        throw new Error(`cipher ${proxy.cipher} is not supported`);
    }
    result.append(`,encrypt-method=${proxy.cipher}`);
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

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
        } else if (!['shadow-tls'].includes(proxy.plugin)) {
            throw new Error(`plugin ${proxy.plugin} is not supported`);
        }
    }

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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
        }
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
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

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
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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

function vmess(proxy, includeUnsupportedProxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username=${proxy.uuid}`, 'uuid');

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    // transport
    handleTransport(result, proxy, includeUnsupportedProxy);

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
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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

function ssh(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=ssh,${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    // 所有的类似的字段都有双引号的问题 暂不处理
    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    // https://manual.nssurge.com/policy/ssh.html
    // 需配合 Keystore
    result.appendIfPresent(
        `,private-key=${proxy['keystore-private-key']}`,
        'keystore-private-key',
    );
    result.appendIfPresent(
        `,idle-timeout=${proxy['idle-timeout']}`,
        'idle-timeout',
    );
    result.appendIfPresent(
        `,server-fingerprint="${proxy['server-fingerprint']}"`,
        'server-fingerprint',
    );

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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
    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

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
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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
function direct(proxy) {
    const result = new Result(proxy);
    const type = 'direct';
    result.append(`${proxy.name}=${type}`);

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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
    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

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
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

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
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');
    result.appendIfPresent(`,token=${proxy.token}`, 'token');

    result.appendIfPresent(
        `,alpn=${Array.isArray(proxy.alpn) ? proxy.alpn[0] : proxy.alpn}`,
        'alpn',
    );

    if (isPresent(proxy, 'ports')) {
        result.append(`,port-hopping="${proxy.ports.replace(/,/g, ';')}"`);
    }

    result.appendIfPresent(
        `,port-hopping-interval=${proxy['hop-interval']}`,
        'hop-interval',
    );

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

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
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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

    result.append(`# > WireGuard Proxy ${proxy.name}
# ${proxy.name}=wireguard`);

    proxy['section-name'] = getIfNotBlank(proxy['section-name'], proxy.name);

    result.appendIfPresent(
        `,section-name=${proxy['section-name']}`,
        'section-name',
    );
    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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

    result.append(`
# > WireGuard Section ${proxy.name}
[WireGuard ${proxy['section-name']}]
private-key = ${proxy['private-key']}`);

    result.appendIfPresent(`\nself-ip = ${proxy.ip}`, 'ip');
    result.appendIfPresent(`\nself-ip-v6 = ${proxy.ipv6}`, 'ipv6');
    if (proxy.dns) {
        if (Array.isArray(proxy.dns)) {
            proxy.dns = proxy.dns.join(', ');
        }
        result.append(`\ndns-server = ${proxy.dns}`);
    }
    result.appendIfPresent(`\nmtu = ${proxy.mtu}`, 'mtu');

    if (ip_version === 'prefer-v6') {
        result.append(`\nprefer-ipv6 = true`);
    }
    const allowedIps = Array.isArray(proxy['allowed-ips'])
        ? proxy['allowed-ips'].join(',')
        : proxy['allowed-ips'];
    let reserved = Array.isArray(proxy.reserved)
        ? proxy.reserved.join('/')
        : proxy.reserved;
    let presharedKey = proxy['preshared-key'] ?? proxy['pre-shared-key'];
    if (presharedKey) {
        presharedKey = `,preshared-key="${presharedKey}"`;
    }
    const peer = {
        'public-key': proxy['public-key'],
        'allowed-ips': allowedIps ? `"${allowedIps}"` : undefined,
        endpoint: `${proxy.server}:${proxy.port}`,
        keepalive: proxy['persistent-keepalive'] || proxy.keepalive,
        'client-id': reserved,
        'preshared-key': presharedKey,
    };
    result.append(
        `\npeer = (${Object.keys(peer)
            .filter((k) => peer[k] != null)
            .map((k) => `${k} = ${peer[k]}`)
            .join(', ')})`,
    );
    return result.toString();
}
function wireguard_surge(proxy) {
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

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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

    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    if (isPresent(proxy, 'ports')) {
        result.append(`,port-hopping="${proxy.ports.replace(/,/g, ';')}"`);
    }

    result.appendIfPresent(
        `,port-hopping-interval=${proxy['hop-interval']}`,
        'hop-interval',
    );

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-version=${ip_version}`, 'ip-version');

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
    result.appendIfPresent(
        `,test-timeout=${proxy['test-timeout']}`,
        'test-timeout',
    );
    result.appendIfPresent(`,test-udp=${proxy['test-udp']}`, 'test-udp');
    result.appendIfPresent(`,hybrid=${proxy['hybrid']}`, 'hybrid');
    result.appendIfPresent(`,tos=${proxy['tos']}`, 'tos');
    result.appendIfPresent(
        `,allow-other-interface=${proxy['allow-other-interface']}`,
        'allow-other-interface',
    );
    result.appendIfPresent(
        `,interface=${proxy['interface-name']}`,
        'interface-name',
    );

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

function handleTransport(result, proxy, includeUnsupportedProxy) {
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
            if (includeUnsupportedProxy && ['http'].includes(proxy.network)) {
                $.info(
                    `Include Unsupported Proxy: nework ${proxy.network} -> tcp`,
                );
            } else {
                throw new Error(`network ${proxy.network} is unsupported`);
            }
        }
    }
}
