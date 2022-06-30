import { COLLECTIONS_KEY } from './constants';
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
    const allCol = $.read(COLLECTIONS_KEY);
    if (allCol[collection.name]) {
        res.status(500).json({
            status: 'failed',
            message: `订阅集${collection.name}已存在！`,
        });
    }
    allCol[collection.name] = collection;
    $.write(allCol, COLLECTIONS_KEY);
    res.status(201).json({
        status: 'success',
        data: collection,
    });
}

function getCollection(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const collection = $.read(COLLECTIONS_KEY)[name];
    if (collection) {
        res.json({
            status: 'success',
            data: collection,
        });
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
    const allCol = $.read(COLLECTIONS_KEY);
    if (allCol[name]) {
        const newCol = {
            ...allCol[name],
            ...collection,
        };
        $.info(`正在更新组合订阅：${name}...`);
        // allow users to update collection name
        delete allCol[name];
        allCol[collection.name || name] = newCol;
        $.write(allCol, COLLECTIONS_KEY);
        res.json({
            status: 'success',
            data: newCol,
        });
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
    let allCol = $.read(COLLECTIONS_KEY);
    delete allCol[name];
    $.write(allCol, COLLECTIONS_KEY);
    res.json({
        status: 'success',
    });
}

function getAllCollections(req, res) {
    const allCols = $.read(COLLECTIONS_KEY);
    res.json({
        status: 'success',
        data: allCols,
    });
}
