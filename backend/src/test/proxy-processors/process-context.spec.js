import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import { generateKeyPair } from '@/utils/age';

const PATH_ENV_KEY = 'SUB_STORE_FRONTEND_BACKEND_PATH';
const CUSTOM_NAME_ENV_KEY = 'SUB_STORE_BACKEND_CUSTOM_NAME';
const MISSING_PATH_ERROR =
    'Node.js 环境下，脚本操作、脚本过滤和修改响应必须设置 SUB_STORE_FRONTEND_BACKEND_PATH 才能生效；若不想改变当前 path，可设置 SUB_STORE_FRONTEND_BACKEND_PATH=/';

describe('Process context control', function () {
    it('requires a backend path for Node.js script actions unless the backend is custom', async function () {
        const originalPath = process.env[PATH_ENV_KEY];
        const originalCustomName = process.env[CUSTOM_NAME_ENV_KEY];
        const actions = [
            () =>
                ProxyUtils.process([], [
                    {
                        type: 'Script Operator',
                        args: {
                            mode: 'script',
                            content: 'function operator() {}',
                        },
                    },
                ]),
            () =>
                ProxyUtils.process([], [
                    {
                        type: 'Script Filter',
                        args: {
                            mode: 'script',
                            content: 'function filter() { return []; }',
                        },
                    },
                ]),
            () =>
                ProxyUtils.processResponse({}, [
                    {
                        type: 'Response Transformer',
                        args: {
                            mode: 'script',
                            content:
                                'function transformFunction(res) { return res; }',
                        },
                    },
                ]),
        ];

        try {
            delete process.env[PATH_ENV_KEY];
            delete process.env[CUSTOM_NAME_ENV_KEY];
            const rejected = await Promise.allSettled(
                actions.map((run) => run()),
            );
            expect(rejected.map(({ reason }) => reason?.message)).to.deep.equal(
                actions.map(() => MISSING_PATH_ERROR),
            );

            process.env[CUSTOM_NAME_ENV_KEY] = 'custom';
            await Promise.all(actions.map((run) => run()));
        } finally {
            if (originalPath == null) delete process.env[PATH_ENV_KEY];
            else process.env[PATH_ENV_KEY] = originalPath;
            if (originalCustomName == null)
                delete process.env[CUSTOM_NAME_ENV_KEY];
            else process.env[CUSTOM_NAME_ENV_KEY] = originalCustomName;
        }
    });

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

    it('exposes raw source as an array on context in Script Operator', async function () {
        const raw = 'raw-source';
        const operators = [
            {
                type: 'Script Operator',
                args: {
                    mode: 'script',
                    content: `function operator(proxies, targetPlatform, context) {
                        return proxies.map((proxy) => ({
                            ...proxy,
                            name: proxy.name + '-' + (Array.isArray(context.raw) ? context.raw.join(',') : 'none'),
                        }));
                    }`,
                },
            },
        ];

        const output = await ProxyUtils.process(
            [{ name: 'A' }],
            operators,
            'JSON',
            undefined,
            undefined,
            raw,
        );

        expect(output.map((proxy) => proxy.name)).to.deep.equal([
            'A-raw-source',
        ]);
    });

    it('exposes raw source on context in Script Filter', async function () {
        const raw = ['only-source'];
        const operators = [
            {
                type: 'Script Filter',
                args: {
                    mode: 'script',
                    content: `function filter(proxies, targetPlatform, context) {
                        return proxies.map(() => Array.isArray(context.raw) && context.raw.length === 1);
                    }`,
                },
            },
        ];

        const output = await ProxyUtils.process(
            [{ name: 'A' }, { name: 'B' }],
            operators,
            'JSON',
            undefined,
            undefined,
            raw,
        );

        expect(output.map((proxy) => proxy.name)).to.deep.equal(['A', 'B']);
    });
});
