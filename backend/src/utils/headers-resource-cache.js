import $ from '@/core/app';
import {
    HEADERS_RESOURCE_CACHE_KEY,
    CHR_EXPIRATION_TIME_KEY,
} from '@/constants';

class ResourceCache {
    constructor() {
        this.expires = getExpiredTime();
        if (!$.read(HEADERS_RESOURCE_CACHE_KEY)) {
            $.write('{}', HEADERS_RESOURCE_CACHE_KEY);
        }
        this.resourceCache = JSON.parse($.read(HEADERS_RESOURCE_CACHE_KEY));
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
        $.write(JSON.stringify(this.resourceCache), HEADERS_RESOURCE_CACHE_KEY);
    }

    get(id) {
        const updated = this.resourceCache[id] && this.resourceCache[id].time;
        if (updated && new Date().getTime() - updated <= this.expires) {
            return this.resourceCache[id].data;
        }
        return null;
    }

    gettime(id) {
        const updated = this.resourceCache[id] && this.resourceCache[id].time;
        if (updated && new Date().getTime() - updated <= this.expires) {
            return this.resourceCache[id].time;
        }
        return null;
    }

    set(id, value) {
        this.resourceCache[id] = { time: new Date().getTime(), data: value };
        this._persist();
    }
}

function getExpiredTime() {
    // console.log($.read(CHR_EXPIRATION_TIME_KEY));
    if (!$.read(CHR_EXPIRATION_TIME_KEY)) {
        $.write('6e4', CHR_EXPIRATION_TIME_KEY); // 1分钟
    }
    let expiration = 6e4;
    if ($.env.isLoon) {
        const loont = {
            // Loon 插件自义定
            '1\u5206\u949f': 6e4,
            '5\u5206\u949f': 3e5,
            '10\u5206\u949f': 6e5,
            '30\u5206\u949f': 18e5, // "30分钟"
            '1\u5c0f\u65f6': 36e5,
            '2\u5c0f\u65f6': 72e5,
            '3\u5c0f\u65f6': 108e5,
            '6\u5c0f\u65f6': 216e5,
            '12\u5c0f\u65f6': 432e5,
            '24\u5c0f\u65f6': 864e5,
            '48\u5c0f\u65f6': 1728e5,
            '72\u5c0f\u65f6': 2592e5, // "72小时"
            '\u53c2\u6570\u4f20\u5165': 'readcachets', // "参数输入"
        };
        let intimed = $.read(
            '#\u54cd\u5e94\u5934\u7f13\u5b58\u6709\u6548\u671f',
        ); // Loon #响应头缓存有效期
        // console.log(intimed);
        if (intimed in loont) {
            expiration = loont[intimed];
            if (expiration === 'readcachets') {
                expiration = intimed;
            }
        }
        return expiration;
    } else {
        expiration = $.read(CHR_EXPIRATION_TIME_KEY);
        return expiration;
    }
}

export default new ResourceCache();
