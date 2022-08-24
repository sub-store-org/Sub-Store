import { version } from '../../package.json';
import { SETTINGS_KEY, ARTIFACTS_KEY } from '@/constants';
import $ from '@/core/app';
import { produceArtifact } from '@/restful/sync';
import { syncToGist } from '@/restful/artifacts';

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
        $.notify('🌍 Sub-Store', '全部订阅同步成功！');
    } catch (err) {
        $.notify('🌍 Sub-Store', '同步订阅失败', `原因：${err}`);
        $.error(`无法同步订阅配置到 Gist，原因：${err}`);
    }
}
