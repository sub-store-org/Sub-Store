import $ from '@/core/app';
import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    RULES_KEY,
    SUBS_KEY,
} from '@/constants';
import { failed, success } from '@/restful/response';
import { InternalServerError, ResourceNotFoundError } from '@/restful/errors';
import { findByName } from '@/utils/database';
import download from '@/utils/download';
import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';
import { syncToGist } from '@/restful/artifacts';

export default function register($app) {
    // Initialization
    if (!$.read(ARTIFACTS_KEY)) $.write({}, ARTIFACTS_KEY);

    // sync all artifacts
    $app.get('/api/sync/artifacts', syncAllArtifacts);
    $app.get('/api/sync/artifact/:name', syncArtifact);
}

async function produceArtifact({ type, name, platform }) {
    platform = platform || 'JSON';

    // produce Clash node format for ShadowRocket
    if (platform === 'ShadowRocket') platform = 'Clash';

    if (type === 'subscription') {
        const allSubs = $.read(SUBS_KEY);
        const sub = findByName(allSubs, name);
        let raw;
        if (sub.source === 'local') {
            raw = sub.content;
        } else {
            raw = await download(sub.url, sub.ua);
        }
        // parse proxies
        let proxies = ProxyUtils.parse(raw);
        // apply processors
        proxies = await ProxyUtils.process(
            proxies,
            sub.process || [],
            platform,
        );
        // check duplicate
        const exist = {};
        for (const proxy of proxies) {
            if (exist[proxy.name]) {
                $.notify(
                    '🌍 Sub-Store',
                    '⚠️ 订阅包含重复节点！',
                    '请仔细检测配置！',
                    {
                        'media-url':
                            'https://cdn3.iconfinder.com/data/icons/seo-outline-1/512/25_code_program_programming_develop_bug_search_developer-512.png',
                    },
                );
                break;
            }
            exist[proxy.name] = true;
        }
        // produce
        return ProxyUtils.produce(proxies, platform);
    } else if (type === 'collection') {
        const allSubs = $.read(SUBS_KEY);
        const allCols = $.read(COLLECTIONS_KEY);
        const collection = findByName(allCols, name);
        const subnames = collection.subscriptions;
        const results = {};
        let processed = 0;

        await Promise.all(
            subnames.map(async (name) => {
                const sub = findByName(allSubs, name);
                try {
                    $.info(`正在处理子订阅：${sub.name}...`);
                    let raw;
                    if (sub.source === 'local') {
                        raw = sub.content;
                    } else {
                        raw = await download(sub.url, sub.ua);
                    }
                    // parse proxies
                    let currentProxies = ProxyUtils.parse(raw);
                    // apply processors
                    currentProxies = await ProxyUtils.process(
                        currentProxies,
                        sub.process || [],
                        platform,
                    );
                    results[name] = currentProxies;
                    processed++;
                    $.info(
                        `✅ 子订阅：${sub.name}加载成功，进度--${
                            100 * (processed / subnames.length).toFixed(1)
                        }% `,
                    );
                } catch (err) {
                    processed++;
                    $.error(
                        `❌ 处理组合订阅中的子订阅: ${
                            sub.name
                        }时出现错误：${err}，该订阅已被跳过！进度--${
                            100 * (processed / subnames.length).toFixed(1)
                        }%`,
                    );
                }
            }),
        );

        // merge proxies with the original order
        let proxies = Array.prototype.concat.apply(
            [],
            subnames.map((name) => results[name]),
        );

        // apply own processors
        proxies = await ProxyUtils.process(
            proxies,
            collection.process || [],
            platform,
        );
        if (proxies.length === 0) {
            throw new Error(`组合订阅中不含有效节点！`);
        }
        // check duplicate
        const exist = {};
        for (const proxy of proxies) {
            if (exist[proxy.name]) {
                $.notify(
                    '🌍 Sub-Store',
                    '⚠️ 订阅包含重复节点！',
                    '请仔细检测配置！',
                    {
                        'media-url':
                            'https://cdn3.iconfinder.com/data/icons/seo-outline-1/512/25_code_program_programming_develop_bug_search_developer-512.png',
                    },
                );
                break;
            }
            exist[proxy.name] = true;
        }
        return ProxyUtils.produce(proxies, platform);
    } else if (type === 'rule') {
        const allRules = $.read(RULES_KEY);
        const rule = findByName(allRules, name);
        let rules = [];
        for (let i = 0; i < rule.urls.length; i++) {
            const url = rule.urls[i];
            $.info(
                `正在处理URL：${url}，进度--${
                    100 * ((i + 1) / rule.urls.length).toFixed(1)
                }% `,
            );
            try {
                const { body } = await download(url);
                const currentRules = RuleUtils.parse(body);
                rules = rules.concat(currentRules);
            } catch (err) {
                $.error(
                    `处理分流订阅中的URL: ${url}时出现错误：${err}! 该订阅已被跳过。`,
                );
            }
        }
        // remove duplicates
        rules = await RuleUtils.process(rules, [
            { type: 'Remove Duplicate Filter' },
        ]);
        // produce output
        return RuleUtils.produce(rules, platform);
    }
}

async function syncAllArtifacts(_, res) {
    $.info('开始同步所有远程配置...');
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const files = {};

    try {
        await Promise.all(
            allArtifacts.map(async (artifact) => {
                if (artifact.sync) {
                    $.info(`正在同步云配置：${artifact.name}...`);
                    const output = await produceArtifact({
                        type: artifact.type,
                        name: artifact.source,
                        platform: artifact.platform,
                    });

                    files[artifact.name] = {
                        content: output,
                    };
                }
            }),
        );

        const resp = await syncToGist(files);
        const body = JSON.parse(resp.body);

        for (const artifact of allArtifacts) {
            if (artifact.sync) {
                artifact.updated = new Date().getTime();
                // extract real url from gist
                artifact.url = body.files[artifact.name].raw_url.replace(
                    /\/raw\/[^/]*\/(.*)/,
                    '/raw/$1',
                );
            }
        }

        $.write(allArtifacts, ARTIFACTS_KEY);
        $.info('全部订阅同步成功！');
        success(res);
    } catch (err) {
        failed(
            res,
            new InternalServerError(
                `FAILED_TO_SYNC_ARTIFACTS`,
                `Failed to sync all artifacts`,
                `Reason: ${err}`,
            ),
        );
        $.info(`同步订阅失败，原因：${err}`);
    }
}

async function syncArtifact(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const artifact = findByName(allArtifacts, name);

    if (!artifact) {
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Artifact ${name} does not exist!`,
            ),
            404,
        );
        return;
    }

    const output = await produceArtifact({
        type: artifact.type,
        name: artifact.source,
        platform: artifact.platform,
    });

    $.info(
        `正在上传配置：${artifact.name}\n>>>${JSON.stringify(
            artifact,
            null,
            2,
        )}`,
    );
    try {
        const resp = await syncToGist({
            [encodeURIComponent(artifact.name)]: {
                content: output,
            },
        });
        artifact.updated = new Date().getTime();
        const body = JSON.parse(resp.body);
        artifact.url = body.files[
            encodeURIComponent(artifact.name)
        ].raw_url.replace(/\/raw\/[^/]*\/(.*)/, '/raw/$1');
        $.write(allArtifacts, ARTIFACTS_KEY);
        success(res, artifact);
    } catch (err) {
        failed(
            res,
            new InternalServerError(
                `FAILED_TO_SYNC_ARTIFACT`,
                `Failed to sync artifact ${name}`,
                `Reason: ${err}`,
            ),
        );
    }
}

export { produceArtifact };
