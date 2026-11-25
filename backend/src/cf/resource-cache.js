import $ from '@/core/app';
import { DEFAULT_CACHE_TTL, SETTINGS_KEY } from '@/constants';

function normalizeTTL(ttl) {
    const value = Number(ttl);
    if (!isFinite(value)) return null;
    if (value > 0) return value;
    return null;
}

export function createCFResourceCache({ bucket, settingKey, defaultTTL }) {
    function getTTL() {
        const settings = $.read(SETTINGS_KEY) || {};
        const ttl = Number(settings?.[settingKey]);
        if (isFinite(ttl) && ttl > 0) {
            return ttl * 1000;
        }
        return defaultTTL;
    }

    return new (class CFResourceCache {
        constructor() {
            this.resourceCache = {};
        }

        reload() {
            this.resourceCache = {
                ...($._cfCacheBuckets?.[bucket] || {}),
            };
            this._cleanup();
        }

        _cleanup(prefix, ttl) {
            const resolvedTTL = normalizeTTL(ttl) ?? 0;
            const now = Date.now();
            Object.entries(this.resourceCache).forEach(([id, cached]) => {
                const shouldDelete =
                    !cached?.time || cached.time < now + resolvedTTL;
                if (shouldDelete && (prefix ? id.startsWith(prefix) : true)) {
                    delete this.resourceCache[id];
                    $._onCacheEntryDelete?.(bucket, id);
                }
            });
        }

        revokeAll() {
            this.resourceCache = {};
            $._onCacheBucketClear?.(bucket);
        }

        gettime(id) {
            const time = this.resourceCache[id]?.time;
            if (time && Date.now() <= time) {
                return time;
            }
            return null;
        }

        get(id, ttl, remove) {
            const resolvedTTL = normalizeTTL(ttl) ?? 0;
            const cached = this.resourceCache[id];
            const time = cached?.time;
            if (time) {
                if (Date.now() + resolvedTTL <= time) return cached.data;
                if (remove) {
                    delete this.resourceCache[id];
                    $._onCacheEntryDelete?.(bucket, id);
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
            $._onCacheEntrySet?.(bucket, id, entry);
        }
    })();
}

export default createCFResourceCache({
    bucket: 'rc:resource',
    settingKey: 'resourceCacheTtl',
    defaultTTL: DEFAULT_CACHE_TTL,
});
