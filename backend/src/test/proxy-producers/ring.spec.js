import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';

import Ring_Producer, {
    RingUnsupportedProxyError,
} from '@/core/proxy-utils/producers/ring';
import PROXY_PRODUCERS from '@/core/proxy-utils/producers';
import { ProxyUtils } from '@/core/proxy-utils';
import {
    getPlatformFromUserAgent,
    getPlatformFromHeaders,
} from '@/utils/user-agent';
import { produceExternal, produceInternal, UUID } from './helpers';

describe('Ring producer & platform tests', function () {
    describe('Target platform registration', function () {
        it('registers Ring and ring in PROXY_PRODUCERS', function () {
            expect(PROXY_PRODUCERS.Ring).to.be.an('object');
            expect(PROXY_PRODUCERS.Ring.produce).to.be.a('function');
            expect(PROXY_PRODUCERS.ring).to.be.an('object');
            expect(PROXY_PRODUCERS.ring.produce).to.be.a('function');
        });

        it('produces identical output for Ring and ring', function () {
            const node = {
                type: 'ss',
                name: 'SS1',
                server: '1.1.1.1',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pass',
            };
            const r1 = PROXY_PRODUCERS.Ring.produce(node);
            const r2 = PROXY_PRODUCERS.ring.produce(node);
            expect(r1).to.equal(
                'SS1 = shadowsocks, 1.1.1.1, 8388, encrypt-method=aes-128-gcm, password=pass',
            );
            expect(r1).to.equal(r2);
        });
    });

    describe('User-Agent recognition', function () {
        it('recognizes various Ring User-Agents', function () {
            const uas = [
                'Ring/1.0.0 (iOS)',
                'ring-core/0.1.0',
                'Ring/2.3.4 (macOS; arm64)',
                'RING/1.0',
                'Mozilla/5.0 Ring/1.0',
                'ring',
            ];
            for (const ua of uas) {
                expect(
                    getPlatformFromUserAgent({
                        ua: ua.toLowerCase(),
                        UA: ua,
                        accept: '',
                    }),
                ).to.equal('Ring');
            }
        });

        it('extracts platform from headers case-insensitively', function () {
            expect(
                getPlatformFromHeaders({ 'user-agent': 'Ring/1.0.0 (iOS)' }),
            ).to.equal('Ring');
            expect(
                getPlatformFromHeaders({ 'User-Agent': 'ring-client/2.0' }),
            ).to.equal('Ring');
        });

        it('does not shadow existing clients', function () {
            expect(
                getPlatformFromUserAgent({
                    ua: 'surge/4.0',
                    UA: 'Surge/4.0',
                    accept: '',
                }),
            ).to.equal('Surge');
            expect(
                getPlatformFromUserAgent({
                    ua: 'loon/2.0',
                    UA: 'Loon/2.0',
                    accept: '',
                }),
            ).to.equal('Loon');
            expect(
                getPlatformFromUserAgent({
                    ua: 'clash/1.0',
                    UA: 'Clash/1.0',
                    accept: '',
                }),
            ).to.equal('Clash');
        });
    });

    describe('Protocol conversions', function () {
        const producer = Ring_Producer();

        it('produces Shadowsocks with obfs and converts shadow-tls plugin', function () {
            const obfs = producer.produce({
                type: 'ss',
                name: 'SS-Obfs',
                server: 'ss.example.com',
                port: 80,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                plugin: 'obfs',
                'plugin-opts': { mode: 'http', host: 'bing.com', path: '/s' },
            });
            expect(obfs).to.equal(
                'SS-Obfs = shadowsocks, ss.example.com, 80, encrypt-method=aes-128-gcm, password=pwd, obfs=http, obfs-host=bing.com, obfs-path=/s',
            );

            const stls = producer.produce({
                type: 'ss',
                name: 'SS-STLS',
                server: 'ss.example.com',
                port: 443,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    password: 'pass',
                    host: 'apple.com',
                    version: 3,
                },
            });
            expect(stls).to.equal(
                'SS-STLS = shadowsocks, ss.example.com, 443, encrypt-method=aes-128-gcm, password=pwd, shadow-tls=true, shadow-tls-version=3, shadow-tls-password=pass, shadow-tls-sni=apple.com',
            );
        });

        it('converts all Sing Mux parameters from top-level, smux and multiplex objects', function () {
            // 1. Direct top-level options
            const directMux = producer.produce({
                type: 'ss',
                name: 'SS-Mux-1',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'sing-mux': true,
                'sing-mux-stream-num-per-conn': 16,
                'sing-mux-max-connections': 4,
                'sing-mux-padding': true,
                'sing-mux-idle-timeout': 60,
            });
            expect(directMux).to.include('sing-mux=true');
            expect(directMux).to.include('sing-mux-stream-num-per-conn=16');
            expect(directMux).to.include('sing-mux-max-connections=4');
            expect(directMux).to.include('sing-mux-padding=true');
            expect(directMux).to.include('sing-mux-idle-timeout=60');

            // 2. From smux object (Sing-box format)
            const smuxNode = producer.produce({
                type: 'trojan',
                name: 'Trojan-Smux',
                server: 'trojan.example.com',
                port: 443,
                password: 'pwd',
                smux: {
                    enabled: true,
                    'max-streams': 8,
                    'max-connections': 2,
                    padding: true,
                    'idle-timeout': 45,
                },
            });
            expect(smuxNode).to.include('sing-mux=true');
            expect(smuxNode).to.include('sing-mux-stream-num-per-conn=8');
            expect(smuxNode).to.include('sing-mux-max-connections=2');
            expect(smuxNode).to.include('sing-mux-padding=true');
            expect(smuxNode).to.include('sing-mux-idle-timeout=45');

            // 3. From multiplex object (ClashMeta format)
            const multiplexNode = producer.produce({
                type: 'ss',
                name: 'SS-Multiplex',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                multiplex: {
                    enabled: true,
                    max_streams: 32,
                    max_connections: 8,
                    padding: false,
                    idle_timeout: 90,
                },
            });
            expect(multiplexNode).to.include('sing-mux=true');
            expect(multiplexNode).to.include('sing-mux-stream-num-per-conn=32');
            expect(multiplexNode).to.include('sing-mux-max-connections=8');
            expect(multiplexNode).to.include('sing-mux-padding=false');
            expect(multiplexNode).to.include('sing-mux-idle-timeout=90');

            // 4. Explicit disable
            const disabledMux = producer.produce({
                type: 'ss',
                name: 'SS-NoMux',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'sing-mux': false,
            });
            expect(disabledMux).to.include('sing-mux=false');
        });

        it('produces VMess with WS and TLS', function () {
            const res = producer.produce({
                type: 'vmess',
                name: 'VMess-Test',
                server: 'vmess.com',
                port: 443,
                uuid: UUID,
                network: 'ws',
                tls: true,
                sni: 'sni.com',
                'skip-cert-verify': true,
                alpn: ['h2', 'http/1.1'],
                'ws-opts': { path: '/ws', headers: { Host: 'ws.com' } },
            });
            expect(res).to.include('ws=true');
            expect(res).to.include('ws-path=/ws');
            expect(res).to.include('headers=Host:ws.com');
            expect(res).to.include('tls=true');
            expect(res).to.include('sni=sni.com');
            expect(res).to.include('skip-cert-verify=true');
            expect(res).to.include('alpns="h2,http/1.1"');
        });

        it('normalizes various ip-version inputs to valid Ring enum values', function () {
            const cases = [
                ['prefer-v4', 'prefer-ipv4'],
                ['prefer-ipv4', 'prefer-ipv4'],
                ['v4_prefer', 'prefer-ipv4'],
                ['ipv4-prefer', 'prefer-ipv4'],
                ['prefer-v6', 'prefer-ipv6'],
                ['prefer-ipv6', 'prefer-ipv6'],
                ['v6_prefer', 'prefer-ipv6'],
                ['ipv6-prefer', 'prefer-ipv6'],
                ['v4-only', 'ipv4-only'],
                ['ipv4-only', 'ipv4-only'],
                ['v4_only', 'ipv4-only'],
                ['ipv4', 'ipv4-only'],
                ['v6-only', 'ipv6-only'],
                ['ipv6-only', 'ipv6-only'],
                ['v6_only', 'ipv6-only'],
                ['ipv6', 'ipv6-only'],
                ['dual', 'dual'],
                ['dual_stack', 'dual'],
                ['dual-stack', 'dual'],
            ];
            for (const [input, expected] of cases) {
                const output = producer.produce({
                    type: 'ss',
                    name: 'Node',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                    'ip-version': input,
                });
                expect(output).to.include(`ip-version=${expected}`);
            }

            const invalidOutput = producer.produce({
                type: 'ss',
                name: 'Node',
                server: '1.1.1.1',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'ip-version': 'invalid-version-xyz',
            });
            expect(invalidOutput).not.to.include('ip-version=');
        });

        it('throws RingUnsupportedProxyError for unsupported network or config', function () {
            expect(() =>
                producer.produce({
                    type: 'vmess',
                    name: 'V',
                    server: '1.1.1.1',
                    port: 443,
                    uuid: UUID,
                    network: 'grpc',
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    type: 'vmess',
                    name: 'V',
                    server: '1.1.1.1',
                    port: 443,
                    uuid: UUID,
                    network: 'ws',
                    'ws-opts': { 'v2ray-http-upgrade': true },
                }),
            ).to.throw(RingUnsupportedProxyError);
        });

        it('produces Trojan, Hysteria, TUIC, and WireGuard', function () {
            const trojan = producer.produce({
                type: 'trojan',
                name: 'Trojan',
                server: 't.com',
                port: 443,
                password: 'pass',
            });
            expect(trojan).to.include('trojan, t.com, 443, password=pass, tls=true');

            const hy = producer.produce({
                type: 'hysteria2',
                name: 'Hy2',
                server: 'hy.com',
                port: 443,
                password: 'pass',
                'up-mbps': 100,
                'down-mbps': 500,
            });
            expect(hy).to.equal(
                'Hy2 = hysteria, hy.com, 443, auth=pass, down=500, sni=hy.com',
            );

            const tuic = producer.produce({
                type: 'tuic',
                name: 'Tuic',
                server: 'tuic.com',
                port: 8443,
                uuid: UUID,
                password: 'pass',
                'udp-relay-mode': 'NATIVE',
                'congestion-controller': 'bbr',
            });
            expect(tuic).to.include('tuic, tuic.com, 8443');
            expect(tuic).to.include('udp-relay-mode=native');
            expect(tuic).not.to.include('congestion-controller');

            const wg = producer.produce({
                type: 'wireguard',
                name: 'WG',
                addresses: ['10.0.0.2/32'],
                'private-key': 'priv==',
                peers: [
                    {
                        'public-key': 'pub==',
                        endpoint: 'wg.com:51820',
                        'allowed-ips': '0.0.0.0/0, ::/0',
                    },
                ],
            });
            expect(wg).to.include('wireguard, addresses=10.0.0.2');
            expect(wg).not.to.include('/32');
            expect(wg).to.include('endpoint=wg.com:51820');
            expect(wg).to.include('allowed-ips="0.0.0.0/0, ::/0"');
        });

        it('produces WireGuard with pure IPs without CIDR mask, reserved array, keepalive, and interface dns', function () {
            const wg = producer.produce({
                type: 'wireguard',
                name: 'WG-Advanced',
                addresses: ['10.0.0.2/32', 'fd00::2/128'],
                'private-key': 'privkey',
                mtu: 1420,
                dns: ['1.1.1.1', '8.8.8.8'],
                peers: [
                    {
                        'public-key': 'pubkey',
                        endpoint: 'wg.example.com:51820',
                        'allowed-ips': '0.0.0.0/0, ::/0',
                        reserved: [0, 0, 0],
                        keepalive: 25,
                    },
                ],
            });
            expect(wg).to.include('addresses="10.0.0.2, fd00::2"');
            expect(wg).not.to.include('/32');
            expect(wg).not.to.include('/128');
            expect(wg).to.include('dns="1.1.1.1, 8.8.8.8"');
            expect(wg).to.include('reserved=[0,0,0]');
            expect(wg).to.include('keepalive=25');
        });

        it('produces Hysteria with Salamander obfs, down unit preservation, and forbids up or congestion-controller', function () {
            const hy = producer.produce({
                type: 'hysteria2',
                name: 'Hy2-Obfs',
                server: 'hy2.example.com',
                port: 443,
                password: 'pass',
                'obfs-password': 'salamander-pwd',
                down: '100 Mbps',
                up: '50 Mbps',
                'congestion-controller': 'bbr',
            });
            expect(hy).to.include('obfs=salamander-pwd');
            expect(hy).to.include('down=100mbps');
            expect(hy).not.to.include('up=');
            expect(hy).not.to.include('congestion-controller=');
        });

        it('rejects standalone ShadowTLS nodes', function () {
            expect(() =>
                producer.produce({
                    type: 'shadowtls',
                    name: 'ST-Node',
                    server: 'st.example.com',
                    port: 443,
                    password: 'pass',
                    sni: 'apple.com',
                    version: 3,
                }),
            ).to.throw(RingUnsupportedProxyError);
        });

        it('produces Tailscale with pure options format and no server/port positional arguments', function () {
            const ts = producer.produce({
                type: 'tailscale',
                name: 'TS-Node',
                server: 'ts.example.com',
                port: 443,
                'auth-key': 'tskey-auth-xxx',
                hostname: 'my-node',
                'control-url': 'https://controlplane.tailscale.com',
                'exit-node': 'exit-us',
            });
            expect(ts).to.equal(
                'TS-Node = tailscale, auth-key=tskey-auth-xxx, hostname=my-node, control-url=https://controlplane.tailscale.com, exit-node=exit-us',
            );
            expect(ts).not.to.include('ts.example.com');
            expect(ts).not.to.include('443');

            const tsMode = producer.produce({
                type: 'tailscale',
                name: 'TS-Mode',
                'auth-key': 'tskey-auth-xxx',
                'connection-mode': 'no-peer-relay',
                'derp-only': true,
            });
            expect(tsMode).to.equal(
                'TS-Mode = tailscale, auth-key=tskey-auth-xxx, connection-mode=no-peer-relay',
            );
        });

        it('produces base strategy direct without network connection options', function () {
            const d = producer.produce({
                type: 'direct',
                name: 'Direct-Node',
                tfo: true,
                'ip-version': 'ipv4',
            });
            expect(d).to.equal('Direct-Node = direct');
            expect(d).not.to.include('tfo=');
            expect(d).not.to.include('ip-version=');
        });

        it('sanitizes names and properly quotes special characters', function () {
            const res = producer.produce({
                type: 'ss',
                name: 'Node=1,Test',
                server: '1.2.3.4',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'p@ss with space,comma=eq#hash"quote"',
            });
            expect(res).to.match(/^Node1Test = shadowsocks/);
            expect(res).to.include('"p@ss with space,comma=eq#hash\\"quote\\""');
        });

        it('produces VLESS with TCP, TLS, REALITY, Vision, and packet-encoding', function () {
            const tlsNode = producer.produce({
                type: 'vless',
                name: 'VLESS-TLS',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.example.com',
                alpn: ['h2', 'http/1.1'],
                'skip-cert-verify': true,
                'tls-fingerprint':
                    '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
                'client-fingerprint': 'chrome',
                'packet-encoding': 'packetaddr',
            });
            expect(tlsNode).to.equal(
                `VLESS-TLS = vless, vless.example.com, 443, uuid=${UUID}, packet-encoding=packet, security=tls, sni=sni.example.com, alpns="h2,http/1.1", skip-cert-verify=true, server-cert-fingerprint-sha256=11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff, fingerprint=chrome`,
            );

            const realityVision = producer.produce({
                type: 'vless',
                name: 'VLESS-Vision',
                server: 'reality.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'www.microsoft.com',
                flow: 'xtls-rprx-vision-udp443',
                'skip-cert-verify': true,
                'reality-opts': {
                    'public-key': 'test-reality-pubkey',
                    'short-id': '01ab',
                },
                'client-fingerprint': 'safari',
            });
            expect(realityVision).to.equal(
                `VLESS-Vision = vless, reality.example.com, 443, uuid=${UUID}, flow=xtls-rprx-vision-udp443, security=reality, sni=www.microsoft.com, reality-public-key=test-reality-pubkey, reality-short-id=01ab, fingerprint=safari`,
            );
            expect(realityVision).not.to.include('tls=true');
            expect(realityVision).not.to.include('skip-cert-verify');
        });

        it('produces VLESS with WebSocket and gRPC transports', function () {
            const wsNode = producer.produce({
                type: 'vless',
                name: 'VLESS-WS',
                server: 'cdn.example.com',
                port: 443,
                uuid: UUID,
                network: 'ws',
                tls: true,
                sni: 'cdn.example.com',
                'ws-opts': {
                    path: '/vless-ws',
                    headers: {
                        Host: 'ws.example.com',
                        'X-Custom': 'val',
                    },
                },
            });
            expect(wsNode).to.equal(
                `VLESS-WS = vless, cdn.example.com, 443, uuid=${UUID}, transport=ws, host=ws.example.com, path=/vless-ws, headers=X-Custom:val, security=tls, sni=cdn.example.com`,
            );

            const grpcNode = producer.produce({
                type: 'vless',
                name: 'VLESS-gRPC',
                server: 'grpc.example.com',
                port: 443,
                uuid: UUID,
                network: 'grpc',
                tls: true,
                sni: 'grpc.example.com',
                alpn: ['h2'],
                'grpc-opts': {
                    'grpc-service-name': 'myGunService',
                    '_grpc-authority': 'auth.example.com',
                    '_grpc-type': 'multi',
                },
            });
            expect(grpcNode).to.equal(
                `VLESS-gRPC = vless, grpc.example.com, 443, uuid=${UUID}, transport=grpc, grpc-service-name=myGunService, grpc-authority=auth.example.com, grpc-multi-mode=true, security=tls, sni=grpc.example.com, alpns=h2`,
            );
        });

        it('produces VLESS with XHTTP, HTTP/3 ALPN, and flat xhttp-download-* options', function () {
            const h2ToH3 = producer.produce({
                type: 'vless',
                name: 'VLESS-XHTTP-H2-H3',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                network: 'xhttp',
                tls: true,
                sni: 'up.example.com',
                alpn: ['h2'],
                'xhttp-opts': {
                    host: 'cdn-up.example.com',
                    path: '/ring/',
                    mode: 'auto',
                    headers: {
                        'X-Up': '1',
                    },
                    'download-settings': {
                        server: 'down.example.com',
                        port: 8443,
                        tls: true,
                        servername: 'down.example.com',
                        alpn: ['h3'],
                        'client-fingerprint': 'chrome',
                        'skip-cert-verify': true,
                        host: 'cdn-down.example.com',
                        headers: {
                            'X-Down': '2',
                        },
                    },
                },
            });
            expect(h2ToH3).to.equal(
                `VLESS-XHTTP-H2-H3 = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, host=cdn-up.example.com, path=/ring/, headers=X-Up:1, xhttp-mode=auto, security=tls, sni=up.example.com, alpns=h2, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=8443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-skip-cert-verify=true, xhttp-download-fingerprint=chrome, xhttp-download-host=cdn-down.example.com, xhttp-download-path=/ring/, xhttp-download-headers=X-Down:2`,
            );

            // Direct top-level flat xhttp-download-* fields (like sing-mux)
            const directFlatDownload = producer.produce({
                type: 'vless',
                name: 'VLESS-Flat-DL',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                transport: 'xhttp',
                path: '/ring/',
                security: 'tls',
                sni: 'up.example.com',
                alpns: 'h2',
                'xhttp-download': true,
                'xhttp-download-address': 'down.example.com',
                'xhttp-download-port': 443,
                'xhttp-download-security': 'tls',
                'xhttp-download-sni': 'down.example.com',
                'xhttp-download-alpns': 'h3',
                'xhttp-download-path': '/ring/',
            });
            expect(directFlatDownload).to.equal(
                `VLESS-Flat-DL = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, path=/ring/, security=tls, sni=up.example.com, alpns=h2, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-path=/ring/`,
            );

            // H3 upload + REALITY download
            const h3ToReality = producer.produce({
                type: 'vless',
                name: 'VLESS-H3-Reality',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                network: 'xhttp',
                tls: true,
                sni: 'up.example.com',
                alpn: ['h3'],
                'xhttp-opts': {
                    path: '/ring/',
                    'download-settings': {
                        server: 'down.example.com',
                        port: 443,
                        tls: true,
                        servername: 'cover.example.com',
                        'reality-opts': {
                            'public-key': 'dl-pubkey',
                            'short-id': '0a1b',
                        },
                        'client-fingerprint': 'ios',
                    },
                },
            });
            expect(h3ToReality).to.equal(
                `VLESS-H3-Reality = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, path=/ring/, security=tls, sni=up.example.com, alpns=h3, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=reality, xhttp-download-sni=cover.example.com, xhttp-download-reality-public-key=dl-pubkey, xhttp-download-reality-short-id=0a1b, xhttp-download-fingerprint=ios, xhttp-download-path=/ring/`,
            );

            // Mihomo empty public-key cancels REALITY inheritance on download-settings
            const realityToTls = producer.produce({
                type: 'vless',
                name: 'VLESS-Reality-Cancel',
                server: 'up.example.com',
                port: 443,
                uuid: UUID,
                network: 'xhttp',
                tls: true,
                sni: 'cover.example.com',
                'reality-opts': {
                    'public-key': 'up-pubkey',
                },
                'xhttp-opts': {
                    path: '/xhttp',
                    'download-settings': {
                        server: 'down.example.com',
                        port: 443,
                        tls: true,
                        servername: 'down.example.com',
                        alpn: ['h3'],
                        'reality-opts': {
                            'public-key': '',
                        },
                    },
                },
            });
            expect(realityToTls).to.include(
                'xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-path=/xhttp',
            );
        });

        it('round-trips VLESS URIs (REALITY Vision and XHTTP downloadSettings) into Ring INI', function () {
            const [realityNode] = ProxyUtils.parse(
                `vless://${UUID}@example.com:443?security=reality&sni=www.microsoft.com&pbk=test-pubkey&sid=01ab&flow=xtls-rprx-vision&fp=chrome#URI-VLESS-Reality`,
            );
            const realityIni = producer.produce(realityNode);
            expect(realityIni).to.equal(
                `URI-VLESS-Reality = vless, example.com, 443, uuid=${UUID}, flow=xtls-rprx-vision, security=reality, sni=www.microsoft.com, reality-public-key=test-pubkey, reality-short-id=01ab, fingerprint=chrome`,
            );

            const extra = encodeURIComponent(
                JSON.stringify({
                    downloadSettings: {
                        address: 'down.example.com',
                        port: 443,
                        network: 'xhttp',
                        security: 'tls',
                        tlsSettings: {
                            serverName: 'down.example.com',
                            alpn: ['h3'],
                            fingerprint: 'chrome',
                        },
                        xhttpSettings: {
                            path: '/xhttp',
                            host: 'cdn.down.example.com',
                        },
                    },
                }),
            );
            const [xhttpNode] = ProxyUtils.parse(
                `vless://${UUID}@up.example.com:443?type=xhttp&security=reality&sni=cover.example.com&pbk=up-pubkey&sid=0102&path=%2Fxhttp&host=cdn.up.example.com&mode=packet-up&extra=${extra}#URI-VLESS-XHTTP`,
            );
            const xhttpIni = producer.produce(xhttpNode);
            expect(xhttpIni).to.equal(
                `URI-VLESS-XHTTP = vless, up.example.com, 443, uuid=${UUID}, transport=xhttp, host=cdn.up.example.com, path=/xhttp, xhttp-mode=packet-up, security=reality, sni=cover.example.com, reality-public-key=up-pubkey, reality-short-id=0102, xhttp-download=true, xhttp-download-address=down.example.com, xhttp-download-port=443, xhttp-download-security=tls, xhttp-download-sni=down.example.com, xhttp-download-alpns=h3, xhttp-download-fingerprint=chrome, xhttp-download-host=cdn.down.example.com, xhttp-download-path=/xhttp`,
            );
        });

        it('rejects invalid VLESS combinations aligned with core constraints', function () {
            const base = {
                type: 'vless',
                name: 'Invalid-VLESS',
                server: 'example.com',
                port: 443,
                uuid: UUID,
            };

            // Non-none encryption
            expect(() =>
                producer.produce({ ...base, encryption: 'mlkem768' }),
            ).to.throw(RingUnsupportedProxyError);

            // Unsupported flow
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    flow: 'xtls-rprx-direct',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // Vision over non-TCP
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'ws',
                    flow: 'xtls-rprx-vision',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // Vision without TLS/REALITY
            expect(() =>
                producer.produce({
                    ...base,
                    flow: 'xtls-rprx-vision',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // REALITY over WebSocket
            expect(() =>
                producer.produce({
                    ...base,
                    network: 'ws',
                    sni: 'example.com',
                    'reality-opts': { 'public-key': 'pubkey' },
                }),
            ).to.throw(RingUnsupportedProxyError);

            // REALITY without public-key
            expect(() =>
                producer.produce({
                    ...base,
                    sni: 'example.com',
                    'reality-opts': { 'short-id': '01' },
                }),
            ).to.throw(RingUnsupportedProxyError);

            // REALITY with incapable fingerprint (android)
            expect(() =>
                producer.produce({
                    ...base,
                    sni: 'example.com',
                    'reality-opts': { 'public-key': 'pubkey' },
                    'client-fingerprint': 'android',
                }),
            ).to.throw(RingUnsupportedProxyError);

            // HTTP/3 ALPN on non-XHTTP or mixed ALPN or REALITY
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'ws',
                    alpn: ['h3'],
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'xhttp',
                    alpn: ['h2', 'h3'],
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    ...base,
                    network: 'xhttp',
                    sni: 'example.com',
                    'reality-opts': { 'public-key': 'pubkey' },
                    alpn: ['h3'],
                }),
            ).to.throw(RingUnsupportedProxyError);

            // xhttp-download with stream-one or mismatched path
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'xhttp',
                    'xhttp-opts': {
                        path: '/up',
                        mode: 'stream-one',
                        'download-settings': {
                            server: 'down.example.com',
                            port: 443,
                        },
                    },
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'xhttp',
                    'xhttp-opts': {
                        path: '/up',
                        'download-settings': {
                            server: 'down.example.com',
                            port: 443,
                            path: '/down',
                        },
                    },
                }),
            ).to.throw(RingUnsupportedProxyError);

            // Blocked transport-managed HTTP header
            expect(() =>
                producer.produce({
                    ...base,
                    tls: true,
                    network: 'ws',
                    'ws-opts': {
                        headers: {
                            Connection: 'keep-alive',
                        },
                    },
                }),
            ).to.throw(RingUnsupportedProxyError);
        });

        it('converts server-cert-fingerprint-sha256 across all TLS-supported protocols and handles aliases', function () {
            const hexRaw =
                '11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF';
            const hexCleaned =
                '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

            // 1. VMess with server-cert-fingerprint-sha256 containing colons
            const vmessRes = producer.produce({
                type: 'vmess',
                name: 'VMess-Cert',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                tls: true,
                'server-cert-fingerprint-sha256': hexRaw,
            });
            expect(vmessRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 2. Trojan with tls-fingerprint
            const trojanRes = producer.produce({
                type: 'trojan',
                name: 'Trojan-Cert',
                server: 't.com',
                port: 443,
                password: 'pass',
                'tls-fingerprint': hexCleaned,
            });
            expect(trojanRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 3. Hysteria2 with certificate-sha256
            const hyRes = producer.produce({
                type: 'hysteria2',
                name: 'Hy-Cert',
                server: 'h.com',
                port: 443,
                password: 'pass',
                'certificate-sha256': hexCleaned,
            });
            expect(hyRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 4. TUIC with cert-fingerprint-sha256
            const tuicRes = producer.produce({
                type: 'tuic',
                name: 'TUIC-Cert',
                server: 'tuic.com',
                port: 443,
                uuid: UUID,
                password: 'pass',
                'cert-fingerprint-sha256': hexCleaned,
            });
            expect(tuicRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 5. HTTPS with server-cert-sha256
            const httpsRes = producer.produce({
                type: 'https',
                name: 'HTTPS-Cert',
                server: 'http.com',
                port: 443,
                'server-cert-sha256': hexCleaned,
            });
            expect(httpsRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 6. SOCKS with tls and tls-cert-sha256
            const socksRes = producer.produce({
                type: 'socks5',
                name: 'SOCKS-Cert',
                server: 'socks.com',
                port: 443,
                tls: true,
                'tls-cert-sha256': hexCleaned,
            });
            expect(socksRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 7. AnyTLS with ca-sha256
            const anytlsRes = producer.produce({
                type: 'anytls',
                name: 'AnyTLS-Cert',
                server: 'anytls.com',
                port: 443,
                password: 'pass',
                'ca-sha256': hexCleaned,
            });
            expect(anytlsRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 8. 64-hex proxy.fingerprint
            const fpHexRes = producer.produce({
                type: 'trojan',
                name: 'Trojan-FpHex',
                server: 't.com',
                port: 443,
                password: 'pass',
                fingerprint: hexCleaned,
            });
            expect(fpHexRes).to.include(
                `server-cert-fingerprint-sha256=${hexCleaned}`,
            );

            // 9. uTLS client fingerprint (e.g. 'chrome') must NOT be treated as server cert sha256
            const fpUtlsRes = producer.produce({
                type: 'trojan',
                name: 'Trojan-FpUtls',
                server: 't.com',
                port: 443,
                password: 'pass',
                fingerprint: 'chrome',
            });
            expect(fpUtlsRes).not.to.include('server-cert-fingerprint-sha256');
        });

        it('converts shadow-tls plugin, STLS fingerprint, and enforces protocol constraints', function () {
            const hexCleaned =
                '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

            // 1. Shadowsocks with STLS certificate fingerprint from plugin-opts
            const ssStls = producer.produce({
                type: 'ss',
                name: 'SS-STLS-Cert',
                server: 'stls.example.com',
                port: 443,
                cipher: 'aes-128-gcm',
                password: 'ss-password',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    version: 3,
                    password: 'stls-password',
                    host: 'cover.example.com',
                    'tls-fingerprint': hexCleaned,
                    alpn: ['h2', 'http/1.1'],
                },
                'skip-cert-verify': true,
                'enable-early-data': true,
            });
            expect(ssStls).to.include('shadow-tls=true');
            expect(ssStls).to.include('shadow-tls-version=3');
            expect(ssStls).to.include('shadow-tls-password=stls-password');
            expect(ssStls).to.include('shadow-tls-sni=cover.example.com');
            expect(ssStls).to.include(
                `shadow-tls-server-cert-fingerprint-sha256=${hexCleaned}`,
            );
            expect(ssStls).to.include('shadow-tls-alpns="h2,http/1.1"');
            expect(ssStls).not.to.match(/(?:^|,\s+)tls=true(?=,|$)/);
            expect(ssStls).not.to.include('skip-cert-verify');
            expect(ssStls).not.to.include('enable-early-data');
            expect(ssStls).not.to.include('shadow-tls-skip-cert-verify');
            expect(ssStls).not.to.include('shadow-tls-enable-early-data');

            // 2. Trojan with STLS (replaces Trojan default TLS)
            const trojanStls = producer.produce({
                type: 'trojan',
                name: 'Trojan-STLS',
                server: 'stls.example.com',
                port: 443,
                password: 'trojan-password',
                'shadow-tls': true,
                'shadow-tls-version': 3,
                'shadow-tls-password': 'stls-password',
                'shadow-tls-sni': 'cover.example.com',
                'shadow-tls-server-cert-fingerprint-sha256': hexCleaned,
            });
            expect(trojanStls).to.include('password=trojan-password');
            expect(trojanStls).to.include('shadow-tls=true');
            expect(trojanStls).to.include('shadow-tls-version=3');
            expect(trojanStls).to.include('shadow-tls-password=stls-password');
            expect(trojanStls).to.include('shadow-tls-sni=cover.example.com');
            expect(trojanStls).to.include(
                `shadow-tls-server-cert-fingerprint-sha256=${hexCleaned}`,
            );
            expect(trojanStls).not.to.match(/(?:^|,\s+)tls=true(?=,|$)/);

            // 3. VMess with STLS and WebSocket
            const vmessStls = producer.produce({
                type: 'vmess',
                name: 'VMess-STLS-WS',
                server: 'stls.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'aes-128-gcm',
                network: 'ws',
                'ws-opts': { path: '/ray' },
                'shadow-tls': true,
                'shadow-tls-password': 'stls-password',
                'shadow-tls-sni': 'cover.example.com',
            });
            expect(vmessStls).to.include('cipher=aes-128-gcm');
            expect(vmessStls).to.include('shadow-tls=true');
            expect(vmessStls).to.include('shadow-tls-password=stls-password');
            expect(vmessStls).to.include('shadow-tls-sni=cover.example.com');
            expect(vmessStls).to.include('ws=true');
            expect(vmessStls).to.include('ws-path=/ray');
            expect(vmessStls).not.to.match(/(?:^|,\s+)tls=true(?=,|$)/);

            // 4. Reject STLS on UDP/QUIC protocols
            expect(() =>
                producer.produce({
                    type: 'hysteria2',
                    name: 'Hy-STLS',
                    server: 'hy.com',
                    port: 443,
                    password: 'pass',
                    'shadow-tls': true,
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    type: 'tuic',
                    name: 'TUIC-STLS',
                    server: 'tuic.com',
                    port: 443,
                    uuid: UUID,
                    password: 'pass',
                    'shadow-tls': true,
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    type: 'wireguard',
                    name: 'WG-STLS',
                    addresses: ['10.0.0.2/32'],
                    'private-key': 'priv==',
                    'shadow-tls': true,
                }),
            ).to.throw(RingUnsupportedProxyError);

            expect(() =>
                producer.produce({
                    type: 'tailscale',
                    name: 'TS-STLS',
                    'auth-key': 'key',
                    'shadow-tls': true,
                }),
            ).to.throw(RingUnsupportedProxyError);
        });

        it('handles enable-early-data and skip-cert-verify aliases across protocols', function () {
            // 1. early-data on VMess
            const vmessEd = producer.produce({
                type: 'vmess',
                name: 'VMess-ED',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                tls: true,
                'early-data': true,
            });
            expect(vmessEd).to.include('enable-early-data=true');

            // 2. insecure / allowInsecure / tls_insecure aliases
            const trojanInsecure = producer.produce({
                type: 'trojan',
                name: 'Trojan-Insecure',
                server: 't.com',
                port: 443,
                password: 'pass',
                insecure: true,
            });
            expect(trojanInsecure).to.include('skip-cert-verify=true');

            const httpInsecure = producer.produce({
                type: 'https',
                name: 'HTTP-Insecure',
                server: 'h.com',
                port: 443,
                allowInsecure: true,
            });
            expect(httpInsecure).to.include('skip-cert-verify=true');

            const socksInsecure = producer.produce({
                type: 'socks5',
                name: 'SOCKS-Insecure',
                server: 's.com',
                port: 443,
                tls: true,
                tls_insecure: true,
            });
            expect(socksInsecure).to.include('skip-cert-verify=true');

            // TUIC 不输出早期数据，也不允许关闭 TLS。
            const tuicEd = producer.produce({
                type: 'tuic',
                name: 'TUIC-ED',
                server: 't.com',
                port: 443,
                uuid: UUID,
                password: 'pass',
                'early-data': true,
            });
            expect(tuicEd).not.to.include('enable-early-data');
            expect(tuicEd).not.to.include('tls=false');
            expect(() =>
                producer.produce({
                    type: 'tuic',
                    name: 'TUIC-NoTLS',
                    server: 't.com',
                    port: 443,
                    uuid: UUID,
                    password: '<SECRET>',
                    tls: false,
                }),
            ).to.throw(RingUnsupportedProxyError);
        });

        it('converts VMess cipher', function () {
            const vmessAes = producer.produce({
                type: 'vmess',
                name: 'VMess-AES',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                cipher: 'aes-128-gcm',
            });
            expect(vmessAes).to.include('cipher=aes-128-gcm');

            const vmessChacha = producer.produce({
                type: 'vmess',
                name: 'VMess-Chacha',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                cipher: 'chacha20-ietf-poly1305',
            });
            expect(vmessChacha).to.include('cipher=chacha20-ietf-poly1305');

            const vmessChachaAlias = producer.produce({
                type: 'vmess',
                name: 'VMess-Chacha-Alias',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                cipher: 'chacha20-poly1305',
            });
            expect(vmessChachaAlias).to.include(
                'cipher=chacha20-ietf-poly1305',
            );

            const vmessAuto = producer.produce({
                type: 'vmess',
                name: 'VMess-Auto',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
            });
            expect(vmessAuto).to.include('cipher=auto');

            const vmessNone = producer.produce({
                type: 'vmess',
                name: 'VMess-None',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                cipher: 'none',
            });
            expect(vmessNone).to.include('cipher=none');

            const vmessZero = producer.produce({
                type: 'vmess',
                name: 'VMess-Zero',
                server: 'v.com',
                port: 443,
                uuid: UUID,
                cipher: 'zero',
            });
            expect(vmessZero).to.include('cipher=auto');

            const vmessOmit = producer.produce({
                type: 'vmess',
                name: 'VMess-Default',
                server: 'v.com',
                port: 443,
                uuid: UUID,
            });
            expect(vmessOmit).not.to.include('cipher=');
        });

        it('converts AnyTLS connection pool parameters and STLS', function () {
            const anytlsPool = producer.produce({
                type: 'anytls',
                name: 'AnyTLS-Pool',
                server: 'a.com',
                port: 443,
                password: 'pass',
                'idle-session-check-interval': 30,
                'idle-session-timeout': 60,
                'min-idle-session': 5,
                'max-streams-per-session': 8,
            });
            expect(anytlsPool).to.include('idle-session-check-interval=30');
            expect(anytlsPool).to.include('idle-session-timeout=60');
            expect(anytlsPool).to.include('min-idle-session=5');
            expect(anytlsPool).to.include('max-streams-per-session=8');

            const anytlsStls = producer.produce({
                type: 'anytls',
                name: 'AnyTLS-STLS',
                server: 'stls.example.com',
                port: 443,
                password: 'anytls-password',
                'shadow-tls': true,
                'shadow-tls-password': 'stls-password',
                'shadow-tls-sni': 'cover.example.com',
                'idle-session-timeout': 60,
            });
            expect(anytlsStls).to.include('password=anytls-password');
            expect(anytlsStls).to.include('shadow-tls=true');
            expect(anytlsStls).to.include('shadow-tls-password=stls-password');
            expect(anytlsStls).to.include('shadow-tls-sni=cover.example.com');
            expect(anytlsStls).to.include('idle-session-timeout=60');
            expect(anytlsStls).not.to.match(/(?:^|,\s+)tls=true(?=,|$)/);
        });

        it('converts SSH options and STLS', function () {
            const sshNode = producer.produce({
                type: 'ssh',
                name: 'SSH-Node',
                server: 'ssh.example.com',
                port: 22,
                username: 'deploy',
                password: 'secret-password',
                'idle-timeout': 300,
                'server-fingerprint': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5',
            });
            expect(sshNode).to.include('ssh, ssh.example.com, 22');
            expect(sshNode).to.include('username=deploy');
            expect(sshNode).to.include('password=secret-password');
            expect(sshNode).to.include('idle-timeout=300');
            expect(sshNode).to.include(
                'server-fingerprint="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG5"',
            );

            const sshStls = producer.produce({
                type: 'ssh',
                name: 'SSH-STLS',
                server: 'ssh.example.com',
                port: 443,
                username: 'deploy',
                password: 'secret-password',
                'shadow-tls': true,
                'shadow-tls-password': 'stls-password',
                'shadow-tls-sni': 'cover.example.com',
            });
            expect(sshStls).to.include('shadow-tls=true');
            expect(sshStls).to.include('shadow-tls-password=stls-password');
            expect(sshStls).to.include('shadow-tls-sni=cover.example.com');
        });

        it('converts Tailscale extended options', function () {
            const ts = producer.produce({
                type: 'tailscale',
                name: 'TS-Mesh',
                'auth-key': 'tskey-auth-xxx',
                hostname: 'apple-client',
                'control-url': 'https://headscale.example.com',
                'exit-node': 'gateway-node',
                'http-underlying-proxy': 'SSNode',
                'dns-server': '100.100.100.100',
                'derp-only': true,
                ephemeral: true,
                mtu: 1360,
            });
            expect(ts).to.include('tailscale');
            expect(ts).to.include('auth-key=tskey-auth-xxx');
            expect(ts).to.include('hostname=apple-client');
            expect(ts).to.include('control-url=https://headscale.example.com');
            expect(ts).to.include('exit-node=gateway-node');
            expect(ts).to.include('http-underlying-proxy=SSNode');
            expect(ts).to.include('dns-server=100.100.100.100');
            expect(ts).to.include('derp-only=true');
            expect(ts).to.include('ephemeral=true');
            expect(ts).to.include('mtu=1360');
        });

        it('converts HTTP custom headers', function () {
            const httpNode = producer.produce({
                type: 'http',
                name: 'Http-Headers',
                server: 'proxy.example.com',
                port: 8080,
                username: 'user',
                password: 'pwd',
                headers: {
                    'X-Proxy-Auth': 'token123',
                    'User-Agent': 'CustomAgent',
                },
            });
            expect(httpNode).to.include(
                'headers=X-Proxy-Auth:token123|User-Agent:CustomAgent',
            );
        });

        it('converts Hysteria Realm extensions', function () {
            const hexCleaned =
                '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
            const hyRealm = producer.produce({
                type: 'hysteria',
                name: 'Hy-Realm',
                server: 'hy.example.com',
                port: 443,
                auth: 'pass',
                realm: 'realm://secret@coord.example.com/tunnel1',
                'realm-underlying-proxy': 'UnderlyingNode',
                'realm-stun': [
                    'stun.example.com:3478',
                    'stun1.example.com:3478',
                ],
                'realm-stun-timeout': 5,
                'realm-http-timeout': 10,
                'realm-punch-timeout': 5,
                'realm-insecure': true,
                'realm-sni': 'coord.example.com',
                'realm-server-cert-fingerprint-sha256': hexCleaned,
            });
            expect(hyRealm).to.include(
                'realm=realm://secret@coord.example.com/tunnel1',
            );
            expect(hyRealm).to.include('realm-underlying-proxy=UnderlyingNode');
            expect(hyRealm).to.include(
                'realm-stun="stun.example.com:3478,stun1.example.com:3478"',
            );
            expect(hyRealm).to.include('realm-stun-timeout=5');
            expect(hyRealm).to.include('realm-http-timeout=10');
            expect(hyRealm).to.include('realm-punch-timeout=5');
            expect(hyRealm).to.include('realm-insecure=true');
            expect(hyRealm).to.include('realm-sni=coord.example.com');
            expect(hyRealm).to.include(
                `realm-server-cert-fingerprint-sha256=${hexCleaned}`,
            );
        });

        it('converts tcp-ecn, dns-resolver-type, and ip4p-prefix', function () {
            const nodeEcnOn = producer.produce({
                type: 'ss',
                name: 'SS-Ecn-On',
                server: '1.1.1.1',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'tcp-ecn': true,
                'dns-resolver-type': 1,
                'ip4p-prefix': '2001::',
            });
            expect(nodeEcnOn).to.include('tcp-ecn=on');
            expect(nodeEcnOn).to.include('dns-resolver-type=ip4p');
            expect(nodeEcnOn).to.include('ip4p-prefix=2001::');

            const nodeEcnOff = producer.produce({
                type: 'ss',
                name: 'SS-Ecn-Off',
                server: '1.1.1.1',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'tcp-ecn': 'off',
                'dns-resolver-type': 'default',
            });
            expect(nodeEcnOff).to.include('tcp-ecn=off');
            expect(nodeEcnOff).to.include('dns-resolver-type=default');

            const nodeEcnAuto = producer.produce({
                type: 'ss',
                name: 'SS-Ecn-Auto',
                server: '1.1.1.1',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pwd',
                'tcp-ecn': 'auto',
                'dns-resolver-type': 0,
            });
            expect(nodeEcnAuto).to.include('tcp-ecn=auto');
            expect(nodeEcnAuto).to.include('dns-resolver-type=default');
        });
    });

    describe('End-to-End ProxyUtils produce', function () {
        it('filters unsupported proxies and produces external format', function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.2.3.4',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'vless',
                    name: 'VLESS-Node',
                    server: '2.3.4.5',
                    port: 443,
                    uuid: UUID,
                    tls: true,
                    sni: 'vless.example.com',
                },
                {
                    type: 'ssr',
                    name: 'SSR-Unsupported',
                    server: '3.4.5.6',
                    port: 8388,
                    cipher: 'aes-256-cfb',
                    password: 'pwd',
                },
                { type: 'direct', name: 'Direct-Node' },
            ];
            const output = ProxyUtils.produce(proxies, 'Ring', 'external');
            expect(output).to.include(
                'SS-Node = shadowsocks, 1.2.3.4, 8388, encrypt-method=aes-128-gcm, password=pwd',
            );
            expect(output).to.include(
                `VLESS-Node = vless, 2.3.4.5, 443, uuid=${UUID}, security=tls, sni=vless.example.com`,
            );
            expect(output).to.include('Direct-Node = direct');
            expect(output).not.to.include('SSR-Unsupported');
        });
    });

    describe('Script operators with Ring target', function () {
        const originalEnv = process.env.SUB_STORE_FRONTEND_BACKEND_PATH;
        before(function () {
            process.env.SUB_STORE_FRONTEND_BACKEND_PATH = '/';
        });
        after(function () {
            if (originalEnv !== undefined) {
                process.env.SUB_STORE_FRONTEND_BACKEND_PATH = originalEnv;
            } else {
                delete process.env.SUB_STORE_FRONTEND_BACKEND_PATH;
            }
        });

        it('passes targetPlatform === "Ring" to Script Operator operator function', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
            ];
            const operators = [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `function operator(proxies, targetPlatform, context) {
                            return proxies.map(p => ({
                                ...p,
                                _receivedTarget: targetPlatform,
                            }));
                        }`,
                    },
                },
            ];
            const processed = await ProxyUtils.process(
                proxies,
                operators,
                'Ring',
            );
            expect(processed).to.be.an('array').with.lengthOf(1);
            expect(processed[0]._receivedTarget).to.equal('Ring');
        });

        it('dynamically modifies node properties when targetPlatform is Ring', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'trojan',
                    name: 'Trojan-Node',
                    server: '2.2.2.2',
                    port: 443,
                    password: 'pwd',
                    sni: 'old.example.com',
                },
                {
                    type: 'vmess',
                    name: 'VMess-Node',
                    server: '3.3.3.3',
                    port: 443,
                    uuid: UUID,
                    network: 'ws',
                },
            ];
            const operators = [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `function operator(proxies, targetPlatform, context) {
                            if (targetPlatform === 'Ring') {
                                return proxies
                                    .filter(p => p.type !== 'vmess')
                                    .map(p => {
                                        const clone = { ...p };
                                        if (clone.type === 'ss') {
                                            clone['sing-mux'] = true;
                                        } else if (clone.type === 'trojan') {
                                            clone.sni = 'ring.example.com';
                                        }
                                        return clone;
                                    });
                            }
                            return proxies;
                        }`,
                    },
                },
            ];
            const processed = await ProxyUtils.process(
                proxies,
                operators,
                'Ring',
            );
            expect(processed).to.have.lengthOf(2);
            expect(processed[0].name).to.equal('SS-Node');
            expect(processed[0]['sing-mux']).to.be.true;
            expect(processed[1].name).to.equal('Trojan-Node');
            expect(processed[1].sni).to.equal('ring.example.com');
        });

        it('produces expected Ring INI configuration lines for script-processed nodes', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Node',
                    server: '1.2.3.4',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'trojan',
                    name: 'Trojan-Node',
                    server: '2.3.4.5',
                    port: 443,
                    password: 'pwd',
                    sni: 'old.example.com',
                },
            ];
            const operators = [
                {
                    type: 'Script Operator',
                    args: {
                        mode: 'script',
                        content: `function operator(proxies, targetPlatform, context) {
                            if (targetPlatform === 'Ring') {
                                return proxies.map(p => {
                                    const clone = { ...p };
                                    if (clone.type === 'ss') {
                                        clone['sing-mux'] = true;
                                    } else if (clone.type === 'trojan') {
                                        clone.sni = 'ring.example.com';
                                    }
                                    return clone;
                                });
                            }
                            return proxies;
                        }`,
                    },
                },
            ];
            const processed = await ProxyUtils.process(
                proxies,
                operators,
                'Ring',
            );
            const ringIni = ProxyUtils.produce(processed, 'Ring');
            expect(ringIni).to.include(
                'SS-Node = shadowsocks, 1.2.3.4, 8388, encrypt-method=aes-128-gcm, password=pwd, sing-mux=true',
            );
            expect(ringIni).to.include(
                'Trojan-Node = trojan, 2.3.4.5, 443, password=pwd, tls=true, sni=ring.example.com',
            );
        });

        it('filters nodes with Script Filter under Ring platform and produces output', async function () {
            const proxies = [
                {
                    type: 'ss',
                    name: 'SS-Keep',
                    server: '1.1.1.1',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
                {
                    type: 'ss',
                    name: 'SS-Drop',
                    server: '2.2.2.2',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'pwd',
                },
            ];
            const filters = [
                {
                    type: 'Script Filter',
                    args: {
                        mode: 'script',
                        content: `function filter(proxies, targetPlatform, context) {
                            if (targetPlatform !== 'Ring') return proxies.map(() => false);
                            return proxies.map(p => p.name === 'SS-Keep');
                        }`,
                    },
                },
            ];
            const filtered = await ProxyUtils.process(proxies, filters, 'Ring');
            expect(filtered).to.have.lengthOf(1);
            expect(filtered[0].name).to.equal('SS-Keep');

            const ringIni = ProxyUtils.produce(filtered, 'Ring');
            expect(ringIni).to.equal(
                'SS-Keep = shadowsocks, 1.1.1.1, 8388, encrypt-method=aes-128-gcm, password=pwd',
            );
            expect(ringIni).not.to.include('SS-Drop');
        });
    });
});
