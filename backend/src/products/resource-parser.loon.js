/* eslint-disable no-undef */
import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';
import { version } from '../../package.json';
import download from '@/utils/download';
import {
    AGE_SECRET_KEY,
    decryptArmorIfPresent,
    isAgeArmor,
    maskAgeSecret,
} from '@/utils/age';

let result = '';
let resource = typeof $resource !== 'undefined' ? $resource : '';
let resourceType = typeof $resourceType !== 'undefined' ? $resourceType : '';
let resourceUrl = typeof $resourceUrl !== 'undefined' ? $resourceUrl : '';

!(async () => {
    console.log(
        `
    ┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
         Sub-Store -- v${version}
         Loon -- ${$loon}
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
    console.log(`arg: ${maskAgeSecret(JSON.stringify(arg))}`);
    const ageSecretKey = arg?.[AGE_SECRET_KEY];
    const downloadOptions = ageSecretKey
        ? {
              [AGE_SECRET_KEY]: ageSecretKey,
          }
        : undefined;
    const maybeDecryptResource = async (input) =>
        ageSecretKey ? await decryptArmorIfPresent(input, ageSecretKey) : input;

    const RESOURCE_TYPE = {
        PROXY: 1,
        RULE: 2,
    };
    if (!arg.resourceUrlOnly) {
        result = ageSecretKey && isAgeArmor(resource) ? '' : resource;
    }

    if (resourceType === RESOURCE_TYPE.PROXY) {
        if (!arg.resourceUrlOnly) {
            try {
                const raw = await maybeDecryptResource(resource);
                let proxies = ProxyUtils.parse(raw);
                result = ProxyUtils.produce(proxies, 'Loon', undefined, {
                    'include-unsupported-proxy': arg?.includeUnsupportedProxy,
                });
            } catch (e) {
                console.log('解析器: 使用 resource 出现错误');
                console.log(e.message ?? e);
            }
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
                    arg?.noCache,
                    true,
                    downloadOptions,
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
        if (!arg.resourceUrlOnly) {
            try {
                const raw = await maybeDecryptResource(resource);
                const rules = RuleUtils.parse(raw);
                result = RuleUtils.produce(rules, 'Loon');
            } catch (e) {
                console.log(e.message ?? e);
            }
        }
        if ((!result || /^\s*$/.test(result)) && resourceUrl) {
            console.log(`解析器: 尝试从 ${resourceUrl} 获取规则`);
            try {
                let raw = await download(
                    resourceUrl,
                    arg?.ua,
                    arg?.timeout,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    downloadOptions,
                );
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
