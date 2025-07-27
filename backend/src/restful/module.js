import { deleteByName, findByName, updateByName } from '@/utils/database';
import { MODULES_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import { RequestInvalidError, ResourceNotFoundError } from '@/restful/errors';
import { hex_md5 } from '@/vendor/md5';

export default function register($app) {
    if (!$.read(MODULES_KEY)) $.write([], MODULES_KEY);

    $app.route('/api/module/:name')
        .get(getModule)
        .patch(updateModule)
        .delete(deleteModule);

    $app.route('/api/modules')
        .get(getAllModules)
        .post(createModule)
        .put(replaceModule);
}

// module API
function createModule(req, res) {
    const module = req.body;
    module.name = `${module.name ?? hex_md5(JSON.stringify(module))}`;
    $.info(`正在创建模块：${module.name}`);
    const allModules = $.read(MODULES_KEY);
    if (findByName(allModules, module.name)) {
        return failed(
            res,
            new RequestInvalidError(
                'DUPLICATE_KEY',
                req.body.name
                    ? `已存在 name 为 ${module.name} 的模块`
                    : `已存在相同的模块 请勿重复添加`,
            ),
        );
    }
    allModules.push(module);
    $.write(allModules, MODULES_KEY);
    success(res, module, 201);
}

function getModule(req, res) {
    let { name } = req.params;
    const allModules = $.read(MODULES_KEY);
    const module = findByName(allModules, name);
    if (module) {
        res.set('Content-Type', 'text/plain; charset=utf-8').send(
            module.content,
        );
    } else {
        failed(
            res,
            new ResourceNotFoundError(
                `MODULE_NOT_FOUND`,
                `Module ${name} does not exist`,
                404,
            ),
        );
    }
}

function updateModule(req, res) {
    let { name } = req.params;
    let module = req.body;
    const allModules = $.read(MODULES_KEY);
    const oldModule = findByName(allModules, name);
    if (oldModule) {
        const newModule = {
            ...oldModule,
            ...module,
        };
        $.info(`正在更新模块：${name}...`);

        updateByName(allModules, name, newModule);
        $.write(allModules, MODULES_KEY);
        success(res, newModule);
    } else {
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Module ${name} does not exist!`,
            ),
            404,
        );
    }
}

function deleteModule(req, res) {
    let { name } = req.params;
    $.info(`正在删除模块：${name}`);
    let allModules = $.read(MODULES_KEY);
    deleteByName(allModules, name);
    $.write(allModules, MODULES_KEY);
    success(res);
}

function getAllModules(req, res) {
    const allModules = $.read(MODULES_KEY);
    success(
        res,
        // eslint-disable-next-line no-unused-vars
        allModules.map(({ content, ...rest }) => rest),
    );
}

function replaceModule(req, res) {
    const allModules = req.body;
    $.write(allModules, MODULES_KEY);
    success(res);
}
