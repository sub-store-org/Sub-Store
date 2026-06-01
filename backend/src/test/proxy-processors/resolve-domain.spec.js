import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';

import $ from '@/core/app';
import PROCESSORS, { ApplyProcessor } from '@/core/proxy-utils/processors';
import { SETTINGS_KEY } from '@/constants';
import resourceCache from '@/utils/resource-cache';
import { hex_md5 } from '@/vendor/md5';

const ResolveDomainOperator = PROCESSORS['Resolve Domain Operator'];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Resolve Domain Operator', function () {
    let originalGoogleResolver;
    let originalRead;
    let cacheKeys;

    beforeEach(function () {
        originalGoogleResolver = ResolveDomainOperator.resolver.Google;
        originalRead = $.read.bind($);
        cacheKeys = [];
    });

    afterEach(function () {
        ResolveDomainOperator.resolver.Google = originalGoogleResolver;
        $.read = originalRead;
        cacheKeys.forEach((key) => {
            delete resourceCache.resourceCache[key];
        });
        resourceCache._persist();
    });

    it('limits resolver requests to the configured unresolved unique domains', async function () {
        const calls = [];
        const resolvedIps = {
            'a.example.com': '192.0.2.10',
            'b.example.com': '192.0.2.11',
            'c.example.com': '192.0.2.12',
        };
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            calls.push(domain);
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return resolvedIps[domain];
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
            concurrency: 2,
        });
        const output = await ApplyProcessor(processor, [
            { name: 'A', server: 'a.example.com', port: 443 },
            { name: 'A Duplicate', server: 'a.example.com', port: 443 },
            { name: 'Existing IP', server: '192.0.2.1', port: 443 },
            {
                name: 'No Resolve',
                server: 'skip.example.com',
                port: 443,
                '_no-resolve': true,
            },
            { name: 'B', server: 'b.example.com', port: 443 },
            { name: 'C', server: 'c.example.com', port: 443 },
        ]);

        expect(maxActiveRequests).to.equal(2);
        expect(calls).to.have.members([
            'a.example.com',
            'b.example.com',
            'c.example.com',
        ]);
        expect(calls).to.have.length(3);
        expect(output.find((proxy) => proxy.name === 'A').server).to.equal(
            '192.0.2.10',
        );
        expect(
            output.find((proxy) => proxy.name === 'A Duplicate').server,
        ).to.equal('192.0.2.10');
        expect(
            output.find((proxy) => proxy.name === 'Existing IP').server,
        ).to.equal('192.0.2.1');
        expect(
            output.find((proxy) => proxy.name === 'No Resolve').server,
        ).to.equal('skip.example.com');
    });

    it('excludes cache hits from the concurrency pool', async function () {
        const cachedDomain = 'cached-resolve-domain.example.com';
        const uncachedDomain = 'uncached-resolve-domain.example.com';
        const cacheKey = hex_md5(`GOOGLE:${cachedDomain}:IPv4`);
        cacheKeys.push(cacheKey);
        resourceCache.set(cacheKey, ['192.0.2.30']);
        const calls = [];

        ResolveDomainOperator.resolver.Google = async (domain) => {
            calls.push(domain);
            return ['192.0.2.31'];
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
            concurrency: 1,
        });
        const output = await ApplyProcessor(processor, [
            { name: 'Cached', server: cachedDomain, port: 443 },
            { name: 'Uncached', server: uncachedDomain, port: 443 },
        ]);

        expect(calls).to.deep.equal([uncachedDomain]);
        expect(output.find((proxy) => proxy.name === 'Cached').server).to.equal(
            '192.0.2.30',
        );
        expect(
            output.find((proxy) => proxy.name === 'Uncached').server,
        ).to.equal('192.0.2.31');
    });

    it('keeps the existing default concurrency at 15', async function () {
        const domains = Array.from({ length: 20 }, (_, index) => ({
            name: `Node ${index}`,
            server: `node-${index}.example.com`,
            port: 443,
        }));
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return `192.0.2.${Number(domain.match(/\d+/)[0]) + 1}`;
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
        });
        await ApplyProcessor(processor, domains);

        expect(maxActiveRequests).to.equal(15);
    });

    it('does not use backend request concurrency as the default', async function () {
        $.read = (key) => {
            if (key === SETTINGS_KEY) return { backendRequestConcurrency: 1 };
            return originalRead(key);
        };
        const domains = Array.from({ length: 20 }, (_, index) => ({
            name: `Node ${index}`,
            server: `backend-setting-${index}.example.com`,
            port: 443,
        }));
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return `192.0.2.${Number(domain.match(/\d+/)[0]) + 1}`;
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
        });
        await ApplyProcessor(processor, domains);

        expect(maxActiveRequests).to.equal(15);
    });

    it('prefers explicit domain resolver concurrency over backend request concurrency', async function () {
        $.read = (key) => {
            if (key === SETTINGS_KEY) return { backendRequestConcurrency: 1 };
            return originalRead(key);
        };
        const domains = Array.from({ length: 5 }, (_, index) => ({
            name: `Node ${index}`,
            server: `explicit-domain-${index}.example.com`,
            port: 443,
        }));
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return `192.0.2.${Number(domain.match(/\d+/)[0]) + 1}`;
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
            concurrency: 2,
        });
        await ApplyProcessor(processor, domains);

        expect(maxActiveRequests).to.equal(2);
    });

    it('rejects invalid concurrency values', function () {
        expect(() =>
            ResolveDomainOperator({
                provider: 'Google',
                type: 'IPv4',
                concurrency: 0,
            }),
        ).to.throw('域名解析并发数应为大于 0 的整数');
    });

    it('warns but allows high concurrency values', async function () {
        const originalWarn = $.warn;
        const warnings = [];
        $.warn = (message) => warnings.push(message);
        ResolveDomainOperator.resolver.Google = async () => '192.0.2.40';

        try {
            const processor = ResolveDomainOperator({
                provider: 'Google',
                type: 'IPv4',
                concurrency: 21,
            });
            const output = await ApplyProcessor(processor, [
                { name: 'High Concurrency', server: 'high.example.com', port: 443 },
            ]);

            expect(output[0].server).to.equal('192.0.2.40');
            expect(
                warnings.some(
                    (message) =>
                        message.includes('21') && message.includes('20'),
                ),
            ).to.equal(true);
        } finally {
            $.warn = originalWarn;
        }
    });
});
