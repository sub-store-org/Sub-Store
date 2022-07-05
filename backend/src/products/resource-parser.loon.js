/* eslint-disable no-undef */
import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';
import { version } from '../../package.json';

console.log(
    `
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
     Sub-Store -- v${version}
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
`,
);

const RESOURCE_TYPE = {
    PROXY: 1,
    RULE: 2,
};

let result = $resource;

if ($resourceType === RESOURCE_TYPE.PROXY) {
    const proxies = ProxyUtils.parse($resource);
    result = ProxyUtils.produce(proxies, 'Loon');
} else if ($resourceType === RESOURCE_TYPE.RULE) {
    const rules = RuleUtils.parse($resource);
    result = RuleUtils.produce(rules, 'Loon');
}

$done(result);
