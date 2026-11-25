import $ from '@/core/app';
import {
    HEADERS_RESOURCE_CACHE_KEY,
    DEFAULT_HEADERS_CACHE_TTL,
    SETTINGS_KEY,
} from '@/constants';

const CF_CACHE_BUCKET = 'rc:headers';

class ResourceCache {
    constructor() {
        this.resourceCache = {};
        if (!$.env.isCFWorker) {
            this.reload();
        }
    }

    reload() {
        if ($.env.isCFWorker) {
            this.resourceCache = {
                ...($._cfCacheBuckets?.[CF_CACHE_BUCKET] || {}),
            };
            this._cleanup();
            return;
        }
        if (!$.read(HEADERS_RESOURCE_CACHE_KEY)) {
            this.resourceCache = {};
            $.write('{}', HEADERS_RESOURCE_CACHE_KEY);
            return;
        }
        try {
            const raw = $.read(HEADERS_RESOURCE_CACHE_KEY);
            this.resourceCache =
                typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        } catch (e) {
            $.error(
                `解析持久化缓存中的 ${HEADERS_RESOURCE_CACHE_KEY} 失败, 重置为 {}, 错误: ${
                    e?.message ?? e
                }`,
            );
            this.resourceCache = {};
            $.write('{}', HEADERS_RESOURCE_CACHE_KEY);
        }
        this._cleanup();
    }

    _cleanup(prefix, ttl) {
        const resolvedTTL = normalizeTTL(ttl) ?? 0;
        let clear = false;
        const now = Date.now();
        Object.entries(this.resourceCache).forEach((entry) => {
            const [id, cached] = entry;
            const shouldDelete =
                !cached.time || cached.time < now + resolvedTTL;
            if (shouldDelete && (prefix ? id.startsWith(prefix) : true)) {
                delete this.resourceCache[id];
                clear = true;
                if ($.env.isCFWorker) {
                    $._onCacheEntryDelete?.(CF_CACHE_BUCKET, id);
                }
            }
        });
        if (clear && !$.env.isCFWorker) this._persist();
    }

    revokeAll() {
        this.resourceCache = {};
        if ($.env.isCFWorker) {
            $._onCacheBucketClear?.(CF_CACHE_BUCKET);
            return;
        }
        this._persist();
    }

    _persist() {
        if ($.env.isCFWorker) return;
        $.write(JSON.stringify(this.resourceCache), HEADERS_RESOURCE_CACHE_KEY);
    }

    gettime(id) {
        const time = this.resourceCache[id] && this.resourceCache[id].time;
        if (time && new Date().getTime() <= time) {
            return this.resourceCache[id].time;
        }
        return null;
    }

    get(id, ttl, remove) {
        const resolvedTTL = normalizeTTL(ttl) ?? 0;
        const cached = this.resourceCache[id];
        const time = cached && cached.time;
        if (time) {
            if (Date.now() + resolvedTTL <= time) return cached.data;
            if (remove) {
                delete this.resourceCache[id];
                if ($.env.isCFWorker) {
                    $._onCacheEntryDelete?.(CF_CACHE_BUCKET, id);
                } else {
                    this._persist();
                }
            }
        }
        return null;
    }

    set(id, value, ttl) {
        const resolvedTTL = normalizeTTL(ttl) ?? getTTL();
        const entry = {
            time: Date.now() + resolvedTTL,
            data: value,
        };
        this.resourceCache[id] = entry;
        if ($.env.isCFWorker) {
            $._onCacheEntrySet?.(CF_CACHE_BUCKET, id, entry);
            return;
        }
        this._persist();
    }
}

function normalizeTTL(ttl) {
    const value = Number(ttl);
    if (!isFinite(value)) return null;
    if (value > 0) return value;
    return null;
}

function getTTL() {
    const settings = $.read(SETTINGS_KEY) || {};
    let ttl = settings?.headersCacheTtl;
    if (ttl) {
        ttl = Number(ttl);
        if (isFinite(ttl) && ttl > 0) {
            return ttl * 1000;
        }
    }
    return DEFAULT_HEADERS_CACHE_TTL;
}

export default new ResourceCache();
