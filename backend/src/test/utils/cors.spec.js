import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
    getCorsHeaders,
    isOriginAllowed,
    NON_NODE_CORS_DEFAULT,
    NODE_CORS_ALLOWED_ORIGINS_ENV,
    resolveCorsPolicy,
} from '@/utils/cors';

describe('CORS allowlist policy', function () {
    it('defaults Node environments to wildcard origins', function () {
        const policy = resolveCorsPolicy({ isNode: true });

        expect(policy).to.deep.include({
            wildcard: true,
            value: '*',
            source: 'default:node',
        });
        expect(isOriginAllowed(policy, 'https://evil.example')).to.equal(true);
        expect(getCorsHeaders(policy, 'https://evil.example')).to.deep.equal({
            'Access-Control-Allow-Origin': '*',
        });
    });

    it('reads Node allowlist values from the environment setting', function () {
        const policy = resolveCorsPolicy({
            isNode: true,
            envValue:
                'https://sub-store.vercel.app, http://127.0.0.1:8888',
        });

        expect(policy).to.deep.include({
            wildcard: false,
            source: `env:${NODE_CORS_ALLOWED_ORIGINS_ENV}`,
            value: 'https://sub-store.vercel.app,http://127.0.0.1:8888',
        });
        expect(
            isOriginAllowed(policy, 'https://sub-store.vercel.app'),
        ).to.equal(true);
        expect(isOriginAllowed(policy, 'http://127.0.0.1:8888')).to.equal(
            true,
        );
        expect(isOriginAllowed(policy, 'https://evil.example')).to.equal(
            false,
        );
    });

    it('defaults non-Node environments to the official frontend origin', function () {
        const policy = resolveCorsPolicy({ isNode: false });

        expect(policy).to.deep.include({
            wildcard: false,
            source: 'default:non-node',
            value: NON_NODE_CORS_DEFAULT,
        });
        expect(isOriginAllowed(policy, NON_NODE_CORS_DEFAULT)).to.equal(true);
        expect(isOriginAllowed(policy, 'https://evil.example')).to.equal(
            false,
        );
    });

    it('reads non-Node allowlist values from script arguments', function () {
        const policy = resolveCorsPolicy({
            isNode: false,
            argument:
                'sync_success_notify=true&cors=https%3A%2F%2Fsub-store.vercel.app%2Chttp%3A%2F%2F127.0.0.1%3A8888',
        });

        expect(policy).to.deep.include({
            wildcard: false,
            source: 'argument:cors',
            value: 'https://sub-store.vercel.app,http://127.0.0.1:8888',
        });
    });

    it('tolerates quoted script argument strings', function () {
        const policy = resolveCorsPolicy({
            isNode: false,
            argument:
                '"cors=https://sub-store.vercel.app,http://127.0.0.1:8888"',
        });

        expect(policy).to.deep.include({
            wildcard: false,
            source: 'argument:cors',
            value: 'https://sub-store.vercel.app,http://127.0.0.1:8888',
        });
    });

    it('supports explicit wildcard from non-Node arguments', function () {
        const policy = resolveCorsPolicy({
            isNode: false,
            argument: 'cors=*',
        });

        expect(policy).to.deep.include({
            wildcard: true,
            source: 'argument:cors',
            value: '*',
        });
        expect(isOriginAllowed(policy, 'https://evil.example')).to.equal(true);
    });

    it('requires exact browser origins', function () {
        const policy = resolveCorsPolicy({
            isNode: false,
            argument: {
                cors: 'https://sub-store.vercel.app,http://127.0.0.1:8888',
            },
        });

        expect(isOriginAllowed(policy, 'https://sub-store.vercel.app')).to.equal(
            true,
        );
        expect(
            isOriginAllowed(policy, 'https://evil.example.sub-store.vercel.app'),
        ).to.equal(false);
        expect(isOriginAllowed(policy, 'http://sub-store.vercel.app')).to.equal(
            false,
        );
        expect(isOriginAllowed(policy, 'http://127.0.0.1')).to.equal(false);
    });

    it('does not treat empty configured values as wildcard', function () {
        const nodePolicy = resolveCorsPolicy({
            isNode: true,
            envValue: '   ',
        });
        const nonNodePolicy = resolveCorsPolicy({
            isNode: false,
            argument: 'cors=,,,',
        });

        expect(nodePolicy).to.deep.include({
            wildcard: true,
            source: 'default:node',
            value: '*',
        });
        expect(nonNodePolicy).to.deep.include({
            wildcard: false,
            source: 'default:non-node',
            value: NON_NODE_CORS_DEFAULT,
        });
        expect(isOriginAllowed(nonNodePolicy, NON_NODE_CORS_DEFAULT)).to.equal(
            true,
        );
    });

    it('returns concrete CORS headers for allowed non-wildcard origins', function () {
        const policy = resolveCorsPolicy({
            isNode: false,
            argument: {
                cors: 'https://sub-store.vercel.app',
            },
        });

        expect(
            getCorsHeaders(policy, 'https://sub-store.vercel.app'),
        ).to.deep.equal({
            'Access-Control-Allow-Origin': 'https://sub-store.vercel.app',
            Vary: 'Origin',
        });
        expect(getCorsHeaders(policy, 'https://evil.example')).to.deep.equal(
            {},
        );
    });
});
