import {
    ARTIFACTS_KEY,
    SUBS_KEY,
    COLLECTIONS_KEY,
    RULES_KEY,
} from '@/restful/constants';
import { syncArtifact, produceArtifact } from '@/restful/artifacts';
import $ from '@/core/app';

console.log(
    `
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
            𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 © 𝑷𝒆𝒏𝒈-𝒀𝑴
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
`,
);
!(async function () {
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
        $.notify('🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』', '全部订阅同步成功！');
    } catch (err) {
        $.notify('🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』', '同步订阅失败', `原因：${err}`);
        $.error(`无法同步订阅配置到 Gist，原因：${err}`);
    }
})().finally(() => $.done());
