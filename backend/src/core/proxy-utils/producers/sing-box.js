import ClashMeta_Producer from './clashmeta';
import $ from '@/core/app';
import { isPlainObject } from '@/utils';
import { getWireGuardAddressWithCIDR, normalizePluginMuxValue } from './utils';
import {
    extractPathQueryParam,
    getSafeIntegerPathQueryParam,
    parseSafeIntegerValue,
} from '../transport-path';
import { normalizeVmessSecurity } from '../vmess-security';

const ipVersions = {
    ipv4: 'ipv4_only',
    ipv6: 'ipv6_only',
    'v4-only': 'ipv4_only',
    'v6-only': 'ipv6_only',
    'ipv4-prefer': 'prefer_ipv4',
    'ipv6-prefer': 'prefer_ipv6',
    'prefer-v4': 'prefer_ipv4',
    'prefer-v6': 'prefer_ipv6',
};

const ipVersionParser = (proxy, parsedProxy) => {
    const strategy = ipVersions[proxy['ip-version']];
    if (proxy._dns_server && strategy) {
        parsedProxy.domain_resolver = {
            server: proxy._dns_server,
            strategy,
        };
    }
};
const domainResolverParser = (proxy, parsedProxy) => {
    if (!proxy._domain_resolver) {
        return;
    }

    if (typeof proxy._domain_resolver === 'string') {
        parsedProxy.domain_resolver = {
            ...(parsedProxy.domain_resolver ?? {}),
            server: proxy._domain_resolver,
        };
    } else {
        parsedProxy.domain_resolver = {
            ...(parsedProxy.domain_resolver ?? {}),
            ...proxy._domain_resolver,
        };
    }
};
const hasControlHTTPClient = (proxy) => {
    const value = proxy['control-http-client'];
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (isPlainObject(value)) {
        return Object.values(value).some(
            (item) => item !== undefined && item !== null && item !== '',
        );
    }
    return true;
};
const detourParser = (proxy, parsedProxy) => {
    parsedProxy.detour = proxy['dialer-proxy'] || proxy.detour;
};
const networkParser = (proxy, parsedProxy) => {
    if (['tcp', 'udp'].includes(proxy._network)) {
        parsedProxy.network = proxy._network;
        return;
    }
    if (proxy.udp === false) {
        parsedProxy.network = 'tcp';
    }
};
const tfoParser = (proxy, parsedProxy) => {
    parsedProxy.tcp_fast_open = false;
    if (proxy.tfo) parsedProxy.tcp_fast_open = true;
    if (proxy.tcp_fast_open) parsedProxy.tcp_fast_open = true;
    if (proxy['tcp-fast-open']) parsedProxy.tcp_fast_open = true;
    if (!parsedProxy.tcp_fast_open) delete parsedProxy.tcp_fast_open;
};

const smuxParser = (smux, proxy) => {
    if (!smux || !smux.enabled) return;
    proxy.multiplex = { enabled: true };
    proxy.multiplex.protocol = smux.protocol;
    if (smux['max-connections'])
        proxy.multiplex.max_connections = parseInt(
            `${smux['max-connections']}`,
            10,
        );
    if (smux['max-streams'])
        proxy.multiplex.max_streams = parseInt(`${smux['max-streams']}`, 10);
    if (smux['min-streams'])
        proxy.multiplex.min_streams = parseInt(`${smux['min-streams']}`, 10);
    if (smux.padding) proxy.multiplex.padding = true;
    if (smux['brutal-opts']?.up || smux['brutal-opts']?.down) {
        proxy.multiplex.brutal = {
            enabled: true,
        };
        if (smux['brutal-opts']?.up)
            proxy.multiplex.brutal.up_mbps = parseInt(
                `${smux['brutal-opts']?.up}`,
                10,
            );
        if (smux['brutal-opts']?.down)
            proxy.multiplex.brutal.down_mbps = parseInt(
                `${smux['brutal-opts']?.down}`,
                10,
            );
    }
};

const wsParser = (proxy, parsedProxy) => {
    const transport = { type: 'ws', headers: {} };
    if (proxy['ws-opts']) {
        const {
            path: wsPath = '',
            headers: wsHeaders = {},
            'max-early-data': max_early_data,
            'early-data-header-name': early_data_header_name,
        } = proxy['ws-opts'];
        transport.early_data_header_name = early_data_header_name;
        transport.max_early_data = max_early_data
            ? parseInt(max_early_data, 10)
            : undefined;
        if (wsPath !== '') transport.path = `${wsPath}`;
        if (Object.keys(wsHeaders).length > 0) {
            const headers = {};
            for (const key of Object.keys(wsHeaders)) {
                let value = wsHeaders[key];
                if (value === '') continue;
                if (!Array.isArray(value)) value = [`${value}`];
                if (value.length > 0) headers[key] = value;
            }
            const { Host: wsHost } = headers;
            if (wsHost.length === 1)
                for (const item of `Host:${wsHost[0]}`.split('\n')) {
                    const [key, value] = item.split(':');
                    if (value.trim() === '') continue;
                    headers[key.trim()] = value.trim().split(',');
                }
            transport.headers = headers;
        }
    }
    if (proxy['ws-headers']) {
        const headers = {};
        for (const key of Object.keys(proxy['ws-headers'])) {
            let value = proxy['ws-headers'][key];
            if (value === '') continue;
            if (!Array.isArray(value)) value = [`${value}`];
            if (value.length > 0) headers[key] = value;
        }
        const { Host: wsHost } = headers;
        if (wsHost.length === 1)
            for (const item of `Host:${wsHost[0]}`.split('\n')) {
                const [key, value] = item.split(':');
                if (value.trim() === '') continue;
                headers[key.trim()] = value.trim().split(',');
            }
        for (const key of Object.keys(headers))
            transport.headers[key] = headers[key];
    }
    if (proxy['ws-path'] && proxy['ws-path'] !== '')
        transport.path = `${proxy['ws-path']}`;
    if (transport.path) {
        const { value: ed, parsed: maxEarlyData } =
            getSafeIntegerPathQueryParam(transport.path, 'ed');
        if (ed !== '') {
            transport.path = extractPathQueryParam(transport.path, 'ed').path;
            transport.early_data_header_name = 'Sec-WebSocket-Protocol';
            transport.max_early_data = maxEarlyData;
        }
    }

    if (parsedProxy.tls.insecure)
        parsedProxy.tls.server_name = transport.headers.Host[0];
    if (proxy['ws-opts'] && proxy['ws-opts']['v2ray-http-upgrade']) {
        transport.type = 'httpupgrade';
        if (transport.headers.Host) {
            transport.host = transport.headers.Host[0];
            delete transport.headers.Host;
        }
        if (transport.max_early_data) delete transport.max_early_data;
        if (transport.early_data_header_name)
            delete transport.early_data_header_name;
    }
    for (const key of Object.keys(transport.headers)) {
        const value = transport.headers[key];
        if (value.length === 1) transport.headers[key] = value[0];
    }
    parsedProxy.transport = transport;
};

const h1Parser = (proxy, parsedProxy) => {
    const transport = { type: 'http', headers: {} };
    if (proxy['http-opts']) {
        const {
            method = '',
            path: h1Path = '',
            headers: h1Headers = {},
        } = proxy['http-opts'];
        if (method !== '') transport.method = method;
        if (Array.isArray(h1Path)) {
            transport.path = `${h1Path[0]}`;
        } else if (h1Path !== '') transport.path = `${h1Path}`;
        for (const key of Object.keys(h1Headers)) {
            let value = h1Headers[key];
            if (value === '') continue;
            if (key.toLowerCase() === 'host') {
                let host = value;
                if (!Array.isArray(host))
                    host = `${host}`.split(',').map((i) => i.trim());
                if (host.length > 0) transport.host = host;
                continue;
            }
            if (!Array.isArray(value))
                value = `${value}`.split(',').map((i) => i.trim());
            if (value.length > 0) transport.headers[key] = value;
        }
    }
    if (proxy['http-host'] && proxy['http-host'] !== '') {
        let host = proxy['http-host'];
        if (!Array.isArray(host))
            host = `${host}`.split(',').map((i) => i.trim());
        if (host.length > 0) transport.host = host;
    }
    // if (!transport.host) return;
    if (proxy['http-path'] && proxy['http-path'] !== '') {
        const path = proxy['http-path'];
        if (Array.isArray(path)) {
            transport.path = `${path[0]}`;
        } else if (path !== '') transport.path = `${path}`;
    }
    if (parsedProxy.tls.insecure)
        parsedProxy.tls.server_name = transport.host[0];
    if (transport.host?.length === 1) transport.host = transport.host[0];
    for (const key of Object.keys(transport.headers)) {
        const value = transport.headers[key];
        if (value.length === 1) transport.headers[key] = value[0];
    }
    parsedProxy.transport = transport;
};

const h2Parser = (proxy, parsedProxy) => {
    const transport = { type: 'http' };
    if (proxy['h2-opts']) {
        let { host = '', path = '' } = proxy['h2-opts'];
        if (path !== '') transport.path = `${path}`;
        if (host !== '') {
            if (!Array.isArray(host))
                host = `${host}`.split(',').map((i) => i.trim());
            if (host.length > 0) transport.host = host;
        }
    }
    if (proxy['h2-host'] && proxy['h2-host'] !== '') {
        let host = proxy['h2-host'];
        if (!Array.isArray(host))
            host = `${host}`.split(',').map((i) => i.trim());
        if (host.length > 0) transport.host = host;
    }
    if (proxy['h2-path'] && proxy['h2-path'] !== '')
        transport.path = `${proxy['h2-path']}`;
    parsedProxy.tls.enabled = true;
    if (parsedProxy.tls.insecure)
        parsedProxy.tls.server_name = transport.host[0];
    if (transport.host.length === 1) transport.host = transport.host[0];
    parsedProxy.transport = transport;
};

const grpcParser = (proxy, parsedProxy) => {
    const transport = { type: 'grpc' };
    if (proxy['grpc-opts']) {
        const serviceName = proxy['grpc-opts']['grpc-service-name'];
        if (serviceName != null && serviceName !== '')
            transport.service_name = `${serviceName}`;
    }
    parsedProxy.transport = transport;
};

const normalizePemLines = (value, label) => {
    const items = Array.isArray(value) ? value : [value];
    const lines = [];

    for (const item of items) {
        const normalized = `${item}`
            .trim()
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n');
        if (normalized === '') continue;

        for (const line of normalized.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed !== '') lines.push(trimmed);
        }
    }

    if (lines.length === 0) return undefined;
    if (lines.some((line) => /^-----BEGIN [A-Za-z0-9 -]+-----$/.test(line))) {
        return lines;
    }
    return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`];
};

const singBoxUtlsFingerprints = [
    'chrome',
    'firefox',
    'edge',
    'safari',
    '360',
    'qq',
    'ios',
    'android',
    'random',
    'randomized',
];

const getSingBoxUtlsFingerprint = (value) => {
    const fingerprint = `${value || ''}`.trim().toLowerCase();
    if (singBoxUtlsFingerprints.includes(fingerprint)) return fingerprint;
};

const tlsParser = (proxy, parsedProxy) => {
    if (proxy.tls) parsedProxy.tls.enabled = true;
    if (proxy.servername && proxy.servername !== '')
        parsedProxy.tls.server_name = proxy.servername;
    if (proxy.peer && proxy.peer !== '')
        parsedProxy.tls.server_name = proxy.peer;
    if (proxy.sni && proxy.sni !== '') parsedProxy.tls.server_name = proxy.sni;
    if (proxy['skip-cert-verify']) parsedProxy.tls.insecure = true;
    if (proxy.insecure) parsedProxy.tls.insecure = true;
    if (proxy['disable-sni']) parsedProxy.tls.disable_sni = true;
    if (typeof proxy.alpn === 'string') {
        parsedProxy.tls.alpn = [proxy.alpn];
    } else if (Array.isArray(proxy.alpn)) parsedProxy.tls.alpn = proxy.alpn;
    if (proxy.ca) parsedProxy.tls.certificate_path = `${proxy.ca}`;
    if (proxy.ca_str) parsedProxy.tls.certificate = [proxy.ca_str];
    if (proxy['ca-str']) parsedProxy.tls.certificate = [proxy['ca-str']];
    if (proxy['reality-opts']) {
        parsedProxy.tls.reality = { enabled: true };
        if (proxy['reality-opts']['public-key'])
            parsedProxy.tls.reality.public_key =
                proxy['reality-opts']['public-key'];
        if (proxy['reality-opts']['short-id'])
            parsedProxy.tls.reality.short_id =
                proxy['reality-opts']['short-id'];
        parsedProxy.tls.utls = { enabled: true };
    }
    if (
        !['hysteria', 'hysteria2', 'tuic'].includes(proxy.type) &&
        proxy['client-fingerprint'] &&
        proxy['client-fingerprint'] !== ''
    ) {
        const fingerprint = getSingBoxUtlsFingerprint(
            proxy['client-fingerprint'],
        );
        if (fingerprint)
            parsedProxy.tls.utls = {
                ...parsedProxy.tls.utls,
                enabled: true,
                fingerprint,
            };
    }
    if (proxy._ech && isPlainObject(proxy._ech)) {
        parsedProxy.tls.ech = proxy._ech;
    } else if (proxy['ech-opts'] && isPlainObject(proxy['ech-opts'])) {
        parsedProxy.tls.ech = parsedProxy.tls.ech || {};
        parsedProxy.tls.ech.enabled = proxy['ech-opts'].enable;
        const echOptsConfig = proxy['ech-opts'].config;
        if (Array.isArray(echOptsConfig) || typeof echOptsConfig === 'string') {
            const config = normalizePemLines(echOptsConfig, 'ECH CONFIGS');
            if (config) parsedProxy.tls.ech.config = config;
        }
        parsedProxy.tls.ech.query_server_name =
            proxy['ech-opts']['query-server-name'];
        parsedProxy.tls.ech.config_path = proxy['ech-opts']['config-path'];
        parsedProxy.tls.ech.fragment = proxy['ech-opts']['fragment'];
        parsedProxy.tls.ech.fragment_fallback_delay =
            proxy['ech-opts']['fragment-fallback-delay'];
        parsedProxy.tls.ech.record_fragment =
            proxy['ech-opts']['record-fragment'];
    }
    if (proxy._curve_preferences && Array.isArray(proxy._curve_preferences)) {
        parsedProxy.tls.curve_preferences = proxy._curve_preferences;
    }
    if (proxy['_fragment']) parsedProxy.tls.fragment = !!proxy['_fragment'];
    if (proxy['_fragment_fallback_delay'])
        parsedProxy.tls.fragment_fallback_delay =
            proxy['_fragment_fallback_delay'];
    if (proxy['_record_fragment'])
        parsedProxy.tls.record_fragment = !!proxy['_record_fragment'];
    if (proxy['_certificate'])
        parsedProxy.tls.certificate = proxy['_certificate'];
    if (proxy['_certificate_path'])
        parsedProxy.tls.certificate_path = proxy['_certificate_path'];
    if (proxy['_certificate_public_key_sha256'])
        parsedProxy.tls.certificate_public_key_sha256 =
            proxy['_certificate_public_key_sha256'];
    if (proxy['_client_certificate'])
        parsedProxy.tls.client_certificate = proxy['_client_certificate'];
    if (proxy['_client_certificate_path'])
        parsedProxy.tls.client_certificate_path =
            proxy['_client_certificate_path'];
    if (proxy['_client_key']) parsedProxy.tls.client_key = proxy['_client_key'];
    if (proxy['_client_key_path'])
        parsedProxy.tls.client_key_path = proxy['_client_key_path'];
    if (!parsedProxy.tls.enabled) delete parsedProxy.tls;
};

const sshParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'ssh',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy.username) parsedProxy.user = proxy.username;
    if (proxy.password) parsedProxy.password = proxy.password;
    // https://wiki.metacubex.one/config/proxies/ssh
    // https://sing-box.sagernet.org/zh/configuration/outbound/ssh
    if (proxy['privateKey']) parsedProxy.private_key_path = proxy['privateKey'];
    if (proxy['private-key'])
        parsedProxy.private_key_path = proxy['private-key'];
    if (proxy['private-key-passphrase'])
        parsedProxy.private_key_passphrase = proxy['private-key-passphrase'];
    if (proxy['server-fingerprint']) {
        parsedProxy.host_key = [proxy['server-fingerprint']];
        // https://manual.nssurge.com/policy/ssh.html
        // Surge only supports curve25519-sha256 as the kex algorithm and aes128-gcm as the encryption algorithm. It means that the SSH server must use OpenSSH v7.3 or above. (It should not be a problem since OpenSSH 7.3 was released on 2016-08-01.)
        // TODO: ?
        parsedProxy.host_key_algorithms = [
            proxy['server-fingerprint'].split(' ')[0],
        ];
    }
    if (proxy['host-key']) parsedProxy.host_key = proxy['host-key'];
    if (proxy['host-key-algorithms'])
        parsedProxy.host_key_algorithms = proxy['host-key-algorithms'];
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};

const httpParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'http',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        tls: { enabled: false, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy.username) parsedProxy.username = proxy.username;
    if (proxy.password) parsedProxy.password = proxy.password;
    if (proxy.headers) {
        parsedProxy.headers = {};
        for (const k of Object.keys(proxy.headers)) {
            parsedProxy.headers[k] = `${proxy.headers[k]}`;
        }
        if (Object.keys(parsedProxy.headers).length === 0)
            delete parsedProxy.headers;
    }
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};

const socks5Parser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'socks',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        version: '5',
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy.username) parsedProxy.username = proxy.username;
    if (proxy.password) parsedProxy.password = proxy.password;
    if (proxy.uot) parsedProxy.udp_over_tcp = true;
    if (proxy['udp-over-tcp']) {
        parsedProxy.udp_over_tcp = {
            enabled: true,
            version:
                !proxy['udp-over-tcp-version'] ||
                proxy['udp-over-tcp-version'] === 1
                    ? 1
                    : 2,
        };
    }
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};

const shadowTLSParser = (proxy = {}) => {
    const pluginOpts = getShadowTLSPluginOpts(proxy);
    const ssPart = {
        tag: proxy.name,
        type: 'shadowsocks',
        method: proxy.cipher,
        password: proxy.password,
        detour: getShadowTLSTag(proxy),
    };
    if (proxy.uot) ssPart.udp_over_tcp = true;
    if (proxy['udp-over-tcp']) {
        ssPart.udp_over_tcp = {
            enabled: true,
            version:
                !proxy['udp-over-tcp-version'] ||
                proxy['udp-over-tcp-version'] === 1
                    ? 1
                    : 2,
        };
    }
    networkParser(proxy, ssPart);
    smuxParser(proxy.smux, ssPart);
    return {
        type: 'ss-with-st',
        ssPart,
        stPart: shadowTLSOutboundParser(proxy, pluginOpts),
    };
};

const getShadowTLSTag = (proxy = {}) => `${proxy.name}_shadowtls`;

const getShadowTLSPluginOpts = (proxy = {}) => {
    if (proxy.plugin === 'shadow-tls' && proxy['plugin-opts']) {
        return proxy['plugin-opts'];
    }
    if (proxy.type === 'snell' && proxy['obfs-opts']?.mode === 'shadow-tls') {
        return {
            host: proxy['obfs-opts'].host,
            password: proxy['obfs-opts'].password,
            version: proxy['obfs-opts'].version,
            alpn: proxy['obfs-opts'].alpn,
        };
    }
    return undefined;
};

const normalizeALPN = (alpn) => {
    if (typeof alpn === 'string') {
        return alpn
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item !== '');
    }
    if (Array.isArray(alpn)) return alpn;
    return undefined;
};

const shadowTLSOutboundParser = (proxy = {}, pluginOpts) => {
    if (!pluginOpts) throw new Error('shadow-tls plugin options are missing');
    const fingerprint = getSingBoxUtlsFingerprint(proxy['client-fingerprint']);

    const stPart = {
        tag: getShadowTLSTag(proxy),
        type: 'shadowtls',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        version: pluginOpts.version,
        password: pluginOpts.password,
        tls: {
            enabled: true,
            server_name: pluginOpts.host,
        },
    };
    if (fingerprint) {
        stPart.tls.utls = {
            enabled: true,
            fingerprint,
        };
    }
    if (stPart.server_port < 0 || stPart.server_port > 65535)
        throw '端口值非法';
    const alpn = normalizeALPN(pluginOpts.alpn) ?? normalizeALPN(proxy.alpn);
    if (alpn) stPart.tls.alpn = alpn;
    if (proxy['fast-open'] === true) stPart.udp_fragment = true;
    tfoParser(proxy, stPart);
    detourParser(proxy, stPart);
    ipVersionParser(proxy, stPart);
    domainResolverParser(proxy, stPart);
    return stPart;
};

const ssParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'shadowsocks',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        method: proxy.cipher,
        password: proxy.password,
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy.uot) parsedProxy.udp_over_tcp = true;
    if (proxy['udp-over-tcp']) {
        parsedProxy.udp_over_tcp = {
            enabled: true,
            version:
                !proxy['udp-over-tcp-version'] ||
                proxy['udp-over-tcp-version'] === 1
                    ? 1
                    : 2,
        };
    }
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    if (proxy.plugin) {
        const optArr = [];
        if (proxy.plugin === 'obfs') {
            parsedProxy.plugin = 'obfs-local';
            parsedProxy.plugin_opts = '';
            if (proxy['obfs-host'])
                proxy['plugin-opts'].host = proxy['obfs-host'];
            Object.keys(proxy['plugin-opts']).forEach((k) => {
                switch (k) {
                    case 'mode':
                        optArr.push(`obfs=${proxy['plugin-opts'].mode}`);
                        break;
                    case 'host':
                        optArr.push(`obfs-host=${proxy['plugin-opts'].host}`);
                        break;
                    default:
                        optArr.push(`${k}=${proxy['plugin-opts'][k]}`);
                        break;
                }
            });
        }
        if (proxy.plugin === 'v2ray-plugin') {
            parsedProxy.plugin = 'v2ray-plugin';
            if (proxy['ws-host']) proxy['plugin-opts'].host = proxy['ws-host'];
            if (proxy['ws-path']) proxy['plugin-opts'].path = proxy['ws-path'];
            Object.keys(proxy['plugin-opts']).forEach((k) => {
                switch (k) {
                    case 'tls':
                        if (proxy['plugin-opts'].tls) optArr.push('tls');
                        break;
                    case 'host':
                        optArr.push(`host=${proxy['plugin-opts'].host}`);
                        break;
                    case 'path':
                        optArr.push(`path=${proxy['plugin-opts'].path}`);
                        break;
                    case 'headers':
                        optArr.push(
                            `headers=${JSON.stringify(
                                proxy['plugin-opts'].headers,
                            )}`,
                        );
                        break;
                    case 'mux': {
                        const mux = normalizePluginMuxValue(
                            proxy['plugin-opts'].mux,
                        );
                        if (mux) parsedProxy.multiplex = { enabled: true };
                        optArr.push(`mux=${mux}`);
                        break;
                    }
                    default:
                        optArr.push(`${k}=${proxy['plugin-opts'][k]}`);
                }
            });
        }
        parsedProxy.plugin_opts = optArr.join(';');
    }

    return parsedProxy;
};
// eslint-disable-next-line no-unused-vars
const ssrParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'shadowsocksr',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        method: proxy.cipher,
        password: proxy.password,
        obfs: proxy.obfs,
        protocol: proxy.protocol,
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy['obfs-param']) parsedProxy.obfs_param = proxy['obfs-param'];
    if (proxy['protocol-param'] && proxy['protocol-param'] !== '')
        parsedProxy.protocol_param = proxy['protocol-param'];
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};

const getSnellVersion = (version) => {
    if (version == null) return undefined;
    const normalized = `${version}`.trim();
    if (!/^\d+$/.test(normalized)) return NaN;
    return parseInt(normalized, 10);
};

const snellParser = (proxy = {}, includeUnsupportedProxy = false) => {
    const version = getSnellVersion(proxy.version);
    const shadowTLSPluginOpts = getShadowTLSPluginOpts(proxy);
    const supportedVersions = includeUnsupportedProxy
        ? [1, 2, 3, 4, 5, 6]
        : [4, 5, 6];
    if (
        version != null &&
        (!supportedVersions.includes(version) || Number.isNaN(version))
    ) {
        throw new Error(
            `Platform sing-box does not support snell version ${proxy.version}`,
        );
    }
    const outputVersion =
        !includeUnsupportedProxy && version === 5 ? 4 : version;

    const parsedProxy = {
        tag: proxy.name,
        type: 'snell',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        psk: proxy.psk,
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (outputVersion != null) parsedProxy.version = outputVersion;
    if (proxy._userkey) parsedProxy.userkey = proxy._userkey;
    if (outputVersion === 6) {
        if (proxy.mode) parsedProxy.mode = proxy.mode;
    } else {
        if (
            proxy['obfs-opts']?.mode &&
            proxy['obfs-opts'].mode !== 'shadow-tls'
        )
            parsedProxy.obfs_mode = proxy['obfs-opts'].mode;
        if (
            proxy['obfs-opts']?.host &&
            proxy['obfs-opts']?.mode !== 'shadow-tls'
        )
            parsedProxy.obfs_host = proxy['obfs-opts'].host;
    }
    if (proxy.reuse && (version == null || version >= 4))
        parsedProxy.reuse = true;
    networkParser(proxy, parsedProxy);
    if (shadowTLSPluginOpts) {
        parsedProxy.detour = getShadowTLSTag(proxy);
        delete parsedProxy.server;
        delete parsedProxy.server_port;
    } else {
        if (proxy['fast-open']) parsedProxy.udp_fragment = true;
        tfoParser(proxy, parsedProxy);
        detourParser(proxy, parsedProxy);
        ipVersionParser(proxy, parsedProxy);
        domainResolverParser(proxy, parsedProxy);
    }
    return parsedProxy;
};

const singBoxPacketEncodings = ['', 'packetaddr', 'xudp'];

const normalizeSingBoxPacketEncoding = (value) => {
    const packetEncoding = `${value}`.trim().toLowerCase();
    if (singBoxPacketEncodings.includes(packetEncoding)) {
        return packetEncoding;
    }
    return undefined;
};

const vmessVlessPacketEncodingParser = (proxy, parsedProxy) => {
    if (proxy['packet-encoding'] != null) {
        const packetEncoding = normalizeSingBoxPacketEncoding(
            proxy['packet-encoding'],
        );
        if (packetEncoding != null)
            parsedProxy.packet_encoding = packetEncoding;
    } else if (proxy.xudp) {
        parsedProxy.packet_encoding = 'xudp';
    } else if (proxy['packet-addr']) {
        parsedProxy.packet_encoding = 'packetaddr';
    }
};

const vmessProtocolOptionsParser = (proxy, parsedProxy) => {
    vmessVlessPacketEncodingParser(proxy, parsedProxy);
    if (proxy['global-padding'] != null) {
        parsedProxy.global_padding = !!proxy['global-padding'];
    }
    if (proxy['authenticated-length'] != null) {
        parsedProxy.authenticated_length = !!proxy['authenticated-length'];
    }
};

const vmessParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'vmess',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        uuid: proxy.uuid,
        security: normalizeVmessSecurity(proxy.cipher),
        alter_id: parseInt(`${proxy.alterId}`, 10),
        tls: { enabled: false, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    vmessProtocolOptionsParser(proxy, parsedProxy);
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    if (proxy.network === 'ws') wsParser(proxy, parsedProxy);
    if (proxy.network === 'h2') h2Parser(proxy, parsedProxy);
    if (proxy.network === 'http') h1Parser(proxy, parsedProxy);
    if (proxy.network === 'grpc') grpcParser(proxy, parsedProxy);
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};

const vlessParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'vless',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        uuid: proxy.uuid,
        tls: { enabled: false, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    vmessVlessPacketEncodingParser(proxy, parsedProxy);
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    // if (['xtls-rprx-vision', ''].includes(proxy.flow)) parsedProxy.flow = proxy.flow;
    if (proxy.flow != null) parsedProxy.flow = proxy.flow;
    if (proxy.network === 'ws') wsParser(proxy, parsedProxy);
    if (proxy.network === 'h2') h2Parser(proxy, parsedProxy);
    if (proxy.network === 'http') h1Parser(proxy, parsedProxy);
    if (proxy.network === 'grpc') grpcParser(proxy, parsedProxy);
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    tlsParser(proxy, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};
const trojanParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'trojan',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        password: proxy.password,
        tls: { enabled: true, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    if (proxy.network === 'grpc') grpcParser(proxy, parsedProxy);
    if (proxy.network === 'ws') wsParser(proxy, parsedProxy);
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};
const naiveParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'naive',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        tls: { enabled: true, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy.username) parsedProxy.username = proxy.username;
    if (proxy.password) parsedProxy.password = proxy.password;
    if (proxy.uot) parsedProxy.udp_over_tcp = true;
    if (proxy['udp-over-tcp']) {
        parsedProxy.udp_over_tcp = {
            enabled: true,
            version:
                !proxy['udp-over-tcp-version'] ||
                proxy['udp-over-tcp-version'] === 1
                    ? 1
                    : 2,
        };
    }
    const insecure_concurrency = parseInt(
        `${proxy['insecure-concurrency']}`,
        10,
    );
    if (Number.isInteger(insecure_concurrency) && insecure_concurrency >= 0)
        parsedProxy.insecure_concurrency = insecure_concurrency;
    if (proxy['extra-headers'])
        parsedProxy.extra_headers = proxy['extra-headers'];
    if (proxy.quic) parsedProxy.quic = !!proxy.quic;
    if (proxy['quic-congestion-control'])
        parsedProxy.quic_congestion_control = proxy['quic-congestion-control'];
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    if (parsedProxy.tls?.insecure) {
        $.info(
            `Platform sing-box: insecure is not supported on naive outbound`,
        );
        delete parsedProxy.tls.insecure;
    }

    return parsedProxy;
};
const hysteriaParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'hysteria',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        disable_mtu_discovery: false,
        tls: { enabled: true, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy['hop-interval'])
        parsedProxy.hop_interval = /^\d+$/.test(proxy['hop-interval'])
            ? `${proxy['hop-interval']}s`
            : proxy['hop-interval'];
    if (proxy['ports'])
        parsedProxy.server_ports = proxy['ports'].split(/\s*,\s*/).map((p) => {
            const range = p.replace(/\s*-\s*/g, ':');
            return range.includes(':') ? range : `${range}:${range}`;
        });
    if (proxy.auth_str) parsedProxy.auth_str = `${proxy.auth_str}`;
    if (proxy['auth-str']) parsedProxy.auth_str = `${proxy['auth-str']}`;
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    // eslint-disable-next-line no-control-regex
    const reg = new RegExp('^[0-9]+[ \t]*[KMGT]*[Bb]ps$');
    // sing-box 跟文档不一致, 但是懒得全转, 只处理最常见的 Mbps
    if (reg.test(`${proxy.up}`) && !`${proxy.up}`.endsWith('Mbps')) {
        parsedProxy.up = `${proxy.up}`;
    } else {
        parsedProxy.up_mbps = parseInt(`${proxy.up}`, 10);
    }
    if (reg.test(`${proxy.down}`) && !`${proxy.down}`.endsWith('Mbps')) {
        parsedProxy.down = `${proxy.down}`;
    } else {
        parsedProxy.down_mbps = parseInt(`${proxy.down}`, 10);
    }
    if (proxy.obfs) parsedProxy.obfs = proxy.obfs;
    if (proxy.recv_window_conn)
        parsedProxy.recv_window_conn = proxy.recv_window_conn;
    if (proxy['recv-window-conn'])
        parsedProxy.recv_window_conn = proxy['recv-window-conn'];
    if (proxy.recv_window) parsedProxy.recv_window = proxy.recv_window;
    if (proxy['recv-window']) parsedProxy.recv_window = proxy['recv-window'];
    if (proxy.disable_mtu_discovery) {
        if (typeof proxy.disable_mtu_discovery === 'boolean') {
            parsedProxy.disable_mtu_discovery = proxy.disable_mtu_discovery;
        } else {
            if (proxy.disable_mtu_discovery === 1)
                parsedProxy.disable_mtu_discovery = true;
        }
    }
    networkParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};

const hysteria2Parser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'hysteria2',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        password: proxy.password,
        obfs: {},
        tls: { enabled: true, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy['hop-interval'])
        parsedProxy.hop_interval = /^\d+$/.test(proxy['hop-interval'])
            ? `${proxy['hop-interval']}s`
            : proxy['hop-interval'];
    if (proxy['ports'])
        parsedProxy.server_ports = proxy['ports'].split(/\s*,\s*/).map((p) => {
            const range = p.replace(/\s*-\s*/g, ':');
            return range.includes(':') ? range : `${range}:${range}`;
        });
    if (proxy.up) parsedProxy.up_mbps = parseInt(`${proxy.up}`, 10);
    if (proxy.down) parsedProxy.down_mbps = parseInt(`${proxy.down}`, 10);
    if (['salamander', 'gecko'].includes(proxy.obfs))
        parsedProxy.obfs.type = proxy.obfs;
    if (proxy.obfs === 'gecko') {
        const minRaw = proxy['obfs-min-packet-size'];
        const maxRaw = proxy['obfs-max-packet-size'];
        const hasMin =
            minRaw !== undefined && minRaw !== null && `${minRaw}` !== '';
        const hasMax =
            maxRaw !== undefined && maxRaw !== null && `${maxRaw}` !== '';
        if (hasMin || hasMax) {
            const minPacketSize = hasMin
                ? parseSafeIntegerValue(`${minRaw}`.trim())
                : undefined;
            const rawMaxPacketSize = hasMax
                ? parseSafeIntegerValue(`${maxRaw}`.trim())
                : undefined;
            const maxPacketSize =
                rawMaxPacketSize != null
                    ? Math.min(rawMaxPacketSize, 2048)
                    : rawMaxPacketSize;
            const effectiveMinPacketSize = minPacketSize ?? 512;
            const effectiveMaxPacketSize = maxPacketSize ?? 1200;

            if (hasMax && rawMaxPacketSize != null && rawMaxPacketSize > 2048) {
                $.warn(
                    `Gecko obfs max packet size for proxy ${proxy.name} exceeds 2048, clamped to 2048: ${maxRaw}`,
                );
            }

            if (
                (hasMin && (minPacketSize == null || minPacketSize <= 0)) ||
                (hasMax &&
                    (rawMaxPacketSize == null || rawMaxPacketSize <= 0)) ||
                effectiveMaxPacketSize < effectiveMinPacketSize
            ) {
                $.error(
                    `Invalid obfs packet size for proxy ${proxy.name}: min=${minRaw} max=${maxRaw}`,
                );
            } else {
                if (hasMin) parsedProxy.obfs.min_packet_size = minPacketSize;
                if (hasMax) parsedProxy.obfs.max_packet_size = maxPacketSize;
            }
        }
    }
    if (proxy['obfs-password'])
        parsedProxy.obfs.password = proxy['obfs-password'];
    if (!parsedProxy.obfs.type) delete parsedProxy.obfs;
    networkParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};
const tuic5Parser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'tuic',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        uuid: proxy.uuid,
        password: proxy.password,
        tls: { enabled: true, server_name: proxy.server, insecure: false },
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    if (
        proxy['congestion-controller'] &&
        proxy['congestion-controller'] !== 'cubic'
    )
        parsedProxy.congestion_control = proxy['congestion-controller'];
    if (proxy['udp-relay-mode'] && proxy['udp-relay-mode'] !== 'native')
        parsedProxy.udp_relay_mode = proxy['udp-relay-mode'];
    if (proxy['reduce-rtt']) parsedProxy.zero_rtt_handshake = true;
    if (proxy['udp-over-stream']) parsedProxy.udp_over_stream = true;
    if (proxy['heartbeat-interval'])
        parsedProxy.heartbeat = `${proxy['heartbeat-interval']}ms`;
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};
const anytlsParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'anytls',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        password: proxy.password,
        tls: { enabled: true, server_name: proxy.server, insecure: false },
    };
    if (/^\d+$/.test(proxy['idle-session-check-interval']))
        parsedProxy.idle_session_check_interval = `${proxy['idle-session-check-interval']}s`;
    if (/^\d+$/.test(proxy['idle-session-timeout']))
        parsedProxy.idle_session_timeout = `${proxy['idle-session-timeout']}s`;
    if (/^\d+$/.test(proxy['min-idle-session']))
        parsedProxy.min_idle_session = parseInt(
            `${proxy['min-idle-session']}`,
            10,
        );
    detourParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    return parsedProxy;
};
const tailscaleParser = (proxy = {}) => {
    const useControlHTTPClient = hasControlHTTPClient(proxy);
    const parsedProxy = {
        tag: proxy.name,
        type: 'tailscale',
        control_http_client: proxy['control-http-client'],
        udp_timeout: proxy['udp-timeout'],
        state_directory: proxy['state-dir'] || proxy['state-directory'],
        auth_key: proxy['auth-key'],
        control_url: proxy['control-url'],
        ephemeral: proxy.ephemeral,
        hostname: proxy.hostname,
        accept_routes: proxy['accept-routes'],
        exit_node: proxy['exit-node'],
        exit_node_allow_lan_access: proxy['exit-node-allow-lan-access'],
        advertise_routes: Array.isArray(proxy['advertise-routes'])
            ? proxy['advertise-routes']
            : undefined,
        advertise_exit_node: proxy['advertise-exit-node'],
        advertise_tags: Array.isArray(proxy['advertise-tags'])
            ? proxy['advertise-tags']
            : undefined,
        relay_server_static_endpoints: Array.isArray(
            proxy['relay-server-static-endpoints'],
        )
            ? proxy['relay-server-static-endpoints']
            : undefined,
        system_interface: proxy['system-interface'],
        system_interface_name: proxy['system-interface-name'],
    };
    if (/^\d+$/.test(proxy['system-interface-mtu']))
        parsedProxy.system_interface_mtu = parseInt(
            `${proxy['system-interface-mtu']}`,
            10,
        );
    if (/^\d+$/.test(proxy['relay-server-port']))
        parsedProxy.relay_server_port = parseInt(
            `${proxy['relay-server-port']}`,
            10,
        );
    if (!useControlHTTPClient) {
        detourParser(proxy, parsedProxy);
        ipVersionParser(proxy, parsedProxy);
        domainResolverParser(proxy, parsedProxy);
    }
    if (isPlainObject(proxy['ssh-server'])) {
        parsedProxy.ssh_server = {
            enabled: proxy['ssh-server'].enabled !== false,
            disable_pty: proxy['ssh-server']['disable-pty'],
            disable_sftp: proxy['ssh-server']['disable-sftp'],
            disable_forwarding: proxy['ssh-server']['disable-forwarding'],
        };
    } else if (proxy['ssh-server']) {
        parsedProxy.ssh_server = !!proxy['ssh-server'];
    }
    return parsedProxy;
};

const wireguardParser = (proxy = {}) => {
    const address = ['ipv4', 'ipv6']
        .map((family) => getWireGuardAddressWithCIDR(proxy, family))
        .filter((i) => i);
    const parsedProxy = {
        system: !!proxy.system,
        mtu: proxy.mtu ? parseInt(`${proxy.mtu}`, 10) : undefined,
        udp_timeout: proxy['udp-timeout'],
        workers: proxy['workers']
            ? parseInt(`${proxy['workers']}`, 10)
            : undefined,
        tag: proxy.name,
        type: 'wireguard',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        address,
        private_key: proxy['private-key'],
        peer_public_key: proxy['public-key'],
        pre_shared_key: proxy['pre-shared-key'],
        reserved: [],
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    if (typeof proxy.reserved === 'string') {
        parsedProxy.reserved = proxy.reserved;
    } else if (Array.isArray(proxy.reserved)) {
        for (const r of proxy.reserved) parsedProxy.reserved.push(r);
    } else {
        delete parsedProxy.reserved;
    }
    if (!Array.isArray(proxy.peers) || proxy.peers.length === 0) {
        proxy.peers = [{}];
    }
    if (proxy.peers && proxy.peers.length > 0) {
        parsedProxy.peers = [];
        for (const p of proxy.peers) {
            let address;
            let port;
            if (p.server && p.port) {
                address = p.server;
                port = parseInt(`${p.port}`, 10);
            } else {
                address = parsedProxy.server;
                port = parseInt(`${parsedProxy.server_port}`, 10);
            }
            const peer = {
                address,
                port,
                persistent_keepalive_interval: p[
                    'persistent-keepalive-interval'
                ]
                    ? parseInt(`${p['persistent-keepalive-interval']}`, 10)
                    : undefined,
                public_key:
                    p['public-key'] ||
                    p['public_key'] ||
                    parsedProxy.peer_public_key,
                pre_shared_key:
                    p['pre-shared-key'] ||
                    p['pre_shared_key'] ||
                    parsedProxy.pre_shared_key,
                allowed_ips: p['allowed-ips'] ||
                    p.allowed_ips || [
                        '0.0.0.0/0',
                        ...(proxy.ipv6 ? ['::/0'] : []),
                    ],
                reserved: [],
            };
            if (typeof p.reserved === 'string') {
                peer.reserved.push(p.reserved);
            } else if (Array.isArray(p.reserved)) {
                for (const r of p.reserved) peer.reserved.push(r);
            } else {
                delete peer.reserved;
            }
            if (!Array.isArray(peer.reserved) || peer.reserved.length === 0) {
                peer.reserved = parsedProxy.reserved;
            }
            // if (p['pre-shared-key']) peer.pre_shared_key = p['pre-shared-key'];
            parsedProxy.peers.push(peer);
        }
    }
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    domainResolverParser(proxy, parsedProxy);
    delete parsedProxy.server;
    delete parsedProxy.server_port;
    delete parsedProxy.pre_shared_key;
    delete parsedProxy.peer_public_key;
    delete parsedProxy.reserved;
    return parsedProxy;
};

export default function singbox_Producer() {
    const type = 'ALL';
    const produce = (proxies, type, opts = {}) => {
        const list = [];
        const originalSnellShadowTLS = new Map(
            proxies
                .filter(
                    (proxy) =>
                        proxy?.type === 'snell' &&
                        proxy?.plugin === 'shadow-tls' &&
                        proxy?.['plugin-opts'],
                )
                .map((proxy) => [
                    proxy,
                    {
                        plugin: proxy.plugin,
                        'plugin-opts': proxy['plugin-opts']
                            ? JSON.parse(JSON.stringify(proxy['plugin-opts']))
                            : undefined,
                        'obfs-opts': proxy['obfs-opts']
                            ? JSON.parse(JSON.stringify(proxy['obfs-opts']))
                            : undefined,
                    },
                ]),
        );
        ClashMeta_Producer()
            .produce(proxies, 'internal', { 'include-unsupported-proxy': true })
            .map((proxy) => {
                try {
                    const originalShadowTLS = originalSnellShadowTLS.get(proxy);
                    if (originalShadowTLS) {
                        proxy.plugin = originalShadowTLS.plugin;
                        proxy['plugin-opts'] = originalShadowTLS['plugin-opts'];
                        if (originalShadowTLS['obfs-opts']) {
                            proxy['obfs-opts'] = originalShadowTLS['obfs-opts'];
                        } else {
                            delete proxy['obfs-opts'];
                        }
                    }
                    if (['xhttp'].includes(proxy.network))
                        throw new Error(
                            `Platform sing-box does not support network: ${proxy.network}`,
                        );
                    switch (proxy.type) {
                        case 'ssh':
                            list.push(sshParser(proxy));
                            break;
                        case 'http':
                            list.push(httpParser(proxy));
                            break;
                        case 'socks5':
                            if (proxy.tls) {
                                throw new Error(
                                    `Platform sing-box does not support proxy type: ${proxy.type} with tls`,
                                );
                            } else {
                                list.push(socks5Parser(proxy));
                            }
                            break;
                        case 'ss':
                            // if (!proxy.cipher) {
                            //     proxy.cipher = 'none';
                            // }
                            // if (
                            //     ![
                            //         '2022-blake3-aes-128-gcm',
                            //         '2022-blake3-aes-256-gcm',
                            //         '2022-blake3-chacha20-poly1305',
                            //         'aes-128-cfb',
                            //         'aes-128-ctr',
                            //         'aes-128-gcm',
                            //         'aes-192-cfb',
                            //         'aes-192-ctr',
                            //         'aes-192-gcm',
                            //         'aes-256-cfb',
                            //         'aes-256-ctr',
                            //         'aes-256-gcm',
                            //         'chacha20-ietf',
                            //         'chacha20-ietf-poly1305',
                            //         'none',
                            //         'rc4-md5',
                            //         'xchacha20',
                            //         'xchacha20-ietf-poly1305',
                            //     ].includes(proxy.cipher)
                            // ) {
                            //     throw new Error(
                            //         `cipher ${proxy.cipher} is not supported`,
                            //     );
                            // }
                            if (proxy.plugin === 'shadow-tls') {
                                const { ssPart, stPart } =
                                    shadowTLSParser(proxy);
                                list.push(ssPart);
                                list.push(stPart);
                            } else {
                                list.push(ssParser(proxy));
                            }
                            break;
                        case 'ssr':
                            if (opts['include-unsupported-proxy']) {
                                list.push(ssrParser(proxy));
                            } else {
                                throw new Error(
                                    `Platform sing-box does not support proxy type: ${proxy.type}`,
                                );
                            }
                            break;
                        case 'snell': {
                            list.push(
                                snellParser(
                                    proxy,
                                    opts['include-unsupported-proxy'],
                                ),
                            );
                            const shadowTLSPluginOpts =
                                getShadowTLSPluginOpts(proxy);
                            if (shadowTLSPluginOpts) {
                                list.push(
                                    shadowTLSOutboundParser(
                                        proxy,
                                        shadowTLSPluginOpts,
                                    ),
                                );
                            }
                            break;
                        }
                        case 'vmess':
                            if (
                                !proxy.network ||
                                ['tcp', 'ws', 'grpc', 'h2', 'http'].includes(
                                    proxy.network,
                                )
                            ) {
                                list.push(vmessParser(proxy));
                            } else {
                                throw new Error(
                                    `Platform sing-box does not support proxy type: ${proxy.type} with network ${proxy.network}`,
                                );
                            }
                            break;
                        case 'vless':
                            if (
                                proxy.encryption &&
                                proxy.encryption !== 'none'
                            ) {
                                throw new Error(
                                    `VLESS encryption is not supported`,
                                );
                            }
                            if (
                                !proxy.flow ||
                                ['xtls-rprx-vision'].includes(proxy.flow)
                            ) {
                                list.push(vlessParser(proxy));
                            } else {
                                throw new Error(
                                    `Platform sing-box does not support proxy type: ${proxy.type} with flow ${proxy.flow}`,
                                );
                            }
                            break;
                        case 'trojan':
                            if (!proxy.flow) {
                                list.push(trojanParser(proxy));
                            } else {
                                throw new Error(
                                    `Platform sing-box does not support proxy type: ${proxy.type} with flow ${proxy.flow}`,
                                );
                            }
                            break;
                        case 'naive':
                            list.push(naiveParser(proxy));
                            break;
                        case 'hysteria':
                            list.push(hysteriaParser(proxy));
                            break;
                        case 'hysteria2':
                            list.push(
                                hysteria2Parser(
                                    proxy,
                                    opts['include-unsupported-proxy'],
                                ),
                            );
                            break;
                        case 'tuic':
                            if (!proxy.token || proxy.token.length === 0) {
                                list.push(tuic5Parser(proxy));
                            } else {
                                throw new Error(
                                    `Platform sing-box does not support proxy type: TUIC v4`,
                                );
                            }
                            break;
                        case 'wireguard':
                            list.push(wireguardParser(proxy));
                            break;
                        case 'anytls':
                            list.push(anytlsParser(proxy));
                            break;
                        case 'tailscale':
                            list.push(tailscaleParser(proxy));
                            break;
                        default:
                            throw new Error(
                                `Platform sing-box does not support proxy type: ${proxy.type}`,
                            );
                    }
                } catch (e) {
                    // console.log(e);
                    $.error(e.message ?? e);
                }
            });

        if (type === 'internal') return list;

        const categorized = list.reduce(
            (result, item) => {
                if (['wireguard', 'tailscale'].includes(item.type)) {
                    result.endpoints.push(item);
                } else {
                    result.outbounds.push(item);
                }
                return result;
            },
            { outbounds: [], endpoints: [] },
        );

        return JSON.stringify(categorized, null, 2);
    };
    return { type, produce };
}
