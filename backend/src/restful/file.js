import {
    deleteByName,
    findByName,
    insertByPosition,
    updateByName,
} from '@/utils/database';
import { getCreateItemPosition } from '@/utils/create-item-position';
import { getFlowHeaders, normalizeFlowHeader } from '@/utils/flow';
import { FILES_KEY, ARTIFACTS_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import {
    RequestInvalidError,
    ResourceNotFoundError,
    InternalServerError,
} from '@/restful/errors';
import { produceArtifact } from '@/restful/sync';
import { archiveFile } from '@/utils/archive';
import { formatDateTime } from '@/utils';

export default function register($app) {
    if (!$.read(FILES_KEY)) $.write([], FILES_KEY);

    $app.get('/share/file/:name', getFile);

    $app.route('/api/file/:name')
        .get(getFile)
        .patch(updateFile)
        .delete(deleteFile);

    $app.route('/api/wholeFile/:name').get(getWholeFile);

    $app.route('/api/files').get(getAllFiles).post(createFile).put(replaceFile);
    $app.route('/api/wholeFiles').get(getAllWholeFiles);
}

// file API
function createFile(req, res) {
    try {
        const file = createFileItem(req.body);
        success(res, file, 201);
    } catch (error) {
        failed(res, error);
    }
}

async function getFile(req, res, next) {
    let { name } = req.params;
    const reqUA = req.headers['user-agent'] || req.headers['User-Agent'];
    $.info(`正在下载文件：${name}\n请求 User-Agent: ${reqUA}`);
    let {
        url,
        subInfoUrl,
        subInfoUserAgent,
        ua,
        content,
        mergeSources,
        ignoreFailedRemoteFile,
        proxy,
        noCache,
        produceType,
    } = req.query;
    let $options = {
        _req: {
            method: req.method,
            url: req.url,
            path: req.path,
            query: req.query,
            params: req.params,
            headers: req.headers,
            body: req.body,
        },
    };
    if (req.query.$options) {
        let options = {};
        try {
            // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
            options = JSON.parse(decodeURIComponent(req.query.$options));
        } catch (e) {
            for (const pair of req.query.$options.split('&')) {
                const key = pair.split('=')[0];
                const value = pair.split('=')[1];
                // 部分兼容之前的逻辑 const value = pair.split('=')[1] || true;
                options[key] =
                    value == null || value === ''
                        ? true
                        : decodeURIComponent(value);
            }
        }
        $.info(`传入 $options: ${JSON.stringify(options)}`);
        Object.assign($options, options);
    }
    if (url) {
        $.info(`指定远程文件 URL: ${url}`);
    }
    if (proxy) {
        $.info(`指定远程订阅使用代理/策略 proxy: ${proxy}`);
    }
    if (ua) {
        $.info(`指定远程文件 User-Agent: ${ua}`);
    }
    if (subInfoUrl) {
        $.info(`指定获取流量的 subInfoUrl: ${subInfoUrl}`);
    }
    if (subInfoUserAgent) {
        $.info(`指定获取流量的 subInfoUserAgent: ${subInfoUserAgent}`);
    }
    if (content) {
        $.info(`指定本地文件: ${content}`);
    }
    if (mergeSources) {
        $.info(`指定合并来源: ${mergeSources}`);
    }
    if (ignoreFailedRemoteFile != null && ignoreFailedRemoteFile !== '') {
        $.info(`指定忽略失败的远程文件: ${ignoreFailedRemoteFile}`);
    }
    if (noCache) {
        $.info(`指定不使用缓存: ${noCache}`);
    }
    if (produceType) {
        $.info(`指定生产类型: ${produceType}`);
    }

    const allFiles = $.read(FILES_KEY);
    const file = findByName(allFiles, name);
    if (file) {
        try {
            const output = await produceArtifact({
                type: 'file',
                name,
                url,
                ua,
                content,
                mergeSources,
                ignoreFailedRemoteFile,
                $options,
                proxy,
                noCache,
                produceType,
                all: true,
            });

            try {
                subInfoUrl = subInfoUrl || file.subInfoUrl;
                if (subInfoUrl) {
                    // forward flow headers
                    const flowInfo = await getFlowHeaders(
                        subInfoUrl,
                        subInfoUserAgent || file.subInfoUserAgent,
                        undefined,
                        proxy || file.proxy,
                    );
                    if (flowInfo) {
                        const headers = normalizeFlowHeader(flowInfo, true);
                        if (headers?.['subscription-userinfo']) {
                            res.set(
                                'subscription-userinfo',
                                headers['subscription-userinfo'],
                            );
                        }
                        if (headers?.['profile-web-page-url']) {
                            res.set(
                                'profile-web-page-url',
                                headers['profile-web-page-url'],
                            );
                        }
                        if (headers?.['plan-name']) {
                            res.set('plan-name', headers['plan-name']);
                        }
                    }
                }
            } catch (err) {
                $.error(
                    `文件 ${name} 获取流量信息时发生错误: ${JSON.stringify(
                        err,
                    )}`,
                );
            }
            if (file.download) {
                res.set(
                    'Content-Disposition',
                    `attachment; filename*=UTF-8''${encodeURIComponent(
                        file.displayName || file.name,
                    )}`,
                );
            }
            res.set('Content-Type', 'text/plain; charset=utf-8');
            if (output?.$options?._res?.headers) {
                Object.entries(output.$options._res.headers).forEach(
                    ([key, value]) => {
                        if (value == null) {
                            res.removeHeader(key);
                        } else {
                            res.set(key, value);
                        }
                    },
                );
            }
            if (output?.$options?._res?.status) {
                res.status(output.$options._res.status);
            }
            res.send(output?.$content ?? '');
        } catch (err) {
            $.notify(
                `🌍 Sub-Store 下载文件失败`,
                `❌ 无法下载文件：${name}！`,
                `🤔 原因：${err.message ?? err}`,
            );
            $.error(err.message ?? err);
            failed(
                res,
                new InternalServerError(
                    'INTERNAL_SERVER_ERROR',
                    `Failed to download file: ${name}`,
                    `Reason: ${err.message ?? err}`,
                ),
            );
        }
    } else {
        $.error(`🌍 Sub-Store 下载文件失败\n❌ 未找到文件：${name}！`);
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `File ${name} does not exist!`,
            ),
            404,
        );
    }
}
function getWholeFile(req, res) {
    let { name } = req.params;
    let { raw } = req.query;
    const allFiles = $.read(FILES_KEY);
    const file = findByName(allFiles, name);
    if (file) {
        if (raw) {
            res.set('content-type', 'application/json')
                .set(
                    'content-disposition',
                    `attachment; filename="${encodeURIComponent(
                        `sub-store_file_${name}_${formatDateTime(
                            new Date(),
                        )}.json`,
                    )}"`,
                )
                .send(JSON.stringify(file));
        } else {
            success(res, file);
        }
    } else {
        failed(
            res,
            new ResourceNotFoundError(
                `FILE_NOT_FOUND`,
                `File ${name} does not exist`,
                404,
            ),
        );
    }
}

function updateFile(req, res) {
    let { name } = req.params;
    let file = req.body;
    const allFiles = $.read(FILES_KEY);
    const oldFile = findByName(allFiles, name);
    if (oldFile) {
        if (!file.name) file.name = oldFile.name;
        const newFile = {
            ...oldFile,
            ...file,
        };
        $.info(`正在更新文件：${name}...`);

        if (name !== newFile.name) {
            // update all artifacts referring this collection
            const allArtifacts = $.read(ARTIFACTS_KEY) || [];
            for (const artifact of allArtifacts) {
                if (
                    artifact.type === 'file' &&
                    artifact.source === oldFile.name
                ) {
                    artifact.source = newFile.name;
                }
            }
            $.write(allArtifacts, ARTIFACTS_KEY);
        }

        updateByName(allFiles, name, newFile);
        $.write(allFiles, FILES_KEY);
        success(res, newFile);
    } else {
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `File ${name} does not exist!`,
            ),
            404,
        );
    }
}

function deleteFile(req, res) {
    try {
        let { name } = req.params;
        $.info(`正在删除文件：${name}`);
        if (shouldArchiveDeletion(req.query.mode)) {
            archiveFile(name);
        }
        deleteFileItem(name);
        success(res);
    } catch (error) {
        failed(res, error);
    }
}

function getAllFiles(req, res) {
    const allFiles = $.read(FILES_KEY);
    success(
        res, // eslint-disable-next-line no-unused-vars
        allFiles.map(({ content, ...rest }) => rest),
    );
}

function getAllWholeFiles(req, res) {
    const allFiles = $.read(FILES_KEY);
    success(res, allFiles);
}

function replaceFile(req, res) {
    const allFiles = req.body;
    $.write(allFiles, FILES_KEY);
    success(res);
}

function createFileItem(rawFile) {
    const file = {
        ...rawFile,
    };
    file.name = `${file.name ?? Date.now()}`;
    $.info(`正在创建文件：${file.name}`);
    const allFiles = $.read(FILES_KEY);
    if (findByName(allFiles, file.name)) {
        throw new RequestInvalidError(
            'DUPLICATE_KEY',
            rawFile.name
                ? `已存在 name 为 ${file.name} 的文件`
                : `无法同时创建相同的文件 可稍后重试`,
        );
    }
    insertByPosition(allFiles, file, getCreateItemPosition());
    $.write(allFiles, FILES_KEY);
    return file;
}

function deleteFileItem(name) {
    const allFiles = $.read(FILES_KEY);
    const file = findByName(allFiles, name);
    if (!file) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `File ${name} does not exist!`,
        );
    }
    deleteByName(allFiles, name);
    $.write(allFiles, FILES_KEY);
    return file;
}

function shouldArchiveDeletion(mode) {
    if (mode == null || mode === '' || mode === 'permanent') {
        return false;
    }
    if (mode === 'archive') {
        return true;
    }
    throw new RequestInvalidError(
        'INVALID_DELETE_MODE',
        `Unsupported delete mode: ${mode}`,
    );
}

export { createFileItem, deleteFileItem };
