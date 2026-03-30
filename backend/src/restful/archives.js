import { failed, success } from '@/restful/response';
import {
    InternalServerError,
    RequestInvalidError,
    ResourceNotFoundError,
} from '@/restful/errors';
import {
    ensureArchiveStore,
    getArchiveEntries,
    getRequiredArchiveEntry,
    removeArchiveEntry,
} from '@/utils/archive';
import { createSubscriptionItem } from '@/restful/subscriptions';
import { createCollectionItem } from '@/restful/collections';
import { createFileItem } from '@/restful/file';
import { createArtifactItem } from '@/restful/artifacts';
import { createTokenItem } from '@/restful/token';

export default function register($app) {
    ensureArchiveStore();

    $app.route('/api/archives').get(getAllArchiveEntries);
    $app.route('/api/archives/:id')
        .get(getArchiveDetail)
        .delete(deleteArchiveEntry);
    $app.post('/api/archives/:id/restore', restoreArchiveEntry);
}

function getAllArchiveEntries(_, res) {
    success(res, getArchiveEntries());
}

function getArchiveDetail(req, res) {
    try {
        success(res, getRequiredArchiveEntry(req.params.id));
    } catch (error) {
        failed(res, error, error instanceof ResourceNotFoundError ? 404 : 500);
    }
}

function deleteArchiveEntry(req, res) {
    try {
        const entry = removeArchiveEntry(req.params.id);
        success(res, entry);
    } catch (error) {
        failed(res, error, error instanceof ResourceNotFoundError ? 404 : 500);
    }
}

function restoreArchiveEntry(req, res) {
    try {
        const entry = getRequiredArchiveEntry(req.params.id);
        const restored = restoreArchivedEntry(entry);
        removeArchiveEntry(req.params.id);
        success(res, restored);
    } catch (error) {
        const mappedError =
            error instanceof RequestInvalidError ||
            error instanceof ResourceNotFoundError
                ? error
                : new InternalServerError(
                      'ARCHIVE_RESTORE_FAILED',
                      'Failed to restore archive entry',
                      `Reason: ${error.message ?? error}`,
                  );
        const statusCode =
            mappedError instanceof ResourceNotFoundError
                ? 404
                : mappedError instanceof RequestInvalidError
                  ? 400
                  : 500;
        failed(
            res,
            mappedError,
            statusCode,
        );
    }
}

function restoreArchivedEntry(entry) {
    const snapshot = JSON.parse(JSON.stringify(entry.snapshot));
    switch (entry.itemType) {
        case 'sub':
            return createSubscriptionItem(snapshot);
        case 'col':
            return createCollectionItem(snapshot);
        case 'file':
            return createFileItem(snapshot);
        case 'artifact':
            return createArtifactItem(normalizeArtifactSnapshotForRestore(snapshot));
        case 'share':
            return createTokenItem(snapshot, {
                expiresIn: snapshot.expiresIn,
            });
        default:
            throw new RequestInvalidError(
                'INVALID_ARCHIVE_TYPE',
                `Unsupported archive item type: ${entry.itemType}`,
            );
    }
}

function normalizeArtifactSnapshotForRestore(snapshot) {
    const nextSnapshot = {
        ...snapshot,
    };
    delete nextSnapshot.updated;
    delete nextSnapshot.url;
    return nextSnapshot;
}

export { restoreArchivedEntry };
