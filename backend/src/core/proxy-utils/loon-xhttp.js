import _ from 'lodash';
import {
    normalizeXhttpIntegerValue,
    normalizeXhttpNonNegativeRange,
    normalizeXhttpPositiveRange,
} from './xhttp-utils';

const PADDING_FIELDS = {
    'padding-bytes': 'x-padding-bytes',
    'padding-obfs-mode': 'x-padding-obfs-mode',
    'padding-placement': 'x-padding-placement',
    'padding-key': 'x-padding-key',
    'padding-header': 'x-padding-header',
    'padding-method': 'x-padding-method',
};

const SESSION_FIELDS = {
    'session-id-placement': 'session-placement',
    'session-id-key': 'session-key',
};

const XMUX_FIELDS = {
    'xmux-max-concurrency': 'reuse-settings.max-concurrency',
    'xmux-max-connections': 'reuse-settings.max-connections',
    'xmux-max-reuse-times': 'reuse-settings.c-max-reuse-times',
    'xmux-http-max-requests': 'reuse-settings.h-max-request-times',
    'xmux-http-max-reusable-secs': 'reuse-settings.h-max-reusable-secs',
    'xmux-http-keepalive-secs': 'reuse-settings.h-keep-alive-period',
};

const DOWNLOAD_FIELDS = {
    server: 'server',
    port: 'port',
    host: 'host',
    path: 'path',
    alpn: 'alpn',
    'over-tls': 'tls',
    sni: 'servername',
    'skip-cert-verify': 'skip-cert-verify',
    'tls-profile': '_loon_tls_profile',
    'tls-cert-sha256': 'fingerprint',
    'tls-pubkey-sha256': 'tls-pubkey-sha256',
    'public-key': 'reality-opts.public-key',
    'short-id': 'reality-opts.short-id',
    ...XMUX_FIELDS,
    ...PADDING_FIELDS,
    ...SESSION_FIELDS,
};

export const LOON_XHTTP_FIELDS = {
    mode: 'mode',
    'uplink-method': 'uplink-http-method',
    'min-post-interval-ms': 'sc-min-posts-interval-ms',
    'max-post-bytes': 'sc-max-each-post-bytes',
    'uplink-data-placement': 'uplink-data-placement',
    'uplink-data-key': 'uplink-data-key',
    'uplink-chunk-size': 'uplink-chunk-size',
    ...PADDING_FIELDS,
    'no-grpc-header': 'no-grpc-header',
    ...SESSION_FIELDS,
    'session-id-table': 'session-table',
    'session-id-length': 'session-length',
    'seq-placement': 'seq-placement',
    'seq-key': 'seq-key',
    ...XMUX_FIELDS,
    ...Object.fromEntries(
        Object.entries(DOWNLOAD_FIELDS).map(([key, path]) => [
            `download-${key}`,
            `download-settings.${path}`,
        ]),
    ),
};

export function validateLoonXhttpXmux(opts) {
    if (!opts) return;

    for (const prefix of ['', 'download-']) {
        const getOption = (key) =>
            _.get(opts, LOON_XHTTP_FIELDS[`${prefix}${key}`]);

        for (const key of Object.keys(XMUX_FIELDS)) {
            const value = getOption(key);
            if (value == null) continue;

            const isKeepalive = key === 'xmux-http-keepalive-secs';
            const normalized = isKeepalive
                ? normalizeXhttpIntegerValue(value)
                : normalizeXhttpNonNegativeRange(value);
            if (normalized == null || (isKeepalive && normalized < -1)) {
                const expected = isKeepalive
                    ? 'an integer of at least -1'
                    : 'a non-negative integer or a valid non-negative integer range';
                throw new Error(
                    `Loon xhttp-${prefix}${key} must be ${expected}`,
                );
            }
        }

        const maxConcurrency = getOption('xmux-max-concurrency');
        const maxConnections = getOption('xmux-max-connections');
        if (
            normalizeXhttpPositiveRange(maxConcurrency) != null &&
            normalizeXhttpPositiveRange(maxConnections) != null
        ) {
            const optionPrefix = `xhttp-${prefix}xmux`;
            throw new Error(
                `Loon ${optionPrefix}-max-concurrency and ${optionPrefix}-max-connections cannot both be positive`,
            );
        }
    }
}

export function setLoonXhttpOption(opts, key, value) {
    if (key === 'header' || key === 'download-header') {
        const colon = value.indexOf(':');
        if (colon <= 0) return;
        const name = value.slice(0, colon).trim();
        if (!name || /^host$/i.test(name)) return;
        const target =
            key === 'header' ? opts : (opts['download-settings'] ??= {});
        target.headers = {
            ...target.headers,
            [name]: value.slice(colon + 1).trim(),
        };
        return;
    }

    if (!Object.prototype.hasOwnProperty.call(LOON_XHTTP_FIELDS, key)) return;
    switch (key.replace(/^download-/, '')) {
        case 'padding-obfs-mode':
        case 'no-grpc-header':
        case 'over-tls':
        case 'skip-cert-verify':
            if (value !== 'true' && value !== 'false') return;
            value = value === 'true';
            break;
        case 'min-post-interval-ms':
        case 'max-post-bytes':
        case 'uplink-chunk-size':
            value = normalizeXhttpNonNegativeRange(value) ?? value;
            break;
        case 'port':
        case 'xmux-http-keepalive-secs':
            value = normalizeXhttpIntegerValue(value) ?? value;
            break;
        case 'alpn':
            value = [value];
            break;
    }
    _.set(opts, LOON_XHTTP_FIELDS[key], value);
}
