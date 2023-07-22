import $ from '@/core/app';
import { CACHE_EXPIRATION_TIME_MS, RESOURCE_CACHE_KEY } from '@/constants';

class ResourceCache {
    constructor(expires) {
        this.expires = expires;
        if (!$.read(RESOURCE_CACHE_KEY)) {
            $.write('{}', RESOURCE_CACHE_KEY);
        }
        this.resourceCache = JSON.parse($.read(RESOURCE_CACHE_KEY));
        this._cleanup();
    }

    _cleanup() {
        // clear obsolete cached resource
        let clear = false;
        Object.entries(this.resourceCache).forEach((entry) => {
            const [id, updated] = entry;
            if (!updated.time) {
                // clear old version cache
                delete this.resourceCache[id];
                $.delete(`#${id}`);
                clear = true;
            }
            if (new Date().getTime() - updated.time > this.expires) {
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

    get(id) {
        const updated = this.resourceCache[id] && this.resourceCache[id].time;
        if (updated && new Date().getTime() - updated <= this.expires) {
            return this.resourceCache[id].data;
        }
        return null;
    }

    set(id, value) {
        this.resourceCache[id] = { time: new Date().getTime(), data: value };
        this._persist();
    }
}

export default new ResourceCache(CACHE_EXPIRATION_TIME_MS);
