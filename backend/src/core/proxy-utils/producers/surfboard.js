import _ from 'lodash';
import {
    Result,
    isPresent,
    quoteProxyValue,
    supportsVlessTransportSecurity,
} from './utils';
import { isNotBlank } from '@/utils';
import { SURGE_XHTTP_FIELDS } from '../surge-xhttp';
import {
    VMESS_SECURITY_AUTO,
    formatSurgeVmessEncryptMethod,
} from '../vmess-security';
// import $ from '@/core/app';

const targetPlatform = 'Surfboard';

function hasNonBlankValue(value) {
    return value != null && `${value}`.trim().length > 0;
}

function appendTlsProxyParams(result, proxy, enabled = true) {
    if (!enabled) {
        return;
    }

    const fingerprint = String(proxy['tls-fingerprint']);
    result.appendIfPresent(
        `,server-cert-fingerprint-sha256=${
            fingerprint.includes(',')
                ? quoteProxyValue(fingerprint)
                : fingerprint
        }`,
        'tls-fingerprint',
    );
    result.appendIfPresent(`,sni=${quoteProxyValue(proxy.sni)}`, 'sni');
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );
}

export default function Surfboard_Producer() {
    const produce = (proxy) => {
        if (
            proxy.type !== 'vless' &&
            proxy.network === 'ws' &&
            proxy['ws-opts']?.['v2ray-http-upgrade']
        ) {
            throw new Error(
                `Platform ${targetPlatform} does not support network ${proxy.network} with http upgrade`,
            );
        }
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy);
            case 'vless':
                return vless(proxy);
            case 'http':
                return http(proxy);
            case 'h2-connect':
                return h2Connect(proxy);
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
        (proxy.obfs || proxy['obfs-password']) &&
        !['salamander', 'gecko'].includes(proxy.obfs)
    ) {
        throw new Error(
            'Surfboard Hysteria2 supports Salamander and Gecko obfs',
        );
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
        result.append(
            `,${proxy.obfs}-password=${quoteProxyValue(
                proxy['obfs-password'],
            )}`,
        );
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
    const cipher = String(proxy.cipher ?? '')
        .trim()
        .toLowerCase();
    const encryptMethod = formatSurgeVmessEncryptMethod(cipher);
    if (cipher && cipher !== VMESS_SECURITY_AUTO && !encryptMethod) {
        throw new Error(`Surfboard does not support VMess cipher ${cipher}`);
    }

    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username=${proxy.uuid}`, 'uuid');
    if (encryptMethod) result.append(`,encrypt-method=${encryptMethod}`);

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

function vless(proxy) {
    if (!hasNonBlankValue(proxy.uuid)) {
        throw new Error('VLESS username is missing');
    }
    if (
        proxy.flow &&
        !['xtls-rprx-vision', 'xtls-rprx-vision-udp443'].includes(proxy.flow)
    ) {
        throw new Error('Unsupported VLESS flow');
    }
    if (!supportsVlessTransportSecurity(proxy)) {
        throw new Error('Unsupported VLESS transport, TLS or flow combination');
    }

    const result = new Result(proxy);
    result.append(`${proxy.name}=vless,${proxy.server},${proxy.port}`);
    const append = (key, value) => {
        if (value == null) return;
        const text = String(value);
        const param =
            !text || /[,;"'\s\\]/.test(text) ? quoteProxyValue(text) : text;
        result.append(`,${key}=${param}`);
    };
    append('username', proxy.uuid);

    const network = proxy.network ?? 'tcp';
    if (network === 'ws') {
        const ws = proxy['ws-opts'];
        append('ws', true);
        if (ws?.['v2ray-http-upgrade']) append('ws-http-upgrade', true);
        append('ws-path', ws?.path);
        append(
            'ws-headers',
            formatVlessHeaders(Object.entries(ws?.headers ?? {})),
        );
    } else if (network === 'grpc') {
        const grpc = proxy['grpc-opts'];
        append('grpc', true);
        append('grpc-service-name', grpc?.['grpc-service-name']);
        append('grpc-mode', grpc?.['_grpc-type']);
        append('grpc-authority', grpc?.['_grpc-authority']);
    } else if (network === 'xhttp') {
        const xhttp = proxy['xhttp-opts'];
        if (xhttp?.['download-settings']) {
            throw new Error('VLESS XHTTP download-settings are unsupported');
        }

        append('xhttp', true);
        const headers = Object.entries(xhttp?.headers ?? {});
        const host =
            xhttp?.host ?? headers.find(([key]) => /^host$/i.test(key))?.[1];
        for (const [key, field] of Object.entries(SURGE_XHTTP_FIELDS)) {
            append(`xhttp-${key}`, key === 'host' ? host : _.get(xhttp, field));
        }
        append(
            'xhttp-headers',
            formatVlessHeaders(headers.filter(([key]) => !/^host$/i.test(key))),
        );
    } else if (!['tcp', 'raw', 'none'].includes(network)) {
        throw new Error(`VLESS network ${network} is unsupported`);
    }

    if (proxy.flow) append('flow', proxy.flow);
    if (proxy.encryption) append('encryption', proxy.encryption);
    const reality = proxy['reality-opts'];
    if (reality) {
        append('reality-public-key', reality['public-key']);
        append('reality-short-id', reality['short-id']);
    } else {
        append('tls', proxy.tls);
        if (proxy.tls) {
            append('server-cert-fingerprint-sha256', proxy['tls-fingerprint']);
            append('server-cert-verify-name', proxy['name-cert-verify']);
            append('skip-cert-verify', proxy['skip-cert-verify']);
        }
    }
    if (proxy.tls || reality) {
        append('sni', proxy.sni);
        if (hasNonBlankValue(proxy.alpn)) append('alpn', proxy.alpn);
    }
    append('udp-relay', proxy.udp);
    append('block-quic', proxy['block-quic']);
    append('underlying-proxy', proxy['underlying-proxy']);

    const line = result.toString();
    if (/[\r\n]/.test(line))
        throw new Error('VLESS proxy contains a line break');
    return line;
}

function formatVlessHeaders(headers) {
    const entries = [];
    for (const [key, value] of headers) {
        if (value == null) continue;
        const text = String(value);
        if (key.includes('|') || text.includes('|')) {
            throw new Error('VLESS header names and values cannot contain "|"');
        }
        entries.push(`${key}:${text}`);
    }
    return entries.join('|') || undefined;
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

function h2Connect(proxy) {
    if (proxy.plugin) {
        throw new Error('Surfboard HTTP/2 CONNECT does not support plugins');
    }
    if ((proxy.username == null) !== (proxy.password == null)) {
        throw new Error(
            'HTTP/2 CONNECT authentication requires both username and password',
        );
    }

    const result = new Result(proxy);
    result.append(`${proxy.name}=h2-connect,${proxy.server},${proxy.port}`);
    result.appendIfPresent(
        `,username=${quoteProxyValue(proxy.username)}`,
        'username',
    );
    result.appendIfPresent(
        `,password=${quoteProxyValue(proxy.password)}`,
        'password',
    );

    const headers = Object.entries(proxy.headers ?? {})
        .filter(([, value]) => value != null)
        .map(([key, value]) => {
            if (
                !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) ||
                // HTAB is allowed within HTTP field values.
                // eslint-disable-next-line no-control-regex
                /[;\x00-\x08\x0a-\x1f\x7f]/.test(String(value))
            ) {
                throw new Error('Invalid HTTP/2 CONNECT header name or value');
            }
            return `${key}:${value}`;
        });
    if (headers.length) {
        result.append(`,headers=${quoteProxyValue(headers.join(';'))}`);
    }

    if (isPresent(proxy, 'max-streams')) {
        const maxStreams = Number(String(proxy['max-streams']));
        if (!Number.isSafeInteger(maxStreams) || maxStreams < 1) {
            throw new Error(
                'HTTP/2 CONNECT max-streams must be a positive integer',
            );
        }
        result.append(`,max-streams=${maxStreams}`);
    }
    appendTlsProxyParams(result, proxy);
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
    if (['auto', 'on', 'off'].includes(proxy['block-quic'])) {
        result.append(`,block-quic=${proxy['block-quic']}`);
    }
    result.appendIfPresent(
        `,underlying-proxy=${quoteProxyValue(proxy['underlying-proxy'])}`,
        'underlying-proxy',
    );

    const line = result.toString();
    if (/[\r\n]/.test(line)) {
        throw new Error('HTTP/2 CONNECT proxy contains a line break');
    }
    return line;
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
