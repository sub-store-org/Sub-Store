import { deleteByName, findByName, updateByName } from '@/utils/database';
import { COLLECTIONS_KEY, ARTIFACTS_KEY, FILES_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import { RequestInvalidError, ResourceNotFoundError } from '@/restful/errors';
import { formatDateTime } from '@/utils';

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
    let { raw } = req.query;
    const allCols = $.read(COLLECTIONS_KEY);
    const collection = findByName(allCols, name);
    if (collection) {
        if (raw) {
            res.set('content-type', 'application/json')
                .set(
                    'content-disposition',
                    `attachment; filename="${encodeURIComponent(
                        `sub-store_collection_${name}_${formatDateTime(
                            new Date(),
                        )}.json`,
                    )}"`,
                )
                .send(JSON.stringify(collection));
        } else {
            success(res, collection);
        }
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
            // update all files referring this collection
            const allFiles = $.read(FILES_KEY) || [];
            for (const file of allFiles) {
                if (
                    file.sourceType === 'collection' &&
                    file.sourceName === oldCol.name
                ) {
                    file.sourceName = newCol.name;
                }
            }
            $.write(allArtifacts, ARTIFACTS_KEY);
            $.write(allFiles, FILES_KEY);
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
