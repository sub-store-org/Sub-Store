import { isIPv4, isIPv6 } from '@/utils';
// Preserve validation failures before shared parsers normalize away raw values.
// Other output formats retain their existing normalization behavior.
export const NATIVE_PROTOCOL_NAMES = {
    ss: 'Shadowsocks',
    vmess: 'VMess',
    vless: 'VLESS',
    http: 'HTTP',
    socks5: 'SOCKS5',
    trojan: 'Trojan',
    hysteria: 'Hysteria',
    hysteria2: 'Hysteria2',
    tuic: 'TUIC',
    juicity: 'Juicity',
    wireguard: 'WireGuard',
    snell: 'Snell',
};

const ERROR_FIELD = '_shadowrocket-native-validation-error';
const TLS_PROTOCOLS = ['trojan', 'tuic', 'hysteria', 'hysteria2', 'juicity'];
const TEXT_FIELDS = [
    'type',
    'name',
    'server',
    'password',
    'username',
    'uuid',
    'cipher',
    'sni',
    'servername',
    'network',
    'plugin',
    'client-fingerprint',
    'auth-str',
    'auth_str',
    'auth',
    'obfs',
    'obfs-password',
    'protocol',
    'token',
    'congestion-controller',
    'udp-relay-mode',
    'private-key',
    'public-key',
    'ip',
    'ipv6',
    'preshared-key',
    'pre-shared-key',
    'psk',
    'packet-encoding',
    'ws-path',
    'obfs_password',
];
const NUMBER_FIELDS = [
    'port',
    'alterId',
    'version',
    'up',
    'down',
    'mtu',
    'keepalive',
    'persistent-keepalive',
    'ip-cidr',
    'ipv6-cidr',
];

function scalar(value, key, numeric = false) {
    if (value == null) return;
    if (
        typeof value === 'string' ||
        (numeric && typeof value === 'number' && Number.isFinite(value))
    )
        return;
    throw new Error(
        `Invalid Shadowrocket native ${key}: expected ${
            numeric ? 'string or finite number' : 'string'
        }`,
    );
}

function record(value, key) {
    if (value == null) return;
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid Shadowrocket native ${key}: expected object`);
    }
}

export function validateShadowrocketNativeInput(proxy) {
    if (proxy[ERROR_FIELD]) throw new Error(proxy[ERROR_FIELD]);
    for (const keys of [
        ['sni', 'servername'],
        ['tfo', 'fast-open'],
        ...(proxy.type === 'hysteria'
            ? [['auth-str', 'auth_str', 'auth']]
            : []),
        ...(proxy.type === 'wireguard'
            ? [
                  ['keepalive', 'persistent-keepalive'],
                  ['preshared-key', 'pre-shared-key'],
              ]
            : []),
    ]) {
        const values = keys
            .map((key) => proxy[key])
            .filter((value) => value != null && value !== '');
        if (new Set(values.map((value) => String(value))).size > 1) {
            throw new Error(
                `Conflicting Shadowrocket native ${keys.join('/')} aliases`,
            );
        }
    }
    // These options cannot be preserved by the supported native syntax. Check
    // before restoration/cleanup can discard them, including false flags.
    for (const key of ['tls-fingerprint', 'underlying-proxy', 'no-resolve']) {
        if (proxy[key] != null && proxy[key] !== '') {
            throw new Error(`Unsupported Shadowrocket native option: ${key}`);
        }
    }
    if (proxy.plugin === 'shadow-tls') {
        throw new Error(
            proxy.type === 'snell'
                ? 'Unsupported Shadowrocket native Snell ShadowTLS options'
                : 'Unsupported Shadowrocket native ShadowTLS plugin',
        );
    }
    for (const key of TEXT_FIELDS) scalar(proxy[key], key, key === 'password');
    for (const key of NUMBER_FIELDS) scalar(proxy[key], key, true);
    if (proxy.port != null && proxy.port !== '') {
        const port = Number(proxy.port);
        if (
            !/^\d+$/.test(String(proxy.port)) ||
            !Number.isInteger(port) ||
            port < 1 ||
            port > 65535
        ) {
            throw new Error(
                `Invalid Shadowrocket native ${
                    NATIVE_PROTOCOL_NAMES[proxy.type] ?? proxy.type
                } port`,
            );
        }
    }
    for (const key of ['alpn', 'dns']) {
        const values = Array.isArray(proxy[key]) ? proxy[key] : [proxy[key]];
        for (const value of values) {
            if (Array.isArray(proxy[key]) && value == null) {
                throw new Error(`Invalid Shadowrocket native ${key} item`);
            }
            scalar(value, key);
        }
    }
    for (const key of ['ws-opts', 'obfs-opts', 'plugin-opts']) {
        const opts = proxy[key];
        record(opts, key);
        if (!opts) continue;
        for (const field of ['path', 'host', 'mode', 'password']) {
            scalar(opts[field], `${key}.${field}`);
        }
        record(opts.headers, `${key}.headers`);
        if (
            opts.headers?.Host != null &&
            opts.headers?.host != null &&
            opts.headers.Host !== opts.headers.host
        ) {
            throw new Error(
                'Conflicting Shadowrocket native WebSocket Host aliases',
            );
        }
        for (const [header, value] of Object.entries(opts.headers ?? {})) {
            scalar(value, `${key}.headers.${header}`);
        }
    }
    if (proxy['ws-headers'] != null) {
        record(proxy['ws-headers'], 'ws-headers');
        for (const value of Object.values(proxy['ws-headers']))
            scalar(value, 'ws-headers');
    }
    if (
        proxy.type !== 'wireguard' &&
        ['ip-cidr', 'ipv6-cidr'].some((key) => proxy[key] != null)
    ) {
        throw new Error(
            'Unsupported Shadowrocket native address prefix outside WireGuard',
        );
    }
    if (proxy.type === 'wireguard') {
        for (const [key, cidrKey, max, valid] of [
            ['ip', 'ip-cidr', 32, isIPv4],
            ['ipv6', 'ipv6-cidr', 128, isIPv6],
        ]) {
            const address = proxy[key];
            if (address != null && address !== '') {
                const [host, cidr, ...extra] = address.split('/');
                if (
                    !valid(host.replace(/^\[|\]$/g, '')) ||
                    extra.length ||
                    (cidr !== undefined &&
                        (!/^\d+$/.test(cidr) || Number(cidr) > max))
                ) {
                    throw new Error(
                        `Invalid Shadowrocket native WireGuard ${key}`,
                    );
                }
            }
            const cidr = proxy[cidrKey];
            if (
                cidr != null &&
                (!/^\d+$/.test(String(cidr)) || Number(cidr) > max)
            ) {
                throw new Error(
                    `Invalid Shadowrocket native WireGuard ${cidrKey}`,
                );
            }
        }
        if (
            proxy.reserved != null &&
            ((!Array.isArray(proxy.reserved) &&
                typeof proxy.reserved !== 'string') ||
                (Array.isArray(proxy.reserved) &&
                    proxy.reserved.some(
                        (value) => !['string', 'number'].includes(typeof value),
                    )))
        ) {
            throw new Error(
                'Unsupported Shadowrocket native WireGuard reserved value',
            );
        }
    }
    for (const key of [
        'tls',
        'skip-cert-verify',
        'tfo',
        'fast-open',
        'udp',
        'aead',
    ]) {
        if (proxy[key] !== undefined && typeof proxy[key] !== 'boolean') {
            throw new Error(
                `Unsupported Shadowrocket native ${proxy.type} ${key} value: expected boolean`,
            );
        }
    }
    if (TLS_PROTOCOLS.includes(proxy.type) && proxy.tls === false) {
        throw new Error(
            `Unsupported Shadowrocket native ${proxy.type} tls=false`,
        );
    }
    if (proxy.type === 'vmess') {
        const aid = proxy.alterId;
        if (
            aid != null &&
            (!/^\d+$/.test(String(aid)) || !Number.isSafeInteger(Number(aid)))
        ) {
            throw new Error('Invalid Shadowrocket native VMess alterId');
        }
        if (
            proxy.aead !== undefined &&
            (proxy.aead
                ? aid != null && Number(aid) !== 0
                : aid == null || Number(aid) === 0)
        ) {
            throw new Error(
                'Conflicting Shadowrocket native VMess aead and alterId',
            );
        }
    }
}

export function rememberShadowrocketNativeValidation(proxy) {
    try {
        validateShadowrocketNativeInput(proxy);
    } catch (error) {
        proxy[ERROR_FIELD] = error.message;
    }
}
