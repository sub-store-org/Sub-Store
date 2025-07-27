import $ from '@/core/app';

import {
    ARTIFACT_REPOSITORY_KEY,
    ARTIFACTS_KEY,
    SETTINGS_KEY,
} from '@/constants';
import { deleteByName, findByName, updateByName } from '@/utils/database';
import { failed, success } from '@/restful/response';
import {
    InternalServerError,
    RequestInvalidError,
    ResourceNotFoundError,
} from '@/restful/errors';
import Gist from '@/utils/gist';

export default function register($app) {
    // Initialization
    if (!$.read(ARTIFACTS_KEY)) $.write({}, ARTIFACTS_KEY);

    // RESTful APIs
    $app.get('/api/artifacts/restore', restoreArtifacts);

    $app.route('/api/artifacts')
        .get(getAllArtifacts)
        .post(createArtifact)
        .put(replaceArtifact);

    $app.route('/api/artifact/:name')
        .get(getArtifact)
        .patch(updateArtifact)
        .delete(deleteArtifact);
}

async function restoreArtifacts(_, res) {
    $.info('开始恢复远程配置...');
    try {
        const { gistToken, syncPlatform } = $.read(SETTINGS_KEY);
        if (!gistToken) {
            return Promise.reject('未设置 GitHub Token！');
        }
        const manager = new Gist({
            token: gistToken,
            key: ARTIFACT_REPOSITORY_KEY,
            syncPlatform,
        });

        try {
            const gist = await manager.locate();
            if (!gist?.files) {
                throw new Error(`找不到 Sub-Store Gist 文件列表`);
            }
            const allArtifacts = $.read(ARTIFACTS_KEY);
            const failed = [];
            Object.keys(gist.files).map((key) => {
                const filename = gist.files[key]?.filename;
                if (filename) {
                    if (encodeURIComponent(filename) !== filename) {
                        $.error(`文件名 ${filename} 未编码 不保存`);
                        failed.push(filename);
                    } else {
                        const artifact = findByName(allArtifacts, filename);
                        if (artifact) {
                            updateByName(allArtifacts, filename, {
                                ...artifact,
                                url: gist.files[key]?.raw_url.replace(
                                    /\/raw\/[^/]*\/(.*)/,
                                    '/raw/$1',
                                ),
                            });
                        } else {
                            allArtifacts.push({
                                name: `${filename}`,
                                url: gist.files[key]?.raw_url.replace(
                                    /\/raw\/[^/]*\/(.*)/,
                                    '/raw/$1',
                                ),
                            });
                        }
                    }
                }
            });
            $.write(allArtifacts, ARTIFACTS_KEY);
        } catch (err) {
            $.error(`查找 Sub-Store Gist 时发生错误: ${err.message ?? err}`);
            throw err;
        }
        success(res);
    } catch (e) {
        $.error(`恢复远程配置失败，原因：${e.message ?? e}`);
        failed(
            res,
            new InternalServerError(
                `FAILED_TO_RESTORE_ARTIFACTS`,
                `Failed to restore artifacts`,
                `Reason: ${e.message ?? e}`,
            ),
        );
    }
}

function getAllArtifacts(req, res) {
    const allArtifacts = $.read(ARTIFACTS_KEY);
    success(res, allArtifacts);
}

function replaceArtifact(req, res) {
    const allArtifacts = req.body;
    $.write(allArtifacts, ARTIFACTS_KEY);
    success(res);
}

async function getArtifact(req, res) {
    let { name } = req.params;
    const allArtifacts = $.read(ARTIFACTS_KEY);
    const artifact = findByName(allArtifacts, name);

    if (artifact) {
        success(res, artifact);
    } else {
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Artifact ${name} does not exist!`,
            ),
            404,
        );
    }
}

function createArtifact(req, res) {
    const artifact = req.body;
    if (!validateArtifactName(artifact.name)) {
        failed(
            res,
            new RequestInvalidError(
                'INVALID_ARTIFACT_NAME',
                `Artifact name ${artifact.name} is invalid.`,
            ),
        );
        return;
    }

    $.info(`正在创建远程配置：${artifact.name}`);
    const allArtifacts = $.read(ARTIFACTS_KEY);
    if (findByName(allArtifacts, artifact.name)) {
        failed(
            res,
            new RequestInvalidError(
                'DUPLICATE_KEY',
                `Artifact ${artifact.name} already exists.`,
            ),
        );
    } else {
        allArtifacts.push(artifact);
        $.write(allArtifacts, ARTIFACTS_KEY);
        success(res, artifact, 201);
    }
}

function updateArtifact(req, res) {
    const allArtifacts = $.read(ARTIFACTS_KEY);
    let oldName = req.params.name;
    const artifact = findByName(allArtifacts, oldName);
    if (artifact) {
        $.info(`正在更新远程配置：${artifact.name}`);
        const newArtifact = {
            ...artifact,
            ...req.body,
        };
        if (!validateArtifactName(newArtifact.name)) {
            failed(
                res,
                new RequestInvalidError(
                    'INVALID_ARTIFACT_NAME',
                    `Artifact name ${newArtifact.name} is invalid.`,
                ),
            );
            return;
        }
        updateByName(allArtifacts, oldName, newArtifact);
        $.write(allArtifacts, ARTIFACTS_KEY);
        success(res, newArtifact);
    } else {
        failed(
            res,
            new RequestInvalidError(
                'DUPLICATE_KEY',
                `Artifact ${oldName} already exists.`,
            ),
        );
    }
}

async function deleteArtifact(req, res) {
    let { name } = req.params;
    $.info(`正在删除远程配置：${name}`);
    const allArtifacts = $.read(ARTIFACTS_KEY);
    try {
        const artifact = findByName(allArtifacts, name);
        if (!artifact) throw new Error(`远程配置：${name}不存在！`);
        if (artifact.updated) {
            // delete gist
            const files = {};
            files[encodeURIComponent(artifact.name)] = {
                content: '',
            };
            if (encodeURIComponent(artifact.name) !== artifact.name) {
                files[artifact.name] = {
                    content: '',
                };
            }

            // 当别的Sub 删了同步订阅 或 gist里面删了 当前设备没有删除 时 无法删除的bug
            try {
                await syncToGist(files);
            } catch (i) {
                $.error(`Function syncToGist: ${name} : ${i}`);
            }
        }
        // delete local cache
        deleteByName(allArtifacts, name);
        $.write(allArtifacts, ARTIFACTS_KEY);
        success(res);
    } catch (err) {
        $.error(`无法删除远程配置：${name}，原因：${err}`);
        failed(
            res,
            new InternalServerError(
                `FAILED_TO_DELETE_ARTIFACT`,
                `Failed to delete artifact ${name}`,
                `Reason: ${err}`,
            ),
        );
    }
}

function validateArtifactName(name) {
    return /^[a-zA-Z0-9._-]*$/.test(name);
}

async function syncToGist(files) {
    const { gistToken, syncPlatform } = $.read(SETTINGS_KEY);
    if (!gistToken) {
        return Promise.reject('未设置 GitHub Token！');
    }
    const manager = new Gist({
        token: gistToken,
        key: ARTIFACT_REPOSITORY_KEY,
        syncPlatform,
    });
    const res = await manager.upload(files);
    let body = {};
    try {
        body = JSON.parse(res.body);
        // eslint-disable-next-line no-empty
    } catch (e) {}

    const url = body?.html_url ?? body?.web_url;
    const settings = $.read(SETTINGS_KEY);
    if (url) {
        $.log(`同步 Gist 后, 找到 Sub-Store Gist: ${url}`);
        settings.artifactStore = url;
        settings.artifactStoreStatus = 'VALID';
    } else {
        $.error(`同步 Gist 后, 找不到 Sub-Store Gist`);
        settings.artifactStoreStatus = 'NOT FOUND';
    }
    $.write(settings, SETTINGS_KEY);
    return res;
}

export { syncToGist };
