import { expect } from 'chai';
import { Base64 } from 'js-base64';
import { describe, it } from 'mocha';

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
