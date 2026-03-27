import { Base64 } from 'js-base64';
import { describe, it } from 'mocha';

import { UUID, expectSubset, parseOne } from './helpers';

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
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            });
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

        it('parses tcp http-header VLESS shares', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-http.example.com:80?type=tcp&headerType=http&host=http.example.com&path=%2Fedge#VLESS%20HTTP`,
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

        it('parses h2 VLESS shares', function () {
            const proxy = parseOne(
                `vless://${UUID}@vless-h2.example.com:443?type=h2&host=h2.example.com&path=%2Fh2&h2=1#VLESS%20H2`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS H2',
                server: 'vless-h2.example.com',
                port: 443,
                network: 'h2',
                _h2: true,
                'h2-opts': {
                    headers: {
                        host: ['h2.example.com'],
                    },
                    path: '/h2',
                },
            });
        });

        it('parses xhttp VLESS shares with mihomo transport extras', function () {
            const extra = JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
            });
            const proxy = parseOne(
                `vless://${UUID}@vless-xhttp.example.com:443?type=xhttp&security=tls&host=cdn.example.com&path=%2Fxhttp&mode=stream-up&extra=${encodeURIComponent(extra)}#VLESS%20XHTTP`,
            );

            expectSubset(proxy, {
                type: 'vless',
                name: 'VLESS XHTTP',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                _extra: extra,
                'xhttp-opts': {
                    mode: 'stream-up',
                    path: '/xhttp',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'no-grpc-header': true,
                    'x-padding-bytes': '64-128',
                },
            });
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
