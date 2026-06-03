import * as age from 'age-encryption';

import { RequestInvalidError } from '@/restful/errors';

const AGE_ARMOR_HEADER = '-----BEGIN AGE ENCRYPTED FILE-----';
const AGE_PUBLIC_KEY = 'age-public-key';
const AGE_SECRET_KEY = 'age-secret-key';

const AGE_KEY_TYPES = Object.freeze({
    X25519: 'x25519',
    HYBRID: 'mlkem768-x25519',
});

const REQUIRED_RUNTIME_APIS = [
    'TextEncoder',
    'TextDecoder',
    'ReadableStream',
    'TransformStream',
    'Response',
    'Uint8Array',
];

const SECRET_KEY_PATTERN =
    /\bAGE-SECRET-KEY(?:-PQ)?-1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]+\b/g;
const X25519_SUBTLE_FALLBACK_MARK = '__subStoreAgeX25519Fallback';

function normalizeKey(value) {
    return String(value ?? '').trim();
}

function normalizeAgePublicKeyConfig(config) {
    if (!config || typeof config !== 'object') {
        return config;
    }

    const key = normalizeKey(config[AGE_PUBLIC_KEY]);
    if (key) {
        config[AGE_PUBLIC_KEY] = validateRecipient(key);
    } else {
        delete config[AGE_PUBLIC_KEY];
    }
    return config;
}

function isSupportedX25519Recipient(key) {
    return (
        key.startsWith('age1') &&
        !key.startsWith('age1pq1') &&
        !key.startsWith('age1tag1') &&
        !key.startsWith('age1tagpq1')
    );
}

function isSupportedHybridRecipient(key) {
    return key.startsWith('age1pq1');
}

function isSupportedX25519Identity(key) {
    return key.startsWith('AGE-SECRET-KEY-1');
}

function isSupportedHybridIdentity(key) {
    return key.startsWith('AGE-SECRET-KEY-PQ-1');
}

function createUnsupportedRecipientError() {
    return new RequestInvalidError(
        'INVALID_AGE_PUBLIC_KEY',
        'age-public-key 仅支持 X25519(age1...) 或 MLKEM768-X25519(age1pq1...) 公钥',
    );
}

function createUnsupportedIdentityError() {
    return new RequestInvalidError(
        'INVALID_AGE_SECRET_KEY',
        'age-secret-key 仅支持 X25519(AGE-SECRET-KEY-1...) 或 MLKEM768-X25519(AGE-SECRET-KEY-PQ-1...) 私钥',
    );
}

function assertAgeRuntimeAvailable(root = globalThis) {
    const missing = REQUIRED_RUNTIME_APIS.filter(
        (name) => typeof root?.[name] === 'undefined',
    );
    const crypto = root?.crypto;
    const hasRandomValues =
        crypto && typeof crypto.getRandomValues === 'function';

    if (!hasRandomValues) {
        missing.push('crypto.getRandomValues');
    }

    if (missing.length > 0) {
        throw new Error(
            `当前运行环境缺少 age 加解密所需 Web API: ${missing.join(', ')}`,
        );
    }

    installX25519SubtleFallback(root);
}

function createX25519SubtleNotSupportedError() {
    if (typeof DOMException !== 'undefined') {
        return new DOMException(
            'X25519 WebCrypto is not available',
            'NotSupportedError',
        );
    }

    return new ReferenceError('X25519 WebCrypto is not available');
}

function createX25519FallbackSubtle() {
    const fallback = {
        importKey() {
            throw createX25519SubtleNotSupportedError();
        },
        deriveBits() {
            throw createX25519SubtleNotSupportedError();
        },
    };
    fallback[X25519_SUBTLE_FALLBACK_MARK] = true;
    return fallback;
}

function getAlgorithmName(algorithm) {
    return typeof algorithm === 'string' ? algorithm : algorithm?.name;
}

function isX25519Algorithm(algorithm) {
    return String(getAlgorithmName(algorithm) || '').toUpperCase() === 'X25519';
}

function isX25519UnsupportedErrorMessage(error) {
    const message = String(error?.message || error || '');
    return /x25519|algorithm|not\s+supported|unsupported|unrecognized|unknown/i.test(
        message,
    );
}

function isX25519WebCryptoFallbackError(error) {
    return (
        error instanceof TypeError ||
        error instanceof ReferenceError ||
        error?.name === 'TypeError' ||
        error?.name === 'ReferenceError' ||
        error?.name === 'NotSupportedError' ||
        (error?.name === 'Error' && isX25519UnsupportedErrorMessage(error)) ||
        (typeof DOMException !== 'undefined' &&
            error instanceof DOMException &&
            error.name === 'NotSupportedError')
    );
}

function createWrappedSubtle(subtle) {
    const wrapped = Object.create(subtle);
    Object.defineProperty(wrapped, X25519_SUBTLE_FALLBACK_MARK, {
        configurable: true,
        value: true,
    });
    Object.defineProperty(wrapped, 'importKey', {
        configurable: true,
        value: async (...args) => {
            try {
                return await subtle.importKey.apply(subtle, args);
            } catch (error) {
                if (
                    isX25519Algorithm(args[2]) &&
                    isX25519WebCryptoFallbackError(error)
                ) {
                    throw createX25519SubtleNotSupportedError();
                }
                throw error;
            }
        },
    });
    Object.defineProperty(wrapped, 'deriveBits', {
        configurable: true,
        value: async (...args) => {
            try {
                return await subtle.deriveBits.apply(subtle, args);
            } catch (error) {
                if (
                    isX25519Algorithm(args[0]) &&
                    isX25519WebCryptoFallbackError(error)
                ) {
                    throw createX25519SubtleNotSupportedError();
                }
                throw error;
            }
        },
    });

    return wrapped;
}

function setCryptoSubtle(root, crypto, subtle) {
    try {
        crypto.subtle = subtle;
        if (crypto.subtle === subtle) {
            return true;
        }
    } catch (e) {
        // Some proxy app runtimes expose crypto as a host object.
    }

    try {
        Object.defineProperty(crypto, 'subtle', {
            configurable: true,
            value: subtle,
        });
        if (crypto.subtle === subtle) {
            return true;
        }
    } catch (e) {
        // Fall through to replacing global crypto when possible.
    }

    try {
        const shimmedCrypto = Object.create(crypto);
        Object.defineProperty(shimmedCrypto, 'subtle', {
            configurable: true,
            value: subtle,
        });
        if (typeof crypto.getRandomValues === 'function') {
            Object.defineProperty(shimmedCrypto, 'getRandomValues', {
                configurable: true,
                value: crypto.getRandomValues.bind(crypto),
            });
        }
        root.crypto = shimmedCrypto;
        return root.crypto?.subtle === subtle;
    } catch (e) {
        return false;
    }
}

function installX25519SubtleFallback(root = globalThis) {
    const crypto = root?.crypto;
    const subtle = crypto?.subtle;

    if (!crypto || subtle?.[X25519_SUBTLE_FALLBACK_MARK]) {
        return;
    }

    if (
        !subtle ||
        typeof subtle.importKey !== 'function' ||
        typeof subtle.deriveBits !== 'function'
    ) {
        setCryptoSubtle(root, crypto, createX25519FallbackSubtle());
        return;
    }

    if (typeof process === 'undefined') {
        setCryptoSubtle(root, crypto, createWrappedSubtle(subtle));
    }
}

function validateRecipient(recipient) {
    const key = normalizeKey(recipient);

    if (
        !key ||
        (!isSupportedX25519Recipient(key) && !isSupportedHybridRecipient(key))
    ) {
        throw createUnsupportedRecipientError();
    }

    try {
        const encrypter = new age.Encrypter();
        encrypter.addRecipient(key);
    } catch (e) {
        throw createUnsupportedRecipientError();
    }

    return key;
}

async function validateIdentity(identity) {
    const key = normalizeKey(identity);

    if (
        !key ||
        (!isSupportedX25519Identity(key) && !isSupportedHybridIdentity(key))
    ) {
        throw createUnsupportedIdentityError();
    }

    try {
        await age.identityToRecipient(key);
    } catch (e) {
        throw createUnsupportedIdentityError();
    }

    return key;
}

async function generateKeyPair(type = AGE_KEY_TYPES.X25519) {
    assertAgeRuntimeAvailable();

    let secretKey;
    if (type === AGE_KEY_TYPES.X25519) {
        secretKey = await age.generateX25519Identity();
    } else if (type === AGE_KEY_TYPES.HYBRID) {
        secretKey = await age.generateHybridIdentity();
    } else {
        throw new Error(
            `不支持的 age key 类型: ${type}. 支持: ${Object.values(
                AGE_KEY_TYPES,
            ).join(', ')}`,
        );
    }

    const publicKey = await derivePublicKey(secretKey);
    return {
        type,
        [AGE_SECRET_KEY]: secretKey,
        [AGE_PUBLIC_KEY]: publicKey,
    };
}

async function derivePublicKey(identity) {
    assertAgeRuntimeAvailable();

    const key = await validateIdentity(identity);
    const recipient = await age.identityToRecipient(key);
    return validateRecipient(recipient);
}

async function encryptArmor(plaintext, recipient) {
    assertAgeRuntimeAvailable();

    const key = validateRecipient(recipient);
    const encrypter = new age.Encrypter();
    encrypter.addRecipient(key);
    const ciphertext = await encrypter.encrypt(plaintext ?? '');

    return age.armor.encode(ciphertext);
}

function isAgeArmor(value) {
    return normalizeKey(value).startsWith(AGE_ARMOR_HEADER);
}

async function decryptArmorIfPresent(input, identity) {
    const body = input ?? '';
    const text = typeof body === 'string' ? body : new TextDecoder().decode(body);

    if (!isAgeArmor(text)) {
        return body;
    }

    assertAgeRuntimeAvailable();

    const key = await validateIdentity(identity);
    const decrypter = new age.Decrypter();
    decrypter.addIdentity(key);

    try {
        const decoded = age.armor.decode(text);
        return await decrypter.decrypt(decoded, 'text');
    } catch (e) {
        throw new Error(`age 解密失败: ${e?.message ?? e}`);
    }
}

function maskAgeSecret(value) {
    return String(value ?? '').replace(SECRET_KEY_PATTERN, (secret) => {
        const prefix = secret.startsWith('AGE-SECRET-KEY-PQ-1')
            ? 'AGE-SECRET-KEY-PQ-1'
            : 'AGE-SECRET-KEY-1';
        return `${prefix}...${secret.slice(-6)}`;
    });
}

function maskAgeSecretInUrl(value) {
    return maskAgeSecret(
        String(value ?? '').replace(
            /([?#&]age-secret-key=)[^&#\s]+/gi,
            '$1***',
        ),
    );
}

export {
    AGE_ARMOR_HEADER,
    AGE_KEY_TYPES,
    AGE_PUBLIC_KEY,
    AGE_SECRET_KEY,
    assertAgeRuntimeAvailable,
    decryptArmorIfPresent,
    derivePublicKey,
    encryptArmor,
    generateKeyPair,
    isAgeArmor,
    maskAgeSecret,
    maskAgeSecretInUrl,
    normalizeAgePublicKeyConfig,
    validateIdentity,
    validateRecipient,
};
