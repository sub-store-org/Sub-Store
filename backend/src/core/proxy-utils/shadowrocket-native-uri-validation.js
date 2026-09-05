import {
    rememberShadowrocketNativeError,
    validateShadowrocketNativeInput,
} from './shadowrocket-native-validation';

// These are the URI options that can reach the enabled native subset. Other
// targets keep their existing permissive parsers; native rejects discarded data.
const QUERY_FIELDS = {
    ss: ['udp', 'allowInsecure', 'security', 'sni', 'peer'],
    vless: [
        'security',
        'type',
        'sni',
        'peer',
        'allowInsecure',
        'host',
        'obfsParam',
        'path',
        'remarks',
        'remark',
        'encryption',
        'packetEncoding',
    ],
    trojan: ['security', 'type', 'sni', 'peer', 'allowInsecure'],
    hysteria: [
        'auth',
        'alpn',
        'insecure',
        'obfsParam',
        'protocol',
        'upmbps',
        'downmbps',
        'sni',
        'peer',
    ],
    hysteria2: ['sni', 'peer', 'insecure', 'fastopen', 'obfs', 'obfs-password'],
    tuic: [
        'alpn',
        'allow-insecure',
        'insecure',
        'fast-open',
        'disable-sni',
        'reduce-rtt',
        'congestion-control',
        'sni',
    ],
    wireguard: [
        'publickey',
        'privatekey',
        'address',
        'ip',
        'reserved',
        'mtu',
        'udp',
        'dns',
        'keepalive',
        'flag',
    ],
    http: [],
    https: [],
    socks5: [],
    'socks5+tls': [],
    socks: [],
};
const SCHEME_ALIASES = { hy: 'hysteria', hy2: 'hysteria2', wg: 'wireguard' };
const BOOLEAN_FIELDS = [
    'udp',
    'allowInsecure',
    'allow-insecure',
    'insecure',
    'fastopen',
    'fast-open',
    'disable-sni',
    'reduce-rtt',
];

export function rememberShadowrocketNativeUriValidation(proxy, line) {
    const scheme = /^([a-z0-9+-]+):\/\//i.exec(line)?.[1];
    const protocol = SCHEME_ALIASES[scheme] ?? scheme;
    const allowed = QUERY_FIELDS[protocol];
    if (!allowed) return;
    const query = line.split('#')[0].split('?').slice(1).join('?');
    if (!query) return;
    try {
        const params = Object.create(null);
        for (const entry of query.split('&').filter(Boolean)) {
            const index = entry.indexOf('=');
            const rawKey = index === -1 ? entry : entry.slice(0, index);
            const key = protocol === 'tuic' ? rawKey.replace(/_/g, '-')
                : protocol === 'wireguard' && /^(publickey|privatekey)$/i.test(rawKey)
                ? rawKey.toLowerCase() : rawKey;
            const value =
                index === -1 ? '' : decodeURIComponent(entry.slice(index + 1));
            if (!allowed.includes(key)) {
                throw new Error(
                    `Unsupported Shadowrocket native ${protocol} URI option: ${key}`,
                );
            }
            if (
                BOOLEAN_FIELDS.includes(key) &&
                !/^(true|false|0|1)$/i.test(value)
            ) {
                throw new Error(
                    `Invalid Shadowrocket native ${protocol} URI ${key}`,
                );
            }
            const equivalent = BOOLEAN_FIELDS.includes(key)
                ? /^(true|1)$/i.test(params[key]) === /^(true|1)$/i.test(value)
                : params[key] === value;
            if (params[key] != null && !equivalent) {
                throw new Error(
                    `Conflicting Shadowrocket native ${protocol} URI ${key}`,
                );
            }
            params[key] = value;
        }
        for (const keys of [
            ['sni', 'peer'],
            ['host', 'obfsParam'],
            ['address', 'ip'],
            ['allowInsecure', 'allow-insecure', 'insecure'],
        ]) {
            const values = keys
                .map((key) => params[key])
                .filter((value) => value != null);
            const normalized = values.map((value) =>
                keys[0] === 'allowInsecure' ? /^(true|1)$/i.test(value) : value,
            );
            if (new Set(normalized).size > 1) {
                throw new Error(
                    `Conflicting Shadowrocket native ${protocol} URI ${keys.join(
                        '/',
                    )}`,
                );
            }
        }
        if (
            params.security != null &&
            !['none', 'tls'].includes(params.security)
        ) {
            throw new Error(
                `Unsupported Shadowrocket native ${protocol} URI security`,
            );
        }
        if (protocol === 'trojan' && params.security === 'none') {
            throw new Error(
                'Unsupported Shadowrocket native Trojan URI without TLS',
            );
        }
        if (
            params.type != null &&
            !['tcp', 'none', ...(protocol === 'vless' ? ['ws'] : [])].includes(
                params.type,
            )
        ) {
            throw new Error(
                `Unsupported Shadowrocket native ${protocol} URI transport`,
            );
        }
        if (protocol === 'vless') {
            if (
                params.packetEncoding != null &&
                params.packetEncoding !== 'xudp'
            ) {
                throw new Error(
                    'Unsupported Shadowrocket native VLESS URI packetEncoding',
                );
            }
            if (
                params.type !== 'ws' &&
                [params.host, params.obfsParam, params.path].some(
                    (value) => value != null && value !== '',
                )
            ) {
                throw new Error(
                    'Unsupported Shadowrocket native VLESS URI transport options without WebSocket',
                );
            }
        }
        // Values that these parsers used to truncate at a second equals sign.
        for (const [source, target] of [
            ['auth', 'auth-str'],
            ['obfs-password', 'obfs-password'],
            ['sni', 'sni'],
            ['peer', 'sni'],
        ]) {
            if (params[source] != null && proxy[target] !== params[source]) {
                throw new Error(
                    `Cannot preserve Shadowrocket native ${protocol} URI ${source}`,
                );
            }
        }
        if (protocol === 'wireguard') {
            const authority = line.slice(line.indexOf('://') + 3).split(/[?#]/)[0];
            const at = authority.lastIndexOf('@');
            if (at !== -1 && params.privatekey != null &&
                decodeURIComponent(authority.slice(0, at)) !== params.privatekey) {
                throw new Error('Conflicting Shadowrocket native WireGuard URI private key');
            }
            const address = params.address ?? params.ip;
            if (address != null) {
                if (address.includes(','))
                    throw new Error(
                        'Unsupported multiple Shadowrocket native WireGuard URI addresses',
                    );
                validateShadowrocketNativeInput({
                    type: 'wireguard',
                    ip: address,
                });
            }
            for (const key of ['mtu', 'keepalive']) {
                if (
                    params[key] != null &&
                    (!/^\d+$/.test(params[key]) ||
                        !Number.isSafeInteger(Number(params[key])))
                ) {
                    throw new Error(
                        `Invalid Shadowrocket native WireGuard URI ${key}`,
                    );
                }
            }
            if (
                params.reserved != null &&
                !/^\d+,\d+,\d+$/.test(params.reserved)
            ) {
                throw new Error(
                    'Invalid Shadowrocket native WireGuard URI reserved',
                );
            }
        }
    } catch (error) {
        rememberShadowrocketNativeError(proxy, error.message);
    }
}
