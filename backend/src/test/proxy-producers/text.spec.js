import { expect } from 'chai';
import { Base64 } from 'js-base64';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import QX_Producer from '@/core/proxy-utils/producers/qx';
import { produceExternal, UUID } from './helpers';

describe('Proxy text producers', function () {
    it('produces Quantumult X shadowsocks over-tls lines from canonical tls nodes', function () {
        const output = produceExternal('QX', {
            type: 'ss',
            name: 'QX SS Over TLS',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
            'skip-cert-verify': true,
        });

        expect(output).to.equal(
            'shadowsocks=ss.example.com:443,method=aes-128-gcm,password=secret,obfs=over-tls,obfs-host=a.com,tls-verification=false,tag=QX SS Over TLS',
        );
    });

    it('produces Quantumult X shadowsocks over-tls lines without obfs-host when sni is absent', function () {
        const output = produceExternal('QX', {
            type: 'ss',
            name: 'QX SS Over TLS No Host',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
        });

        expect(output).to.equal(
            'shadowsocks=ss.example.com:443,method=aes-128-gcm,password=secret,obfs=over-tls,tag=QX SS Over TLS No Host',
        );
    });

    it('produces Quantumult X shadowsocks over-tls lines for canonical tcp tls nodes', function () {
        const output = produceExternal('QX', {
            type: 'ss',
            name: 'QX SS Over TLS TCP',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
            network: 'tcp',
        });

        expect(output).to.equal(
            'shadowsocks=ss.example.com:443,method=aes-128-gcm,password=secret,obfs=over-tls,obfs-host=a.com,tag=QX SS Over TLS TCP',
        );
    });

    it('preserves Quantumult X obfs-host after Shadowrocket rewrites ss tls sni to servername', function () {
        const proxy = {
            type: 'ss',
            name: 'QX SS Over TLS Re-emit',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
        };

        ProxyUtils.produce([proxy], 'Shadowrocket', 'internal');
        const output = ProxyUtils.produce([proxy], 'QX', 'external');

        expect(output).to.equal(
            'shadowsocks=ss.example.com:443,method=aes-128-gcm,password=secret,obfs=over-tls,obfs-host=a.com,tag=QX SS Over TLS Re-emit',
        );
    });

    it('keeps legacy Quantumult X shadowsocks obfs tls output unchanged', function () {
        const output = produceExternal('QX', {
            type: 'ss',
            name: 'QX SS Obfs TLS',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'obfs',
            'plugin-opts': {
                mode: 'tls',
                host: 'legacy.example.com',
            },
        });

        expect(output).to.equal(
            'shadowsocks=ss.example.com:8388,method=aes-128-gcm,password=secret,obfs=tls,obfs-host=legacy.example.com,tag=QX SS Obfs TLS',
        );
    });

    it('preserves Quantumult X shadowsocks http token output', function () {
        const output = produceExternal('QX', {
            type: 'ss',
            name: 'QX SS HTTP',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            _qx_obfs_http: 'http',
            plugin: 'obfs',
            'plugin-opts': {
                mode: 'http',
                host: 'plain.example.com',
                path: '/plain',
            },
        });

        expect(output).to.equal(
            'shadowsocks=ss.example.com:8388,method=aes-128-gcm,password=secret,obfs=http,obfs-host=plain.example.com,obfs-uri=/plain,tag=QX SS HTTP',
        );
    });

    // QX examples contain the upstream "vemss-http" typo; keep emitting it
    // when the parsed source token was preserved in _qx_obfs_http.
    it('preserves Quantumult X shadowsocks vemss-http alias output', function () {
        const output = produceExternal('QX', {
            type: 'ss',
            name: 'QX SS VMess HTTP',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            _qx_obfs_http: 'vemss-http',
            plugin: 'obfs',
            'plugin-opts': {
                mode: 'http',
                host: 'legacy.example.com',
                path: '/resource',
            },
        });

        expect(output).to.equal(
            'shadowsocks=ss.example.com:8388,method=aes-128-gcm,password=secret,obfs=vemss-http,obfs-host=legacy.example.com,obfs-uri=/resource,tag=QX SS VMess HTTP',
        );
    });

    it('preserves Quantumult X shadowsocks shadowsocks-http token output', function () {
        const output = produceExternal('QX', {
            type: 'ss',
            name: 'QX SS Shadowsocks HTTP',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            _qx_obfs_http: 'shadowsocks-http',
            plugin: 'obfs',
            'plugin-opts': {
                mode: 'http',
                host: 'shadow.example.com',
                path: '/shadow',
            },
        });

        expect(output).to.equal(
            'shadowsocks=ss.example.com:8388,method=aes-128-gcm,password=secret,obfs=shadowsocks-http,obfs-host=shadow.example.com,obfs-uri=/shadow,tag=QX SS Shadowsocks HTTP',
        );
    });

    it('preserves Quantumult X vmess http token output', function () {
        const output = produceExternal('QX', {
            type: 'vmess',
            name: 'QX VMess HTTP',
            server: 'vmess.example.com',
            port: 80,
            cipher: 'none',
            uuid: UUID,
            _qx_obfs_http: 'http',
            network: 'http',
            'http-opts': {
                path: '/http',
                headers: {
                    Host: 'plain.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vmess=vmess.example.com:80,method=none,password=${UUID},obfs=http,obfs-uri=/http,obfs-host=plain.example.com,aead=false,tag=QX VMess HTTP`,
        );
    });

    // QX examples contain the upstream "vemss-http" typo; keep emitting it
    // when the parsed source token was preserved in _qx_obfs_http.
    it('preserves Quantumult X vmess vemss-http alias output', function () {
        const output = produceExternal('QX', {
            type: 'vmess',
            name: 'QX VMess VMess HTTP',
            server: 'vmess.example.com',
            port: 80,
            cipher: 'none',
            uuid: UUID,
            _qx_obfs_http: 'vemss-http',
            network: 'http',
            'http-opts': {
                path: '/vemss',
                headers: {
                    Host: 'vemss.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vmess=vmess.example.com:80,method=none,password=${UUID},obfs=vemss-http,obfs-uri=/vemss,obfs-host=vemss.example.com,aead=false,tag=QX VMess VMess HTTP`,
        );
    });

    it('preserves Quantumult X vmess shadowsocks-http alias output', function () {
        const output = produceExternal('QX', {
            type: 'vmess',
            name: 'QX VMess Shadowsocks HTTP',
            server: 'vmess.example.com',
            port: 80,
            cipher: 'none',
            uuid: UUID,
            _qx_obfs_http: 'shadowsocks-http',
            network: 'http',
            'http-opts': {
                path: '/resource/file',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vmess=vmess.example.com:80,method=none,password=${UUID},obfs=shadowsocks-http,obfs-uri=/resource/file,obfs-host=cdn.example.com,aead=false,tag=QX VMess Shadowsocks HTTP`,
        );
    });

    it('preserves Quantumult X vless vmess-http token output', function () {
        const output = produceExternal('QX', {
            type: 'vless',
            name: 'QX VLESS HTTP',
            server: 'vless.example.com',
            port: 80,
            uuid: UUID,
            _qx_obfs_http: 'vmess-http',
            network: 'http',
            'http-opts': {
                path: '/vless-http',
                headers: {
                    Host: 'vless.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vless=vless.example.com:80,method=none,password=${UUID},obfs=vmess-http,obfs-uri=/vless-http,obfs-host=vless.example.com,tag=QX VLESS HTTP`,
        );
    });

    it('produces Quantumult X VLESS reality websocket lines', function () {
        const output = produceExternal('QX', {
            type: 'vless',
            name: 'QX Reality',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
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
        });

        expect(output).to.equal(
            `vless=vless.example.com:443,method=none,password=${UUID},obfs=wss,obfs-uri=/ws,obfs-host=cdn.example.com,tls-host=sni.example.com,vless-flow=xtls-rprx-vision,tag=QX Reality,reality-base64-pubkey=pubkey,reality-hex-shortid=08`,
        );
    });

    it('produces Quantumult X AnyTLS standard tls lines', function () {
        const output = produceExternal('QX', {
            type: 'anytls',
            name: 'anytls-standard-tls-01',
            server: 'example.com',
            port: 443,
            password: 'pwd',
            tls: true,
            sni: 'apple.com',
            udp: true,
        });

        expect(output).to.equal(
            'anytls=example.com:443,password=pwd,over-tls=true,tls-host=apple.com,udp-relay=true,tag=anytls-standard-tls-01',
        );
    });

    it('produces Quantumult X AnyTLS reality tls lines', function () {
        const output = produceExternal('QX', {
            type: 'anytls',
            name: 'anytls-reality-tls-01',
            server: 'example.com',
            port: 443,
            password: 'pwd',
            tls: true,
            sni: 'apple.com',
            udp: true,
            'reality-opts': {
                'public-key': 'k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk',
                'short-id': '0123456789abcdef',
            },
        });

        expect(output).to.equal(
            'anytls=example.com:443,password=pwd,over-tls=true,tls-host=apple.com,udp-relay=true,tag=anytls-reality-tls-01,reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk,reality-hex-shortid=0123456789abcdef',
        );
    });

    it('produces Quantumult X AnyTLS lines and keeps only supported fields', function () {
        const output = produceExternal('QX', {
            type: 'anytls',
            name: 'QX AnyTLS Supported Fields',
            server: 'anytls.example.com',
            port: 443,
            password: 'secret',
            tls: true,
            sni: 'sni.example.com',
            udp: true,
            tfo: true,
            'skip-cert-verify': true,
            'test-url': 'https://check.example.com',
            'idle-session-timeout': 30,
            'max-stream-count': 16,
        });

        expect(output).to.equal(
            'anytls=anytls.example.com:443,password=secret,over-tls=true,tls-verification=false,tls-host=sni.example.com,fast-open=true,udp-relay=true,server_check_url=https://check.example.com,tag=QX AnyTLS Supported Fields',
        );
    });

    it('rejects Quantumult X AnyTLS transport shapes that QX cannot represent', function () {
        const producer = QX_Producer();

        expect(() =>
            producer.produce({
                type: 'anytls',
                name: 'QX AnyTLS WS',
                server: 'anytls.example.com',
                port: 443,
                password: 'secret',
                tls: true,
                network: 'ws',
                'ws-opts': {
                    path: '/anytls',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            }),
        ).to.throw('Platform QX does not support AnyTLS with transport ws');
    });

    it('round-trips Quantumult X AnyTLS reality lines without changing supported semantics', function () {
        const raw =
            'anytls=example.com:443,password=pwd,over-tls=true,tls-host=apple.com,udp-relay=true,tag=anytls-reality-tls-01,reality-base64-pubkey=k4Uxez0sjl8bKaZH2Vgi8-WDFshML51QkxKFLWFIONk,reality-hex-shortid=0123456789abcdef';
        const [proxy] = ProxyUtils.parse(raw);
        const output = ProxyUtils.produce([proxy], 'QX', 'external');

        expect(output).to.equal(raw);
    });

    it('produces Loon VLESS reality websocket lines', function () {
        const output = produceExternal('Loon', {
            type: 'vless',
            name: 'Loon Reality',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
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
            'skip-cert-verify': true,
        });

        expect(output).to.equal(
            `Loon Reality=vless,vless.example.com,443,"${UUID}",transport=ws,path=/ws,host=cdn.example.com,over-tls=true,skip-cert-verify=true,flow=xtls-rprx-vision,sni=sni.example.com,public-key="pubkey",short-id=08`,
        );
    });

    it('produces Loon AnyTLS lines and keeps only supported fields', function () {
        const output = produceExternal('Loon', {
            type: 'anytls',
            name: 'Loon AnyTLS',
            server: 'anytls.example.com',
            port: 443,
            password: 'secret',
            tls: true,
            sni: 'sni.example.com',
            network: 'ws',
            'ws-opts': {
                path: '/anytls',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
            'skip-cert-verify': true,
            'idle-session-timeout': 30,
            'max-stream-count': 16,
        });

        expect(output).to.equal(
            'Loon AnyTLS=anytls,anytls.example.com,443,"secret",idle-session-timeout=30,max-stream-count=16,skip-cert-verify=true,tls-name=sni.example.com',
        );
    });

    it('produces Surge TUIC v5 lines with port hopping', function () {
        const output = produceExternal('Surge', {
            type: 'tuic',
            name: 'Surge TUIC',
            server: 'tuic.example.com',
            port: 443,
            uuid: UUID,
            password: 'secret',
            ports: '9000,9002-9004',
            sni: 'sni.example.com',
            'skip-cert-verify': true,
            alpn: ['h3'],
            ecn: true,
        });

        expect(output).to.equal(
            `Surge TUIC=tuic-v5,tuic.example.com,443,uuid=${UUID},password="secret",alpn=h3,port-hopping="9000;9002-9004",sni="sni.example.com",skip-cert-verify=true,ecn=true`,
        );
    });

    it('produces Loon WireGuard lines without leaking CIDR metadata fields', function () {
        const output = produceExternal('Loon', {
            type: 'wireguard',
            name: 'Loon WG',
            server: 'wg.example.com',
            port: 51820,
            'private-key': 'private-key',
            'public-key': 'public-key',
            ip: '10.0.0.2',
            ipv6: 'fd00::2',
            'ip-cidr': 24,
            'ipv6-cidr': 64,
        });

        expect(output).to.include('Loon WG=wireguard');
        expect(output).to.include(',interface-ip=10.0.0.2');
        expect(output).to.include(',interface-ipv6=fd00::2');
        expect(output).to.not.include('ip-cidr');
        expect(output).to.not.include('ipv6-cidr');
    });

    it('produces Surge WireGuard sections without leaking CIDR metadata fields', function () {
        const output = produceExternal(
            'Surge',
            {
                type: 'wireguard',
                name: 'Surge WG',
                server: 'wg.example.com',
                port: 51820,
                'private-key': 'private-key',
                'public-key': 'public-key',
                ip: '10.0.0.2',
                ipv6: 'fd00::2',
                'ip-cidr': 24,
                'ipv6-cidr': 64,
            },
            { 'include-unsupported-proxy': true },
        );

        expect(output).to.include('# > WireGuard Proxy Surge WG');
        expect(output).to.include('self-ip = 10.0.0.2');
        expect(output).to.include('self-ip-v6 = fd00::2');
        expect(output).to.not.include('ip-cidr');
        expect(output).to.not.include('ipv6-cidr');
    });

    it('produces Surfboard trojan websocket lines', function () {
        const output = produceExternal('Surfboard', {
            type: 'trojan',
            name: 'Trojan',
            server: 'trojan.example.com',
            port: 443,
            password: 'secret',
            network: 'ws',
            tls: true,
            sni: 'sni.example.com',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            'Trojan=trojan,trojan.example.com,443,password=secret,ws=true,ws-path=/ws,ws-headers=Host:"cdn.example.com",tls=true,sni="sni.example.com"',
        );
    });

    it('produces Surfboard Hysteria2 lines', function () {
        const output = produceExternal('Surfboard', {
            type: 'hysteria2',
            name: 'Surfboard Hysteria2',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            ports: '8443,8445-8447',
            'hop-interval': 30,
            sni: 'peer.example.com',
            'skip-cert-verify': true,
            down: '100 Mbps',
            udp: true,
        });

        expect(output).to.equal(
            'Surfboard Hysteria2=hysteria2,hy2.example.com,443,password="secret",port-hopping="8443;8445-8447",port-hopping-interval=30,sni="peer.example.com",skip-cert-verify=true,download-bandwidth=100,udp-relay=true',
        );
    });

    it('omits Surfboard Hysteria2 lines when obfs is present', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'hysteria2',
                    name: 'Surfboard Hysteria2 Obfs',
                    server: 'hy2.example.com',
                    port: 443,
                    password: 'secret',
                    obfs: 'salamander',
                    'obfs-password': 'mask',
                },
            ],
            'Surfboard',
            'external',
        );

        expect(output).to.equal('');
    });

    it('produces SurgeMac external lines', function () {
        const output = produceExternal('SurgeMac', {
            type: 'external',
            name: 'External',
            exec: '/usr/bin/ssh',
            'local-port': 1080,
            args: ['-D', 'localhost:1080'],
            addresses: ['1.1.1.1', '2001:db8::1'],
            udp: true,
            tfo: true,
            'test-url': 'https://test.example.com',
            'block-quic': 'on',
        });

        expect(output).to.equal(
            'External=external,exec="/usr/bin/ssh",local-port=1080,args="-D",args="localhost:1080",addresses=1.1.1.1,addresses=2001:db8::1,udp-relay=true,tfo=true,test-url=https://test.example.com,block-quic=on',
        );
    });

    it('wraps unsupported SurgeMac protocols with Mihomo external mode when requested', function () {
        const output = produceExternal(
            'SurgeMac',
            {
                type: 'vless',
                name: 'Mihomo VLESS',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            },
            { useMihomoExternal: true, localPort: 16666 },
        );

        expect(output).to.include(
            'Mihomo VLESS=external,exec="/usr/local/bin/mihomo",local-port=16666',
        );
        expect(output).to.include('args="-config"');
        expect(output).to.include('udp-relay=true');
    });

    it('forces SurgeMac nodes with _mihomoExternal to use Mihomo external mode', function () {
        const output = produceExternal(
            'SurgeMac',
            {
                type: 'tuic',
                name: 'Forced Mihomo',
                server: 'tuic.example.com',
                port: 443,
                uuid: UUID,
                password: 'secret',
                sni: 'sni.example.com',
                _mihomoExternal: true,
            },
            { localPort: 17777 },
        );

        expect(output).to.include(
            'Forced Mihomo=external,exec="/usr/local/bin/mihomo",local-port=17777',
        );
        expect(output).to.not.include('Forced Mihomo=tuic-v5');
    });

    it('produces URI WireGuard links with stored and default CIDR suffixes', function () {
        const output = produceExternal('URI', [
            {
                type: 'wireguard',
                name: 'URI WG Explicit CIDR',
                server: 'wg-explicit.example.com',
                port: 51820,
                'private-key': 'private-key-1',
                'public-key': 'public-key-1',
                ip: '10.0.0.2',
                ipv6: 'fd00::2',
                'ip-cidr': 24,
                'ipv6-cidr': 64,
                udp: true,
            },
            {
                type: 'wireguard',
                name: 'URI WG Default CIDR',
                server: 'wg-default.example.com',
                port: 51820,
                'private-key': 'private-key-2',
                'public-key': 'public-key-2',
                ip: '10.0.0.3',
                ipv6: 'fd00::3',
                udp: true,
            },
        ]);

        const [explicit, defaults] = output.split('\n');
        expect(explicit).to.include('address=10.0.0.2%2F24%2Cfd00%3A%3A2%2F64');
        expect(defaults).to.include(
            'address=10.0.0.3%2F32%2Cfd00%3A%3A3%2F128',
        );
        expect(explicit).to.not.include('ip-cidr=');
        expect(explicit).to.not.include('ipv6-cidr=');
        expect(defaults).to.not.include('ip-cidr=');
        expect(defaults).to.not.include('ipv6-cidr=');
    });

    it('produces URI shadowsocks links with v2ray-plugin mux and tls flags', function () {
        const plugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;mode=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;sni=sni.example.com;skip-cert-verify=true;mux=0',
        );
        const output = produceExternal('URI', {
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
                mux: 0,
            },
        });

        expect(output).to.equal(
            `ss://${Base64.encode(
                'aes-128-gcm:secret',
            )}@ss.example.com:443/?plugin=${plugin}#SS%20V2ray%20Flags`,
        );
    });

    it('normalizes boolean v2ray-plugin mux values to integers in URI links', function () {
        const muxOnPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;mode=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;mux=1',
        );
        const muxOffPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;mode=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;mux=0',
        );

        const muxOnOutput = produceExternal('URI', {
            type: 'ss',
            name: 'SS Boolean Mux On',
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
                mux: true,
            },
        });
        const muxOffOutput = produceExternal('URI', {
            type: 'ss',
            name: 'SS Boolean Mux Off',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'v2ray-plugin',
            'plugin-opts': {
                mode: 'websocket',
                host: 'cdn.example.com',
                path: '/socket',
                mux: false,
            },
        });

        expect(muxOnOutput).to.equal(
            `ss://${Base64.encode(
                'aes-128-gcm:secret',
            )}@ss.example.com:443/?plugin=${muxOnPlugin}#SS%20Boolean%20Mux%20On`,
        );
        expect(muxOffOutput).to.equal(
            `ss://${Base64.encode(
                'aes-128-gcm:secret',
            )}@ss.example.com:443/?plugin=${muxOffPlugin}#SS%20Boolean%20Mux%20Off`,
        );
    });

    it('round-trips Clash-style boolean v2ray-plugin mux flags into URI links', function () {
        const proxies = ProxyUtils.parse(`proxies:
  - name: Clash Boolean Mux On
    type: ss
    server: ss.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: cdn.example.com
      path: /socket
      tls: true
      mux: true
  - name: Clash Boolean Mux Off
    type: ss
    server: ss.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: cdn.example.com
      path: /socket
      mux: false
`);

        const output = produceExternal('URI', proxies);
        const userInfo = Base64.encode('aes-128-gcm:secret');
        const muxOnPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;mode=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;mux=1',
        );
        const muxOffPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;mode=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;mux=0',
        );

        expect(output).to.equal(
            [
                `ss://${userInfo}@ss.example.com:443/?plugin=${muxOnPlugin}#Clash%20Boolean%20Mux%20On`,
                `ss://${userInfo}@ss.example.com:443/?plugin=${muxOffPlugin}#Clash%20Boolean%20Mux%20Off`,
            ].join('\n'),
        );
    });

    it('round-trips Clash-style string boolean v2ray-plugin mux flags into URI links', function () {
        const proxies = ProxyUtils.parse(`proxies:
  - name: Clash String Mux On
    type: ss
    server: ss.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: cdn.example.com
      path: /socket
      tls: true
      mux: ' TRUE '
  - name: Clash String Mux Off
    type: ss
    server: ss.example.com
    port: 443
    cipher: aes-128-gcm
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: cdn.example.com
      path: /socket
      mux: ' false '
`);

        const output = produceExternal('URI', proxies);
        const userInfo = Base64.encode('aes-128-gcm:secret');
        const muxOnPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;mode=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;mux=1',
        );
        const muxOffPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;mode=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;mux=0',
        );

        expect(output).to.equal(
            [
                `ss://${userInfo}@ss.example.com:443/?plugin=${muxOnPlugin}#Clash%20String%20Mux%20On`,
                `ss://${userInfo}@ss.example.com:443/?plugin=${muxOffPlugin}#Clash%20String%20Mux%20Off`,
            ].join('\n'),
        );
    });

    it('produces URI VLESS reality websocket links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI Reality',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            flow: 'xtls-rprx-vision',
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': 2048,
                'early-data-header-name': 'Sec-WebSocket-Protocol',
            },
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
                '_spider-x': '/spider',
            },
            'client-fingerprint': 'chrome',
            alpn: ['h2'],
        });

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=reality&type=ws&path=%2Fws&host=cdn.example.com&ed=2048&alpn=h2&sni=sni.example.com&fp=chrome&flow=xtls-rprx-vision&sid=08&spx=%2Fspider&pbk=pubkey#URI%20Reality`,
        );
    });

    it('produces URI VLESS websocket links with packet encoding and custom early data headers', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS Early',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
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

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&ed=2048&eh=X-Data&packetEncoding=packet&sni=sni.example.com#URI%20WS%20Early`,
        );
    });

    it('produces URI VLESS websocket links with pcs from tls fingerprint', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS PCS',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            'tls-fingerprint': 'fingerprint',
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&pcs=fingerprint&sni=sni.example.com#URI%20WS%20PCS`,
        );
    });

    it('produces URI VLESS fake-http links with method and headerType', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI HTTP',
            server: 'vless-http.example.com',
            port: 80,
            uuid: UUID,
            network: 'http',
            udp: true,
            'http-opts': {
                path: ['/edge'],
                method: 'GET',
                headers: {
                    Host: ['http.example.com'],
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-http.example.com:80?security=none&type=tcp&headerType=http&path=%2Fedge&host=http.example.com&method=GET&packetEncoding=none#URI%20HTTP`,
        );
    });

    it('produces URI VLESS httpupgrade links with early data metadata', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI Upgrade',
            server: 'vless-upgrade.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
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

        expect(output).to.equal(
            `vless://${UUID}@vless-upgrade.example.com:443?security=tls&type=httpupgrade&path=%2Fupgrade&host=upgrade.example.com&ed=1024&eh=X-Upgrade#URI%20Upgrade`,
        );
    });

    it('produces URI VLESS h2 links using share-link http transport type', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI H2',
            server: 'vless-h2.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            udp: true,
            network: 'h2',
            _h2: true,
            'h2-opts': {
                path: '/h2',
                headers: {
                    host: ['h2.example.com'],
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-h2.example.com:443?security=tls&type=http&path=%2Fh2&host=h2.example.com&packetEncoding=none&h2=1#URI%20H2`,
        );
    });

    it('produces URI VLESS xhttp links with mihomo transport mode', function () {
        const extra = JSON.stringify({
            noGRPCHeader: true,
            xPaddingBytes: '64-128',
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                headers: {
                    Host: 'cdn.example.com',
                },
                mode: 'stream-up',
                'no-grpc-header': true,
                'x-padding-bytes': '64-128',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP`,
        );
    });

    it('preserves _extra_unsupported without letting it override structured xhttp fields when producing URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Unsupported Extra',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            _extra_unsupported: {
                customField: 'keep-me',
                downloadSettings: {
                    sockopt: {
                        mark: 255,
                    },
                    address: 'old.example.com',
                },
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'no-grpc-header': true,
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.customField).to.equal('keep-me');
        expect(extra.noGRPCHeader).to.equal(true);
        expect(extra.downloadSettings?.address).to.equal(
            'download.example.com',
        );
        expect(extra.downloadSettings?.port).to.equal(8443);
        expect(extra.downloadSettings?.network).to.equal('xhttp');
        expect(extra.downloadSettings?.security).to.equal('tls');
        expect(extra.downloadSettings?.sockopt).to.deep.equal({
            mark: 255,
        });
        expect(extra.downloadSettings?.xhttpSettings?.path).to.equal(
            '/download',
        );
        expect(extra.downloadSettings?.xhttpSettings?.host).to.equal(
            'download-host.example.com',
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.server,
        ).to.equal('download.example.com');
        expect(reparsed[0]._extra_unsupported).to.deep.equal({
            customField: 'keep-me',
            downloadSettings: {
                sockopt: {
                    mark: 255,
                },
            },
        });
    });

    it('uses string _extra as the final xhttp URI extra without rebuilding it', function () {
        const rawExtra = JSON.stringify({
            customField: 'keep-me',
            scMinPostsIntervalMs: '0-300',
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Raw Extra String',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            _extra: rawExtra,
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'sc-min-posts-interval-ms': 300,
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        expect(decodeURIComponent(encodedExtra)).to.equal(rawExtra);

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal('0-300');
    });

    it('stringifies plain-object _extra before using it as the final xhttp URI extra', function () {
        const rawExtra = {
            customField: 'keep-me',
            scMinPostsIntervalMs: '0-300',
        };
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Raw Extra Object',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            _extra: rawExtra,
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'sc-min-posts-interval-ms': 300,
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        expect(JSON.parse(decodeURIComponent(encodedExtra))).to.deep.equal(
            rawExtra,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal('0-300');
    });

    it('prefers explicit _extra over _extra_unsupported when both are present', function () {
        const rawExtra = JSON.stringify({
            customField: 'raw-wins',
            scMinPostsIntervalMs: '0-300',
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Raw Extra Wins',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            _extra: rawExtra,
            _extra_unsupported: {
                customField: 'stale-sidecar',
                downloadSettings: {
                    sockopt: {
                        mark: 255,
                    },
                },
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'sc-min-posts-interval-ms': 300,
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        expect(decodeURIComponent(encodedExtra)).to.equal(rawExtra);

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal('0-300');
        expect(reparsed[0]._extra_unsupported).to.deep.equal({
            customField: 'raw-wins',
        });
    });

    it('keeps structured xhttp scalar normalization even if _extra_unsupported carries conflicting raw fields', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Unsupported Extra Scalars',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            _extra_unsupported: {
                customField: 'keep-me',
                scMaxEachPostBytes: '000-1000000',
                scMinPostsIntervalMs: '0300',
                uplinkChunkSize: '00064 - 00128',
                downloadSettings: {
                    xhttpSettings: {
                        scMaxEachPostBytes: '000-1000000',
                        scMinPostsIntervalMs: '000-300',
                        uplinkChunkSize: '00048',
                    },
                },
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'sc-max-each-post-bytes': 1000000,
                'sc-min-posts-interval-ms': 300,
                'uplink-chunk-size': '00064 - 00128',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    'sc-max-each-post-bytes': 1000000,
                    'sc-min-posts-interval-ms': 300,
                    'uplink-chunk-size': '00048',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.customField).to.equal('keep-me');
        expect(extra.scMaxEachPostBytes).to.equal(1000000);
        expect(extra.scMinPostsIntervalMs).to.equal(300);
        expect(extra.uplinkChunkSize).to.equal('64-128');
        expect(
            extra.downloadSettings?.xhttpSettings?.scMaxEachPostBytes,
        ).to.equal(1000000);
        expect(
            extra.downloadSettings?.xhttpSettings?.scMinPostsIntervalMs,
        ).to.equal(300);
        expect(extra.downloadSettings?.xhttpSettings?.uplinkChunkSize).to.equal(
            48,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['sc-max-each-post-bytes']).to.equal(
            1000000,
        );
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal(300);
        expect(reparsed[0]['xhttp-opts']?.['uplink-chunk-size']).to.equal(
            '64-128',
        );
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'uplink-chunk-size'
            ],
        ).to.equal(48);
        expect(reparsed[0]._extra_unsupported).to.deep.equal({
            customField: 'keep-me',
        });
    });

    it('round-trips unsupported xhttp extra sidecar values without dropping them', function () {
        const rawExtra = JSON.stringify({
            uplinkChunkSize: 'fast',
            xmux: {
                hKeepAlivePeriod: '9007199254740993',
            },
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
        const [parsed] = ProxyUtils.parse(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                rawExtra,
            )}#URI%20XHTTP%20Unsupported%20Roundtrip`,
        );
        const output = produceExternal('URI', parsed);

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.uplinkChunkSize).to.equal('fast');
        expect(extra.xmux).to.deep.equal({
            hKeepAlivePeriod: '9007199254740993',
        });
        expect(extra.downloadSettings?.address).to.equal('download.example.com');
        expect(extra.downloadSettings?.port).to.equal(8443);
        expect(extra.downloadSettings?.network).to.equal('xhttp');
        expect(extra.downloadSettings?.security).to.equal('tls');
        expect(extra.downloadSettings?.tlsSettings?.alpn).to.deep.equal([
            'h2',
            { foo: 1 },
        ]);
        expect(extra.downloadSettings?.xhttpSettings?.path).to.equal(
            '/download',
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.network,
        ).to.equal('xhttp');
        expect(reparsed[0]).to.have.property('_extra_unsupported');
        expect(reparsed[0]._extra_unsupported).to.deep.equal({
            uplinkChunkSize: 'fast',
            xmux: {
                hKeepAlivePeriod: '9007199254740993',
            },
            downloadSettings: {
                tlsSettings: {
                    alpn: ['h2', { foo: 1 }],
                },
            },
        });
    });

    it('round-trips unsupported-only nested download settings with structured xhttp network', function () {
        const rawExtra = JSON.stringify({
            downloadSettings: {
                network: 'xhttp',
                sockopt: {
                    mark: 255,
                },
            },
        });
        const [parsed] = ProxyUtils.parse(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                rawExtra,
            )}#URI%20XHTTP%20Download%20Unsupported%20Only`,
        );
        expect(parsed['xhttp-opts']?.['download-settings']).to.deep.equal({
            network: 'xhttp',
        });
        expect(parsed._extra_unsupported).to.deep.equal({
            downloadSettings: {
                sockopt: {
                    mark: 255,
                },
            },
        });

        const output = produceExternal('URI', parsed);
        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings).to.deep.equal({
            network: 'xhttp',
            sockopt: {
                mark: 255,
            },
        });

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['download-settings']).to.deep.equal(
            {
                network: 'xhttp',
            },
        );
        expect(reparsed[0]._extra_unsupported).to.deep.equal({
            downloadSettings: {
                sockopt: {
                    mark: 255,
                },
            },
        });
    });

    it('keeps structured nested xhttp network out of mixed download settings sidecars', function () {
        const rawExtra = JSON.stringify({
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                },
                sockopt: {
                    mark: 255,
                },
            },
        });
        const [parsed] = ProxyUtils.parse(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                rawExtra,
            )}#URI%20XHTTP%20Download%20Mixed%20Sidecar`,
        );

        expect(parsed['xhttp-opts']?.['download-settings']).to.deep.equal({
            network: 'xhttp',
            server: 'download.example.com',
            port: 8443,
            tls: true,
            path: '/download',
        });
        expect(parsed._extra_unsupported).to.deep.equal({
            downloadSettings: {
                sockopt: {
                    mark: 255,
                },
            },
        });

        delete parsed['xhttp-opts']['download-settings'];

        const output = produceExternal('URI', parsed);
        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings).to.deep.equal({
            sockopt: {
                mark: 255,
            },
        });
    });

    it('round-trips invalid xhttp extra strings through _extra', function () {
        const rawExtra = '{bad';
        const [parsed] = ProxyUtils.parse(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                rawExtra,
            )}#URI%20XHTTP%20Invalid%20Extra`,
        );

        expect(parsed._extra).to.equal(rawExtra);

        const output = produceExternal('URI', parsed);
        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        expect(decodeURIComponent(encodedExtra)).to.equal(rawExtra);
    });

    it('normalizes structured xhttp xmux values when producing URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP XMUX',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'reuse-settings': {
                    'max-connections': '+0008',
                    'max-concurrency': '0008-0016',
                    'h-keep-alive-period': '+15',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    'reuse-settings': {
                        'h-max-request-times': '+0004-0008',
                        'h-keep-alive-period': -1,
                    },
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.xmux).to.deep.equal({
            maxConnections: '8',
            maxConcurrency: '8-16',
            hKeepAlivePeriod: 15,
        });
        expect(extra.downloadSettings?.xhttpSettings?.extra?.xmux).to.deep.equal(
            {
                hMaxRequestTimes: '4-8',
                hKeepAlivePeriod: -1,
            },
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['reuse-settings']).to.deep.equal({
            'max-connections': '8',
            'max-concurrency': '8-16',
            'h-keep-alive-period': 15,
        });
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'reuse-settings'
            ],
        ).to.deep.equal({
            'h-max-request-times': '4-8',
            'h-keep-alive-period': -1,
        });
    });

    it('produces URI VLESS xhttp links with structured scMinPostsIntervalMs', function () {
        const extra = JSON.stringify({
            noGRPCHeader: true,
            xPaddingBytes: '64-128',
            scMaxEachPostBytes: 1000000,
            scMinPostsIntervalMs: 300,
            xmux: {
                maxConnections: '8',
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Min Interval',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'no-grpc-header': true,
                'x-padding-bytes': '64-128',
                'sc-max-each-post-bytes': 1000000,
                'sc-min-posts-interval-ms': 300,
                'reuse-settings': {
                    'max-connections': '8',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Min%20Interval`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal(300);
    });

    it('produces URI VLESS xhttp links with extended structured extra fields', function () {
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
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
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
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Extended',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
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

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Extended`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.headers?.['X-Test']).to.equal('demo');
        expect(
            reparsed[0]['xhttp-opts']?.['reuse-settings']?.[
                'h-keep-alive-period'
            ],
        ).to.equal(15);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.headers?.[
                'X-Download'
            ],
        ).to.equal('1');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'uplink-chunk-size'
            ],
        ).to.equal(48);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'reuse-settings'
            ]?.['h-keep-alive-period'],
        ).to.equal(-1);
    });

    it('normalizes Mihomo leading-zero structured xhttp scalars when producing URI VLESS links', function () {
        const extra = JSON.stringify({
            scMaxEachPostBytes: 1000000,
            scMinPostsIntervalMs: 300,
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                    host: 'download-host.example.com',
                    scMaxEachPostBytes: 1000000,
                    scMinPostsIntervalMs: '0-300',
                },
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Leading Zero Scalars',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'sc-max-each-post-bytes': '000-1000000',
                'sc-min-posts-interval-ms': '0300',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    'sc-max-each-post-bytes': '000-1000000',
                    'sc-min-posts-interval-ms': '000-300',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Leading%20Zero%20Scalars`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['sc-max-each-post-bytes']).to.equal(
            1000000,
        );
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal(300);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-max-each-post-bytes'
            ],
        ).to.equal(1000000);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-min-posts-interval-ms'
            ],
        ).to.equal('0-300');
    });

    it('normalizes Mihomo explicit-plus structured xhttp scalars when producing URI VLESS links', function () {
        const extra = JSON.stringify({
            scMaxEachPostBytes: 1000000,
            scMinPostsIntervalMs: 300,
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                    host: 'download-host.example.com',
                    scMaxEachPostBytes: 1000000,
                    scMinPostsIntervalMs: '0-300',
                },
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Explicit Plus Scalars',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'sc-max-each-post-bytes': '+500000-+1000000',
                'sc-min-posts-interval-ms': '+300',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    'sc-max-each-post-bytes': '+0-+1000000',
                    'sc-min-posts-interval-ms': '+0-+300',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Explicit%20Plus%20Scalars`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['sc-max-each-post-bytes']).to.equal(
            1000000,
        );
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal(300);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-max-each-post-bytes'
            ],
        ).to.equal(1000000);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-min-posts-interval-ms'
            ],
        ).to.equal('0-300');
    });

    it('produces URI VLESS xhttp links from structured download settings', function () {
        const extra = JSON.stringify({
            noGRPCHeader: true,
            xPaddingBytes: '64-128',
            xmux: {
                maxConnections: '8',
            },
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
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
                    scMaxEachPostBytes: 1000000,
                    scMinPostsIntervalMs: 300,
                    extra: {
                        xmux: {
                            maxConcurrency: '16-32',
                        },
                    },
                },
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Download',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'no-grpc-header': true,
                'x-padding-bytes': '64-128',
                'reuse-settings': {
                    'max-connections': '8',
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
                    'sc-min-posts-interval-ms': 300,
                    'reuse-settings': {
                        'max-concurrency': '16-32',
                    },
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Download`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-max-each-post-bytes'
            ],
        ).to.equal(1000000);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-min-posts-interval-ms'
            ],
        ).to.equal(300);
    });

    it('normalizes structured xhttp uplinkChunkSize values when producing URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Uplink Chunk Size',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'uplink-chunk-size': '00064 - 00128',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    'uplink-chunk-size': '00048',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.uplinkChunkSize).to.equal('64-128');
        expect(extra.downloadSettings?.xhttpSettings?.uplinkChunkSize).to.equal(
            48,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['uplink-chunk-size']).to.equal(
            '64-128',
        );
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'uplink-chunk-size'
            ],
        ).to.equal(48);
    });

    it('preserves reality download settings TLS extras when producing URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Reality Download',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    servername: 'download-sni.example.com',
                    'client-fingerprint': 'chrome',
                    'skip-cert-verify': true,
                    alpn: ['h2', 'http/1.1'],
                    'ech-opts': {
                        enable: true,
                        config: 'ECHCONFIG',
                    },
                    'reality-opts': {
                        'public-key': 'pubkey',
                        'short-id': '08',
                    },
                    path: '/download',
                    host: 'download-host.example.com',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings?.network).to.equal('xhttp');
        expect(extra.downloadSettings?.security).to.equal('reality');
        expect(extra.downloadSettings?.tlsSettings).to.deep.equal({
            serverName: 'download-sni.example.com',
            fingerprint: 'chrome',
            allowInsecure: true,
            alpn: ['h2', 'http/1.1'],
            echConfigList: 'ECHCONFIG',
        });
        expect(extra.downloadSettings?.realitySettings).to.deep.equal({
            serverName: 'download-sni.example.com',
            fingerprint: 'chrome',
            publicKey: 'pubkey',
            shortId: '08',
        });

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.servername,
        ).to.equal('download-sni.example.com');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'client-fingerprint'
            ],
        ).to.equal('chrome');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'skip-cert-verify'
            ],
        ).to.equal(true);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.alpn,
        ).to.deep.equal(['h2', 'http/1.1']);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.['ech-opts']
                ?.config,
        ).to.equal('ECHCONFIG');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.['reality-opts'],
        ).to.deep.equal({
            'public-key': 'pubkey',
            'short-id': '08',
        });
    });

    it('skips URI VLESS exports when nested reality download settings are missing public keys', function () {
        const rawExtra = JSON.stringify({
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
        const parsed = ProxyUtils.parse(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                rawExtra,
            )}#URI%20XHTTP%20Invalid%20Reality%20Download`,
        );

        expect(parsed).to.have.length(1);
        expect(
            parsed[0]['xhttp-opts']?.['download-settings']?.['reality-opts'],
        ).to.deep.equal({});

        const output = ProxyUtils.produce(parsed, 'URI', 'external');
        expect(output).to.equal('');
    });

    it('skips URI VLESS exports when outer reality is valid but nested download reality is missing public keys', function () {
        const rawExtra = JSON.stringify({
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
        const parsed = ProxyUtils.parse(
            `vless://${UUID}@vless-xhttp.example.com:443?security=reality&pbk=outer-pub&sid=01&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                rawExtra,
            )}#URI%20XHTTP%20Mixed%20Reality`,
        );

        expect(parsed).to.have.length(1);
        expect(parsed[0]['reality-opts']).to.deep.equal({
            'public-key': 'outer-pub',
            'short-id': '01',
        });
        expect(
            parsed[0]['xhttp-opts']?.['download-settings']?.['reality-opts'],
        ).to.deep.equal({});

        const output = ProxyUtils.produce(parsed, 'URI', 'external');
        expect(output).to.equal('');
    });

    it('skips URI VLESS exports when xhttp stream-one is combined with download-settings', function () {
        const rawExtra = JSON.stringify({
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                },
            },
        });
        const parsed = ProxyUtils.parse(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-one&extra=${encodeURIComponent(
                rawExtra,
            )}#URI%20XHTTP%20Stream%20One%20Download`,
        );

        expect(parsed).to.have.length(1);
        expect(parsed[0]['xhttp-opts']?.mode).to.equal('stream-one');
        expect(parsed[0]['xhttp-opts']?.['download-settings']).to.deep.include({
            server: 'download.example.com',
            port: 8443,
            tls: true,
        });

        const output = ProxyUtils.produce(parsed, 'URI', 'external');
        expect(output).to.equal('');
    });

    it('uses nested download Host header when producing URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Download Host Header',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    headers: {
                        Host: 'download-host.example.com',
                        'X-Download': '1',
                    },
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings?.xhttpSettings?.host).to.equal(
            'download-host.example.com',
        );
        expect(extra.downloadSettings?.xhttpSettings?.headers).to.deep.equal({
            'X-Download': '1',
        });

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.host,
        ).to.equal('download-host.example.com');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.headers,
        ).to.deep.equal({
            'X-Download': '1',
        });
    });

    it('prefers explicit nested download host over nested download Host header when producing URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Download Host Precedence',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    headers: {
                        Host: 'ignored-header.example.com',
                        'X-Download': '1',
                    },
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings?.xhttpSettings?.host).to.equal(
            'download-host.example.com',
        );
        expect(extra.downloadSettings?.xhttpSettings?.headers).to.deep.equal({
            'X-Download': '1',
        });

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.host,
        ).to.equal('download-host.example.com');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.headers,
        ).to.deep.equal({
            'X-Download': '1',
        });
    });

    it('normalizes structured xhttp range-form scalars when producing URI VLESS links', function () {
        const extra = JSON.stringify({
            noGRPCHeader: true,
            xPaddingBytes: '64-128',
            scMaxEachPostBytes: 1000000,
            scMinPostsIntervalMs: '0-300',
            xmux: {
                maxConnections: '8',
            },
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                    host: 'download-host.example.com',
                    scMaxEachPostBytes: 1000000,
                    scMinPostsIntervalMs: '0-300',
                    extra: {
                        xmux: {
                            maxConcurrency: '16-32',
                        },
                    },
                },
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Range Scalars',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'no-grpc-header': true,
                'x-padding-bytes': '64-128',
                'sc-max-each-post-bytes': '0-1000000',
                'sc-min-posts-interval-ms': '0-300',
                'reuse-settings': {
                    'max-connections': '8',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    'sc-max-each-post-bytes': '500000 - 1000000',
                    'sc-min-posts-interval-ms': '0 - 300',
                    'reuse-settings': {
                        'max-concurrency': '16-32',
                    },
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Range%20Scalars`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['sc-max-each-post-bytes']).to.equal(
            1000000,
        );
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal('0-300');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-max-each-post-bytes'
            ],
        ).to.equal(1000000);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-min-posts-interval-ms'
            ],
        ).to.equal('0-300');
    });

    it('does not truncate malformed nested download port strings when producing URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Invalid Download Port',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: '8443foo',
                    tls: true,
                    path: '/download',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings).to.not.have.property('port');
        expect(extra.downloadSettings).to.deep.equal({
            address: 'download.example.com',
            network: 'xhttp',
            security: 'tls',
            xhttpSettings: {
                path: '/download',
            },
        });

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('port');
        expect(reparsed[0]['xhttp-opts']?.['download-settings']).to.deep.equal({
            server: 'download.example.com',
            network: 'xhttp',
            tls: true,
            path: '/download',
        });
    });

    it('drops invalid structured xhttp scalars when producing URI VLESS links', function () {
        const extra = JSON.stringify({
            noGRPCHeader: true,
            xPaddingBytes: '64-128',
            xmux: {
                maxConnections: '8',
            },
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                    host: 'download-host.example.com',
                    noGRPCHeader: true,
                    xPaddingBytes: '32-64',
                    extra: {
                        xmux: {
                            maxConcurrency: '16-32',
                        },
                    },
                },
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Invalid Scalars',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'no-grpc-header': true,
                'x-padding-bytes': '64-128',
                'sc-max-each-post-bytes': '9007199254740993',
                'sc-min-posts-interval-ms': 0,
                'uplink-chunk-size': '64-fast',
                'reuse-settings': {
                    'max-connections': '8',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    'no-grpc-header': true,
                    'x-padding-bytes': '32-64',
                    'sc-max-each-post-bytes': '1-9007199254740993',
                    'sc-min-posts-interval-ms': 'fast',
                    'uplink-chunk-size': 'fast',
                    'reuse-settings': {
                        'max-concurrency': '16-32',
                    },
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Invalid%20Scalars`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']).to.not.have.property(
            'sc-max-each-post-bytes',
        );
        expect(reparsed[0]['xhttp-opts']).to.not.have.property(
            'sc-min-posts-interval-ms',
        );
        expect(reparsed[0]['xhttp-opts']).to.not.have.property(
            'uplink-chunk-size',
        );
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('sc-max-each-post-bytes');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('sc-min-posts-interval-ms');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('uplink-chunk-size');
    });

    it('omits top-level URI xhttp extra when only invalid structured scalars remain', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Invalid Scalars Only',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'sc-max-each-post-bytes': '9007199254740993',
                'sc-min-posts-interval-ms': 0,
                'uplink-chunk-size': 'fast',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up#URI%20XHTTP%20Invalid%20Scalars%20Only`,
        );
        expect(output).to.not.include('&extra=');
    });

    it('omits nested xhttp download settings when only invalid structured scalars remain', function () {
        const extra = JSON.stringify({
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
            },
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Invalid Download Scalars Only',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    'sc-max-each-post-bytes': '1-9007199254740993',
                    'sc-min-posts-interval-ms': 'fast',
                    'uplink-chunk-size': 'fast',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Invalid%20Download%20Scalars%20Only`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('sc-max-each-post-bytes');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('sc-min-posts-interval-ms');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('path');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('host');
    });

    it('produces URI Trojan websocket links with pcs from tls fingerprint', function () {
        const output = produceExternal('URI', {
            type: 'trojan',
            name: 'URI Trojan PCS',
            server: 'trojan.example.com',
            port: 443,
            password: 'secret',
            tls: true,
            sni: 'sni.example.com',
            'tls-fingerprint': 'fingerprint',
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            'trojan://secret@trojan.example.com:443?sni=sni.example.com&type=ws&path=%2Fws&host=cdn.example.com&pcs=fingerprint#URI%20Trojan%20PCS',
        );
    });

    it('produces V2Ray exports as base64 encoded URI lists', function () {
        const output = produceExternal('V2Ray', {
            type: 'vless',
            name: 'URI Reality',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
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
        });

        expect(Base64.decode(output)).to.equal(
            `vless://${UUID}@vless.example.com:443?security=reality&type=ws&path=%2Fws&host=cdn.example.com&sni=sni.example.com&flow=xtls-rprx-vision&sid=08&pbk=pubkey#URI%20Reality`,
        );
    });
});
