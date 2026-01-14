import $ from '@/core/app';
import {
    RESOURCE_CACHE_KEY,
    DEFAULT_CACHE_TTL,
    SETTINGS_KEY,
} from '@/constants';

class ResourceCache {
    constructor() {
        if (!$.read(RESOURCE_CACHE_KEY)) {
            $.write('{}', RESOURCE_CACHE_KEY);
        }
        try {
            this.resourceCache = JSON.parse($.read(RESOURCE_CACHE_KEY));
        } catch (e) {
            $.error(
                `解析持久化缓存中的 ${RESOURCE_CACHE_KEY} 失败, 重置为 {}, 错误: ${
                    e?.message ?? e
                }`,
            );
            this.resourceCache = {};
            $.write('{}', RESOURCE_CACHE_KEY);
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
            }
        });
        if (clear) this._persist();
    }

    revokeAll() {
        this.resourceCache = {};
        this._persist();
    }

    _persist() {
        $.write(JSON.stringify(this.resourceCache), RESOURCE_CACHE_KEY);
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
                this._persist();
            }
        }
        return null;
    }

    set(id, value, ttl) {
        const resolvedTTL = normalizeTTL(ttl) ?? getTTL();
        this.resourceCache[id] = {
            time: Date.now() + resolvedTTL,
            data: value,
        };
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
    const settings = $.read(SETTINGS_KEY);
    let ttl = settings?.resourceCacheTtl;
    if (ttl) {
        ttl = Number(ttl);
        if (isFinite(ttl) && ttl > 0) {
            return ttl * 1000;
        }
    }
    return DEFAULT_CACHE_TTL;
}

export default new ResourceCache();
