/* eslint-disable no-undef */

export const NODE_CORS_ALLOWED_ORIGINS_ENV =
    'SUB_STORE_CORS_ALLOWED_ORIGINS';
export const NODE_CORS_DEFAULT = '*';
export const NON_NODE_CORS_DEFAULT = 'https://sub-store.vercel.app';
export const CORS_ARGUMENT_KEY = 'cors';

const WILDCARD_ORIGIN = '*';

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

    const policy = parseAllowedOrigins(rawValue, source);
    if (!policy.wildcard && policy.origins.length === 0) {
        return parseAllowedOrigins(
            defaultValue,
            isNode ? 'default:node' : 'default:non-node',
        );
    }
    return policy;
}

export function resolveRuntimeCorsPolicy({ isNode } = {}) {
    return resolveCorsPolicy({
        isNode,
        envValue: isNode ? readNodeCorsEnv() : undefined,
        argument: isNode ? undefined : readScriptArgument(),
    });
}

export function isOriginAllowed(policy, origin) {
    if (!origin) return true;
    if (policy?.wildcard) return true;

    const normalizedOrigin = normalizeOrigin(origin);
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
    return `${policy?.wildcard ? WILDCARD_ORIGIN : policy?.origins?.join(',') || ''} (${policy?.source})`;
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

function readNodeCorsEnv() {
    try {
        return eval(`process.env.${NODE_CORS_ALLOWED_ORIGINS_ENV}`);
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
