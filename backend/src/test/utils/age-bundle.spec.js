import { expect } from 'chai';
import { describe, it } from 'mocha';
import { build } from 'esbuild';
import vm from 'vm';
import { webcrypto } from 'crypto';

describe('age bundle compatibility', function () {
    this.timeout(10000);

    async function loadAgeBundle(crypto) {
        const result = await build({
            entryPoints: ['src/utils/age.js'],
            bundle: true,
            write: false,
            platform: 'browser',
            format: 'iife',
            globalName: 'SubStoreAge',
        });
        const output = result.outputFiles[0].text;
        const sandbox = {
            console,
            crypto,
            DOMException,
            ReadableStream,
            Response,
            TextDecoder,
            TextEncoder,
            TransformStream,
            Uint8Array,
        };
        sandbox.globalThis = sandbox;
        vm.runInNewContext(output, sandbox);

        return sandbox.SubStoreAge;
    }

    it('bundles the age utility for browser IIFE artifacts without Node require calls', async function () {
        const result = await build({
            entryPoints: ['src/utils/age.js'],
            bundle: true,
            write: false,
            platform: 'browser',
            format: 'iife',
            globalName: 'SubStoreAge',
        });
        const output = result.outputFiles[0].text;

        expect(output).to.contain('SubStoreAge');
        expect(output).to.not.match(/\brequire\s*\(/);
    });

    it('uses the pure JS X25519 fallback when WebCrypto subtle is unavailable', async function () {
        const age = await loadAgeBundle({
            getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
        });

        const pair = await age.generateKeyPair('x25519');
        expect(pair['age-secret-key']).to.match(/^AGE-SECRET-KEY-1/);
        expect(pair['age-public-key']).to.match(/^age1/);

        const encrypted = await age.encryptArmor(
            'hello surge',
            pair['age-public-key'],
        );
        const decrypted = await age.decryptArmorIfPresent(
            encrypted,
            pair['age-secret-key'],
        );
        expect(decrypted).to.equal('hello surge');
    });

    it('uses the pure JS X25519 fallback when WebCrypto X25519 throws TypeError', async function () {
        const age = await loadAgeBundle({
            getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
            subtle: {
                importKey: async () => {
                    throw new TypeError('Algorithm not supported');
                },
                deriveBits: async () => {
                    throw new TypeError('Algorithm not supported');
                },
            },
        });

        const pair = await age.generateKeyPair('x25519');
        expect(pair['age-secret-key']).to.match(/^AGE-SECRET-KEY-1/);
        expect(pair['age-public-key']).to.match(/^age1/);
    });

    it('uses the pure JS X25519 fallback when WebCrypto X25519 throws unsupported Error', async function () {
        const age = await loadAgeBundle({
            getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
            subtle: {
                importKey: async () => {
                    throw new Error('Algorithm not supported');
                },
                deriveBits: async () => {
                    throw new Error('Algorithm not supported');
                },
            },
        });

        const pair = await age.generateKeyPair('x25519');
        expect(pair['age-secret-key']).to.match(/^AGE-SECRET-KEY-1/);
        expect(pair['age-public-key']).to.match(/^age1/);
    });
});
