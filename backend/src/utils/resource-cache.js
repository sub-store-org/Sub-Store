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
            if (new Date().getTime() - updated > this.expires) {
                $.delete(`#${id}`);
                delete this.resourceCache[id];
                clear = true;
            }
        });
        if (clear) this._persist();
    }

    revokeAll() {
        Object.keys(this.resourceCache).forEach((id) => {
            $.delete(`#${id}`);
        });
        this.resourceCache = {};
        this._persist();
    }

    _persist() {
        $.write(JSON.stringify(this.resourceCache), RESOURCE_CACHE_KEY);
    }

    get(id) {
        const updated = this.resourceCache[id];
        if (updated && new Date().getTime() - updated <= this.expires) {
            return $.read(`#${id}`);
        }
        return null;
    }

    set(id, value) {
        this.resourceCache[id] = new Date().getTime();
        this._persist();
        $.write(value, `#${id}`);
    }
}

export default new ResourceCache(CACHE_EXPIRATION_TIME_MS);
