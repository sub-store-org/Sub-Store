import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';

describe('Regex Sort Operator', function () {
    it('preserves regex priority and fallback ordering with duplicate names', async function () {
        const zuluNodes = [
            { name: 'zulu', server: 'b.example' },
            { name: 'zulu', server: 'a.example' },
        ];
        const proxies = [
            zuluNodes[0],
            { name: 'JP' },
            { name: 'hk' },
            { name: 'alpha' },
            { name: 'HK' },
            { name: 'JP' },
            zuluNodes[1],
        ];
        const expressions = ['(?i)^hk', '^(JP|HK)'];
        for (const [order, unmatched] of [
            ['asc', ['alpha', 'zulu', 'zulu']],
            ['desc', ['zulu', 'zulu', 'alpha']],
            ['original', ['zulu', 'alpha', 'zulu']],
        ]) {
            const output = await ProxyUtils.process(proxies, [
                { type: 'Regex Sort Operator', args: { order, expressions } },
            ]);
            expect(output.map(({ name }) => name)).to.deep.equal([
                'hk',
                'HK',
                'JP',
                'JP',
                ...unmatched,
            ]);
            if (order === 'original') {
                expect(
                    output.filter(({ name }) => name === 'zulu'),
                ).to.deep.equal(zuluNodes);
            }
        }
    });
});
