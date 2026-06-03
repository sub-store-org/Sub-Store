import { AGE_PUBLIC_KEY, encryptArmor } from '@/utils/age';

const SHARE_AGE_PUBLIC_KEY_HEADER = 'x-sub-store-share-age-public-key';

function normalizeAgePublicKey(value) {
    return String(value ?? '').trim();
}

function createAgePublicKeyConfig(publicKey) {
    const key = normalizeAgePublicKey(publicKey);
    return key ? { [AGE_PUBLIC_KEY]: key } : undefined;
}

function resolveAgePublicKey(...configs) {
    for (const config of configs) {
        const key = normalizeAgePublicKey(config?.[AGE_PUBLIC_KEY]);
        if (key) return key;
    }

    return '';
}

function resolveShareAgeConfig({ req, type, name, findShareToken }) {
    if (!req?.path?.startsWith('/share/')) {
        return undefined;
    }

    const consumedToken = req.subStoreShareToken;
    const token =
        consumedToken ||
        (req.query?.token && typeof findShareToken === 'function'
            ? findShareToken({
                  token: req.query.token,
                  type,
                  name,
                  pathname: req.path,
              })
            : null);
    const headerKey = req.headers?.[SHARE_AGE_PUBLIC_KEY_HEADER];

    return createAgePublicKeyConfig(token?.[AGE_PUBLIC_KEY] || headerKey);
}

async function applyAgeOutputEncryption({ body, res, configs = [] }) {
    const publicKey = resolveAgePublicKey(...configs);

    if (!publicKey) {
        return body;
    }

    const armored = await encryptArmor(body ?? '', publicKey);
    if (res?.set) {
        res.set('Content-Type', 'text/plain; charset=utf-8');
    }

    return armored;
}

export {
    SHARE_AGE_PUBLIC_KEY_HEADER,
    applyAgeOutputEncryption,
    createAgePublicKeyConfig,
    resolveAgePublicKey,
    resolveShareAgeConfig,
};
