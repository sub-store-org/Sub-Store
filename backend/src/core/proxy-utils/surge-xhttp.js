import _ from 'lodash';
import {
    normalizeXhttpIntegerValue,
    normalizeXhttpNonNegativeRange,
    normalizeXhttpPositiveRange,
    normalizeXhttpStrictPositiveRangeValue,
} from './xhttp-utils';

// Surge parameter suffixes and their corresponding paths in xhttp-opts.
export const SURGE_XHTTP_FIELDS = {
    path: 'path',
    host: 'host',
    mode: 'mode',
    'padding-bytes': 'x-padding-bytes',
    'padding-obfs': 'x-padding-obfs-mode',
    'padding-key': 'x-padding-key',
    'padding-header': 'x-padding-header',
    'padding-placement': 'x-padding-placement',
    'padding-method': 'x-padding-method',
    'uplink-method': 'uplink-http-method',
    'session-placement': 'session-placement',
    'session-key': 'session-key',
    'session-table': 'session-table',
    'session-length': 'session-length',
    'seq-placement': 'seq-placement',
    'seq-key': 'seq-key',
    'uplink-data-placement': 'uplink-data-placement',
    'uplink-data-key': 'uplink-data-key',
    'uplink-chunk-size': 'uplink-chunk-size',
    'no-grpc-header': 'no-grpc-header',
    'max-each-post-bytes': 'sc-max-each-post-bytes',
    'min-posts-interval': 'sc-min-posts-interval-ms',
    'xmux-max-concurrency': 'reuse-settings.max-concurrency',
    'xmux-max-connections': 'reuse-settings.max-connections',
    'xmux-max-reuse-times': 'reuse-settings.c-max-reuse-times',
    'xmux-max-request-times': 'reuse-settings.h-max-request-times',
    'xmux-max-reusable-secs': 'reuse-settings.h-max-reusable-secs',
    'xmux-keep-alive': 'reuse-settings.h-keep-alive-period',
};

export function setSurgeXhttpOption(opts, key, rawValue) {
    if (!Object.prototype.hasOwnProperty.call(SURGE_XHTTP_FIELDS, key)) return;
    const field = SURGE_XHTTP_FIELDS[key];
    let value = rawValue;
    switch (key) {
        case 'padding-obfs':
        case 'no-grpc-header':
            if (rawValue !== 'true' && rawValue !== 'false') return;
            value = rawValue === 'true';
            break;
        case 'uplink-chunk-size':
            value = normalizeXhttpNonNegativeRange(rawValue) ?? rawValue;
            break;
        case 'max-each-post-bytes':
            value = normalizeXhttpStrictPositiveRangeValue(rawValue) ?? rawValue;
            break;
        case 'min-posts-interval':
            value = normalizeXhttpPositiveRange(rawValue) ?? rawValue;
            break;
        case 'xmux-keep-alive':
            value = normalizeXhttpIntegerValue(rawValue) ?? rawValue;
            break;
    }
    _.set(opts, field, value);
}
