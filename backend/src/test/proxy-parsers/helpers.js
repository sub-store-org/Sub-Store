import { expect } from 'chai';

import { ProxyUtils } from '@/core/proxy-utils';

export const UUID = '11111111-1111-4111-8111-111111111111';

export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function parseAll(raw) {
    return ProxyUtils.parse(raw);
}

export function parseOne(raw) {
    const proxies = parseAll(raw);
    expect(proxies, raw).to.have.length(1);
    return proxies[0];
}

export function expectSubset(actual, expected, path = 'proxy') {
    if (Array.isArray(expected)) {
        expect(actual, path).to.deep.equal(expected);
        return;
    }

    if (expected && typeof expected === 'object') {
        expect(actual, path).to.be.an('object');
        for (const [key, value] of Object.entries(expected)) {
            expectSubset(actual[key], value, `${path}.${key}`);
        }
        return;
    }

    expect(actual, path).to.deep.equal(expected);
}
