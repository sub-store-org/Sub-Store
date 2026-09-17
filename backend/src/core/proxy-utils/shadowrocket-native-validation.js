import { isEqual } from 'lodash';
import { normalizeVmessSecurity } from './vmess-security';
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

// Canonicalize spelling only: validate original values before shared parsers
// coerce or discard them. Conflicting aliases must never select a winner.
export function normalizeShadowrocketNativeKeys(proxy) {
    const isRecord = (value) =>
        value && typeof value === 'object' && !Array.isArray(value);
    const canonicalize = (value, keyFor, valueFor, path) => {
        if (!isRecord(value)) return value;
        const result = {};
        for (const [key, raw] of Object.entries(value)) {
            const name = keyFor(key);
            const normalized = valueFor(raw, name);
            if (Object.prototype.hasOwnProperty.call(result, name)) {
                if (!isEqual(result[name], normalized)) {
                    const label =
                        path === 'ws-opts.headers'
                            ? `${
                                  NATIVE_PROTOCOL_NAMES[proxy.type] ??
                                  proxy.type
                              } WebSocket Host aliases`
                            : `${path ? `${path}.` : ''}${name} aliases`;
                    throw new Error(`Conflicting Shadowrocket native ${label}`);
                }
            } else {
                Object.defineProperty(result, name, {
                    value: normalized,
                    enumerable: true,
                    configurable: true,
                    writable: true,
                });
            }
        }
        return result;
    };
    const headers = (value) =>
        canonicalize(
            value,
            (key) => (key.toLowerCase() === 'host' ? 'Host' : key),
            (raw) => raw,
            'ws-opts.headers',
        );
    const result = canonicalize(
        proxy,
        (key) =>
            key.toLowerCase().endsWith('-opts') ? key.toLowerCase() : key,
        (value, key) =>
            key.endsWith('-opts')
                ? canonicalize(
                      value,
                      (name) => name.toLowerCase(),
                      (raw, name) =>
                          key === 'ws-opts' && name === 'headers'
                              ? headers(raw)
                              : raw,
                      key,
                  )
                : key === 'ws-headers'
                ? headers(value)
                : value,
        '',
    );
    return copyShadowrocketNativeValidation(proxy, result);
}

export function validateShadowrocketNativeInput(proxy) {
    if (proxy[ERROR_FIELD]) throw new Error(proxy[ERROR_FIELD]);
    proxy = normalizeShadowrocketNativeKeys(proxy);
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
            .filter((value) => value != null);
        if (new Set(values.map((value) => String(value))).size > 1) {
            throw new Error(
                `Conflicting Shadowrocket native ${keys.join('/')} aliases`,
            );
        }
    }
    if (proxy.type === 'hysteria' && proxy.auth != null && proxy.auth !== '') {
        throw new Error(
            'Unsupported Shadowrocket native Hysteria auth: Base64 authentication is not supported; use auth-str for literal authentication',
        );
    }
    // Port hopping is unsupported by the enabled native syntax. Reject the
    // original fields, including malformed values that lastParse would delete.
    for (const key of ['ports', 'hop-interval', 'hop-interval-max']) {
        if (proxy[key] != null) {
            throw new Error(
                `Unsupported Shadowrocket native ${
                    NATIVE_PROTOCOL_NAMES[proxy.type] ?? proxy.type
                } options: ${key}`,
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
    if (
        Object.prototype.hasOwnProperty.call(proxy, 'reality-opts') &&
        proxy['reality-opts'] != null
    ) {
        throw new Error(
            `Unsupported Shadowrocket native ${
                NATIVE_PROTOCOL_NAMES[proxy.type] ?? proxy.type
            } options: Reality (reality-opts)`,
        );
    }
    if (
        proxy.type === 'hysteria2' &&
        proxy.obfs != null &&
        proxy.obfs !== '' &&
        proxy.obfs !== 'salamander'
    ) {
        throw new Error(
            `Unsupported Shadowrocket native Hysteria2 obfs: ${
                typeof proxy.obfs === 'string' ? proxy.obfs : 'invalid type'
            }`,
        );
    }
    if (
        proxy.type === 'hysteria2' &&
        proxy.obfs === 'salamander' &&
        !proxy['obfs-password'] &&
        !proxy.obfs_password
    ) {
        throw new Error(
            'Missing required Shadowrocket native Hysteria2 salamander obfs-password',
        );
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
    if (proxy.server) {
        const host = proxy.server.replace(/^\[|\]$/g, '');
        if (!isIPv6(host) && /[:[\]/\\?#@=\s]/u.test(proxy.server)) {
            throw new Error('Invalid Shadowrocket native server: expected hostname or IP address');
        }
    }
    for (const key of [
        'up',
        'down',
        'mtu',
        'keepalive',
        'persistent-keepalive',
        'version',
    ]) {
        const value = proxy[key];
        if (value == null || value === '') continue;
        const bandwidth = ['up', 'down'].includes(key);
        const numeric = Number(value);
        if (
            !(bandwidth ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(String(value)) ||
            !Number.isFinite(numeric) ||
            (!bandwidth && !Number.isSafeInteger(numeric)) ||
            (['mtu', 'version'].includes(key) && numeric === 0)
        ) {
            throw new Error(
                `Invalid Shadowrocket native ${key}: expected non-negative ${
                    bandwidth ? 'number' : 'integer'
                }`,
            );
        }
    }

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
    if (proxy.network !== 'ws' && ['ws-opts', 'ws-path', 'ws-headers'].some(
        (key) => proxy[key] != null && proxy[key] !== '',
    )) {
        throw new Error('Unsupported Shadowrocket native WebSocket options without WebSocket');
    }
    if (proxy.network === 'ws' && proxy['ws-opts']) {
        for (const [legacy, field] of [
            ['ws-path', 'path'],
            ['ws-headers', 'headers'],
        ]) {
            if (
                proxy[legacy] != null &&
                proxy[legacy] !== '' &&
                !isEqual(proxy[legacy], proxy['ws-opts'][field])
            ) {
                throw new Error(
                    `Conflicting Shadowrocket native ${legacy}/ws-opts.${field} aliases`,
                );
            }
        }
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
                    cidr !== undefined &&
                    proxy[cidrKey] != null &&
                    Number(cidr) !== Number(proxy[cidrKey])
                ) {
                    throw new Error(
                        `Invalid Shadowrocket native WireGuard ${cidrKey} conflict`,
                    );
                }
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
        'disable-sni',
        'reduce-rtt',
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
        // Use the shared supported-value/alias table, but never its lossy
        // fallback for an explicitly supplied cipher.
        if (
            proxy.cipher != null &&
            normalizeVmessSecurity(proxy.cipher, undefined, {
                fallback: null,
            }) === null
        ) {
            throw new Error('Unsupported Shadowrocket native VMess cipher');
        }
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

// The VMess URI parser accepts several schemas and normalizes before lastParse.
// Check the URI fields themselves so native validation does not see only defaults.
export function rememberShadowrocketNativeVmessUriValidation(proxy, params) {
    try {
        const allowed = new Set([
            'v',
            'ps',
            'remarks',
            'remark',
            'add',
            'port',
            'scy',
            'id',
            'aid',
            'alterId',
            'aead',
            'tls',
            'verify_cert',
            'allowInsecure',
            'sni',
            'peer',
            'net',
            'obfs',
            'type',
            'host',
            'obfsParam',
            'path',
            'fp',
            'alpn',
        ]);
        for (const [key, value] of Object.entries(params)) {
            if (value != null && !allowed.has(key)) {
                throw new Error(
                    `Unsupported Shadowrocket native VMess URI option: ${key}`,
                );
            }
        }
        for (const key of [
            'ps',
            'remarks',
            'remark',
            'add',
            'scy',
            'id',
            'net',
            'obfs',
            'type',
            'host',
            'obfsParam',
            'path',
            'sni',
            'peer',
            'fp',
            'alpn',
            'authority',
        ]) {
            scalar(params[key], `VMess URI ${key}`);
        }
        for (const keys of [
            ['aid', 'alterId'],
            ['sni', 'peer'],
            ['host', 'obfsParam'],
        ]) {
            const values = keys
                .map((key) => params[key])
                .filter((value) => value != null);
            const normalized = values.map((value) =>
                keys[0] === 'aid' && /^\d+$/.test(String(value)) &&
                Number.isSafeInteger(Number(value))
                    ? String(Number(value)) : String(value),
            );
            if (new Set(normalized).size > 1) {
                throw new Error(
                    `Conflicting Shadowrocket native VMess URI ${keys.join(
                        '/',
                    )} aliases`,
                );
            }
        }
        if (
            params.net != null &&
            !['', 'tcp', 'none', 'ws'].includes(params.net)
        ) {
            throw new Error(
                'Unsupported Shadowrocket native VMess URI transport',
            );
        }
        if (
            params.obfs != null &&
            !['', 'none', 'websocket'].includes(params.obfs)
        ) {
            throw new Error('Unsupported Shadowrocket native VMess URI obfs');
        }
        if (params.type != null && !['', 'none'].includes(params.type)) {
            throw new Error(
                'Unsupported Shadowrocket native VMess URI header type',
            );
        }
        for (const key of ['tls', 'verify_cert', 'allowInsecure']) {
            const value = params[key];
            const allowedValues = [
                undefined,
                null,
                false,
                true,
                0,
                1,
                '0',
                '1',
                'false',
                'true',
            ];
            if (key === 'tls') allowedValues.push('', 'tls');
            if (!allowedValues.includes(value)) {
                throw new Error(`Invalid Shadowrocket native VMess URI ${key}`);
            }
        }
        // Validate a separate view; native support decisions must never change
        // how the shared parser interprets TLS for other output targets.
        const bool = (value) => [true, 1, '1', 'true', 'tls'].includes(value);
        const tls = bool(params.tls);
        if (
            !tls &&
            [params.sni, params.peer].some(
                (value) => value != null && value !== '',
            )
        ) {
            throw new Error(
                'Unsupported Shadowrocket native VMess URI SNI without TLS',
            );
        }
        const websocket = params.net === 'ws' || params.obfs === 'websocket';
        if ((params.obfs === 'websocket' && params.net && params.net !== 'ws') ||
            (params.net === 'ws' && params.obfs != null && params.obfs !== 'websocket')) {
            throw new Error(
                'Conflicting Shadowrocket native VMess URI transport aliases',
            );
        }
        if (
            !websocket &&
            [params.host, params.obfsParam, params.path].some(
                (value) => value != null && value !== '',
            )
        ) {
            throw new Error(
                'Unsupported Shadowrocket native VMess URI transport options without WebSocket',
            );
        }

        const verify =
            params.verify_cert != null ? !bool(params.verify_cert) : undefined;
        const insecure =
            params.allowInsecure != null
                ? bool(params.allowInsecure)
                : undefined;
        if (verify != null && insecure != null && verify !== insecure) {
            throw new Error(
                'Conflicting Shadowrocket native VMess URI certificate verification aliases',
            );
        }
        validateShadowrocketNativeInput({
            ...proxy,
            tls,
            'skip-cert-verify': verify ?? insecure,
            cipher: params.scy,
            port: params.port,
            alterId: params.aid ?? params.alterId,
            aead: params.aead,
        });
    } catch (error) {
        rememberShadowrocketNativeError(proxy, error.message);
    }
}

export function rememberShadowrocketNativeValidation(proxy, original = proxy) {
    try {
        validateShadowrocketNativeInput(original);
    } catch (error) {
        rememberShadowrocketNativeError(proxy, error.message);
    }
}

export function rememberShadowrocketNativeError(proxy, message) {
    if (proxy[ERROR_FIELD]) return;
    Object.defineProperty(proxy, ERROR_FIELD, {
        value: message,
        enumerable: false,
        configurable: true,
    });
}

// Export a clean copy without changing the original validation state.
export function withoutShadowrocketNativeValidation(proxy) {
    if (!Object.prototype.hasOwnProperty.call(proxy, ERROR_FIELD)) return proxy;
    const copy = { ...proxy };
    delete copy[ERROR_FIELD];
    return copy;
}

// Built-in operators clone proxy arrays through JSON. Explicitly carry their
// non-enumerable validation state into that clone; never serialize it.
export function copyShadowrocketNativeValidation(source, target) {
    if (Array.isArray(source) && Array.isArray(target)) {
        source.forEach((proxy, index) =>
            copyShadowrocketNativeValidation(proxy, target[index]),
        );
    } else if (
        source &&
        target &&
        typeof source === 'object' &&
        typeof target === 'object' &&
        source[ERROR_FIELD]
    ) {
        Object.defineProperty(target, ERROR_FIELD, {
            value: source[ERROR_FIELD],
            enumerable: false,
            configurable: true,
        });
    }
    return target;
}

// Quantumult VMess URI values are scalars; commas inside quotes belong to
// their values. Text grammars report their own boundaries below.
export function splitShadowrocketOptions(input) {
    const parts = [];
    let start = 0;
    let quote = '';
    let escaped = false;
    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = '';
        } else if ((char === '"' || char === "'") &&
            /(?:^|[=:,])\s*$/.test(input.slice(start, index))) {
            quote = char;
        } else if (char === ',') {
            parts.push(input.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(input.slice(start).trim());
    return parts;
}

export function rememberShadowrocketNativeDuplicateOptions(proxy, entries) {
    const seen = new Map();
    for (const [rawKey, value] of entries) {
        const key = ['sni', 'tls-name', 'tls-host'].includes(rawKey) ? 'sni'
            : ['tls', 'over-tls'].includes(rawKey) ? 'tls'
            : ['tfo', 'fast-open'].includes(rawKey) ? 'tfo' : rawKey;
        if (seen.has(key) && !isEqual(seen.get(key), value)) {
            rememberShadowrocketNativeError(proxy, `Conflicting Shadowrocket native option: ${key}`);
        }
        seen.set(key, value);
    }
}

// Text grammars intentionally ignore unknown options for legacy targets.
// Preserve that loss as private metadata so native export can reject it.
export function withShadowrocketNativeParserValidation(parser) {
    return {
        ...parser,
        parse(input, options = {}) {
            // Use actual grammar separators, not a second tokenizer with
            // different rules for literal brackets/quotes in credentials.
            // PEG alternatives can revisit a separator; deduplicate offsets.
            const boundaries = new Map();
            const equals = new Map();
            const parsedValues = new Map();
            const proxy = parser.parse(input, {
                ...options,
                onOptionBoundary: ({ start, end }) =>
                    boundaries.set(start.offset, end.offset),
                onOptionEquals: ({ start, end }) =>
                    equals.set(input.indexOf('=', start.offset), end.offset),
                onParsedOption: ({ start }, value) =>
                    parsedValues.set(start.offset, value),
                onConflictingOption: (proxy, key) =>
                    rememberShadowrocketNativeError(proxy, `Conflicting Shadowrocket native option: ${key}`),
                onIgnoredOption: (proxy, key) =>
                    rememberShadowrocketNativeError(
                        proxy,
                        `Unsupported Shadowrocket native option: ${key}`,
                    ),
            });
            const positions = Array.from(boundaries).sort(([a], [b]) => a - b);
            const entries = positions.flatMap(([start, end], index) => {
                const next = positions[index + 1]?.[0] ?? input.length;
                const part = input.slice(end, next);
                const match = /^([\w-]+)\s*=/.exec(part);
                if (!match) return [];
                // A literal '=' in a positional password is not a named
                // option: only accept equals signs consumed by the grammar.
                const separator = end + match[0].length - 1;
                if (!equals.has(separator)) return [];
                // Rules that interpret quotes/whitespace report their value.
                // Unreported raw values must not be trimmed: whitespace
                // can be significant in credentials and paths.
                const value = parsedValues.has(start)
                    ? parsedValues.get(start)
                    : input.slice(equals.get(separator), next);
                return [[match[1], value]];
            });
            rememberShadowrocketNativeDuplicateOptions(proxy, entries);
            return proxy;
        },
    };
}
