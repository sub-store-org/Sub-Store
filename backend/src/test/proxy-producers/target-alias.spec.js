import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import { produceExternal } from './helpers';

const PROXY = {
    type: 'ss',
    name: 'SS Node',
    server: '1.2.3.4',
    port: 443,
    cipher: 'aes-128-gcm',
    password: 'secret',
};

describe('Proxy target aliases', function () {
    it('produces the same output for lowercase and capitalized target names', function () {
        const cases = [
            ['clash', 'Clash'],
            ['meta', 'ClashMeta'],
            ['mihomo', 'ClashMeta'],
            ['uri', 'URI'],
            ['v2ray', 'V2Ray'],
            ['json', 'JSON'],
            ['stash', 'Stash'],
            ['egern', 'Egern'],
            ['sing-box', 'sing-box'],
        ];
        for (const [lower, canonical] of cases) {
            expect(produceExternal(lower, [PROXY]), lower).to.equal(
                produceExternal(canonical, [PROXY]),
            );
        }
    });
});
