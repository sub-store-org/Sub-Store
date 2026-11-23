/* eslint-disable no-case-declarations */
const targetPlatform = 'Loon';
import { Buffer } from 'buffer';
import _ from 'lodash';
import { isPresent, Result } from './utils';
import { getIfNotBlank, isIPv4, isIPv6, isPlainObject } from '@/utils';
import $ from '@/core/app';
import { LOON_XHTTP_FIELDS, validateLoonXhttpXmux } from '../loon-xhttp';
import { formatLoonVmessSecurity } from '../vmess-security';
import { normalizeXhttpIntegerValue } from '../xhttp-utils';

const ipVersions = {
    dual: 'dual',
    ipv4: 'v4-only',
    ipv6: 'v6-only',
    'ipv4-prefer': 'prefer-v4',
    'ipv6-prefer': 'prefer-v6',
};

export default function Loon_Producer() {
    const produce = (proxy, type, opts = {}) => {
        if (
            ['ws'].includes(proxy.network) &&
            proxy['ws-opts']?.['v2ray-http-upgrade']
        ) {
            throw new Error(
                `Platform ${targetPlatform} does not support network ${proxy.network} with http upgrade`,
            );
        }
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy);
            case 'ssr':
                return shadowsocksr(proxy);
            case 'snell':
                return snell(proxy);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy, opts['include-unsupported-proxy']);
            case 'vless':
                return vless(proxy, opts['include-unsupported-proxy']);
            case 'http':
                return http(proxy);
            case 'socks5':
                return socks5(proxy);
            case 'wireguard':
                return wireguard(proxy);
            case 'tailscale':
                return tailscale(proxy);
            case 'hysteria2':
                return hysteria2(proxy);
            case 'mieru':
                return mieru(proxy);
        }
        if (proxy.type === 'anytls') {
            if (proxy.network && !['tcp'].includes(proxy.network)) {
                throw new Error(
                    `Platform ${targetPlatform} does not support proxy type ${proxy.type} with network ${proxy.network}`,
                );
            }

            return anytls(proxy);
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return {
        produce: (proxy, type, opts = {}) => {
            const result = produce(proxy, type, opts);
            const serverDns = proxy['server-dns'];
            return Array.isArray(serverDns) && serverDns.length > 0
                ? `${result},server-dns="${serverDns.join(',')}"`
                : result;
        },
    };
}

function appendTlsProfile(result, proxy) {
    const tlsProfile = getLoonTlsProfile(proxy);
    if (tlsProfile) result.append(`,tls-profile=${tlsProfile}`);
}

function appendAlpn(result, proxy, isXhttp = false) {
    const alpn = isXhttp ? getLoonXhttpAlpn(proxy) : getLoonAlpn(proxy);
    if (alpn) result.append(`,alpn="${alpn}"`);
}

function formatLoonValue(value, quoted = false) {
    const text = String(value);
    if (/["\r\n]/.test(text)) {
        throw new Error('Unsupported characters in Loon option');
    }
    return quoted || !text || /[,\s]/.test(text) ? `"${text}"` : text;
}

function appendXhttp(result, proxy) {
    const xhttp = proxy['xhttp-opts'];
    const download = xhttp?.['download-settings'];
    if (download?.plugin || download?.['shadow-tls-opts']) {
        throw new Error('Loon XHTTP download-settings do not support plugins');
    }
    validateLoonXhttpXmux(xhttp);

    let options = xhttp;
    if (download) {
        const server =
            getIfNotBlank(download.server) ?? getIfNotBlank(proxy.server);
        if (server == null) {
            throw new Error(
                'Loon xhttp-download-server requires a server address',
            );
        }

        const port = normalizeXhttpIntegerValue(download.port ?? proxy.port);
        if (port == null || port < 1 || port > 65535) {
            throw new Error(
                'Loon xhttp-download-port must be an integer from 1 to 65535',
            );
        }

        const reality = download['reality-opts'];
        const hasReality = Boolean(getIfNotBlank(reality?.['public-key']));
        if (reality && !hasReality) {
            throw new Error(
                'Loon XHTTP download REALITY requires a non-blank public-key',
            );
        }
        if (hasReality && [false, 'false'].includes(download.tls)) {
            throw new Error(
                'Loon XHTTP download REALITY conflicts with xhttp-download-over-tls=false',
            );
        }

        const alpn = getLoonXhttpAlpn(download, true);

        const fingerprint = download.fingerprint ?? download['tls-fingerprint'];
        const pubkeyFingerprint = download['tls-pubkey-sha256'];
        const skipCertVerify = download['skip-cert-verify'];
        if (
            hasReality &&
            (fingerprint ||
                pubkeyFingerprint ||
                [true, 'true'].includes(skipCertVerify))
        ) {
            throw new Error(
                'Loon XHTTP download REALITY conflicts with skip-cert-verify=true or TLS certificate fingerprints',
            );
        }

        options = {
            ...xhttp,
            'download-settings': {
                ...download,
                server: server.trim(),
                port,
                host: getXhttpHost(download),
                alpn: alpn || undefined,
                servername: download.servername ?? download.sni,
                fingerprint: hasReality ? undefined : fingerprint,
                'tls-pubkey-sha256': hasReality ? undefined : pubkeyFingerprint,
                'skip-cert-verify': hasReality ? undefined : skipCertVerify,
                _loon_tls_profile: getLoonTlsProfile(download),
            },
        };
    }

    result.append(',transport=xhttp');
    for (const [key, value] of [
        ['path', xhttp?.path],
        ['host', getXhttpHost(xhttp)],
    ]) {
        if (value != null) result.append(`,${key}=${formatLoonValue(value)}`);
    }
    for (const [key, field] of Object.entries(LOON_XHTTP_FIELDS)) {
        const value = _.get(options, field);
        if (value != null)
            result.append(`,xhttp-${key}=${formatLoonValue(value)}`);
    }
    for (const [option, headers] of [
        ['xhttp-header', xhttp?.headers],
        ['xhttp-download-header', download?.headers],
    ]) {
        if (!isPlainObject(headers)) continue;
        for (const [key, value] of Object.entries(headers)) {
            if (/^host$/i.test(key) || value == null) continue;
            result.append(
                `,${option}=${formatLoonValue(`${key}: ${value}`, true)}`,
            );
        }
    }
}

function getXhttpHost(opts) {
    if (opts?.host != null) return opts.host;
    if (isPlainObject(opts?.headers)) {
        return Object.entries(opts.headers).find(([key]) =>
            /^host$/i.test(key),
        )?.[1];
    }
}

function getLoonShadowTLSAlpn(proxy) {
    const values = proxy?.['plugin-opts']?.alpn ?? proxy?.alpn;
    const normalized = Array.isArray(values)
        ? values
        : `${values || ''}`.split(',');
    return normalized
        .map((item) => `${item}`.trim())
        .filter((item) => item !== '')
        .join(',');
}

function appendShadowTLS(result, proxy) {
    if (proxy.plugin !== 'shadow-tls' || !proxy['plugin-opts']) return;

    const password = proxy['plugin-opts'].password;
    const host = proxy['plugin-opts'].host;
    const version = proxy['plugin-opts'].version;
    if (!password) return;

    result.append(`,shadow-tls-password=${password}`);
    if (host) result.append(`,shadow-tls-sni=${host}`);
    if (version) {
        if (version < 2) {
            throw new Error(`shadow-tls version ${version} is not supported`);
        }
        result.append(`,shadow-tls-version=${version}`);
    }
    appendTlsProfile(result, proxy);
    const alpn = getLoonShadowTLSAlpn(proxy);
    if (alpn) result.append(`,alpn="${alpn}"`);
    result.appendIfPresent(`,udp-port=${proxy['udp-port']}`, 'udp-port');
}

function appendReality(result, proxy) {
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');
    result.appendIfPresent(
        `,public-key="${proxy['reality-opts']['public-key']}"`,
        'reality-opts.public-key',
    );
    result.appendIfPresent(
        `,short-id=${proxy['reality-opts']['short-id']}`,
        'reality-opts.short-id',
    );
}

function getLoonAlpn(proxy) {
    const values = Array.isArray(proxy.alpn)
        ? proxy.alpn
        : `${proxy.alpn || ''}`.split(',');
    return values
        .map((item) => `${item}`.trim())
        .filter((item) => item !== '')
        .join(',');
}

function getLoonXhttpAlpn(endpoint, isDownload = false) {
    const alpn = getLoonAlpn(endpoint);
    if (!alpn) return alpn;
    if (alpn.includes(',')) {
        const scope = isDownload ? ' download' : '';
        throw new Error(`Loon XHTTP${scope} supports only a single ALPN`);
    }

    const hasReality = Boolean(endpoint['reality-opts']?.['public-key']);
    const hasTls =
        (!isDownload && endpoint.type === 'trojan') ||
        [true, 'true'].includes(endpoint.tls);
    const allowed = hasReality
        ? ['h2']
        : hasTls
        ? ['http/1.1', 'h2', 'h3']
        : ['http/1.1'];
    if (!allowed.includes(alpn)) {
        const field = isDownload ? 'xhttp-download-alpn' : 'XHTTP alpn';
        throw new Error(
            `Loon ${field} must be ${allowed.join(
                ' or ',
            )} for the configured security`,
        );
    }
    return alpn;
}

function getLoonTlsProfile(proxy) {
    const tlsProfile = `${proxy._loon_tls_profile || ''}`.trim();
    if (
        [
            'global',
            'default',
            'safari-ios18',
            'safari-ios-26',
            'chrome',
            'chrome147',
        ].includes(tlsProfile)
    ) {
        return tlsProfile;
    }

    const fingerprint = `${proxy['client-fingerprint'] || ''}`.trim();
    if (proxy['reality-opts']?.['support-x25519mlkem768']) {
        return ['safari', 'ios'].includes(fingerprint)
            ? 'safari-ios-26'
            : 'chrome147';
    }

    switch (fingerprint) {
        case 'chrome':
            return 'chrome';
        case 'safari':
        case 'ios':
            return 'safari-ios18';
    }
}

function shadowsocks(proxy) {
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

    appendShadowTLS(result, proxy);

    // udp over tcp
    if (proxy['udp-over-tcp']) {
        if (proxy['udp-over-tcp-version'] === 2) {
            if (proxy.plugin === 'obfs') {
                $.error(
                    `Platform ${targetPlatform} shadowsocks udp-over-tcp does not support obfs`,
                );
            } else {
                result.append(`,udp-over-tcp=true`);
            }
        } else {
            $.error(
                `Platform ${targetPlatform} shadowsocks only supports udp-over-tcp-version 2`,
            );
        }
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

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

    appendShadowTLS(result, proxy);

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }

    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function snell(proxy) {
    const version = Number(proxy.version);
    if (![4, 5].includes(version)) {
        throw new Error(
            `Loon does not support Snell version ${proxy.version ?? 1}`,
        );
    }
    if (proxy.psk == null || proxy.psk === '') {
        throw new Error('Missing Snell PSK');
    }
    const obfs = proxy['obfs-opts'];
    if (proxy.plugin || (obfs?.mode && !['none', 'http'].includes(obfs.mode))) {
        throw new Error('Loon Snell only supports HTTP obfs');
    }

    const result = new Result(proxy);
    result.append(
        `${proxy.name}=snell,${proxy.server},${proxy.port},${formatLoonValue(
            proxy.psk,
            true,
        )},version=${version}`,
    );
    if (obfs?.mode === 'http') {
        result.append(',obfs=http');
        if (obfs.host != null)
            result.append(`,obfs-host=${formatLoonValue(obfs.host)}`);
        if (obfs.path != null)
            result.append(`,obfs-uri=${formatLoonValue(obfs.path)}`);
    }
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');
    const blockQuic = proxy['block-quic'];
    if (blockQuic === 'on' || blockQuic === 'off') {
        result.append(`,block-quic=${blockQuic === 'on'}`);
    }
    const ipVersion = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ipVersion}`, 'ip-version');
    return result.toString();
}

function trojan(proxy) {
    const isReality = !!proxy['reality-opts'];
    const isXhttp = proxy.network === 'xhttp';
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
        } else if (isXhttp) {
            appendXhttp(result, proxy);
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );
    appendTlsProfile(result, proxy);
    appendAlpn(result, proxy, isXhttp);

    if (isReality) {
        appendReality(result, proxy);
    } else {
        // sni
        result.appendIfPresent(
            `,${isXhttp ? 'sni' : 'tls-name'}=${proxy.sni}`,
            'sni',
        );
        result.appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );
        result.appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function anytls(proxy) {
    const isReality = !!proxy['reality-opts'];
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=anytls,${proxy.server},${proxy.port},"${proxy.password}"`,
    );
    // 新版删除idle-session-check-interval和min-idle-session 参数，session 改为主动超时机制，由于 anytls-go 不支持一个tcp 并发多个 stream，max-stream-cout 设置大于 1 时会有阻塞，如果有其他支持多路复用的 anytls 服务器实现，可以设置max-stream-cout 大于 1
    for (const key of [
        // 'idle-session-check-interval',
        'idle-session-timeout',
        // 'min-idle-session',
        'max-stream-count',
    ]) {
        // 值为整数 才附加
        if (isPresent(proxy, key) && Number.isInteger(proxy[key])) {
            result.append(`,${key}=${proxy[key]}`);
        }
    }

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );
    appendTlsProfile(result, proxy);
    appendAlpn(result, proxy);

    if (isReality) {
        appendReality(result, proxy);
    } else {
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
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function vmess(proxy) {
    const isReality = !!proxy['reality-opts'];
    const isXhttp = proxy.network === 'xhttp';
    const security = formatLoonVmessSecurity(proxy.cipher);

    const result = new Result(proxy);
    result.append(
        `${proxy.name}=vmess,${proxy.server},${proxy.port},${security},"${proxy.uuid}"`,
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
        } else if (isXhttp) {
            appendXhttp(result, proxy);
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
    if (proxy.tls || isReality) appendTlsProfile(result, proxy);
    if (proxy.tls || isReality || isXhttp) appendAlpn(result, proxy, isXhttp);

    if (isReality) {
        appendReality(result, proxy);
    } else {
        // sni
        result.appendIfPresent(
            `,${isXhttp ? 'sni' : 'tls-name'}=${proxy.sni}`,
            'sni',
        );
        result.appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );
        result.appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
    }

    // AEAD
    let alterId = proxy.alterId;
    if (isPresent(proxy, 'aead')) alterId = proxy.aead ? 0 : 1;
    if (isXhttp) {
        alterId ??= 0;
        if (Number(alterId) !== 0) throw new Error('VMess XHTTP requires AEAD');
    }
    result.append(`,alterId=${alterId}`);

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');
    return result.toString();
}

function appendVlessEncryption(result, encryption) {
    if (!encryption || encryption === 'none') return;

    const [method, mode, rtt, ...settings] = encryption.split('.');
    const paddingGroup = /^(-?\d+)-(-?\d+)-(-?\d+)$/;
    const keyIndex = settings.findIndex((part) => !paddingGroup.test(part));
    if (
        method !== 'mlkem768x25519plus' ||
        !['native', 'xorpub', 'random'].includes(mode) ||
        !['0rtt', '1rtt'].includes(rtt) ||
        !settings[keyIndex]
    ) {
        throw new Error('Unsupported VLESS encryption format');
    }

    const padding = settings.slice(0, keyIndex);
    for (const [index, group] of padding.entries()) {
        const [, probability, min, max] = paddingGroup.exec(group).map(Number);
        if (index === 0 && (probability !== 100 || min < 35 || max < 35)) {
            throw new Error(
                'Loon VLESS encryption-padding first group requires probability 100 and lengths of at least 35',
            );
        }
        if (
            probability < 0 ||
            probability > 100 ||
            min < 0 ||
            min > max ||
            !Number.isSafeInteger(max)
        ) {
            throw new Error(
                'Loon VLESS encryption-padding requires probabilities from 0 to 100 and ordered non-negative integer bounds',
            );
        }
    }

    const publicKeys = settings.slice(keyIndex).join('.');
    result.append(`,encryption-mode=${mode},encryption-rtt=${rtt}`);
    result.append(
        `,encryption-public-keys=${formatLoonValue(publicKeys, true)}`,
    );
    if (padding.length) {
        result.append(
            `,encryption-padding=${formatLoonValue(padding.join('.'))}`,
        );
    }
}

function vless(proxy) {
    const isXtls = !!proxy.flow;
    const reality = proxy['reality-opts'];
    const isReality = Boolean(getIfNotBlank(reality?.['public-key']));
    const isXhttp = proxy.network === 'xhttp';
    const isTcp = (proxy.network ?? 'tcp') === 'tcp';
    const isSecure = isReality || [true, 'true'].includes(proxy.tls);
    const encryptionEnabled = proxy.encryption && proxy.encryption !== 'none';

    if (reality && !isReality) {
        throw new Error('Loon VLESS REALITY requires a non-blank public-key');
    }
    if (
        isXtls &&
        !['xtls-rprx-vision', 'xtls-rprx-vision-udp443'].includes(proxy.flow)
    ) {
        throw new Error(`VLESS flow(${proxy.flow}) is not supported`);
    }
    if (isXtls && !encryptionEnabled && (!isTcp || !isSecure)) {
        throw new Error(
            'Loon VLESS Vision without encryption requires TCP with TLS or REALITY',
        );
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
        } else if (isXhttp) {
            appendXhttp(result, proxy);
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
    if (proxy.tls || isReality || isXtls) appendTlsProfile(result, proxy);
    if (proxy.tls || isReality || isXtls || isXhttp)
        appendAlpn(result, proxy, isXhttp);

    appendVlessEncryption(result, proxy.encryption);
    if (isXtls) result.append(`,flow=${proxy.flow}`);
    if (isReality) {
        appendReality(result, proxy);
    } else {
        // sni
        result.appendIfPresent(
            `,${isXhttp ? 'sni' : 'tls-name'}=${proxy.sni}`,
            'sni',
        );
        result.appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );
        result.appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');
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
    if (proxy.tls) {
        appendTlsProfile(result, proxy);
        appendAlpn(result, proxy);
    }

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

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
    if (proxy.tls) {
        appendTlsProfile(result, proxy);
        appendAlpn(result, proxy);
    }

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}

function tailscale(proxy) {
    const result = new Result(proxy);
    result.append(`${proxy.name}=tailscale`);

    let exitNode = proxy['exit-node'];
    if (exitNode === 'auto:any') exitNode = 'auto';
    if (exitNode === '') exitNode = 'none';
    const stringOptions = {
        'control-url': proxy['control-url'],
        'auth-key': proxy['auth-key'],
        hostname: proxy.hostname,
        'exit-node': exitNode,
    };
    for (const [key, value] of Object.entries(stringOptions)) {
        if (!value) continue;
        const quoted =
            key === 'control-url' || key === 'auth-key' || /[,\s]/.test(value);
        result.append(`,${key}=${quoted ? `"${value}"` : value}`);
    }
    for (const key of [
        'accept-routes',
        'accept-dns',
        'magic-dns',
        'path-mode',
        'mtu',
        'idle-session-timeout',
        'udp',
    ]) {
        result.appendIfPresent(`,${key}=${proxy[key]}`, key);
    }
    const ipVersion = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ipVersion}`, 'ip-version');
    const blockQuic = proxy['block-quic'];
    if (blockQuic === 'on' || blockQuic === 'off') {
        result.append(`,block-quic=${blockQuic === 'on'}`);
    }
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

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    return result.toString();
}

function mieru(proxy) {
    if (proxy.transport && String(proxy.transport).toUpperCase() !== 'TCP') {
        throw new Error('Loon Mieru requires TCP transport');
    }
    if (proxy.tls || proxy['reality-opts']) {
        throw new Error('Loon Mieru does not support TLS or REALITY');
    }
    const server = getIfNotBlank(proxy.server)?.trim();
    if (!server) throw new Error('Loon Mieru requires a server');

    const portText = String(proxy.port ?? '').trim();
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || port < 1 || port > 65535) {
        throw new Error('Loon Mieru port must be an integer from 1 to 65535');
    }

    const credentials = [proxy.username, proxy.password].map((value) =>
        String(value ?? ''),
    );
    if (
        credentials.some(
            (value) => !value || Buffer.byteLength(value, 'utf8') > 64,
        )
    ) {
        throw new Error(
            'Loon Mieru username and password must each be 1-64 UTF-8 bytes',
        );
    }

    const result = new Result(proxy);
    const address = isIPv6(server) ? `[${server}]` : server;
    const [username, password] = credentials.map((value) =>
        formatLoonValue(value, true),
    );
    result.append(
        `${proxy.name}=mieru,${address},${port},${username},${password}`,
    );
    if (proxy.udp) result.append(',udp=true');

    const blockQuic = proxy['block-quic'];
    if (['on', 'off', true, false].includes(blockQuic)) {
        result.append(
            `,block-quic=${blockQuic === 'on' || blockQuic === true}`,
        );
    }
    const ipVersion = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ipVersion}`, 'ip-version');
    return result.toString();
}

function hysteria2(proxy) {
    if (proxy['obfs-password'] && proxy.obfs != 'salamander') {
        throw new Error(`only salamander obfs is supported`);
    }
    const result = new Result(proxy);
    result.append(`${proxy.name}=Hysteria2,${proxy.server},${proxy.port}`);

    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    if (isPresent(proxy, 'ports') && `${proxy.ports}`.trim().length > 0) {
        result.append(`,server-ports="${proxy.ports}"`);
    }

    if (
        isPresent(proxy, 'hop-interval') &&
        `${proxy['hop-interval']}`.trim().length > 0
    ) {
        result.append(`,hop-interval=${proxy['hop-interval']}`);
    }

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
    appendTlsProfile(result, proxy);
    appendAlpn(result, proxy);

    if (proxy['obfs-password'] && proxy.obfs == 'salamander') {
        result.append(`,salamander-password=${proxy['obfs-password']}`);
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // block-quic
    if (proxy['block-quic'] === 'on') {
        result.append(',block-quic=true');
    } else if (proxy['block-quic'] === 'off') {
        result.append(',block-quic=false');
    }

    // udp
    if (proxy.udp) {
        result.append(`,udp=true`);
    }

    // download-bandwidth
    result.appendIfPresent(
        `,download-bandwidth=${`${proxy['down']}`.match(/\d+/)?.[0] || 0}`,
        'down',
    );

    if ([true, 'true', 'on'].includes(proxy.ecn)) {
        result.append(',ecn=true');
    } else if ([false, 'false', 'off'].includes(proxy.ecn)) {
        result.append(',ecn=false');
    }
    const ip_version = ipVersions[proxy['ip-version']] || proxy['ip-version'];
    result.appendIfPresent(`,ip-mode=${ip_version}`, 'ip-version');

    return result.toString();
}
