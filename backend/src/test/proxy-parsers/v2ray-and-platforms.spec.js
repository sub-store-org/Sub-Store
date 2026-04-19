import { Base64 } from 'js-base64';
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { UUID, expectSubset, parseAll, parseOne } from './helpers';

describe('VMess and VLESS parser coverage', function () {
    describe('VMess URIs', function () {
        it('parses Quantumult VMess shares', function () {
            const share = Base64.encode(
                `QX VMess = vmess,vmess-qx.example.com,443,auto,"${UUID}",udp-relay=true,fast-open=true,tls-verification=false`,
            );
            const proxy = parseOne(`vmess://${share}`);

            expectSubset(proxy, {
                type: 'vmess',
                name: 'QX VMess',
                server: 'vmess-qx.example.com',
                port: 443,
                cipher: 'auto',
                uuid: UUID,
                udp: 'true',
                tfo: 'true',
                'skip-cert-verify': false,
            });
        });

        it('parses V2rayN ws shares', function () {
            const share = Base64.encode(
                JSON.stringify({
                    v: '2',
                    ps: 'VMess WS',
                    add: 'vmess-ws.example.com',
                    port: '443',
                    id: UUID,
                    aid: '0',
                    scy: 'auto',
                    net: 'ws',
                    host: 'cdn.example.com',
                    path: '/socket',
                    tls: 'tls',
                    sni: 'sni.example.com',
                    allowInsecure: '1',
                    fp: 'chrome',
                    alpn: 'h2',
                }),
            );
            const proxy = parseOne(`vmess://${share}`);

            expectSubset(proxy, {
                type: 'vmess',
                name: 'VMess WS',
                server: 'vmess-ws.example.com',
                port: 443,
                uuid: UUID,
                alterId: 0,
                tls: true,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'client-fingerprint': 'chrome',
                alpn: ['h2'],
                network: 'ws',
                'ws-opts': {
                    path: '/socket',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            });
        });

        it('prefers fragment comments over internal V2rayN vmess names', function () {
            const share = Base64.encode(
                JSON.stringify({
                    v: '2',
                    ps: 'VMess WS Fragment',
                    add: 'vmess-fragment.example.com',
                    port: '443',
                    id: UUID,
                    aid: '0',
                    scy: 'none',
                    net: 'ws',
                    host: 'fragment.example.com',
                    path: '/fragment?ed=2560',
                    tls: 'tls',
                    sni: 'sni.fragment.example.com',
                    fp: 'chrome',
                }),
            );
            const proxy = parseOne(
                `vmess://${share}#Outer%20Fragment%20Remark`,
            );

            expectSubset(proxy, {
                type: 'vmess',
                name: 'Outer Fragment Remark',
                server: 'vmess-fragment.example.com',
                port: 443,
                uuid: UUID,
                alterId: 0,
                cipher: 'none',
                tls: true,
                sni: 'sni.fragment.example.com',
                'client-fingerprint': 'chrome',
                network: 'ws',
                'ws-opts': {
                    path: '/fragment?ed=2560',
                    headers: {
                        Host: 'fragment.example.com',
                    },
                },
            });
        });

        it('keeps the full vmess fragment comment after the first hash', function () {
            const share = Base64.encode(
                JSON.stringify({
                    v: '2',
                    ps: 'VMess WS Fragment Full',
                    add: 'vmess-fragment-full.example.com',
                    port: '443',
                    id: UUID,
                    aid: '0',
                    scy: 'auto',
                    net: 'ws',
                    host: 'fragment-full.example.com',
                    path: '/fragment-full',
                    tls: 'tls',
                }),
            );
            const proxy = parseOne(`vmess://${share}#Outer%20Fragment#Remark`);

            expectSubset(proxy, {
                type: 'vmess',
                name: 'Outer Fragment#Remark',
                server: 'vmess-fragment-full.example.com',
                port: 443,
                uuid: UUID,
                alterId: 0,
                cipher: 'auto',
                tls: true,
                network: 'ws',
                'ws-opts': {
                    path: '/fragment-full',
                    headers: {
                        Host: 'fragment-full.example.com',
                    },
                },
            });
        });

        it('parses V2rayN http shares and normalizes http paths', function () {
            const share = Base64.encode(
                JSON.stringify({
                    ps: 'VMess HTTP',
                    add: 'vmess-http.example.com',
                    port: '80',
                    id: UUID,
                    aid: '1',
                    scy: 'unknown-cipher',
                    net: 'http',
                    host: 'h1.example.com,h2.example.com',
                    path: '/a,/b',
                }),
            );
            const proxy = parseOne(`vmess://${share}`);

            expectSubset(proxy, {
                type: 'vmess',
                name: 'VMess HTTP',
                server: 'vmess-http.example.com',
                port: 80,
                uuid: UUID,
                alterId: 1,
                cipher: 'auto',
                network: 'http',
                'http-opts': {
                    headers: {
                        Host: ['h1.example.com'],
                    },
                    path: ['/a,/b'],
                },
            });
        });

        it('parses V2rayN grpc shares', function () {
            const share = Base64.encode(
                JSON.stringify({
                    ps: 'VMess gRPC',
                    add: 'vmess-grpc.example.com',
                    port: '443',
                    id: UUID,
                    aid: '0',
                    scy: 'auto',
                    net: 'grpc',
                    path: 'grpc-service',
                    type: 'multi',
                    authority: 'grpc.example.com',
                }),
            );
            const proxy = parseOne(`vmess://${share}`);

            expectSubset(proxy, {
                type: 'vmess',
                name: 'VMess gRPC',
                server: 'vmess-grpc.example.com',
                port: 443,
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'grpc-service',
                    '_grpc-type': 'multi',
                    '_grpc-authority': 'grpc.example.com',
                },
            });
        });

        it('parses V2rayN quic shares', function () {
            const share = Base64.encode(
                JSON.stringify({
                    ps: 'VMess QUIC',
                    add: 'vmess-quic.example.com',
                    port: '443',
                    id: UUID,
                    aid: '0',
                    scy: 'auto',
                    net: 'quic',
                    host: 'quic-host.example.com',
                    path: '/quic',
                    type: 'wireguard',
                }),
            );
            const proxy = parseOne(`vmess://${share}`);

            expectSubset(proxy, {
                type: 'vmess',
                name: 'VMess QUIC',
                server: 'vmess-quic.example.com',
                port: 443,
                network: 'quic',
                'quic-opts': {
                    '_quic-type': 'wireguard',
                    '_quic-host': 'quic-host.example.com',
                    '_quic-path': '/quic',
                },
            });
        });

        it('parses V2rayN httpupgrade shares as websocket upgrades', function () {
            const share = Base64.encode(
                JSON.stringify({
                    ps: 'VMess Upgrade',
                    add: 'vmess-upgrade.example.com',
                    port: '443',
                    id: UUID,
                    aid: '0',
                    scy: 'auto',
                    net: 'httpupgrade',
                    host: 'upgrade.example.com',
                    path: '/upgrade',
                }),
            );
            const proxy = parseOne(`vmess://${share}`);

            expectSubset(proxy, {
                type: 'vmess',
                name: 'VMess Upgrade',
                server: 'vmess-upgrade.example.com',
                port: 443,
                network: 'ws',
                'ws-opts': {
                    path: '/upgrade',
                    headers: {
                        Host: 'upgrade.example.com',
                    },
                    'v2ray-http-upgrade': true,
                    'v2ray-http-upgrade-fast-open': true,
                },
            });
        });

        it('parses Shadowrocket VMess shares', function () {
            const base = Base64.encode(
                `auto:${UUID}@shadowrocket-vmess.example.com:443`,
            );
            const proxy = parseOne(
                `vmess://${base}?remarks=Shadowrocket%20VMess&obfs=websocket&path=%2Fshadow&obfsParam=ws.shadow.example.com&tls=1&peer=sni.shadow.example.com&allowInsecure=1&fp=safari&alpn=h2`,
            );

            expectSubset(proxy, {
                type: 'vmess',
                name: 'Shadowrocket VMess',
                server: 'shadowrocket-vmess.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.shadow.example.com',
                'skip-cert-verify': true,
                'client-fingerprint': 'safari',
                alpn: ['h2'],
                network: 'ws',
                'ws-opts': {
                    path: '/shadow',
                    headers: {
                        Host: 'ws.shadow.example.com',
                    },
                },
            });
        });
    });

    describe('VLESS URIs', function () {
        it('parses websocket VLESS shares', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-ws.example.com:443?type=ws&security=tls&sni=sni.example.com&host=cdn.example.com&path=%2Fws&allowInsecure=1&fp=chrome&alpn=h2#VLESS%20WS`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS WS',
                server: 'vless-ws.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'client-fingerprint': 'chrome',
                alpn: ['h2'],
                udp: true,
                xudp: true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            });
        });

        it('keeps the full vless fragment comment after the first hash', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-ws.example.com:443?type=ws&security=tls&sni=sni.example.com&host=cdn.example.com&path=%2Fws&allowInsecure=1&fp=chrome&alpn=h2#VLESS%20Outer#Remark`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS Outer#Remark',
                server: 'vless-ws.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'client-fingerprint': 'chrome',
                alpn: ['h2'],
                udp: true,
                xudp: true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            });
        });

        it('parses websocket VLESS shares with packet encoding and early data', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-ws.example.com:443?type=ws&security=tls&host=cdn.example.com&path=%2Fws&packetEncoding=packet&ed=2048&eh=X-Data#VLESS%20WS%20Early`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS WS Early',
                server: 'vless-ws.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                udp: true,
                'packet-addr': true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'max-early-data': 2048,
                    'early-data-header-name': 'X-Data',
                },
            });
            expect(proxy).to.not.have.property('xudp');
        });

        it('parses websocket VLESS shares with pcs as tls fingerprint', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-ws.example.com:443?type=ws&security=tls&host=cdn.example.com&path=%2Fws&pcs=fingerprint#VLESS%20WS%20PCS`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS WS PCS',
                server: 'vless-ws.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                udp: true,
                xudp: true,
                'tls-fingerprint': 'fingerprint',
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            });
        });

        it('rejects websocket VLESS shares with malformed early data size', function () {
            expect(
                parseAll(
                    `vless://${UUID}@vless-ws.example.com:443?type=ws&security=tls&host=cdn.example.com&path=%2Fws&ed=2048foo#VLESS%20WS%20Broken`,
                ),
            ).to.have.length(0);
        });

        it('rejects websocket VLESS shares with oversized early data size', function () {
            expect(
                parseAll(
                    `vless://${UUID}@vless-ws.example.com:443?type=ws&security=tls&host=cdn.example.com&path=%2Fws&ed=999999999999999999999#VLESS%20WS%20Too%20Large`,
                ),
            ).to.have.length(0);
        });

        it('parses grpc reality VLESS shares', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-grpc.example.com:443?type=grpc&security=reality&serviceName=grpc-service&authority=grpc.example.com&mode=multi&pbk=pubkey&sid=08&spx=%2Fspider&flow=xtls-rprx-vision&encryption=none&pqv=1&alpn=h2#VLESS%20Reality`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS Reality',
                server: 'vless-grpc.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                flow: 'xtls-rprx-vision',
                encryption: 'none',
                _pqv: '1',
                alpn: ['h2'],
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'grpc-service',
                    '_grpc-authority': 'grpc.example.com',
                    '_grpc-type': 'multi',
                },
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                    '_spider-x': '/spider',
                },
                _mode: 'multi',
            });
        });

        it('keeps reality opts when share links carry pbk without security=reality', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-grpc.example.com:443?type=grpc&security=tls&serviceName=grpc-service&pbk=pubkey&sid=08#VLESS%20PBK`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS PBK',
                server: 'vless-grpc.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'grpc-service',
                    '_grpc-type': 'gun',
                },
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            });
        });

        it('keeps pbk-derived reality opts without tls defaults when security is none', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-grpc.example.com:443?type=grpc&security=none&serviceName=grpc-service&pbk=pubkey&sid=08#VLESS%20PBK%20No%20TLS`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS PBK No TLS',
                server: 'vless-grpc.example.com',
                port: 443,
                uuid: UUID,
                tls: false,
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'grpc-service',
                    '_grpc-type': 'gun',
                },
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            });
        });

        it('parses tcp http-header VLESS shares', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-http.example.com:80?type=tcp&headerType=http&host=http.example.com&path=%2Fedge&method=GET#VLESS%20HTTP`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS HTTP',
                server: 'vless-http.example.com',
                port: 80,
                network: 'http',
                'http-opts': {
                    headers: {
                        Host: ['http.example.com'],
                    },
                    method: 'GET',
                    path: ['/edge'],
                },
            });
        });

        it('parses httpupgrade VLESS shares as websocket upgrades', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-upgrade.example.com:443?type=httpupgrade&host=upgrade.example.com&path=%2Fupgrade#VLESS%20Upgrade`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS Upgrade',
                server: 'vless-upgrade.example.com',
                port: 443,
                network: 'ws',
                'ws-opts': {
                    path: '/upgrade',
                    headers: {
                        Host: 'upgrade.example.com',
                    },
                    'v2ray-http-upgrade': true,
                    'v2ray-http-upgrade-fast-open': true,
                },
            });
        });

        it('parses httpupgrade VLESS shares with early data metadata', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-upgrade.example.com:443?type=httpupgrade&host=upgrade.example.com&path=%2Fupgrade&ed=1024&eh=X-Upgrade#VLESS%20Upgrade%20Early`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS Upgrade Early',
                server: 'vless-upgrade.example.com',
                port: 443,
                network: 'ws',
                'ws-opts': {
                    path: '/upgrade',
                    headers: {
                        Host: 'upgrade.example.com',
                    },
                    'v2ray-http-upgrade': true,
                    'v2ray-http-upgrade-fast-open': true,
                    'max-early-data': 1024,
                    'early-data-header-name': 'X-Upgrade',
                },
            });
        });

        it('parses kcp VLESS shares', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-kcp.example.com:443?type=kcp&headerType=srtp&host=kcp.example.com&path=%2Fkcp&seed=seed-value&mode=packet&extra=extra-value#VLESS%20KCP`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS KCP',
                server: 'vless-kcp.example.com',
                port: 443,
                network: 'kcp',
                seed: 'seed-value',
                headerType: 'srtp',
                _mode: 'packet',
                _extra: 'extra-value',
                'kcp-opts': {
                    headers: {
                        Host: 'kcp.example.com',
                    },
                    path: '/kcp',
                },
            });
        });

        it('parses h2 VLESS shares from share-link http transport', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-h2.example.com:443?type=http&host=h2.example.com&path=%2Fh2&h2=1&packetEncoding=none#VLESS%20H2`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS H2',
                server: 'vless-h2.example.com',
                port: 443,
                udp: true,
                network: 'h2',
                _h2: true,
                'h2-opts': {
                    headers: {
                        host: ['h2.example.com'],
                    },
                    path: '/h2',
                },
            });
            expect(proxy).to.not.have.property('xudp');
        });

        it('parses xhttp VLESS shares with mihomo transport extras', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMaxEachPostBytes: 1000000,
                scMinPostsIntervalMs: 300,
                xmux: {
                    maxConnections: 0,
                    maxConcurrency: '16-32',
                    cMaxReuseTimes: '64-128',
                    hMaxRequestTimes: '600-900',
                    hMaxReusableSecs: '1800-3000',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-max-each-post-bytes': 1000000,
                    'sc-min-posts-interval-ms': 300,
                    'reuse-settings': {
                        'max-connections': '0',
                        'max-concurrency': '16-32',
                        'c-max-reuse-times': '64-128',
                        'h-max-request-times': '600-900',
                        'h-max-reusable-secs': '1800-3000',
                    },
                },
            });
            expect(proxy).to.not.have.property('_extra');
            expect(proxy).to.not.have.property('_extra_unsupported');
        });

        it('parses xhttp VLESS shares with downloadSettings extra', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    tlsSettings: {
                        serverName: 'download-sni.example.com',
                        fingerprint: 'chrome',
                        alpn: ['h2', 'http/1.1'],
                    },
                    xhttpSettings: {
                        path: '/download',
                        host: 'download-host.example.com',
                        noGRPCHeader: true,
                        xPaddingBytes: '32-64',
                        scMaxEachPostBytes: '500000-1000000',
                        scMinPostsIntervalMs: '0-300',
                        extra: {
                            xmux: {
                                maxConnections: '8',
                                hMaxReusableSecs: '900',
                            },
                        },
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Download`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Download',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        servername: 'download-sni.example.com',
                        'client-fingerprint': 'chrome',
                        alpn: ['h2', 'http/1.1'],
                        path: '/download',
                        host: 'download-host.example.com',
                        'no-grpc-header': true,
                        'x-padding-bytes': '32-64',
                        'sc-max-each-post-bytes': 1000000,
                        'sc-min-posts-interval-ms': '0-300',
                        'reuse-settings': {
                            'max-connections': '8',
                            'h-max-reusable-secs': '900',
                        },
                    },
                },
            });
            expect(
                proxy['xhttp-opts']?.['download-settings'],
            ).to.not.have.property('network');
            expect(proxy).to.not.have.property('_extra_unsupported');
        });

        it('parses xhttp VLESS shares with downloadSettings extra without mode', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    tlsSettings: {
                        serverName: 'download-sni.example.com',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Download%20No%20Mode`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Download No Mode',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        servername: 'download-sni.example.com',
                    },
                },
            });
            expect(proxy['xhttp-opts']).to.not.have.property('mode');
        });

        it('parses xhttp network into structured downloadSettings while keeping unsupported nested fields in the sidecar', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    network: 'xhttp',
                    sockopt: {
                        mark: 255,
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Download%20Unsupported%20Only`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Download Unsupported Only',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        network: 'xhttp',
                    },
                },
            });
            expect(proxy._extra_unsupported).to.deep.equal({
                downloadSettings: {
                    sockopt: {
                        mark: 255,
                    },
                },
            });
        });

        it('normalizes splithttp downloadSettings network without keeping the raw network in the sidecar', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    network: 'splithttp',
                    sockopt: {
                        mark: 255,
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Download%20SplitHTTP`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Download SplitHTTP',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        network: 'xhttp',
                    },
                },
            });
            expect(proxy._extra_unsupported).to.deep.equal({
                downloadSettings: {
                    sockopt: {
                        mark: 255,
                    },
                },
            });
        });

        it('keeps malformed reality downloadSettings as an empty reality marker', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    address: 'download.example.com',
                    network: 'xhttp',
                    port: 8443,
                    security: 'reality',
                    xhttpSettings: {
                        path: '/download',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Download%20Reality%20Marker`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Download Reality Marker',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        network: 'xhttp',
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        path: '/download',
                    },
                },
            });
            expect(
                proxy['xhttp-opts']?.['download-settings']?.['reality-opts'],
            ).to.deep.equal({});
            expect(proxy).to.not.have.property('_extra_unsupported');
        });

        it('keeps invalid xhttp extra as raw _extra for URI round-trips', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    '{bad',
                )}#VLESS%20XHTTP%20Invalid%20Extra`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Invalid Extra',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                _extra: '{bad',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            });
            expect(proxy).to.not.have.property('_extra_unsupported');
        });

        it('parses xhttp VLESS shares with range-form scMinPostsIntervalMs', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMinPostsIntervalMs: '100 - 300',
                xmux: {
                    maxConnections: 0,
                    maxConcurrency: '16-32',
                    cMaxReuseTimes: '64-128',
                    hMaxRequestTimes: '600-900',
                    hMaxReusableSecs: '1800-3000',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Min%20Interval%20Range`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Min Interval Range',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-min-posts-interval-ms': '100-300',
                    'reuse-settings': {
                        'max-connections': '0',
                        'max-concurrency': '16-32',
                        'c-max-reuse-times': '64-128',
                        'h-max-request-times': '600-900',
                        'h-max-reusable-secs': '1800-3000',
                    },
                },
            });
        });

        it('parses xhttp VLESS shares with string-form scMinPostsIntervalMs', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMinPostsIntervalMs: '300',
                xmux: {
                    maxConnections: 0,
                    maxConcurrency: '16-32',
                    cMaxReuseTimes: '64-128',
                    hMaxRequestTimes: '600-900',
                    hMaxReusableSecs: '1800-3000',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Min%20Interval%20String`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Min Interval String',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-min-posts-interval-ms': 300,
                    'reuse-settings': {
                        'max-connections': '0',
                        'max-concurrency': '16-32',
                        'c-max-reuse-times': '64-128',
                        'h-max-request-times': '600-900',
                        'h-max-reusable-secs': '1800-3000',
                    },
                },
            });
        });

        it('parses xhttp VLESS shares with zero-lower-bound scMinPostsIntervalMs range', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMinPostsIntervalMs: '0-300',
                xmux: {
                    maxConnections: 0,
                    maxConcurrency: '16-32',
                    cMaxReuseTimes: '64-128',
                    hMaxRequestTimes: '600-900',
                    hMaxReusableSecs: '1800-3000',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Min%20Interval%20Zero%20Lower%20Bound`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Min Interval Zero Lower Bound',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-min-posts-interval-ms': '0-300',
                    'reuse-settings': {
                        'max-connections': '0',
                        'max-concurrency': '16-32',
                        'c-max-reuse-times': '64-128',
                        'h-max-request-times': '600-900',
                        'h-max-reusable-secs': '1800-3000',
                    },
                },
            });
        });

        it('parses xhttp VLESS shares with Mihomo-style leading-zero sc scalars', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMaxEachPostBytes: '000-1000000',
                scMinPostsIntervalMs: '0300',
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    xhttpSettings: {
                        path: '/download',
                        host: 'download-host.example.com',
                        scMaxEachPostBytes: '000-1000000',
                        scMinPostsIntervalMs: '000-300',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Leading%20Zero%20Scalars`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Leading Zero Scalars',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-max-each-post-bytes': 1000000,
                    'sc-min-posts-interval-ms': 300,
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        path: '/download',
                        host: 'download-host.example.com',
                        'sc-max-each-post-bytes': 1000000,
                        'sc-min-posts-interval-ms': '0-300',
                    },
                },
            });
        });

        it('parses xhttp VLESS shares with Mihomo-style explicit-plus sc scalars', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMaxEachPostBytes: '+500000-+1000000',
                scMinPostsIntervalMs: '+300',
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    xhttpSettings: {
                        path: '/download',
                        host: 'download-host.example.com',
                        scMaxEachPostBytes: '+0-+1000000',
                        scMinPostsIntervalMs: '+0-+300',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Explicit%20Plus%20Scalars`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Explicit Plus Scalars',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-max-each-post-bytes': 1000000,
                    'sc-min-posts-interval-ms': 300,
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        path: '/download',
                        host: 'download-host.example.com',
                        'sc-max-each-post-bytes': 1000000,
                        'sc-min-posts-interval-ms': '0-300',
                    },
                },
            });
        });

        it('ignores invalid xhttp VLESS scMinPostsIntervalMs values', function () {
            const invalidValues = [
                '1.5',
                1.5,
                '0',
                0,
                '0-0',
                'fast',
                '10-1',
                '9007199254740993',
                '1-9007199254740993',
            ];

            for (const value of invalidValues) {
                const extra = JSON.stringify({
                    noGRPCHeader: true,
                    xPaddingBytes: '64-128',
                    scMinPostsIntervalMs: value,
                    xmux: {
                        maxConnections: 0,
                        maxConcurrency: '16-32',
                        cMaxReuseTimes: '64-128',
                        hMaxRequestTimes: '600-900',
                        hMaxReusableSecs: '1800-3000',
                    },
                });
                const proxy = parseOne(
                    `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                        extra,
                    )}#VLESS%20XHTTP%20Min%20Interval%20Invalid`,
                );

                expectSubset(proxy, {
                    type: 'vless',
                    server: 'vless-xhttp.example.com',
                    port: 443,
                    uuid: UUID,
                    tls: true,
                    network: 'xhttp',
                    'xhttp-opts': {
                        mode: 'stream-up',
                        path: '/xhttp',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                        'no-grpc-header': true,
                        'x-padding-bytes': '64-128',
                        'reuse-settings': {
                            'max-connections': '0',
                            'max-concurrency': '16-32',
                            'c-max-reuse-times': '64-128',
                            'h-max-request-times': '600-900',
                            'h-max-reusable-secs': '1800-3000',
                        },
                    },
                });
                expect(proxy['xhttp-opts']).to.not.have.property(
                    'sc-min-posts-interval-ms',
                );
                expect(proxy._extra_unsupported).to.deep.equal({
                    scMinPostsIntervalMs: value,
                });
            }
        });

        it('ignores invalid nested xhttp VLESS scMinPostsIntervalMs values in downloadSettings extra', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    tlsSettings: {
                        serverName: 'download-sni.example.com',
                    },
                    xhttpSettings: {
                        path: '/download',
                        host: 'download-host.example.com',
                        noGRPCHeader: true,
                        xPaddingBytes: '32-64',
                        scMinPostsIntervalMs: '0-0',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Download%20Invalid%20Min%20Interval`,
            );

            expectSubset(proxy, {
                type: 'vless',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        servername: 'download-sni.example.com',
                        path: '/download',
                        host: 'download-host.example.com',
                        'no-grpc-header': true,
                        'x-padding-bytes': '32-64',
                    },
                },
            });
            expect(
                proxy['xhttp-opts']?.['download-settings'],
            ).to.not.have.property('sc-min-posts-interval-ms');
            expect(proxy._extra_unsupported).to.deep.equal({
                downloadSettings: {
                    xhttpSettings: {
                        scMinPostsIntervalMs: '0-0',
                    },
                },
            });
        });

        it('parses extended xhttp VLESS extra fields and keeps unsupported fields in _extra_unsupported', function () {
            const extra = JSON.stringify({
                headers: {
                    'X-Test': 'demo',
                },
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                xPaddingObfsMode: true,
                xPaddingKey: 'x_padding',
                xPaddingHeader: 'Referer',
                xPaddingPlacement: 'header',
                xPaddingMethod: 'tokenish',
                uplinkHTTPMethod: 'PUT',
                sessionPlacement: 'query',
                sessionKey: 'x_session_id',
                seqPlacement: 'header',
                seqKey: 'X-Seq',
                uplinkDataPlacement: 'header',
                uplinkDataKey: 'X-Data',
                uplinkChunkSize: '64-128',
                xmux: {
                    maxConcurrency: '16-32',
                    hKeepAlivePeriod: 15,
                },
                noSSEHeader: true,
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    tlsSettings: {
                        serverName: 'download-sni.example.com',
                        fingerprint: 'chrome',
                        allowInsecure: true,
                        alpn: ['h2'],
                        echConfigList: 'ECHCONFIG',
                    },
                    xhttpSettings: {
                        path: '/download',
                        host: 'download-host.example.com',
                        headers: {
                            'X-Download': '1',
                        },
                        noGRPCHeader: true,
                        xPaddingBytes: '16-32',
                        xPaddingObfsMode: true,
                        xPaddingKey: 'x_padding_dl',
                        xPaddingHeader: 'Cookie',
                        xPaddingPlacement: 'query',
                        xPaddingMethod: 'repeat-x',
                        uplinkHTTPMethod: 'PATCH',
                        sessionPlacement: 'header',
                        sessionKey: 'X-Session',
                        seqPlacement: 'query',
                        seqKey: 'x_seq',
                        uplinkDataPlacement: 'cookie',
                        uplinkDataKey: 'x_data',
                        uplinkChunkSize: 48,
                        extra: {
                            xmux: {
                                maxConcurrency: '8-16',
                                hKeepAlivePeriod: -1,
                            },
                        },
                    },
                    sockopt: {
                        mark: 255,
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Extended%20Extra`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Extended Extra',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                        'X-Test': 'demo',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'x-padding-obfs-mode': true,
                    'x-padding-key': 'x_padding',
                    'x-padding-header': 'Referer',
                    'x-padding-placement': 'header',
                    'x-padding-method': 'tokenish',
                    'uplink-http-method': 'PUT',
                    'session-placement': 'query',
                    'session-key': 'x_session_id',
                    'seq-placement': 'header',
                    'seq-key': 'X-Seq',
                    'uplink-data-placement': 'header',
                    'uplink-data-key': 'X-Data',
                    'uplink-chunk-size': '64-128',
                    'reuse-settings': {
                        'max-concurrency': '16-32',
                        'h-keep-alive-period': 15,
                    },
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        servername: 'download-sni.example.com',
                        'client-fingerprint': 'chrome',
                        'skip-cert-verify': true,
                        alpn: ['h2'],
                        'ech-opts': {
                            enable: true,
                            config: 'ECHCONFIG',
                        },
                        path: '/download',
                        host: 'download-host.example.com',
                        headers: {
                            'X-Download': '1',
                        },
                        'no-grpc-header': true,
                        'x-padding-bytes': '16-32',
                        'x-padding-obfs-mode': true,
                        'x-padding-key': 'x_padding_dl',
                        'x-padding-header': 'Cookie',
                        'x-padding-placement': 'query',
                        'x-padding-method': 'repeat-x',
                        'uplink-http-method': 'PATCH',
                        'session-placement': 'header',
                        'session-key': 'X-Session',
                        'seq-placement': 'query',
                        'seq-key': 'x_seq',
                        'uplink-data-placement': 'cookie',
                        'uplink-data-key': 'x_data',
                        'uplink-chunk-size': 48,
                        'reuse-settings': {
                            'max-concurrency': '8-16',
                            'h-keep-alive-period': -1,
                        },
                    },
                },
            });

            expect(proxy).to.not.have.property('_extra');
            expect(proxy._extra_unsupported).to.deep.equal({
                noSSEHeader: true,
                downloadSettings: {
                    sockopt: {
                        mark: 255,
                    },
                },
            });
            expect(proxy['xhttp-opts']).to.not.have.property('no-sse-header');
            expect(
                proxy['xhttp-opts']?.['download-settings'],
            ).to.not.have.property('sockopt');
        });

        it('parses xhttp VLESS xmux ranges canonically and keeps unsupported keep-alive values in _extra_unsupported', function () {
            const extra = JSON.stringify({
                xmux: {
                    maxConnections: '+0008',
                    maxConcurrency: '0008-0016',
                    hKeepAlivePeriod: '9007199254740993',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20XMUX%20Canonical`,
            );

            expectSubset(proxy, {
                type: 'vless',
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'reuse-settings': {
                        'max-connections': '8',
                        'max-concurrency': '8-16',
                    },
                },
            });
            expect(proxy['xhttp-opts']?.['reuse-settings']).to.not.have.property(
                'h-keep-alive-period',
            );
            expect(proxy._extra_unsupported).to.deep.equal({
                xmux: {
                    hKeepAlivePeriod: '9007199254740993',
                },
            });
        });

        it('parses xhttp VLESS shares with string downloadSettings ports as structured values', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    address: 'download.example.com',
                    port: '8443',
                    security: 'tls',
                    xhttpSettings: {
                        path: '/download',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20String%20Download%20Port`,
            );

            expectSubset(proxy, {
                type: 'vless',
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        path: '/download',
                    },
                },
            });
            expect(proxy).to.not.have.property('_extra_unsupported');
        });

        it('keeps malformed xhttp VLESS uplinkChunkSize values in _extra_unsupported', function () {
            const extra = JSON.stringify({
                uplinkChunkSize: 'fast',
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    xhttpSettings: {
                        path: '/download',
                        uplinkChunkSize: 'faster',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Malformed%20Uplink%20Chunk`,
            );

            expectSubset(proxy, {
                type: 'vless',
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        path: '/download',
                    },
                },
            });
            expect(proxy['xhttp-opts']).to.not.have.property(
                'uplink-chunk-size',
            );
            expect(
                proxy['xhttp-opts']?.['download-settings'],
            ).to.not.have.property('uplink-chunk-size');
            expect(proxy._extra_unsupported).to.deep.equal({
                uplinkChunkSize: 'fast',
                downloadSettings: {
                    xhttpSettings: {
                        uplinkChunkSize: 'faster',
                    },
                },
            });
        });

        it('keeps mixed downloadSettings tlsSettings.alpn arrays in _extra_unsupported', function () {
            const extra = JSON.stringify({
                downloadSettings: {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    tlsSettings: {
                        alpn: ['h2', { foo: 1 }],
                    },
                    xhttpSettings: {
                        path: '/download',
                    },
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Mixed%20ALPN`,
            );

            expectSubset(proxy, {
                type: 'vless',
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'download-settings': {
                        server: 'download.example.com',
                        port: 8443,
                        tls: true,
                        path: '/download',
                    },
                },
            });
            expect(
                proxy['xhttp-opts']?.['download-settings'],
            ).to.not.have.property('alpn');
            expect(proxy._extra_unsupported).to.deep.equal({
                downloadSettings: {
                    tlsSettings: {
                        alpn: ['h2', { foo: 1 }],
                    },
                },
            });
        });

        it('parses xhttp VLESS shares with range-form scMaxEachPostBytes', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMaxEachPostBytes: '500000 - 1000000',
                xmux: {
                    maxConnections: 0,
                    maxConcurrency: '16-32',
                    cMaxReuseTimes: '64-128',
                    hMaxRequestTimes: '600-900',
                    hMaxReusableSecs: '1800-3000',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Range`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Range',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-max-each-post-bytes': 1000000,
                    'reuse-settings': {
                        'max-connections': '0',
                        'max-concurrency': '16-32',
                        'c-max-reuse-times': '64-128',
                        'h-max-request-times': '600-900',
                        'h-max-reusable-secs': '1800-3000',
                    },
                },
            });
        });

        it('parses xhttp VLESS shares with string-form scMaxEachPostBytes', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMaxEachPostBytes: '1000000',
                xmux: {
                    maxConnections: 0,
                    maxConcurrency: '16-32',
                    cMaxReuseTimes: '64-128',
                    hMaxRequestTimes: '600-900',
                    hMaxReusableSecs: '1800-3000',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20String`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP String',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-max-each-post-bytes': 1000000,
                    'reuse-settings': {
                        'max-connections': '0',
                        'max-concurrency': '16-32',
                        'c-max-reuse-times': '64-128',
                        'h-max-request-times': '600-900',
                        'h-max-reusable-secs': '1800-3000',
                    },
                },
            });
        });

        it('parses xhttp VLESS shares with zero-lower-bound scMaxEachPostBytes range', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
                scMaxEachPostBytes: '0-1000000',
                xmux: {
                    maxConnections: 0,
                    maxConcurrency: '16-32',
                    cMaxReuseTimes: '64-128',
                    hMaxRequestTimes: '600-900',
                    hMaxReusableSecs: '1800-3000',
                },
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                    extra,
                )}#VLESS%20XHTTP%20Zero%20Lower%20Bound`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP Zero Lower Bound',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                    'sc-max-each-post-bytes': 1000000,
                    'reuse-settings': {
                        'max-connections': '0',
                        'max-concurrency': '16-32',
                        'c-max-reuse-times': '64-128',
                        'h-max-request-times': '600-900',
                        'h-max-reusable-secs': '1800-3000',
                    },
                },
            });
        });

        it('ignores invalid xhttp VLESS scMaxEachPostBytes values', function () {
            const invalidValues = [
                '1.5',
                1.5,
                '0',
                0,
                'fast',
                '10-1',
                '9007199254740993',
                '1-9007199254740993',
            ];

            for (const value of invalidValues) {
                const extra = JSON.stringify({
                    noGRPCHeader: true,
                    xPaddingBytes: '64-128',
                    scMaxEachPostBytes: value,
                    xmux: {
                        maxConnections: 0,
                        maxConcurrency: '16-32',
                        cMaxReuseTimes: '64-128',
                        hMaxRequestTimes: '600-900',
                        hMaxReusableSecs: '1800-3000',
                    },
                });
                const proxy = parseOne(
                    `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(
                        extra,
                    )}#VLESS%20XHTTP%20Invalid`,
                );

                expectSubset(proxy, {
                    type: 'vless',
                    server: 'vless-xhttp.example.com',
                    port: 443,
                    uuid: UUID,
                    tls: true,
                    network: 'xhttp',
                    'xhttp-opts': {
                        mode: 'stream-up',
                        path: '/xhttp',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                        'no-grpc-header': true,
                        'x-padding-bytes': '64-128',
                        'reuse-settings': {
                            'max-connections': '0',
                            'max-concurrency': '16-32',
                            'c-max-reuse-times': '64-128',
                            'h-max-request-times': '600-900',
                            'h-max-reusable-secs': '1800-3000',
                        },
                    },
                });
                expect(proxy['xhttp-opts']).to.not.have.property(
                    'sc-max-each-post-bytes',
                );
                expect(proxy._extra_unsupported).to.deep.equal({
                    scMaxEachPostBytes: value,
                });
            }
        });

        it('parses Shadowrocket VLESS shares', function () {
            const base = Base64.encode(
                `none:${UUID}@shadowrocket-vless.example.com:443`,
            );
            const proxy = parseOne(
                `vless://${base}?remarks=Shadowrocket%20VLESS&tls=1&obfs=websocket&obfsParam=ws.shadow.example.com&path=%2Fshadow&xtls=2`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'Shadowrocket VLESS',
                server: 'shadowrocket-vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                flow: 'xtls-rprx-vision',
                network: 'ws',
                'ws-opts': {
                    path: '/shadow',
                    headers: {
                        Host: 'ws.shadow.example.com',
                    },
                },
            });
        });
    });
});

describe('Platform raw-format parser coverage', function () {
    function registerCases(cases) {
        for (const { title, input, expected } of cases) {
            it(title, function () {
                const proxy = parseOne(input);
                expectSubset(proxy, expected);
            });
        }
    }

    describe('Quantumult X raw inputs', function () {
        registerCases([
            {
                title: 'parses shadowsocks over-tls lines into canonical tls fields',
                input: 'shadowsocks=qx-ss-tls.example.com:443,method=aes-128-gcm,password=secret,obfs=over-tls,obfs-host=a.com,tls-verification=false,udp-relay=true,fast-open=true,tag=QX SS Over TLS',
                expected: {
                    type: 'ss',
                    name: 'QX SS Over TLS',
                    server: 'qx-ss-tls.example.com',
                    port: 443,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    tls: true,
                    sni: 'a.com',
                    'skip-cert-verify': true,
                    udp: true,
                    tfo: true,
                },
            },
            {
                title: 'parses shadowsocks over-tls lines with tls-verification=true',
                input: 'shadowsocks=qx-ss-tls-verified.example.com:443,method=aes-128-gcm,password=secret,obfs=over-tls,obfs-host=verify.example.com,tls-verification=true,tag=QX SS Over TLS Verified',
                expected: {
                    type: 'ss',
                    name: 'QX SS Over TLS Verified',
                    server: 'qx-ss-tls-verified.example.com',
                    port: 443,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    tls: true,
                    sni: 'verify.example.com',
                    'skip-cert-verify': false,
                },
            },
            {
                title: 'parses shadowsocks over-tls lines without obfs-host',
                input: 'shadowsocks=qx-ss-tls-no-host.example.com:443,method=aes-128-gcm,password=secret,obfs=over-tls,udp-relay=true,tag=QX SS Over TLS No Host',
                expected: {
                    type: 'ss',
                    name: 'QX SS Over TLS No Host',
                    server: 'qx-ss-tls-no-host.example.com',
                    port: 443,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    tls: true,
                    udp: true,
                },
            },
            {
                title: 'keeps legacy shadowsocks obfs tls lines as plugin nodes',
                input: 'shadowsocks=qx-ss-obfs.example.com:8388,method=aes-128-gcm,password=secret,obfs=tls,obfs-host=obfs.example.com,tag=QX SS Obfs TLS',
                expected: {
                    type: 'ss',
                    name: 'QX SS Obfs TLS',
                    server: 'qx-ss-obfs.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    plugin: 'obfs',
                    'plugin-opts': {
                        mode: 'tls',
                        host: 'obfs.example.com',
                    },
                },
            },
            {
                // QX accepts plain "http" as one of the shared http-obfs
                // tokens for ss/vmess/vless; preserve it for round-trip output.
                title: 'parses shadowsocks http lines as http obfs and keeps the QX token',
                input: 'shadowsocks=qx-ss-http-plain.example.com:8388,method=aes-128-gcm,password=secret,obfs=http,obfs-host=plain.example.com,obfs-uri=/plain,tag=QX SS HTTP',
                expected: {
                    type: 'ss',
                    name: 'QX SS HTTP',
                    server: 'qx-ss-http-plain.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    plugin: 'obfs',
                    _qx_obfs_http: 'http',
                    'plugin-opts': {
                        mode: 'http',
                        host: 'plain.example.com',
                        path: '/plain',
                    },
                },
            },
            {
                // QX examples contain the upstream "vemss-http" typo; keep
                // parsing it so the original line can round-trip unchanged.
                title: 'parses shadowsocks vemss-http lines as http obfs and keeps the QX alias',
                input: 'shadowsocks=qx-ss-http.example.com:8388,method=aes-128-gcm,password=secret,obfs=vemss-http,obfs-host=obfs.example.com,obfs-uri=/resource,tag=QX SS VMess HTTP',
                expected: {
                    type: 'ss',
                    name: 'QX SS VMess HTTP',
                    server: 'qx-ss-http.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    plugin: 'obfs',
                    _qx_obfs_http: 'vemss-http',
                    'plugin-opts': {
                        mode: 'http',
                        host: 'obfs.example.com',
                        path: '/resource',
                    },
                },
            },
            {
                title: 'parses shadowsocks shadowsocks-http lines as http obfs and keeps the QX token',
                input: 'shadowsocks=qx-ss-shadowsocks-http.example.com:8388,method=aes-128-gcm,password=secret,obfs=shadowsocks-http,obfs-host=shadow.example.com,obfs-uri=/shadow,tag=QX SS Shadowsocks HTTP',
                expected: {
                    type: 'ss',
                    name: 'QX SS Shadowsocks HTTP',
                    server: 'qx-ss-shadowsocks-http.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    plugin: 'obfs',
                    _qx_obfs_http: 'shadowsocks-http',
                    'plugin-opts': {
                        mode: 'http',
                        host: 'shadow.example.com',
                        path: '/shadow',
                    },
                },
            },
            {
                title: 'parses shadowsocks v2ray-plugin wss lines',
                input: 'shadowsocks=qx-ss.example.com:8388,method=aes-128-gcm,password=secret,obfs=wss,obfs-host=obfs.example.com,obfs-uri=/ws,udp-relay=true,fast-open=true,tag=QX SS',
                expected: {
                    type: 'ss',
                    name: 'QX SS',
                    server: 'qx-ss.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    udp: true,
                    tfo: true,
                    plugin: 'v2ray-plugin',
                    'plugin-opts': {
                        mode: 'websocket',
                        tls: true,
                        host: 'obfs.example.com',
                        path: '/ws',
                    },
                },
            },
            {
                title: 'parses shadowsocksr lines',
                input: 'shadowsocks=qx-ssr.example.com:8389,method=aes-256-cfb,password=secret,ssr-protocol=auth_chain_b,ssr-protocol-param=device-id,obfs=tls1.2_ticket_fastauth,obfs-host=cdn.example.com,tag=QX SSR',
                expected: {
                    type: 'ssr',
                    name: 'QX SSR',
                    server: 'qx-ssr.example.com',
                    port: 8389,
                    cipher: 'aes-256-cfb',
                    password: 'secret',
                    protocol: 'auth_chain_b',
                    'protocol-param': 'device-id',
                    obfs: 'tls1.2_ticket_fastauth',
                    'obfs-param': 'cdn.example.com',
                },
            },
            {
                title: 'parses vmess websocket tls lines',
                input: `vmess=qx-vmess.example.com:443,method=chacha20,password=${UUID},obfs=wss,obfs-host=cdn.example.com,obfs-uri=/vmess,tls-verification=false,tls-host=sni.example.com,aead=true,udp-relay=true,tag=QX VMess`,
                expected: {
                    type: 'vmess',
                    name: 'QX VMess',
                    server: 'qx-vmess.example.com',
                    port: 443,
                    cipher: 'chacha20',
                    uuid: UUID,
                    aead: true,
                    alterId: 0,
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    udp: true,
                    network: 'ws',
                    'ws-opts': {
                        path: '/vmess',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                },
            },
            {
                title: 'parses vmess http lines as http obfs and keeps the QX token',
                input: `vmess=qx-vmess-http-plain.example.com:80,method=none,password=${UUID},obfs=http,obfs-host=plain.example.com,obfs-uri=/http,tag=QX VMess HTTP`,
                expected: {
                    type: 'vmess',
                    name: 'QX VMess HTTP',
                    server: 'qx-vmess-http-plain.example.com',
                    port: 80,
                    cipher: 'none',
                    uuid: UUID,
                    alterId: 0,
                    network: 'http',
                    _qx_obfs_http: 'http',
                    'http-opts': {
                        path: ['/http'],
                        headers: {
                            Host: ['plain.example.com'],
                        },
                    },
                },
            },
            {
                // QX examples contain the upstream "vemss-http" typo; keep
                // parsing it so the original line can round-trip unchanged.
                title: 'parses vmess vemss-http lines as http obfs and keeps the QX alias',
                input: `vmess=qx-vmess-vemss-http.example.com:80,method=none,password=${UUID},obfs=vemss-http,obfs-host=vemss.example.com,obfs-uri=/vemss,tag=QX VMess VMess HTTP`,
                expected: {
                    type: 'vmess',
                    name: 'QX VMess VMess HTTP',
                    server: 'qx-vmess-vemss-http.example.com',
                    port: 80,
                    cipher: 'none',
                    uuid: UUID,
                    alterId: 0,
                    network: 'http',
                    _qx_obfs_http: 'vemss-http',
                    'http-opts': {
                        path: ['/vemss'],
                        headers: {
                            Host: ['vemss.example.com'],
                        },
                    },
                },
            },
            {
                title: 'parses vmess shadowsocks-http lines as http obfs and keeps the QX alias',
                input: `vmess=qx-vmess-http.example.com:80,method=none,password=${UUID},obfs=shadowsocks-http,obfs-host=cdn.example.com,obfs-uri=/resource/file,tag=QX VMess Shadowsocks HTTP`,
                expected: {
                    type: 'vmess',
                    name: 'QX VMess Shadowsocks HTTP',
                    server: 'qx-vmess-http.example.com',
                    port: 80,
                    cipher: 'none',
                    uuid: UUID,
                    alterId: 0,
                    network: 'http',
                    _qx_obfs_http: 'shadowsocks-http',
                    'http-opts': {
                        path: ['/resource/file'],
                        headers: {
                            Host: ['cdn.example.com'],
                        },
                    },
                },
            },
            {
                title: 'parses vless vmess-http lines as http obfs and keeps the QX token',
                input: `vless=qx-vless-http.example.com:80,method=none,password=${UUID},obfs=vmess-http,obfs-host=vless.example.com,obfs-uri=/vless-http,tag=QX VLESS HTTP`,
                expected: {
                    type: 'vless',
                    name: 'QX VLESS HTTP',
                    server: 'qx-vless-http.example.com',
                    port: 80,
                    cipher: 'none',
                    uuid: UUID,
                    network: 'http',
                    _qx_obfs_http: 'vmess-http',
                    'http-opts': {
                        path: ['/vless-http'],
                        headers: {
                            Host: ['vless.example.com'],
                        },
                    },
                },
            },
            {
                title: 'parses vless reality websocket lines',
                input: `vless=qx-vless.example.com:443,method=none,password=${UUID},obfs=wss,obfs-host=cdn.example.com,obfs-uri=/vless,tls-verification=false,tls-host=sni.example.com,reality-base64-pubkey=pubkey,reality-hex-shortid=08,vless-flow=xtls-rprx-vision,tag=QX VLESS`,
                expected: {
                    type: 'vless',
                    name: 'QX VLESS',
                    server: 'qx-vless.example.com',
                    port: 443,
                    cipher: 'none',
                    uuid: UUID,
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    flow: 'xtls-rprx-vision',
                    network: 'ws',
                    'ws-opts': {
                        path: '/vless',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                    'reality-opts': {
                        'public-key': 'pubkey',
                        'short-id': '08',
                    },
                },
            },
            {
                title: 'parses vless over-tls lines using obfs-host as the tls server name alias',
                input: `vless=qx-vless-overtls.example.com:37001,method=none,password=${UUID},obfs=over-tls,obfs-host=tls-name.example.com,tls13=true,tls-verification=false,reality-base64-pubkey=pubkey,reality-hex-shortid=01ab,vless-flow=xtls-rprx-vision,fast-open=false,udp-relay=true,tag=QX VLESS Over TLS Alias`,
                expected: {
                    type: 'vless',
                    name: 'QX VLESS Over TLS Alias',
                    server: 'qx-vless-overtls.example.com',
                    port: 37001,
                    cipher: 'none',
                    uuid: UUID,
                    tls: true,
                    sni: 'tls-name.example.com',
                    'skip-cert-verify': true,
                    flow: 'xtls-rprx-vision',
                    udp: true,
                    tfo: false,
                    'reality-opts': {
                        'public-key': 'pubkey',
                        'short-id': '01ab',
                    },
                },
            },
            {
                title: 'prefers explicit tls-host over obfs-host for vless over-tls lines',
                input: `vless=qx-vless-overtls-priority.example.com:443,method=none,password=${UUID},obfs=over-tls,obfs-host=tls-alias.example.com,tls-host=explicit-sni.example.com,tls-verification=false,vless-flow=xtls-rprx-vision,tag=QX VLESS Over TLS Explicit`,
                expected: {
                    type: 'vless',
                    name: 'QX VLESS Over TLS Explicit',
                    server: 'qx-vless-overtls-priority.example.com',
                    port: 443,
                    cipher: 'none',
                    uuid: UUID,
                    tls: true,
                    sni: 'explicit-sni.example.com',
                    'skip-cert-verify': true,
                    flow: 'xtls-rprx-vision',
                },
            },
            {
                title: 'parses anytls standard tls lines',
                input: 'anytls=example.com:443,password=pwd,over-tls=true,tls-host=apple.com,udp-relay=true,tag=anytls-standard-tls-01',
                expected: {
                    type: 'anytls',
                    name: 'anytls-standard-tls-01',
                    server: 'example.com',
                    port: 443,
                    password: 'pwd',
                    tls: true,
                    sni: 'apple.com',
                    udp: true,
                },
            },
            {
                title: 'parses anytls reality tls lines',
                input: 'anytls=example.com:443,password=pwd,over-tls=true,tls-host=apple.com,reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk,reality-hex-shortid=0123456789abcdef,tag=anytls-reality-tls-01',
                expected: {
                    type: 'anytls',
                    name: 'anytls-reality-tls-01',
                    server: 'example.com',
                    port: 443,
                    password: 'pwd',
                    tls: true,
                    sni: 'apple.com',
                    'reality-opts': {
                        'public-key':
                            'k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk',
                        'short-id': '0123456789abcdef',
                    },
                },
            },
            {
                title: 'parses trojan websocket tls lines',
                input: 'trojan=qx-trojan.example.com:443,password=secret,obfs=wss,obfs-host=cdn.example.com,obfs-uri=/trojan,tls-verification=false,tls-host=sni.example.com,tls-cert-sha256=fingerprint,tag=QX Trojan',
                expected: {
                    type: 'trojan',
                    name: 'QX Trojan',
                    server: 'qx-trojan.example.com',
                    port: 443,
                    password: 'secret',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    'tls-fingerprint': 'fingerprint',
                    network: 'ws',
                    'ws-opts': {
                        path: '/trojan',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                },
            },
            {
                title: 'parses http over tls lines',
                input: 'http=qx-http.example.com:8443,username=user,password=pass,over-tls=true,tls-host=sni.example.com,tls-verification=false,fast-open=true,tag=QX HTTP',
                expected: {
                    type: 'http',
                    name: 'QX HTTP',
                    server: 'qx-http.example.com',
                    port: 8443,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    tfo: true,
                },
            },
            {
                title: 'parses socks5 over tls lines',
                input: 'socks5=qx-socks.example.com:1080,username=user,password=pass,over-tls=true,tls-host=sni.example.com,tls-verification=false,udp-relay=true,tag=QX SOCKS5',
                expected: {
                    type: 'socks5',
                    name: 'QX SOCKS5',
                    server: 'qx-socks.example.com',
                    port: 1080,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    udp: true,
                },
            },
        ]);
    });

    describe('Loon raw inputs', function () {
        registerCases([
            {
                title: 'parses shadowsocks obfs tls lines',
                input: 'Loon SS=shadowsocks,loon-ss.example.com,8388,aes-128-gcm,"secret",obfs-name=tls,obfs-host=obfs.example.com,obfs-uri=/tls,udp=true,fast-open=true',
                expected: {
                    type: 'ss',
                    name: 'Loon SS',
                    server: 'loon-ss.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    udp: true,
                    tfo: true,
                    plugin: 'obfs',
                    'plugin-opts': {
                        mode: 'tls',
                        host: 'obfs.example.com',
                        path: '/tls',
                    },
                },
            },
            {
                title: 'parses shadowsocksr lines',
                input: 'Loon SSR=shadowsocksr,loon-ssr.example.com,8389,aes-256-cfb,"secret",protocol=auth_chain_b,protocol-param=device-id,obfs=tls1.2_ticket_fastauth,obfs-param=cdn.example.com',
                expected: {
                    type: 'ssr',
                    name: 'Loon SSR',
                    server: 'loon-ssr.example.com',
                    port: 8389,
                    cipher: 'aes-256-cfb',
                    password: 'secret',
                    protocol: 'auth_chain_b',
                    'protocol-param': 'device-id',
                    obfs: 'tls1.2_ticket_fastauth',
                    'obfs-param': 'cdn.example.com',
                },
            },
            {
                title: 'parses vmess http tls lines',
                input: `Loon VMess=vmess,loon-vmess.example.com,443,auto,"${UUID}",transport=http,host=cdn.example.com,path=/http,over-tls=true,tls-name=sni.example.com,skip-cert-verify=true,alterId=0`,
                expected: {
                    type: 'vmess',
                    name: 'Loon VMess',
                    server: 'loon-vmess.example.com',
                    port: 443,
                    cipher: 'auto',
                    uuid: UUID,
                    alterId: 0,
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    network: 'http',
                    'http-opts': {
                        path: ['/http'],
                        headers: {
                            Host: ['cdn.example.com'],
                        },
                    },
                },
            },
            {
                title: 'parses vless websocket reality lines',
                input: `Loon VLESS=vless,loon-vless.example.com,443,"${UUID}",transport=ws,host=cdn.example.com,path=/ws,over-tls=true,tls-name=sni.example.com,skip-cert-verify=true,flow=xtls-rprx-vision,public-key=pubkey,short-id=08`,
                expected: {
                    type: 'vless',
                    name: 'Loon VLESS',
                    server: 'loon-vless.example.com',
                    port: 443,
                    uuid: UUID,
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    flow: 'xtls-rprx-vision',
                    network: 'ws',
                    'ws-opts': {
                        path: '/ws',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                    'reality-opts': {
                        'public-key': 'pubkey',
                        'short-id': '08',
                    },
                },
            },
            {
                title: 'parses trojan websocket tls lines',
                input: 'Loon Trojan=trojan,loon-trojan.example.com,443,"secret",transport=ws,host=cdn.example.com,path=/trojan,over-tls=true,tls-name=sni.example.com,skip-cert-verify=true',
                expected: {
                    type: 'trojan',
                    name: 'Loon Trojan',
                    server: 'loon-trojan.example.com',
                    port: 443,
                    password: 'secret',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    network: 'ws',
                    'ws-opts': {
                        path: '/trojan',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                },
            },
            {
                title: 'parses anytls lines',
                input: 'Loon AnyTLS=anytls,loon-anytls.example.com,443,"secret",transport=ws,host=cdn.example.com,path=/anytls,over-tls=true,tls-name=sni.example.com,skip-cert-verify=true,idle-session-timeout=30,max-stream-count=16',
                expected: {
                    type: 'anytls',
                    name: 'Loon AnyTLS',
                    server: 'loon-anytls.example.com',
                    port: 443,
                    password: 'secret',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    network: 'ws',
                    'ws-opts': {
                        path: '/anytls',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                    'idle-session-timeout': 30,
                    'max-stream-count': 16,
                },
            },
            {
                title: 'parses hysteria2 lines',
                input: 'Loon Hysteria2=hysteria2,loon-hy2.example.com,443,"secret",tls-name=peer.example.com,skip-cert-verify=true,download-bandwidth=100,salamander-password=mask,ecn=true',
                expected: {
                    type: 'hysteria2',
                    name: 'Loon Hysteria2',
                    server: 'loon-hy2.example.com',
                    port: 443,
                    password: 'secret',
                    sni: 'peer.example.com',
                    'skip-cert-verify': true,
                    down: '100',
                    obfs: 'salamander',
                    'obfs-password': 'mask',
                    ecn: true,
                },
            },
            {
                title: 'parses https auth lines',
                input: 'Loon HTTPS=https,loon-http.example.com,8443,user,"pass",tls-name=sni.example.com,skip-cert-verify=true',
                expected: {
                    type: 'http',
                    name: 'Loon HTTPS',
                    server: 'loon-http.example.com',
                    port: 8443,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                },
            },
            {
                title: 'parses https lines with ip-mode markers',
                input: 'Loon HTTPS IP Mode=https,loon-http.example.com,8443,user,"pass",ip-mode=v4-only',
                expected: {
                    type: 'http',
                    name: 'Loon HTTPS IP Mode',
                    server: 'loon-http.example.com',
                    port: 8443,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    'ip-version': 'v4-only',
                },
            },
            {
                title: 'parses https lines with tls-cert-sha256 markers',
                input: 'Loon HTTPS Fingerprint=https,loon-http.example.com,8443,user,"pass",tls-cert-sha256=fingerprint',
                expected: {
                    type: 'http',
                    name: 'Loon HTTPS Fingerprint',
                    server: 'loon-http.example.com',
                    port: 8443,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    'tls-fingerprint': 'fingerprint',
                },
            },
            {
                title: 'parses https lines with tls-pubkey-sha256 markers',
                input: 'Loon HTTPS Pubkey=https,loon-http.example.com,8443,user,"pass",tls-pubkey-sha256=pubkey',
                expected: {
                    type: 'http',
                    name: 'Loon HTTPS Pubkey',
                    server: 'loon-http.example.com',
                    port: 8443,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    'tls-pubkey-sha256': 'pubkey',
                },
            },
            {
                title: 'parses socks5 over tls lines',
                input: 'Loon SOCKS5=socks5,loon-socks.example.com,1080,user,"pass",over-tls=true,tls-name=sni.example.com,skip-cert-verify=true',
                expected: {
                    type: 'socks5',
                    name: 'Loon SOCKS5',
                    server: 'loon-socks.example.com',
                    port: 1080,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                },
            },
            {
                title: 'parses socks5 lines with ip-mode markers',
                input: 'Loon SOCKS5 IP Mode=socks5,loon-socks.example.com,1080,user,"pass",ip-mode=v4-only',
                expected: {
                    type: 'socks5',
                    name: 'Loon SOCKS5 IP Mode',
                    server: 'loon-socks.example.com',
                    port: 1080,
                    username: 'user',
                    password: 'pass',
                    'ip-version': 'v4-only',
                },
            },
            {
                title: 'parses socks5 over tls lines with tls-pubkey-sha256 markers',
                input: 'Loon SOCKS5 Pubkey=socks5,loon-socks.example.com,1080,user,"pass",over-tls=true,tls-pubkey-sha256=pubkey',
                expected: {
                    type: 'socks5',
                    name: 'Loon SOCKS5 Pubkey',
                    server: 'loon-socks.example.com',
                    port: 1080,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    'tls-pubkey-sha256': 'pubkey',
                },
            },
            {
                title: 'parses wireguard lines',
                input: 'Loon WG=wireguard,interface-ip=10.0.0.2,interface-ipv6=fd00::2,private-key=private-key,mtu=1280,keepalive=25,dns=1.1.1.1,dnsv6=2606:4700:4700::1111,peers=[{endpoint=loon-wg.example.com:51820,public-key=public-key,allowed-ips="0.0.0.0/0, ::/0",reserved=[1,2,3]}]',
                expected: {
                    type: 'wireguard',
                    name: 'Loon WG',
                    server: 'loon-wg.example.com',
                    port: 51820,
                    ip: '10.0.0.2',
                    ipv6: 'fd00::2',
                    'private-key': 'private-key',
                    'public-key': 'public-key',
                    mtu: 1280,
                    keepalive: 25,
                    reserved: [1, 2, 3],
                    'allowed-ips': ['0.0.0.0/0', '::/0'],
                    dns: ['1.1.1.1', '2606:4700:4700::1111'],
                    'remote-dns-resolve': true,
                },
            },
        ]);
    });

    describe('Surge raw inputs', function () {
        registerCases([
            {
                title: 'parses direct lines',
                input: 'Surge Direct = direct, udp-relay=true',
                expected: {
                    type: 'direct',
                    name: 'Surge Direct',
                    udp: true,
                },
            },
            {
                title: 'parses anytls lines',
                input: 'Surge AnyTLS = anytls,surge-anytls.example.com,443,password=secret,sni=sni.example.com,skip-cert-verify=true,reuse=true',
                expected: {
                    type: 'anytls',
                    name: 'Surge AnyTLS',
                    server: 'surge-anytls.example.com',
                    port: 443,
                    password: 'secret',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    reuse: true,
                },
            },
            {
                title: 'parses trust-tunnel lines',
                input: 'Surge TrustTunnel = trust-tunnel,surge-trust.example.com,443,username=user,password=secret,sni=sni.example.com,skip-cert-verify=true,reuse=true',
                expected: {
                    type: 'trusttunnel',
                    name: 'Surge TrustTunnel',
                    server: 'surge-trust.example.com',
                    port: 443,
                    username: 'user',
                    password: 'secret',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    reuse: true,
                },
            },
            {
                title: 'parses ssh lines',
                input: 'Surge SSH = ssh,surge-ssh.example.com,22,user,pass,server-fingerprint=sshfp',
                expected: {
                    type: 'ssh',
                    name: 'Surge SSH',
                    server: 'surge-ssh.example.com',
                    port: 22,
                    username: 'user',
                    password: 'pass',
                    'server-fingerprint': 'sshfp',
                },
            },
            {
                title: 'parses shadowsocks obfs tls lines',
                input: 'Surge SS = ss,surge-ss.example.com,8388,encrypt-method=aes-128-gcm,password=secret,obfs=tls,obfs-host=obfs.example.com,obfs-uri=/tls',
                expected: {
                    type: 'ss',
                    name: 'Surge SS',
                    server: 'surge-ss.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    plugin: 'obfs',
                    'plugin-opts': {
                        mode: 'tls',
                        host: 'obfs.example.com',
                        path: '/tls',
                    },
                },
            },
            {
                title: 'parses vmess websocket tls lines',
                input: `Surge VMess = vmess,surge-vmess.example.com,443,username=${UUID},ws=true,ws-path=/vmess,ws-headers=Host:cdn.example.com,skip-cert-verify=true,sni=sni.example.com,tls=true,vmess-aead=true,udp-relay=true`,
                expected: {
                    type: 'vmess',
                    name: 'Surge VMess',
                    server: 'surge-vmess.example.com',
                    port: 443,
                    uuid: UUID,
                    aead: true,
                    alterId: 0,
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    udp: true,
                    network: 'ws',
                    'ws-opts': {
                        path: '/vmess',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                },
            },
            {
                title: 'parses trojan websocket tls lines',
                input: 'Surge Trojan = trojan,surge-trojan.example.com,443,password=secret,ws=true,ws-path=/trojan,ws-headers=Host:cdn.example.com,skip-cert-verify=true,sni=sni.example.com,tls=true',
                expected: {
                    type: 'trojan',
                    name: 'Surge Trojan',
                    server: 'surge-trojan.example.com',
                    port: 443,
                    password: 'secret',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    network: 'ws',
                    'ws-opts': {
                        path: '/trojan',
                        headers: {
                            Host: 'cdn.example.com',
                        },
                    },
                },
            },
            {
                title: 'parses https auth lines',
                input: 'Surge HTTPS = https,surge-http.example.com,8443,user,pass,sni=sni.example.com,skip-cert-verify=true',
                expected: {
                    type: 'http',
                    name: 'Surge HTTPS',
                    server: 'surge-http.example.com',
                    port: 8443,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                },
            },
            {
                title: 'parses socks5 tls lines',
                input: 'Surge SOCKS5 = socks5-tls,surge-socks.example.com,1080,user,pass,sni=sni.example.com,skip-cert-verify=true,udp-relay=true',
                expected: {
                    type: 'socks5',
                    name: 'Surge SOCKS5',
                    server: 'surge-socks.example.com',
                    port: 1080,
                    username: 'user',
                    password: 'pass',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    udp: true,
                },
            },
            {
                title: 'parses snell obfs tls lines',
                input: 'Surge Snell = snell,surge-snell.example.com,443,psk=secret,version=3,obfs=tls,obfs-host=obfs.example.com,obfs-uri=/snell',
                expected: {
                    type: 'snell',
                    name: 'Surge Snell',
                    server: 'surge-snell.example.com',
                    port: 443,
                    psk: 'secret',
                    version: 3,
                    'obfs-opts': {
                        mode: 'tls',
                        host: 'obfs.example.com',
                        path: '/snell',
                    },
                },
            },
            {
                title: 'parses tuic v5 lines',
                input: `Surge TUIC = tuic-v5,surge-tuic.example.com,443,uuid=${UUID},password=secret,sni=sni.example.com,skip-cert-verify=true,alpn=h3,ecn=true,port-hopping=9000;9002-9004`,
                expected: {
                    type: 'tuic',
                    name: 'Surge TUIC',
                    server: 'surge-tuic.example.com',
                    port: 443,
                    version: 5,
                    uuid: UUID,
                    password: 'secret',
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    alpn: ['h3'],
                    ecn: true,
                    ports: '9000,9002-9004',
                },
            },
            {
                title: 'parses wireguard lines',
                input: 'Surge WG = wireguard,section-name=wireguard-cellular',
                expected: {
                    type: 'wireguard-surge',
                    name: 'Surge WG',
                    'section-name': 'wireguard-cellular',
                },
            },
            {
                title: 'parses hysteria2 lines',
                input: 'Surge Hysteria2 = hysteria2,surge-hy2.example.com,443,password=secret,sni=peer.example.com,skip-cert-verify=true,download-bandwidth=100,ecn=true,salamander-password=mask,port-hopping=8443-8445',
                expected: {
                    type: 'hysteria2',
                    name: 'Surge Hysteria2',
                    server: 'surge-hy2.example.com',
                    port: 443,
                    password: 'secret',
                    sni: 'peer.example.com',
                    'skip-cert-verify': true,
                    down: '100',
                    ecn: true,
                    obfs: 'salamander',
                    'obfs-password': 'mask',
                    ports: '8443-8445',
                },
            },
            {
                title: 'parses external definitions with exec, args, local-port and addresses',
                input: 'Surge External = external, exec="/usr/bin/ssh", local-port="1080", args="-D", args="localhost:1080", addresses="[2001:db8::1]", addresses="1.1.1.1"',
                expected: {
                    type: 'external',
                    name: 'Surge External',
                    exec: '/usr/bin/ssh',
                    'local-port': '1080',
                    args: ['-D', 'localhost:1080'],
                    addresses: ['2001:db8::1', '1.1.1.1'],
                },
            },
        ]);
    });
});
