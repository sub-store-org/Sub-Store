import _ from 'lodash';
import {
    Result,
    isPresent,
    normalizeWireGuardInterface,
    quoteProxyValue,
    supportsVlessTransportSecurity,
} from './utils';
import { isNotBlank, getIfNotBlank, isIPv6, isPlainObject } from '@/utils';
import $ from '@/core/app';
import { isMihomoEchEnabled, normalizeInlineEchConfigList } from '../ech-utils';
import { SURGE_XHTTP_FIELDS } from '../surge-xhttp';
import { formatSurgeVmessEncryptMethod } from '../vmess-security';

const targetPlatform = 'Surge';

export class SurgeUnsupportedProxyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SurgeUnsupportedProxyError';
    }
}

function unsupported(message) {
    return new SurgeUnsupportedProxyError(message);
}

const ipVersions = {
    dual: 'dual',
    ipv4: 'v4-only',
    ipv6: 'v6-only',
    'ipv4-prefer': 'prefer-v4',
    'ipv6-prefer': 'prefer-v6',
};

function stripSurgeQuotes(value) {
    if (typeof value !== 'string') return value;

    const trimmed = value.trim();
    const quote = trimmed[0];
    if (
        (quote === '"' || quote === "'") &&
        trimmed[trimmed.length - 1] === quote
    ) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function quoteSurgeValue(value) {
    const text = String(stripSurgeQuotes(value));
    return `"${text}"`;
}

function hasNonBlankValue(value) {
    return value != null && `${value}`.trim().length > 0;
}

export function appendSurgePolicyParameters(result, proxy) {
    const isDirect = proxy.type === 'direct';
    const supportsInterface = !['wireguard', 'wireguard-surge'].includes(
        proxy.type,
    );
    const ipVersion = proxy['ip-version'];
    const tos = stripSurgeQuotes(proxy.tos);
    if (
        tos != null &&
        (!/^(?:\d+|0x[\da-f]+)$/i.test(tos) || Number(tos) > 255)
    ) {
        throw new Error('Surge tos must be an integer between 0 and 255');
    }

    const parameters = {
        'ip-version': ipVersions[ipVersion] ?? ipVersion,
        'no-error-alert': isDirect ? undefined : proxy['no-error-alert'],
        tfo: proxy.tfo ?? proxy['fast-open'],
        'test-url': proxy['test-url'],
        'test-timeout': proxy['test-timeout'],
        'test-udp': proxy['test-udp'],
        hybrid: proxy.hybrid,
        tos,
        'allow-other-interface': supportsInterface
            ? proxy['allow-other-interface']
            : undefined,
        interface: supportsInterface
            ? proxy.interface ?? proxy['interface-name']
            : undefined,
        'dns-follow-interface': supportsInterface
            ? proxy['dns-follow-interface']
            : undefined,
        'block-quic': proxy['block-quic'],
        ecn: isDirect ? undefined : proxy.ecn,
        'underlying-proxy': isDirect ? undefined : proxy['underlying-proxy'],
    };

    for (const [key, value] of Object.entries(parameters)) {
        if (value == null) continue;
        const formatted =
            typeof value === 'string' && value.includes(',')
                ? quoteSurgeValue(value)
                : value;
        result.append(`,${key}=${formatted}`);
    }
}

function appendPortHopping(result, proxy) {
    if (hasNonBlankValue(proxy.ports)) {
        if (hasNonBlankValue(stripSurgeQuotes(proxy['underlying-proxy']))) {
            throw new Error(
                'Surge port-hopping cannot be combined with underlying-proxy',
            );
        }
        result.append(
            `,port-hopping="${String(proxy.ports).replace(/,/g, ';')}"`,
        );
    }
    if (hasNonBlankValue(proxy['hop-interval'])) {
        result.append(`,port-hopping-interval=${proxy['hop-interval']}`);
    }
}

function formatSurgeAlpn(alpn) {
    const values = Array.isArray(alpn)
        ? alpn
        : stripSurgeQuotes(`${alpn || ''}`).split(',');

    return values
        .filter((item) => item != null)
        .map((item) => String(stripSurgeQuotes(item)).trim())
        .filter((item) => item !== '')
        .join(',');
}

function appendAlpn(result, proxy) {
    const alpn = formatSurgeAlpn(proxy.alpn);
    if (alpn) result.append(`,alpn="${alpn}"`);
}

function appendClientFingerprint(result, proxy) {
    if (
        proxy.network === 'h3' ||
        ['tuic', 'hysteria2', 'masque-surge'].includes(proxy.type)
    ) {
        return;
    }

    const value =
        proxy._surge_client_fingerprint ?? proxy['client-fingerprint'];
    if (typeof value !== 'string') return;

    let fingerprint = value.trim().toLowerCase();
    if (!['auto', 'none', 'apple-26', 'chromium-155'].includes(fingerprint)) {
        const family = fingerprint
            .replace(/^hello/, '')
            .split(/[-_]/, 1)[0]
            .replace(/([a-z])\d+$/, '$1');
        if (['chrome', 'edge', 'android', '360', 'qq'].includes(family)) {
            fingerprint = 'chromium-155';
        } else if (['safari', 'ios'].includes(family)) {
            fingerprint = 'apple-26';
        } else if (
            [
                'firefox',
                'golang',
                'random',
                'randomized',
                'randomizedalpn',
                'randomizednoalpn',
            ].includes(family)
        ) {
            fingerprint = 'auto';
        } else {
            return;
        }
    }
    result.append(`,client-fingerprint=${fingerprint}`);
}

function getShadowTLSAlpn(proxy) {
    return formatSurgeAlpn(proxy?.['plugin-opts']?.alpn ?? proxy?.alpn);
}

function appendShadowTLS(result, proxy, includeUdpPort = false) {
    if (proxy.plugin !== 'shadow-tls' || !proxy['plugin-opts']) return;

    const password = proxy['plugin-opts'].password;
    const host = proxy['plugin-opts'].host;
    const version = proxy['plugin-opts'].version;
    if (!password) return;

    result.append(`,shadow-tls-password="${password}"`);
    if (host) result.append(`,shadow-tls-sni=${host}`);
    if (version) {
        if (version < 2) {
            throw unsupported(`shadow-tls version ${version} is not supported`);
        }
        result.append(`,shadow-tls-version=${version}`);
    }
    const alpn = getShadowTLSAlpn(proxy);
    if (alpn) result.append(`,alpn="${alpn}"`);
    if (includeUdpPort) {
        result.appendIfPresent(`,udp-port=${proxy['udp-port']}`, 'udp-port');
    }
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
        `,server-cert-verify-name=${quoteSurgeValue(
            proxy['name-cert-verify'],
        )}`,
        'name-cert-verify',
    );
    if (proxy.plugin !== 'shadow-tls') {
        appendAlpn(result, proxy);
    }
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );
    const clientCert = isPresent(proxy, 'keystore-client-cert')
        ? proxy['keystore-client-cert']
        : proxy['client-cert'];
    if (
        isPresent(proxy, 'keystore-client-cert') ||
        isPresent(proxy, 'client-cert')
    ) {
        result.append(`,client-cert=${quoteSurgeValue(clientCert)}`);
    }
    appendClientFingerprint(result, proxy);

    const echOpts = isPlainObject(proxy['ech-opts'])
        ? proxy['ech-opts']
        : undefined;
    const echEnabled = echOpts
        ? isMihomoEchEnabled(echOpts.enable)
        : isNotBlank(proxy._echConfigList);
    if (echEnabled && !proxy['reality-opts']) {
        const config = normalizeInlineEchConfigList(
            echOpts ? echOpts.config : proxy._echConfigList,
        );
        if (!config) {
            throw unsupported(
                'Surge ECH requires an inline ECHConfigList in base64 or base64url',
            );
        }
        result.append(`,ech-config=${config}`);
    }
}

function appendSshPrivateKey(result, proxy) {
    const privateKey = isPresent(proxy, 'keystore-private-key')
        ? proxy['keystore-private-key']
        : proxy['private-key'];
    if (
        isPresent(proxy, 'keystore-private-key') ||
        isPresent(proxy, 'private-key')
    ) {
        result.append(`,private-key=${quoteSurgeValue(privateKey)}`);
    }
}

function warnMaxStreamsIfNeeded(proxy) {
    if (!isPresent(proxy, 'max-streams')) return;

    const maxStreams = Number(stripSurgeQuotes(proxy['max-streams']));
    if (!Number.isInteger(maxStreams) || maxStreams <= 3) return;

    $.warn(
        `Surge ${proxy.type} proxy ${proxy.name}: max-streams=${maxStreams} is greater than 3. Too many streams sharing one TCP connection may hurt performance.`,
    );
}

function hasSnellObfs(proxy) {
    return (
        isPresent(proxy, 'obfs-opts.mode') ||
        isPresent(proxy, 'obfs-opts.host') ||
        isPresent(proxy, 'obfs-opts.path')
    );
}

function isUnsupportedSnellV6Obfs(proxy) {
    return Number(proxy.version) === 6 && hasSnellObfs(proxy);
}

export default function Surge_Producer() {
    const produce = (proxy, type, opts = {}) => {
        if (
            proxy.network === 'ws' &&
            proxy['ws-opts']?.['v2ray-http-upgrade'] &&
            !['vmess', 'trojan', 'vless'].includes(proxy.type)
        ) {
            throw unsupported(
                `Platform ${targetPlatform} does not support network ${proxy.network} with http upgrade`,
            );
        }
        if (proxy.ports) {
            proxy.ports = String(proxy.ports);
        }
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
            case 'vless':
                return v2ray(proxy, opts['include-unsupported-proxy']);
            case 'http':
                return http(proxy);
            case 'h2-connect':
                return h2Connect(proxy);
            case 'direct':
                return direct(proxy);
            case 'socks5':
                return socks5(proxy);
            case 'snell':
                return snell(proxy);
            case 'tuic':
                return tuic(proxy);
            case 'wireguard-surge':
                return wireguardPolicy(proxy);
            case 'hysteria2':
                return hysteria2(proxy);
            case 'ssh':
                return ssh(proxy);
            case 'trusttunnel':
                return trusttunnel(proxy);
            case 'masque-surge':
                return masque_surge(proxy);
        }

        if (opts['include-unsupported-proxy'] && proxy.type === 'wireguard') {
            return wireguard(proxy);
        }
        if (proxy.type === 'anytls') {
            if (
                proxy.network &&
                (!['tcp'].includes(proxy.network) ||
                    (['tcp'].includes(proxy.network) && proxy['reality-opts']))
            ) {
                throw unsupported(
                    `Platform ${targetPlatform} does not support proxy type ${proxy.type} with network or REALITY`,
                );
            }

            return anytls(proxy);
        }
        throw unsupported(
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
    // TODO: Surge 5 5.102.0 (3792) removed unsupported legacy Shadowsocks ciphers including `bf-cfb`, `camellia-*-cfb`, `cast5-cfb`, `des-cfb`, `idea-cfb`, `rc2-cfb`, and `seed-cfb`
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
        throw unsupported(`cipher ${proxy.cipher} is not supported`);
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
        } else if (!['shadow-tls'].includes(proxy.plugin)) {
            throw unsupported(`plugin ${proxy.plugin} is not supported`);
        }
    }

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    appendShadowTLS(result, proxy, true);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function trojan(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    // transport
    handleTransport(result, proxy);

    // tls
    result.appendIfPresent(`,tls=${proxy.tls}`, 'tls');

    // tls verification
    appendTlsProxyParams(result, proxy);

    appendShadowTLS(result, proxy);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function anytls(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    // tls verification
    appendTlsProxyParams(result, proxy);

    // reuse
    result.appendIfPresent(`,reuse=${proxy['reuse']}`, 'reuse');

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}
function trusttunnel(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=trust-tunnel,${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username="${proxy.username}"`, 'username');
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');
    if (isPresent(proxy, 'client-random-auth-key')) {
        const key = stripSurgeQuotes(proxy['client-random-auth-key']);
        if (typeof key !== 'string' || !/^[0-9a-f]+$/i.test(key)) {
            throw new Error(
                'TrustTunnel client-random-auth-key must be a hex string',
            );
        }
        result.append(`,client-random-auth-key=${key}`);
    }
    appendHeaders(result, proxy);
    warnMaxStreamsIfNeeded(proxy);
    result.appendIfPresent(
        `,max-streams=${proxy['max-streams']}`,
        'max-streams',
    );
    if (proxy.network === 'h3') result.append(',h3=true');

    // tls verification
    appendTlsProxyParams(result, proxy);

    // reuse
    result.appendIfPresent(`,reuse=${proxy['reuse']}`, 'reuse');

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}
function masque_surge(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=masque,${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username="${proxy.username}"`, 'username');
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    appendPortHopping(result, proxy);

    appendTlsProxyParams(result, proxy);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}
function h2Connect(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=h2-connect,${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username="${proxy.username}"`, 'username');
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');
    appendHeaders(result, proxy);
    warnMaxStreamsIfNeeded(proxy);
    result.appendIfPresent(
        `,max-streams=${proxy['max-streams']}`,
        'max-streams',
    );

    appendTlsProxyParams(result, proxy);

    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    appendShadowTLS(result, proxy);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function v2ray(proxy, includeUnsupportedProxy) {
    const isVless = proxy.type === 'vless';
    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username=${proxy.uuid}`, 'uuid');
    if (!isVless) {
        const encryptMethod = formatSurgeVmessEncryptMethod(proxy.cipher);
        if (encryptMethod) {
            result.append(`,encrypt-method=${encryptMethod}`);
        }
    }

    if (isVless) {
        appendVlessParams(result, proxy);
    } else {
        handleTransport(result, proxy, includeUnsupportedProxy);
        const aead = isPresent(proxy, 'aead')
            ? proxy.aead
            : proxy.alterId === 0;
        result.append(`,vmess-aead=${aead}`);
        result.appendIfPresent(`,tls=${proxy.tls}`, 'tls');
        appendTlsProxyParams(result, proxy, Boolean(proxy.tls));
    }

    appendShadowTLS(result, proxy);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function appendVlessParams(result, proxy) {
    const network = proxy.network ?? 'tcp';
    const reality = proxy['reality-opts'];
    const tls = proxy.tls || reality;
    if (!['tcp', 'raw', 'none', 'ws', 'grpc', 'xhttp'].includes(network)) {
        throw unsupported(`VLESS network ${network} is unsupported`);
    }
    if (proxy.encryption && /[,\r\n"']/.test(proxy.encryption)) {
        throw unsupported('VLESS encryption contains unsupported characters');
    }
    if (!supportsVlessTransportSecurity(proxy)) {
        throw unsupported(
            'Unsupported VLESS transport, TLS or flow combination',
        );
    }

    if (network === 'ws') {
        handleTransport(result, proxy);
    } else if (network === 'grpc') {
        result.append(',grpc=true');
        const grpc = proxy['grpc-opts'];
        for (const [key, value] of [
            ['grpc-service-name', grpc?.['grpc-service-name']],
            ['grpc-mode', grpc?.['_grpc-type']],
            ['grpc-authority', grpc?.['_grpc-authority']],
        ]) {
            if (value) result.append(`,${key}=${value}`);
        }
    } else if (network === 'xhttp') {
        appendXhttpParams(result, proxy);
    }

    if (proxy.flow) result.append(`,flow=${proxy.flow}`);
    if (proxy.encryption) result.append(`,encryption=${proxy.encryption}`);
    if (reality) {
        result.append(`,reality-public-key=${reality['public-key']}`);
        if (reality['short-id']) {
            result.append(`,reality-short-id=${reality['short-id']}`);
        }
        result.appendIfPresent(`,sni="${proxy.sni}"`, 'sni');
        appendAlpn(result, proxy);
        appendClientFingerprint(result, proxy);
    } else {
        result.appendIfPresent(`,tls=${proxy.tls}`, 'tls');
        appendTlsProxyParams(result, proxy, Boolean(tls));
    }
}

function appendXhttpParams(result, proxy) {
    const xhttp = proxy['xhttp-opts'];
    // A single Surge policy cannot represent a separate XHTTP download transport.
    if (xhttp?.['download-settings']) {
        throw unsupported('VLESS XHTTP download-settings are unsupported');
    }

    result.append(',xhttp=true');
    const headers = isPlainObject(xhttp?.headers)
        ? Object.entries(xhttp.headers)
        : [];
    const host =
        xhttp?.host ?? headers.find(([key]) => /^host$/i.test(key))?.[1];
    for (const [key, field] of Object.entries(SURGE_XHTTP_FIELDS)) {
        const rawValue = key === 'host' ? host : _.get(xhttp, field);
        if (rawValue == null) continue;
        const rawText = String(rawValue);
        const value = stripSurgeQuotes(rawText);
        if (!value && key !== 'session-table') continue;
        if (/[\r\n]/.test(rawText) || value.includes('"')) {
            throw unsupported(
                `VLESS xhttp-${key} contains unsupported characters`,
            );
        }
        const parameter =
            !value || /[,'\s]/.test(value) ? quoteSurgeValue(value) : value;
        result.append(`,xhttp-${key}=${parameter}`);
    }

    const extraHeaders = headers.filter(([key]) => !/^host$/i.test(key));
    if (
        extraHeaders.some(
            ([key, value]) =>
                /[,="':|\r\n]/.test(key) || /[\r\n]/.test(String(value)),
        )
    ) {
        throw unsupported('VLESS xhttp-headers contain unsupported characters');
    }
    const value = formatHeaderMap(Object.fromEntries(extraHeaders), '|');
    if (value) result.append(`,xhttp-headers=${quoteSurgeValue(value)}`);
}

function ssh(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=ssh,${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username="${proxy.username}"`, 'username');
    // 所有的类似的字段都有双引号的问题 暂不处理
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    // https://manual.nssurge.com/policy/ssh.html
    // 需配合 Keystore
    appendSshPrivateKey(result, proxy);
    result.appendIfPresent(
        `,idle-timeout=${proxy['idle-timeout']}`,
        'idle-timeout',
    );
    result.appendIfPresent(
        `,server-fingerprint="${proxy['server-fingerprint']}"`,
        'server-fingerprint',
    );

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}
function http(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'https' : 'http';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username="${proxy.username}"`, 'username');
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');
    appendHeaders(result, proxy);

    // tls verification
    appendTlsProxyParams(result, proxy, Boolean(proxy.tls));

    appendShadowTLS(result, proxy);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}
function direct(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=direct`);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function socks5(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'socks5-tls' : 'socks5';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,username="${proxy.username}"`, 'username');
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    // tls verification
    appendTlsProxyParams(result, proxy, Boolean(proxy.tls));

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    appendShadowTLS(result, proxy);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function appendHeaders(result, proxy) {
    const value = formatHeaders(proxy.headers);
    if (isNotBlank(value)) {
        result.append(`,headers=${quoteSurgeValue(value)}`);
    }
}

function formatHeaders(headers) {
    return formatHeaderMap(headers, ';');
}

function formatHeaderMap(headers, separator) {
    if (!headers || typeof headers !== 'object') {
        return '';
    }

    return Object.entries(headers)
        .filter(([key, value]) => isNotBlank(key) && value != null)
        .map(([key, value]) => `${key}:${quoteSurgeValue(value)}`)
        .join(separator);
}

function snell(proxy) {
    if (isUnsupportedSnellV6Obfs(proxy)) {
        $.error(
            `Platform ${targetPlatform} does not support Snell version ${proxy.version} with obfs`,
        );
        return '';
    }

    const result = new Result(proxy);
    result.append(`${proxy.name}=${proxy.type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,version=${proxy.version}`, 'version');
    result.appendIfPresent(`,psk="${proxy.psk}"`, 'psk');
    if (Number(proxy.version) === 6) {
        result.appendIfPresent(`,mode=${proxy.mode}`, 'mode');
    }

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

    appendShadowTLS(result, proxy);

    // reuse
    result.appendIfPresent(`,reuse=${proxy['reuse']}`, 'reuse');

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function tuic(proxy) {
    const result = new Result(proxy);
    // https://github.com/MetaCubeX/mihomo/blob/e26714a181ac0e2fa803453c0a8e9a9ce94e31cb/adapter/outbound/tuic.go#L271
    let type = proxy.type;
    if (!proxy.token || proxy.token.length === 0) {
        type = 'tuic-v5';
    }
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,uuid=${proxy.uuid}`, 'uuid');
    result.appendIfPresent(`,password="${proxy.password}"`, 'password');
    result.appendIfPresent(`,token=${proxy.token}`, 'token');

    appendPortHopping(result, proxy);

    // tls verification
    appendTlsProxyParams(result, proxy);

    appendShadowTLS(result, proxy);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function wireguard(proxy) {
    const peers =
        Array.isArray(proxy.peers) && proxy.peers.length > 0
            ? proxy.peers
            : [proxy];
    const { ip, ipv6 } = normalizeWireGuardInterface({
        ip: proxy['self-ip'] ?? proxy.ip ?? peers[0].ip,
        ipv6: proxy['self-ip-v6'] ?? proxy.ipv6 ?? peers[0].ipv6,
    });
    const keyField = isNotBlank(proxy['private-key-keystore-name'])
        ? 'private-key-keystore-name'
        : 'private-key';
    const keyValue = proxy[keyField];
    if (!hasNonBlankValue(keyValue) || (!ip && !ipv6)) {
        throw new Error(
            'Surge WireGuard requires a local address and either private-key or private-key-keystore-name',
        );
    }

    const listenPort = proxy['listen-port'];
    if (
        listenPort != null &&
        (!/^\d+$/.test(`${listenPort}`.trim()) ||
            listenPort < 1 ||
            listenPort > 65535)
    ) {
        throw new Error(
            'Surge WireGuard listen-port must be between 1 and 65535',
        );
    }

    const sectionName = getIfNotBlank(proxy['section-name'], proxy.name).trim();
    const policy = wireguardPolicy({
        ...proxy,
        'section-name': sectionName,
        'underlying-proxy':
            listenPort == null ? proxy['underlying-proxy'] : undefined,
    });
    const result = new Result(proxy);
    result.append(`# > WireGuard Proxy ${proxy.name}
# ${policy}
# > WireGuard Section ${proxy.name}
[WireGuard ${sectionName}]
${keyField} = ${keyValue}`);

    if (ip) result.append(`\nself-ip = ${ip}`);
    if (ipv6) result.append(`\nself-ip-v6 = ${ipv6}`);
    const dns = proxy['dns-server'] ?? proxy.dns;
    const dnsServers = Array.isArray(dns) ? dns.join(', ') : dns;
    if (isNotBlank(dnsServers)) result.append(`\ndns-server = ${dnsServers}`);
    result.appendIfPresent(`\nmtu = ${proxy.mtu}`, 'mtu');

    if (isPresent(proxy, 'prefer-ipv6')) {
        result.append(`\nprefer-ipv6 = ${proxy['prefer-ipv6']}`);
    } else if (['ipv6-prefer', 'prefer-v6'].includes(proxy['ip-version'])) {
        result.append(`\nprefer-ipv6 = true`);
    }
    const allowPeerAccess =
        proxy['allow-peer-access'] ?? proxy['accept-incoming'];
    // A listening port already enables peer access.
    if (listenPort == null && allowPeerAccess != null) {
        result.append(`\nallow-peer-access = ${allowPeerAccess}`);
    }
    result.appendIfPresent(`\nlisten-port = ${listenPort}`, 'listen-port');

    const singlePeerDefaults = peers.length === 1 ? proxy : {};
    // When peers can initiate traffic, allowed-ips also limits their source addresses.
    const defaultAllowedIps =
        peers.length === 1 &&
        listenPort == null &&
        (allowPeerAccess == null ||
            /^false$/i.test(`${allowPeerAccess}`.trim()))
            ? [ip && '0.0.0.0/0', ipv6 && '::/0'].filter(Boolean).join(',')
            : undefined;
    for (const peer of peers) {
        const routes = peer['allowed-ips'] ?? singlePeerDefaults['allowed-ips'];
        const allowedIps =
            stripSurgeQuotes(
                Array.isArray(routes) ? routes.join(',') : routes,
            ) || defaultAllowedIps;
        if (!hasNonBlankValue(peer['public-key']) || !allowedIps) {
            throw new Error(
                'Surge WireGuard peers require public-key and allowed-ips',
            );
        }

        let endpoint = peer.endpoint;
        if (
            !isNotBlank(endpoint) &&
            isNotBlank(peer.server) &&
            hasNonBlankValue(peer.port)
        ) {
            const server = peer.server.trim();
            endpoint = `${isIPv6(server) ? `[${server}]` : server}:${
                peer.port
            }`;
        }
        if (!isNotBlank(endpoint) && listenPort == null) {
            throw new Error(
                'Surge WireGuard peers require endpoint without listen-port',
            );
        }

        let clientId = stripSurgeQuotes(peer['client-id'] ?? peer.reserved);
        if (Array.isArray(clientId)) {
            clientId = clientId.join('/');
        } else if (/^[\da-f]{6}$/i.test(clientId)) {
            clientId = `0x${clientId}`;
        }
        const fields = {
            'public-key': peer['public-key'],
            'allowed-ips': quoteSurgeValue(allowedIps),
            endpoint,
            keepalive:
                peer['persistent-keepalive'] ??
                peer.keepalive ??
                peer['persistent-keepalive-interval'] ??
                proxy['persistent-keepalive'] ??
                proxy.keepalive,
            'client-id': clientId,
            'preshared-key':
                peer['preshared-key'] ??
                peer['pre-shared-key'] ??
                singlePeerDefaults['preshared-key'] ??
                singlePeerDefaults['pre-shared-key'],
        };
        const options = Object.entries(fields)
            .filter(([, value]) => hasNonBlankValue(value))
            .map(([key, value]) => `${key} = ${value}`)
            .join(', ');
        result.append(`\npeer = (${options})`);
    }
    return result.toString();
}

function wireguardPolicy(proxy) {
    const sectionName = getIfNotBlank(proxy['section-name'])?.trim();
    if (!sectionName) throw new Error('Surge WireGuard requires section-name');
    const sectionNameValue = sectionName.includes(',')
        ? quoteSurgeValue(sectionName)
        : sectionName;
    const result = new Result(proxy);
    result.append(`${proxy.name}=wireguard,section-name=${sectionNameValue}`);

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function hysteria2(proxy) {
    const obfsPasswordField = {
        salamander: 'salamander-password',
        gecko: 'gecko-password',
    }[proxy.obfs];

    if (proxy['obfs-password'] && !obfsPasswordField) {
        throw unsupported(`only salamander and gecko obfs are supported`);
    }

    const result = new Result(proxy);
    result.append(`${proxy.name}=hysteria2,${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,password="${proxy.password}"`, 'password');

    appendPortHopping(result, proxy);

    if (proxy['obfs-password'] && obfsPasswordField) {
        result.append(
            `,${obfsPasswordField}=${quoteProxyValue(proxy['obfs-password'])}`,
        );
    }

    // tls verification
    appendTlsProxyParams(result, proxy);

    appendShadowTLS(result, proxy);

    // download-bandwidth
    result.appendIfPresent(
        `,download-bandwidth=${`${proxy['down']}`.match(/\d+/)?.[0] || 0}`,
        'down',
    );

    appendSurgePolicyParameters(result, proxy);
    return result.toString();
}

function handleTransport(result, proxy, includeUnsupportedProxy) {
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,ws=true`);
            if (isPresent(proxy, 'ws-opts')) {
                if (proxy['ws-opts']['v2ray-http-upgrade']) {
                    result.append(',ws-http-upgrade=true');
                }
                result.appendIfPresent(
                    `,ws-path=${proxy['ws-opts'].path}`,
                    'ws-opts.path',
                );
                if (isPresent(proxy, 'ws-opts.headers')) {
                    const headers = proxy['ws-opts'].headers;
                    const value = formatHeaderMap(headers, '|');
                    if (isNotBlank(value)) {
                        result.append(`,ws-headers=${quoteSurgeValue(value)}`);
                    }
                }
            }
        } else {
            if (includeUnsupportedProxy && ['http'].includes(proxy.network)) {
                $.info(
                    `Include Unsupported Proxy: network ${proxy.network} -> tcp`,
                );
            } else if (
                ['tcp'].includes(proxy.network) &&
                proxy['reality-opts']
            ) {
                throw unsupported(`reality is unsupported`);
            } else if (!['tcp'].includes(proxy.network)) {
                throw unsupported(`network ${proxy.network} is unsupported`);
            }
        }
    }
}
