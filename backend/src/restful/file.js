import { deleteByName, findByName, updateByName } from '@/utils/database';
import { getFlowHeaders } from '@/utils/flow';
import { FILES_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import {
    RequestInvalidError,
    ResourceNotFoundError,
    InternalServerError,
} from '@/restful/errors';
import { produceArtifact } from '@/restful/sync';

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
    const file = req.body;
    file.name = `${file.name ?? Date.now()}`;
    $.info(`正在创建文件：${file.name}`);
    const allFiles = $.read(FILES_KEY);
    if (findByName(allFiles, file.name)) {
        return failed(
            res,
            new RequestInvalidError(
                'DUPLICATE_KEY',
                req.body.name
                    ? `已存在 name 为 ${file.name} 的文件`
                    : `无法同时创建相同的文件 可稍后重试`,
            ),
        );
    }
    allFiles.push(file);
    $.write(allFiles, FILES_KEY);
    success(res, file, 201);
}

async function getFile(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);

    $.info(`正在下载文件：${name}`);
    let {
        url,
        subInfoUrl,
        subInfoUserAgent,
        ua,
        content,
        mergeSources,
        ignoreFailedRemoteFile,
        proxy,
    } = req.query;
    let $options = {};
    if (req.query.$options) {
        try {
            // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
            $options = JSON.parse(decodeURIComponent(req.query.$options));
        } catch (e) {
            for (const pair of req.query.$options.split('&')) {
                const key = pair.split('=')[0];
                const value = pair.split('=')[1];
                // 部分兼容之前的逻辑 const value = pair.split('=')[1] || true;
                $options[key] =
                    value == null || value === ''
                        ? true
                        : decodeURIComponent(value);
            }
        }
        $.info(`传入 $options: ${JSON.stringify($options)}`);
    }
    if (url) {
        url = decodeURIComponent(url);
        $.info(`指定远程文件 URL: ${url}`);
    }
    if (proxy) {
        proxy = decodeURIComponent(proxy);
        $.info(`指定远程订阅使用代理/策略 proxy: ${proxy}`);
    }
    if (ua) {
        ua = decodeURIComponent(ua);
        $.info(`指定远程文件 User-Agent: ${ua}`);
    }
    if (subInfoUrl) {
        subInfoUrl = decodeURIComponent(subInfoUrl);
        $.info(`指定获取流量的 subInfoUrl: ${subInfoUrl}`);
    }
    if (subInfoUserAgent) {
        subInfoUserAgent = decodeURIComponent(subInfoUserAgent);
        $.info(`指定获取流量的 subInfoUserAgent: ${subInfoUserAgent}`);
    }
    if (content) {
        content = decodeURIComponent(content);
        $.info(`指定本地文件: ${content}`);
    }
    if (mergeSources) {
        mergeSources = decodeURIComponent(mergeSources);
        $.info(`指定合并来源: ${mergeSources}`);
    }
    if (ignoreFailedRemoteFile != null && ignoreFailedRemoteFile !== '') {
        ignoreFailedRemoteFile = decodeURIComponent(ignoreFailedRemoteFile);
        $.info(`指定忽略失败的远程文件: ${ignoreFailedRemoteFile}`);
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
                        res.set('subscription-userinfo', flowInfo);
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
            res.set('Content-Type', 'text/plain; charset=utf-8').send(
                output ?? '',
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
        $.error(`🌍 Sub-Store 下载文件失败`, `❌ 未找到文件：${name}！`);
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
    name = decodeURIComponent(name);
    const allFiles = $.read(FILES_KEY);
    const file = findByName(allFiles, name);
    if (file) {
        success(res, file);
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
    name = decodeURIComponent(name);
    let file = req.body;
    const allFiles = $.read(FILES_KEY);
    const oldFile = findByName(allFiles, name);
    if (oldFile) {
        const newFile = {
            ...oldFile,
            ...file,
        };
        $.info(`正在更新文件：${name}...`);

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
    let { name } = req.params;
    name = decodeURIComponent(name);
    $.info(`正在删除文件：${name}`);
    let allFiles = $.read(FILES_KEY);
    deleteByName(allFiles, name);
    $.write(allFiles, FILES_KEY);
    success(res);
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
