import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
    AGE_ARMOR_HEADER,
    AGE_KEY_TYPES,
    assertAgeRuntimeAvailable,
    decryptArmorIfPresent,
    derivePublicKey,
    encryptArmor,
    generateKeyPair,
    maskAgeSecret,
    maskAgeSecretInUrl,
    normalizeAgePublicKeyConfig,
    validateIdentity,
    validateRecipient,
} from '@/utils/age';

describe('age utility', function () {
    this.timeout(10000);

    async function expectRejected(promise, message) {
        try {
            await promise;
        } catch (e) {
            expect(e.message).to.contain(message);
            return;
        }

        throw new Error('Expected promise to reject');
    }

    async function assertRoundTrip(type) {
        const pair = await generateKeyPair(type);
        const secretKey = pair['age-secret-key'];
        const publicKey = pair['age-public-key'];

        expect(await derivePublicKey(secretKey)).to.equal(publicKey);

        const armored = await encryptArmor('hello age', publicKey);
        expect(armored).to.contain(AGE_ARMOR_HEADER);

        const decrypted = await decryptArmorIfPresent(armored, secretKey);
        expect(decrypted).to.equal('hello age');
    }

    it('generates X25519 keys and round-trips armored text', async function () {
        await assertRoundTrip(AGE_KEY_TYPES.X25519);
    });

    it('generates MLKEM768-X25519 hybrid keys and round-trips armored text', async function () {
        await assertRoundTrip(AGE_KEY_TYPES.HYBRID);
    });

    it('leaves non-armor text unchanged during decrypt', async function () {
        const pair = await generateKeyPair();

        expect(
            await decryptArmorIfPresent(
                'proxy: DIRECT',
                pair['age-secret-key'],
            ),
        ).to.equal('proxy: DIRECT');
    });

    it('rejects unsupported recipient formats', function () {
        expect(() => validateRecipient('ssh-ed25519 AAAA')).to.throw(
            'age-public-key 仅支持',
        );
        expect(() => validateRecipient('age1tag1bad')).to.throw(
            'age-public-key 仅支持',
        );
        expect(() => validateRecipient('age1bad')).to.throw(
            'age-public-key 仅支持',
        );
    });

    it('rejects unsupported identity formats', async function () {
        await expectRejected(
            validateIdentity('AGE-PLUGIN-FIDO2PRF-1ABCDEF'),
            'age-secret-key 仅支持',
        );
        await expectRejected(
            validateIdentity('not-a-secret'),
            'age-secret-key 仅支持',
        );
    });

    it('reports missing runtime APIs before age operations proceed', function () {
        expect(() => assertAgeRuntimeAvailable({})).to.throw(
            '当前运行环境缺少 age 加解密所需 Web API',
        );
    });

    it('masks full secret keys in strings', async function () {
        const pair = await generateKeyPair();
        const secretKey = pair['age-secret-key'];
        const masked = maskAgeSecret(`secret=${secretKey}`);

        expect(masked).to.not.contain(secretKey);
        expect(masked).to.contain('AGE-SECRET-KEY-1...');
    });

    it('masks age-secret-key URL parameters', async function () {
        const pair = await generateKeyPair();
        const secretKey = pair['age-secret-key'];
        const masked = maskAgeSecretInUrl(
            `https://example.com/sub#noCache&age-secret-key=${secretKey}`,
        );

        expect(masked).to.not.contain(secretKey);
        expect(masked).to.contain('age-secret-key=***');
    });

    it('normalizes optional age-public-key config fields', async function () {
        const pair = await generateKeyPair();
        const withKey = {
            'age-public-key': `  ${pair['age-public-key']}  `,
        };
        expect(normalizeAgePublicKeyConfig(withKey)).to.equal(withKey);
        expect(withKey['age-public-key']).to.equal(pair['age-public-key']);

        const withoutKey = {
            name: 'demo',
            'age-public-key': '',
        };
        expect(normalizeAgePublicKeyConfig(withoutKey)).to.equal(withoutKey);
        expect(withoutKey).to.not.have.property('age-public-key');

        expect(normalizeAgePublicKeyConfig(null)).to.equal(null);
    });
});
