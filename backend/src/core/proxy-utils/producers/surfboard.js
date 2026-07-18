import { Result, isPresent } from './utils';
import { isNotBlank } from '@/utils';
// import $ from '@/core/app';

const targetPlatform = 'Surfboard';

function hasNonBlankValue(value) {
    return value != null && `${value}`.trim().length > 0;
}

function appendTlsProxyParams(result, proxy, enabled = true) {
    if (!enabled) {
        return;
    }

    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${proxy['tls-fingerprint']}`,
        'tls-fingerprint',
    );
    result.appendIfPresent(`,sni="${proxy.sni}"`, 'sni');
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );
}

export default function Surfboard_Producer() {
    const produce = (proxy) => {
        if (
            ['ws'].includes(proxy.network) &&
            proxy['ws-opts']?.['v2ray-http-upgrade']
        ) {
            throw new Error(
                `Platform ${targetPlatform} does not support network ${proxy.network} with http upgrade`,
            );
        }
        proxy.name = proxy.name.replace(/=|,/g, '');
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy);
            case 'http':
                return http(proxy);
            case 'snell':
                return snell(proxy);
            case 'tuic':
                return tuic(proxy);
            case 'socks5':
                return socks5(proxy);
            case 'hysteria2':
                return hysteria2(proxy);
            case 'wireguard-surge':
                return wireguard(proxy);
        }
        if (proxy.type === 'anytls') {
            if (
                proxy.network &&
                (!['tcp'].includes(proxy.network) ||
                    (['tcp'].includes(proxy.network) && proxy['reality-opts']))
            ) {
                throw new Error(
                    `Platform ${targetPlatform} does not support proxy type ${proxy.type} with network or REALITY`,
                );
            }

            return anytls(proxy);
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}
function tuic(proxy) {
    if (proxy.token?.length) {
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type ${proxy.type} v4`,
        );
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=tuic-v5,${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,uuid=${proxy.uuid}`, 'uuid');
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');
    if (hasNonBlankValue(proxy.alpn)) {
        result.append(
            `,alpn="${
                Array.isArray(proxy.alpn) ? proxy.alpn.join(',') : proxy.alpn
            }"`,
        );
    }
    if (hasNonBlankValue(proxy.ports)) {
        result.append(
            `,port-hopping="${String(proxy.ports).replace(/,/g, ';')}"`,
        );
    }
    if (hasNonBlankValue(proxy['hop-interval'])) {
        result.append(`,port-hopping-interval=${proxy['hop-interval']}`);
    }
    appendTlsProxyParams(result, proxy);
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
    return result.toString();
}
function hysteria2(proxy) {
    if (
        (proxy.obfs && proxy.obfs !== 'salamander') ||
        (proxy['obfs-password'] && proxy.obfs !== 'salamander')
    ) {
        throw new Error(`Surfboard Hysteria2 only supports salamander obfs`);
    }

    const result = new Result(proxy);
    result.append(`${proxy.name}=hysteria2,${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    if (hasNonBlankValue(proxy.ports)) {
        result.append(
            `,port-hopping="${String(proxy.ports).replace(/,/g, ';')}"`,
        );
    }

    if (hasNonBlankValue(proxy['hop-interval'])) {
        result.append(`,port-hopping-interval=${proxy['hop-interval']}`);
    }

    if (proxy['obfs-password']) {
        result.append(`,salamander-password="${proxy['obfs-password']}"`);
    }

    // tls verification
    appendTlsProxyParams(result, proxy);

    // download-bandwidth
    result.appendIfPresent(
        `,download-bandwidth=${`${proxy['down']}`.match(/\d+/)?.[0] || 0}`,
        'down',
    );

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    return result.toString();
}
function anytls(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    // tls verification
    appendTlsProxyParams(result, proxy);

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // reuse
    result.appendIfPresent(`,reuse=${proxy['reuse']}`, 'reuse');

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    return result.toString();
}
function snell(proxy) {
    if (
        isPresent(proxy, 'version') &&
        ![1, 2, 3, 4, 5].includes(Number(proxy.version))
    ) {
        throw new Error(
            `Platform ${targetPlatform} does not support snell version ${proxy.version}`,
        );
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,version=${proxy.version}`, 'version');
    result.appendIfPresent(`,psk="${proxy.psk}"`, 'psk');

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
    if (proxy.version >= 3) {
        result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
    }

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    return result.toString();
}
function shadowsocks(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
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
            'salsa20',
            'chacha20',
            'chacha20-ietf',
            '2022-blake3-aes-128-gcm',
            '2022-blake3-aes-256-gcm',
        ].includes(proxy.cipher)
    ) {
        throw new Error(`cipher ${proxy.cipher} is not supported`);
    }
    result.append(`,encrypt-method=${proxy.cipher}`);
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

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

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

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

    // tls verification
    appendTlsProxyParams(result, proxy);

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

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

    // tls
    result.appendIfPresent(`,tls=${proxy.tls}`, 'tls');

    // tls verification
    appendTlsProxyParams(result, proxy, Boolean(proxy.tls));

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    return result.toString();
}

function http(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'https' : 'http';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,${proxy.password}`, 'password');

    // tls verification
    appendTlsProxyParams(result, proxy, Boolean(proxy.tls));

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    return result.toString();
}

function socks5(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'socks5-tls' : 'socks5';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,${proxy.password}`, 'password');

    // tls verification
    appendTlsProxyParams(result, proxy, Boolean(proxy.tls));

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    return result.toString();
}

function wireguard(proxy) {
    const result = new Result(proxy);

    result.append(`${proxy.name}=wireguard`);

    result.appendIfPresent(
        `,section-name=${proxy['section-name']}`,
        'section-name',
    );

    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

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
        } else if (['tcp'].includes(proxy.network) && proxy['reality-opts']) {
            throw new Error(`reality is unsupported`);
        } else if (!['tcp'].includes(proxy.network)) {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }
}
