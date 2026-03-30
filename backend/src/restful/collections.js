import {
    deleteByName,
    findByName,
    insertByPosition,
    updateByName,
} from '@/utils/database';
import { getCreateItemPosition } from '@/utils/create-item-position';
import { COLLECTIONS_KEY, ARTIFACTS_KEY, FILES_KEY } from '@/constants';
import { archiveCollection } from '@/utils/archive';
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
    try {
        const collection = createCollectionItem(req.body);
        success(res, collection, 201);
    } catch (error) {
        failed(res, error);
    }
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
        if (!collection.name) collection.name = oldCol.name;
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
    try {
        let { name } = req.params;
        $.info(`正在删除组合订阅：${name}`);
        if (shouldArchiveDeletion(req.query.mode)) {
            archiveCollection(name);
        }
        deleteCollectionItem(name);
        success(res);
    } catch (error) {
        failed(res, error);
    }
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

function createCollectionItem(collection) {
    $.info(`正在创建组合订阅：${collection.name}`);
    if (/\//.test(collection.name)) {
        throw new RequestInvalidError(
            'INVALID_NAME',
            `Collection ${collection.name} is invalid`,
        );
    }
    const allCols = $.read(COLLECTIONS_KEY);
    if (findByName(allCols, collection.name)) {
        throw new RequestInvalidError(
            'DUPLICATE_KEY',
            `Collection ${collection.name} already exists.`,
        );
    }
    insertByPosition(allCols, collection, getCreateItemPosition());
    $.write(allCols, COLLECTIONS_KEY);
    return collection;
}

function deleteCollectionItem(name) {
    const allCols = $.read(COLLECTIONS_KEY);
    const collection = findByName(allCols, name);
    if (!collection) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `Collection ${name} does not exist!`,
        );
    }
    deleteByName(allCols, name);
    $.write(allCols, COLLECTIONS_KEY);
    return collection;
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

export { createCollectionItem, deleteCollectionItem };
