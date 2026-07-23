import { Result, isPresent } from './utils';
import { isNotBlank } from '@/utils';
// import $ from '@/core/app';

const targetPlatform = 'Surfboard';

function sanitizeProfileName(name) {
    return `${name}`.replace(/=|,|\r|\n/g, '').trim() || 'Proxy';
}

function cleanProfileValue(value) {
    if (value == null) return value;
    return `${value}`.replace(/[\r\n]/g, '');
}

function wantsSurfboardFragment(opts = {}) {
    return Boolean(
        opts.fragment ||
            opts.proxyOnly ||
            opts['proxy-only'] ||
            opts.proxiesOnly ||
            opts['proxies-only'],
    );
}

function buildSurfboardProfile(lines, opts = {}) {
    const proxyNames = lines
        .map((line) => line.split('=')[0]?.trim())
        .filter((name) => isNotBlank(name));
    const proxyGroup = opts['proxy-group'] || opts.proxyGroup || '节点选择';
    const autoGroup = opts['auto-group'] || opts.autoGroup || '自动选择';
    const fallbackGroup = opts['fallback-group'] || opts.fallbackGroup || '故障转移';
    const testUrl = opts['test-url'] || opts.testUrl || 'http://www.gstatic.com/generate_204';
    const groupMembers = proxyNames.length ? proxyNames.join(', ') : 'DIRECT';

    return [
        '[General]',
        'dns-server = system, 8.8.8.8, 8.8.4.4',
        `proxy-test-url = ${testUrl}`,
        'test-timeout = 5',
        'ipv6 = false',
        '',
        '[Proxy]',
        ...lines,
        '',
        '[Proxy Group]',
        `${proxyGroup} = select, ${autoGroup}, DIRECT, REJECT${proxyNames.length ? `, ${groupMembers}` : ''}`,
        `${autoGroup} = url-test, ${groupMembers}, url=${testUrl}, interval=600, tolerance=100, timeout=5`,
        `${fallbackGroup} = fallback, ${groupMembers}, url=${testUrl}, interval=600, timeout=5`,
        '',
        '[Rule]',
        'IP-CIDR,127.0.0.0/8,DIRECT',
        'IP-CIDR,10.0.0.0/8,DIRECT',
        'IP-CIDR,172.16.0.0/12,DIRECT',
        'IP-CIDR,192.168.0.0/16,DIRECT',
        'GEOIP,CN,DIRECT',
        `FINAL,${proxyGroup}`,
    ].join('\n');
}

function hasNonBlankValue(value) {
    return value != null && `${value}`.trim().length > 0;
}

function appendTlsProxyParams(result, proxy, enabled = true) {
    if (!enabled) {
        return;
    }

    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${cleanProfileValue(proxy['tls-fingerprint'])}`,
        'tls-fingerprint',
    );
    result.appendIfPresent(`,sni=${cleanProfileValue(proxy.sni)}`, 'sni');
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
        proxy.name = sanitizeProfileName(proxy.name);
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
    const produceAll = (proxies, type, opts = {}) => {
        const lines = proxies
            .map((proxy) => {
                try {
                    return produce(proxy, type, opts);
                } catch (err) {
                    return '';
                }
            })
            .filter((line) => line.length > 0);
        if (type === 'internal') return lines;
        if (wantsSurfboardFragment(opts)) return lines.join('\n');
        if (lines.length === 0) return '';
        return buildSurfboardProfile(lines, opts);
    };
    return { type: 'SINGLE', produce, produceAll };
}
function tuic(proxy) {
    if (proxy.token?.length) {
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type ${proxy.type} v4`,
        );
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=tuic-v5,${cleanProfileValue(proxy.server)},${proxy.port}`);
    result.appendIfPresent(`,uuid=${cleanProfileValue(proxy.uuid)}`, 'uuid');
    result.appendIfPresent(`,password="${cleanProfileValue(proxy.password)}"`, 'password');
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
    result.append(`${proxy.name}=hysteria2,${cleanProfileValue(proxy.server)},${proxy.port}`);

    result.appendIfPresent(`,password="${cleanProfileValue(proxy.password)}"`, 'password');

    if (hasNonBlankValue(proxy.ports)) {
        result.append(
            `,port-hopping="${String(proxy.ports).replace(/,/g, ';')}"`,
        );
    }

    if (hasNonBlankValue(proxy['hop-interval'])) {
        result.append(`,port-hopping-interval=${proxy['hop-interval']}`);
    }

    if (proxy['obfs-password']) {
        result.append(`,salamander-password="${cleanProfileValue(proxy['obfs-password'])}"`);
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
    result.append(`${proxy.name}=${proxy.type},${cleanProfileValue(proxy.server)},${proxy.port}`);
    if (isPresent(proxy, 'password')) {
        result.append(`,${cleanProfileValue(proxy.password)}`);
    }

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
    result.append(`${proxy.name}=${proxy.type},${cleanProfileValue(proxy.server)},${proxy.port}`);
    result.appendIfPresent(`,version=${proxy.version}`, 'version');
    result.appendIfPresent(`,psk="${cleanProfileValue(proxy.psk)}"`, 'psk');

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
    result.append(`${proxy.name}=${proxy.type},${cleanProfileValue(proxy.server)},${proxy.port}`);
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
    result.appendIfPresent(`,password="${cleanProfileValue(proxy.password)}"`, 'password');

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
    result.append(`${proxy.name}=${proxy.type},${cleanProfileValue(proxy.server)},${proxy.port}`);
    result.appendIfPresent(`,password=${cleanProfileValue(proxy.password)}`, 'password');

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
    result.append(`${proxy.name}=${proxy.type},${cleanProfileValue(proxy.server)},${proxy.port}`);
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
    result.append(`${proxy.name}=${type},${cleanProfileValue(proxy.server)},${proxy.port}`);
    result.appendIfPresent(`,${cleanProfileValue(proxy.username)}`, 'username');
    result.appendIfPresent(`,${cleanProfileValue(proxy.password)}`, 'password');

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
    result.append(`${proxy.name}=${type},${cleanProfileValue(proxy.server)},${proxy.port}`);
    result.appendIfPresent(`,${cleanProfileValue(proxy.username)}`, 'username');
    result.appendIfPresent(`,${cleanProfileValue(proxy.password)}`, 'password');

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
            const wsOpts = proxy['ws-opts'] || {};
            result.append(`,ws-path=${cleanProfileValue(wsOpts.path || '/')}`);
            if (isPresent(proxy, 'ws-opts.headers')) {
                const headers = proxy['ws-opts'].headers;
                const value = Object.keys(headers)
                    .map((k) => {
                        const v = headers[k];
                        if (Array.isArray(v)) {
                            return `${cleanProfileValue(k)}:${v.map(cleanProfileValue).join(',')}`;
                        }
                        return `${cleanProfileValue(k)}:${cleanProfileValue(v)}`;
                    })
                    .join('|');
                if (isNotBlank(value)) {
                    result.append(`,ws-headers=${value}`);
                }
            }
        } else if (['tcp'].includes(proxy.network) && proxy['reality-opts']) {
            throw new Error(`reality is unsupported`);
        } else if (!['tcp'].includes(proxy.network)) {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }
}
