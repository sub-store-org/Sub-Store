import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';
import * as ageUtils from '@/utils/age';

describe('Loon resource parser', function () {
    this.timeout(10000);

    const modulePath = require.resolve(
        '../../products/resource-parser.loon.js',
    );
    const downloadModule = require('@/utils/download');

    function cleanupGlobals() {
        delete global.$argument;
        delete global.$done;
        delete global.$loon;
        delete global.$resource;
        delete global.$resourceType;
        delete global.$resourceUrl;
    }

    function resetModule() {
        delete require.cache[modulePath];
    }

    async function runParser({
        argument = '',
        resource = '',
        resourceType = 1,
        resourceUrl = '',
    } = {}) {
        global.$loon = 'Loon(842)';
        global.$argument = argument;
        global.$resource = resource;
        global.$resourceType = resourceType;
        global.$resourceUrl = resourceUrl;

        return await new Promise((resolve, reject) => {
            global.$done = resolve;

            try {
                resetModule();
                require(modulePath);
            } catch (error) {
                reject(error);
            }
        });
    }

    it('does not auto-enable includeUnsupportedProxy from build number', async function () {
        const originalParse = ProxyUtils.parse;
        const originalProduce = ProxyUtils.produce;
        let capturedOpts;

        try {
            ProxyUtils.parse = () => [{ type: 'ss' }];
            ProxyUtils.produce = (proxies, platform, type, opts = {}) => {
                capturedOpts = opts;
                return 'stub-output';
            };

            global.$loon = 'Loon(842)';
            global.$resource = 'stub-resource';
            global.$resourceType = 1;
            global.$resourceUrl = '';

            const result = await new Promise((resolve, reject) => {
                global.$done = resolve;

                try {
                    resetModule();
                    require(modulePath);
                } catch (error) {
                    reject(error);
                }
            });

            expect(result).to.equal('stub-output');
            expect(capturedOpts).to.be.an('object');
            expect(capturedOpts['include-unsupported-proxy']).to.equal(
                undefined,
            );
        } finally {
            ProxyUtils.parse = originalParse;
            ProxyUtils.produce = originalProduce;
            resetModule();
            cleanupGlobals();
        }
    });

    it('decrypts inline age-armored proxy resources from parser arguments', async function () {
        const originalParse = ProxyUtils.parse;
        const originalProduce = ProxyUtils.produce;
        let capturedInput;

        try {
            const pair = await ageUtils.generateKeyPair();
            const armored = await ageUtils.encryptArmor(
                'decrypted-proxy-resource',
                pair['age-public-key'],
            );

            ProxyUtils.parse = (input) => {
                capturedInput = input;
                return [{ type: 'ss' }];
            };
            ProxyUtils.produce = () => 'proxy-output';

            const result = await runParser({
                argument: `age-secret-key=${encodeURIComponent(
                    pair['age-secret-key'],
                )}`,
                resource: armored,
                resourceType: 1,
            });

            expect(result).to.equal('proxy-output');
            expect(capturedInput).to.equal('decrypted-proxy-resource');
        } finally {
            ProxyUtils.parse = originalParse;
            ProxyUtils.produce = originalProduce;
            resetModule();
            cleanupGlobals();
        }
    });

    it('decrypts inline age-armored rule resources from parser arguments', async function () {
        const originalParse = RuleUtils.parse;
        const originalProduce = RuleUtils.produce;
        let capturedInput;

        try {
            const pair = await ageUtils.generateKeyPair();
            const armored = await ageUtils.encryptArmor(
                'DOMAIN,example.com,Proxy',
                pair['age-public-key'],
            );

            RuleUtils.parse = (input) => {
                capturedInput = input;
                return [{ type: 'DOMAIN', payload: 'example.com' }];
            };
            RuleUtils.produce = () => 'rule-output';

            const result = await runParser({
                argument: `age-secret-key=${encodeURIComponent(
                    pair['age-secret-key'],
                )}`,
                resource: armored,
                resourceType: 2,
            });

            expect(result).to.equal('rule-output');
            expect(capturedInput).to.equal('DOMAIN,example.com,Proxy');
        } finally {
            RuleUtils.parse = originalParse;
            RuleUtils.produce = originalProduce;
            resetModule();
            cleanupGlobals();
        }
    });

    it('keeps plain inline resources unchanged when age-secret-key is present', async function () {
        const originalParse = ProxyUtils.parse;
        const originalProduce = ProxyUtils.produce;
        let capturedInput;

        try {
            const pair = await ageUtils.generateKeyPair();

            ProxyUtils.parse = (input) => {
                capturedInput = input;
                return [{ type: 'ss' }];
            };
            ProxyUtils.produce = () => 'proxy-output';

            const result = await runParser({
                argument: `age-secret-key=${encodeURIComponent(
                    pair['age-secret-key'],
                )}`,
                resource: 'plain-proxy-resource',
                resourceType: 1,
            });

            expect(result).to.equal('proxy-output');
            expect(capturedInput).to.equal('plain-proxy-resource');
        } finally {
            ProxyUtils.parse = originalParse;
            ProxyUtils.produce = originalProduce;
            resetModule();
            cleanupGlobals();
        }
    });

    it('passes parser age-secret-key to remote proxy downloads', async function () {
        const originalDownload = downloadModule.default;
        const originalParse = ProxyUtils.parse;
        const originalProduce = ProxyUtils.produce;
        let capturedInput;
        let capturedOptions;

        try {
            const pair = await ageUtils.generateKeyPair();
            const armored = await ageUtils.encryptArmor(
                'remote-proxy-resource',
                pair['age-public-key'],
            );

            downloadModule.default = async (...args) => {
                capturedOptions = args[8];
                return capturedOptions?.['age-secret-key'] ===
                    pair['age-secret-key']
                    ? 'remote-proxy-resource'
                    : armored;
            };
            ProxyUtils.parse = (input) => {
                capturedInput = input;
                return [{ type: 'ss' }];
            };
            ProxyUtils.produce = () => 'proxy-output';

            const result = await runParser({
                argument: `resourceUrlOnly=true&age-secret-key=${encodeURIComponent(
                    pair['age-secret-key'],
                )}`,
                resource: '',
                resourceType: 1,
                resourceUrl: 'https://example.com/proxy.txt',
            });

            expect(result).to.equal('proxy-output');
            expect(capturedInput).to.equal('remote-proxy-resource');
            expect(capturedOptions).to.deep.include({
                'age-secret-key': pair['age-secret-key'],
            });
        } finally {
            downloadModule.default = originalDownload;
            ProxyUtils.parse = originalParse;
            ProxyUtils.produce = originalProduce;
            resetModule();
            cleanupGlobals();
        }
    });

    it('passes parser age-secret-key to remote rule downloads', async function () {
        const originalDownload = downloadModule.default;
        const originalParse = RuleUtils.parse;
        const originalProduce = RuleUtils.produce;
        let capturedInput;
        let capturedOptions;

        try {
            const pair = await ageUtils.generateKeyPair();
            const armored = await ageUtils.encryptArmor(
                'DOMAIN,remote.example,Proxy',
                pair['age-public-key'],
            );

            downloadModule.default = async (...args) => {
                capturedOptions = args[8];
                return capturedOptions?.['age-secret-key'] ===
                    pair['age-secret-key']
                    ? 'DOMAIN,remote.example,Proxy'
                    : armored;
            };
            RuleUtils.parse = (input) => {
                capturedInput = input;
                return [{ type: 'DOMAIN', payload: 'remote.example' }];
            };
            RuleUtils.produce = () => 'rule-output';

            const result = await runParser({
                argument: `resourceUrlOnly=true&age-secret-key=${encodeURIComponent(
                    pair['age-secret-key'],
                )}`,
                resource: 'ignored-rule-resource',
                resourceType: 2,
                resourceUrl: 'https://example.com/rule.txt',
            });

            expect(result).to.equal('rule-output');
            expect(capturedInput).to.equal('DOMAIN,remote.example,Proxy');
            expect(capturedOptions).to.deep.include({
                'age-secret-key': pair['age-secret-key'],
            });
        } finally {
            downloadModule.default = originalDownload;
            RuleUtils.parse = originalParse;
            RuleUtils.produce = originalProduce;
            resetModule();
            cleanupGlobals();
        }
    });

    it('does not expose age-secret-key or return armor on decrypt failure', async function () {
        const originalParse = ProxyUtils.parse;
        const originalProduce = ProxyUtils.produce;
        const originalConsoleLog = console.log;
        let logs = [];

        try {
            const encryptPair = await ageUtils.generateKeyPair();
            const wrongPair = await ageUtils.generateKeyPair();
            const armored = await ageUtils.encryptArmor(
                'decrypted-proxy-resource',
                encryptPair['age-public-key'],
            );

            ProxyUtils.parse = () => {
                throw new Error('parse should not succeed');
            };
            ProxyUtils.produce = () => 'proxy-output';
            console.log = (message) => {
                logs.push(String(message));
            };

            const result = await runParser({
                argument: `age-secret-key=${encodeURIComponent(
                    wrongPair['age-secret-key'],
                )}`,
                resource: armored,
                resourceType: 1,
            });

            expect(result).to.not.contain(ageUtils.AGE_ARMOR_HEADER);
            expect(logs.join('\n')).to.not.contain(wrongPair['age-secret-key']);
            expect(logs.join('\n')).to.contain('age-secret-key');
        } finally {
            ProxyUtils.parse = originalParse;
            ProxyUtils.produce = originalProduce;
            console.log = originalConsoleLog;
            resetModule();
            cleanupGlobals();
        }
    });
});
