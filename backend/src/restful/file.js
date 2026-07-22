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
import { applyResponseTransformers } from '@/restful/response-transformer';
import {
    applyAgeOutputEncryption,
    resolveShareAgeConfig,
} from '@/restful/age-output';
import { findShareToken } from '@/restful/token';
import { maskAgeSecretInUrl, normalizeAgePublicKeyConfig } from '@/utils/age';
import { normalizeEditorLanguageConfig } from '@/utils/editor-language';
import {
    isMihomoConfigFile,
    normalizeFileConfig,
    normalizeFileType,
} from '@/utils/file-type';

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
    const isShareRoute = req.path?.startsWith('/share/');
    $.info(`正在下载文件：${name}\n请求 User-Agent: ${reqUA}`);
    let {
        url,
        subInfoUrl,
        subInfoUserAgent,
        ua,
        content,
        mergeSources,
        ignoreFailedRemoteFile,
        includeUnsupportedProxy,
        type: fileType,
        source: fileSource,
        sourceType,
        sourceName,
        mode,
        proxy,
        noCache,
        produceType,
        download,
        fakeFile: _fakeFile,
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
            socket: {
                remoteAddress: req.socket?.remoteAddress,
            },
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
    if (isShareRoute && _fakeFile) {
        $.warn(`分享链接禁止使用 fakeFile: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_FAKE_FILE',
                'share/file 不支持 fakeFile 参数',
            ),
            400,
        );
        return;
    }
    if (
        _fakeFile &&
        !canFakeFileResolveSource({
            content,
            fileType,
            sourceName,
            sourceType,
            url,
        })
    ) {
        $.warn(`fakeFile 缺少可用来源: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'INVALID_FAKE_FILE_SOURCE',
                'fakeFile 需要提供 content/url 或 mihomo 配置来源参数',
            ),
            400,
        );
        return;
    }
    if (
        isShareRoute &&
        ((url != null && url !== '') || (content != null && content !== ''))
    ) {
        $.warn(`分享链接禁止使用 url/content: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_FILE_SOURCE_OVERRIDE',
                'share/file 不支持 url 或 content 参数',
            ),
            400,
        );
        return;
    }
    if (
        isShareRoute &&
        hasAnyQueryValue([
            fileType,
            fileSource,
            sourceType,
            sourceName,
            mode,
        ])
    ) {
        $.warn(`分享链接禁止使用文件来源配置覆盖: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_FILE_RUNTIME_OVERRIDE',
                'share/file 不支持文件来源配置覆盖参数',
            ),
            400,
        );
        return;
    }
    if (isShareRoute && subInfoUrl != null && subInfoUrl !== '') {
        $.warn(`分享链接禁止使用 subInfoUrl: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_FILE_SUB_INFO_URL',
                'share/file 不支持 subInfoUrl 参数',
            ),
            400,
        );
        return;
    }
    if (isShareRoute && mergeSources) {
        $.warn(`分享链接禁止使用 mergeSources: ${name}`);
        failed(
            res,
            new RequestInvalidError(
                'UNSUPPORTED_SHARE_FILE_MERGE_SOURCES',
                'share/file 不支持 mergeSources 参数',
            ),
            400,
        );
        return;
    }
    if (url) {
        $.info(`指定远程文件 URL: ${maskAgeSecretInUrl(url)}`);
    }
    if (_fakeFile) {
        $.info(`使用假文件, 不再通过单个文件名称 ${name} 查询`);
    }
    if (proxy) {
        $.info(`指定远程文件使用代理/策略 proxy: ${proxy}`);
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
    if (fileType) {
        $.info(`指定文件类型: ${fileType}`);
    }
    if (fileSource) {
        $.info(`指定文件来源: ${fileSource}`);
    }
    if (sourceType) {
        $.info(`指定 mihomo 配置来源: ${sourceType}`);
    }
    if (sourceName) {
        $.info(`指定 mihomo 配置来源名称: ${sourceName}`);
    }
    if (mode) {
        $.info(`指定 mihomo 配置处理方式: ${mode}`);
    }
    if (download) {
        $.info('启用下载(文件名为显示名称)');
    }
    if (includeUnsupportedProxy != null && includeUnsupportedProxy !== '') {
        $.info(`包含官方/商店版不支持的协议: ${includeUnsupportedProxy}`);
    }

    const allFiles = $.read(FILES_KEY) || [];
    const fakeFile = {
        name: 'fakeFile',
        source: 'remote',
        url: '',
    };
    const file = _fakeFile ? fakeFile : findByName(allFiles, name);
    if (file) {
        try {
            const sourceFile = buildRuntimeFile(file, {
                content,
                download,
                fileSource,
                fileType,
                ignoreFailedRemoteFile,
                includeUnsupportedProxy,
                mergeSources,
                mode,
                noCache,
                sourceName,
                sourceType,
                produceType,
                proxy,
                subInfoUrl,
                subInfoUserAgent,
                ua,
                url,
            });
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
                file: sourceFile,
            });

            try {
                const flowSubInfoUrl = sourceFile.subInfoUrl;
                if (flowSubInfoUrl) {
                    // forward flow headers
                    const flowInfo = await getFlowHeaders(
                        flowSubInfoUrl,
                        sourceFile.subInfoUserAgent,
                        undefined,
                        sourceFile.proxy,
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
            if (sourceFile.download) {
                res.set(
                    'Content-Disposition',
                    `attachment; filename*=UTF-8''${encodeURIComponent(
                        sourceFile.displayName || sourceFile.name,
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
            const body = await applyResponseTransformers({
                res,
                body: output?.$content ?? '',
                process: sourceFile.process,
                source: { $file: sourceFile },
                $options: output?.$options ?? $options,
            });
            res.send(
                await applyAgeOutputEncryption({
                    res,
                    body,
                    configs: [
                        resolveShareAgeConfig({
                            req,
                            type: 'file',
                            name,
                            findShareToken,
                        }),
                        sourceFile,
                    ],
                }),
            );
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
                .set('access-control-expose-headers', 'content-disposition')
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
    const allFiles = $.read(FILES_KEY) || [];
    const oldFile = findByName(allFiles, name);
    if (oldFile) {
        if (!file.name) file.name = oldFile.name;
        const newFile = normalizeFileConfig({
            ...oldFile,
            ...file,
        });
        normalizeAgePublicKeyConfig(newFile);
        normalizeEditorLanguageConfig(newFile);
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
    const allFiles = $.read(FILES_KEY) || [];
    success(
        res, // eslint-disable-next-line no-unused-vars
        allFiles.map(({ content, ...rest }) => rest),
    );
}

function getAllWholeFiles(req, res) {
    const allFiles = $.read(FILES_KEY) || [];
    success(res, allFiles);
}

function replaceFile(req, res) {
    try {
        const allFiles = req.body.map(normalizeFileConfig);
        allFiles.forEach((file) => {
            normalizeAgePublicKeyConfig(file);
            normalizeEditorLanguageConfig(file);
        });
        $.write(allFiles, FILES_KEY);
        success(res);
    } catch (error) {
        failed(res, error);
    }
}

function createFileItem(rawFile) {
    const file = normalizeFileConfig({
        ...rawFile,
    });
    normalizeAgePublicKeyConfig(file);
    normalizeEditorLanguageConfig(file);
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
    const allFiles = $.read(FILES_KEY) || [];
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

function buildRuntimeFile(
    file,
    {
        content,
        download,
        fileSource,
        fileType,
        ignoreFailedRemoteFile,
        includeUnsupportedProxy,
        mergeSources,
        mode,
        noCache,
        produceType,
        proxy,
        sourceName,
        sourceType,
        subInfoUrl,
        subInfoUserAgent,
        ua,
        url,
    } = {},
) {
    const runtimeFile = { ...file };
    assignQueryOverride(runtimeFile, 'content', content);
    assignQueryOverride(runtimeFile, 'download', download);
    assignQueryOverride(
        runtimeFile,
        'ignoreFailedRemoteFile',
        ignoreFailedRemoteFile,
    );
    assignQueryOverride(runtimeFile, 'mergeSources', mergeSources);
    assignQueryOverride(runtimeFile, 'noCache', noCache);
    assignQueryOverride(runtimeFile, 'produceType', produceType);
    assignQueryOverride(runtimeFile, 'proxy', proxy);
    assignQueryOverride(runtimeFile, 'subInfoUrl', subInfoUrl);
    assignQueryOverride(runtimeFile, 'subInfoUserAgent', subInfoUserAgent);
    assignQueryOverride(runtimeFile, 'type', fileType);
    runtimeFile.type = normalizeFileType(runtimeFile.type);
    assignQueryOverride(runtimeFile, 'ua', ua);
    assignQueryOverride(runtimeFile, 'url', url);
    assignQueryOverride(runtimeFile, 'source', fileSource);

    const isMihomoConfig = isMihomoConfigFile(runtimeFile);
    if (isMihomoConfig) {
        assignQueryOverride(runtimeFile, 'sourceType', sourceType);
        assignQueryOverride(runtimeFile, 'sourceName', sourceName);
        assignQueryOverride(runtimeFile, 'mode', mode);
        if (!runtimeFile.sourceType) {
            if (hasQueryValue(url)) {
                runtimeFile.sourceType = 'remote';
            } else if (hasQueryValue(content)) {
                runtimeFile.sourceType = 'local';
            }
        }
    }

    assignQueryOverride(
        runtimeFile,
        'includeUnsupportedProxy',
        includeUnsupportedProxy,
    );

    return runtimeFile;
}

function canFakeFileResolveSource({
    content,
    fileType,
    sourceName,
    sourceType,
    url,
}) {
    if (hasAnyQueryValue([content, url])) return true;

    if (!isMihomoConfigFile(getLastQueryValue(fileType))) return false;

    const runtimeSourceType = getLastQueryValue(sourceType);
    if (runtimeSourceType === 'none') return true;
    return (
        ['subscription', 'collection'].includes(runtimeSourceType) &&
        hasQueryValue(sourceName)
    );
}

function assignQueryOverride(target, key, value) {
    if (!hasQueryValue(value)) return;
    target[key] = getLastQueryValue(value);
}

function getLastQueryValue(value) {
    return Array.isArray(value) ? value[value.length - 1] : value;
}

function hasQueryValue(value) {
    const normalized = getLastQueryValue(value);
    return normalized != null && normalized !== '';
}

function hasAnyQueryValue(values) {
    return values.some(hasQueryValue);
}

export { createFileItem, deleteFileItem };
