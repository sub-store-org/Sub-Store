/* eslint-disable no-case-declarations */
import { Base64 } from 'js-base64';
import { isIPv6, isPlainObject } from '@/utils';
import { getWireGuardAddressWithCIDR, normalizePluginMuxValue } from './utils';
import {
    normalizeXhttpIntegerValue,
    normalizeXhttpNonNegativeRange,
    normalizeXhttpPositiveRange,
    normalizeXhttpScalarUpperBound,
} from '../xhttp-utils';

function toStringHeaderMap(headers, { excludeHost = false } = {}) {
    if (!isPlainObject(headers)) {
        return undefined;
    }

    const parsedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
        if (typeof value !== 'string' || value === '') {
            continue;
        }
        if (excludeHost && /^host$/i.test(key)) {
            continue;
        }
        parsedHeaders[key] = value;
    }

    return Object.keys(parsedHeaders).length > 0 ? parsedHeaders : undefined;
}

function parseIntegerLikeValue(value) {
    return normalizeXhttpIntegerValue(value);
}

function getSerializableXhttpRangeValue(value) {
    return normalizeXhttpNonNegativeRange(value);
}

function getTransportHost(network, transportOpts = {}) {
    if (network === 'h2') {
        return (
            transportOpts.host ??
            transportOpts.headers?.host ??
            transportOpts.headers?.Host
        );
    }
    if (network === 'xhttp') {
        return (
            transportOpts.host ??
            transportOpts.headers?.Host ??
            transportOpts.headers?.host
        );
    }
    return (
        transportOpts.headers?.Host ??
        transportOpts.headers?.host ??
        transportOpts.host
    );
}

function mapReuseSettingsToXmux(reuseSettings) {
    if (!isPlainObject(reuseSettings)) {
        return undefined;
    }

    const xmux = {};
    const reuseFieldMap = {
        'max-connections': 'maxConnections',
        'max-concurrency': 'maxConcurrency',
        'c-max-reuse-times': 'cMaxReuseTimes',
        'h-max-request-times': 'hMaxRequestTimes',
        'h-max-reusable-secs': 'hMaxReusableSecs',
    };

    for (const [sourceKey, targetKey] of Object.entries(reuseFieldMap)) {
        const normalizedValue = normalizeXhttpNonNegativeRange(
            reuseSettings[sourceKey],
        );
        if (normalizedValue != null) {
            xmux[targetKey] =
                typeof normalizedValue === 'number'
                    ? `${normalizedValue}`
                    : normalizedValue;
        }
    }

    const hKeepAlivePeriod = parseIntegerLikeValue(
        reuseSettings['h-keep-alive-period'],
    );
    if (hKeepAlivePeriod != null) {
        xmux.hKeepAlivePeriod = hKeepAlivePeriod;
    }

    return Object.keys(xmux).length > 0 ? xmux : undefined;
}

function applyStructuredXhttpExtraFields(
    target,
    xhttpOpts,
    { excludeHostHeader = true, xmuxTarget = 'root' } = {},
) {
    if (!isPlainObject(target) || !isPlainObject(xhttpOpts)) {
        return;
    }

    const headers = toStringHeaderMap(xhttpOpts.headers, {
        excludeHost: excludeHostHeader,
    });
    if (headers) {
        target.headers = headers;
    }

    if (xhttpOpts['no-grpc-header'] === true) {
        target.noGRPCHeader = true;
    }
    if (xhttpOpts['x-padding-bytes']) {
        target.xPaddingBytes = xhttpOpts['x-padding-bytes'];
    }
    if (xhttpOpts['x-padding-obfs-mode'] === true) {
        target.xPaddingObfsMode = true;
    }
    if (xhttpOpts['x-padding-key']) {
        target.xPaddingKey = xhttpOpts['x-padding-key'];
    }
    if (xhttpOpts['x-padding-header']) {
        target.xPaddingHeader = xhttpOpts['x-padding-header'];
    }
    if (xhttpOpts['x-padding-placement']) {
        target.xPaddingPlacement = xhttpOpts['x-padding-placement'];
    }
    if (xhttpOpts['x-padding-method']) {
        target.xPaddingMethod = xhttpOpts['x-padding-method'];
    }
    if (xhttpOpts['uplink-http-method']) {
        target.uplinkHTTPMethod = xhttpOpts['uplink-http-method'];
    }
    if (xhttpOpts['session-placement']) {
        target.sessionPlacement = xhttpOpts['session-placement'];
    }
    if (xhttpOpts['session-key']) {
        target.sessionKey = xhttpOpts['session-key'];
    }
    if (xhttpOpts['seq-placement']) {
        target.seqPlacement = xhttpOpts['seq-placement'];
    }
    if (xhttpOpts['seq-key']) {
        target.seqKey = xhttpOpts['seq-key'];
    }
    if (xhttpOpts['uplink-data-placement']) {
        target.uplinkDataPlacement = xhttpOpts['uplink-data-placement'];
    }
    if (xhttpOpts['uplink-data-key']) {
        target.uplinkDataKey = xhttpOpts['uplink-data-key'];
    }

    const uplinkChunkSize = getSerializableXhttpRangeValue(
        xhttpOpts['uplink-chunk-size'],
    );
    if (uplinkChunkSize != null) {
        target.uplinkChunkSize = uplinkChunkSize;
    }

    if (xhttpOpts['sc-max-each-post-bytes'] != null) {
        const scMaxEachPostBytes = normalizeXhttpScalarUpperBound(
            xhttpOpts['sc-max-each-post-bytes'],
        );
        if (scMaxEachPostBytes != null) {
            target.scMaxEachPostBytes = scMaxEachPostBytes;
        }
    }

    if (xhttpOpts['sc-min-posts-interval-ms'] != null) {
        const scMinPostsIntervalMs = normalizeXhttpPositiveRange(
            xhttpOpts['sc-min-posts-interval-ms'],
        );
        if (scMinPostsIntervalMs != null) {
            target.scMinPostsIntervalMs = scMinPostsIntervalMs;
        }
    }

    const xmux = mapReuseSettingsToXmux(xhttpOpts['reuse-settings']);
    if (xmux) {
        if (xmuxTarget === 'extra') {
            target.extra = {
                ...(isPlainObject(target.extra) ? target.extra : {}),
                xmux,
            };
        } else {
            target.xmux = xmux;
        }
    }
}

function buildXhttpDownloadSettings(downloadSettings) {
    if (!isPlainObject(downloadSettings)) {
        return undefined;
    }

    const explicitNetwork =
        typeof downloadSettings.network === 'string'
            ? downloadSettings.network.toLowerCase()
            : '';
    const normalizedNetwork =
        explicitNetwork === 'xhttp' || explicitNetwork === 'splithttp'
            ? 'xhttp'
            : undefined;

    const result = {};
    if (downloadSettings.server) {
        result.address = downloadSettings.server;
    }
    const parsedPort = normalizeXhttpIntegerValue(downloadSettings.port, {
        allowNegative: false,
    });
    if (parsedPort != null) {
        result.port = parsedPort;
    }

    const realityOpts = isPlainObject(downloadSettings['reality-opts'])
        ? downloadSettings['reality-opts']
        : undefined;
    if (realityOpts) {
        result.security = 'reality';
    } else if (downloadSettings.tls) {
        result.security = 'tls';
    }

    const tlsSettings = {};
    if (downloadSettings.servername) {
        tlsSettings.serverName = downloadSettings.servername;
    }
    if (downloadSettings['client-fingerprint']) {
        tlsSettings.fingerprint = downloadSettings['client-fingerprint'];
    }
    if (downloadSettings['skip-cert-verify']) {
        tlsSettings.allowInsecure = true;
    }
    if (downloadSettings.alpn) {
        tlsSettings.alpn = Array.isArray(downloadSettings.alpn)
            ? downloadSettings.alpn
            : [downloadSettings.alpn];
    }
    if (
        isPlainObject(downloadSettings['ech-opts']) &&
        downloadSettings['ech-opts'].config
    ) {
        tlsSettings.echConfigList = downloadSettings['ech-opts'].config;
    }
    if (Object.keys(tlsSettings).length > 0) {
        result.tlsSettings = tlsSettings;
    }

    if (realityOpts) {
        const realitySettings = {};
        if (downloadSettings.servername) {
            realitySettings.serverName = downloadSettings.servername;
        }
        if (downloadSettings['client-fingerprint']) {
            realitySettings.fingerprint =
                downloadSettings['client-fingerprint'];
        }
        if (realityOpts['public-key']) {
            realitySettings.publicKey = realityOpts['public-key'];
        }
        if (realityOpts['short-id']) {
            realitySettings.shortId = realityOpts['short-id'];
        }
        if (Object.keys(realitySettings).length > 0) {
            result.realitySettings = realitySettings;
        }
    }

    const xhttpSettings = {};
    if (downloadSettings.path) {
        xhttpSettings.path = downloadSettings.path;
    }
    const downloadHost = getTransportHost('xhttp', downloadSettings);
    if (downloadHost) {
        xhttpSettings.host = downloadHost;
    }
    applyStructuredXhttpExtraFields(xhttpSettings, downloadSettings, {
        excludeHostHeader: true,
        xmuxTarget: 'extra',
    });
    if (Object.keys(xhttpSettings).length > 0) {
        result.xhttpSettings = xhttpSettings;
    }

    if (Object.keys(result).length === 0 && normalizedNetwork == null) {
        return undefined;
    }

    // Treat nested downloadSettings.network as a supported structured field.
    // Fresh structured exports still default to xhttp so Xray sees a nested
    // StreamConfig instead of falling back to tcp.
    return {
        ...(result.address != null ? { address: result.address } : {}),
        network: normalizedNetwork || 'xhttp',
        ...(result.port != null ? { port: result.port } : {}),
        ...(result.security != null ? { security: result.security } : {}),
        ...(result.tlsSettings != null ? { tlsSettings: result.tlsSettings } : {}),
        ...(result.realitySettings != null
            ? { realitySettings: result.realitySettings }
            : {}),
        ...(result.xhttpSettings != null ? { xhttpSettings: result.xhttpSettings } : {}),
    };
}

function buildStructuredVlessExtraObject(proxy) {
    const xhttpOpts = proxy['xhttp-opts'] || {};
    const extra = {};
    applyStructuredXhttpExtraFields(extra, xhttpOpts, {
        excludeHostHeader: true,
        xmuxTarget: 'root',
    });

    const downloadSettings = buildXhttpDownloadSettings(
        xhttpOpts['download-settings'],
    );
    if (downloadSettings) {
        extra.downloadSettings = downloadSettings;
    }

    return Object.keys(extra).length > 0 ? extra : undefined;
}

function cloneXhttpExtraValue(value) {
    if (Array.isArray(value)) {
        return value.map(cloneXhttpExtraValue);
    }

    if (isPlainObject(value)) {
        const clonedValue = {};
        for (const [key, entryValue] of Object.entries(value)) {
            clonedValue[key] = cloneXhttpExtraValue(entryValue);
        }
        return clonedValue;
    }

    return value;
}

function mergeUnsupportedXhttpExtraValue(baseValue, unsupportedValue) {
    if (baseValue == null) {
        return cloneXhttpExtraValue(unsupportedValue);
    }

    if (Array.isArray(baseValue) || Array.isArray(unsupportedValue)) {
        return cloneXhttpExtraValue(baseValue);
    }

    if (isPlainObject(baseValue) && isPlainObject(unsupportedValue)) {
        return mergeUnsupportedXhttpExtraObject(baseValue, unsupportedValue);
    }

    return cloneXhttpExtraValue(baseValue);
}

function mergeUnsupportedXhttpExtraObject(baseObject, unsupportedObject) {
    const mergedExtra = isPlainObject(baseObject)
        ? cloneXhttpExtraValue(baseObject)
        : {};
    if (!isPlainObject(unsupportedObject)) {
        return mergedExtra;
    }

    for (const [key, value] of Object.entries(unsupportedObject)) {
        if (!Object.prototype.hasOwnProperty.call(mergedExtra, key)) {
            mergedExtra[key] = cloneXhttpExtraValue(value);
            continue;
        }

        mergedExtra[key] = mergeUnsupportedXhttpExtraValue(
            mergedExtra[key],
            value,
        );
    }

    return mergedExtra;
}

function getExplicitExtraOverride(proxy) {
    if (typeof proxy._extra === 'string') {
        return proxy._extra;
    }

    // `_extra` only accepts JSON-like plain objects here. Broader object checks
    // would accidentally stringify instances such as Date/Map/class values.
    if (isPlainObject(proxy._extra)) {
        return JSON.stringify(proxy._extra);
    }

    return undefined;
}

function buildVlessExtra(proxy) {
    const explicitExtraOverride = getExplicitExtraOverride(proxy);
    if (explicitExtraOverride != null) {
        // `_extra` is an explicit user override for the final URI extra. When
        // present as a string or plain object, we bypass the structured xhttp
        // rebuild entirely so users can hand-author extra without needing to
        // keep other structured fields in sync.
        return explicitExtraOverride;
    }

    if (proxy.network !== 'xhttp') {
        return proxy._extra || '';
    }

    const structuredExtra = buildStructuredVlessExtraObject(proxy);

    // IMPORTANT: `_extra_unsupported` is only the sidecar for URI extra fields
    // that Mihomo does not model structurally yet, and it only participates
    // when the user did not explicitly set `_extra`. Without an explicit
    // override, supported xhttp fields must still be emitted from the current
    // structured Mihomo node so later edits are reflected on export, while
    // `_extra_unsupported` fills the holes needed for VLESS URI -> node ->
    // VLESS URI lossless round-trips. That also means supported-field format
    // conflicts are resolved by the structured emitters here, e.g.
    // sc-max-each-post-bytes still emits the compatibility upper bound while
    // sc-min-posts-interval-ms keeps range.
    const mergedExtra = mergeUnsupportedXhttpExtraObject(
        structuredExtra,
        proxy._extra_unsupported,
    );

    return Object.keys(mergedExtra).length > 0
        ? JSON.stringify(mergedExtra)
        : '';
}

function vless(proxy) {
    let security = 'none';
    const isReality = proxy['reality-opts'];
    let sid = '';
    let pbk = '';
    let spx = '';
    if (isReality) {
        security = 'reality';
        const publicKey = proxy['reality-opts']?.['public-key'];
        if (publicKey) {
            pbk = `&pbk=${encodeURIComponent(publicKey)}`;
        }
        const shortId = proxy['reality-opts']?.['short-id'];
        if (shortId) {
            sid = `&sid=${encodeURIComponent(shortId)}`;
        }
        const spiderX = proxy['reality-opts']?.['_spider-x'];
        if (spiderX) {
            spx = `&spx=${encodeURIComponent(spiderX)}`;
        }
    } else if (proxy.tls) {
        security = 'tls';
    }
    let alpn = '';
    if (proxy.alpn) {
        alpn = `&alpn=${encodeURIComponent(
            Array.isArray(proxy.alpn) ? proxy.alpn : proxy.alpn.join(','),
        )}`;
    }
    let allowInsecure = '';
    if (proxy['skip-cert-verify']) {
        allowInsecure = `&allowInsecure=1`;
    }
    let h2 = '';
    if (proxy._h2) {
        h2 = `&h2=1`;
    }
    let pcs = '';
    if (proxy['tls-fingerprint']) {
        pcs = `&pcs=${encodeURIComponent(proxy['tls-fingerprint'])}`;
    }
    let ech = '';
    if (proxy._echConfigList) {
        ech = `&ech=${encodeURIComponent(proxy._echConfigList)}`;
    }
    let sni = '';
    if (proxy.sni) {
        sni = `&sni=${encodeURIComponent(proxy.sni)}`;
    }
    let fp = '';
    if (proxy['client-fingerprint']) {
        fp = `&fp=${encodeURIComponent(proxy['client-fingerprint'])}`;
    }
    let flow = '';
    if (proxy.flow) {
        flow = `&flow=${encodeURIComponent(proxy.flow)}`;
    }
    let extra = '';
    const extraPayload = buildVlessExtra(proxy);
    if (extraPayload) {
        extra = `&extra=${encodeURIComponent(extraPayload)}`;
    }
    let mode = '';
    if (
        ['xhttp'].includes(proxy.network) &&
        proxy[`${proxy.network}-opts`]?.mode
    ) {
        mode = `&mode=${encodeURIComponent(
            proxy[`${proxy.network}-opts`].mode,
        )}`;
    } else if (proxy._mode) {
        mode = `&mode=${encodeURIComponent(proxy._mode)}`;
    }
    let pqv = '';
    if (proxy._pqv) {
        pqv = `&pqv=${encodeURIComponent(proxy._pqv)}`;
    }
    let encryption = '';
    if (proxy.encryption) {
        encryption = `&encryption=${encodeURIComponent(proxy.encryption)}`;
    }
    let vlessType = proxy.network;
    if (proxy.network === 'ws' && proxy['ws-opts']?.['v2ray-http-upgrade']) {
        vlessType = 'httpupgrade';
    } else if (proxy.network === 'http') {
        vlessType = 'tcp';
    } else if (proxy.network === 'h2') {
        vlessType = 'http';
    }

    let vlessTransport = `&type=${encodeURIComponent(vlessType)}`;
    if (proxy.network === 'http') {
        vlessTransport += '&headerType=http';
    }
    if (['grpc'].includes(proxy.network)) {
        // https://github.com/XTLS/Xray-core/issues/91
        vlessTransport += `&mode=${encodeURIComponent(
            proxy[`${proxy.network}-opts`]?.['_grpc-type'] || 'gun',
        )}`;
        const authority = proxy[`${proxy.network}-opts`]?.['_grpc-authority'];
        if (authority) {
            vlessTransport += `&authority=${encodeURIComponent(authority)}`;
        }
    }

    const transportOpts = proxy[`${proxy.network}-opts`] || {};
    let vlessTransportServiceName =
        transportOpts?.[`${proxy.network}-service-name`];
    let vlessTransportPath = transportOpts?.path;
    let vlessTransportHost = getTransportHost(proxy.network, transportOpts);
    if (vlessTransportPath) {
        vlessTransport += `&path=${encodeURIComponent(
            Array.isArray(vlessTransportPath)
                ? vlessTransportPath[0]
                : vlessTransportPath,
        )}`;
    }
    if (vlessTransportHost) {
        vlessTransport += `&host=${encodeURIComponent(
            Array.isArray(vlessTransportHost)
                ? vlessTransportHost[0]
                : vlessTransportHost,
        )}`;
    }
    if (vlessTransportServiceName) {
        vlessTransport += `&serviceName=${encodeURIComponent(
            vlessTransportServiceName,
        )}`;
    }
    if (proxy.network === 'http' && proxy['http-opts']?.method) {
        vlessTransport += `&method=${encodeURIComponent(
            proxy['http-opts'].method,
        )}`;
    }
    if (proxy.network === 'kcp') {
        if (proxy.seed) {
            vlessTransport += `&seed=${encodeURIComponent(proxy.seed)}`;
        }
        if (proxy.headerType) {
            vlessTransport += `&headerType=${encodeURIComponent(
                proxy.headerType,
            )}`;
        }
    }
    if (
        proxy.network === 'ws' &&
        !proxy['ws-opts']?.['v2ray-http-upgrade'] &&
        proxy['ws-opts']?.['max-early-data'] != null
    ) {
        vlessTransport += `&ed=${encodeURIComponent(
            proxy['ws-opts']['max-early-data'],
        )}`;
    }
    if (
        proxy.network === 'ws' &&
        proxy['ws-opts']?.['v2ray-http-upgrade'] &&
        proxy['ws-opts']?.['max-early-data'] != null
    ) {
        vlessTransport += `&ed=${encodeURIComponent(
            proxy['ws-opts']['max-early-data'],
        )}`;
    }
    const earlyDataHeaderName = proxy['ws-opts']?.['early-data-header-name'];
    if (
        earlyDataHeaderName &&
        (proxy['ws-opts']?.['v2ray-http-upgrade'] ||
            proxy['ws-opts']?.['max-early-data'] == null ||
            earlyDataHeaderName !== 'Sec-WebSocket-Protocol')
    ) {
        vlessTransport += `&eh=${encodeURIComponent(earlyDataHeaderName)}`;
    }

    let packetEncoding = '';
    if (proxy['packet-addr']) {
        packetEncoding = '&packetEncoding=packet';
    } else if (proxy.udp === true && !proxy.xudp) {
        packetEncoding = '&packetEncoding=none';
    }

    return `vless://${proxy.uuid}@${proxy.server}:${
        proxy.port
    }?security=${encodeURIComponent(
        security,
    )}${vlessTransport}${packetEncoding}${alpn}${allowInsecure}${pcs}${ech}${h2}${sni}${fp}${flow}${sid}${spx}${pbk}${mode}${extra}${pqv}${encryption}#${encodeURIComponent(
        proxy.name,
    )}`;
}

export default function URI_Producer() {
    const type = 'SINGLE';
    const produce = (proxy) => {
        let result = '';
        delete proxy.subName;
        delete proxy.collectionName;
        delete proxy.id;
        delete proxy.resolved;
        delete proxy['no-resolve'];
        for (const key in proxy) {
            if (proxy[key] == null) {
                delete proxy[key];
            }
        }
        if (
            [
                'tuic',
                'hysteria',
                'hysteria2',
                'juicity',
                'trusttunnel',
            ].includes(proxy.type)
        ) {
            delete proxy.tls;
        }
        if (
            !['vmess'].includes(proxy.type) &&
            proxy.server &&
            isIPv6(proxy.server)
        ) {
            proxy.server = `[${proxy.server}]`;
        }
        switch (proxy.type) {
            case 'socks5':
                result = `socks://${encodeURIComponent(
                    Base64.encode(
                        `${proxy.username ?? ''}:${proxy.password ?? ''}`,
                    ),
                )}@${proxy.server}:${proxy.port}#${proxy.name}`;
                break;
            case 'ss':
                const userinfo = `${proxy.cipher}:${proxy.password}`;
                result = `ss://${
                    proxy.cipher?.startsWith('2022-blake3-')
                        ? `${encodeURIComponent(
                              proxy.cipher,
                          )}:${encodeURIComponent(proxy.password)}`
                        : Base64.encode(userinfo)
                }@${proxy.server}:${proxy.port}${proxy.plugin ? '/' : ''}`;
                let query = '';
                if (proxy.plugin) {
                    query += '&plugin=';
                    const opts = proxy['plugin-opts'];
                    switch (proxy.plugin) {
                        case 'obfs':
                            query += encodeURIComponent(
                                `simple-obfs;obfs=${opts.mode}${
                                    opts.host ? ';obfs-host=' + opts.host : ''
                                }`,
                            );
                            break;
                        case 'v2ray-plugin':
                            const mux = normalizePluginMuxValue(opts.mux);
                            // 为了兼容性 多输出 mode 和 host 两个字段
                            query += encodeURIComponent(
                                `v2ray-plugin;obfs=${opts.mode};mode=${
                                    opts.mode
                                }${opts.host ? ';obfs-host=' + opts.host : ''}${
                                    opts.host ? ';host=' + opts.host : ''
                                }${opts.path ? ';path=' + opts.path : ''}${
                                    opts.tls ? ';tls' : ''
                                }${opts.sni ? ';sni=' + opts.sni : ''}${
                                    opts['skip-cert-verify']
                                        ? ';skip-cert-verify=' +
                                          opts['skip-cert-verify']
                                        : ''
                                }${mux != null ? ';mux=' + mux : ''}`,
                            );
                            break;
                        case 'shadow-tls':
                            query += encodeURIComponent(
                                `shadow-tls;host=${opts.host};password=${opts.password};version=${opts.version}`,
                            );
                            break;
                        default:
                            throw new Error(
                                `Unsupported plugin option: ${proxy.plugin}`,
                            );
                    }
                }
                if (proxy['udp-over-tcp']) {
                    query += '&uot=1';
                }
                if (proxy.tfo) {
                    query += '&tfo=1';
                }
                let ssTransport = '';
                if (proxy.network) {
                    let ssType = proxy.network;
                    if (
                        proxy.network === 'ws' &&
                        proxy['ws-opts']?.['v2ray-http-upgrade']
                    ) {
                        ssType = 'httpupgrade';
                    }
                    ssTransport = `&type=${encodeURIComponent(ssType)}`;
                    if (['grpc'].includes(proxy.network)) {
                        let ssTransportServiceName =
                            proxy[`${proxy.network}-opts`]?.[
                                `${proxy.network}-service-name`
                            ];
                        let ssTransportAuthority =
                            proxy[`${proxy.network}-opts`]?.['_grpc-authority'];
                        if (ssTransportServiceName) {
                            ssTransport += `&serviceName=${encodeURIComponent(
                                ssTransportServiceName,
                            )}`;
                        }
                        if (ssTransportAuthority) {
                            ssTransport += `&authority=${encodeURIComponent(
                                ssTransportAuthority,
                            )}`;
                        }
                        ssTransport += `&mode=${encodeURIComponent(
                            proxy[`${proxy.network}-opts`]?.['_grpc-type'] ||
                                'gun',
                        )}`;
                    }
                    let ssTransportPath = proxy[`${proxy.network}-opts`]?.path;
                    let ssTransportHost =
                        proxy[`${proxy.network}-opts`]?.headers?.Host;
                    if (ssTransportPath) {
                        ssTransport += `&path=${encodeURIComponent(
                            Array.isArray(ssTransportPath)
                                ? ssTransportPath[0]
                                : ssTransportPath,
                        )}`;
                    }
                    if (ssTransportHost) {
                        ssTransport += `&host=${encodeURIComponent(
                            Array.isArray(ssTransportHost)
                                ? ssTransportHost[0]
                                : ssTransportHost,
                        )}`;
                    }
                }
                let ssFp = '';
                if (proxy['client-fingerprint']) {
                    ssFp = `&fp=${encodeURIComponent(
                        proxy['client-fingerprint'],
                    )}`;
                }
                let ssAlpn = '';
                if (proxy.alpn) {
                    ssAlpn = `&alpn=${encodeURIComponent(
                        Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : proxy.alpn.join(','),
                    )}`;
                }
                const ssIsReality = proxy['reality-opts'];
                let ssSid = '';
                let ssPbk = '';
                let ssSpx = '';
                let ssSecurity = proxy.tls ? '&security=tls' : '';
                let ssMode = '';
                let ssExtra = '';
                if (ssIsReality) {
                    ssSecurity = `&security=reality`;
                    const publicKey = proxy['reality-opts']?.['public-key'];
                    if (publicKey) {
                        ssPbk = `&pbk=${encodeURIComponent(publicKey)}`;
                    }
                    const shortId = proxy['reality-opts']?.['short-id'];
                    if (shortId) {
                        ssSid = `&sid=${encodeURIComponent(shortId)}`;
                    }
                    const spiderX = proxy['reality-opts']?.['_spider-x'];
                    if (spiderX) {
                        ssSpx = `&spx=${encodeURIComponent(spiderX)}`;
                    }
                    if (proxy._extra) {
                        ssExtra = `&extra=${encodeURIComponent(proxy._extra)}`;
                    }
                    if (proxy._mode) {
                        ssMode = `&mode=${encodeURIComponent(proxy._mode)}`;
                    }
                }
                if (proxy.tls) {
                    query += `&sni=${encodeURIComponent(
                        proxy.sni || proxy.server,
                    )}${proxy['skip-cert-verify'] ? '&allowInsecure=1' : ''}`;
                }
                query += `${ssTransport}${ssAlpn}${ssFp}${ssSecurity}${ssSid}${ssPbk}${ssSpx}${ssMode}${ssExtra}#${encodeURIComponent(
                    proxy.name,
                )}`;
                result += query.replace(/^&/, '?');
                break;
            case 'ssr':
                result = `${proxy.server}:${proxy.port}:${proxy.protocol}:${
                    proxy.cipher
                }:${proxy.obfs}:${Base64.encode(proxy.password)}/`;
                result += `?remarks=${Base64.encode(proxy.name)}${
                    proxy['obfs-param']
                        ? '&obfsparam=' + Base64.encode(proxy['obfs-param'])
                        : ''
                }${
                    proxy['protocol-param']
                        ? '&protocolparam=' +
                          Base64.encode(proxy['protocol-param'])
                        : ''
                }`;
                result = 'ssr://' + Base64.encode(result);
                break;
            case 'vmess':
                // V2RayN URI format
                let type = '';
                let net = proxy.network || 'tcp';
                if (proxy.network === 'http') {
                    net = 'tcp';
                    type = 'http';
                } else if (
                    proxy.network === 'ws' &&
                    proxy['ws-opts']?.['v2ray-http-upgrade']
                ) {
                    net = 'httpupgrade';
                }
                result = {
                    v: '2',
                    ps: proxy.name,
                    add: proxy.server,
                    port: `${proxy.port}`,
                    id: proxy.uuid,
                    aid: `${proxy.alterId || 0}`,
                    scy: proxy.cipher,
                    net,
                    type,
                    tls: proxy.tls ? 'tls' : '',
                    alpn: Array.isArray(proxy.alpn)
                        ? proxy.alpn.join(',')
                        : proxy.alpn,
                    fp: proxy['client-fingerprint'],
                };
                if (proxy.tls && proxy.sni) {
                    result.sni = proxy.sni;
                }
                // obfs
                if (proxy.network) {
                    let vmessTransportPath =
                        proxy[`${proxy.network}-opts`]?.path;
                    let vmessTransportHost =
                        proxy[`${proxy.network}-opts`]?.headers?.Host;

                    if (['grpc'].includes(proxy.network)) {
                        result.path =
                            proxy[`${proxy.network}-opts`]?.[
                                'grpc-service-name'
                            ];
                        // https://github.com/XTLS/Xray-core/issues/91
                        result.type =
                            proxy[`${proxy.network}-opts`]?.['_grpc-type'] ||
                            'gun';
                        result.host =
                            proxy[`${proxy.network}-opts`]?.['_grpc-authority'];
                    } else if (['kcp', 'quic'].includes(proxy.network)) {
                        // https://github.com/XTLS/Xray-core/issues/91
                        result.type =
                            proxy[`${proxy.network}-opts`]?.[
                                `_${proxy.network}-type`
                            ] || 'none';
                        result.host =
                            proxy[`${proxy.network}-opts`]?.[
                                `_${proxy.network}-host`
                            ];
                        result.path =
                            proxy[`${proxy.network}-opts`]?.[
                                `_${proxy.network}-path`
                            ];
                    } else {
                        if (vmessTransportPath) {
                            result.path = Array.isArray(vmessTransportPath)
                                ? vmessTransportPath[0]
                                : vmessTransportPath;
                        }
                        if (vmessTransportHost) {
                            result.host = Array.isArray(vmessTransportHost)
                                ? vmessTransportHost[0]
                                : vmessTransportHost;
                        }
                    }
                }
                result = 'vmess://' + Base64.encode(JSON.stringify(result));
                break;
            case 'vless':
                result = vless(proxy);
                break;
            case 'trojan':
                let trojanTransport = '';
                if (proxy.network) {
                    let trojanType = proxy.network;
                    if (
                        proxy.network === 'ws' &&
                        proxy['ws-opts']?.['v2ray-http-upgrade']
                    ) {
                        trojanType = 'httpupgrade';
                    }
                    trojanTransport = `&type=${encodeURIComponent(trojanType)}`;
                    if (['grpc'].includes(proxy.network)) {
                        let trojanTransportServiceName =
                            proxy[`${proxy.network}-opts`]?.[
                                `${proxy.network}-service-name`
                            ];
                        let trojanTransportAuthority =
                            proxy[`${proxy.network}-opts`]?.['_grpc-authority'];
                        if (trojanTransportServiceName) {
                            trojanTransport += `&serviceName=${encodeURIComponent(
                                trojanTransportServiceName,
                            )}`;
                        }
                        if (trojanTransportAuthority) {
                            trojanTransport += `&authority=${encodeURIComponent(
                                trojanTransportAuthority,
                            )}`;
                        }
                        trojanTransport += `&mode=${encodeURIComponent(
                            proxy[`${proxy.network}-opts`]?.['_grpc-type'] ||
                                'gun',
                        )}`;
                    }
                    let trojanTransportPath =
                        proxy[`${proxy.network}-opts`]?.path;
                    let trojanTransportHost =
                        proxy[`${proxy.network}-opts`]?.headers?.Host;
                    if (trojanTransportPath) {
                        trojanTransport += `&path=${encodeURIComponent(
                            Array.isArray(trojanTransportPath)
                                ? trojanTransportPath[0]
                                : trojanTransportPath,
                        )}`;
                    }
                    if (trojanTransportHost) {
                        trojanTransport += `&host=${encodeURIComponent(
                            Array.isArray(trojanTransportHost)
                                ? trojanTransportHost[0]
                                : trojanTransportHost,
                        )}`;
                    }
                }
                let trojanFp = '';
                if (proxy['client-fingerprint']) {
                    trojanFp = `&fp=${encodeURIComponent(
                        proxy['client-fingerprint'],
                    )}`;
                }
                let trojanPcs = '';
                if (proxy['tls-fingerprint']) {
                    trojanPcs = `&pcs=${encodeURIComponent(
                        proxy['tls-fingerprint'],
                    )}`;
                }
                let trojanAlpn = '';
                if (proxy.alpn) {
                    trojanAlpn = `&alpn=${encodeURIComponent(
                        Array.isArray(proxy.alpn)
                            ? proxy.alpn
                            : proxy.alpn.join(','),
                    )}`;
                }
                const trojanIsReality = proxy['reality-opts'];
                let trojanSid = '';
                let trojanPbk = '';
                let trojanSpx = '';
                let trojanSecurity = '';
                let trojanMode = '';
                let trojanExtra = '';
                if (trojanIsReality) {
                    trojanSecurity = `&security=reality`;
                    const publicKey = proxy['reality-opts']?.['public-key'];
                    if (publicKey) {
                        trojanPbk = `&pbk=${encodeURIComponent(publicKey)}`;
                    }
                    const shortId = proxy['reality-opts']?.['short-id'];
                    if (shortId) {
                        trojanSid = `&sid=${encodeURIComponent(shortId)}`;
                    }
                    const spiderX = proxy['reality-opts']?.['_spider-x'];
                    if (spiderX) {
                        trojanSpx = `&spx=${encodeURIComponent(spiderX)}`;
                    }
                    if (proxy._extra) {
                        trojanExtra = `&extra=${encodeURIComponent(
                            proxy._extra,
                        )}`;
                    }
                    if (proxy._mode) {
                        trojanMode = `&mode=${encodeURIComponent(proxy._mode)}`;
                    }
                }
                result = `trojan://${proxy.password}@${proxy.server}:${
                    proxy.port
                }?sni=${encodeURIComponent(proxy.sni || proxy.server)}${
                    proxy['skip-cert-verify'] ? '&allowInsecure=1' : ''
                }${trojanTransport}${trojanAlpn}${trojanFp}${trojanPcs}${trojanSecurity}${trojanSid}${trojanPbk}${trojanSpx}${trojanMode}${trojanExtra}#${encodeURIComponent(
                    proxy.name,
                )}`;
                break;
            case 'hysteria2':
                let hysteria2params = [];
                if (proxy['hop-interval']) {
                    hysteria2params.push(
                        `hop-interval=${proxy['hop-interval']}`,
                    );
                }
                if (proxy['keepalive']) {
                    hysteria2params.push(`keepalive=${proxy['keepalive']}`);
                }
                if (proxy['skip-cert-verify']) {
                    hysteria2params.push(`insecure=1`);
                }
                if (proxy.obfs) {
                    hysteria2params.push(
                        `obfs=${encodeURIComponent(proxy.obfs)}`,
                    );
                    if (proxy['obfs-password']) {
                        hysteria2params.push(
                            `obfs-password=${encodeURIComponent(
                                proxy['obfs-password'],
                            )}`,
                        );
                    }
                }
                if (proxy.sni) {
                    hysteria2params.push(
                        `sni=${encodeURIComponent(proxy.sni)}`,
                    );
                }
                if (proxy.ports) {
                    hysteria2params.push(`mport=${proxy.ports}`);
                }
                if (proxy['tls-fingerprint']) {
                    hysteria2params.push(
                        `pinSHA256=${encodeURIComponent(
                            proxy['tls-fingerprint'],
                        )}`,
                    );
                }
                if (proxy.tfo) {
                    hysteria2params.push(`fastopen=1`);
                }
                result = `hysteria2://${encodeURIComponent(proxy.password)}@${
                    proxy.server
                }:${proxy.port}?${hysteria2params.join(
                    '&',
                )}#${encodeURIComponent(proxy.name)}`;
                break;
            case 'hysteria':
                let hysteriaParams = [];
                Object.keys(proxy).forEach((key) => {
                    if (!['name', 'type', 'server', 'port'].includes(key)) {
                        const i = key.replace(/-/, '_');
                        if (['alpn'].includes(key)) {
                            if (proxy[key]) {
                                hysteriaParams.push(
                                    `${i}=${encodeURIComponent(
                                        Array.isArray(proxy[key])
                                            ? proxy[key][0]
                                            : proxy[key],
                                    )}`,
                                );
                            }
                        } else if (['skip-cert-verify'].includes(key)) {
                            if (proxy[key]) {
                                hysteriaParams.push(`insecure=1`);
                            }
                        } else if (['tfo', 'fast-open'].includes(key)) {
                            if (
                                proxy[key] &&
                                !hysteriaParams.includes('fastopen=1')
                            ) {
                                hysteriaParams.push(`fastopen=1`);
                            }
                        } else if (['ports'].includes(key)) {
                            hysteriaParams.push(`mport=${proxy[key]}`);
                        } else if (['auth-str'].includes(key)) {
                            hysteriaParams.push(`auth=${proxy[key]}`);
                        } else if (['up'].includes(key)) {
                            hysteriaParams.push(`upmbps=${proxy[key]}`);
                        } else if (['down'].includes(key)) {
                            hysteriaParams.push(`downmbps=${proxy[key]}`);
                        } else if (['_obfs'].includes(key)) {
                            hysteriaParams.push(`obfs=${proxy[key]}`);
                        } else if (['obfs'].includes(key)) {
                            hysteriaParams.push(`obfsParam=${proxy[key]}`);
                        } else if (['sni'].includes(key)) {
                            hysteriaParams.push(`peer=${proxy[key]}`);
                        } else if (proxy[key] && !/^_/i.test(key)) {
                            hysteriaParams.push(
                                `${i}=${encodeURIComponent(proxy[key])}`,
                            );
                        }
                    }
                });

                result = `hysteria://${proxy.server}:${
                    proxy.port
                }?${hysteriaParams.join('&')}#${encodeURIComponent(
                    proxy.name,
                )}`;
                break;

            case 'tuic':
                if (!proxy.token || proxy.token.length === 0) {
                    let tuicParams = [];
                    Object.keys(proxy).forEach((key) => {
                        if (
                            ![
                                'name',
                                'type',
                                'uuid',
                                'password',
                                'server',
                                'port',
                                'tls',
                            ].includes(key)
                        ) {
                            const i = key.replace(/-/, '_');
                            if (['alpn'].includes(key)) {
                                if (proxy[key]) {
                                    tuicParams.push(
                                        `${i}=${encodeURIComponent(
                                            Array.isArray(proxy[key])
                                                ? proxy[key][0]
                                                : proxy[key],
                                        )}`,
                                    );
                                }
                            } else if (['skip-cert-verify'].includes(key)) {
                                if (proxy[key]) {
                                    tuicParams.push(`allow_insecure=1`);
                                }
                            } else if (['tfo', 'fast-open'].includes(key)) {
                                if (
                                    proxy[key] &&
                                    !tuicParams.includes('fast_open=1')
                                ) {
                                    tuicParams.push(`fast_open=1`);
                                }
                            } else if (
                                ['disable-sni', 'reduce-rtt'].includes(key) &&
                                proxy[key]
                            ) {
                                tuicParams.push(`${i.replace(/-/g, '_')}=1`);
                            } else if (
                                ['congestion-controller'].includes(key)
                            ) {
                                tuicParams.push(
                                    `congestion_control=${proxy[key]}`,
                                );
                            } else if (proxy[key] && !/^_/i.test(key)) {
                                tuicParams.push(
                                    `${i.replace(
                                        /-/g,
                                        '_',
                                    )}=${encodeURIComponent(proxy[key])}`,
                                );
                            }
                        }
                    });

                    result = `tuic://${encodeURIComponent(
                        proxy.uuid,
                    )}:${encodeURIComponent(proxy.password)}@${proxy.server}:${
                        proxy.port
                    }?${tuicParams.join('&')}#${encodeURIComponent(
                        proxy.name,
                    )}`;
                }
                break;
            case 'anytls':
                result = vless({
                    ...proxy,
                    uuid: proxy.password,
                    network: proxy.network || 'tcp',
                }).replace('vless', 'anytls');
                // 偷个懒
                let anytlsParams = [];
                Object.keys(proxy).forEach((key) => {
                    if (
                        ![
                            'name',
                            'type',
                            'password',
                            'server',
                            'port',
                            'tls',
                        ].includes(key)
                    ) {
                        const i = key.replace(/-/, '_');
                        if (['alpn'].includes(key)) {
                            if (proxy[key]) {
                                anytlsParams.push(
                                    `${i}=${encodeURIComponent(
                                        Array.isArray(proxy[key])
                                            ? proxy[key][0]
                                            : proxy[key],
                                    )}`,
                                );
                            }
                        } else if (['skip-cert-verify'].includes(key)) {
                            if (proxy[key]) {
                                anytlsParams.push(`insecure=1`);
                            }
                        } else if (['udp'].includes(key)) {
                            if (proxy[key]) {
                                anytlsParams.push(`udp=1`);
                            }
                        } else if (
                            proxy[key] &&
                            !/^_|client-fingerprint/i.test(key) &&
                            ['number', 'string', 'boolean'].includes(
                                typeof proxy[key],
                            )
                        ) {
                            anytlsParams.push(
                                `${i.replace(/-/g, '_')}=${encodeURIComponent(
                                    proxy[key],
                                )}`,
                            );
                        }
                    }
                });
                // Parse existing query parameters from result
                const urlParts = result.split('?');
                let baseUrl = urlParts[0];
                let existingParams = {};

                if (urlParts.length > 1) {
                    const queryString = urlParts[1].split('#')[0]; // Remove fragment if exists
                    const pairs = queryString.split('&');
                    pairs.forEach((pair) => {
                        const [key, value] = pair.split('=');
                        if (key) {
                            existingParams[key] = value;
                        }
                    });
                }

                // Merge anytlsParams with existing parameters
                anytlsParams.forEach((param) => {
                    const [key, value] = param.split('=');
                    if (key) {
                        existingParams[key] = value;
                    }
                });

                // Reconstruct query string
                const newParams = Object.keys(existingParams)
                    .map((key) => `${key}=${existingParams[key]}`)
                    .join('&');

                // Get fragment part if exists
                const fragmentMatch = result.match(/#(.*)$/);
                const fragment = fragmentMatch ? `#${fragmentMatch[1]}` : '';

                result = `${baseUrl}?${newParams}${fragment}`;
                // result = `anytls://${encodeURIComponent(proxy.password)}@${
                //     proxy.server
                // }:${proxy.port}/?${anytlsParams.join('&')}#${encodeURIComponent(
                //     proxy.name,
                // )}`;
                break;
            case 'wireguard':
                let wireguardParams = [];

                Object.keys(proxy).forEach((key) => {
                    if (
                        ![
                            'name',
                            'type',
                            'server',
                            'port',
                            'ip',
                            'ipv6',
                            'ip-cidr',
                            'ipv6-cidr',
                            'private-key',
                        ].includes(key)
                    ) {
                        if (['public-key'].includes(key)) {
                            wireguardParams.push(
                                `publickey=${encodeURIComponent(proxy[key])}`,
                            );
                        } else if (['udp'].includes(key)) {
                            if (proxy[key]) {
                                wireguardParams.push(`${key}=1`);
                            }
                        } else if (proxy[key] && !/^_/i.test(key)) {
                            wireguardParams.push(
                                `${key}=${encodeURIComponent(proxy[key])}`,
                            );
                        }
                    }
                });
                const wireguardIPv4 = getWireGuardAddressWithCIDR(
                    proxy,
                    'ipv4',
                );
                const wireguardIPv6 = getWireGuardAddressWithCIDR(
                    proxy,
                    'ipv6',
                );
                if (wireguardIPv4 && wireguardIPv6) {
                    wireguardParams.push(
                        `address=${encodeURIComponent(
                            `${wireguardIPv4},${wireguardIPv6}`,
                        )}`,
                    );
                } else if (wireguardIPv4) {
                    wireguardParams.push(
                        `address=${encodeURIComponent(wireguardIPv4)}`,
                    );
                } else if (wireguardIPv6) {
                    wireguardParams.push(
                        `address=${encodeURIComponent(wireguardIPv6)}`,
                    );
                }
                result = `wireguard://${encodeURIComponent(
                    proxy['private-key'],
                )}@${proxy.server}:${proxy.port}/?${wireguardParams.join(
                    '&',
                )}#${encodeURIComponent(proxy.name)}`;
                break;
        }
        return result;
    };
    return { type, produce };
}
