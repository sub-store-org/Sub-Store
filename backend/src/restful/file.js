import { deleteByName, findByName, updateByName } from '@/utils/database';
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
    let { url, ua, content, mergeSources, ignoreFailedRemoteFile } = req.query;
    if (url) {
        url = decodeURIComponent(url);
        $.info(`指定远程文件 URL: ${url}`);
    }
    if (ua) {
        ua = decodeURIComponent(ua);
        $.info(`指定远程文件 User-Agent: ${ua}`);
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
            });

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
        $.notify(`🌍 Sub-Store 下载文件失败`, `❌ 未找到文件：${name}！`);
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
