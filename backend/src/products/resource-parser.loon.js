/* eslint-disable no-undef */
import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';
import { version } from '../../package.json';
import download from '@/utils/download';

let result = '';
let resource = typeof $resource !== 'undefined' ? $resource : '';
let resourceType = typeof $resourceType !== 'undefined' ? $resourceType : '';
let resourceUrl = typeof $resourceUrl !== 'undefined' ? $resourceUrl : '';

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

    const RESOURCE_TYPE = {
        PROXY: 1,
        RULE: 2,
    };

    result = resource;

    if (resourceType === RESOURCE_TYPE.PROXY) {
        try {
            let proxies = ProxyUtils.parse(resource);
            result = ProxyUtils.produce(proxies, 'Loon', undefined, {
                'include-unsupported-proxy': arg?.includeUnsupportedProxy,
            });
        } catch (e) {
            console.log('解析器: 使用 resource 出现错误');
            console.log(e.message ?? e);
        }
        if ((!result || /^\s*$/.test(result)) && resourceUrl) {
            console.log(`解析器: 尝试从 ${resourceUrl} 获取订阅`);
            try {
                let raw = await download(
                    resourceUrl,
                    arg?.ua,
                    arg?.timeout,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    true,
                );
                let proxies = ProxyUtils.parse(raw);
                result = ProxyUtils.produce(proxies, 'Loon', undefined, {
                    'include-unsupported-proxy': arg?.includeUnsupportedProxy,
                });
            } catch (e) {
                console.log(e.message ?? e);
            }
        }
    } else if (resourceType === RESOURCE_TYPE.RULE) {
        try {
            const rules = RuleUtils.parse(resource);
            result = RuleUtils.produce(rules, 'Loon');
        } catch (e) {
            console.log(e.message ?? e);
        }
        if ((!result || /^\s*$/.test(result)) && resourceUrl) {
            console.log(`解析器: 尝试从 ${resourceUrl} 获取规则`);
            try {
                let raw = await download(resourceUrl, arg?.ua, arg?.timeout);
                let rules = RuleUtils.parse(raw);
                result = RuleUtils.produce(rules, 'Loon');
            } catch (e) {
                console.log(e.message ?? e);
            }
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
