import {
    NATIVE_PROTOCOL_NAMES,
    validateShadowrocketNativeInput,
} from '../shadowrocket-native-validation';
import {
    getWireGuardAddressWithCIDR,
    isPresent,
    isShadowsocksOverTls,
    produceProxyListOutput,
    restoreShadowTLSProxyOpts,
    supportsShadowsocksV2rayPluginMode,
} from '@/core/proxy-utils/producers/utils';
import {
    deleteHttpUpgradeEarlyDataMetadata,
    normalizeWebSocketEarlyDataPath,
} from '../transport-path';
import $ from '@/core/app';
import { normalizeVmessSecurity } from '../vmess-security';

function getNativeSingleValue(value, key) {
    if (!Array.isArray(value)) {
        return value;
    }

    if (value.length <= 1) {
        return value[0];
    }

    throw new Error(`Unsupported multiple Shadowrocket native ${key} values`);
}

function appendNativeOption(parts, key, value) {
    if (value !== undefined && value !== null && value !== '') {
        if (!['string', 'number', 'boolean'].includes(typeof value)) {
            throw new Error(`Invalid Shadowrocket native ${key}: expected scalar`);
        }
        parts.push(`${key}=${value}`);
    }
}

function joinNativeParts(parts) {
    const normalized = parts.map((part, index) => {
        if (part === undefined || part === null) {
            throw new Error('Missing required Shadowrocket native value');
        }

        if (!['string', 'number'].includes(typeof part)) {
            throw new Error('Invalid Shadowrocket native value: expected scalar');
        }
        const value = String(part);
        const hasUnsafeCharacter =
            value.includes(',') ||
            Array.from(value).some((character) => {
                const codePoint = character.codePointAt(0);
                return (
                    codePoint <= 0x1f ||
                    (codePoint >= 0x7f && codePoint <= 0x9f) ||
                    codePoint === 0x2028 ||
                    codePoint === 0x2029
                );
            });
        if (hasUnsafeCharacter) {
            throw new Error(
                'Unsupported comma or control character in Shadowrocket native value',
            );
        }
        if (
            index === 0 &&
            (value.indexOf('=') <= 0 ||
                value.indexOf('=') !== value.lastIndexOf('='))
        ) {
            throw new Error(
                'Unsupported equals sign in Shadowrocket native proxy name',
            );
        }
        return value;
    });

    return normalized.join(',');
}

function hasNativeValue(value) {
    if (
        value === undefined ||
        value === null ||
        value === '' ||
        value === false
    ) {
        return false;
    }
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

function hasConfiguredNativeValue(value) {
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

function normalizeNativeAliasValue(value) {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value);
    }
    return String(value);
}

function rejectConflictingNativeAliases(proxy, protocol, label, keys) {
    const configured = keys.filter((key) =>
        hasConfiguredNativeValue(proxy[key]),
    );
    if (configured.length <= 1) return;

    const values = new Set(
        configured.map((key) => normalizeNativeAliasValue(proxy[key])),
    );
    if (values.size > 1) {
        throw new Error(
            `Conflicting Shadowrocket native ${protocol} ${label} aliases: ${configured.join(
                ', ',
            )}`,
        );
    }
}

function rejectNativeAliasConflicts(proxy) {
    const protocol = NATIVE_PROTOCOL_NAMES[proxy.type] ?? proxy.type;

    rejectConflictingNativeAliases(proxy, protocol, 'server name', [
        'sni',
        'servername',
    ]);

    if (['vmess', 'vless'].includes(proxy.type)) {
        rejectConflictingNativeAliases(
            proxy['ws-opts']?.headers ?? {},
            protocol,
            'WebSocket Host',
            ['Host', 'host'],
        );
    }

    if (proxy.type === 'hysteria') {
        rejectConflictingNativeAliases(proxy, protocol, 'authentication', [
            'auth-str',
            'auth_str',
            'auth',
        ]);
    }

    if (proxy.type === 'wireguard') {
        rejectConflictingNativeAliases(proxy, protocol, 'keepalive', [
            'keepalive',
            'persistent-keepalive',
        ]);
        rejectConflictingNativeAliases(proxy, protocol, 'pre-shared key', [
            'preshared-key',
            'pre-shared-key',
        ]);
    }
}

function validateNativeUdpOption(proxy, protocol, canDisable) {
    if (!hasConfiguredNativeValue(proxy.udp)) return;

    if (typeof proxy.udp !== 'boolean') {
        throw new Error(
            `Unsupported Shadowrocket native ${protocol} udp value: ${proxy.udp}`,
        );
    }
    if (proxy.udp === false && !canDisable) {
        throw new Error(
            `Unsupported Shadowrocket native ${protocol} udp=false; native syntax cannot preserve disabled UDP`,
        );
    }
}

function validateNativeBooleanOptions(proxy) {
    const protocol = NATIVE_PROTOCOL_NAMES[proxy.type] ?? proxy.type;
    for (const key of [
        'tls',
        'skip-cert-verify',
        'tfo',
        'fast-open',
    ]) {
        if (
            hasConfiguredNativeValue(proxy[key]) &&
            typeof proxy[key] !== 'boolean'
        ) {
            throw new Error(
                `Unsupported Shadowrocket native ${protocol} ${key} value: ${proxy[key]}`,
            );
        }
    }
}

function rejectNativeOptions(proxy, protocol, keys) {
    const unsupported = keys.filter((key) => hasNativeValue(proxy[key]));
    if (unsupported.length > 0) {
        throw new Error(
            `Unsupported Shadowrocket native ${protocol} options: ${unsupported.join(
                ', ',
            )}`,
        );
    }
}

const NATIVE_COMMON_FIELDS = [
    'type',
    'name',
    'server',
    'port',
    '_subName',
    '_subDisplayName',
    '_collectionName',
    '_collectionDisplayName',
];

const NATIVE_ALLOWED_FIELDS = {
    ss: new Set([
        ...NATIVE_COMMON_FIELDS,
        'cipher',
        'password',
        'udp',
        'plugin',
        'plugin-opts',
    ]),
    vmess: new Set([
        ...NATIVE_COMMON_FIELDS,
        'uuid',
        'alterId',
        'cipher',
        'network',
        'tls',
        'ws-opts',
        'servername',
        'skip-cert-verify',
        'client-fingerprint',
        'alpn',
        'tfo',
        'fast-open',
        'udp',
    ]),
    vless: new Set([
        ...NATIVE_COMMON_FIELDS,
        'uuid',
        'cipher',
        'network',
        'tls',
        'ws-opts',
        'servername',
        'skip-cert-verify',
        'client-fingerprint',
        'alpn',
        'tfo',
        'fast-open',
        'udp',
        'packet-encoding',
    ]),
    http: new Set([
        ...NATIVE_COMMON_FIELDS,
        'username',
        'password',
        'tls',
        'sni',
        'servername',
        'tfo',
        'fast-open',
        'udp',
    ]),
    socks5: new Set([
        ...NATIVE_COMMON_FIELDS,
        'username',
        'password',
        'tls',
        'sni',
        'servername',
        'skip-cert-verify',
        'tfo',
        'fast-open',
        'udp',
    ]),
    trojan: new Set([
        ...NATIVE_COMMON_FIELDS,
        'password',
        'network',
        'sni',
        'servername',
        'skip-cert-verify',
        'tfo',
        'fast-open',
        'udp',
    ]),
    hysteria: new Set([
        ...NATIVE_COMMON_FIELDS,
        'auth-str',
        'auth_str',
        'auth',
        'obfs',
        'protocol',
        'udp',
        'sni',
        'servername',
        'alpn',
        'up',
        'down',
        'tfo',
        'fast-open',
    ]),
    hysteria2: new Set([
        ...NATIVE_COMMON_FIELDS,
        'password',
        'obfs',
        'obfs-password',
        'udp',
        'sni',
        'servername',
        'alpn',
        'tfo',
        'fast-open',
        'skip-cert-verify',
        'client-fingerprint',
    ]),
    tuic: new Set([
        ...NATIVE_COMMON_FIELDS,
        'uuid',
        'password',
        'token',
        'version',
        'udp',
        'sni',
        'servername',
        'alpn',
        'congestion-controller',
        'udp-relay-mode',
        'tfo',
        'fast-open',
    ]),
    juicity: new Set([
        ...NATIVE_COMMON_FIELDS,
        'uuid',
        'password',
        'udp',
        'sni',
        'servername',
        'alpn',
        'tfo',
        'fast-open',
    ]),
    wireguard: new Set([
        ...NATIVE_COMMON_FIELDS,
        'private-key',
        'public-key',
        'ip',
        'ipv6',
        'udp',
        'dns',
        'mtu',
        'keepalive',
        'persistent-keepalive',
        'reserved',
        'preshared-key',
        'pre-shared-key',
        'allowed-ips',
        'peers',
    ]),
    snell: new Set([
        ...NATIVE_COMMON_FIELDS,
        'psk',
        'version',
        'udp',
        'obfs-opts',
        'tfo',
        'fast-open',
    ]),
};



const NATIVE_REQUIRED_FIELDS = {
    ss: ['cipher', 'password'],
    vmess: ['uuid', 'cipher'],
    vless: ['uuid'],
    http: [],
    socks5: [],
    trojan: ['password'],
    hysteria: [],
    hysteria2: ['password'],
    tuic: ['uuid', 'password'],
    juicity: ['uuid', 'password'],
    wireguard: ['private-key', 'public-key', 'ip'],
    snell: ['psk', 'version'],
};

function validateNativeRequiredFields(proxy) {
    const protocol = NATIVE_PROTOCOL_NAMES[proxy.type];
    if (!protocol) return;

    const requiredFields = [
        'name',
        'server',
        'port',
        ...NATIVE_REQUIRED_FIELDS[proxy.type],
    ];
    const missing = requiredFields.filter(
        (key) =>
            proxy[key] === undefined ||
            proxy[key] === null ||
            proxy[key] === '',
    );
    if (missing.length > 0) {
        throw new Error(
            `Missing required Shadowrocket native ${protocol} options: ${missing.join(
                ', ',
            )}`,
        );
    }

    const port =
        typeof proxy.port === 'number'
            ? proxy.port
            : typeof proxy.port === 'string' && /^\d+$/.test(proxy.port)
            ? Number(proxy.port)
            : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(
            `Invalid Shadowrocket native ${protocol} port: ${proxy.port}`,
        );
    }
    proxy.port = port;
}

function rejectUnknownNativeOptions(proxy) {
    const allowedFields = NATIVE_ALLOWED_FIELDS[proxy.type];
    if (!allowedFields) return;

    const unsupported = Object.keys(proxy).filter(
        (key) =>
            !allowedFields.has(key) &&
            !(key === '_h2' && proxy[key] === false) &&
            hasConfiguredNativeValue(proxy[key]),
    );
    if (unsupported.length > 0) {
        throw new Error(
            `Unsupported Shadowrocket native ${
                NATIVE_PROTOCOL_NAMES[proxy.type]
            } options: ${unsupported.sort().join(', ')}`,
        );
    }
}

function rejectNativeReality(proxy, protocol) {
    rejectNativeOptions(proxy, protocol, ['reality-opts', 'flow']);
}

function rejectNonDefaultNativeServerName(proxy, protocol) {
    const serverName = proxy.sni ?? proxy.servername;
    if (
        hasNativeValue(serverName) &&
        String(serverName) !== String(proxy.server)
    ) {
        throw new Error(
            `Unsupported Shadowrocket native ${protocol} server name: ${serverName}`,
        );
    }
}

function rejectNativeTlsExtensions(proxy, protocol) {
    rejectNativeOptions(proxy, protocol, [
        'fingerprint',
        'name-cert-verify',
        '_vcn',
        'ech-opts',
        'ca',
        'ca-str',
        'ca_str',
        'certificate',
        'shadow-tls-opts',
    ]);
}

function appendNativeWebSocketOptions(parts, opts, protocol) {
    const unsupportedOptions = Object.keys(opts).filter(
        (key) => !['path', 'headers'].includes(key),
    );
    if (unsupportedOptions.length > 0) {
        throw new Error(
            `Unsupported Shadowrocket native ${protocol} WebSocket options: ${unsupportedOptions.join(
                ', ',
            )}`,
        );
    }

    const headers = opts.headers ?? {};
    const unsupportedHeaders = Object.keys(headers).filter(
        (key) => key.toLowerCase() !== 'host',
    );
    if (unsupportedHeaders.length > 0) {
        throw new Error(
            `Unsupported Shadowrocket native ${protocol} WebSocket headers: ${unsupportedHeaders.join(
                ', ',
            )}`,
        );
    }

    parts.push('obfs=websocket');
    appendNativeOption(parts, 'path', opts.path);
    appendNativeOption(parts, 'obfsParam', headers.Host ?? headers.host);
}

function appendNativeTlsOptions(parts, proxy, protocol) {
    rejectNativeOptions(proxy, protocol, ['client-fingerprint', 'alpn']);

    if (!proxy.tls) {
        const unsupported = [
            'sni',
            'servername',
            'skip-cert-verify',
        ].filter((key) => hasNativeValue(proxy[key]));
        if (unsupported.length > 0) {
            throw new Error(
                `Unsupported Shadowrocket native ${protocol} TLS options without TLS: ${unsupported.join(
                    ', ',
                )}`,
            );
        }
        return;
    }

    appendNativeOption(parts, 'peer', proxy.sni ?? proxy.servername);

    if (proxy['skip-cert-verify']) {
        parts.push('allowInsecure=1');
    }

}

function appendNativePeerAndAlpnOptions(parts, proxy) {
    appendNativeOption(parts, 'peer', proxy.sni ?? proxy.servername);
    if (proxy.alpn) {
        appendNativeOption(
            parts,
            'alpn',
            getNativeSingleValue(proxy.alpn, 'alpn'),
        );
    }
}

function rejectNativeFastOpen(proxy, protocol) {
    rejectNativeOptions(proxy, protocol, ['tfo', 'fast-open']);
}

function appendNativeVmessTransport(parts, proxy) {
    rejectNativeReality(proxy, 'VMess');
    const network = proxy.network ?? 'tcp';
    if (!['tcp', 'none', 'ws'].includes(network)) {
        throw new Error(
            `Unsupported Shadowrocket native VMess network: ${network}`,
        );
    }

    if (proxy.tls) {
        parts.push('tls=true');
    }

    if (network === 'ws') {
        appendNativeWebSocketOptions(parts, proxy['ws-opts'] ?? {}, 'VMess');
    }

    appendNativeTlsOptions(parts, proxy, 'VMess');
    if (proxy.tfo || proxy['fast-open']) {
        parts.push('tfo=1');
    }
}

function produceNativeVless(proxy) {
    rejectNativeReality(proxy, 'VLESS');
    if (proxy.cipher != null && proxy.cipher !== 'none') {
        throw new Error(
            `Unsupported Shadowrocket native VLESS cipher: ${proxy.cipher}`,
        );
    }
    // Shadowrocket's VLESS parser treats omitted packetEncoding as xudp.
    // Only that native default can be represented without an extra,
    // undocumented local-configuration token.
    if (
        proxy['packet-encoding'] != null &&
        proxy['packet-encoding'] !== 'xudp'
    ) {
        throw new Error(
            `Unsupported Shadowrocket native VLESS packet-encoding: ${proxy['packet-encoding']}`,
        );
    }
    const parts = [
        `${proxy.name}=vless`,
        proxy.server,
        proxy.port,
        `password=${proxy.uuid}`,
    ];

    const network = proxy.network ?? 'tcp';
    if (!['tcp', 'none', 'ws'].includes(network)) {
        throw new Error(
            `Unsupported Shadowrocket native VLESS network: ${network}`,
        );
    }

    if (proxy.tls) {
        parts.push('tls=true');
    }

    if (network === 'ws') {
        appendNativeWebSocketOptions(parts, proxy['ws-opts'] ?? {}, 'VLESS');
    }

    appendNativeTlsOptions(parts, proxy, 'VLESS');

    rejectNativeFastOpen(proxy, 'VLESS');

    return joinNativeParts(parts);
}

function produceNativeHysteria2(proxy) {
    rejectNativeOptions(proxy, 'Hysteria2', [
        'ports',
        'hop-interval',
        'hop-interval-max',
        'keepalive',
        'skip-cert-verify',
        'client-fingerprint',
    ]);
    rejectNativeFastOpen(proxy, 'Hysteria2');
    const parts = [
        `${proxy.name}=hysteria2`,
        proxy.server,
        proxy.port,
        `auth=${proxy.password}`,
    ];

    if (proxy.obfs && proxy.obfs !== 'salamander') {
        throw new Error(
            `Unsupported Shadowrocket native Hysteria2 obfs: ${proxy.obfs}`,
        );
    }
    if (proxy.obfs === 'salamander' && !proxy['obfs-password']) {
        throw new Error(
            'Missing required Shadowrocket native Hysteria2 salamander obfs-password',
        );
    }
    if (proxy['obfs-password'] && proxy.obfs !== 'salamander') {
        throw new Error(
            'Unsupported Shadowrocket native Hysteria2 obfs-password without salamander obfs',
        );
    }
    appendNativeOption(parts, 'obfsParam', proxy['obfs-password']);

    if (proxy.udp !== false) {
        parts.push('udp=1');
    }

    appendNativePeerAndAlpnOptions(parts, proxy);

    return joinNativeParts(parts);
}

function produceNativeShadowsocks(proxy) {
    const parts = [
        `${proxy.name}=ss`,
        proxy.server,
        proxy.port,
        `password=${proxy.password}`,
    ];

    appendNativeOption(parts, 'method', proxy.cipher);

    if (proxy.plugin || hasNativeValue(proxy['plugin-opts'])) {
        throw new Error(
            'Unsupported Shadowrocket native Shadowsocks plugin until its native syntax is verified',
        );
    }

    rejectNativeFastOpen(proxy, 'Shadowsocks');

    return joinNativeParts(parts);
}

function produceNativeVmess(proxy) {
    const parts = [
        `${proxy.name}=vmess`,
        proxy.server,
        proxy.port,
        `password=${proxy.uuid}`,
    ];

    appendNativeOption(parts, 'alterId', proxy.alterId);
    appendNativeOption(parts, 'method', proxy.cipher);
    appendNativeVmessTransport(parts, proxy);

    return joinNativeParts(parts);
}

function produceNativeHttp(proxy) {
    const type = proxy.tls ? 'https' : 'http';

    if (proxy.tls) {
        rejectNonDefaultNativeServerName(proxy, 'HTTPS');
        rejectNativeOptions(proxy, 'HTTPS', [
            'client-fingerprint',
            'alpn',
            'skip-cert-verify',
        ]);
    } else {
        rejectNativeOptions(proxy, 'HTTP', ['sni', 'servername']);
    }

    const parts = [
        `${proxy.name}=${type}`,
        proxy.server,
        proxy.port,
        proxy.username ?? '',
        proxy.password ?? '',
    ];
    rejectNativeFastOpen(proxy, type.toUpperCase());
    return joinNativeParts(parts);
}

function produceNativeSocks5(proxy) {
    const type = proxy.tls ? 'socks5-tls' : 'socks5';

    if (proxy.tls) {
        rejectNonDefaultNativeServerName(proxy, 'SOCKS5 TLS');
        rejectNativeOptions(proxy, 'SOCKS5 TLS', [
            'client-fingerprint',
            'alpn',
        ]);
    } else {
        rejectNativeOptions(proxy, 'SOCKS5', ['skip-cert-verify']);
    }

    const parts = [
        `${proxy.name}=${type}`,
        proxy.server,
        proxy.port,
        proxy.username ?? '',
        proxy.password ?? '',
    ];
    if (proxy.tls && proxy['skip-cert-verify']) {
        parts.push('skip-common-name-verify=true');
    }
    rejectNativeFastOpen(
        proxy,
        type === 'socks5-tls' ? 'SOCKS5 TLS' : 'SOCKS5',
    );
    return joinNativeParts(parts);
}

function produceNativeTrojan(proxy) {
    rejectNativeReality(proxy, 'Trojan');
    rejectNativeOptions(proxy, 'Trojan', ['client-fingerprint', 'alpn']);
    rejectNativeFastOpen(proxy, 'Trojan');
    const network = proxy.network ?? 'tcp';
    if (!['tcp', 'none'].includes(network)) {
        throw new Error(
            `Unsupported Shadowrocket native Trojan network: ${network}`,
        );
    }
    const parts = [
        `${proxy.name}=trojan`,
        proxy.server,
        proxy.port,
        `password=${proxy.password}`,
    ];

    appendNativeOption(parts, 'peer', proxy.sni ?? proxy.servername);
    if (proxy['skip-cert-verify']) {
        parts.push('allowInsecure=1');
    }

    return joinNativeParts(parts);
}

function produceNativeHysteria(proxy) {
    rejectNativeOptions(proxy, 'Hysteria', [
        'ports',
        'hop-interval',
        'hop-interval-max',
        'skip-cert-verify',
        'client-fingerprint',
    ]);
    rejectNativeFastOpen(proxy, 'Hysteria');
    const parts = [`${proxy.name}=hysteria`, proxy.server, proxy.port];

    appendNativeOption(parts, 'auth', proxy['auth-str'] ?? proxy.auth);

    appendNativeOption(parts, 'obfsParam', proxy.obfs);
    appendNativeOption(parts, 'protocol', proxy.protocol);

    if (proxy.udp !== false) {
        parts.push('udp=1');
    }

    appendNativePeerAndAlpnOptions(parts, proxy);

    appendNativeOption(parts, 'upmbps', proxy.up);
    appendNativeOption(parts, 'downmbps', proxy.down);

    return joinNativeParts(parts);
}

function produceNativeTuic(proxy) {
    if (proxy.token) {
        throw new Error(
            'Unsupported Shadowrocket native TUIC token authentication',
        );
    }
    if (proxy.version != null && Number(proxy.version) !== 5) {
        throw new Error(
            `Unsupported Shadowrocket native TUIC version: ${proxy.version}`,
        );
    }
    if (
        proxy['congestion-controller'] &&
        proxy['congestion-controller'] !== 'cubic'
    ) {
        throw new Error(
            'Unsupported Shadowrocket native TUIC congestion-controller',
        );
    }
    if (proxy['udp-relay-mode'] && proxy['udp-relay-mode'] !== 'native') {
        throw new Error('Unsupported Shadowrocket native TUIC udp-relay-mode');
    }
    rejectNativeOptions(proxy, 'TUIC', [
        'reduce-rtt',
        'disable-sni',
        'skip-cert-verify',
        'client-fingerprint',
    ]);
    rejectNativeFastOpen(proxy, 'TUIC');

    const parts = [
        `${proxy.name}=tuic`,
        proxy.server,
        proxy.port,
        `password=${proxy.password}`,
    ];

    if (proxy.udp !== false) {
        parts.push('udp=1');
    }

    appendNativeOption(parts, 'user', proxy.uuid);
    appendNativePeerAndAlpnOptions(parts, proxy);

    return joinNativeParts(parts);
}

function produceNativeJuicity(proxy) {
    rejectNativeOptions(proxy, 'Juicity', [
        'skip-cert-verify',
        'client-fingerprint',
    ]);
    rejectNativeFastOpen(proxy, 'Juicity');
    const parts = [
        `${proxy.name}=juicity`,
        proxy.server,
        proxy.port,
        `password=${proxy.password}`,
    ];

    if (proxy.udp !== false) {
        parts.push('udp=1');
    }

    appendNativeOption(parts, 'user', proxy.uuid);
    appendNativePeerAndAlpnOptions(parts, proxy);

    return joinNativeParts(parts);
}

function produceNativeWireGuard(proxy) {
    rejectNativeOptions(proxy, 'WireGuard', [
        'preshared-key',
        'pre-shared-key',
        'ipv6',
        'allowed-ips',
    ]);
    if (hasNativeValue(proxy.peers)) {
        throw new Error(
            'Unsupported Shadowrocket native WireGuard peers; use supported top-level fields instead',
        );
    }
    const parts = [`${proxy.name}=wireguard`, proxy.server, proxy.port];

    appendNativeOption(parts, 'privateKey', proxy['private-key']);
    appendNativeOption(parts, 'publicKey', proxy['public-key']);
    appendNativeOption(parts, 'ip', proxy.ip);

    if (proxy.udp !== false) {
        parts.push('udp=1');
    }

    if (proxy.dns) {
        appendNativeOption(
            parts,
            'dns',
            getNativeSingleValue(proxy.dns, 'dns'),
        );
    }

    appendNativeOption(parts, 'mtu', proxy.mtu);
    appendNativeOption(parts, 'keepalive', proxy.keepalive);

    if (hasNativeValue(proxy.reserved)) {
        const reserved = Array.isArray(proxy.reserved)
            ? proxy.reserved
            : typeof proxy.reserved === 'string'
            ? proxy.reserved.split('/')
            : [];
        if (
            reserved.length !== 3 ||
            reserved.some(
                (value) =>
                    !/^\d+$/.test(`${value}`) ||
                    Number(value) < 0 ||
                    Number(value) > 255,
            )
        ) {
            throw new Error(
                'Unsupported Shadowrocket native WireGuard reserved value; expected three bytes',
            );
        }
        appendNativeOption(parts, 'reserved', reserved.join('/'));
    }

    return joinNativeParts(parts);
}

function produceNativeSnell(proxy) {
    if (proxy['obfs-opts']?.mode === 'shadow-tls') {
        throw new Error(
            'Unsupported Shadowrocket native Snell ShadowTLS options',
        );
    }
    if (Number(proxy.version) !== 2) {
        throw new Error(
            `Unsupported Shadowrocket native Snell version: ${proxy.version}; only the documented version 2 syntax is enabled`,
        );
    }
    const unsupportedObfsOptions = Object.keys(proxy['obfs-opts'] ?? {}).filter(
        (key) => !['mode', 'host', 'path'].includes(key),
    );
    if (unsupportedObfsOptions.length > 0) {
        throw new Error(
            `Unsupported Shadowrocket native Snell obfs options: ${unsupportedObfsOptions.join(
                ', ',
            )}`,
        );
    }
    if (
        proxy['obfs-opts']?.mode &&
        !['http', 'tls'].includes(proxy['obfs-opts'].mode)
    ) {
        throw new Error(
            `Unsupported Shadowrocket native Snell obfs mode: ${proxy['obfs-opts'].mode}`,
        );
    }
    if (
        (proxy['obfs-opts']?.host || proxy['obfs-opts']?.path) &&
        !proxy['obfs-opts']?.mode
    ) {
        throw new Error(
            'Unsupported Shadowrocket native Snell obfs fields without an obfs mode',
        );
    }
    if (
        proxy['obfs-opts']?.path &&
        proxy['obfs-opts']?.mode !== 'http'
    ) {
        throw new Error(
            'Unsupported Shadowrocket native Snell obfs path outside HTTP obfs',
        );
    }
    const parts = [
        `${proxy.name}=snell`,
        proxy.server,
        proxy.port,
        `password=${proxy.psk}`,
    ];

    if (proxy.udp === true) {
        parts.push('udp=1');
    }

    appendNativeOption(parts, 'obfs', proxy['obfs-opts']?.mode);
    appendNativeOption(parts, 'obfs-host', proxy['obfs-opts']?.host);
    appendNativeOption(parts, 'obfs-uri', proxy['obfs-opts']?.path);

    rejectNativeFastOpen(proxy, 'Snell');

    return joinNativeParts(parts);
}

function produceNativeShadowrocketProxy(proxy) {
    validateNativeRequiredFields(proxy);
    rejectNativeTlsExtensions(proxy, proxy.type);

    validateNativeUdpOption(
        proxy,
        NATIVE_PROTOCOL_NAMES[proxy.type] ?? proxy.type,
        !['ss', 'vmess', 'vless', 'socks5', 'trojan'].includes(proxy.type),
    );

    let output;
    switch (proxy.type) {
        case 'ss':
            output = produceNativeShadowsocks(proxy);
            break;
        case 'vmess':
            output = produceNativeVmess(proxy);
            break;
        case 'vless':
            output = produceNativeVless(proxy);
            break;
        case 'http':
            output = produceNativeHttp(proxy);
            break;
        case 'socks5':
            output = produceNativeSocks5(proxy);
            break;
        case 'trojan':
            output = produceNativeTrojan(proxy);
            break;
        case 'hysteria':
            output = produceNativeHysteria(proxy);
            break;
        case 'hysteria2':
            output = produceNativeHysteria2(proxy);
            break;
        case 'tuic':
            output = produceNativeTuic(proxy);
            break;
        case 'juicity':
            output = produceNativeJuicity(proxy);
            break;
        case 'wireguard':
            output = produceNativeWireGuard(proxy);
            break;
        case 'snell':
            output = produceNativeSnell(proxy);
            break;
        default:
            return null;
    }

    rejectUnknownNativeOptions(proxy);
    return output;
}

export default function Shadowrocket_Producer() {
    const type = 'ALL';
    const produce = (proxies, type, opts = {}) => {
        const producingNativeText = opts.native && type !== 'internal';
        const list = proxies
            .filter((proxy) => {
                if (producingNativeText) {
                    if (hasShadowrocketSnellShadowTlsObfsConflict(proxy)) {
                        throw new Error(
                            `Unsupported Shadowrocket native Snell ShadowTLS and obfs combination for proxy ${proxy.name}`,
                        );
                    }
                    return true;
                }
                if (opts['include-unsupported-proxy']) return true;
                if (
                    !supportsShadowsocksV2rayPluginMode(proxy, [
                        'websocket',
                        'quic',
                        'http2',
                        'mkcp',
                        'grpc',
                    ])
                ) {
                    return false;
                } else if (
                    proxy.type === 'snell' &&
                    ![1, 2, 3, 4, 5, 6].includes(proxy.version)
                ) {
                    return false;
                } else if (hasShadowrocketSnellShadowTlsObfsConflict(proxy)) {
                    $.error(
                        `Platform Shadowrocket does not support Snell shadow-tls with obfs for proxy ${proxy.name}. Proxy has been filtered.`,
                    );
                    return false;
                } else if (
                    [
                        'tailscale',
                        'sudoku',
                        'naive',
                        'openvpn',
                        'gost-relay',
                        'shadowquic',
                        'zerotier',
                    ].includes(proxy.type)
                ) {
                    return false;
                } else if (['xhttp'].includes(proxy.network)) {
                    $.warn(
                        `VLESS XHTTP 结构复杂, Shadowrocket 可能无法完全兼容`,
                    );
                    return true;
                }
                return true;
            })
            .map((proxy) => {
                if (producingNativeText) {
                    rejectNativeAliasConflicts(proxy);
                    validateNativeBooleanOptions(proxy);
                    validateNativeUdpOption(
                        proxy,
                        NATIVE_PROTOCOL_NAMES[proxy.type] ?? proxy.type,
                        !['ss', 'vmess', 'vless', 'socks5', 'trojan'].includes(proxy.type),
                    );
                    validateShadowrocketNativeInput(proxy);
                }
                restoreShadowTLSProxyOpts(proxy);

                if (proxy.type === 'vmess') {
                    // handle vmess aead
                    if (isPresent(proxy, 'aead')) {
                        if (proxy.aead) {
                            proxy.alterId = 0;
                        }
                        delete proxy.aead;
                    }
                    if (isPresent(proxy, 'sni')) {
                        proxy.servername = proxy.sni;
                        delete proxy.sni;
                    }
                    // https://github.com/MetaCubeX/Clash.Meta/blob/Alpha/docs/config.yaml#L400
                    // https://stash.wiki/proxy-protocols/proxy-types#vmess
                    proxy.cipher = normalizeVmessSecurity(proxy.cipher);
                } else if (proxy.type === 'tuic') {
                    if (isPresent(proxy, 'alpn')) {
                        proxy.alpn = Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : [proxy.alpn];
                    }
                    //  else {
                    //     proxy.alpn = ['h3'];
                    // }
                    if (
                        isPresent(proxy, 'tfo') &&
                        !isPresent(proxy, 'fast-open')
                    ) {
                        proxy['fast-open'] = proxy.tfo;
                    }
                    // https://github.com/MetaCubeX/Clash.Meta/blob/Alpha/adapter/outbound/tuic.go#L197
                    if (
                        (!proxy.token || proxy.token.length === 0) &&
                        !isPresent(proxy, 'version')
                    ) {
                        proxy.version = 5;
                    }
                } else if (proxy.type === 'hysteria') {
                    // auth_str 将会在未来某个时候删除 但是有的机场不规范
                    if (
                        isPresent(proxy, 'auth_str') &&
                        !isPresent(proxy, 'auth-str')
                    ) {
                        proxy['auth-str'] = proxy['auth_str'];
                    }
                    if (isPresent(proxy, 'alpn')) {
                        proxy.alpn = Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : [proxy.alpn];
                    }
                    if (
                        isPresent(proxy, 'tfo') &&
                        !isPresent(proxy, 'fast-open')
                    ) {
                        proxy['fast-open'] = proxy.tfo;
                    }
                } else if (proxy.type === 'hysteria2') {
                    // 新版已更改
                    // if (proxy['obfs-password'] && proxy.obfs == 'salamander') {
                    //     proxy.obfs = proxy['obfs-password'];
                    //     delete proxy['obfs-password'];
                    // }
                    if (isPresent(proxy, 'alpn')) {
                        proxy.alpn = Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : [proxy.alpn];
                    }
                    if (
                        isPresent(proxy, 'tfo') &&
                        !isPresent(proxy, 'fast-open')
                    ) {
                        proxy['fast-open'] = proxy.tfo;
                    }
                } else if (proxy.type === 'wireguard') {
                    proxy.keepalive =
                        proxy.keepalive ?? proxy['persistent-keepalive'];
                    proxy['persistent-keepalive'] = proxy.keepalive;
                    proxy['preshared-key'] =
                        proxy['preshared-key'] ?? proxy['pre-shared-key'];
                    proxy['pre-shared-key'] = proxy['preshared-key'];
                    proxy.ip = getWireGuardAddressWithCIDR(proxy, 'ipv4');
                    proxy.ipv6 = getWireGuardAddressWithCIDR(proxy, 'ipv6');
                } else if (proxy.type === 'snell') {
                    if (proxy.version < 3 && !producingNativeText) {
                        delete proxy.udp;
                    }
                    if (proxy.plugin === 'shadow-tls' && proxy['plugin-opts']) {
                        proxy['obfs-opts'] = {
                            mode: 'shadow-tls',
                            host: proxy['plugin-opts'].host,
                            password: proxy['plugin-opts'].password,
                            version: proxy['plugin-opts'].version,
                        };
                        if (proxy['plugin-opts'].alpn) {
                            proxy['obfs-opts'].alpn = proxy['plugin-opts'].alpn;
                        }
                        delete proxy.plugin;
                        delete proxy['plugin-opts'];
                    }
                } else if (proxy.type === 'vless') {
                    if (isPresent(proxy, 'sni')) {
                        proxy.servername = proxy.sni;
                        delete proxy.sni;
                    }
                } else if (proxy.type === 'ss') {
                    if (isShadowsocksOverTls(proxy)) {
                        if (isPresent(proxy, 'sni')) {
                            proxy.servername = proxy.sni;
                            // 先不删 没有明确的规范
                            // delete proxy.sni;
                        }
                    }
                } else if (
                    ['anytls'].includes(proxy.type) &&
                    proxy.reuse != null &&
                    !proxy.reuse
                ) {
                    proxy['disable-reuse'] = true;
                    delete proxy.reuse;
                }

                if (
                    ['vmess', 'vless'].includes(proxy.type) &&
                    proxy.network === 'http'
                ) {
                    let httpPath = proxy['http-opts']?.path;
                    if (
                        isPresent(proxy, 'http-opts.path') &&
                        !Array.isArray(httpPath)
                    ) {
                        proxy['http-opts'].path = [httpPath];
                    }
                    let httpHost = proxy['http-opts']?.headers?.Host;
                    if (
                        isPresent(proxy, 'http-opts.headers.Host') &&
                        !Array.isArray(httpHost)
                    ) {
                        proxy['http-opts'].headers.Host = [httpHost];
                    }
                }
                if (
                    ['vmess', 'vless'].includes(proxy.type) &&
                    proxy.network === 'h2'
                ) {
                    let path = proxy['h2-opts']?.path;
                    if (
                        isPresent(proxy, 'h2-opts.path') &&
                        Array.isArray(path)
                    ) {
                        proxy['h2-opts'].path = path[0];
                    }
                    let host =
                        proxy['h2-opts']?.host ??
                        proxy['h2-opts']?.headers?.host ??
                        proxy['h2-opts']?.headers?.Host;
                    if (
                        isPresent(proxy, 'h2-opts.host') ||
                        isPresent(proxy, 'h2-opts.headers.host') ||
                        isPresent(proxy, 'h2-opts.headers.Host')
                    ) {
                        proxy['h2-opts'].host = Array.isArray(host)
                            ? host
                            : [host];
                    }
                    if (proxy['h2-opts']?.headers) {
                        delete proxy['h2-opts'].headers.host;
                        delete proxy['h2-opts'].headers.Host;
                        if (
                            Object.keys(proxy['h2-opts'].headers).length === 0
                        ) {
                            delete proxy['h2-opts'].headers;
                        }
                    }
                }
                if (['ws'].includes(proxy.network)) {
                    const networkOptsKey = `${proxy.network}-opts`;
                    proxy[networkOptsKey] = proxy[networkOptsKey] || {};
                    if (!proxy[networkOptsKey].path) {
                        proxy[networkOptsKey].path = '/';
                    }
                    normalizeWebSocketEarlyDataPath(proxy[networkOptsKey]);
                }

                if (proxy['plugin-opts']?.tls) {
                    if (isPresent(proxy, 'skip-cert-verify')) {
                        proxy['plugin-opts']['skip-cert-verify'] =
                            proxy['plugin-opts']['skip-cert-verify'] ||
                            proxy['skip-cert-verify'];
                    }
                }
                if (
                    [
                        'trojan',
                        'tuic',
                        'hysteria',
                        'hysteria2',
                        'juicity',
                        'anytls',
                        'trusttunnel',
                        'naive',
                    ].includes(proxy.type)
                ) {
                    delete proxy.tls;
                }

                if (proxy['tls-fingerprint']) {
                    proxy.fingerprint = proxy['tls-fingerprint'];
                }
                delete proxy['tls-fingerprint'];

                if (proxy['underlying-proxy']) {
                    proxy['dialer-proxy'] = proxy['underlying-proxy'];
                }
                delete proxy['underlying-proxy'];

                if (isPresent(proxy, 'tls') && typeof proxy.tls !== 'boolean') {
                    delete proxy.tls;
                }
                delete proxy.subName;
                delete proxy.collectionName;
                delete proxy.id;
                delete proxy.resolved;
                delete proxy['no-resolve'];
                delete proxy['ip-cidr'];
                delete proxy['ipv6-cidr'];
                if (type !== 'internal') {
                    for (const key in proxy) {
                        if (
                            proxy[key] == null ||
                            (!producingNativeText && /^_/i.test(key))
                        ) {
                            delete proxy[key];
                        }
                    }
                    if (!producingNativeText) {
                        deleteHttpUpgradeEarlyDataMetadata(
                            proxy[`${proxy.network}-opts`],
                        );
                    }
                }
                if (
                    ['grpc'].includes(proxy.network) &&
                    proxy[`${proxy.network}-opts`]
                ) {
                    delete proxy[`${proxy.network}-opts`]['_grpc-type'];
                    delete proxy[`${proxy.network}-opts`]['_grpc-authority'];
                }
                return proxy;
            });
        if (opts.native && type !== 'internal') {
            return list
                .map((proxy) => {
                    const output = produceNativeShadowrocketProxy(proxy);
                    if (!output) {
                        throw new Error(
                            `Unsupported Shadowrocket native proxy type: ${proxy.type}`,
                        );
                    }
                    return output;
                })
                .join('\n');
        }
        return produceProxyListOutput(list, type, opts);
    };
    return { type, produce };
}

function hasShadowrocketSnellShadowTlsObfsConflict(proxy) {
    return (
        proxy?.type === 'snell' &&
        proxy?.plugin === 'shadow-tls' &&
        (isPresent(proxy, 'obfs-opts.mode') ||
            isPresent(proxy, 'obfs-opts.host') ||
            isPresent(proxy, 'obfs-opts.path'))
    );
}
