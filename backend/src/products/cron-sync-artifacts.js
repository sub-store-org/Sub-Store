import { version } from '../../package.json';
import {
    SETTINGS_KEY,
    ARTIFACTS_KEY,
    SUBS_KEY,
    COLLECTIONS_KEY,
} from '@/constants';
import $ from '@/core/app';
import { produceArtifact } from '@/restful/sync';
import { syncToGist } from '@/restful/artifacts';
import { findByName } from '@/utils/database';

!(async function () {
    let arg;
    if (typeof $argument != 'undefined') {
        arg = Object.fromEntries(
            // eslint-disable-next-line no-undef
            $argument.split('&').map((item) => item.split('=')),
        );
    } else {
        arg = {};
    }
    let sub_names = (arg?.subscription ?? arg?.sub ?? '')
        .split(/,|，/g)
        .map((i) => i.trim())
        .filter((i) => i.length > 0)
        .map((i) => decodeURIComponent(i));
    let col_names = (arg?.collection ?? arg?.col ?? '')
        .split(/,|，/g)
        .map((i) => i.trim())
        .filter((i) => i.length > 0)
        .map((i) => decodeURIComponent(i));
    if (sub_names.length > 0 || col_names.length > 0) {
        if (sub_names.length > 0)
            await produceArtifacts(sub_names, 'subscription');
        if (col_names.length > 0)
            await produceArtifacts(col_names, 'collection');
    } else {
        const settings = $.read(SETTINGS_KEY);
        // if GitHub token is not configured
        if (!settings.githubUser || !settings.gistToken) return;

        const artifacts = $.read(ARTIFACTS_KEY);
        if (!artifacts || artifacts.length === 0) return;

        const shouldSync = artifacts.some((artifact) => artifact.sync);
        if (shouldSync) await doSync();
    }
})().finally(() => $.done());

async function produceArtifacts(names, type) {
    try {
        if (names.length > 0) {
            $.info(`produceArtifacts ${type} 开始: ${names.join(', ')}`);
            await Promise.all(
                names.map(async (name) => {
                    try {
                        await produceArtifact({
                            type,
                            name,
                        });
                    } catch (e) {
                        $.error(`${type} ${name} error: ${e.message ?? e}`);
                    }
                }),
            );
            $.info(`produceArtifacts ${type} 完成: ${names.join(', ')}`);
        }
    } catch (e) {
        $.error(`produceArtifacts error: ${e.message ?? e}`);
    }
}
async function doSync() {
    console.log(
        `
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
     Sub-Store Sync -- v${version}
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
`,
    );

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
                                prettyYaml: artifact.prettyYaml,
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
            $.notify(
                '🌍 Sub-Store',
                `同步配置成功 ${valid.length} 个, 失败 ${invalid.length} 个, 详情请查看日志`,
            );
        } else {
            $.notify('🌍 Sub-Store', '同步配置完成');
        }
    } catch (e) {
        $.notify('🌍 Sub-Store', '同步配置失败', `原因：${e.message ?? e}`);
        $.error(`无法同步配置到 Gist，原因：${e}`);
    }
}
