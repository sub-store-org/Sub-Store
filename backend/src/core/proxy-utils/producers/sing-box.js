import ClashMeta_Producer from './clashmeta';
import $ from '@/core/app';
import { isIPv4, isIPv6 } from '@/utils';

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
const detourParser = (proxy, parsedProxy) => {
    parsedProxy.detour = proxy['dialer-proxy'] || proxy.detour;
};
const networkParser = (proxy, parsedProxy) => {
    if (['tcp', 'udp'].includes(proxy._network))
        parsedProxy.network = proxy._network;
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
        transport.max_early_data = parseInt(max_early_data, 10);
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
        const reg = /^(.*?)(?:\?ed=(\d+))?$/;
        // eslint-disable-next-line no-unused-vars
        const [_, path = '', ed = ''] = reg.exec(transport.path);
        transport.path = path;
        if (ed !== '') {
            transport.early_data_header_name = 'Sec-WebSocket-Protocol';
            transport.max_early_data = parseInt(ed, 10);
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
    )
        parsedProxy.tls.utls = {
            enabled: true,
            fingerprint: proxy['client-fingerprint'],
        };
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
    return parsedProxy;
};

const socks5Parser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'socks',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        password: proxy.password,
        version: '5',
    };
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy.username) parsedProxy.username = proxy.username;
    if (proxy.password) parsedProxy.password = proxy.password;
    if (proxy.uot) parsedProxy.udp_over_tcp = true;
    if (proxy['udp-over-tcp']) parsedProxy.udp_over_tcp = true;
    if (proxy['fast-open']) parsedProxy.udp_fragment = true;
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    return parsedProxy;
};

const shadowTLSParser = (proxy = {}) => {
    const ssPart = {
        tag: proxy.name,
        type: 'shadowsocks',
        method: proxy.cipher,
        password: proxy.password,
        detour: `${proxy.name}_shadowtls`,
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
    const stPart = {
        tag: `${proxy.name}_shadowtls`,
        type: 'shadowtls',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        version: proxy['plugin-opts'].version,
        password: proxy['plugin-opts'].password,
        tls: {
            enabled: true,
            server_name: proxy['plugin-opts'].host,
            utls: {
                enabled: true,
                fingerprint: proxy['client-fingerprint'],
            },
        },
    };
    if (stPart.server_port < 0 || stPart.server_port > 65535)
        throw '端口值非法';
    if (proxy['fast-open'] === true) stPart.udp_fragment = true;
    tfoParser(proxy, stPart);
    detourParser(proxy, stPart);
    smuxParser(proxy.smux, ssPart);
    ipVersionParser(proxy, stPart);
    return { type: 'ss-with-st', ssPart, stPart };
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
                    case 'mux':
                        if (proxy['plugin-opts'].mux)
                            parsedProxy.multiplex = { enabled: true };
                        break;
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
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    return parsedProxy;
};

const vmessParser = (proxy = {}) => {
    const parsedProxy = {
        tag: proxy.name,
        type: 'vmess',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        uuid: proxy.uuid,
        security: proxy.cipher,
        alter_id: parseInt(`${proxy.alterId}`, 10),
        tls: { enabled: false, server_name: proxy.server, insecure: false },
    };
    if (
        [
            'auto',
            'none',
            'zero',
            'aes-128-gcm',
            'chacha20-poly1305',
            'aes-128-ctr',
        ].indexOf(parsedProxy.security) === -1
    )
        parsedProxy.security = 'auto';
    if (parsedProxy.server_port < 0 || parsedProxy.server_port > 65535)
        throw 'invalid port';
    if (proxy.xudp) parsedProxy.packet_encoding = 'xudp';
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
    if (proxy.xudp) parsedProxy.packet_encoding = 'xudp';
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
        parsedProxy.server_ports = proxy['ports']
            .split(/\s*,\s*/)
            .map((p) => p.replace(/\s*-\s*/g, ':'));
    if (proxy.up) parsedProxy.up_mbps = parseInt(`${proxy.up}`, 10);
    if (proxy.down) parsedProxy.down_mbps = parseInt(`${proxy.down}`, 10);
    if (proxy.obfs === 'salamander') parsedProxy.obfs.type = 'salamander';
    if (proxy['obfs-password'])
        parsedProxy.obfs.password = proxy['obfs-password'];
    if (!parsedProxy.obfs.type) delete parsedProxy.obfs;
    networkParser(proxy, parsedProxy);
    tlsParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
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
    return parsedProxy;
};

const wireguardParser = (proxy = {}) => {
    const local_address = ['ip', 'ipv6']
        .map((i) => proxy[i])
        .map((i) => {
            if (isIPv4(i)) return `${i}/32`;
            if (isIPv6(i)) return `${i}/128`;
        })
        .filter((i) => i);
    const parsedProxy = {
        tag: proxy.name,
        type: 'wireguard',
        server: proxy.server,
        server_port: parseInt(`${proxy.port}`, 10),
        local_address,
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
    if (proxy.peers && proxy.peers.length > 0) {
        parsedProxy.peers = [];
        for (const p of proxy.peers) {
            const peer = {
                server: p.server,
                server_port: parseInt(`${p.port}`, 10),
                public_key: p['public-key'],
                allowed_ips: p['allowed-ips'] || p.allowed_ips,
                reserved: [],
            };
            if (typeof p.reserved === 'string') {
                peer.reserved.push(p.reserved);
            } else if (Array.isArray(p.reserved)) {
                for (const r of p.reserved) peer.reserved.push(r);
            } else {
                delete peer.reserved;
            }
            if (p['pre-shared-key']) peer.pre_shared_key = p['pre-shared-key'];
            parsedProxy.peers.push(peer);
        }
    }
    networkParser(proxy, parsedProxy);
    tfoParser(proxy, parsedProxy);
    detourParser(proxy, parsedProxy);
    smuxParser(proxy.smux, parsedProxy);
    ipVersionParser(proxy, parsedProxy);
    return parsedProxy;
};

export default function singbox_Producer() {
    const type = 'ALL';
    const produce = (proxies, type, opts = {}) => {
        const list = [];
        ClashMeta_Producer()
            .produce(proxies, 'internal', { 'include-unsupported-proxy': true })
            .map((proxy) => {
                try {
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
                        case 'vmess':
                            if (
                                !proxy.network ||
                                ['ws', 'grpc', 'h2', 'http'].includes(
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

        return type === 'internal'
            ? list
            : JSON.stringify({ outbounds: list }, null, 2);
    };
    return { type, produce };
}
