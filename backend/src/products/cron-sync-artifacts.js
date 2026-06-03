import { version } from '../../package.json';
import {
    SETTINGS_KEY,
    ARTIFACTS_KEY,
    SUBS_KEY,
    COLLECTIONS_KEY,
} from '@/constants';
import $ from '@/core/app';
import {
    markArtifactProducedWithoutUpload,
    produceArtifact,
    produceSyncArtifactOutput,
    shouldUploadArtifact,
    uploadArtifactBatches,
} from '@/restful/sync';
import { findByName } from '@/utils/database';
import {
    resolveCronArtifactSyncPolicy,
    shouldSkipCronArtifactWithoutUploadCredentials,
} from '@/utils/artifact-sync-policy';

!(async function () {
    let arg;
    if (typeof $argument != 'undefined') {
        // eslint-disable-next-line no-undef
        arg = parseArgument($argument);
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
        const artifacts = $.read(ARTIFACTS_KEY);
        if (!artifacts || artifacts.length === 0) return;

        const policy = resolveCronArtifactSyncPolicy({ artifacts, settings });

        if (policy.shouldRun) await doSync(arg, policy);
    }
})().finally(() => $.done());

function parseArgument(rawArgument) {
    if (rawArgument == null) return {};
    if (typeof rawArgument === 'object') return rawArgument;
    return Object.fromEntries(
        `${rawArgument}`
            .split('&')
            .filter(Boolean)
            .map((item) => {
                const [key, ...value] = item.split('=');
                return [key, value.join('=')];
            }),
    );
}

function isTruthyArgument(value, defaultValue = true) {
    if (value == null || value === '') return defaultValue;
    const normalized = `${value}`
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase();
    return !['false', '0', 'no', 'off'].includes(normalized);
}

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
async function doSync(arg = {}, { canUpload = true } = {}) {
    const syncSuccessNotify = isTruthyArgument(arg.sync_success_notify);
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
        const producedWithoutUpload = [];
        const skippedWithoutUploadCredentials = [];
        const allSubs = $.read(SUBS_KEY);
        const allCols = $.read(COLLECTIONS_KEY);
        const subNames = [];
        let enabledCount = 0;
        allArtifacts.map((artifact) => {
            if (artifact.sync && artifact.source) {
                enabledCount++;
                if (
                    shouldSkipCronArtifactWithoutUploadCredentials(artifact, {
                        canUpload,
                    })
                ) {
                    return;
                }
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
                        if (
                            shouldSkipCronArtifactWithoutUploadCredentials(
                                artifact,
                                { canUpload },
                            )
                        ) {
                            skippedWithoutUploadCredentials.push(artifact.name);
                            return;
                        }

                        $.info(`正在同步云配置：${artifact.name}...`);

                        const useMihomoExternal =
                            artifact.platform === 'SurgeMac';

                        if (useMihomoExternal) {
                            $.info(
                                `手动指定了 target 为 SurgeMac, 将使用 Mihomo External`,
                            );
                        }
                        const output = await produceSyncArtifactOutput(
                            artifact,
                        );

                        // if (!output || output.length === 0)
                        //     throw new Error('该配置的结果为空 不进行上传');

                        if (shouldUploadArtifact(artifact)) {
                            files[encodeURIComponent(artifact.name)] = {
                                content: output,
                            };
                            valid.push(artifact.name);
                        } else {
                            markArtifactProducedWithoutUpload(artifact);
                            producedWithoutUpload.push(artifact.name);
                        }
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

        const producedCount = valid.length + producedWithoutUpload.length;
        $.info(
            `${producedCount} 个同步配置生成成功: ${valid
                .concat(producedWithoutUpload)
                .join(', ')}`,
        );
        $.info(`${invalid.length} 个同步配置生成失败: ${invalid.join(', ')}`);
        if (producedWithoutUpload.length > 0) {
            $.info(
                `${
                    producedWithoutUpload.length
                } 个同步配置仅生成未上传: ${producedWithoutUpload.join(', ')}`,
            );
        }
        if (skippedWithoutUploadCredentials.length > 0) {
            $.info(
                `${
                    skippedWithoutUploadCredentials.length
                } 个同步配置因未设置 GitHub Token 已跳过上传: ${skippedWithoutUploadCredentials.join(
                    ', ',
                )}`,
            );
        }

        if (producedCount === 0) {
            throw new Error(
                `同步配置 ${invalid.join(', ')} 生成失败 详情请查看日志`,
            );
        }

        const uploaded = await uploadArtifactBatches({
            allArtifacts,
            files,
            valid,
            invalid,
        });

        $.write(allArtifacts, ARTIFACTS_KEY);
        $.info('同步配置执行完成');

        if (invalid.length > 0) {
            $.notify(
                '🌍 Sub-Store',
                `同步配置成功 ${
                    uploaded.length + producedWithoutUpload.length
                } 个, 失败 ${invalid.length} 个${
                    skippedWithoutUploadCredentials.length
                        ? `, 跳过 ${skippedWithoutUploadCredentials.length} 个需上传配置`
                        : ''
                }, 详情请查看日志`,
            );
        } else if (syncSuccessNotify) {
            $.notify(
                '🌍 Sub-Store',
                '同步配置完成',
                skippedWithoutUploadCredentials.length
                    ? `已跳过 ${skippedWithoutUploadCredentials.length} 个需上传配置（未设置 GitHub Token）`
                    : undefined,
            );
        }
    } catch (e) {
        $.notify('🌍 Sub-Store', '同步配置失败', `原因：${e.message ?? e}`);
        $.error(`无法同步配置到 Gist，原因：${e.stack ?? e.message ?? e}`);
    }
}
