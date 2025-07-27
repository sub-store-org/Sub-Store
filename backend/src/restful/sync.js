import $ from '@/core/app';
import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    RULES_KEY,
    SUBS_KEY,
    FILES_KEY,
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

async function produceArtifact({
    type,
    name,
    platform,
    url,
    ua,
    content,
    mergeSources,
    ignoreFailedRemoteSub,
    ignoreFailedRemoteFile,
    produceType,
    produceOpts = {},
    subscription,
    awaitCustomCache,
    $options,
    proxy,
    noCache,
    all,
}) {
    platform = platform || 'JSON';

    if (['subscription', 'sub'].includes(type)) {
        let sub;
        if (name) {
            const allSubs = $.read(SUBS_KEY);
            sub = findByName(allSubs, name);
            if (!sub) throw new Error(`找不到订阅 ${name}`);
        } else if (subscription) {
            sub = subscription;
        } else {
            throw new Error('未提供订阅名称或订阅数据');
        }
        let raw;
        if (content && !['localFirst', 'remoteFirst'].includes(mergeSources)) {
            raw = content;
        } else if (url) {
            const errors = {};
            raw = await Promise.all(
                url
                    .split(/[\r\n]+/)
                    .map((i) => i.trim())
                    .filter((i) => i.length)
                    .map(async (url) => {
                        try {
                            return await download(
                                url,
                                ua || sub.ua,
                                undefined,
                                proxy || sub.proxy,
                                undefined,
                                awaitCustomCache,
                                noCache || sub.noCache,
                                true,
                            );
                        } catch (err) {
                            errors[url] = err;
                            $.error(
                                `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                            );
                            return '';
                        }
                    }),
            );
            let subIgnoreFailedRemoteSub = sub.ignoreFailedRemoteSub;
            if (ignoreFailedRemoteSub != null && ignoreFailedRemoteSub !== '') {
                subIgnoreFailedRemoteSub = ignoreFailedRemoteSub;
            }

            if (Object.keys(errors).length > 0) {
                if (!subIgnoreFailedRemoteSub) {
                    throw new Error(
                        `订阅 ${sub.name} 的远程订阅 ${Object.keys(errors).join(
                            ', ',
                        )} 发生错误, 请查看日志`,
                    );
                } else if (subIgnoreFailedRemoteSub === 'enabled') {
                    $.notify(
                        `🌍 Sub-Store 处理订阅失败`,
                        `❌ ${sub.name}`,
                        `远程订阅 ${Object.keys(errors).join(
                            ', ',
                        )} 发生错误, 请查看日志`,
                    );
                }
            }
            if (mergeSources === 'localFirst') {
                raw.unshift(content);
            } else if (mergeSources === 'remoteFirst') {
                raw.push(content);
            }
        } else if (
            sub.source === 'local' &&
            !['localFirst', 'remoteFirst'].includes(sub.mergeSources)
        ) {
            raw = sub.content;
        } else {
            const errors = {};
            raw = await Promise.all(
                sub.url
                    .split(/[\r\n]+/)
                    .map((i) => i.trim())
                    .filter((i) => i.length)
                    .map(async (url) => {
                        try {
                            return await download(
                                url,
                                ua || sub.ua,
                                undefined,
                                proxy || sub.proxy,
                                undefined,
                                awaitCustomCache,
                                noCache || sub.noCache,
                                true,
                            );
                        } catch (err) {
                            errors[url] = err;
                            $.error(
                                `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                            );
                            return '';
                        }
                    }),
            );
            let subIgnoreFailedRemoteSub = sub.ignoreFailedRemoteSub;
            if (ignoreFailedRemoteSub != null && ignoreFailedRemoteSub !== '') {
                subIgnoreFailedRemoteSub = ignoreFailedRemoteSub;
            }

            if (Object.keys(errors).length > 0) {
                if (!subIgnoreFailedRemoteSub) {
                    throw new Error(
                        `订阅 ${sub.name} 的远程订阅 ${Object.keys(errors).join(
                            ', ',
                        )} 发生错误, 请查看日志`,
                    );
                } else if (subIgnoreFailedRemoteSub === 'enabled') {
                    $.notify(
                        `🌍 Sub-Store 处理订阅失败`,
                        `❌ ${sub.name}`,
                        `远程订阅 ${Object.keys(errors).join(
                            ', ',
                        )} 发生错误, 请查看日志`,
                    );
                }
            }
            if (sub.mergeSources === 'localFirst') {
                raw.unshift(sub.content);
            } else if (sub.mergeSources === 'remoteFirst') {
                raw.push(sub.content);
            }
        }
        if (produceType === 'raw') {
            return JSON.stringify((Array.isArray(raw) ? raw : [raw]).flat());
        }
        // parse proxies
        let proxies = (Array.isArray(raw) ? raw : [raw])
            .map((i) => ProxyUtils.parse(i))
            .flat();

        proxies.forEach((proxy) => {
            proxy._subName = sub.name;
            proxy._subDisplayName = sub.displayName;
        });
        // apply processors
        proxies = await ProxyUtils.process(
            proxies,
            sub.process || [],
            platform,
            { [sub.name]: sub },
            $options,
        );
        if (proxies.length === 0) {
            throw new Error(`订阅 ${name} 中不含有效节点`);
        }
        // check duplicate
        const exist = {};
        for (const proxy of proxies) {
            if (exist[proxy.name]) {
                $.notify(
                    '🌍 Sub-Store',
                    `⚠️ 订阅 ${name} 包含重复节点 ${proxy.name}！`,
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
        return ProxyUtils.produce(proxies, platform, produceType, produceOpts);
    } else if (['collection', 'col'].includes(type)) {
        const allSubs = $.read(SUBS_KEY);
        const allCols = $.read(COLLECTIONS_KEY);
        const collection = findByName(allCols, name);
        if (!collection) throw new Error(`找不到组合订阅 ${name}`);
        const subnames = [...collection.subscriptions];
        let subscriptionTags = collection.subscriptionTags;
        if (Array.isArray(subscriptionTags) && subscriptionTags.length > 0) {
            allSubs.forEach((sub) => {
                if (
                    Array.isArray(sub.tag) &&
                    sub.tag.length > 0 &&
                    !subnames.includes(sub.name) &&
                    sub.tag.some((tag) => subscriptionTags.includes(tag))
                ) {
                    subnames.push(sub.name);
                }
            });
        }
        const results = {};
        const errors = {};
        let processed = 0;

        await Promise.all(
            subnames.map(async (name) => {
                const sub = findByName(allSubs, name);
                const passThroughUA = sub.passThroughUA;
                let reqUA = sub.ua;
                if (passThroughUA) {
                    $.info(
                        `订阅开启了透传 User-Agent, 使用请求的 User-Agent: ${ua}`,
                    );
                    reqUA = ua;
                }
                try {
                    $.info(`正在处理子订阅：${sub.name}...`);
                    let raw;
                    if (
                        sub.source === 'local' &&
                        !['localFirst', 'remoteFirst'].includes(
                            sub.mergeSources,
                        )
                    ) {
                        raw = sub.content;
                    } else {
                        const errors = {};
                        raw = await await Promise.all(
                            sub.url
                                .split(/[\r\n]+/)
                                .map((i) => i.trim())
                                .filter((i) => i.length)
                                .map(async (url) => {
                                    try {
                                        return await download(
                                            url,
                                            reqUA,
                                            undefined,
                                            proxy ||
                                                sub.proxy ||
                                                collection.proxy,
                                            undefined,
                                            undefined,
                                            noCache || sub.noCache,
                                            true,
                                        );
                                    } catch (err) {
                                        errors[url] = err;
                                        $.error(
                                            `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                                        );
                                        return '';
                                    }
                                }),
                        );

                        if (Object.keys(errors).length > 0) {
                            if (!sub.ignoreFailedRemoteSub) {
                                throw new Error(
                                    `订阅 ${sub.name} 的远程订阅 ${Object.keys(
                                        errors,
                                    ).join(', ')} 发生错误, 请查看日志`,
                                );
                            } else if (
                                sub.ignoreFailedRemoteSub === 'enabled'
                            ) {
                                $.notify(
                                    `🌍 Sub-Store 处理订阅失败`,
                                    `❌ ${sub.name}`,
                                    `远程订阅 ${Object.keys(errors).join(
                                        ', ',
                                    )} 发生错误, 请查看日志`,
                                );
                            }
                        }
                        if (sub.mergeSources === 'localFirst') {
                            raw.unshift(sub.content);
                        } else if (sub.mergeSources === 'remoteFirst') {
                            raw.push(sub.content);
                        }
                    }
                    // parse proxies
                    let currentProxies = (Array.isArray(raw) ? raw : [raw])
                        .map((i) => ProxyUtils.parse(i))
                        .flat();

                    currentProxies.forEach((proxy) => {
                        proxy._subName = sub.name;
                        proxy._subDisplayName = sub.displayName;
                        proxy._collectionName = collection.name;
                        proxy._collectionDisplayName = collection.displayName;
                    });

                    // apply processors
                    currentProxies = await ProxyUtils.process(
                        currentProxies,
                        sub.process || [],
                        platform,
                        {
                            [sub.name]: sub,
                            _collection: collection,
                            $options,
                        },
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
                    errors[name] = err;
                    $.error(
                        `❌ 处理组合订阅中的子订阅: ${
                            sub.name
                        }时出现错误：${err}！进度--${
                            100 * (processed / subnames.length).toFixed(1)
                        }%`,
                    );
                }
            }),
        );
        let collectionIgnoreFailedRemoteSub = collection.ignoreFailedRemoteSub;
        if (ignoreFailedRemoteSub != null && ignoreFailedRemoteSub !== '') {
            collectionIgnoreFailedRemoteSub = ignoreFailedRemoteSub;
        }

        if (Object.keys(errors).length > 0) {
            if (!collectionIgnoreFailedRemoteSub) {
                throw new Error(
                    `组合订阅 ${collection.name} 的子订阅 ${Object.keys(
                        errors,
                    ).join(', ')} 发生错误, 请查看日志`,
                );
            } else if (collectionIgnoreFailedRemoteSub === 'enabled') {
                $.notify(
                    `🌍 Sub-Store 处理组合订阅失败`,
                    `❌ ${collection.name}`,
                    `子订阅 ${Object.keys(errors).join(
                        ', ',
                    )} 发生错误, 请查看日志`,
                );
            }
        }

        // merge proxies with the original order
        let proxies = Array.prototype.concat.apply(
            [],
            subnames.map((name) => results[name] || []),
        );

        proxies.forEach((proxy) => {
            proxy._collectionName = collection.name;
            proxy._collectionDisplayName = collection.displayName;
        });

        // apply own processors
        proxies = await ProxyUtils.process(
            proxies,
            collection.process || [],
            platform,
            { _collection: collection },
            $options,
        );
        if (proxies.length === 0) {
            throw new Error(`组合订阅 ${name} 中不含有效节点`);
        }
        // check duplicate
        const exist = {};
        for (const proxy of proxies) {
            if (exist[proxy.name]) {
                $.notify(
                    '🌍 Sub-Store',
                    `⚠️ 组合订阅 ${name} 包含重复节点 ${proxy.name}！`,
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
        return ProxyUtils.produce(proxies, platform, produceType, produceOpts);
    } else if (type === 'rule') {
        const allRules = $.read(RULES_KEY);
        const rule = findByName(allRules, name);
        if (!rule) throw new Error(`找不到规则 ${name}`);
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
    } else if (type === 'file') {
        const allFiles = $.read(FILES_KEY);
        const file = findByName(allFiles, name);
        if (!file) throw new Error(`找不到文件 ${name}`);
        let raw = '';
        if (file.type !== 'mihomoProfile') {
            if (
                content &&
                !['localFirst', 'remoteFirst'].includes(mergeSources)
            ) {
                raw = content;
            } else if (url) {
                const errors = {};
                raw = await Promise.all(
                    url
                        .split(/[\r\n]+/)
                        .map((i) => i.trim())
                        .filter((i) => i.length)
                        .map(async (url) => {
                            try {
                                return await download(
                                    url,
                                    ua || file.ua,
                                    undefined,
                                    file.proxy || proxy,
                                    undefined,
                                    undefined,
                                    noCache,
                                );
                            } catch (err) {
                                errors[url] = err;
                                $.error(
                                    `文件 ${file.name} 的远程文件 ${url} 发生错误: ${err}`,
                                );
                                return '';
                            }
                        }),
                );
                let fileIgnoreFailedRemoteFile = file.ignoreFailedRemoteFile;
                if (
                    ignoreFailedRemoteFile != null &&
                    ignoreFailedRemoteFile !== ''
                ) {
                    fileIgnoreFailedRemoteFile = ignoreFailedRemoteFile;
                }
                if (
                    !fileIgnoreFailedRemoteFile &&
                    Object.keys(errors).length > 0
                ) {
                    throw new Error(
                        `文件 ${file.name} 的远程文件 ${Object.keys(
                            errors,
                        ).join(', ')} 发生错误, 请查看日志`,
                    );
                }
                if (mergeSources === 'localFirst') {
                    raw.unshift(content);
                } else if (mergeSources === 'remoteFirst') {
                    raw.push(content);
                }
            } else if (
                file.source === 'local' &&
                !['localFirst', 'remoteFirst'].includes(file.mergeSources)
            ) {
                raw = file.content;
            } else {
                const errors = {};
                raw = await Promise.all(
                    file.url
                        .split(/[\r\n]+/)
                        .map((i) => i.trim())
                        .filter((i) => i.length)
                        .map(async (url) => {
                            try {
                                return await download(
                                    url,
                                    ua || file.ua,
                                    undefined,
                                    file.proxy || proxy,
                                    undefined,
                                    undefined,
                                    noCache,
                                );
                            } catch (err) {
                                errors[url] = err;
                                $.error(
                                    `文件 ${file.name} 的远程文件 ${url} 发生错误: ${err}`,
                                );
                                return '';
                            }
                        }),
                );
                let fileIgnoreFailedRemoteFile = file.ignoreFailedRemoteFile;
                if (
                    ignoreFailedRemoteFile != null &&
                    ignoreFailedRemoteFile !== ''
                ) {
                    fileIgnoreFailedRemoteFile = ignoreFailedRemoteFile;
                }

                if (Object.keys(errors).length > 0) {
                    if (!fileIgnoreFailedRemoteFile) {
                        throw new Error(
                            `文件 ${file.name} 的远程文件 ${Object.keys(
                                errors,
                            ).join(', ')} 发生错误, 请查看日志`,
                        );
                    } else if (fileIgnoreFailedRemoteFile === 'enabled') {
                        $.notify(
                            `🌍 Sub-Store 处理文件失败`,
                            `❌ ${file.name}`,
                            `远程文件 ${Object.keys(errors).join(
                                ', ',
                            )} 发生错误, 请查看日志`,
                        );
                    }
                }
                if (file.mergeSources === 'localFirst') {
                    raw.unshift(file.content);
                } else if (file.mergeSources === 'remoteFirst') {
                    raw.push(file.content);
                }
            }
        }
        if (produceType === 'raw') {
            return JSON.stringify((Array.isArray(raw) ? raw : [raw]).flat());
        }
        const files = (Array.isArray(raw) ? raw : [raw]).flat();
        let filesContent = files
            .filter((i) => i != null && i !== '')
            .join('\n');

        // apply processors
        const processed =
            Array.isArray(file.process) && file.process.length > 0
                ? await ProxyUtils.process(
                      {
                          $files: files,
                          $content: filesContent,
                          $options,
                          $file: file,
                      },
                      file.process,
                  )
                : { $content: filesContent, $files: files, $options };

        return (all ? processed : processed?.$content) ?? '';
    }
}

async function syncArtifacts() {
    $.info('开始同步所有远程配置...');
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const files = {};

    try {
        const valid = [];
        const invalid = [];
        const allSubs = $.read(SUBS_KEY);
        const allCols = $.read(COLLECTIONS_KEY);
        const subNames = [];
        let enabledCount = 0;
        allArtifacts.map((artifact) => {
            if (artifact.sync && artifact.source) {
                enabledCount++;
                if (artifact.type === 'subscription') {
                    const subName = artifact.source;
                    const sub = findByName(allSubs, subName);
                    if (sub && sub.url && !subNames.includes(subName)) {
                        subNames.push(subName);
                    }
                } else if (artifact.type === 'collection') {
                    const collection = findByName(allCols, artifact.source);
                    if (collection && Array.isArray(collection.subscriptions)) {
                        collection.subscriptions.map((subName) => {
                            const sub = findByName(allSubs, subName);
                            if (sub && sub.url && !subNames.includes(subName)) {
                                subNames.push(subName);
                            }
                        });
                    }
                }
            }
        });

        if (enabledCount === 0) {
            $.info(
                `需同步的配置: ${enabledCount}, 总数: ${allArtifacts.length}`,
            );
            return;
        }

        if (subNames.length > 0) {
            await Promise.all(
                subNames.map(async (subName) => {
                    try {
                        await produceArtifact({
                            type: 'subscription',
                            name: subName,
                            awaitCustomCache: true,
                        });
                    } catch (e) {
                        // $.error(`${e.message ?? e}`);
                    }
                }),
            );
        }

        await Promise.all(
            allArtifacts.map(async (artifact) => {
                try {
                    if (artifact.sync && artifact.source) {
                        $.info(`正在同步云配置：${artifact.name}...`);

                        const useMihomoExternal =
                            artifact.platform === 'SurgeMac';

                        if (useMihomoExternal) {
                            $.info(
                                `手动指定了 target 为 SurgeMac, 将使用 Mihomo External`,
                            );
                        }

                        const output = await produceArtifact({
                            type: artifact.type,
                            name: artifact.source,
                            platform: artifact.platform,
                            produceOpts: {
                                'include-unsupported-proxy':
                                    artifact.includeUnsupportedProxy,
                                useMihomoExternal,
                            },
                        });

                        // if (!output || output.length === 0)
                        //     throw new Error('该配置的结果为空 不进行上传');

                        files[encodeURIComponent(artifact.name)] = {
                            content: output,
                        };

                        valid.push(artifact.name);
                    }
                } catch (e) {
                    $.error(
                        `生成同步配置 ${artifact.name} 发生错误: ${
                            e.message ?? e
                        }`,
                    );
                    invalid.push(artifact.name);
                }
            }),
        );

        $.info(`${valid.length} 个同步配置生成成功: ${valid.join(', ')}`);
        $.info(`${invalid.length} 个同步配置生成失败: ${invalid.join(', ')}`);

        if (valid.length === 0) {
            throw new Error(
                `同步配置 ${invalid.join(', ')} 生成失败 详情请查看日志`,
            );
        }

        const resp = await syncToGist(files);
        const body = JSON.parse(resp.body);

        delete body.history;
        delete body.forks;
        delete body.owner;
        Object.values(body.files).forEach((file) => {
            delete file.content;
        });
        $.info('上传配置响应:');
        $.info(JSON.stringify(body, null, 2));

        for (const artifact of allArtifacts) {
            if (
                artifact.sync &&
                artifact.source &&
                valid.includes(artifact.name)
            ) {
                artifact.updated = new Date().getTime();
                // extract real url from gist
                let files = body.files;
                let isGitLab;
                if (Array.isArray(files)) {
                    isGitLab = true;
                    files = Object.fromEntries(
                        files.map((item) => [item.path, item]),
                    );
                }
                const raw_url =
                    files[encodeURIComponent(artifact.name)]?.raw_url;
                const new_url = isGitLab
                    ? raw_url
                    : raw_url?.replace(/\/raw\/[^/]*\/(.*)/, '/raw/$1');
                $.info(
                    `上传配置完成\n文件列表: ${Object.keys(files).join(
                        ', ',
                    )}\n当前文件: ${encodeURIComponent(
                        artifact.name,
                    )}\n响应返回的原始链接: ${raw_url}\n处理完的新链接: ${new_url}`,
                );
                artifact.url = new_url;
            }
        }

        $.write(allArtifacts, ARTIFACTS_KEY);
        $.info('上传配置成功');

        if (invalid.length > 0) {
            throw new Error(
                `同步配置成功 ${valid.length} 个, 失败 ${invalid.length} 个, 详情请查看日志`,
            );
        } else {
            $.info(`同步配置成功 ${valid.length} 个`);
        }
    } catch (e) {
        $.error(`同步配置失败，原因：${e.message ?? e}`);
        throw e;
    }
}
async function syncAllArtifacts(_, res) {
    $.info('开始同步所有远程配置...');
    try {
        await syncArtifacts();
        success(res);
    } catch (e) {
        $.error(`同步配置失败，原因：${e.message ?? e}`);
        failed(
            res,
            new InternalServerError(
                `FAILED_TO_SYNC_ARTIFACTS`,
                `Failed to sync all artifacts`,
                `Reason: ${e.message ?? e}`,
            ),
        );
    }
}

async function syncArtifact(req, res) {
    let { name } = req.params;
    $.info(`开始同步远程配置 ${name}...`);
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const artifact = findByName(allArtifacts, name);

    if (!artifact) {
        $.error(`找不到远程配置 ${name}`);
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `找不到远程配置 ${name}`,
            ),
            404,
        );
        return;
    }

    if (!artifact.source) {
        $.error(`远程配置 ${name} 未设置来源`);
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_HAS_NO_SOURCE',
                `远程配置 ${name} 未设置来源`,
            ),
            404,
        );
        return;
    }

    try {
        const useMihomoExternal = artifact.platform === 'SurgeMac';

        if (useMihomoExternal) {
            $.info(`手动指定了 target 为 SurgeMac, 将使用 Mihomo External`);
        }
        const output = await produceArtifact({
            type: artifact.type,
            name: artifact.source,
            platform: artifact.platform,
            produceOpts: {
                'include-unsupported-proxy': artifact.includeUnsupportedProxy,
                useMihomoExternal,
            },
        });

        $.info(
            `正在上传配置：${artifact.name}\n>>>${JSON.stringify(
                artifact,
                null,
                2,
            )}`,
        );
        // if (!output || output.length === 0)
        //     throw new Error('该配置的结果为空 不进行上传');
        const resp = await syncToGist({
            [encodeURIComponent(artifact.name)]: {
                content: output,
            },
        });
        artifact.updated = new Date().getTime();
        const body = JSON.parse(resp.body);

        delete body.history;
        delete body.forks;
        delete body.owner;
        Object.values(body.files).forEach((file) => {
            delete file.content;
        });
        $.info('上传配置响应:');
        $.info(JSON.stringify(body, null, 2));

        let files = body.files;
        let isGitLab;
        if (Array.isArray(files)) {
            isGitLab = true;
            files = Object.fromEntries(files.map((item) => [item.path, item]));
        }
        const raw_url = files[encodeURIComponent(artifact.name)]?.raw_url;
        const new_url = isGitLab
            ? raw_url
            : raw_url?.replace(/\/raw\/[^/]*\/(.*)/, '/raw/$1');
        $.info(
            `上传配置完成\n文件列表: ${Object.keys(files).join(
                ', ',
            )}\n当前文件: ${encodeURIComponent(
                artifact.name,
            )}\n响应返回的原始链接: ${raw_url}\n处理完的新链接: ${new_url}`,
        );
        artifact.url = new_url;
        $.write(allArtifacts, ARTIFACTS_KEY);
        success(res, artifact);
    } catch (err) {
        $.error(`远程配置 ${artifact.name} 发生错误: ${err.message ?? err}`);
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

export { produceArtifact, syncArtifacts };
