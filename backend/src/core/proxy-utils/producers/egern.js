import $ from '@/core/app';
import {
    getWireGuardAddressWithCIDR,
    isPresent,
    produceProxyListOutput,
} from './utils';
import { normalizeVmessSecurity } from '../vmess-security';

export default function Egern_Producer() {
    const type = 'ALL';
    const produce = (proxies, type, opts = {}) => {
        // https://egernapp.com/zh-CN/docs/configuration/proxies
        const list = proxies
            .filter((proxy) => {
                if (
                    ![
                        'http',
                        'https',
                        'socks5',
                        'ss',
                        'trojan',
                        'hysteria2',
                        'vless',
                        'vmess',
                        'tuic',
                        'wireguard',
                        'anytls',
                        'ssh',
                        'snell',
                    ].includes(proxy.type) ||
                    (proxy.type === 'ss' &&
                        ((proxy.plugin === 'obfs' &&
                            !['http', 'tls'].includes(
                                proxy['plugin-opts']?.mode,
                            )) ||
                            ![
                                'chacha20-ietf-poly1305',
                                'chacha20-poly1305',
                                'aes-256-gcm',
                                'aes-128-gcm',
                                'none',
                                'tbale',
                                'rc4',
                                'rc4-md5',
                                'aes-128-cfb',
                                'aes-192-cfb',
                                'aes-256-cfb',
                                'aes-128-ctr',
                                'aes-192-ctr',
                                'aes-256-ctr',
                                'bf-cfb',
                                'camellia-128-cfb',
                                'camellia-192-cfb',
                                'camellia-256-cfb',
                                'cast5-cfb',
                                'des-cfb',
                                'idea-cfb',
                                'rc2-cfb',
                                'seed-cfb',
                                'salsa20',
                                'chacha20',
                                'chacha20-ietf',
                                '2022-blake3-aes-128-gcm',
                                '2022-blake3-aes-256-gcm',
                            ].includes(proxy.cipher))) ||
                    (proxy.type === 'vmess' &&
                        ((!['h2', 'http', 'ws', 'tcp', 'grpc'].includes(
                            proxy.network,
                        ) &&
                            proxy.network) ||
                            !isEgernGrpcGun(proxy))) ||
                    (proxy.type === 'trojan' &&
                        !['http', 'ws', 'tcp'].includes(proxy.network) &&
                        proxy.network) ||
                    (proxy.type === 'vless' &&
                        ((!['h2', 'http', 'ws', 'tcp', 'grpc'].includes(
                            proxy.network,
                        ) &&
                            proxy.network) ||
                            !isEgernGrpcGun(proxy) ||
                            (typeof proxy.flow !== 'undefined' &&
                                !['xtls-rprx-vision', ''].includes(
                                    proxy.flow,
                                )))) ||
                    (proxy.type === 'tuic' &&
                        proxy.token &&
                        proxy.token.length !== 0)
                ) {
                    return false;
                } else if (
                    proxy.type === 'snell' &&
                    normalizeSnellVersion(proxy.version) === null
                ) {
                    return false;
                } else if (
                    ['anytls'].includes(proxy.type) &&
                    proxy.network &&
                    !['tcp'].includes(proxy.network)
                ) {
                    return false;
                } else if (
                    ['ws'].includes(proxy.network) &&
                    proxy['ws-opts']?.['v2ray-http-upgrade']
                ) {
                    return false;
                }
                return true;
            })
            .map((proxy) => {
                const sourceProxy = proxy;

                try {
                    const original = { ...proxy };
                    let flow;
                    if (proxy.tls && !proxy.sni) {
                        proxy.sni = proxy.server;
                    }
                    const prev_hop =
                        proxy.prev_hop ||
                        proxy['underlying-proxy'] ||
                        proxy['dialer-proxy'] ||
                        proxy.detour;

                    if (proxy.type === 'http') {
                        proxy = {
                            type: proxy.tls ? 'https' : 'http',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            username: proxy.username,
                            password: proxy.password,
                            ...(hasHeaders(proxy)
                                ? {
                                      headers: proxy.headers,
                                  }
                                : {}),
                            tfo: getTfo(proxy),
                            ...(proxy.tls
                                ? {
                                      sni: proxy.sni,
                                      skip_tls_verify:
                                          proxy['skip-cert-verify'],
                                      reality: getReality(proxy),
                                  }
                                : {}),
                        };
                    } else if (proxy.type === 'https') {
                        proxy = {
                            type: 'https',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            username: proxy.username,
                            password: proxy.password,
                            ...(hasHeaders(proxy)
                                ? {
                                      headers: proxy.headers,
                                  }
                                : {}),
                            tfo: getTfo(proxy),
                            sni: proxy.sni,
                            skip_tls_verify: proxy['skip-cert-verify'],
                            reality: getReality(proxy),
                        };
                    } else if (proxy.type === 'socks5') {
                        proxy = {
                            type: proxy.tls ? 'socks5_tls' : 'socks5',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            username: proxy.username,
                            password: proxy.password,
                            tfo: getTfo(proxy),
                            udp_relay: getUdpRelay(proxy),
                            ...(proxy.tls
                                ? {
                                      sni: proxy.sni,
                                      skip_tls_verify:
                                          proxy['skip-cert-verify'],
                                      reality: getReality(proxy),
                                  }
                                : {}),
                        };
                    } else if (proxy.type === 'ss') {
                        proxy = {
                            type: 'shadowsocks',
                            name: proxy.name,
                            method:
                                proxy.cipher === 'chacha20-ietf-poly1305'
                                    ? 'chacha20-poly1305'
                                    : proxy.cipher,
                            server: proxy.server,
                            port: proxy.port,
                            password: proxy.password,
                            tfo: getTfo(proxy),
                            udp_relay: getUdpRelay(proxy),
                        };
                        if (isPresent(original, 'plugin')) {
                            if (original.plugin === 'obfs') {
                                proxy.obfs = original['plugin-opts'].mode;
                                proxy.obfs_host = original['plugin-opts'].host;
                                proxy.obfs_uri = original['plugin-opts'].path;
                            } else if (
                                !['shadow-tls'].includes(original.plugin)
                            ) {
                                throw new Error(
                                    `plugin ${original.plugin} is not supported`,
                                );
                            }
                        }
                    } else if (proxy.type === 'hysteria2') {
                        proxy = {
                            type: 'hysteria2',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            auth: proxy.password,
                            ...(isPresent(proxy, 'up')
                                ? {
                                      bandwidth: parseInt(
                                          `${proxy.up}`.match(/\d+/)?.[0] || 0,
                                          10,
                                      ),
                                  }
                                : {}),
                            tfo: getTfo(proxy),
                            udp_relay: getUdpRelay(proxy),
                            sni: proxy.sni,
                            skip_tls_verify: proxy['skip-cert-verify'],
                            port_hopping: proxy.ports,
                            port_hopping_interval: proxy['hop-interval'],
                        };
                        if (
                            original['obfs-password'] &&
                            original.obfs == 'salamander'
                        ) {
                            proxy.obfs = 'salamander';
                            proxy.obfs_password = original['obfs-password'];
                        }
                    } else if (proxy.type === 'tuic') {
                        proxy = {
                            type: 'tuic',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            uuid: proxy.uuid,
                            password: proxy.password,
                            sni: proxy.sni,
                            alpn: Array.isArray(proxy.alpn)
                                ? proxy.alpn
                                : [proxy.alpn || 'h3'],
                            skip_tls_verify: proxy['skip-cert-verify'],
                            port_hopping: proxy.ports,
                            port_hopping_interval: proxy['hop-interval'],
                        };
                    } else if (proxy.type === 'trojan') {
                        if (proxy.network === 'ws') {
                            proxy.websocket = {
                                path: proxy['ws-opts']?.path,
                                host: proxy['ws-opts']?.headers?.Host,
                            };
                        }
                        proxy = {
                            type: 'trojan',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            password: proxy.password,
                            tfo: getTfo(proxy),
                            udp_relay: getUdpRelay(proxy),
                            sni: proxy.sni,
                            skip_tls_verify: proxy['skip-cert-verify'],
                            reality: getReality(proxy),
                            websocket: proxy.websocket,
                        };
                    } else if (proxy.type === 'anytls') {
                        proxy = {
                            type: 'anytls',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            password: proxy.password,
                            tfo: getTfo(proxy),
                            udp_relay: getUdpRelay(proxy),
                            sni: proxy.sni,
                            skip_tls_verify: proxy['skip-cert-verify'],
                            reality: getReality(proxy),
                        };
                    } else if (proxy.type === 'vmess') {
                        // Egern：传输层，支持 ws/wss/http1/http2/tls，不配置则为 tcp
                        const security = normalizeVmessSecurity(proxy.cipher);
                        if (proxy.network === 'ws') {
                            proxy.transport = {
                                [proxy.tls ? 'wss' : 'ws']: {
                                    path: proxy['ws-opts']?.path,
                                    headers: {
                                        Host: proxy['ws-opts']?.headers?.Host,
                                    },
                                    sni: proxy.tls ? proxy.sni : undefined,
                                    skip_tls_verify: proxy.tls
                                        ? proxy['skip-cert-verify']
                                        : undefined,
                                },
                            };
                        } else if (proxy.network === 'http') {
                            proxy.transport = {
                                http1: {
                                    method: proxy['http-opts']?.method,
                                    path: Array.isArray(
                                        proxy['http-opts']?.path,
                                    )
                                        ? proxy['http-opts']?.path[0]
                                        : proxy['http-opts']?.path,
                                    headers: {
                                        Host: Array.isArray(
                                            proxy['http-opts']?.headers?.Host,
                                        )
                                            ? proxy['http-opts']?.headers
                                                  ?.Host[0]
                                            : proxy['http-opts']?.headers?.Host,
                                    },
                                    skip_tls_verify: proxy['skip-cert-verify'],
                                },
                            };
                        } else if (proxy.network === 'h2') {
                            proxy.transport = {
                                http2: {
                                    method: proxy['h2-opts']?.method,
                                    path: Array.isArray(proxy['h2-opts']?.path)
                                        ? proxy['h2-opts']?.path[0]
                                        : proxy['h2-opts']?.path,
                                    headers: getH2Headers(proxy['h2-opts']),
                                    sni: proxy.sni,
                                    skip_tls_verify: proxy['skip-cert-verify'],
                                },
                            };
                        } else if (proxy.network === 'grpc') {
                            proxy.transport = getGrpcTransport(proxy);
                        } else if (
                            (proxy.network === 'tcp' || !proxy.network) &&
                            proxy.tls
                        ) {
                            proxy.transport = {
                                tls: {
                                    sni: proxy.tls ? proxy.sni : undefined,
                                    skip_tls_verify: proxy.tls
                                        ? proxy['skip-cert-verify']
                                        : undefined,
                                },
                            };
                        }
                        let legacy = false;
                        if (isPresent(proxy, 'aead') && !proxy.aead) {
                            legacy = true;
                        } else if (
                            isPresent(proxy, 'alterId') &&
                            proxy.alterId !== 0
                        ) {
                            legacy = true;
                        }
                        proxy = {
                            type: 'vmess',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            user_id: proxy.uuid,
                            security,
                            tfo: getTfo(proxy),
                            legacy,
                            udp_relay: getUdpRelay(proxy),
                            transport: proxy.transport,
                        };
                    } else if (proxy.type === 'vless') {
                        if (proxy.encryption && proxy.encryption !== 'none')
                            throw new Error(
                                `VLESS encryption is not supported`,
                            );
                        if (proxy.network === 'ws') {
                            proxy.transport = {
                                [proxy.tls ? 'wss' : 'ws']: {
                                    path: proxy['ws-opts']?.path,
                                    headers: {
                                        Host: proxy['ws-opts']?.headers?.Host,
                                    },
                                    sni: proxy.tls ? proxy.sni : undefined,
                                    skip_tls_verify: proxy.tls
                                        ? proxy['skip-cert-verify']
                                        : undefined,
                                },
                            };
                        } else if (proxy.network === 'http') {
                            proxy.transport = {
                                http: {
                                    method: proxy['http-opts']?.method,
                                    path: Array.isArray(
                                        proxy['http-opts']?.path,
                                    )
                                        ? proxy['http-opts']?.path[0]
                                        : proxy['http-opts']?.path,
                                    headers: {
                                        Host: Array.isArray(
                                            proxy['http-opts']?.headers?.Host,
                                        )
                                            ? proxy['http-opts']?.headers
                                                  ?.Host[0]
                                            : proxy['http-opts']?.headers?.Host,
                                    },
                                    skip_tls_verify: proxy['skip-cert-verify'],
                                },
                            };
                        } else if (proxy.network === 'h2') {
                            proxy.transport = {
                                http2: {
                                    method: proxy['h2-opts']?.method,
                                    path: Array.isArray(proxy['h2-opts']?.path)
                                        ? proxy['h2-opts']?.path[0]
                                        : proxy['h2-opts']?.path,
                                    headers: getH2Headers(proxy['h2-opts']),
                                    sni: proxy.sni,
                                    skip_tls_verify: proxy['skip-cert-verify'],
                                },
                            };
                        } else if (proxy.network === 'grpc') {
                            proxy.transport = getGrpcTransport(proxy);
                        } else if (proxy.network === 'tcp' || !proxy.network) {
                            proxy.transport = {
                                [proxy.tls ? 'tls' : 'tcp']: {
                                    sni: proxy.tls ? proxy.sni : undefined,
                                    skip_tls_verify: proxy.tls
                                        ? proxy['skip-cert-verify']
                                        : undefined,
                                    reality: getReality(proxy),
                                },
                            };
                            flow = proxy.flow;
                            if (flow === '') flow = undefined;
                        }
                        proxy = {
                            type: 'vless',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            user_id: proxy.uuid,
                            security: proxy.cipher,
                            tfo: getTfo(proxy),
                            udp_relay: getUdpRelay(proxy),
                            transport: proxy.transport,
                            flow,
                        };
                    } else if (proxy.type === 'wireguard') {
                        if (
                            Array.isArray(proxy.peers) &&
                            proxy.peers.length > 0
                        ) {
                            proxy.server = proxy.peers[0].server;
                            proxy.port = proxy.peers[0].port;
                            proxy.ip = proxy.peers[0].ip;
                            proxy.ipv6 = proxy.peers[0].ipv6;
                            proxy['public-key'] = proxy.peers[0]['public-key'];
                            proxy['preshared-key'] =
                                proxy.peers[0]['pre-shared-key'];
                            proxy['allowed-ips'] =
                                proxy.peers[0]['allowed-ips'];
                            proxy.reserved = proxy.peers[0].reserved;
                        }
                        proxy = {
                            type: 'wireguard',
                            name: proxy.name,
                            local_ipv4: getWireGuardAddressWithCIDR(
                                proxy,
                                'ipv4',
                            ),
                            local_ipv6: getWireGuardAddressWithCIDR(
                                proxy,
                                'ipv6',
                            ),
                            server: proxy.server,
                            port: proxy.port,
                            private_key: proxy['private-key'],
                            peer_public_key: proxy['public-key'],
                            preshared_key: proxy['preshared-key'],
                            reserved: proxy.reserved
                                ? Array.isArray(proxy.reserved)
                                    ? proxy.reserved
                                    : proxy.reserved
                                          .split(/\s*\/\s*/)
                                          .map((item) => item.trim())
                                          .filter((item) => item.length > 0)
                                : undefined,
                            dns_servers: proxy.dns
                                ? Array.isArray(proxy.dns)
                                    ? proxy.dns
                                    : proxy.dns
                                          .split(/\s*,\s*/)
                                          .map((item) => item.trim())
                                          .filter((item) => item.length > 0)
                                : undefined,
                            mtu: proxy.mtu,
                            keepalive: proxy.keepalive,
                        };
                    } else if (proxy.type === 'ssh') {
                        proxy = {
                            type: 'ssh',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            username: proxy.username,
                            password: proxy.password,
                            private_key: proxy['private-key'],
                            // private_key_passphrase: proxy['private-key-passphrase'],
                            host_keys: proxy['host-key'],
                            tfo: getTfo(proxy),
                        };
                    } else if (proxy.type === 'snell') {
                        const snellVersion = normalizeSnellVersion(
                            proxy.version,
                        );
                        proxy = {
                            type: 'snell',
                            name: proxy.name,
                            server: proxy.server,
                            port: proxy.port,
                            psk: proxy.psk,
                            version: snellVersion,
                            ...(snellVersion == null || snellVersion >= 3
                                ? {
                                      udp_relay: getUdpRelay(proxy),
                                  }
                                : {}),
                            reuse: proxy.reuse,
                            obfs: proxy['obfs-opts']?.mode || proxy.obfs,
                            obfs_host:
                                proxy['obfs-opts']?.host ||
                                proxy['obfs-host'] ||
                                proxy.obfs_host,
                            tfo: getTfo(proxy),
                        };
                    }
                    if (
                        [
                            'http',
                            'https',
                            'socks5',
                            'ss',
                            'trojan',
                            'vless',
                            'vmess',
                            'anytls',
                            'ssh',
                            'snell',
                        ].includes(original.type)
                    ) {
                        if (
                            ['shadow-tls'].includes(original.plugin) &&
                            original['plugin-opts']
                        ) {
                            if (original['plugin-opts'].version != 3)
                                throw new Error(
                                    `shadow-tls version ${original['plugin-opts'].version} is not supported`,
                                );
                            proxy.shadow_tls = {
                                password: original['plugin-opts'].password,
                                sni: original['plugin-opts'].host,
                            };
                        }
                    }
                    const fingerprintSha256 = getFingerprintSha256(original);
                    if (fingerprintSha256) {
                        if (supportsRootFingerprintSha256(original, proxy)) {
                            proxy.fingerprint_sha256 = fingerprintSha256;
                        }
                        addTransportFingerprintSha256(
                            proxy.transport,
                            fingerprintSha256,
                        );
                    }
                    if (
                        [
                            'socks5',
                            'ss',
                            'trojan',
                            'vless',
                            'vmess',
                            'wireguard',
                            'tuic',
                            'hysteria2',
                            'anytls',
                            'ssh',
                            'snell',
                        ].includes(original.type)
                    ) {
                        if (
                            ['on', 'true', true, '1', 1].includes(
                                original['block-quic'],
                            )
                        ) {
                            proxy.block_quic = true;
                        } else if (
                            ['off', 'false', false, '0', 0].includes(
                                original['block-quic'],
                            )
                        ) {
                            proxy.block_quic = false;
                        }
                    }
                    if (
                        ['ss'].includes(original.type) &&
                        proxy.shadow_tls &&
                        original['udp-port'] > 0 &&
                        original['udp-port'] <= 65535
                    ) {
                        proxy['udp_port'] = original['udp-port'];
                    }

                    delete proxy.subName;
                    delete proxy.collectionName;
                    delete proxy.id;
                    delete proxy.resolved;
                    delete proxy['no-resolve'];

                    if (proxy.transport) {
                        for (const key in proxy.transport) {
                            if (
                                key !== 'grpc' &&
                                (Object.keys(proxy.transport[key]).length ===
                                    0 ||
                                    Object.values(proxy.transport[key]).every(
                                        (value) => value == null,
                                    ))
                            ) {
                                delete proxy.transport[key];
                            }
                        }
                        if (Object.keys(proxy.transport).length === 0) {
                            delete proxy.transport;
                        }
                    }

                    if (type !== 'internal') {
                        for (const key in proxy) {
                            if (proxy[key] == null || /^_/i.test(key)) {
                                delete proxy[key];
                            }
                        }
                    }
                    return {
                        [proxy.type]: {
                            ...proxy,
                            type: undefined,
                            prev_hop,
                        },
                    };
                } catch (err) {
                    $.error(
                        `Cannot produce proxy: ${proxy.name}\nReason: ${err}`,
                    );
                    return null;
                }
            })
            .filter(Boolean);
        return produceProxyListOutput(list, type, opts);
    };
    return { type, produce };
}

function hasHeaders(proxy) {
    return (
        proxy?.headers &&
        typeof proxy.headers === 'object' &&
        Object.keys(proxy.headers).length > 0
    );
}

function getTfo(proxy) {
    return proxy.tfo ?? proxy['fast-open'];
}

function getUdpRelay(proxy) {
    return proxy.udp ?? proxy.udp_relay;
}

function getNonEmptyValue(value) {
    if (value == null) return undefined;
    if (typeof value === 'string' && value.length === 0) return undefined;
    return value;
}

function getReality(proxy) {
    const realityOpts = proxy?.['reality-opts'];
    if (!realityOpts) return undefined;

    const reality = {};
    const publicKey = getNonEmptyValue(realityOpts['public-key']);
    const shortId = getNonEmptyValue(realityOpts['short-id']);
    if (publicKey != null) reality.public_key = publicKey;
    if (shortId != null) reality.short_id = shortId;

    return Object.keys(reality).length > 0 ? reality : undefined;
}

function getGrpcTransport(proxy) {
    return {
        grpc: {
            service_name: proxy['grpc-opts']?.['grpc-service-name'],
            sni: proxy.sni,
            reality: getReality(proxy),
            skip_tls_verify: proxy['skip-cert-verify'],
        },
    };
}

function isEgernGrpcGun(proxy) {
    if (proxy.network !== 'grpc') return true;

    const grpcType = proxy['grpc-opts']?.['_grpc-type'];
    if (grpcType == null) return true;

    return `${grpcType}`.trim().toLowerCase() === 'gun';
}

function normalizeSnellVersion(version) {
    if (version == null) return undefined;

    const normalized = `${version}`.trim();
    if (!/^[1-5]$/.test(normalized)) return null;

    return parseInt(normalized, 10);
}

function getFirstHeaderValue(headers, ...keys) {
    for (const key of keys) {
        const value = getFirstValue(headers?.[key]);
        if (value) return value;
    }
    return undefined;
}

function getFirstH2Host(h2Opts) {
    return (
        getFirstValue(h2Opts?.host) ||
        getFirstHeaderValue(h2Opts?.headers, 'host', 'Host')
    );
}

function getH2Headers(h2Opts) {
    const headers = {};
    if (
        h2Opts?.headers &&
        typeof h2Opts.headers === 'object' &&
        !Array.isArray(h2Opts.headers)
    ) {
        for (const [key, value] of Object.entries(h2Opts.headers)) {
            if (/^host$/i.test(key)) continue;
            const headerValue = getFirstValue(value);
            if (headerValue != null) {
                headers[key] = headerValue;
            }
        }
    }
    const host = getFirstH2Host(h2Opts);
    if (host) {
        headers.Host = host;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
}

function getFirstValue(value) {
    if (Array.isArray(value)) return value[0];
    if (value != null) return value;
    return undefined;
}

function getFingerprintSha256(proxy) {
    const fingerprint = proxy?.['tls-fingerprint'];
    if (typeof fingerprint !== 'string') return undefined;
    const trimmedFingerprint = fingerprint.trim();
    return trimmedFingerprint.length > 0 ? trimmedFingerprint : undefined;
}

function supportsRootFingerprintSha256(original, proxy) {
    return (
        ['anytls', 'https', 'hysteria2', 'trojan', 'tuic'].includes(
            original.type,
        ) ||
        (original.type === 'socks5' && proxy.type === 'socks5_tls') ||
        (original.type === 'http' && proxy.type === 'https')
    );
}

function addTransportFingerprintSha256(transport, fingerprintSha256) {
    if (!transport) return;

    for (const key of ['grpc', 'http2', 'tls', 'wss']) {
        if (transport[key]) {
            transport[key].fingerprint_sha256 = fingerprintSha256;
        }
    }
}
