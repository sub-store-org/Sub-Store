/* eslint-disable no-undef */

export const NODE_CORS_ALLOWED_ORIGINS_ENV = 'SUB_STORE_CORS_ALLOWED_ORIGINS';
export const NON_NODE_CORS_DEFAULT =
    'https://sub-store.vercel.app,http://substore.stash,https://substore.stash';
export const NODE_CORS_DEFAULT = NON_NODE_CORS_DEFAULT;
export const CORS_ARGUMENT_KEY = 'cors';

const WILDCARD_ORIGIN = '*';
const LOCAL_HTTP_HOSTS = ['localhost', '127.0.0.1'];

export function parseArgument(rawArgument) {
    if (rawArgument == null || rawArgument === '') return {};
    if (typeof rawArgument === 'object') return rawArgument;
    const argument = stripWrappingQuotes(`${rawArgument}`.trim());

    return Object.fromEntries(
        argument
            .split('&')
            .filter(Boolean)
            .map((item) => {
                const [key, ...value] = item.split('=');
                return [
                    stripWrappingQuotes(safeDecode(key).trim()),
                    stripWrappingQuotes(safeDecode(value.join('=').trim())),
                ];
            }),
    );
}

export function resolveCorsPolicy({
    isNode,
    envValue,
    argument,
    customBackendName,
} = {}) {
    const defaultValue = isNode ? NODE_CORS_DEFAULT : NON_NODE_CORS_DEFAULT;
    const configuredValue = isNode
        ? envValue
        : parseArgument(argument)?.[CORS_ARGUMENT_KEY];
    const hasConfiguredValue =
        configuredValue != null && `${configuredValue}`.trim() !== '';
    const rawValue = hasConfiguredValue ? configuredValue : defaultValue;
    const source = hasConfiguredValue
        ? isNode
            ? `env:${NODE_CORS_ALLOWED_ORIGINS_ENV}`
            : `argument:${CORS_ARGUMENT_KEY}`
        : isNode
        ? 'default:node'
        : 'default:non-node';

    const parsedPolicy = parseAllowedOrigins(rawValue, source);
    const policy =
        !parsedPolicy.wildcard && parsedPolicy.origins.length === 0
            ? parseAllowedOrigins(
                  defaultValue,
                  isNode ? 'default:node' : 'default:non-node',
              )
            : parsedPolicy;

    return isNode && customBackendName && policy.source === 'default:node'
        ? { ...policy, allowLocalOrigins: true }
        : policy;
}

export function resolveRuntimeCorsPolicy({ isNode } = {}) {
    return resolveCorsPolicy({
        isNode,
        envValue: isNode
            ? readNodeEnv(NODE_CORS_ALLOWED_ORIGINS_ENV)
            : undefined,
        argument: isNode ? undefined : readScriptArgument(),
        customBackendName: isNode
            ? readNodeEnv('SUB_STORE_BACKEND_CUSTOM_NAME')
            : undefined,
    });
}

export function isOriginAllowed(policy, origin) {
    if (!origin) return true;
    if (policy?.wildcard) return true;

    const normalizedOrigin = normalizeOrigin(origin);
    if (policy?.allowLocalOrigins && isLocalHttpOrigin(normalizedOrigin)) {
        return true;
    }
    return policy?.origins?.includes(normalizedOrigin);
}

export function getCorsHeaders(policy, origin) {
    if (policy?.wildcard) {
        return {
            'Access-Control-Allow-Origin': WILDCARD_ORIGIN,
        };
    }
    if (!origin || !isOriginAllowed(policy, origin)) return {};

    return {
        'Access-Control-Allow-Origin': normalizeOrigin(origin),
        Vary: 'Origin',
    };
}

export function describeCorsPolicy(policy) {
    const origins = policy?.wildcard
        ? [WILDCARD_ORIGIN]
        : [
              ...(policy?.origins || []),
              ...(policy?.allowLocalOrigins
                  ? LOCAL_HTTP_HOSTS.map((host) => `http://${host}:<any-port>`)
                  : []),
          ];
    return `${origins.join(',')} (${policy?.source})`;
}

function parseAllowedOrigins(rawValue, source) {
    const items = `${rawValue}`
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);

    if (items.includes(WILDCARD_ORIGIN)) {
        return {
            wildcard: true,
            origins: [],
            source,
            value: WILDCARD_ORIGIN,
        };
    }

    const origins = [...new Set(items.map(normalizeOrigin))];
    return {
        wildcard: false,
        origins,
        source,
        value: origins.join(','),
    };
}

function normalizeOrigin(origin) {
    const value = stripWrappingQuotes(`${origin}`.trim());
    if (value === WILDCARD_ORIGIN) return WILDCARD_ORIGIN;

    try {
        return new URL(value).origin;
    } catch {
        return value;
    }
}

function isLocalHttpOrigin(origin) {
    try {
        const url = new URL(origin);
        return (
            url.protocol === 'http:' && LOCAL_HTTP_HOSTS.includes(url.hostname)
        );
    } catch {
        return false;
    }
}

function readNodeEnv(name) {
    try {
        return eval('process.env')[name];
    } catch {
        return undefined;
    }
}

function readScriptArgument() {
    try {
        if (typeof $argument !== 'undefined') return $argument;
    } catch {
        return undefined;
    }
    return undefined;
}

function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function stripWrappingQuotes(value) {
    return value.replace(/^["']|["']$/g, '');
}
