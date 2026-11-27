import { isPresent } from './utils';
import { formatRingVmessCipher } from '../vmess-security';

const targetPlatform = 'Ring';

export class RingUnsupportedProxyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RingUnsupportedProxyError';
    }
}

function unsupported(message) {
    return new RingUnsupportedProxyError(message);
}

function stripQuotes(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (
        trimmed.length >= 2 &&
        ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function quoteRingValue(value) {
    if (value === undefined || value === null) return '';
    const str = String(value);
    if (/[\r\n\0]/.test(str)) {
        throw unsupported('Ring 配置值不能包含换行或空字符');
    }
    if (/[\s,=#";[\]{}]/.test(str)) {
        return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
}

function isTrue(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function isFalse(value) {
    return value === false || value === 'false' || value === 0 || value === '0';
}

function formatAlpns(alpn) {
    if (!alpn) return '';
    const values = Array.isArray(alpn)
        ? alpn
        : stripQuotes(String(alpn)).split(',');
    return values
        .filter((item) => item != null)
        .map((item) => String(stripQuotes(item)).trim())
        .filter((item) => item !== '')
        .join(',');
}

function appendAlpns(options, proxy) {
    const alpnVal = proxy.alpns || proxy.alpn;
    const formatted = formatAlpns(alpnVal);
    if (formatted) {
        options.push(`alpns=${quoteRingValue(formatted)}`);
    }
}

function formatRealityPublicKey(pk) {
    if (!pk) return '';
    const s = String(stripQuotes(pk)).trim();
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatServerCertFingerprintSha256(val) {
    if (!val) return undefined;
    if (Array.isArray(val)) val = val[0];
    const s = String(stripQuotes(val))
        .trim()
        .replace(/[:\s-]/g, '');
    if (/^[0-9a-fA-F]{64}$/.test(s)) {
        return s.toLowerCase();
    }
    return undefined;
}

function getServerCertFingerprintSha256(proxy) {
    if (!proxy) return undefined;
    const candidates = [
        proxy['server-cert-fingerprint-sha256'],
        proxy.server_cert_fingerprint_sha256,
        proxy['tls-fingerprint'],
        proxy.tls_fingerprint,
        proxy['certificate-sha256'],
        proxy.certificate_sha256,
        proxy['cert-fingerprint-sha256'],
        proxy.cert_fingerprint_sha256,
        proxy['server-cert-sha256'],
        proxy.server_cert_sha256,
        proxy['tls-cert-sha256'],
        proxy.tls_cert_sha256,
        proxy['ca-sha256'],
        proxy.ca_sha256,
        proxy['fingerprint-sha256'],
        proxy.fingerprint_sha256,
        proxy.fingerprint,
    ];
    for (const cand of candidates) {
        const fp = formatServerCertFingerprintSha256(cand);
        if (fp) return fp;
    }
    return undefined;
}

function appendServerCertFingerprint(options, proxy) {
    const certFp = getServerCertFingerprintSha256(proxy);
    if (certFp) {
        options.push(`server-cert-fingerprint-sha256=${certFp}`);
    }
}

function getShadowTlsFingerprintSha256(proxy) {
    if (!proxy) return undefined;
    const candidates = [
        proxy['shadow-tls-server-cert-fingerprint-sha256'],
        proxy.shadow_tls_server_cert_fingerprint_sha256,
        proxy['shadow-tls-opts']?.['server-cert-fingerprint-sha256'],
        proxy['plugin-opts']?.['server-cert-fingerprint-sha256'],
        proxy['plugin-opts']?.server_cert_fingerprint_sha256,
        proxy['plugin-opts']?.['fingerprint-sha256'],
        proxy['plugin-opts']?.fingerprint_sha256,
        proxy['plugin-opts']?.['tls-fingerprint'],
        proxy['plugin-opts']?.tls_fingerprint,
        proxy['server-cert-fingerprint-sha256'],
        proxy['tls-fingerprint'],
        proxy['certificate-sha256'],
    ];
    for (const cand of candidates) {
        const fp = formatServerCertFingerprintSha256(cand);
        if (fp) return fp;
    }
    return undefined;
}

function isSkipCertVerify(proxy) {
    const val =
        proxy['skip-cert-verify'] ??
        proxy.insecure ??
        proxy.allowInsecure ??
        proxy.tls_insecure;
    return isTrue(val);
}

function isEnableEarlyData(proxy) {
    const val =
        proxy['enable-early-data'] ?? proxy['early-data'] ?? proxy.early_data;
    return isTrue(val);
}

function hasShadowTls(proxy) {
    return (
        proxy.plugin === 'shadow-tls' ||
        proxy.plugin === 'shadowtls' ||
        isTrue(proxy['shadow-tls'] ?? proxy.shadow_tls) ||
        (proxy['shadow-tls-opts'] != null &&
            String(proxy['shadow-tls-opts'].version ?? 3) !== '0')
    );
}

export function hasRingTransportPlugin(proxy) {
    return hasShadowTls(proxy) || isTrue(proxy.jls);
}

const tcpPluginProtocols = new Set([
    'ss',
    'shadowsocks',
    'vmess',
    'trojan',
    'socks',
    'socks5',
    'http',
    'https',
    'anytls',
    'ssh',
]);

function validateTransportPlugins(proxy) {
    const shadowTls = hasShadowTls(proxy);
    const jls = isTrue(proxy.jls);
    if ((shadowTls || jls) && !tcpPluginProtocols.has(proxy.type)) {
        throw unsupported(
            `Ring 的 ${proxy.type} 协议不支持 ShadowTLS/JLS 插件`,
        );
    }
    if (shadowTls && jls) {
        throw unsupported('Ring 不支持同时启用 ShadowTLS 和 JLS');
    }
    if (
        isFalse(proxy.tls) &&
        !shadowTls &&
        !jls &&
        ['trojan', 'anytls', 'tuic'].includes(proxy.type)
    ) {
        throw unsupported('Ring 的该协议不能关闭 TLS');
    }
    if (
        proxy.plugin &&
        !['shadow-tls', 'shadowtls'].includes(proxy.plugin) &&
        !(['ss', 'shadowsocks'].includes(proxy.type) && proxy.plugin === 'obfs')
    ) {
        throw unsupported('Ring 不支持该节点插件');
    }
    if (
        proxy.type === 'direct' &&
        (isTrue(proxy['sing-mux']) ||
            isTrue(proxy.sing_mux) ||
            isTrue(proxy.mux) ||
            isTrue(proxy.smux?.enabled) ||
            isTrue(proxy.multiplex?.enabled))
    ) {
        throw unsupported('Ring 基本策略不支持 Sing Mux');
    }
}

function appendShadowTlsOptions(options, proxy) {
    if (!hasShadowTls(proxy)) return false;

    const pluginOpts = proxy['shadow-tls-opts'] || proxy['plugin-opts'] || {};

    const rawVersion = proxy['shadow-tls-version'] ?? pluginOpts.version;
    const version = rawVersion != null ? String(rawVersion).trim() : '3';
    if (!['1', '2', '3'].includes(version)) {
        throw unsupported('Ring ShadowTLS 版本必须为 1、2 或 3');
    }
    if (
        isTrue(proxy['shadow-tls-skip-cert-verify']) ||
        isTrue(proxy['shadow-tls-enable-early-data'])
    ) {
        throw unsupported('Ring ShadowTLS 不支持跳过证书校验或早期数据');
    }
    options.push('shadow-tls=true');
    options.push(`shadow-tls-version=${version}`);

    const password = proxy['shadow-tls-password'] ?? pluginOpts.password;
    if (version !== '1' && (password == null || `${password}`.length === 0)) {
        throw unsupported('Ring ShadowTLS V2/V3 必须提供独立的认证密码');
    }
    if (password != null && `${password}`.length > 0) {
        options.push(`shadow-tls-password=${quoteRingValue(password)}`);
    }

    const sni =
        proxy['shadow-tls-sni'] ||
        pluginOpts.host ||
        pluginOpts.sni ||
        proxy.sni ||
        proxy.server;
    if (sni != null && `${sni}`.length > 0) {
        options.push(`shadow-tls-sni=${quoteRingValue(sni)}`);
    }

    const certFp = getShadowTlsFingerprintSha256(proxy);
    if (certFp) {
        options.push(`shadow-tls-server-cert-fingerprint-sha256=${certFp}`);
    }

    const alpnsVal =
        proxy['shadow-tls-alpns'] || pluginOpts.alpn || pluginOpts.alpns;
    const formattedAlpns = formatAlpns(alpnsVal);
    if (formattedAlpns) {
        options.push(`shadow-tls-alpns=${quoteRingValue(formattedAlpns)}`);
    }

    return true;
}

function appendJlsOptions(options, proxy) {
    if (!isTrue(proxy.jls)) return false;
    if (!proxy['jls-username'] || !proxy['jls-password']) {
        throw unsupported('Ring JLS 必须提供独立的用户名和密码');
    }
    if (
        isFalse(proxy['jls-tls']) ||
        isTrue(proxy['jls-skip-cert-verify']) ||
        isTrue(proxy['jls-enable-early-data']) ||
        proxy['jls-server-cert-fingerprint-sha256'] != null
    ) {
        throw unsupported('Ring JLS 不支持覆盖认证、关闭 TLS 或早期数据');
    }
    options.push('jls=true');
    options.push(`jls-username=${quoteRingValue(proxy['jls-username'])}`);
    options.push(`jls-password=${quoteRingValue(proxy['jls-password'])}`);
    options.push(`jls-sni=${quoteRingValue(proxy['jls-sni'] || proxy.server)}`);
    const alpns = formatAlpns(proxy['jls-alpns']);
    if (alpns) options.push(`jls-alpns=${quoteRingValue(alpns)}`);
    return true;
}

function appendTlsOptions(options, proxy, earlyData = true) {
    const sni = proxy.sni || proxy.server;
    if (sni) options.push(`sni=${quoteRingValue(sni)}`);
    appendServerCertFingerprint(options, proxy);
    if (isSkipCertVerify(proxy)) options.push('skip-cert-verify=true');
    if (earlyData && isEnableEarlyData(proxy))
        options.push('enable-early-data=true');
    appendAlpns(options, proxy);
}

function appendTcpSecurity(options, proxy, tlsEnabled = isTrue(proxy.tls)) {
    if (
        appendShadowTlsOptions(options, proxy) ||
        appendJlsOptions(options, proxy)
    )
        return;
    if (tlsEnabled) {
        options.push('tls=true');
        appendTlsOptions(options, proxy);
    }
}

const validRingIpVersions = new Set([
    'dual',
    'ipv4-only',
    'ipv6-only',
    'prefer-ipv4',
    'prefer-ipv6',
]);

const ipVersionsMap = {
    dual: 'dual',
    dual_stack: 'dual',
    'dual-stack': 'dual',
    ipv4: 'ipv4-only',
    'ipv4-only': 'ipv4-only',
    'v4-only': 'ipv4-only',
    v4_only: 'ipv4-only',
    ipv6: 'ipv6-only',
    'ipv6-only': 'ipv6-only',
    'v6-only': 'ipv6-only',
    v6_only: 'ipv6-only',
    'ipv4-prefer': 'prefer-ipv4',
    'prefer-ipv4': 'prefer-ipv4',
    'prefer-v4': 'prefer-ipv4',
    prefer_v4: 'prefer-ipv4',
    v4_prefer: 'prefer-ipv4',
    'ipv6-prefer': 'prefer-ipv6',
    'prefer-ipv6': 'prefer-ipv6',
    'prefer-v6': 'prefer-ipv6',
    prefer_v6: 'prefer-ipv6',
    v6_prefer: 'prefer-ipv6',
};

function formatRingIpVersion(val) {
    if (!val) return undefined;
    const lower = String(stripQuotes(val)).trim().toLowerCase();
    const mapped = ipVersionsMap[lower];
    if (mapped && validRingIpVersions.has(mapped)) {
        return mapped;
    }
    if (validRingIpVersions.has(lower)) {
        return lower;
    }
    return undefined;
}

function formatTcpEcn(val) {
    if (val == null) return undefined;
    if (val === true || val === 'true') return 'on';
    if (val === false || val === 'false') return 'off';
    const lower = String(stripQuotes(val)).trim().toLowerCase();
    if (['auto', 'on', 'off'].includes(lower)) {
        return lower;
    }
    return undefined;
}

function formatDnsResolverType(val) {
    if (val == null) return undefined;
    const s = String(stripQuotes(val)).trim().toLowerCase();
    if (s === 'default' || s === '0') return 'default';
    if (s === 'ip4p' || s === '1') return 'ip4p';
    return undefined;
}

function appendIntegerOption(
    options,
    key,
    value,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
) {
    if (value == null) return;
    const number = Number(value);
    if (
        !/^\d+$/.test(String(value).trim()) ||
        !Number.isSafeInteger(number) ||
        number < min ||
        number > max
    ) {
        throw unsupported(`Ring ${key} 必须为 ${min}–${max} 范围内的整数`);
    }
    options.push(`${key}=${number}`);
}

function appendSingMuxOptions(options, proxy) {
    const smux = proxy.smux || {};
    const multiplex = proxy.multiplex || {};
    const enabled =
        proxy['sing-mux'] ??
        proxy.sing_mux ??
        proxy.mux ??
        smux.enabled ??
        multiplex.enabled;
    if (isFalse(enabled)) {
        options.push('sing-mux=false');
        return;
    }
    if (!isTrue(enabled)) return;
    if (
        (smux.protocol && smux.protocol !== 'smux') ||
        (multiplex.protocol && multiplex.protocol !== 'smux')
    ) {
        throw unsupported('Ring Sing Mux 仅支持 SMUX');
    }
    options.push('sing-mux=true');
    appendIntegerOption(
        options,
        'sing-mux-stream-num-per-conn',
        proxy['sing-mux-stream-num-per-conn'] ??
            proxy['stream-num-per-conn'] ??
            smux['max-streams'] ??
            smux.max_streams ??
            multiplex['max-streams'] ??
            multiplex.max_streams ??
            proxy['max-streams'],
        1,
    );
    appendIntegerOption(
        options,
        'sing-mux-max-connections',
        proxy['sing-mux-max-connections'] ??
            proxy['max-connections'] ??
            smux['max-connections'] ??
            smux.max_connections ??
            multiplex['max-connections'] ??
            multiplex.max_connections,
        1,
    );
    const padding =
        proxy['sing-mux-padding'] ??
        proxy.padding ??
        smux.padding ??
        multiplex.padding;
    if (padding != null) options.push(`sing-mux-padding=${isTrue(padding)}`);
    appendIntegerOption(
        options,
        'sing-mux-idle-timeout',
        proxy['sing-mux-idle-timeout'] ??
            proxy['idle-timeout'] ??
            smux['idle-timeout'] ??
            smux.idle_timeout ??
            multiplex['idle-timeout'] ??
            multiplex.idle_timeout,
    );
}

function appendCommonOptions(options, proxy) {
    if (proxy.tfo === true || proxy.tfo === 'true') {
        options.push('tfo=true');
    } else if (proxy.tfo === false || proxy.tfo === 'false') {
        options.push('tfo=false');
    }

    const rawIpVersion = proxy['ip-version'] || proxy['ip-preference'];
    const ipVersion = formatRingIpVersion(rawIpVersion);
    if (ipVersion) {
        options.push(`ip-version=${quoteRingValue(ipVersion)}`);
    }

    const rawEcn = proxy['tcp-ecn'] ?? proxy.ecn;
    const ecn = formatTcpEcn(rawEcn);
    if (ecn) {
        options.push(`tcp-ecn=${ecn}`);
    }

    const iface = proxy.interface || proxy['interface-name'];
    if (iface != null && `${iface}`.trim().length > 0) {
        options.push(`interface=${quoteRingValue(iface)}`);
    }

    const testUrl = proxy['override-test-url'] || proxy['test-url'];
    if (testUrl != null && `${testUrl}`.trim().length > 0) {
        options.push(`override-test-url=${quoteRingValue(testUrl)}`);
    }

    appendSingMuxOptions(options, proxy);

    const underlying =
        proxy['underlying-proxy'] ||
        proxy['dialer-proxy'] ||
        proxy.detour ||
        proxy.prev_hop;
    if (underlying != null && `${underlying}`.trim().length > 0) {
        options.push(`underlying-proxy=${quoteRingValue(underlying)}`);
    }

    const rawResolverType =
        proxy['dns-resolver-type'] ?? proxy.dns_resolver_type;
    const resolverType = formatDnsResolverType(rawResolverType);
    if (resolverType) {
        options.push(`dns-resolver-type=${resolverType}`);
    }

    const ip4pPrefix = proxy['ip4p-prefix'] || proxy.ip4p_prefix;
    if (ip4pPrefix != null && `${ip4pPrefix}`.trim().length > 0) {
        options.push(`ip4p-prefix=${quoteRingValue(ip4pPrefix)}`);
    }
}

export default function Ring_Producer() {
    const produce = (proxy, type, opts = {}) => {
        validateTransportPlugins(proxy);
        const isLocal = ['wireguard', 'tailscale', 'direct'].includes(
            proxy.type,
        );
        if (
            !isLocal &&
            (!proxy.server ||
                !/^\d+$/.test(String(proxy.port)) ||
                Number(proxy.port) < 1 ||
                Number(proxy.port) > 65535)
        ) {
            throw unsupported(
                'Ring 代理节点必须提供服务器和 1–65535 范围内的端口',
            );
        }
        if (
            ['ws', 'websocket'].includes(proxy.network || proxy.transport) &&
            proxy['ws-opts']?.['v2ray-http-upgrade']
        ) {
            throw unsupported(
                `Platform ${targetPlatform} does not support network ${proxy.network} with http upgrade`,
            );
        }
        proxy = {
            ...proxy,
            name: String(
                proxy.name || `${proxy.type} ${proxy.server}:${proxy.port}`,
            )
                .replace(/[=,\r\n\0"#;[\]]/g, '')
                .trim(),
        };
        if (!proxy.name) throw unsupported('Ring 节点名称不能为空');

        let result;
        switch (proxy.type) {
            case 'ss':
            case 'shadowsocks':
                result = shadowsocks(proxy);
                break;
            case 'vmess':
                result = vmess(proxy, opts['include-unsupported-proxy']);
                break;
            case 'vless':
                result = vless(proxy, opts['include-unsupported-proxy']);
                break;
            case 'trojan':
                result = trojan(proxy, opts['include-unsupported-proxy']);
                break;
            case 'hysteria':
            case 'hysteria2':
                result = hysteria(proxy);
                break;
            case 'tuic':
                result = tuic(proxy);
                break;
            case 'shadowquic':
                result = shadowquic(proxy);
                break;
            case 'wireguard':
                result = wireguard(proxy);
                break;
            case 'socks':
            case 'socks5':
                result = socks(proxy);
                break;
            case 'http':
            case 'https':
                result = http(proxy);
                break;
            case 'anytls':
                result = anytls(proxy, opts['include-unsupported-proxy']);
                break;
            case 'ssh':
                result = ssh(proxy);
                break;
            case 'tailscale':
                result = tailscale(proxy);
                break;
            case 'direct':
                result = direct(proxy);
                break;
            default:
                throw unsupported(
                    `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
                );
        }
        return result;
    };

    return { produce };
}

function formatHeaders(headers) {
    if (!headers) return '';
    if (typeof headers === 'string') return headers;
    if (typeof headers === 'object') {
        const pairs = [];
        for (const [key, value] of Object.entries(headers)) {
            if (value != null && `${value}`.length > 0) {
                pairs.push(`${key}:${value}`);
            }
        }
        return pairs.join('|');
    }
    return '';
}

function appendWsHeaders(options, proxy) {
    const rawHeaders =
        proxy['ws-opts']?.headers || proxy['ws-headers'] || proxy.headers || {};
    if (typeof rawHeaders === 'string') {
        options.push(`headers=${quoteRingValue(rawHeaders)}`);
        return;
    }
    const headers = typeof rawHeaders === 'object' ? { ...rawHeaders } : {};
    const host =
        proxy['ws-opts']?.headers?.Host ||
        proxy['ws-headers']?.Host ||
        proxy['ws-opts']?.headers?.host ||
        proxy['ws-headers']?.host ||
        proxy['ws-opts']?.host;
    if (host && !headers.Host && !headers.host) {
        headers.Host = host;
    }
    const formatted = formatHeaders(headers);
    if (formatted) {
        options.push(`headers=${quoteRingValue(formatted)}`);
    }
}

function shadowsocks(proxy) {
    const cipher = proxy.cipher || 'none';
    const password = quoteRingValue(proxy.password || '');
    const items = ['shadowsocks', quoteRingValue(proxy.server), proxy.port];
    const options = [
        `encrypt-method=${quoteRingValue(cipher)}`,
        `password=${password}`,
    ];

    if (proxy.plugin === 'obfs') {
        const plugin = proxy['plugin-opts'] || {};
        if (plugin.mode) options.push(`obfs=${quoteRingValue(plugin.mode)}`);
        if (plugin.host)
            options.push(`obfs-host=${quoteRingValue(plugin.host)}`);
        if (plugin.path)
            options.push(`obfs-path=${quoteRingValue(plugin.path)}`);
    }

    appendShadowTlsOptions(options, proxy);
    appendJlsOptions(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function vmess(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        proxy.network &&
        !['tcp', 'ws'].includes(proxy.network)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support vmess network ${proxy.network}`,
        );
    }

    const uuid = quoteRingValue(proxy.uuid || '');
    const items = ['vmess', quoteRingValue(proxy.server), proxy.port];
    const options = [`uuid=${uuid}`];

    const cipher = formatRingVmessCipher(proxy.cipher);
    if (cipher) {
        options.push(`cipher=${quoteRingValue(cipher)}`);
    }

    if (proxy.network === 'ws') {
        options.push('ws=true');
        const wsPath = proxy['ws-opts']?.path || proxy['ws-path'];
        if (wsPath) {
            options.push(`ws-path=${quoteRingValue(wsPath)}`);
        }
        appendWsHeaders(options, proxy);
    }

    appendTcpSecurity(options, proxy);

    if (proxy.aead !== undefined) {
        options.push(`aead=${isTrue(proxy.aead)}`);
    } else if (proxy.alterId === 0 || proxy.alterId === '0') {
        options.push('aead=true');
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

const VALID_VLESS_TLS_FINGERPRINTS = new Set([
    'unsafe',
    'chrome',
    'firefox',
    'safari',
    'ios',
    'android',
    'edge',
    '360',
    'qq',
    'random',
    'randomized',
    'randomizednoalpn',
    'hellofirefox_120',
    'hellofirefox_148',
    'hellochrome_120',
    'hellochrome_131',
    'hellochrome_133',
    'helloios_13',
    'helloios_14',
    'helloedge_106',
    'hellosafari_26_3',
    'hello360_11_0',
    'helloqq_11_1',
    'hellorandomized',
    'hellorandomizedalpn',
    'hellorandomizednoalpn',
    'hellofirefox_auto',
    'hellofirefox_55',
    'hellofirefox_56',
    'hellofirefox_63',
    'hellofirefox_65',
    'hellofirefox_99',
    'hellofirefox_102',
    'hellofirefox_105',
    'hellochrome_auto',
    'hellochrome_58',
    'hellochrome_62',
    'hellochrome_70',
    'hellochrome_72',
    'hellochrome_83',
    'hellochrome_87',
    'hellochrome_96',
    'hellochrome_100',
    'hellochrome_102',
    'hellochrome_106_shuffle',
    'helloios_auto',
    'helloios_11_1',
    'helloios_12_1',
    'helloandroid_11_okhttp',
    'helloedge_85',
    'helloedge_auto',
    'hellosafari_16_0',
    'hellosafari_auto',
    'hello360_auto',
    'hello360_7_5',
    'helloqq_auto',
    'hellochrome_100_psk',
    'hellochrome_112_psk_shuf',
    'hellochrome_114_padding_psk_shuf',
    'hellochrome_115_pq',
    'hellochrome_115_pq_psk',
    'hellochrome_120_pq',
]);

const VALID_VLESS_REALITY_FINGERPRINTS = new Set([
    'chrome',
    'firefox',
    'safari',
    'ios',
    'edge',
    'qq',
    'random',
    'randomized',
    'hellofirefox_120',
    'hellofirefox_148',
    'hellochrome_120',
    'hellochrome_131',
    'hellochrome_133',
    'helloios_13',
    'helloios_14',
    'helloedge_106',
    'hellosafari_26_3',
    'hello360_11_0',
    'helloqq_11_1',
    'hellorandomized',
    'hellofirefox_auto',
    'hellofirefox_63',
    'hellofirefox_65',
    'hellofirefox_99',
    'hellofirefox_102',
    'hellofirefox_105',
    'hellochrome_auto',
    'hellochrome_70',
    'hellochrome_72',
    'hellochrome_83',
    'hellochrome_87',
    'hellochrome_96',
    'hellochrome_100',
    'hellochrome_102',
    'hellochrome_106_shuffle',
    'helloios_auto',
    'helloedge_85',
    'helloedge_auto',
    'hellosafari_16_0',
    'hellosafari_auto',
    'helloqq_auto',
    'hellochrome_100_psk',
    'hellochrome_112_psk_shuf',
    'hellochrome_114_padding_psk_shuf',
    'hellochrome_115_pq',
    'hellochrome_115_pq_psk',
    'hellochrome_120_pq',
]);

const BLOCKED_VLESS_HTTP_HEADERS = new Set([
    'content-length',
    'transfer-encoding',
    'connection',
    'upgrade',
    'te',
]);

const VALID_VLESS_FLOWS = new Set([
    'xtls-rprx-vision',
    'xtls-rprx-vision-udp443',
]);

const VALID_VLESS_XHTTP_MODES = new Set([
    'auto',
    'packet-up',
    'stream-up',
    'stream-one',
]);

const VALID_VLESS_XHTTP_DOWNLOAD_KEYS = new Set([
    'address',
    'port',
    'security',
    'tls',
    'sni',
    'alpns',
    'skip-cert-verify',
    'server-cert-fingerprint-sha256',
    'enable-early-data',
    'reality-public-key',
    'reality-short-id',
    'fingerprint',
    'host',
    'path',
    'headers',
]);

const SUPPORTED_VLESS_XHTTP_OPT_KEYS = new Set([
    'path',
    'host',
    'headers',
    'mode',
    'xhttp-mode',
    'download-settings',
    'downloadSettings',
]);

function isNonEmptyString(val) {
    return val != null && String(stripQuotes(val)).trim().length > 0;
}

function firstNonEmptyValue(val) {
    if (Array.isArray(val)) {
        for (const item of val) {
            if (isNonEmptyString(item)) {
                return String(stripQuotes(item)).trim();
            }
        }
        return undefined;
    }
    if (isNonEmptyString(val)) {
        return String(stripQuotes(val)).trim();
    }
    return undefined;
}

function parseAlpnArray(alpn) {
    if (!alpn) return [];
    const values = Array.isArray(alpn)
        ? alpn
        : stripQuotes(String(alpn)).split(',');
    return values
        .filter((item) => item != null)
        .map((item) => String(stripQuotes(item)).trim())
        .filter((item) => item !== '');
}

function normalizeVlessFingerprint(
    rawFp,
    isReality,
    includeUnsupportedProxy,
) {
    const cleaned = firstNonEmptyValue(rawFp);
    if (!cleaned) return undefined;
    const lower = cleaned.toLowerCase();
    const allowed = isReality
        ? VALID_VLESS_REALITY_FINGERPRINTS
        : VALID_VLESS_TLS_FINGERPRINTS;
    if (allowed.has(lower)) {
        return lower;
    }
    if (!includeUnsupportedProxy) {
        throw unsupported(
            `Platform ${targetPlatform} does not support VLESS ${isReality ? 'REALITY' : 'TLS'} fingerprint ${cleaned}`,
        );
    }
    return undefined;
}

function validateVlessCertFingerprint(rawFp, includeUnsupportedProxy) {
    const cleaned = firstNonEmptyValue(rawFp);
    if (!cleaned) return undefined;
    const hex = cleaned.replace(/[:\s-]/g, '');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires 32-byte hex server-cert-fingerprint-sha256, got ${cleaned}`,
            );
        }
        return undefined;
    }
    return hex.toLowerCase();
}

function extractVlessHostAndHeaders(
    primaryHost,
    rawHeaders,
    includeUnsupportedProxy,
) {
    let host = firstNonEmptyValue(primaryHost);
    const pairs = [];

    if (typeof rawHeaders === 'string') {
        const trimmed = String(stripQuotes(rawHeaders)).trim();
        if (trimmed) {
            for (const entry of trimmed.split('|')) {
                const idx = entry.indexOf(':');
                if (idx <= 0) {
                    if (!includeUnsupportedProxy) {
                        throw unsupported(
                            `Platform ${targetPlatform} received invalid VLESS HTTP header entry: ${entry}`,
                        );
                    }
                    continue;
                }
                const key = entry.slice(0, idx).trim();
                const val = entry.slice(idx + 1).trim();
                if (/^host$/i.test(key)) {
                    if (!host && val) {
                        host = val;
                    }
                    continue;
                }
                if (BLOCKED_VLESS_HTTP_HEADERS.has(key.toLowerCase())) {
                    if (!includeUnsupportedProxy) {
                        throw unsupported(
                            `Platform ${targetPlatform} does not allow transport-managed VLESS HTTP header ${key}`,
                        );
                    }
                    continue;
                }
                if (val.length > 0) {
                    pairs.push(`${key}:${val}`);
                }
            }
        }
    } else if (rawHeaders && typeof rawHeaders === 'object') {
        for (const [rawKey, rawVal] of Object.entries(rawHeaders)) {
            const key = String(rawKey).trim();
            if (!key || /[\s:]/.test(key)) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} received invalid VLESS HTTP header name: ${rawKey}`,
                    );
                }
                continue;
            }
            const val = Array.isArray(rawVal)
                ? rawVal.map((v) => String(v).trim()).join(', ')
                : rawVal != null
                  ? String(rawVal).trim()
                  : '';
            if (!val) continue;
            if (/^host$/i.test(key)) {
                if (!host) {
                    host = val;
                }
                continue;
            }
            if (BLOCKED_VLESS_HTTP_HEADERS.has(key.toLowerCase())) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} does not allow transport-managed VLESS HTTP header ${key}`,
                    );
                }
                continue;
            }
            pairs.push(`${key}:${val}`);
        }
    }

    return {
        host,
        headers: pairs.join('|'),
    };
}

function validateAndNormalizeVlessPath(rawPath, includeUnsupportedProxy) {
    const path = firstNonEmptyValue(rawPath);
    if (!path) return undefined;
    if (/\s/.test(path)) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} VLESS HTTP path cannot contain whitespace: ${path}`,
            );
        }
        return undefined;
    }
    return path.startsWith('/') ? path : `/${path}`;
}

function appendVlessSecurityOptions(
    options,
    target,
    { transport, defaultAddress, includeUnsupportedProxy },
) {
    const tlsSettings =
        target.tlsSettings && typeof target.tlsSettings === 'object'
            ? target.tlsSettings
            : undefined;
    const realitySettings =
        target.realitySettings && typeof target.realitySettings === 'object'
            ? target.realitySettings
            : undefined;
    const realityOpts =
        target['reality-opts'] && typeof target['reality-opts'] === 'object'
            ? target['reality-opts']
            : realitySettings;

    const rawSecurity = isNonEmptyString(target.security)
        ? String(stripQuotes(target.security)).trim().toLowerCase()
        : undefined;
    if (
        rawSecurity &&
        !['none', 'tls', 'reality'].includes(rawSecurity) &&
        !includeUnsupportedProxy
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support VLESS security ${target.security}`,
        );
    }

    const rawPubKey =
        target['reality-public-key'] ??
        realityOpts?.['public-key'] ??
        realityOpts?.publicKey ??
        target['public-key'] ??
        target.publicKey;
    const rawShortId =
        target['reality-short-id'] ??
        realityOpts?.['short-id'] ??
        realityOpts?.shortId ??
        target['short-id'] ??
        target.shortId;

    // 兼容 Mihomo download-settings 中以 public-key: "" 显式取消 REALITY 继承并回退到普通 TLS 的写法
    const hasExplicitRealityCancel =
        realityOpts != null &&
        Object.prototype.hasOwnProperty.call(realityOpts, 'public-key') &&
        realityOpts['public-key'] === '' &&
        rawSecurity !== 'reality';

    if (
        rawSecurity === 'none' &&
        (isTrue(target.tls) ||
            isNonEmptyString(rawPubKey) ||
            isNonEmptyString(rawShortId))
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow TLS/REALITY fields when VLESS security=none`,
            );
        }
    }

    if (
        rawSecurity === 'tls' &&
        (isNonEmptyString(rawPubKey) || isNonEmptyString(rawShortId))
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow REALITY parameters when VLESS security=tls`,
            );
        }
    }

    const isReality =
        rawSecurity === 'reality' ||
        (!hasExplicitRealityCancel &&
            rawSecurity !== 'none' &&
            rawSecurity !== 'tls' &&
            (isNonEmptyString(rawPubKey) ||
                isNonEmptyString(rawShortId) ||
                realityOpts != null));

    const isTls =
        !isReality &&
        rawSecurity !== 'none' &&
        (rawSecurity === 'tls' || isTrue(target.tls) || tlsSettings != null);

    const alpnList = parseAlpnArray(
        target.alpns ?? target.alpn ?? tlsSettings?.alpn,
    );

    if (alpnList.includes('h3') && !includeUnsupportedProxy) {
        if (isReality) {
            throw unsupported(
                `Platform ${targetPlatform} does not support HTTP/3 with REALITY`,
            );
        }
        if (!isTls) {
            throw unsupported(
                `Platform ${targetPlatform} requires TLS for VLESS HTTP/3`,
            );
        }
        if (transport !== 'xhttp') {
            throw unsupported(
                `Platform ${targetPlatform} requires XHTTP transport for VLESS HTTP/3`,
            );
        }
        if (alpnList.length !== 1 || alpnList[0] !== 'h3') {
            throw unsupported(
                `Platform ${targetPlatform} requires exclusive h3 ALPN for VLESS HTTP/3`,
            );
        }
    }

    if (isReality) {
        if (transport === 'ws' && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not support VLESS REALITY over WebSocket`,
            );
        }
        const certFpOnReality = getServerCertFingerprintSha256(target);
        if (
            !includeUnsupportedProxy &&
            (certFpOnReality ||
                (rawSecurity === 'reality' &&
                    !target['reality-opts'] &&
                    isSkipCertVerify(target)))
        ) {
            throw unsupported('Ring REALITY 不允许覆盖协议证书认证');
        }
        const pubKeyCandidate = firstNonEmptyValue(rawPubKey);
        const pubKey = formatRealityPublicKey(pubKeyCandidate);
        if (
            !pubKey ||
            !/^[A-Za-z0-9_-]+$/.test(pubKey) ||
            pubKey === 'invalid'
        ) {
            if (!includeUnsupportedProxy) {
                throw unsupported(
                    `Platform ${targetPlatform} requires valid reality-public-key for VLESS REALITY`,
                );
            }
        }
        const shortId = firstNonEmptyValue(rawShortId);
        if (shortId) {
            if (
                !/^[0-9a-fA-F]+$/.test(shortId) ||
                shortId.length % 2 !== 0 ||
                shortId.length > 16
            ) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} received invalid VLESS reality-short-id: ${shortId}`,
                    );
                }
            }
        }
        const sni = firstNonEmptyValue(
            target.sni ??
                target.servername ??
                realityOpts?.['server-name'] ??
                realityOpts?.sni ??
                realitySettings?.serverName ??
                tlsSettings?.serverName ??
                defaultAddress,
        );
        if (!sni && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires sni for VLESS REALITY`,
            );
        }

        options.push('security=reality');
        if (sni) {
            options.push(`sni=${quoteRingValue(sni)}`);
        }
        if (alpnList.length > 0) {
            options.push(`alpns=${quoteRingValue(alpnList.join(','))}`);
        }
        if (pubKey) {
            options.push(`reality-public-key=${quoteRingValue(pubKey)}`);
        }
        if (shortId) {
            options.push(`reality-short-id=${quoteRingValue(shortId)}`);
        }
        const fp = normalizeVlessFingerprint(
            target['client-fingerprint'] ??
                target.fingerprint ??
                realitySettings?.fingerprint ??
                tlsSettings?.fingerprint,
            true,
            includeUnsupportedProxy,
        );
        if (fp) {
            options.push(`fingerprint=${quoteRingValue(fp)}`);
        }
        return { isTls: false, isReality: true };
    }

    if (isTls) {
        options.push('security=tls');
        const sni = firstNonEmptyValue(
            target.sni ??
                target.servername ??
                tlsSettings?.serverName ??
                defaultAddress,
        );
        if (sni) {
            options.push(`sni=${quoteRingValue(sni)}`);
        }
        if (alpnList.length > 0) {
            options.push(`alpns=${quoteRingValue(alpnList.join(','))}`);
        }
        const skipCertVerify =
            isSkipCertVerify(target) || tlsSettings?.allowInsecure === true;
        if (skipCertVerify) {
            options.push('skip-cert-verify=true');
        }
        const certFp =
            validateVlessCertFingerprint(
                target['server-cert-fingerprint-sha256'] ??
                    target['tls-fingerprint'],
                includeUnsupportedProxy,
            ) ?? getServerCertFingerprintSha256(target);
        if (certFp) {
            options.push(
                `server-cert-fingerprint-sha256=${quoteRingValue(certFp)}`,
            );
        }
        const fp = normalizeVlessFingerprint(
            target['client-fingerprint'] ??
                (!formatServerCertFingerprintSha256(target.fingerprint)
                    ? target.fingerprint
                    : undefined) ??
                tlsSettings?.fingerprint,
            false,
            includeUnsupportedProxy,
        );
        if (fp) {
            options.push(`fingerprint=${quoteRingValue(fp)}`);
        }
        return { isTls: true, isReality: false };
    }

    if (rawSecurity === 'none') {
        options.push('security=none');
    }
    const fp = normalizeVlessFingerprint(
        !formatServerCertFingerprintSha256(target.fingerprint)
            ? target.fingerprint
            : undefined,
        false,
        includeUnsupportedProxy,
    );
    if (fp) {
        options.push(`fingerprint=${quoteRingValue(fp)}`);
    }
    return { isTls: false, isReality: false };
}

function collectTopLevelXhttpDownloadFields(proxy, includeUnsupportedProxy) {
    const extracted = {};
    for (const [key, value] of Object.entries(proxy)) {
        if (key.startsWith('xhttp-download-') && value !== undefined) {
            const stripped = key.slice('xhttp-download-'.length);
            if (!stripped) continue;
            if (
                !VALID_VLESS_XHTTP_DOWNLOAD_KEYS.has(stripped) &&
                !includeUnsupportedProxy
            ) {
                throw unsupported(
                    `Platform ${targetPlatform} does not support VLESS option ${key}`,
                );
            }
            extracted[stripped] = value;
        }
    }
    return Object.keys(extracted).length > 0 ? extracted : undefined;
}

function resolveVlessXhttpDownloadSource(proxy, includeUnsupportedProxy) {
    const rawFlag = proxy['xhttp-download'];
    const topLevelFields = collectTopLevelXhttpDownloadFields(
        proxy,
        includeUnsupportedProxy,
    );
    const nestedDownload =
        (rawFlag && typeof rawFlag === 'object' ? rawFlag : undefined) ??
        proxy['xhttp-opts']?.['download-settings'] ??
        proxy['xhttp-opts']?.downloadSettings ??
        proxy['splithttp-opts']?.['download-settings'] ??
        proxy['splithttp-opts']?.downloadSettings ??
        proxy['download-settings'];

    if (rawFlag === false || rawFlag === 'false') {
        if (topLevelFields && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow xhttp-download-* fields when xhttp-download=false`,
            );
        }
        return undefined;
    }

    if (
        rawFlag != null &&
        typeof rawFlag !== 'object' &&
        rawFlag !== true &&
        rawFlag !== 'true'
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires xhttp-download=true with flat xhttp-download-* options, got ${rawFlag}`,
            );
        }
        return undefined;
    }

    const isEnabled =
        rawFlag === true ||
        rawFlag === 'true' ||
        topLevelFields != null ||
        nestedDownload != null;

    if (!isEnabled) {
        return undefined;
    }

    if (
        nestedDownload != null &&
        (typeof nestedDownload !== 'object' || Array.isArray(nestedDownload))
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires download-settings to be an object`,
            );
        }
        return undefined;
    }

    return {
        ...(nestedDownload || {}),
        ...(topLevelFields || {}),
    };
}

function normalizeXhttpMode(rawMode, includeUnsupportedProxy) {
    const cleaned = firstNonEmptyValue(rawMode);
    if (!cleaned) return undefined;
    const lower = cleaned.toLowerCase();
    const mapped =
        {
            packetup: 'packet-up',
            streamup: 'stream-up',
            streamone: 'stream-one',
        }[lower] || lower;
    if (!VALID_VLESS_XHTTP_MODES.has(mapped)) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not support VLESS xhttp-mode ${rawMode}`,
            );
        }
        return undefined;
    }
    return mapped;
}

function appendVlessXhttpDownloadOptions(
    options,
    rawDownload,
    { proxy, uploadPath, xhttpMode, includeUnsupportedProxy },
) {
    if (isEnableEarlyData(rawDownload) && !includeUnsupportedProxy) {
        throw unsupported(
            `Platform ${targetPlatform} does not support xhttp-download-enable-early-data`,
        );
    }

    if (isNonEmptyString(rawDownload.network)) {
        const dlNet = String(stripQuotes(rawDownload.network))
            .trim()
            .toLowerCase();
        if (
            dlNet !== 'xhttp' &&
            dlNet !== 'splithttp' &&
            !includeUnsupportedProxy
        ) {
            throw unsupported(
                `Platform ${targetPlatform} does not support xhttp-download network ${rawDownload.network}`,
            );
        }
    }

    const nestedXhttp =
        rawDownload.xhttpSettings &&
        typeof rawDownload.xhttpSettings === 'object'
            ? rawDownload.xhttpSettings
            : rawDownload['xhttp-opts'] &&
                typeof rawDownload['xhttp-opts'] === 'object'
              ? rawDownload['xhttp-opts']
              : undefined;

    const dlMode = normalizeXhttpMode(
        rawDownload.mode ?? nestedXhttp?.mode,
        includeUnsupportedProxy,
    );
    if (dlMode) {
        const effectiveUploadMode = xhttpMode || 'auto';
        if (
            (dlMode === 'stream-one' ||
                (xhttpMode && dlMode !== effectiveUploadMode)) &&
            !includeUnsupportedProxy
        ) {
            throw unsupported(
                `Platform ${targetPlatform} does not support xhttp-download mode ${dlMode}`,
            );
        }
    }

    const address = firstNonEmptyValue(
        rawDownload.address ?? rawDownload.server,
    );
    if (!address) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires xhttp-download-address for VLESS xhttp-download`,
            );
        }
        return;
    }

    const rawPort = rawDownload.port;
    const port = Number(rawPort);
    if (
        rawPort == null ||
        !Number.isInteger(port) ||
        port <= 0 ||
        port > 65535
    ) {
        if (!includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} requires valid xhttp-download-port for VLESS xhttp-download`,
            );
        }
        return;
    }

    options.push('xhttp-download=true');
    options.push(`xhttp-download-address=${quoteRingValue(address)}`);
    options.push(`xhttp-download-port=${port}`);

    const dlSecFields = [];
    appendVlessSecurityOptions(dlSecFields, rawDownload, {
        transport: 'xhttp',
        defaultAddress: address,
        includeUnsupportedProxy,
    });
    for (const secField of dlSecFields) {
        options.push(`xhttp-download-${secField}`);
    }

    const { host: dlHost, headers: dlHeaders } = extractVlessHostAndHeaders(
        rawDownload.host ?? nestedXhttp?.host,
        rawDownload.headers ??
            nestedXhttp?.headers ??
            nestedXhttp?.extra?.headers,
        includeUnsupportedProxy,
    );
    if (dlHost) {
        options.push(`xhttp-download-host=${quoteRingValue(dlHost)}`);
    }

    const explicitDlPath = validateAndNormalizeVlessPath(
        rawDownload.path ?? nestedXhttp?.path,
        includeUnsupportedProxy,
    );
    const effectiveUploadPath = uploadPath || '/';
    if (
        explicitDlPath &&
        explicitDlPath !== effectiveUploadPath &&
        !includeUnsupportedProxy
    ) {
        throw unsupported(
            `Platform ${targetPlatform} requires xhttp-download-path (${explicitDlPath}) to match upload path (${effectiveUploadPath})`,
        );
    }
    const finalDlPath = explicitDlPath ?? uploadPath;
    if (finalDlPath) {
        options.push(`xhttp-download-path=${quoteRingValue(finalDlPath)}`);
    }

    if (dlHeaders) {
        options.push(`xhttp-download-headers=${quoteRingValue(dlHeaders)}`);
    }
}

function vless(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        (isPresent(proxy, 'plugin') ||
            proxy['shadow-tls'] ||
            proxy['shadow-tls-opts'] ||
            proxy.jls)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support plugins on VLESS`,
        );
    }

    if (
        !includeUnsupportedProxy &&
        (proxy['ech-opts'] || proxy._echConfigList)
    ) {
        throw unsupported('Ring VLESS 不支持 ECH 配置');
    }

    if (isPresent(proxy, 'encryption')) {
        const enc = String(stripQuotes(proxy.encryption)).trim().toLowerCase();
        if (enc !== '' && enc !== 'none' && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} only supports VLESS encryption=none, got ${proxy.encryption}`,
            );
        }
    }

    const rawTransport = proxy.transport ?? proxy.network;
    const normTransport = isNonEmptyString(rawTransport)
        ? String(stripQuotes(rawTransport)).trim().toLowerCase()
        : 'tcp';

    let transport;
    switch (normTransport) {
        case 'tcp':
        case 'raw':
            transport = 'tcp';
            break;
        case 'ws':
        case 'websocket':
            transport = 'ws';
            break;
        case 'grpc':
            transport = 'grpc';
            break;
        case 'xhttp':
        case 'splithttp':
            transport = 'xhttp';
            break;
        default:
            if (!includeUnsupportedProxy) {
                throw unsupported(
                    `Platform ${targetPlatform} does not support VLESS transport ${rawTransport}`,
                );
            }
            transport = normTransport;
            break;
    }

    const uuid = firstNonEmptyValue(proxy.uuid);
    if (!uuid && !includeUnsupportedProxy) {
        throw unsupported(`Platform ${targetPlatform} requires VLESS uuid`);
    }

    const items = ['vless', quoteRingValue(proxy.server), proxy.port];
    const options = [`uuid=${quoteRingValue(uuid || '')}`];

    let flow;
    if (isNonEmptyString(proxy.flow)) {
        const rawFlow = String(stripQuotes(proxy.flow)).trim();
        const lowerFlow = rawFlow.toLowerCase();
        if (lowerFlow !== 'none') {
            if (!VALID_VLESS_FLOWS.has(lowerFlow)) {
                if (!includeUnsupportedProxy) {
                    throw unsupported(
                        `Platform ${targetPlatform} does not support VLESS flow ${rawFlow}`,
                    );
                }
            } else {
                flow = lowerFlow;
                options.push(`flow=${flow}`);
            }
        }
    }

    const rawPacketEncoding =
        proxy['packet-encoding'] ??
        proxy.packet_encoding ??
        (isTrue(proxy['packet-addr']) ? 'packet' : undefined);
    const hasExplicitPacketEncoding =
        Object.prototype.hasOwnProperty.call(proxy, 'packet-encoding') ||
        Object.prototype.hasOwnProperty.call(proxy, 'packet_encoding') ||
        isTrue(proxy['packet-addr']);
    if (hasExplicitPacketEncoding && rawPacketEncoding != null) {
        const pe = String(stripQuotes(rawPacketEncoding)).trim().toLowerCase();
        if (
            pe === 'packet' ||
            pe === 'packetaddr' ||
            pe === 'none' ||
            pe === ''
        ) {
            if (!flow) {
                options.push('packet-encoding=packet');
            }
        } else if (pe !== 'xudp' && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not support VLESS packet-encoding ${rawPacketEncoding}`,
            );
        }
    }

    if (transport !== 'tcp' || isNonEmptyString(proxy.transport)) {
        options.push(`transport=${transport}`);
    }

    const resolvedXhttpDownload = resolveVlessXhttpDownloadSource(
        proxy,
        includeUnsupportedProxy,
    );

    if (
        resolvedXhttpDownload != null &&
        transport !== 'xhttp' &&
        !includeUnsupportedProxy
    ) {
        throw unsupported(
            `Platform ${targetPlatform} only supports xhttp-download with XHTTP transport`,
        );
    }

    let uploadPathForXhttp;
    let xhttpMode;

    if (transport === 'ws') {
        const wsOpts = proxy['ws-opts'] || {};
        const { host, headers } = extractVlessHostAndHeaders(
            proxy.host ?? wsOpts.host,
            wsOpts.headers ?? proxy['ws-headers'] ?? proxy.headers,
            includeUnsupportedProxy,
        );
        if (host) {
            options.push(`host=${quoteRingValue(host)}`);
        }
        const path = validateAndNormalizeVlessPath(
            proxy.path ?? wsOpts.path ?? proxy['ws-path'],
            includeUnsupportedProxy,
        );
        if (path) {
            options.push(`path=${quoteRingValue(path)}`);
        }
        if (headers) {
            options.push(`headers=${quoteRingValue(headers)}`);
        }
    } else if (transport === 'grpc') {
        const grpcOpts = proxy['grpc-opts'] || {};
        const serviceName = firstNonEmptyValue(
            proxy['grpc-service-name'] ??
                grpcOpts['grpc-service-name'] ??
                grpcOpts['service-name'] ??
                grpcOpts.serviceName ??
                proxy['service-name'] ??
                proxy.serviceName,
        );
        if (serviceName) {
            options.push(`grpc-service-name=${quoteRingValue(serviceName)}`);
        }
        const authority = firstNonEmptyValue(
            proxy['grpc-authority'] ??
                grpcOpts['grpc-authority'] ??
                grpcOpts['_grpc-authority'] ??
                grpcOpts.authority ??
                proxy.authority,
        );
        if (authority) {
            options.push(`grpc-authority=${quoteRingValue(authority)}`);
        }
        const multiMode =
            isTrue(
                proxy['grpc-multi-mode'] ??
                    proxy.grpc_multi_mode ??
                    grpcOpts['grpc-multi-mode'] ??
                    grpcOpts['multi-mode'] ??
                    grpcOpts.multiMode,
            ) ||
            String(
                grpcOpts['_grpc-type'] ??
                    grpcOpts['grpc-mode'] ??
                    grpcOpts.mode ??
                    '',
            )
                .trim()
                .toLowerCase() === 'multi';
        if (multiMode) {
            options.push('grpc-multi-mode=true');
        }
    } else if (transport === 'xhttp') {
        const xhttpOpts =
            proxy['xhttp-opts'] || proxy['splithttp-opts'] || {};
        if (!includeUnsupportedProxy) {
            if (
                Object.entries(xhttpOpts).some(
                    ([key, value]) =>
                        value != null &&
                        !SUPPORTED_VLESS_XHTTP_OPT_KEYS.has(key),
                ) ||
                proxy._extra_unsupported != null
            ) {
                throw unsupported(
                    'Ring XHTTP 不支持自定义填充、连接池复用或未知扩展参数',
                );
            }
        }
        const { host, headers } = extractVlessHostAndHeaders(
            proxy.host ?? xhttpOpts.host,
            xhttpOpts.headers ?? proxy.headers,
            includeUnsupportedProxy,
        );
        if (host) {
            options.push(`host=${quoteRingValue(host)}`);
        }
        uploadPathForXhttp = validateAndNormalizeVlessPath(
            proxy.path ?? xhttpOpts.path ?? proxy['xhttp-path'],
            includeUnsupportedProxy,
        );
        if (uploadPathForXhttp) {
            options.push(`path=${quoteRingValue(uploadPathForXhttp)}`);
        }
        if (headers) {
            options.push(`headers=${quoteRingValue(headers)}`);
        }

        const rawMode =
            proxy['xhttp-mode'] ??
            xhttpOpts.mode ??
            xhttpOpts['xhttp-mode'] ??
            proxy.mode ??
            proxy._mode;
        xhttpMode = normalizeXhttpMode(rawMode, includeUnsupportedProxy);
        if (xhttpMode) {
            options.push(`xhttp-mode=${xhttpMode}`);
        }
    }

    const { isTls, isReality } = appendVlessSecurityOptions(options, proxy, {
        transport,
        defaultAddress: proxy.server,
        includeUnsupportedProxy,
    });

    if (transport === 'xhttp' && resolvedXhttpDownload != null) {
        if (xhttpMode === 'stream-one' && !includeUnsupportedProxy) {
            throw unsupported(
                `Platform ${targetPlatform} does not allow xhttp-download when xhttp-mode=stream-one`,
            );
        }
        appendVlessXhttpDownloadOptions(options, resolvedXhttpDownload, {
            proxy,
            uploadPath: uploadPathForXhttp,
            xhttpMode,
            includeUnsupportedProxy,
        });
    }

    if (flow && !includeUnsupportedProxy) {
        if (transport !== 'tcp') {
            throw unsupported(
                `Platform ${targetPlatform} requires TCP transport for VLESS flow ${flow}`,
            );
        }
        if (!isTls && !isReality) {
            throw unsupported(
                `Platform ${targetPlatform} requires TLS or REALITY for VLESS flow ${flow}`,
            );
        }
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function trojan(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        proxy.network &&
        !['tcp', 'ws'].includes(proxy.network)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support trojan network ${proxy.network}`,
        );
    }

    const password = quoteRingValue(proxy.password || '');
    const items = ['trojan', quoteRingValue(proxy.server), proxy.port];
    const options = [`password=${password}`];

    appendTcpSecurity(options, proxy, true);

    if (proxy.network === 'ws') {
        options.push('ws=true');
        const wsPath = proxy['ws-opts']?.path || proxy['ws-path'];
        if (wsPath) {
            options.push(`ws-path=${quoteRingValue(wsPath)}`);
        }
        appendWsHeaders(options, proxy);
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function formatHysteriaDown(down) {
    if (down == null) return '';
    const s = String(down).trim().toLowerCase();
    if (/^\d+$/.test(s)) {
        return s;
    }
    return s.replace(/\s+/g, '');
}

function appendRealmOptions(options, proxy) {
    const realm = proxy.realm;
    if (realm != null && `${realm}`.trim().length > 0) {
        options.push(`realm=${quoteRingValue(realm)}`);
    }

    const realmUnderlying =
        proxy['realm-underlying-proxy'] || proxy.realm_underlying_proxy;
    if (realmUnderlying != null && `${realmUnderlying}`.trim().length > 0) {
        options.push(
            `realm-underlying-proxy=${quoteRingValue(realmUnderlying)}`,
        );
    }

    const realmStun = proxy['realm-stun'] || proxy.realm_stun;
    if (realmStun) {
        const formattedStun = Array.isArray(realmStun)
            ? realmStun
                  .map((x) => String(stripQuotes(x)).trim())
                  .filter(Boolean)
                  .join(',')
            : String(stripQuotes(realmStun)).trim();
        if (formattedStun) {
            options.push(`realm-stun=${quoteRingValue(formattedStun)}`);
        }
    }

    const stunTimeout = proxy['realm-stun-timeout'] ?? proxy.realm_stun_timeout;
    if (stunTimeout != null && !Number.isNaN(Number(stunTimeout))) {
        const parsed = parseInt(stunTimeout, 10);
        if (parsed > 0) {
            options.push(`realm-stun-timeout=${parsed}`);
        }
    }

    const httpTimeout = proxy['realm-http-timeout'] ?? proxy.realm_http_timeout;
    if (httpTimeout != null && !Number.isNaN(Number(httpTimeout))) {
        const parsed = parseInt(httpTimeout, 10);
        if (parsed > 0) {
            options.push(`realm-http-timeout=${parsed}`);
        }
    }

    const punchTimeout =
        proxy['realm-punch-timeout'] ?? proxy.realm_punch_timeout;
    if (punchTimeout != null && !Number.isNaN(Number(punchTimeout))) {
        const parsed = parseInt(punchTimeout, 10);
        if (parsed > 0) {
            options.push(`realm-punch-timeout=${parsed}`);
        }
    }

    const realmInsecure = proxy['realm-insecure'] ?? proxy.realm_insecure;
    if (realmInsecure === true || realmInsecure === 'true') {
        options.push('realm-insecure=true');
    } else if (realmInsecure === false || realmInsecure === 'false') {
        options.push('realm-insecure=false');
    }

    const realmSni = proxy['realm-sni'] || proxy.realm_sni;
    if (realmSni != null && `${realmSni}`.trim().length > 0) {
        options.push(`realm-sni=${quoteRingValue(realmSni)}`);
    }

    const rawRealmFp =
        proxy['realm-server-cert-fingerprint-sha256'] ||
        proxy.realm_server_cert_fingerprint_sha256 ||
        proxy['realm-fingerprint'] ||
        proxy['realm-tls-fingerprint'];
    const realmFp = formatServerCertFingerprintSha256(rawRealmFp);
    if (realmFp) {
        options.push(`realm-server-cert-fingerprint-sha256=${realmFp}`);
    }
}

function hysteria(proxy) {
    const items = ['hysteria', quoteRingValue(proxy.server), proxy.port];
    const options = [];

    const auth = proxy.auth || proxy.password || proxy.auth_str;
    if (auth != null && `${auth}`.length > 0) {
        options.push(`auth=${quoteRingValue(auth)}`);
    }

    const downVal = proxy.down ?? proxy['down-mbps'] ?? proxy.down_mbps;
    const down = formatHysteriaDown(downVal);
    if (down) {
        options.push(`down=${quoteRingValue(down)}`);
    }

    const obfs =
        proxy['obfs-password'] ??
        (typeof proxy.obfs === 'string' ? proxy.obfs : undefined);
    if (obfs != null && `${obfs}`.length > 0) {
        options.push(`obfs=${quoteRingValue(obfs)}`);
    }

    appendTlsOptions(options, proxy);
    appendRealmOptions(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function tuic(proxy) {
    if (
        !proxy.uuid ||
        !proxy.password ||
        (proxy.version != null && String(proxy.version) !== '5')
    ) {
        throw unsupported('Ring 仅支持使用 UUID 和密码认证的 TUIC v5');
    }
    const items = ['tuic', quoteRingValue(proxy.server), proxy.port];
    const options = [];

    if (proxy.uuid) {
        options.push(`uuid=${quoteRingValue(proxy.uuid)}`);
    }

    const password = proxy.password;
    if (password) {
        options.push(`password=${quoteRingValue(password)}`);
    }

    appendUdpRelayMode(options, proxy);

    appendTlsOptions(options, proxy, false);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function appendUdpRelayMode(options, proxy) {
    const rawMode = proxy['udp-relay-mode'] ?? proxy.udp_relay_mode;
    if (rawMode == null) return;
    const mode = String(rawMode).trim().toLowerCase();
    if (!['native', 'quic'].includes(mode)) {
        throw unsupported('Ring UDP 转发模式必须为 native 或 quic');
    }
    options.push(`udp-relay-mode=${mode}`);
}

function shadowquic(proxy) {
    if (!proxy.username || !proxy.password) {
        throw unsupported('Ring ShadowQUIC 必须提供用户名和密码');
    }
    if (
        isFalse(proxy.tls) ||
        isSkipCertVerify(proxy) ||
        getServerCertFingerprintSha256(proxy)
    ) {
        throw unsupported('Ring ShadowQUIC 不支持关闭 TLS 或覆盖 JLS 认证');
    }
    const options = [
        `username=${quoteRingValue(proxy.username)}`,
        `password=${quoteRingValue(proxy.password)}`,
        `sni=${quoteRingValue(proxy.sni || proxy.server)}`,
    ];
    appendUdpRelayMode(options, proxy);
    appendAlpns(options, proxy);
    if (isEnableEarlyData(proxy)) options.push('enable-early-data=true');
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${[
        'shadowquic',
        quoteRingValue(proxy.server),
        proxy.port,
        ...options,
    ].join(', ')}`;
}

function cleanIpWithoutMask(val) {
    if (!val) return '';
    const s = String(stripQuotes(val)).trim();
    return s.replace(/\/\d+$/, '').trim();
}

function formatWireGuardReserved(val) {
    if (!val) return '';
    let parts;
    if (Array.isArray(val)) {
        parts = val;
    } else {
        const s = String(val).replace(/[[\]]/g, '').trim();
        parts = s
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
    }
    if (
        parts.length !== 3 ||
        parts.some((part) => String(part).trim() !== '0')
    ) {
        throw unsupported('Ring WireGuard reserved 仅支持 [0,0,0]');
    }
    return '[0,0,0]';
}

function wireguard(proxy) {
    const rawList = [];
    if (proxy.addresses) {
        const raw = Array.isArray(proxy.addresses)
            ? proxy.addresses
            : [proxy.addresses];
        rawList.push(...raw);
    } else {
        if (proxy.ip) rawList.push(proxy.ip);
        if (proxy.ipv6) rawList.push(proxy.ipv6);
    }
    const cleanIps = rawList
        .flatMap((item) => String(stripQuotes(item)).split(','))
        .map((item) => cleanIpWithoutMask(item))
        .filter(Boolean);
    const addrStr = cleanIps.join(', ');

    const peers = [];
    const rawPeers = Array.isArray(proxy.peers)
        ? proxy.peers
        : [
              {
                  'public-key': proxy['public-key'],
                  server: proxy.server,
                  port: proxy.port,
                  'allowed-ips': proxy['allowed-ips'],
                  'pre-shared-key':
                      proxy['pre-shared-key'] || proxy['preshared-key'],
                  reserved: proxy.reserved,
                  keepalive:
                      proxy.keepalive ??
                      proxy['persistent-keepalive'] ??
                      proxy.persistent_keepalive,
              },
          ];

    if (rawPeers.length !== 1) {
        throw unsupported('Ring WireGuard 必须恰好配置一个 Peer');
    }

    for (const p of rawPeers) {
        const peerParts = [];
        if (p['public-key']) {
            peerParts.push(`public-key=${quoteRingValue(p['public-key'])}`);
        }
        const endpoint =
            p.endpoint ||
            (p.server && p.port
                ? `${
                      p.server.includes(':') && !p.server.startsWith('[')
                          ? `[${p.server}]`
                          : p.server
                  }:${p.port}`
                : '');
        if (endpoint) {
            peerParts.push(`endpoint=${quoteRingValue(endpoint)}`);
        }
        const allowedIpsRaw = p['allowed-ips'] || '0.0.0.0/0, ::/0';
        const allowedIps = Array.isArray(allowedIpsRaw)
            ? allowedIpsRaw.join(', ')
            : String(allowedIpsRaw);
        peerParts.push(`allowed-ips=${quoteRingValue(allowedIps)}`);
        const psk = p['pre-shared-key'] || p['preshared-key'];
        if (psk) {
            peerParts.push(`preshared-key=${quoteRingValue(psk)}`);
        }
        if (p.reserved) {
            peerParts.push(`reserved=${formatWireGuardReserved(p.reserved)}`);
        }
        const keepalive =
            p.keepalive ?? p['persistent-keepalive'] ?? p.persistent_keepalive;
        appendIntegerOption(peerParts, 'keepalive', keepalive, 0, 65535);
        peers.push(`{${peerParts.join(',')}}`);
    }

    const items = [
        'wireguard',
        `addresses=${quoteRingValue(addrStr)}`,
        `private-key=${quoteRingValue(proxy['private-key'] || '')}`,
    ];
    appendIntegerOption(items, 'mtu', proxy.mtu ?? 1280, 1);

    const dnsVal = proxy.dns || proxy['dns-servers'];
    if (dnsVal) {
        const rawDns = Array.isArray(dnsVal) ? dnsVal : [dnsVal];
        const dnsStr = rawDns
            .flatMap((item) => String(stripQuotes(item)).split(','))
            .map((item) => String(stripQuotes(item)).trim())
            .filter(Boolean)
            .join(', ');
        if (dnsStr) {
            items.push(`dns=${quoteRingValue(dnsStr)}`);
        }
    }

    items.push(`peers=[${peers.join(',')}]`);

    const options = [];
    appendCongestionControl(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function socks(proxy) {
    const items = ['socks', quoteRingValue(proxy.server), proxy.port];
    const options = [];
    if (isPresent(proxy, 'username')) {
        options.push(`username=${quoteRingValue(proxy.username)}`);
        options.push(`password=${quoteRingValue(proxy.password || '')}`);
    }
    appendTcpSecurity(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function http(proxy) {
    const items = ['http', quoteRingValue(proxy.server), proxy.port];
    const options = [];
    if (isPresent(proxy, 'username')) {
        options.push(`username=${quoteRingValue(proxy.username)}`);
        options.push(`password=${quoteRingValue(proxy.password || '')}`);
    }

    if (proxy.headers) {
        const formatted = formatHeaders(proxy.headers);
        if (formatted) {
            options.push(`headers=${quoteRingValue(formatted)}`);
        }
    }

    appendTcpSecurity(
        options,
        proxy,
        isTrue(proxy.tls) || proxy.type === 'https',
    );
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function anytls(proxy, includeUnsupportedProxy) {
    if (
        !includeUnsupportedProxy &&
        proxy.network &&
        !['tcp'].includes(proxy.network)
    ) {
        throw unsupported(
            `Platform ${targetPlatform} does not support proxy type ${proxy.type} with network ${proxy.network}`,
        );
    }
    const items = ['anytls', quoteRingValue(proxy.server), proxy.port];
    const options = [];
    if (proxy.password) {
        options.push(`password=${quoteRingValue(proxy.password)}`);
    }

    const checkInterval =
        proxy['idle-session-check-interval'] ??
        proxy.idle_session_check_interval;
    appendIntegerOption(
        options,
        'idle-session-check-interval',
        checkInterval,
        1,
    );

    const idleTimeout =
        proxy['idle-session-timeout'] ?? proxy.idle_session_timeout;
    appendIntegerOption(options, 'idle-session-timeout', idleTimeout, 1);

    const minIdle = proxy['min-idle-session'] ?? proxy.min_idle_session;
    appendIntegerOption(options, 'min-idle-session', minIdle);

    const maxStreams =
        proxy['max-streams-per-session'] ?? proxy.max_streams_per_session;
    appendIntegerOption(options, 'max-streams-per-session', maxStreams, 1);

    if (
        !appendShadowTlsOptions(options, proxy) &&
        !appendJlsOptions(options, proxy)
    ) {
        if (isTrue(proxy.tls)) options.push('tls=true');
        appendTlsOptions(options, proxy);
    }

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function ssh(proxy) {
    const items = ['ssh', quoteRingValue(proxy.server), proxy.port];
    const options = [];
    if (isPresent(proxy, 'username')) {
        options.push(`username=${quoteRingValue(proxy.username)}`);
    }
    if (isPresent(proxy, 'password')) {
        options.push(`password=${quoteRingValue(proxy.password)}`);
    }
    const privateKey = proxy['private-key'] || proxy['keystore-private-key'];
    if (!proxy.username || Boolean(proxy.password) === Boolean(privateKey)) {
        throw unsupported(
            'Ring SSH 必须提供用户名，并在密码与命名私钥中选择一种认证方式',
        );
    }
    if (privateKey != null && `${privateKey}`.trim().length > 0) {
        options.push(`private-key=${quoteRingValue(privateKey)}`);
    }

    const idleTimeout = proxy['idle-timeout'] ?? proxy.idle_timeout;
    appendIntegerOption(options, 'idle-timeout', idleTimeout);

    const serverFp =
        proxy['server-fingerprint'] ||
        proxy.server_fingerprint ||
        proxy['host-key'] ||
        proxy.host_key;
    if (serverFp) {
        const fpStr = Array.isArray(serverFp)
            ? serverFp.join(', ')
            : String(serverFp).trim();
        if (fpStr) {
            options.push(`server-fingerprint=${quoteRingValue(fpStr)}`);
        }
    }

    appendShadowTlsOptions(options, proxy);
    appendJlsOptions(options, proxy);

    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

const VALID_TAILSCALE_CONNECTION_MODES = new Set([
    'auto',
    'no-peer-relay',
    'derp-only',
]);

function tailscale(proxy) {
    const items = ['tailscale'];
    const options = [];
    const rawAuthKey = proxy['auth-key'] ?? proxy.authkey ?? proxy.auth_key;
    const authKey = firstNonEmptyValue(rawAuthKey);
    if (!authKey) throw unsupported('Ring Tailscale 必须提供预授权密钥');
    options.push(`auth-key=${quoteRingValue(authKey)}`);

    const hostname = firstNonEmptyValue(
        proxy.hostname ?? proxy['device-name'] ?? proxy.device_name,
    );
    if (hostname) {
        options.push(`hostname=${quoteRingValue(hostname)}`);
    }

    const rawControlUrl = proxy['control-url'] ?? proxy.control_url;
    if (rawControlUrl != null) {
        const controlUrl = String(stripQuotes(rawControlUrl)).trim();
        if (!controlUrl.startsWith('https://')) {
            throw unsupported('Ring Tailscale control-url 必须以 https:// 开头');
        }
        options.push(`control-url=${quoteRingValue(controlUrl)}`);
    }

    const rawExitNode = proxy['exit-node'] ?? proxy.exit_node;
    if (rawExitNode != null) {
        const exitNode = String(stripQuotes(rawExitNode)).trim();
        if (!exitNode) {
            throw unsupported('Ring Tailscale exit-node 不能为空');
        }
        options.push(`exit-node=${quoteRingValue(exitNode)}`);
    }

    const httpUnderlying =
        proxy['http-underlying-proxy'] || proxy.http_underlying_proxy;
    if (httpUnderlying != null && `${httpUnderlying}`.trim().length > 0) {
        options.push(`http-underlying-proxy=${quoteRingValue(httpUnderlying)}`);
    }

    const dnsServer =
        proxy['dns-server'] ||
        proxy.dns_server ||
        proxy['dns-servers'] ||
        proxy.dns;
    if (dnsServer) {
        const dnsStr = Array.isArray(dnsServer)
            ? dnsServer
                  .map((x) => String(stripQuotes(x)).trim())
                  .filter(Boolean)
                  .join(',')
            : String(stripQuotes(dnsServer)).trim();
        if (dnsStr) {
            options.push(`dns-server=${quoteRingValue(dnsStr)}`);
        }
    }

    const rawConnectionMode =
        proxy['connection-mode'] ??
        proxy.connection_mode ??
        proxy.connectionMode;
    const derpOnly = proxy['derp-only'] ?? proxy.derp_only;
    if (rawConnectionMode != null) {
        const mode = String(stripQuotes(rawConnectionMode))
            .trim()
            .toLowerCase();
        if (!VALID_TAILSCALE_CONNECTION_MODES.has(mode)) {
            throw unsupported(
                'Ring Tailscale connection-mode 必须为 auto、no-peer-relay 或 derp-only',
            );
        }
        options.push(`connection-mode=${mode}`);
    } else if (derpOnly != null) {
        if (derpOnly === true || derpOnly === 'true') {
            options.push('derp-only=true');
        } else if (derpOnly === false || derpOnly === 'false') {
            options.push('derp-only=false');
        } else {
            throw unsupported('Ring Tailscale derp-only 必须为布尔值');
        }
    }

    const ephemeral = proxy.ephemeral;
    if (ephemeral === true || ephemeral === 'true') {
        options.push('ephemeral=true');
    } else if (ephemeral === false || ephemeral === 'false') {
        options.push('ephemeral=false');
    }
    const mtu = proxy.mtu;
    appendIntegerOption(options, 'mtu', mtu, 1);

    appendCongestionControl(options, proxy);
    appendCommonOptions(options, proxy);
    return `${proxy.name} = ${items.concat(options).join(', ')}`;
}

function appendCongestionControl(options, proxy) {
    const value = proxy['congestion-control'];
    if (value == null) return;
    const control = String(value).trim().toLowerCase();
    if (!['bbrv3', 'bbr', 'cubic'].includes(control)) {
        throw unsupported('Ring 隧道拥塞控制必须为 bbrv3、bbr 或 cubic');
    }
    options.push(`congestion-control=${control}`);
}

function direct(proxy) {
    return `${proxy.name} = direct`;
}
