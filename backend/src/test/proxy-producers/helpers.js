import { expect } from 'chai';

import { ProxyUtils } from '@/core/proxy-utils';
import { safeLoad } from '@/utils/yaml';

export const UUID = '11111111-1111-4111-8111-111111111111';

export function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function asList(proxies) {
    return Array.isArray(proxies) ? proxies : [proxies];
}

export function produceInternal(platform, proxies, opts = {}) {
    return ProxyUtils.produce(clone(asList(proxies)), platform, 'internal', opts);
}

export function produceExternal(platform, proxies, opts = {}) {
    const output = ProxyUtils.produce(
        clone(asList(proxies)),
        platform,
        'external',
        opts,
    );
    expect(output, platform).to.be.a('string').and.not.equal('');
    return output;
}

export function loadProducedYaml(platform, proxies, opts = {}) {
    return safeLoad(produceExternal(platform, proxies, opts));
}

export function loadProducedJson(platform, proxies, opts = {}) {
    return JSON.parse(produceExternal(platform, proxies, opts));
}

export function expectSubset(actual, expected, path = 'value') {
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
