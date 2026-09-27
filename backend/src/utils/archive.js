import $ from '@/core/app';
import {
    ARTIFACTS_KEY,
    COLLECTIONS_KEY,
    FILES_KEY,
    ARCHIVES_KEY,
    SUBS_KEY,
    TOKENS_KEY,
} from '@/constants';
import { findByName } from '@/utils/database';
import {
    RequestInvalidError,
    ResourceNotFoundError,
} from '@/restful/errors';

function cloneSnapshot(value) {
    if (value === undefined) {
        return undefined;
    }
    return JSON.parse(JSON.stringify(value));
}

function ensureArchiveStore() {
    const current = $.read(ARCHIVES_KEY);
    if (Array.isArray(current)) {
        return current;
    }

    const entries = [];
    $.write(entries, ARCHIVES_KEY);
    return entries;
}

function getArchiveEntries() {
    return ensureArchiveStore();
}

function writeArchiveEntries(entries) {
    $.write(entries, ARCHIVES_KEY);
}

function createArchiveId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function insertArchiveEntry(entry) {
    const entries = ensureArchiveStore();
    const nextEntry = {
        id: createArchiveId(),
        archivedAt: Date.now(),
        ...entry,
    };
    entries.unshift(nextEntry);
    writeArchiveEntries(entries);
    return nextEntry;
}

function getArchiveEntry(id) {
    return ensureArchiveStore().find((entry) => entry.id === id);
}

function getRequiredArchiveEntry(id) {
    const entry = getArchiveEntry(id);
    if (!entry) {
        throw new ResourceNotFoundError(
            'ARCHIVE_ENTRY_NOT_FOUND',
            `Archive entry ${id} does not exist`,
        );
    }
    return entry;
}

function removeArchiveEntry(id) {
    const entries = ensureArchiveStore();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index === -1) {
        throw new ResourceNotFoundError(
            'ARCHIVE_ENTRY_NOT_FOUND',
            `Archive entry ${id} does not exist`,
        );
    }
    const [removed] = entries.splice(index, 1);
    writeArchiveEntries(entries);
    return removed;
}

function sortArchiveEntries(ids) {
    if (!Array.isArray(ids)) {
        throw new RequestInvalidError(
            'INVALID_SORT_PAYLOAD',
            'Archive sort payload must be an array of ids',
        );
    }

    const entries = ensureArchiveStore();
    const orderMap = new Map(ids.map((id, index) => [id, index]));
    entries.sort((a, b) => {
        const left = orderMap.has(a.id)
            ? orderMap.get(a.id)
            : Number.MAX_SAFE_INTEGER;
        const right = orderMap.has(b.id)
            ? orderMap.get(b.id)
            : Number.MAX_SAFE_INTEGER;
        return left - right;
    });
    writeArchiveEntries(entries);
    return entries;
}

function buildArchiveEntry(itemType, snapshot, overrides = {}) {
    return insertArchiveEntry({
        itemType,
        name: snapshot.name,
        displayName: snapshot.displayName,
        remark: snapshot.remark,
        tag: cloneSnapshot(snapshot.tag),
        snapshot: cloneSnapshot(snapshot),
        ...overrides,
    });
}

function archiveSubscription(name) {
    const allSubs = $.read(SUBS_KEY) || [];
    const sub = findByName(allSubs, name);
    if (!sub) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `Subscription ${name} does not exist!`,
        );
    }
    return buildArchiveEntry('sub', sub);
}

function archiveCollection(name) {
    const allCollections = $.read(COLLECTIONS_KEY) || [];
    const collection = findByName(allCollections, name);
    if (!collection) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `Collection ${name} does not exist!`,
        );
    }
    return buildArchiveEntry('col', collection);
}

function archiveFile(name) {
    const allFiles = $.read(FILES_KEY) || [];
    const file = findByName(allFiles, name);
    if (!file) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `File ${name} does not exist!`,
        );
    }
    return buildArchiveEntry('file', file);
}

function archiveArtifact(name) {
    const allArtifacts = $.read(ARTIFACTS_KEY) || [];
    const artifact = findByName(allArtifacts, name);
    if (!artifact) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `Artifact ${name} does not exist!`,
        );
    }
    return buildArchiveEntry('artifact', artifact);
}

function archiveShare(token, type, name) {
    const allTokens = $.read(TOKENS_KEY) || [];
    const share = allTokens.find(
        (item) => item.token === token && item.type === type && item.name === name,
    );
    if (!share) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `Share ${type}/${name}/${token} does not exist!`,
        );
    }
    return buildArchiveEntry('share', share, {
        shareType: share.type,
    });
}

export {
    archiveArtifact,
    archiveCollection,
    archiveFile,
    archiveShare,
    archiveSubscription,
    getArchiveEntries,
    getArchiveEntry,
    getRequiredArchiveEntry,
    insertArchiveEntry,
    removeArchiveEntry,
    sortArchiveEntries,
    writeArchiveEntries,
    ensureArchiveStore,
};
