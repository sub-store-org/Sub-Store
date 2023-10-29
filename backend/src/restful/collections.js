import { deleteByName, findByName, updateByName } from '@/utils/database';
import { COLLECTIONS_KEY, ARTIFACTS_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import { RequestInvalidError, ResourceNotFoundError } from '@/restful/errors';

export default function register($app) {
    if (!$.read(COLLECTIONS_KEY)) $.write({}, COLLECTIONS_KEY);

    $app.route('/api/collection/:name')
        .get(getCollection)
        .patch(updateCollection)
        .delete(deleteCollection);

    $app.route('/api/collections')
        .get(getAllCollections)
        .post(createCollection)
        .put(replaceCollection);
}

// collection API
function createCollection(req, res) {
    const collection = req.body;
    $.info(`正在创建组合订阅：${collection.name}`);
    if (/\//.test(collection.name)) {
        failed(
            res,
            new RequestInvalidError(
                'INVALID_NAME',
                `Collection ${collection.name} is invalid`,
            ),
        );
        return;
    }
    const allCols = $.read(COLLECTIONS_KEY);
    if (findByName(allCols, collection.name)) {
        failed(
            res,
            new RequestInvalidError(
                'DUPLICATE_KEY',
                `Collection ${collection.name} already exists.`,
            ),
        );
        return;
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
        failed(
            res,
            new ResourceNotFoundError(
                `SUBSCRIPTION_NOT_FOUND`,
                `Collection ${name} does not exist`,
                404,
            ),
        );
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

        if (name !== newCol.name) {
            // update all artifacts referring this collection
            const allArtifacts = $.read(ARTIFACTS_KEY) || [];
            for (const artifact of allArtifacts) {
                if (
                    artifact.type === 'collection' &&
                    artifact.source === oldCol.name
                ) {
                    artifact.source = newCol.name;
                }
            }
            $.write(allArtifacts, ARTIFACTS_KEY);
        }

        updateByName(allCols, name, newCol);
        $.write(allCols, COLLECTIONS_KEY);
        success(res, newCol);
    } else {
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Collection ${name} does not exist!`,
            ),
            404,
        );
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

function replaceCollection(req, res) {
    const allCols = req.body;
    $.write(allCols, COLLECTIONS_KEY);
    success(res);
}
