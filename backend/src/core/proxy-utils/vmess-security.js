export const VMESS_SECURITY_AUTO = 'auto';

export const VMESS_SECURITY_COMMON_VALUES = [
    VMESS_SECURITY_AUTO,
    'none',
    'zero',
    'aes-128-gcm',
    'chacha20-poly1305',
];

export const VMESS_SECURITY_CLASH_VALUES = [
    VMESS_SECURITY_AUTO,
    'aes-128-gcm',
    'chacha20-poly1305',
    'none',
];

const VMESS_SECURITY_QX_METHOD_VALUES = ['none', 'chacha20-poly1305'];

const VMESS_SECURITY_ALIASES = {
    'chacha20-ietf-poly1305': 'chacha20-poly1305',
};

function normalizeSecurityValue(security) {
    if (security == null) return '';
    return `${security}`.trim().toLowerCase();
}

function canonicalizeVmessSecurity(security) {
    return VMESS_SECURITY_ALIASES[security] || security;
}

export function normalizeVmessSecurity(
    security,
    supportedValues = VMESS_SECURITY_COMMON_VALUES,
    { acceptAliases = true, fallback = VMESS_SECURITY_AUTO } = {},
) {
    const normalized = normalizeSecurityValue(security);
    if (!normalized) return fallback;

    const normalizedSupported = supportedValues.map(normalizeSecurityValue);
    if (normalizedSupported.includes(normalized)) {
        return canonicalizeVmessSecurity(normalized);
    }

    const canonical = canonicalizeVmessSecurity(normalized);
    const canonicalSupported = normalizedSupported.map(
        canonicalizeVmessSecurity,
    );
    if (acceptAliases && canonicalSupported.includes(canonical)) {
        return canonical;
    }

    return fallback;
}

export function normalizeClashVmessSecurity(security) {
    return normalizeVmessSecurity(security, VMESS_SECURITY_CLASH_VALUES);
}

export function formatQXVmessMethod(security) {
    return normalizeVmessSecurity(security, VMESS_SECURITY_QX_METHOD_VALUES, {
        fallback: 'chacha20-poly1305',
    });
}

export function formatLoonVmessSecurity(security) {
    const normalized = normalizeClashVmessSecurity(security);

    return normalized === 'chacha20-poly1305'
        ? 'chacha20-ietf-poly1305'
        : normalized;
}

export function formatSurgeVmessEncryptMethod(security) {
    const normalized = normalizeVmessSecurity(security, [
        'aes-128-gcm',
        'chacha20-poly1305',
    ]);

    if (normalized === VMESS_SECURITY_AUTO) return undefined;

    return normalized === 'chacha20-poly1305'
        ? 'chacha20-ietf-poly1305'
        : normalized;
}
