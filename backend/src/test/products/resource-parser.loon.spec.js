import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';

describe('Loon resource parser', function () {
    const modulePath = require.resolve('../../products/resource-parser.loon.js');

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
});
