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
    const settings = $.read(SETTINGS_KEY);
    // if GitHub token is not configured
    if (!settings.githubUser || !settings.gistToken) return;

    const artifacts = $.read(ARTIFACTS_KEY);
    if (!artifacts || artifacts.length === 0) return;

    const shouldSync = artifacts.some((artifact) => artifact.sync);
    if (shouldSync) await doSync();
})().finally(() => $.done());

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
        const invalid = [];
        const allSubs = $.read(SUBS_KEY);
        const allCols = $.read(COLLECTIONS_KEY);
        const subNames = [];
        allArtifacts.map((artifact) => {
            if (artifact.sync && artifact.source) {
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

        if (subNames.length > 0) {
            await Promise.all(
                subNames.map(async (subName) => {
                    try {
                        await produceArtifact({
                            type: 'subscription',
                            name: subName,
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
                        const output = await produceArtifact({
                            type: artifact.type,
                            name: artifact.source,
                            platform: artifact.platform,
                            produceOpts: {
                                'include-unsupported-proxy':
                                    artifact.includeUnsupportedProxy,
                            },
                        });

                        // if (!output || output.length === 0)
                        //     throw new Error('该配置的结果为空 不进行上传');

                        files[encodeURIComponent(artifact.name)] = {
                            content: output,
                        };
                    }
                } catch (e) {
                    $.error(
                        `同步配置 ${artifact.name} 发生错误: ${e.message ?? e}`,
                    );
                    invalid.push(artifact.name);
                }
            }),
        );

        if (invalid.length > 0) {
            throw new Error(
                `同步配置 ${invalid.join(', ')} 发生错误 详情请查看日志`,
            );
        }

        const resp = await syncToGist(files);
        const body = JSON.parse(resp.body);

        for (const artifact of allArtifacts) {
            if (artifact.sync) {
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
                const url = files[encodeURIComponent(artifact.name)]?.raw_url;
                artifact.url = isGitLab
                    ? url
                    : url?.replace(/\/raw\/[^/]*\/(.*)/, '/raw/$1');
            }
        }

        $.write(allArtifacts, ARTIFACTS_KEY);
        $.notify('🌍 Sub-Store', '全部订阅同步成功！');
    } catch (e) {
        $.notify('🌍 Sub-Store', '同步订阅失败', `原因：${e.message ?? e}`);
        $.error(`无法同步订阅配置到 Gist，原因：${e}`);
    }
}
