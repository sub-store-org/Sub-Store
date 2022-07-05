import { deleteByName, findByName, updateByName } from '@/utils/database';
import { COLLECTIONS_KEY } from '@/constants';
import { success } from '@/restful/response';
import $ from '@/core/app';

export default function register($app) {
    if (!$.read(COLLECTIONS_KEY)) $.write({}, COLLECTIONS_KEY);

    $app.route('/api/collection/:name')
        .get(getCollection)
        .patch(updateCollection)
        .delete(deleteCollection);

    $app.route('/api/collections')
        .get(getAllCollections)
        .post(createCollection);
}

// collection API
function createCollection(req, res) {
    const collection = req.body;
    $.info(`正在创建组合订阅：${collection.name}`);
    const allCols = $.read(COLLECTIONS_KEY);
    if (findByName(allCols, collection.name)) {
        res.status(500).json({
            status: 'failed',
            message: `订阅集${collection.name}已存在！`,
        });
    }
    allCols.push(collection);
    $.write(allCols, COLLECTIONS_KEY);
    success(res, collection, 201);
}

function getCollection(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const allCols = $.read(COLLECTIONS_KEY);
    const collection = findByName(allCols, name);
    if (collection) {
        success(res, collection);
    } else {
        res.status(404).json({
            status: 'failed',
            message: `未找到订阅集：${name}!`,
        });
    }
}

function updateCollection(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    let collection = req.body;
    const allCols = $.read(COLLECTIONS_KEY);
    const oldCol = findByName(allCols, name);
    if (oldCol) {
        const newCol = {
            ...oldCol,
            ...collection,
        };
        $.info(`正在更新组合订阅：${name}...`);
        updateByName(allCols, name, newCol);
        $.write(allCols, COLLECTIONS_KEY);
        success(res, newCol);
    } else {
        res.status(500).json({
            status: 'failed',
            message: `订阅集${name}不存在，无法更新！`,
        });
    }
}

function deleteCollection(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    $.info(`正在删除组合订阅：${name}`);
    let allCols = $.read(COLLECTIONS_KEY);
    deleteByName(allCols, name);
    $.write(allCols, COLLECTIONS_KEY);
    success(res);
}

function getAllCollections(req, res) {
    const allCols = $.read(COLLECTIONS_KEY);
    success(res, allCols);
}
