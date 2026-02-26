/* eslint-disable no-undef */
import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';
import { version } from '../../package.json';

let result = '';
let resource = typeof $resource !== 'undefined' ? $resource : '';
let resourceType = typeof $resourceType !== 'undefined' ? $resourceType : '';
let targetPlatform = typeof $targetPlatform  !== 'undefined' ? $targetPlatform : '';

!(async () => {
    console.log(
        `
    ┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
         Sub-Store -- v${version}
    ┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
    `,
    );

    let arg;
    if (typeof $argument != 'undefined') {
        arg = Object.fromEntries(
            $argument.split('&').map((item) => item.split('=')),
        );
    } else {
        arg = {};
    }

    console.log(`arg: ${JSON.stringify(arg)}`);

    const RESOURCE_TYPE = {
        PROXY: 1,
        RULE: 2,
    };

    if (resourceType === RESOURCE_TYPE.PROXY) {
        try {
            let proxies = ProxyUtils.parse(resource);
            result = ProxyUtils.produce(proxies, targetPlatform, undefined, {
                'include-unsupported-proxy':false,
            });
        } catch (e) {
            console.log('解析器: 使用 resource 出现错误');
            console.log(e.message ?? e);
        }
    } else if (resourceType === RESOURCE_TYPE.RULE) {
        try {
            const rules = RuleUtils.parse(resource);
            result = RuleUtils.produce(rules, targetPlatform);
        } catch (e) {
            console.log(e.message ?? e);
        }
    }
})()
    .catch(async (e) => {
        console.log('解析器: 出现错误');
        console.log(e.message ?? e);
    })
    .finally(() => {
        $done(result || '');
    });
