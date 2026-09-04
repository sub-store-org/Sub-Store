import { expect } from 'chai';
import Shadowrocket_Producer from '@/core/proxy-utils/producers/shadowrocket';

function produce(proxy) {
    return Shadowrocket_Producer().produce(
        [proxy],
        undefined,
        { native: true },
    );
}

describe('Shadowrocket native output', function () {
    it('outputs Shadowsocks', function () {
        expect(
            produce({
                type: 'ss',
                name: 'SS-Test',
                server: 'example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'test-password',
                udp: true,
            }),
        ).to.equal(
            'SS-Test=ss,example.com,8388,password=test-password,method=aes-128-gcm',
        );
    });

    it('outputs VMess', function () {
        expect(
            produce({
                type: 'vmess',
                name: 'VMess-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                alterId: 0,
                cipher: 'auto',
                network: 'tcp',
            }),
        ).to.equal(
            'VMess-Test=vmess,example.com,443,password=11111111-1111-4111-8111-111111111111,alterId=0,method=auto',
        );
    });

    it('preserves VMess WebSocket and TLS connection settings', function () {
        expect(
            produce({
                type: 'vmess',
                name: 'VMess-WS-TLS',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                alterId: 0,
                cipher: 'auto',
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
            }),
        ).to.equal(
            'VMess-WS-TLS=vmess,example.com,443,password=11111111-1111-4111-8111-111111111111,alterId=0,method=auto,tls=true,obfs=websocket,path=/ws,obfsParam=cdn.example.com,peer=sni.example.com,allowInsecure=1,fp=chrome,alpn=h2',
        );
    });

    it('rejects unsupported VMess transports instead of dropping them', function () {
        expect(() =>
            produce({
                type: 'vmess',
                name: 'VMess-gRPC',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                alterId: 0,
                cipher: 'auto',
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'example',
                },
            }),
        ).to.throw('Unsupported Shadowrocket native VMess network: grpc');
    });

    it('outputs VLESS', function () {
        expect(
            produce({
                type: 'vless',
                name: 'VLESS-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                tls: true,
                sni: 'example.com',
                network: 'tcp',
            }),
        ).to.equal(
            'VLESS-Test=vless,example.com,443,password=11111111-1111-4111-8111-111111111111,tls=true,peer=example.com',
        );
    });

    it('outputs HTTP', function () {
        expect(
            produce({
                type: 'http',
                name: 'HTTP-Test',
                server: 'example.com',
                port: 8080,
                username: 'test',
                password: 'password',
            }),
        ).to.equal(
            'HTTP-Test=http,example.com,8080,test,password',
        );
    });

    it('outputs HTTPS', function () {
        expect(
            produce({
                type: 'http',
                name: 'HTTPS-Test',
                server: 'example.com',
                port: 443,
                username: 'test',
                password: 'password',
                tls: true,
            }),
        ).to.equal(
            'HTTPS-Test=https,example.com,443,test,password',
        );
    });

    it('outputs SOCKS5', function () {
        expect(
            produce({
                type: 'socks5',
                name: 'SOCKS-Test',
                server: 'example.com',
                port: 1080,
                username: 'test',
                password: 'password',
            }),
        ).to.equal(
            'SOCKS-Test=socks5,example.com,1080,test,password',
        );
    });

    it('outputs SOCKS5 TLS', function () {
        expect(
            produce({
                type: 'socks5',
                name: 'SOCKS-TLS-Test',
                server: 'example.com',
                port: 1080,
                username: 'test',
                password: 'password',
                tls: true,
            }),
        ).to.equal(
            'SOCKS-TLS-Test=socks5-tls,example.com,1080,test,password',
        );
    });

    it('outputs Trojan', function () {
        expect(
            produce({
                type: 'trojan',
                name: 'Trojan-Test',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                sni: 'example.com',
            }),
        ).to.equal(
            'Trojan-Test=trojan,example.com,443,password=test-password,peer=example.com',
        );
    });

    it('outputs Hysteria2', function () {
        expect(
            produce({
                type: 'hysteria2',
                name: 'HY2-Test',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
            }),
        ).to.equal(
            'HY2-Test=hysteria2,example.com,443,auth=test-password,udp=1,peer=example.com,alpn=h3',
        );
    });

    it('outputs Hysteria', function () {
        expect(
            produce({
                type: 'hysteria',
                name: 'Hysteria-Test',
                server: 'example.com',
                port: 443,
                'auth-str': 'test-password',
                obfs: 'test-obfs',
                protocol: 'udp',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
                up: 100,
                down: 200,
            }),
        ).to.equal(
            'Hysteria-Test=hysteria,example.com,443,auth=test-password,obfsParam=test-obfs,protocol=udp,udp=1,peer=example.com,alpn=h3,upmbps=100,downmbps=200',
        );
    });

    it('outputs TUIC', function () {
        expect(
            produce({
                type: 'tuic',
                name: 'TUIC-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
            }),
        ).to.equal(
            'TUIC-Test=tuic,example.com,443,password=test-password,udp=1,user=11111111-1111-4111-8111-111111111111,peer=example.com,alpn=h3',
        );
    });

    it('outputs Juicity', function () {
        expect(
            produce({
                type: 'juicity',
                name: 'Juicity-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
            }),
        ).to.equal(
            'Juicity-Test=juicity,example.com,443,password=test-password,udp=1,user=11111111-1111-4111-8111-111111111111,peer=example.com,alpn=h3',
        );
    });

    it('outputs WireGuard', function () {
        expect(
            produce({
                type: 'wireguard',
                name: 'WG-Test',
                server: 'example.com',
                port: 51820,
                'private-key': 'private-key',
                'public-key': 'public-key',
                ip: '10.0.0.2/32',
                udp: true,
                dns: ['1.1.1.1'],
                mtu: 1280,
                keepalive: 25,
                reserved: [1, 2, 3],
            }),
        ).to.equal(
            'WG-Test=wireguard,example.com,51820,privateKey=private-key,publicKey=public-key,ip=10.0.0.2/32,udp=1,dns=1.1.1.1,mtu=1280,keepalive=25,reserved=1/2/3',
        );
    });

    it('outputs Snell', function () {
        expect(
            produce({
                type: 'snell',
                name: 'Snell-Test',
                server: 'example.com',
                port: 443,
                psk: 'test-password',
                udp: true,
                version: 3,
                'obfs-opts': {
                    mode: 'http',
                    host: 'example.com',
                    path: '/abc',
                },
            }),
        ).to.equal(
            'Snell-Test=snell,example.com,443,password=test-password,udp=1,obfs=http,obfs-host=example.com,obfs-uri=/abc',
        );
    });

    it('outputs VLESS WebSocket', function () {
        expect(
            produce({
                type: 'vless',
                name: 'VLESS-WS-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                tls: true,
                sni: 'example.com',
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            }),
        ).to.include(
            'VLESS-WS-Test=vless,example.com,443,password=11111111-1111-4111-8111-111111111111,tls=true,obfs=websocket',
        );
    });

    it('does not silently drop unsupported native proxy types', function () {
        expect(() =>
            produce({
                type: 'anytls',
                name: 'AnyTLS-Test',
                server: 'example.com',
                port: 443,
                password: 'test-password',
            }),
        ).to.throw(
            'Unsupported Shadowrocket native proxy type: anytls',
        );
    });

    it('rejects multiple ALPN values in native output', function () {
        expect(() =>
            produce({
                type: 'hysteria2',
                name: 'HY2-Multi-ALPN',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                alpn: ['h3', 'h2'],
            }),
        ).to.throw(
            'Unsupported multiple Shadowrocket native alpn values',
        );
    });

    it('rejects multiple DNS values in native WireGuard output', function () {
        expect(() =>
            produce({
                type: 'wireguard',
                name: 'WG-Multi-DNS',
                server: 'example.com',
                port: 51820,
                'private-key': 'private-key',
                'public-key': 'public-key',
                ip: '10.0.0.2/32',
                dns: ['1.1.1.1', '8.8.8.8'],
            }),
        ).to.throw(
            'Unsupported multiple Shadowrocket native dns values',
        );
    });

    it('rejects undocumented TUIC token authentication in native output', function () {
        expect(() =>
            produce({
                type: 'tuic',
                name: 'TUIC-Token',
                server: 'example.com',
                port: 443,
                token: 'test-token',
            }),
        ).to.throw(
            'Unsupported Shadowrocket native TUIC token authentication',
        );
    });

    it('keeps internal output as an array when native mode is enabled', function () {
        const output = Shadowrocket_Producer().produce(
            [
                {
                    type: 'vless',
                    name: 'VLESS-Test',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    tls: true,
                },
            ],
            'internal',
            { native: true },
        );

        expect(output).to.be.an('array');
        expect(output[0].type).to.equal('vless');
    });

    it('keeps the existing YAML output when native mode is disabled', function () {
        const output = Shadowrocket_Producer().produce([
            {
                type: 'vless',
                name: 'VLESS-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                tls: true,
                network: 'tcp',
            },
        ]);

        expect(output).to.include('proxies:');
    });
});
