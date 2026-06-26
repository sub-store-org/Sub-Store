import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import { generateKeyPair } from '@/utils/age';

describe('Process context control', function () {
    it('disables later actions by customName from shared context', async function () {
        const operators = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        context.process = {
                            type: 'disable',
                            customNames: ['branch-b'],
                        };
                        return proxies;
                    }`,
                },
            },
            {
                type: 'Script Operator',
                customName: 'branch-b',
                args: {
                    mode: 'script',
                    content: `function operator(proxies) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: 'B-' + proxy.name,
                        }));
                    }`,
                },
            },
            {
                type: 'Script Operator',
                customName: 'branch-c',
                args: {
                    mode: 'script',
                    content: `function operator(proxies) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: proxy.name + '-C',
                        }));
                    }`,
                },
            },
        ];

        const output = await ProxyUtils.process([{ name: 'A' }], operators);

        expect(output.map((proxy) => proxy.name)).to.deep.equal(['A-C']);
    });

    it('enables only listed later actions by customName from shared context', async function () {
        const operators = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        context.process = {
                            type: 'enable',
                            customNames: ['branch-c'],
                        };
                        return proxies;
                    }`,
                },
            },
            {
                type: 'Script Operator',
                customName: 'branch-b',
                args: {
                    mode: 'script',
                    content: `function operator(proxies) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: 'B-' + proxy.name,
                        }));
                    }`,
                },
            },
            {
                type: 'Script Operator',
                customName: 'branch-c',
                args: {
                    mode: 'script',
                    content: `function operator(proxies) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: proxy.name + '-C',
                        }));
                    }`,
                },
            },
        ];

        const output = await ProxyUtils.process([{ name: 'A' }], operators);

        expect(output.map((proxy) => proxy.name)).to.deep.equal(['A-C']);
    });

    it('disables later response transformers by customName from shared context', async function () {
        const operators = [
            {
                type: 'Response Transformer',
                args: {
                    mode: 'script',
                    content: `function transformFunction(res, context) {
                        context.process = {
                            type: 'disable',
                            customNames: ['branch-b'],
                        };
                        res.body += 'A';
                        return res;
                    }`,
                },
            },
            {
                type: 'Response Transformer',
                customName: 'branch-b',
                args: {
                    mode: 'script',
                    content: `function transformFunction(res) {
                        res.body += 'B';
                        return res;
                    }`,
                },
            },
            {
                type: 'Response Transformer',
                customName: 'branch-c',
                args: {
                    mode: 'script',
                    content: `function transformFunction(res) {
                        res.body += 'C';
                        return res;
                    }`,
                },
            },
        ];

        const output = await ProxyUtils.processResponse({ body: '' }, operators);

        expect(output.body).to.equal('AC');
    });

    it('enables only listed later response transformers by customName from shared context', async function () {
        const operators = [
            {
                type: 'Response Transformer',
                args: {
                    mode: 'script',
                    content: `function transformFunction(res, context) {
                        context.process = {
                            type: 'enable',
                            customNames: ['branch-c'],
                        };
                        res.body += 'A';
                        return res;
                    }`,
                },
            },
            {
                type: 'Response Transformer',
                customName: 'branch-b',
                args: {
                    mode: 'script',
                    content: `function transformFunction(res) {
                        res.body += 'B';
                        return res;
                    }`,
                },
            },
            {
                type: 'Response Transformer',
                customName: 'branch-c',
                args: {
                    mode: 'script',
                    content: `function transformFunction(res) {
                        res.body += 'C';
                        return res;
                    }`,
                },
            },
        ];

        const output = await ProxyUtils.processResponse({ body: '' }, operators);

        expect(output.body).to.equal('AC');
    });

    it('exposes age helpers in script operators', async function () {
        this.timeout(10000);

        const pair = await generateKeyPair();
        expect(Object.isFrozen(ProxyUtils.age)).to.equal(false);

        const operators = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    arguments: {
                        publicKey: pair['age-public-key'],
                        secretKey: pair['age-secret-key'],
                    },
                    content: `async function operator(proxies) {
                        const publicKey = await ProxyUtils.age.derivePublicKey(
                            $arguments.secretKey,
                        );
                        const isExpectedPublicKey =
                            publicKey === $arguments.publicKey;
                        const encrypted = await ProxyUtils.age.encrypt(
                            'hello age',
                            publicKey,
                        );
                        const decrypted = await ProxyUtils.age.decrypt(
                            encrypted,
                            $arguments.secretKey,
                        );
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: [proxy.name, decrypted, isExpectedPublicKey].join('-'),
                        }));
                    }`,
                },
            },
        ];

        const output = await ProxyUtils.process([{ name: 'A' }], operators);

        expect(output.map((proxy) => proxy.name)).to.deep.equal([
            'A-hello age-true',
        ]);
    });
});
