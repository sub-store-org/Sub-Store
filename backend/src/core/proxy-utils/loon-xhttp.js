import { normalizeXhttpNonNegativeRange } from './xhttp-utils';

export const LOON_XHTTP_FIELDS = {
    mode: 'mode',
    'uplink-method': 'uplink-http-method',
    'min-post-interval-ms': 'sc-min-posts-interval-ms',
    'max-post-bytes': 'sc-max-each-post-bytes',
    'uplink-data-placement': 'uplink-data-placement',
    'uplink-data-key': 'uplink-data-key',
    'uplink-chunk-size': 'uplink-chunk-size',
    'padding-bytes': 'x-padding-bytes',
    'padding-obfs-mode': 'x-padding-obfs-mode',
    'padding-placement': 'x-padding-placement',
    'padding-key': 'x-padding-key',
    'padding-header': 'x-padding-header',
    'padding-method': 'x-padding-method',
    'no-grpc-header': 'no-grpc-header',
    'session-id-placement': 'session-placement',
    'session-id-key': 'session-key',
    'session-id-table': 'session-table',
    'session-id-length': 'session-length',
    'seq-placement': 'seq-placement',
    'seq-key': 'seq-key',
};

export function setLoonXhttpOption(opts, key, value) {
    if (!Object.prototype.hasOwnProperty.call(LOON_XHTTP_FIELDS, key)) return;
    switch (key) {
        case 'padding-obfs-mode':
        case 'no-grpc-header':
            if (value !== 'true' && value !== 'false') return;
            value = value === 'true';
            break;
        case 'min-post-interval-ms':
        case 'max-post-bytes':
        case 'uplink-chunk-size':
            value = normalizeXhttpNonNegativeRange(value) ?? value;
            break;
    }
    opts[LOON_XHTTP_FIELDS[key]] = value;
}
