import { ProxyUtils } from '@/core/proxy-utils';
import { RuleUtils } from '@/core/rule-utils';
import download from '@/utils/download';
import Gist from '@/utils/gist';
import $ from '@/core/app';

import {
    SUBS_KEY,
    ARTIFACTS_KEY,
    ARTIFACT_REPOSITORY_KEY,
    COLLECTIONS_KEY,
    RULES_KEY,
    SETTINGS_KEY,
} from './constants';

export default function register($app) {
    // Initialization
    if (!$.read(ARTIFACTS_KEY)) $.write({}, ARTIFACTS_KEY);

    // RESTful APIs
    $app.route('/api/artifacts').get(getAllArtifacts).post(createArtifact);

    $app.route('/api/artifact/:name')
        .get(getArtifact)
        .patch(updateArtifact)
        .delete(deleteArtifact);

    // sync all artifacts
    $app.get('/api/cron/sync-artifacts', cronSyncArtifacts);
}

async function getArtifact(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const action = req.query.action;
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const artifact = allArtifacts[name];

    if (artifact) {
        if (action) {
            let item;
            switch (artifact.type) {
                case 'subscription':
                    item = $.read(SUBS_KEY)[artifact.source];
                    break;
                case 'collection':
                    item = $.read(COLLECTIONS_KEY)[artifact.source];
                    break;
                case 'rule':
                    item = $.read(RULES_KEY)[artifact.source];
                    break;
            }
            const output = await produceArtifact({
                type: artifact.type,
                item,
                platform: artifact.platform,
            });
            if (action === 'preview') {
                res.send(output);
            } else if (action === 'sync') {
                $.info(`正在上传配置：${artifact.name}\n>>>`);
                console.log(JSON.stringify(artifact, null, 2));
                try {
                    const resp = await syncArtifact({
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
                    res.json({
                        status: 'success',
                    });
                } catch (err) {
                    res.status(500).json({
                        status: 'failed',
                        message: err,
                    });
                }
            }
        } else {
            res.json({
                status: 'success',
                data: artifact,
            });
        }
    } else {
        res.status(404).json({
            status: 'failed',
            message: '未找到对应的配置！',
        });
    }
}

function createArtifact(req, res) {
    const artifact = req.body;
    $.info(`正在创建远程配置：${artifact.name}`);
    const allArtifacts = $.read(ARTIFACTS_KEY);
    if (allArtifacts[artifact.name]) {
        res.status(500).json({
            status: 'failed',
            message: `远程配置${artifact.name}已存在！`,
        });
    } else {
        allArtifacts[artifact.name] = artifact;
        $.write(allArtifacts, ARTIFACTS_KEY);
        res.status(201).json({
            status: 'success',
            data: artifact,
        });
    }
}

function updateArtifact(req, res) {
    const allArtifacts = $.read(ARTIFACTS_KEY);
    let oldName = req.params.name;
    oldName = decodeURIComponent(oldName);
    const artifact = allArtifacts[oldName];
    if (artifact) {
        $.info(`正在更新远程配置：${artifact.name}`);
        const newArtifact = req.body;
        if (
            typeof newArtifact.name !== 'undefined' &&
            !/^[\w-_.]*$/.test(newArtifact.name)
        ) {
            res.status(500).json({
                status: 'failed',
                message: `远程配置名称 ${newArtifact.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`,
            });
        } else {
            const merged = {
                ...artifact,
                ...newArtifact,
            };
            allArtifacts[merged.name] = merged;
            if (merged.name !== oldName) delete allArtifacts[oldName];
            $.write(allArtifacts, ARTIFACTS_KEY);
            res.json({
                status: 'success',
                data: merged,
            });
        }
    } else {
        res.status(404).json({
            status: 'failed',
            message: '未找到对应的远程配置！',
        });
    }
}

async function cronSyncArtifacts(_, res) {
    $.info('开始同步所有远程配置...');
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const files = {};

    try {
        await Promise.all(
            Object.values(allArtifacts).map(async (artifact) => {
                if (artifact.sync) {
                    $.info(`正在同步云配置：${artifact.name}...`);
                    let item;
                    switch (artifact.type) {
                        case 'subscription':
                            item = $.read(SUBS_KEY)[artifact.source];
                            break;
                        case 'collection':
                            item = $.read(COLLECTIONS_KEY)[artifact.source];
                            break;
                        case 'rule':
                            item = $.read(RULES_KEY)[artifact.source];
                            break;
                    }
                    const output = await produceArtifact({
                        type: artifact.type,
                        item,
                        platform: artifact.platform,
                    });

                    files[artifact.name] = {
                        content: output,
                    };
                }
            }),
        );

        const resp = await syncArtifact(files);
        const body = JSON.parse(resp.body);

        for (const artifact of Object.values(allArtifacts)) {
            artifact.updated = new Date().getTime();
            // extract real url from gist
            artifact.url = body.files[artifact.name].raw_url.replace(
                /\/raw\/[^/]*\/(.*)/,
                '/raw/$1',
            );
        }

        $.write(allArtifacts, ARTIFACTS_KEY);
        $.info('全部订阅同步成功！');
        res.status(200).end();
    } catch (err) {
        res.status(500).json({
            error: err,
        });
        $.info(`同步订阅失败，原因：${err}`);
    }
}

async function deleteArtifact(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    $.info(`正在删除远程配置：${name}`);
    const allArtifacts = $.read(ARTIFACTS_KEY);
    try {
        const artifact = allArtifacts[name];
        if (!artifact) throw new Error(`远程配置：${name}不存在！`);
        if (artifact.updated) {
            // delete gist
            const files = {};
            files[encodeURIComponent(artifact.name)] = {
                content: '',
            };
            await syncArtifact(files);
        }
        // delete local cache
        delete allArtifacts[name];
        $.write(allArtifacts, ARTIFACTS_KEY);
        res.json({
            status: 'success',
        });
    } catch (err) {
        $.error(`无法删除远程配置：${name}，原因：${err}`);
        res.status(500).json({
            status: 'failed',
            message: `无法删除远程配置：${name}, 原因：${err}`,
        });
    }
}

function getAllArtifacts(req, res) {
    const allArtifacts = $.read(ARTIFACTS_KEY);
    res.json({
        status: 'success',
        data: allArtifacts,
    });
}

async function syncArtifact(files) {
    const { gistToken } = $.read(SETTINGS_KEY);
    if (!gistToken) {
        return Promise.reject('未设置Gist Token！');
    }
    const manager = new Gist({
        token: gistToken,
        key: ARTIFACT_REPOSITORY_KEY,
    });
    return manager.upload(files);
}

async function produceArtifact({ type, item, platform, noProcessor }) {
    platform = platform || 'JSON';
    noProcessor = noProcessor || false;

    if (type === 'subscription') {
        const sub = item;
        let raw;
        if (sub.source === 'local') {
            raw = sub.content;
        } else {
            raw = await download(sub.url, sub.ua);
        }
        // parse proxies
        let proxies = ProxyUtils.parse(raw);
        if (!noProcessor) {
            // apply processors
            proxies = await ProxyUtils.process(
                proxies,
                sub.process || [],
                platform,
            );
        }
        // check duplicate
        const exist = {};
        for (const proxy of proxies) {
            if (exist[proxy.name]) {
                $.notify(
                    '🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』',
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
        const collection = item;
        const subnames = collection['subscriptions'];
        const results = {};
        let processed = 0;

        await Promise.all(
            subnames.map(async (name) => {
                const sub = allSubs[name];
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
                    if (!noProcessor) {
                        // apply processors
                        currentProxies = await ProxyUtils.process(
                            currentProxies,
                            sub.process || [],
                            platform,
                        );
                    }
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

        if (!noProcessor) {
            // apply own processors
            proxies = await ProxyUtils.process(
                proxies,
                collection.process || [],
                platform,
            );
        }
        if (proxies.length === 0) {
            throw new Error(`组合订阅中不含有效节点！`);
        }
        // check duplicate
        const exist = {};
        for (const proxy of proxies) {
            if (exist[proxy.name]) {
                $.notify(
                    '🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』',
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
        const rule = item;
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

export { produceArtifact };
