import { Base64 } from 'js-base64';
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { UUID, parseAll, parseOne, expectSubset } from './helpers';

describe('Proxy URI parser coverage', function () {
    describe('generic URIs', function () {
        it('parses HTTPS URIs with implicit default port', function () {
            const proxy = parseOne(
                'https://alice:pa%24%24@https.example.com#HTTPS%20Default',
            );

            expectSubset(proxy, {
                type: 'http',
                name: 'HTTPS Default',
                server: 'https.example.com',
                port: 443,
                tls: true,
                username: 'alice',
                password: 'pa$$',
            });
        });

        it('keeps the full https fragment comment after the first hash', function () {
            const proxy = parseOne(
                'https://alice:pa%24%24@https.example.com#HTTPS%20Outer#Remark',
            );

            expectSubset(proxy, {
                type: 'http',
                name: 'HTTPS Outer#Remark',
                server: 'https.example.com',
                port: 443,
                tls: true,
                username: 'alice',
                password: 'pa$$',
            });
        });

        it('parses legacy socks:// URIs with base64 auth', function () {
            const proxy = parseOne(
                `socks://${encodeURIComponent(
                    Base64.encode('bob:secret'),
                )}@socks.example.com:1080#SOCKS`,
            );

            expectSubset(proxy, {
                type: 'socks5',
                name: 'SOCKS',
                server: 'socks.example.com',
                port: 1080,
                username: 'bob',
                password: 'secret',
            });
        });

        it('keeps the full socks fragment comment after the first hash', function () {
            const proxy = parseOne(
                `socks://${encodeURIComponent(
                    Base64.encode('bob:secret'),
                )}@socks.example.com:1080#SOCKS#Remark`,
            );

            expectSubset(proxy, {
                type: 'socks5',
                name: 'SOCKS#Remark',
                server: 'socks.example.com',
                port: 1080,
                username: 'bob',
                password: 'secret',
            });
        });
    });

    describe('shadowsocks family', function () {
        it('parses SIP002 shadowsocks URIs with obfs and transport flags', function () {
            const userInfo = encodeURIComponent(
                Base64.encode('aes-128-gcm:secret'),
            );
            const plugin = encodeURIComponent(
                'obfs-local;obfs=http;obfs-host=obfs.example.com',
            );
            const proxy = parseOne(
                `ss://${userInfo}@ss.example.com:8388/?plugin=${plugin}&uot=1&tfo=1#SS%20Obfs`,
            );

            expectSubset(proxy, {
                type: 'ss',
                name: 'SS Obfs',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
                plugin: 'obfs',
                'plugin-opts': {
                    mode: 'http',
                    host: 'obfs.example.com',
                },
                'udp-over-tcp': true,
                tfo: true,
            });
        });

        it('parses legacy shadowsocks URIs with v2ray-plugin options', function () {
            const legacy = Base64.encode(
                'chacha20-ietf-poly1305:legacy-pass@legacy.example.com:443',
            );
            const plugin = encodeURIComponent(
                'v2ray-plugin;tls;host=cdn.example.com;path=/socket',
            );
            const proxy = parseOne(
                `ss://${legacy}?plugin=${plugin}#SS%20V2ray`,
            );

            expectSubset(proxy, {
                type: 'ss',
                name: 'SS V2ray',
                server: 'legacy.example.com',
                port: 443,
                cipher: 'chacha20-ietf-poly1305',
                password: 'legacy-pass',
                plugin: 'v2ray-plugin',
                'plugin-opts': {
                    mode: 'websocket',
                    host: 'cdn.example.com',
                    path: '/socket',
                    tls: true,
                },
            });
        });

        it('keeps the full shadowsocks fragment comment after the first hash', function () {
            const userInfo = encodeURIComponent(
                Base64.encode('aes-128-gcm:secret'),
            );
            const proxy = parseOne(
                `ss://${userInfo}@ss.example.com:8388#SS%20Outer#Remark`,
            );

            expectSubset(proxy, {
                type: 'ss',
                name: 'SS Outer#Remark',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
            });
        });

        it('parses shadowsocks v2ray-plugin URI flags for sni, skip-cert-verify, and mux', function () {
            const userInfo = encodeURIComponent(
                Base64.encode('aes-128-gcm:secret'),
            );
            const plugin = encodeURIComponent(
                'v2ray-plugin;obfs=websocket;host=cdn.example.com;path=/socket;tls;sni=sni.example.com;skip-cert-verify=1;mux=1',
            );
            const proxy = parseOne(
                `ss://${userInfo}@ss.example.com:443/?plugin=${plugin}#SS%20V2ray%20Flags`,
            );

            expectSubset(proxy, {
                type: 'ss',
                name: 'SS V2ray Flags',
                server: 'ss.example.com',
                port: 443,
                cipher: 'aes-128-gcm',
                password: 'secret',
                plugin: 'v2ray-plugin',
                'plugin-opts': {
                    mode: 'websocket',
                    host: 'cdn.example.com',
                    path: '/socket',
                    tls: true,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    mux: 1,
                },
            });
        });

        it('parses v2ray-plugin paths containing escaped equals signs', function () {
            const userInfo = encodeURIComponent(
                Base64.encode('aes-128-gcm:secret'),
            );
            const plugin = encodeURIComponent(
                'v2ray-plugin;mode=websocket;host=cdn.example.com;path=/?enc\\=aes-128-gcm',
            );
            const proxy = parseOne(
                `ss://${userInfo}@ss.example.com:8080?plugin=${plugin}#SS%20Escaped%20Path`,
            );

            expectSubset(proxy, {
                type: 'ss',
                name: 'SS Escaped Path',
                server: 'ss.example.com',
                port: 8080,
                cipher: 'aes-128-gcm',
                password: 'secret',
                plugin: 'v2ray-plugin',
                'plugin-opts': {
                    mode: 'websocket',
                    host: 'cdn.example.com',
                    path: '/?enc=aes-128-gcm',
                },
            });
        });

        it('parses shadowsocks shadow-tls compatibility payloads', function () {
            const userInfo = Base64.encode('aes-256-gcm:shadow-pass');
            const payload = Base64.encode(
                JSON.stringify({
                    host: 'mask.example.com',
                    password: 'tls-pass',
                    version: '3',
                    address: '1.1.1.1',
                    port: '9443',
                }),
            );
            const proxy = parseOne(
                `ss://${userInfo}@ss.example.com:8388?shadow-tls=${payload}#SS%20ShadowTLS`,
            );

            expectSubset(proxy, {
                type: 'ss',
                name: 'SS ShadowTLS',
                server: '1.1.1.1',
                port: 9443,
                cipher: 'aes-256-gcm',
                password: 'shadow-pass',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'tls-pass',
                    version: 3,
                },
            });
        });

        it('parses SSR URIs with protocol and obfs parameters', function () {
            const encoded = Base64.encode(
                [
                    'ssr.example.com:8899:origin:aes-256-cfb:http_simple:',
                    Base64.encode('ssr-secret'),
                    '/?remarks=',
                    Base64.encode('SSR Node'),
                    '&obfsparam=',
                    Base64.encode('cdn.example.com'),
                    '&protoparam=',
                    Base64.encode('user:pass'),
                ].join(''),
            );
            const proxy = parseOne(`ssr://${encoded}`);

            expectSubset(proxy, {
                type: 'ssr',
                name: 'SSR Node',
                server: 'ssr.example.com',
                port: 8899,
                protocol: 'origin',
                cipher: 'aes-256-cfb',
                obfs: 'http_simple',
                password: 'ssr-secret',
                'protocol-param': 'user:pass',
                'obfs-param': 'cdn.example.com',
            });
        });
    });

    describe('other modern URI formats', function () {
        it('parses AnyTLS URIs and drops plain tcp transport metadata', function () {
            const proxy = parseOne(
                'anytls://top-secret@anytls.example.com:443?type=tcp&alpn=h2,http/1.1&insecure=1&udp=1#AnyTLS',
            );

            expectSubset(proxy, {
                type: 'anytls',
                name: 'AnyTLS',
                server: 'anytls.example.com',
                port: 443,
                password: 'top-secret',
                tls: true,
                sni: 'anytls.example.com',
                alpn: ['h2', 'http/1.1'],
                udp: true,
                'skip-cert-verify': true,
            });
            expect(proxy.network).to.equal(undefined);
        });

        it('parses Hysteria URIs with fallback SNI and throughput fields', function () {
            const proxy = parseOne(
                'hy://hysteria.example.com:8443?auth=token&peer=sni.example.com&alpn=h3,h2&mport=2000,3000&obfsParam=mask&upmbps=10&downmbps=20&insecure=1#Hysteria',
            );

            expectSubset(proxy, {
                type: 'hysteria',
                name: 'Hysteria',
                server: 'hysteria.example.com',
                port: 8443,
                protocol: 'udp',
                'auth-str': 'token',
                sni: 'sni.example.com',
                alpn: ['h3', 'h2'],
                ports: '2000,3000',
                obfs: 'mask',
                up: '10',
                down: '20',
                'skip-cert-verify': true,
            });
        });

        it('parses Hysteria2 URIs with port hopping ranges', function () {
            const proxy = parseOne(
                'hy2://hy2-secret@hy2.example.com:8443-8445?peer=peer.example.com&obfs=salamander&obfs-password=mask&insecure=1&fastopen=1&pinSHA256=fingerprint&hop-interval=30&keepalive=15#Hy2%20Range',
            );

            expectSubset(proxy, {
                type: 'hysteria2',
                name: 'Hy2 Range',
                server: 'hy2.example.com',
                ports: '8443-8445',
                password: 'hy2-secret',
                sni: 'peer.example.com',
                obfs: 'salamander',
                'obfs-password': 'mask',
                'skip-cert-verify': true,
                tfo: true,
                'tls-fingerprint': 'fingerprint',
                'hop-interval': 30,
                keepalive: 15,
            });
            expect(proxy.port).to.be.within(8443, 8445);
        });

        it('splits Hysteria2 URI hop-interval ranges during normalization', function () {
            const proxy = parseOne(
                'hy2://hy2-secret@hy2.example.com:443?hop-interval=15-30#Hy2%20Hop%20Range',
            );

            expectSubset(proxy, {
                type: 'hysteria2',
                name: 'Hy2 Hop Range',
                server: 'hy2.example.com',
                port: 443,
                password: 'hy2-secret',
                'hop-interval': 15,
                'hop-interval-max': 30,
            });
        });

        it('drops invalid Hysteria2 URI hop-interval values during normalization', function () {
            const proxy = parseOne(
                'hy2://hy2-secret@hy2.example.com:443?hop-interval=30-15#Hy2%20Invalid%20Hop',
            );

            expectSubset(proxy, {
                type: 'hysteria2',
                name: 'Hy2 Invalid Hop',
                server: 'hy2.example.com',
                port: 443,
                password: 'hy2-secret',
            });
            expect(proxy).to.not.have.property('hop-interval');
            expect(proxy).to.not.have.property('hop-interval-max');
        });

        it('parses Hysteria2 URIs with mport overrides', function () {
            const proxy = parseOne(
                'hy2://hy2-secret@hy2.example.com:443?mport=9000,9002-9004#Hy2%20Mport',
            );

            expectSubset(proxy, {
                type: 'hysteria2',
                name: 'Hy2 Mport',
                server: 'hy2.example.com',
                port: 443,
                ports: '9000,9002-9004',
                password: 'hy2-secret',
            });
        });

        it('rejects Hysteria2 salamander obfs without obfs-password', function () {
            const proxies = parseAll(
                'hy2://hy2-secret@hy2.example.com:443?obfs=salamander#Hy2%20Missing%20Password',
            );

            expect(proxies).to.deep.equal([]);
        });

        it('parses TUIC URIs with colon-containing passwords and booleans', function () {
            const proxy = parseOne(
                `tuic://${UUID}:pass%3Aword@tuic.example.com?alpn=h3,hq-29&allow-insecure=1&fast-open=1&disable-sni=1&reduce-rtt=1&congestion-control=bbr#TUIC`,
            );

            expectSubset(proxy, {
                type: 'tuic',
                name: 'TUIC',
                server: 'tuic.example.com',
                port: 443,
                uuid: UUID,
                password: 'pass:word',
                alpn: ['h3', 'hq-29'],
                'skip-cert-verify': true,
                tfo: true,
                'disable-sni': true,
                'reduce-rtt': true,
                'congestion-controller': 'bbr',
            });
        });

        it('parses WireGuard URIs with address lists and reserved bytes', function () {
            const proxy = parseOne(
                'wg://private-key@wg.example.com?publickey=public-key&privatekey=override-key&address=10.0.0.2/32,[fd00::2]/128&reserved=1,2,3&mtu=1280&udp=0#WG',
            );

            expectSubset(proxy, {
                type: 'wireguard',
                name: 'WG',
                server: 'wg.example.com',
                port: 51820,
                'private-key': 'override-key',
                'public-key': 'public-key',
                ip: '10.0.0.2',
                ipv6: 'fd00::2',
                'ip-cidr': 32,
                'ipv6-cidr': 128,
                reserved: [1, 2, 3],
                mtu: 1280,
                udp: false,
            });
        });

        it('defaults WireGuard CIDR suffixes when address entries omit them', function () {
            const proxy = parseOne(
                'wg://private-key@wg.example.com?publickey=public-key&address=10.0.0.2,[fd00::2]#WG%20Default%20CIDR',
            );

            expectSubset(proxy, {
                type: 'wireguard',
                name: 'WG Default CIDR',
                ip: '10.0.0.2',
                ipv6: 'fd00::2',
                'ip-cidr': 32,
                'ipv6-cidr': 128,
            });
        });

        it('preserves trailing base64 padding in WireGuard key query params', function () {
            const proxy = parseOne(
                'wg://120.233.41.77:19368?publicKey=N+K9fXobvy0vy3VFbn8a7tPRgUNcQbGRwjlyOMx4WHc=&privateKey=QJjrFqqqpbIqfI5qhbYWrPXhaBFmFq71jCj8mMaQE04=&ip=10.0.20.45/16,fd10:10:10:0:10:0:20:45/64&mtu=1420&udp=1#HK-%E5%A4%A7%E5%B8%A6%E5%AE%BD4',
            );

            expectSubset(proxy, {
                type: 'wireguard',
                name: 'HK-大带宽4',
                server: '120.233.41.77',
                port: 19368,
                'public-key': 'N+K9fXobvy0vy3VFbn8a7tPRgUNcQbGRwjlyOMx4WHc=',
                'private-key': 'QJjrFqqqpbIqfI5qhbYWrPXhaBFmFq71jCj8mMaQE04=',
                ip: '10.0.20.45',
                'ip-cidr': 16,
                ipv6: 'fd10:10:10:0:10:0:20:45',
                'ipv6-cidr': 64,
                mtu: 1420,
                udp: true,
            });
        });

        it('parses Trojan URIs with websocket transport', function () {
            const proxy = parseOne(
                'trojan://trojan-pass@trojan-ws.example.com?type=ws&host=ws.example.com&path=%2Fws#Trojan%20WS',
            );

            expectSubset(proxy, {
                type: 'trojan',
                name: 'Trojan WS',
                server: 'trojan-ws.example.com',
                port: 443,
                password: 'trojan-pass',
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'ws.example.com',
                    },
                },
            });
        });

        it('parses Trojan URIs with pcs as tls fingerprint', function () {
            const proxy = parseOne(
                'trojan://trojan-pass@trojan-ws.example.com?type=ws&host=ws.example.com&path=%2Fws&pcs=fingerprint#Trojan%20WS%20PCS',
            );

            expectSubset(proxy, {
                type: 'trojan',
                name: 'Trojan WS PCS',
                server: 'trojan-ws.example.com',
                port: 443,
                password: 'trojan-pass',
                'tls-fingerprint': 'fingerprint',
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'ws.example.com',
                    },
                },
            });
        });

        it('parses Trojan URIs with grpc reality metadata', function () {
            const proxy = parseOne(
                'trojan://trojan-pass@trojan-grpc.example.com?type=grpc&serviceName=grpc-service&authority=grpc.example.com&mode=multi&security=reality&pbk=pubkey&sid=08&spx=%2Fspider&udp=1&tfo=1#Trojan%20Reality',
            );

            expectSubset(proxy, {
                type: 'trojan',
                name: 'Trojan Reality',
                server: 'trojan-grpc.example.com',
                port: 443,
                password: 'trojan-pass',
                network: 'grpc',
                udp: true,
                tfo: true,
                'grpc-opts': {
                    'grpc-service-name': 'grpc-service',
                    '_grpc-type': 'multi',
                    '_grpc-authority': 'grpc.example.com',
                },
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                    '_spider-x': '/spider',
                },
                _mode: 'multi',
            });
        });
    });
});
