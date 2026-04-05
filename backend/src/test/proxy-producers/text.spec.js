import { expect } from 'chai';
import { Base64 } from 'js-base64';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import { produceExternal, UUID } from './helpers';

describe('Proxy text producers', function () {
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

    it('produces URI shadowsocks links with v2ray-plugin mux and tls flags', function () {
        const plugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;sni=sni.example.com;skip-cert-verify=true;mux=0',
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
            'v2ray-plugin;obfs=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;mux=1',
        );
        const muxOffPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;mux=0',
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
            'v2ray-plugin;obfs=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;mux=1',
        );
        const muxOffPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;mux=0',
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
            'v2ray-plugin;obfs=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;tls;mux=1',
        );
        const muxOffPlugin = encodeURIComponent(
            'v2ray-plugin;obfs=websocket;obfs-host=cdn.example.com;host=cdn.example.com;path=/socket;mux=0',
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
            `vless://${UUID}@vless.example.com:443?security=reality&type=ws&path=%2Fws&host=cdn.example.com&alpn=h2&sni=sni.example.com&fp=chrome&flow=xtls-rprx-vision&sid=08&spx=%2Fspider&pbk=pubkey#URI%20Reality`,
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
            _extra: extra,
            'xhttp-opts': {
                path: '/xhttp',
                headers: {
                    Host: 'cdn.example.com',
                },
                mode: 'stream-up',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(extra)}#URI%20XHTTP`,
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
