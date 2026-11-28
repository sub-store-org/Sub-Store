const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS kv_store (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (scope, key)
)
`.trim();

export const CF_CACHE_BUCKETS = ['rc:resource', 'rc:headers', 'rc:script'];

const LEGACY_ROOT_TO_BUCKET = {
    'sub-store-cached-resource': 'rc:resource',
    'sub-store-cached-headers-resource': 'rc:headers',
    'sub-store-cached-script-resource': 'rc:script',
};

let initializedDbs = new WeakSet();
let lockChain = Promise.resolve();

const dirtyState = {
    replaceAllCache: false,
    dirtyCacheKeys: new Set(),
    deletedCacheKeys: new Set(),
    dirtyRootKeys: new Set(),
    deletedRootKeys: new Set(),
    clearedBuckets: new Set(),
    dirtyBucketEntries: new Map(), // bucket -> Map<id, entry>
    deletedBucketEntries: new Map(), // bucket -> Set<id>
};

function getDirtyEntryMap(bucket) {
    let map = dirtyState.dirtyBucketEntries.get(bucket);
    if (!map) {
        map = new Map();
        dirtyState.dirtyBucketEntries.set(bucket, map);
    }
    return map;
}

function getDeletedEntrySet(bucket) {
    let set = dirtyState.deletedBucketEntries.get(bucket);
    if (!set) {
        set = new Set();
        dirtyState.deletedBucketEntries.set(bucket, set);
    }
    return set;
}

export function resetDirtyState() {
    dirtyState.replaceAllCache = false;
    dirtyState.dirtyCacheKeys.clear();
    dirtyState.deletedCacheKeys.clear();
    dirtyState.dirtyRootKeys.clear();
    dirtyState.deletedRootKeys.clear();
    dirtyState.clearedBuckets.clear();
    dirtyState.dirtyBucketEntries.clear();
    dirtyState.deletedBucketEntries.clear();
}

export function resetSchemaReady() {
    initializedDbs = new WeakSet();
}

export function hasDirtyCache() {
    return (
        dirtyState.replaceAllCache ||
        dirtyState.dirtyCacheKeys.size > 0 ||
        dirtyState.deletedCacheKeys.size > 0
    );
}

export function hasDirtyRoot() {
    if (
        dirtyState.dirtyRootKeys.size > 0 ||
        dirtyState.deletedRootKeys.size > 0 ||
        dirtyState.clearedBuckets.size > 0
    ) {
        return true;
    }
    for (const map of dirtyState.dirtyBucketEntries.values()) {
        if (map.size > 0) return true;
    }
    for (const set of dirtyState.deletedBucketEntries.values()) {
        if (set.size > 0) return true;
    }
    return false;
}

export function hasAnyDirty() {
    return hasDirtyCache() || hasDirtyRoot();
}

export function attachD1Hooks($) {
    $._cfCacheBuckets = {
        'rc:resource': {},
        'rc:headers': {},
        'rc:script': {},
    };
    $._onWrite = (scope, key) => {
        if (scope === 'cache') {
            dirtyState.deletedCacheKeys.delete(key);
            dirtyState.dirtyCacheKeys.add(key);
        } else if (scope === 'root') {
            dirtyState.deletedRootKeys.delete(key);
            dirtyState.dirtyRootKeys.add(key);
        }
    };
    $._onDelete = (scope, key) => {
        if (scope === 'cache') {
            dirtyState.dirtyCacheKeys.delete(key);
            dirtyState.deletedCacheKeys.add(key);
        } else if (scope === 'root') {
            dirtyState.dirtyRootKeys.delete(key);
            dirtyState.deletedRootKeys.add(key);
        }
    };
    $._onPersistAll = () => {
        dirtyState.replaceAllCache = true;
    };
    $._onCacheEntrySet = (bucket, id, entry) => {
        if (!$._cfCacheBuckets[bucket]) {
            $._cfCacheBuckets[bucket] = {};
        }
        $._cfCacheBuckets[bucket][id] = entry;
        getDeletedEntrySet(bucket).delete(id);
        getDirtyEntryMap(bucket).set(id, entry);
    };
    $._onCacheEntryDelete = (bucket, id) => {
        if ($._cfCacheBuckets[bucket]) {
            delete $._cfCacheBuckets[bucket][id];
        }
        getDirtyEntryMap(bucket).delete(id);
        getDeletedEntrySet(bucket).add(id);
    };
    $._onCacheBucketClear = (bucket) => {
        $._cfCacheBuckets[bucket] = {};
        dirtyState.clearedBuckets.add(bucket);
        dirtyState.dirtyBucketEntries.delete(bucket);
        dirtyState.deletedBucketEntries.delete(bucket);
    };
}

export function withStoreLock(task) {
    const run = lockChain.then(task, task);
    lockChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

export function resolveD1Database(env) {
    const db = env?.SUB_STORE_DB || env?.DB;
    if (!db || typeof db.prepare !== 'function') {
        throw new Error(
            'Cloudflare D1 binding not found. Please bind a D1 database as SUB_STORE_DB (or DB) in wrangler.toml.',
        );
    }
    return db;
}

export async function ensureD1Schema(db) {
    if (initializedDbs.has(db)) return;
    await db.prepare(CREATE_TABLE_SQL).run();
    initializedDbs.add(db);
}

export async function loadFromD1(db, $) {
    await ensureD1Schema(db);
    const { results = [] } = await db
        .prepare('SELECT scope, key, value FROM kv_store')
        .all();

    const now = Date.now();
    const nextCache = {};
    const nextRoot = {};
    const nextBuckets = {
        'rc:resource': {},
        'rc:headers': {},
        'rc:script': {},
    };
    const expiredToDelete = [];
    const legacyToMigrate = [];

    for (const row of results) {
        let parsed;
        try {
            parsed = JSON.parse(row.value);
        } catch {
            parsed = row.value;
        }
        if (row.scope === 'cache') {
            nextCache[row.key] = parsed;
        } else if (row.scope === 'root') {
            const targetBucket = LEGACY_ROOT_TO_BUCKET[row.key];
            if (targetBucket) {
                legacyToMigrate.push({
                    rootKey: row.key,
                    bucket: targetBucket,
                    raw: parsed,
                });
            } else {
                nextRoot[row.key] = parsed;
            }
        } else if (CF_CACHE_BUCKETS.includes(row.scope)) {
            if (!parsed || !parsed.time || parsed.time < now) {
                expiredToDelete.push([row.scope, row.key]);
            } else {
                nextBuckets[row.scope][row.key] = parsed;
            }
        }
    }

    $.cache = nextCache;
    $.root = nextRoot;
    $._cfCacheBuckets = nextBuckets;
    resetDirtyState();

    // Queue pruning of expired split-cache rows.
    for (const [bucket, id] of expiredToDelete) {
        getDeletedEntrySet(bucket).add(id);
    }

    // Seamlessly migrate any legacy single-row resource caches into per-entry rows.
    for (const item of legacyToMigrate) {
        let obj = item.raw;
        if (typeof obj === 'string') {
            try {
                obj = JSON.parse(obj);
            } catch {
                obj = {};
            }
        }
        if (obj && typeof obj === 'object') {
            for (const [id, entry] of Object.entries(obj)) {
                if (entry && entry.time && entry.time >= now) {
                    nextBuckets[item.bucket][id] = entry;
                    getDirtyEntryMap(item.bucket).set(id, entry);
                }
            }
        }
        dirtyState.deletedRootKeys.add(item.rootKey);
    }
}

export async function flushToD1(db, $) {
    if (!hasAnyDirty()) return;

    await ensureD1Schema(db);
    const now = Date.now();
    const statements = [];

    if (dirtyState.replaceAllCache) {
        statements.push(
            db.prepare('DELETE FROM kv_store WHERE scope = ?').bind('cache'),
        );
        for (const [key, value] of Object.entries($.cache || {})) {
            if (value === undefined) continue;
            statements.push(
                db
                    .prepare(
                        'INSERT OR REPLACE INTO kv_store (scope, key, value, updated_at) VALUES (?, ?, ?, ?)',
                    )
                    .bind('cache', key, JSON.stringify(value), now),
            );
        }
    } else {
        for (const key of dirtyState.deletedCacheKeys) {
            statements.push(
                db
                    .prepare(
                        'DELETE FROM kv_store WHERE scope = ? AND key = ?',
                    )
                    .bind('cache', key),
            );
        }
        for (const key of dirtyState.dirtyCacheKeys) {
            const value = $.cache?.[key];
            if (value === undefined) {
                statements.push(
                    db
                        .prepare(
                            'DELETE FROM kv_store WHERE scope = ? AND key = ?',
                        )
                        .bind('cache', key),
                );
            } else {
                statements.push(
                    db
                        .prepare(
                            'INSERT OR REPLACE INTO kv_store (scope, key, value, updated_at) VALUES (?, ?, ?, ?)',
                        )
                        .bind('cache', key, JSON.stringify(value), now),
                );
            }
        }
    }

    for (const key of dirtyState.deletedRootKeys) {
        statements.push(
            db
                .prepare('DELETE FROM kv_store WHERE scope = ? AND key = ?')
                .bind('root', key),
        );
    }
    for (const key of dirtyState.dirtyRootKeys) {
        const value = $.root?.[key];
        if (value === undefined) {
            statements.push(
                db
                    .prepare(
                        'DELETE FROM kv_store WHERE scope = ? AND key = ?',
                    )
                    .bind('root', key),
            );
        } else {
            statements.push(
                db
                    .prepare(
                        'INSERT OR REPLACE INTO kv_store (scope, key, value, updated_at) VALUES (?, ?, ?, ?)',
                    )
                    .bind('root', key, JSON.stringify(value), now),
            );
        }
    }

    for (const bucket of CF_CACHE_BUCKETS) {
        if (dirtyState.clearedBuckets.has(bucket)) {
            statements.push(
                db.prepare('DELETE FROM kv_store WHERE scope = ?').bind(bucket),
            );
        } else {
            const deletedIds = dirtyState.deletedBucketEntries.get(bucket);
            if (deletedIds) {
                for (const id of deletedIds) {
                    statements.push(
                        db
                            .prepare(
                                'DELETE FROM kv_store WHERE scope = ? AND key = ?',
                            )
                            .bind(bucket, id),
                    );
                }
            }
        }

        const dirtyEntries = dirtyState.dirtyBucketEntries.get(bucket);
        if (dirtyEntries) {
            for (const [id, entry] of dirtyEntries.entries()) {
                statements.push(
                    db
                        .prepare(
                            'INSERT OR REPLACE INTO kv_store (scope, key, value, updated_at) VALUES (?, ?, ?, ?)',
                        )
                        .bind(bucket, id, JSON.stringify(entry), now),
                );
            }
        }
    }

    resetDirtyState();

    if (statements.length > 0) {
        await db.batch(statements);
    }
}
