import { failed, success } from '@/restful/response';
import {
    AGE_KEY_TYPES,
    AGE_PUBLIC_KEY,
    AGE_SECRET_KEY,
    derivePublicKey,
    generateKeyPair,
} from '@/utils/age';

export default function register($app) {
    $app.post('/api/utils/age/key-pair', createAgeKeyPair);
    $app.post('/api/utils/age/public-key', createAgePublicKey);
}

async function createAgeKeyPair(req, res) {
    try {
        const pair = await generateKeyPair(req.body?.type || AGE_KEY_TYPES.X25519);
        success(res, {
            type: pair.type,
            [AGE_SECRET_KEY]: pair[AGE_SECRET_KEY],
            [AGE_PUBLIC_KEY]: pair[AGE_PUBLIC_KEY],
        });
    } catch (error) {
        failed(res, error);
    }
}

async function createAgePublicKey(req, res) {
    try {
        const publicKey = await derivePublicKey(req.body?.[AGE_SECRET_KEY]);
        success(res, {
            [AGE_PUBLIC_KEY]: publicKey,
        });
    } catch (error) {
        failed(res, error);
    }
}
