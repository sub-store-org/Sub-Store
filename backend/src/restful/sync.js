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
}) {
    platform = platform || 'JSON';

    if (type === 'subscription') {
        const allSubs = $.read(SUBS_KEY);
        const sub = findByName(allSubs, name);
        if (!sub) throw new Error(`找不到订阅 ${name}`);
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
                            return await download(url, ua || sub.ua);
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
            if (!subIgnoreFailedRemoteSub && Object.keys(errors).length > 0) {
                throw new Error(
                    `订阅 ${sub.name} 的远程订阅 ${Object.keys(errors).join(
                        ', ',
                    )} 发生错误, 请查看日志`,
                );
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
                            return await download(url, ua || sub.ua);
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
            if (!subIgnoreFailedRemoteSub && Object.keys(errors).length > 0) {
                throw new Error(
                    `订阅 ${sub.name} 的远程订阅 ${Object.keys(errors).join(
                        ', ',
                    )} 发生错误, 请查看日志`,
                );
            }
            if (sub.mergeSources === 'localFirst') {
                raw.unshift(sub.content);
            } else if (sub.mergeSources === 'remoteFirst') {
                raw.push(sub.content);
            }
        }
        // parse proxies
        let proxies = (Array.isArray(raw) ? raw : [raw])
            .map((i) => ProxyUtils.parse(i))
            .flat();

        proxies.forEach((proxy) => {
            proxy.subName = sub.name;
        });
        // apply processors
        proxies = await ProxyUtils.process(
            proxies,
            sub.process || [],
            platform,
            { [sub.name]: sub },
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
    } else if (type === 'collection') {
        const allSubs = $.read(SUBS_KEY);
        const allCols = $.read(COLLECTIONS_KEY);
        const collection = findByName(allCols, name);
        if (!collection) throw new Error(`找不到组合订阅 ${name}`);
        const subnames = collection.subscriptions;
        const results = {};
        const errors = {};
        let processed = 0;

        await Promise.all(
            subnames.map(async (name) => {
                const sub = findByName(allSubs, name);
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
                                        return await download(url, sub.ua);
                                    } catch (err) {
                                        errors[url] = err;
                                        $.error(
                                            `订阅 ${sub.name} 的远程订阅 ${url} 发生错误: ${err}`,
                                        );
                                        return '';
                                    }
                                }),
                        );
                        if (
                            !sub.ignoreFailedRemoteSub &&
                            Object.keys(errors).length > 0
                        ) {
                            throw new Error(
                                `订阅 ${sub.name} 的远程订阅 ${Object.keys(
                                    errors,
                                ).join(', ')} 发生错误, 请查看日志`,
                            );
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
                        proxy.subName = sub.name;
                        proxy.collectionName = collection.name;
                    });

                    // apply processors
                    currentProxies = await ProxyUtils.process(
                        currentProxies,
                        sub.process || [],
                        platform,
                        { [sub.name]: sub, _collection: collection },
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
        if (
            !collectionIgnoreFailedRemoteSub &&
            Object.keys(errors).length > 0
        ) {
            throw new Error(
                `组合订阅 ${name} 中的子订阅 ${Object.keys(errors).join(
                    ', ',
                )} 发生错误, 请查看日志`,
            );
        }

        // merge proxies with the original order
        let proxies = Array.prototype.concat.apply(
            [],
            subnames.map((name) => results[name] || []),
        );

        proxies.forEach((proxy) => {
            proxy.collectionName = collection.name;
        });

        // apply own processors
        proxies = await ProxyUtils.process(
            proxies,
            collection.process || [],
            platform,
            { _collection: collection },
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
                            return await download(url, ua || file.ua);
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
            if (!fileIgnoreFailedRemoteFile && Object.keys(errors).length > 0) {
                throw new Error(
                    `文件 ${file.name} 的远程文件 ${Object.keys(errors).join(
                        ', ',
                    )} 发生错误, 请查看日志`,
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
                            return await download(url, ua || file.ua);
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
            if (!fileIgnoreFailedRemoteFile && Object.keys(errors).length > 0) {
                throw new Error(
                    `文件 ${file.name} 的远程文件 ${Object.keys(errors).join(
                        ', ',
                    )} 发生错误, 请查看日志`,
                );
            }
            if (file.mergeSources === 'localFirst') {
                raw.unshift(file.content);
            } else if (file.mergeSources === 'remoteFirst') {
                raw.push(file.content);
            }
        }
        const files = (Array.isArray(raw) ? raw : [raw]).flat();
        let filesContent = files
            .filter((i) => i != null && i !== '')
            .join('\n');

        // apply processors
        const processed =
            Array.isArray(file.process) && file.process.length > 0
                ? await ProxyUtils.process(
                      { $files: files, $content: filesContent },
                      file.process,
                  )
                : { $content: filesContent, $files: files };

        return processed?.$content ?? '';
    }
}

async function syncArtifacts() {
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
    } catch (e) {
        $.error(`同步订阅失败，原因：${e.message ?? e}`);
        throw e;
    }
}
async function syncAllArtifacts(_, res) {
    $.info('开始同步所有远程配置...');
    try {
        await syncArtifacts();
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
    $.info(`开始同步远程配置 ${name}...`);
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const artifact = findByName(allArtifacts, name);

    if (!artifact) {
        $.error(`找不到远程配置 ${name}`);
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

    try {
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
        $.error(`远程配置 ${artifact.name} 发生错误: ${err}`);
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
