import { deleteByName, findByName, updateByName } from '@/utils/database';
import { FILES_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import { RequestInvalidError, ResourceNotFoundError } from '@/restful/errors';

export default function register($app) {
    if (!$.read(FILES_KEY)) $.write([], FILES_KEY);

    $app.route('/api/file/:name')
        .get(getFile)
        .patch(updateFile)
        .delete(deleteFile);

    $app.route('/api/files').get(getAllFiles).post(createFile).put(replaceFile);
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

function getFile(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const allFiles = $.read(FILES_KEY);
    const file = findByName(allFiles, name);
    if (file) {
        res.status(200).json(file.content);
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

function replaceFile(req, res) {
    const allFiles = req.body;
    $.write(allFiles, FILES_KEY);
    success(res);
}
