import { expect } from 'chai';
import { Base64 } from 'js-base64';
import { describe, it } from 'mocha';

import $ from '@/core/app';
import { ProxyUtils } from '@/core/proxy-utils';
import QX_Producer from '@/core/proxy-utils/producers/qx';
import { produceExternal, UUID } from './helpers';

function captureWarns(fn) {
    const originalWarn = $.warn;
    const warnings = [];
    $.warn = (message) => warnings.push(message);
    try {
        const result = fn();
        return { result, warnings };
    } finally {
        $.warn = originalWarn;
    }
}

function captureErrors(fn) {
    const originalError = $.error;
    const errors = [];
    $.error = (message) => errors.push(message);
    try {
        const result = fn();
        return { result, errors };
    } finally {
        $.error = originalError;
    }
}

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

    it('produces Loon VMess, Trojan, and AnyTLS reality lines', function () {
        const output = produceExternal('Loon', [
            {
                type: 'vmess',
                name: 'Loon VMess Reality',
                server: 'vmess.example.com',
                port: 443,
                cipher: 'auto',
                uuid: UUID,
                alterId: 0,
                tls: true,
                sni: 'sni.example.com',
                'reality-opts': {
                    'public-key': 'vmess-pubkey',
                    'short-id': '01',
                },
                'skip-cert-verify': true,
            },
            {
                type: 'trojan',
                name: 'Loon Trojan Reality',
                server: 'trojan.example.com',
                port: 443,
                password: 'secret',
                sni: 'sni.example.com',
                'reality-opts': {
                    'public-key': 'trojan-pubkey',
                    'short-id': '02',
                },
                'skip-cert-verify': true,
            },
            {
                type: 'anytls',
                name: 'Loon AnyTLS Reality',
                server: 'anytls.example.com',
                port: 443,
                password: 'secret',
                network: 'tcp',
                sni: 'sni.example.com',
                'reality-opts': {
                    'public-key': 'anytls-pubkey',
                    'short-id': '03',
                },
                'skip-cert-verify': true,
            },
        ]);

        expect(output).to.equal(
            [
                `Loon VMess Reality=vmess,vmess.example.com,443,auto,"${UUID}",transport=tcp,over-tls=true,skip-cert-verify=true,sni=sni.example.com,public-key="vmess-pubkey",short-id=01,alterId=0`,
                'Loon Trojan Reality=trojan,trojan.example.com,443,"secret",skip-cert-verify=true,sni=sni.example.com,public-key="trojan-pubkey",short-id=02',
                'Loon AnyTLS Reality=anytls,anytls.example.com,443,"secret",skip-cert-verify=true,sni=sni.example.com,public-key="anytls-pubkey",short-id=03',
            ].join('\n'),
        );
    });

    it('produces Loon Shadowsocks 2022 simple obfs lines', function () {
        const output = produceExternal('Loon', [
            {
                type: 'ss',
                name: 'Loon SS2022 HTTP Obfs',
                server: 'ss2022-http.example.com',
                port: 8388,
                cipher: '2022-blake3-aes-128-gcm',
                password: 'server-key:user-key',
                plugin: 'obfs',
                'plugin-opts': {
                    mode: 'http',
                    host: 'obfs.example.com',
                    path: '/',
                },
            },
            {
                type: 'ss',
                name: 'Loon SS2022 TLS Obfs',
                server: 'ss2022-tls.example.com',
                port: 8389,
                cipher: '2022-blake3-aes-256-gcm',
                password: 'server-key:user-key',
                plugin: 'obfs',
                'plugin-opts': {
                    mode: 'tls',
                    host: 'tls.example.com',
                    path: '/tls',
                },
            },
        ]);

        expect(output).to.equal(
            [
                'Loon SS2022 HTTP Obfs=shadowsocks,ss2022-http.example.com,8388,2022-blake3-aes-128-gcm,"server-key:user-key",obfs-name=http,obfs-host=obfs.example.com,obfs-uri=/',
                'Loon SS2022 TLS Obfs=shadowsocks,ss2022-tls.example.com,8389,2022-blake3-aes-256-gcm,"server-key:user-key",obfs-name=tls,obfs-host=tls.example.com,obfs-uri=/tls',
            ].join('\n'),
        );
    });

    it('produces Loon Shadowsocks Shadow TLS passwords without quotes', function () {
        const output = produceExternal('Loon', [
            {
                type: 'ss',
                name: 'Loon SS ShadowTLS Plugin A',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'chacha20-ietf-poly1305',
                password: 'ss-pass',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    password: 'dzUjK3l+mXO/xxx=',
                    host: 'p11.douyinpic.com',
                    version: 3,
                },
                udp: true,
            },
            {
                type: 'ss',
                name: 'Loon SS ShadowTLS Plugin',
                server: 'ss-plugin.example.com',
                port: 8388,
                cipher: 'chacha20-ietf-poly1305',
                password: 'ss-pass',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    password: 'plugin-shadow-pass',
                    host: 'mask.example.com',
                    version: 3,
                },
            },
        ]);

        expect(output).to.equal(
            [
                'Loon SS ShadowTLS Plugin A=shadowsocks,ss.example.com,8388,chacha20-ietf-poly1305,"ss-pass",shadow-tls-password=dzUjK3l+mXO/xxx=,shadow-tls-sni=p11.douyinpic.com,shadow-tls-version=3,udp=true',
                'Loon SS ShadowTLS Plugin=shadowsocks,ss-plugin.example.com,8388,chacha20-ietf-poly1305,"ss-pass",shadow-tls-password=plugin-shadow-pass,shadow-tls-sni=mask.example.com,shadow-tls-version=3',
            ].join('\n'),
        );
    });

    it('prefers plugin-scoped Loon shadow-tls alpn over top-level alpn', function () {
        const output = produceExternal('Loon', {
            type: 'ss',
            name: 'Loon ShadowTLS ALPN',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'chacha20-ietf-poly1305',
            password: 'ss-pass',
            plugin: 'shadow-tls',
            alpn: ['ignored.example'],
            'plugin-opts': {
                password: 'shadow-pass',
                host: 'mask.example.com',
                version: 3,
                alpn: ['http/1.1', 'h2'],
            },
        });

        expect(output).to.equal(
            'Loon ShadowTLS ALPN=shadowsocks,ss.example.com,8388,chacha20-ietf-poly1305,"ss-pass",shadow-tls-password=shadow-pass,shadow-tls-sni=mask.example.com,shadow-tls-version=3,alpn="http/1.1,h2"',
        );
    });

    it('emits Loon tls-profile for shadow-tls outputs', function () {
        const output = produceExternal('Loon', {
            type: 'ss',
            name: 'Loon ShadowTLS TLS Profile',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'chacha20-ietf-poly1305',
            password: 'ss-pass',
            plugin: 'shadow-tls',
            _loon_tls_profile: 'ios26',
            'plugin-opts': {
                password: 'shadow-pass',
                host: 'mask.example.com',
                version: 3,
            },
        });

        expect(output).to.equal(
            'Loon ShadowTLS TLS Profile=shadowsocks,ss.example.com,8388,chacha20-ietf-poly1305,"ss-pass",shadow-tls-password=shadow-pass,shadow-tls-sni=mask.example.com,shadow-tls-version=3,tls-profile=ios26',
        );
    });

    it('emits Loon tls-profile and alpn for TLS protocol outputs', function () {
        const alpn = ['http/1.1', 'h2', 'h3'];
        const output = produceExternal('Loon', [
            {
                type: 'vmess',
                name: 'Loon VMess TLS',
                server: 'vmess.example.com',
                port: 443,
                cipher: 'auto',
                uuid: UUID,
                alterId: 0,
                tls: true,
                sni: 'sni.example.com',
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'vless',
                name: 'Loon VLESS TLS',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.example.com',
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'vless',
                name: 'Loon VLESS Reality',
                server: 'vless-reality.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.example.com',
                flow: 'xtls-rprx-vision',
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'vless',
                name: 'Loon VLESS XTLS',
                server: 'vless-xtls.example.com',
                port: 443,
                uuid: UUID,
                flow: 'xtls-rprx-vision',
                sni: 'sni.example.com',
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'trojan',
                name: 'Loon Trojan TLS',
                server: 'trojan.example.com',
                port: 443,
                password: 'secret',
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'anytls',
                name: 'Loon AnyTLS Profile',
                server: 'anytls.example.com',
                port: 443,
                password: 'secret',
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'http',
                name: 'Loon HTTPS Profile',
                server: 'https.example.com',
                port: 443,
                tls: true,
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'socks5',
                name: 'Loon SOCKS TLS',
                server: 'socks.example.com',
                port: 1080,
                tls: true,
                'client-fingerprint': 'chrome',
                alpn,
            },
            {
                type: 'hysteria2',
                name: 'Loon Hysteria2 Profile',
                server: 'hy2.example.com',
                port: 443,
                password: 'secret',
                'client-fingerprint': 'chrome',
                alpn,
            },
        ]);

        expect(output.match(/tls-profile=chrome/g)).to.have.length(9);
        expect(output.match(/alpn="http\/1\.1,h2,h3"/g)).to.have.length(9);
    });

    it('selects Loon tls-profile before client fingerprint fallback', function () {
        const buildTrojan = (name, fields) => ({
            type: 'trojan',
            name,
            server: `${name.toLowerCase().replace(/\s+/g, '-')}.example.com`,
            port: 443,
            password: 'secret',
            ...fields,
        });
        const output = produceExternal('Loon', [
            buildTrojan('Loon Source IOS18', {
                _loon_tls_profile: 'ios18',
                'client-fingerprint': 'ios',
            }),
            buildTrojan('Loon Source Default', {
                _loon_tls_profile: 'default',
                'client-fingerprint': 'chrome',
            }),
            buildTrojan('Loon Source Chrome', {
                _loon_tls_profile: 'chrome',
                'client-fingerprint': 'ios',
            }),
            buildTrojan('Loon Fallback Chrome', {
                'client-fingerprint': 'chrome',
            }),
            buildTrojan('Loon Fallback IOS', {
                'client-fingerprint': 'ios',
            }),
        ]);

        expect(output).to.include('Loon Source IOS18=trojan');
        expect(output).to.include('tls-profile=ios18');
        expect(output).to.include('tls-profile=default');
        expect(output).to.include('tls-profile=chrome');
        expect(output).to.include('tls-profile=ios26');
        expect(output.match(/tls-profile=/g)).to.have.length(5);
    });

    it('omits invalid Loon tls-profile fallback values', function () {
        const buildTrojan = (fingerprint) => ({
            type: 'trojan',
            name: `Loon ${fingerprint || 'Blank'} Profile`,
            server: 'trojan-profile.example.com',
            port: 443,
            password: 'secret',
            'client-fingerprint': fingerprint,
        });
        const output = produceExternal('Loon', [
            buildTrojan('default'),
            buildTrojan('ios18'),
            buildTrojan('ios26'),
            buildTrojan('firefox'),
            buildTrojan('random'),
            buildTrojan('chrome120'),
            buildTrojan(''),
        ]);

        expect(output).to.not.include('tls-profile=');
    });

    it('omits Loon tls-profile for non-TLS outputs and empty fingerprints', function () {
        const output = produceExternal('Loon', [
            {
                type: 'http',
                name: 'Loon HTTP Plain',
                server: 'http.example.com',
                port: 80,
                'client-fingerprint': 'chrome',
                alpn: ['http/1.1', 'h2'],
            },
            {
                type: 'socks5',
                name: 'Loon SOCKS Plain',
                server: 'socks.example.com',
                port: 1080,
                'client-fingerprint': 'chrome',
                alpn: ['http/1.1', 'h2'],
            },
            {
                type: 'vmess',
                name: 'Loon VMess Plain',
                server: 'vmess.example.com',
                port: 80,
                cipher: 'auto',
                uuid: UUID,
                alterId: 0,
                'client-fingerprint': 'chrome',
                alpn: ['http/1.1', 'h2'],
            },
            {
                type: 'vless',
                name: 'Loon VLESS Plain',
                server: 'vless.example.com',
                port: 80,
                uuid: UUID,
                'client-fingerprint': 'chrome',
                alpn: ['http/1.1', 'h2'],
            },
            {
                type: 'trojan',
                name: 'Loon Trojan Empty Profile',
                server: 'trojan-empty.example.com',
                port: 443,
                password: 'secret',
                'client-fingerprint': '',
            },
        ]);

        expect(output).to.not.include('tls-profile=');
        expect(output).to.not.include('alpn=');
    });

    it('produces Loon Hysteria2 lines with port hopping', function () {
        const output = produceExternal('Loon', {
            type: 'hysteria2',
            name: 'Loon Hysteria2',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            ports: '1000,2000-3000,5000',
            'hop-interval': 30,
            sni: 'peer.example.com',
            'skip-cert-verify': true,
        });

        expect(output).to.equal(
            'Loon Hysteria2=Hysteria2,hy2.example.com,443,"secret",server-ports="1000,2000-3000,5000",hop-interval=30,tls-name=peer.example.com,skip-cert-verify=true',
        );
    });

    it('does not emit empty Loon Hysteria2 port hopping fields', function () {
        const output = produceExternal('Loon', {
            type: 'hysteria2',
            name: 'Loon Hysteria2 Plain',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            ports: '',
            'hop-interval': '   ',
            sni: 'peer.example.com',
            'skip-cert-verify': true,
        });

        expect(output).to.equal(
            'Loon Hysteria2 Plain=Hysteria2,hy2.example.com,443,"secret",tls-name=peer.example.com,skip-cert-verify=true',
        );
    });

    it('exports URI Hysteria2 port hopping nodes to Loon fields', function () {
        const [proxy] = ProxyUtils.parse(
            'hy2://secret@hy2.example.com:443?mport=1000,2000-3000,5000&hop-interval=30#URI%20Hysteria2',
        );
        const output = produceExternal('Loon', proxy);

        expect(output).to.equal(
            'URI Hysteria2=Hysteria2,hy2.example.com,443,"secret",server-ports="1000,2000-3000,5000",hop-interval=30,tls-name=hy2.example.com,skip-cert-verify=false,fast-open=false',
        );
    });

    it('emits quoted Surge alpn for TLS protocol outputs', function () {
        const alpn = ['http/1.1', 'h2', 'h3'];
        const output = produceExternal('Surge', [
            {
                type: 'vmess',
                name: 'Surge VMess ALPN',
                server: 'vmess-alpn.example.com',
                port: 443,
                cipher: 'auto',
                uuid: UUID,
                alterId: 0,
                tls: true,
                alpn,
            },
            {
                type: 'trojan',
                name: 'Surge Trojan ALPN',
                server: 'trojan-alpn.example.com',
                port: 443,
                password: 'secret',
                alpn,
            },
            {
                type: 'http',
                name: 'Surge HTTPS ALPN',
                server: 'https-alpn.example.com',
                port: 443,
                tls: true,
                alpn,
            },
            {
                type: 'h2-connect',
                name: 'Surge H2 ALPN',
                server: 'h2-alpn.example.com',
                port: 443,
                alpn,
            },
            {
                type: 'socks5',
                name: 'Surge SOCKS5 ALPN',
                server: 'socks-alpn.example.com',
                port: 1080,
                tls: true,
                alpn,
            },
            {
                type: 'anytls',
                name: 'Surge AnyTLS ALPN',
                server: 'anytls-alpn.example.com',
                port: 443,
                password: 'secret',
                alpn,
            },
            {
                type: 'trusttunnel',
                name: 'Surge TrustTunnel ALPN',
                server: 'trust-alpn.example.com',
                port: 443,
                alpn,
            },
            {
                type: 'tuic',
                name: 'Surge TUIC ALPN',
                server: 'tuic-alpn.example.com',
                port: 443,
                uuid: UUID,
                password: 'secret',
                alpn,
            },
            {
                type: 'hysteria2',
                name: 'Surge Hysteria2 ALPN',
                server: 'hy2-alpn.example.com',
                port: 443,
                password: 'secret',
                alpn,
            },
        ]);

        expect(output.match(/alpn="http\/1\.1,h2,h3"/g)).to.have.length(9);
    });

    it('omits Surge alpn for non-TLS outputs', function () {
        const output = produceExternal('Surge', [
            {
                type: 'vmess',
                name: 'Surge VMess Plain ALPN',
                server: 'vmess-plain-alpn.example.com',
                port: 80,
                uuid: UUID,
                alterId: 0,
                alpn: ['http/1.1', 'h2'],
            },
            {
                type: 'http',
                name: 'Surge HTTP Plain ALPN',
                server: 'http-plain-alpn.example.com',
                port: 80,
                alpn: ['http/1.1', 'h2'],
            },
            {
                type: 'socks5',
                name: 'Surge SOCKS5 Plain ALPN',
                server: 'socks-plain-alpn.example.com',
                port: 1080,
                alpn: ['http/1.1', 'h2'],
            },
        ]);

        expect(output).to.not.include('alpn=');
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
            `Surge TUIC=tuic-v5,tuic.example.com,443,uuid=${UUID},password="secret",port-hopping="9000;9002-9004",sni="sni.example.com",alpn="h3",skip-cert-verify=true,ecn=true`,
        );
    });

    it('does not emit empty Surge port hopping fields', function () {
        const output = produceExternal('Surge', [
            {
                type: 'tuic',
                name: 'Surge TUIC Plain',
                server: 'tuic.example.com',
                port: 443,
                uuid: UUID,
                password: 'secret',
                ports: '',
                'hop-interval': '   ',
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                alpn: ['h3'],
            },
            {
                type: 'hysteria2',
                name: 'Surge Hysteria2 Plain',
                server: 'hy2.example.com',
                port: 443,
                password: 'secret',
                ports: '',
                'hop-interval': '   ',
                sni: 'peer.example.com',
                'skip-cert-verify': true,
            },
        ]);

        expect(output).to.equal(
            `Surge TUIC Plain=tuic-v5,tuic.example.com,443,uuid=${UUID},password="secret",sni="sni.example.com",alpn="h3",skip-cert-verify=true\nSurge Hysteria2 Plain=hysteria2,hy2.example.com,443,password="secret",sni="peer.example.com",skip-cert-verify=true`,
        );
    });

    it('produces Surge Hysteria2 lines with port hopping', function () {
        const output = produceExternal('Surge', {
            type: 'hysteria2',
            name: 'Surge Hysteria2',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            ports: '8443,8445-8447',
            'hop-interval': 30,
            sni: 'peer.example.com',
            'skip-cert-verify': true,
            down: '100 Mbps',
        });

        expect(output).to.equal(
            'Surge Hysteria2=hysteria2,hy2.example.com,443,password="secret",port-hopping="8443;8445-8447",port-hopping-interval=30,sni="peer.example.com",skip-cert-verify=true,download-bandwidth=100',
        );
    });

    it('produces Surge Hysteria2 gecko obfs lines', function () {
        const output = produceExternal('Surge', {
            type: 'hysteria2',
            name: 'Surge Hysteria2 Gecko',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            obfs: 'gecko',
            'obfs-password': 'mask',
        });

        expect(output).to.equal(
            'Surge Hysteria2 Gecko=hysteria2,hy2.example.com,443,password="secret",gecko-password="mask"',
        );
    });

    it('produces Surge Snell v6 and filters v6 obfs', function () {
        const { result: output, errors } = captureErrors(() =>
            ProxyUtils.produce(
                [
                    {
                        type: 'snell',
                        name: 'Surge Snell v6',
                        server: 'snell.example.com',
                        port: 443,
                        psk: 'secret',
                        version: 6,
                        mode: 'unsafe-raw',
                        udp: true,
                    },
                    {
                        type: 'snell',
                        name: 'Surge Snell v5 Mode',
                        server: 'snell.example.com',
                        port: 443,
                        psk: 'secret',
                        version: 5,
                        mode: 'unshaped',
                        udp: true,
                    },
                    {
                        type: 'snell',
                        name: 'Surge Snell v6 Obfs',
                        server: 'snell.example.com',
                        port: 443,
                        psk: 'secret',
                        version: 6,
                        udp: true,
                        'obfs-opts': {
                            mode: 'tls',
                            host: 'obfs.example.com',
                            path: '/snell',
                        },
                    },
                ],
                'Surge',
                'external',
            ),
        );

        expect(output).to.equal(
            [
                'Surge Snell v6=snell,snell.example.com,443,version=6,psk="secret",mode=unsafe-raw,udp-relay=true',
                'Surge Snell v5 Mode=snell,snell.example.com,443,version=5,psk="secret",udp-relay=true',
            ].join('\n'),
        );
        expect(errors).to.deep.equal([
            'Platform Surge does not support Snell version 6 with obfs',
        ]);
    });

    it('prefers plugin-scoped Surge shadow-tls alpn over top-level alpn', function () {
        const output = produceExternal('Surge', {
            type: 'snell',
            name: 'Surge Snell ShadowTLS ALPN',
            server: 'snell.example.com',
            port: 443,
            psk: 'secret',
            version: 5,
            plugin: 'shadow-tls',
            alpn: ['ignored.example'],
            'plugin-opts': {
                password: 'shadow-pass',
                host: 'mask.example.com',
                version: 3,
                alpn: ['http/1.1', 'h2'],
            },
        });

        expect(output).to.equal(
            'Surge Snell ShadowTLS ALPN=snell,snell.example.com,443,version=5,psk="secret",shadow-tls-password="shadow-pass",shadow-tls-sni=mask.example.com,shadow-tls-version=3,alpn="http/1.1,h2"',
        );
    });

    it('omits Surge TLS-only params for plain HTTP, SOCKS5, and VMess nodes', function () {
        const cases = [
            {
                type: 'http',
                name: 'Surge HTTP Plain TLS Params',
                server: 'http.example.com',
                port: 80,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'tls-fingerprint': 'SHA256:FINGERPRINT',
                'client-cert': 'client-cert',
            },
            {
                type: 'socks5',
                name: 'Surge Socks5 Plain TLS Params',
                server: 'socks.example.com',
                port: 1080,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'tls-fingerprint': 'SHA256:FINGERPRINT',
                'client-cert': 'client-cert',
            },
            {
                type: 'vmess',
                name: 'Surge VMess Plain TLS Params',
                server: 'vmess.example.com',
                port: 80,
                uuid: UUID,
                alterId: 0,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'tls-fingerprint': 'SHA256:FINGERPRINT',
                'client-cert': 'client-cert',
            },
        ];

        for (const proxy of cases) {
            const output = produceExternal('Surge', proxy);

            expect(output, proxy.name).to.not.include(',sni=');
            expect(output, proxy.name).to.not.include(',skip-cert-verify=');
            expect(output, proxy.name).to.not.include(
                ',server-cert-fingerprint-sha256=',
            );
            expect(output, proxy.name).to.not.include(',client-cert=');
        }
    });

    it('quotes Surge SSH private-key and TLS client-cert keystore values', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'ssh',
                    name: 'Surge SSH Key',
                    server: 'ssh.example.com',
                    port: 22,
                    username: 'user',
                    'keystore-private-key': "'ssh-key'",
                },
                {
                    type: 'http',
                    name: 'Surge HTTPS Client Cert',
                    server: 'https.example.com',
                    port: 443,
                    tls: true,
                    'keystore-client-cert': "'client-cert'",
                },
            ],
            'Surge',
            'external',
        );

        expect(output.split('\n')).to.deep.equal([
            'Surge SSH Key=ssh,ssh.example.com,22,username="user",private-key="ssh-key"',
            'Surge HTTPS Client Cert=https,https.example.com,443,client-cert="client-cert"',
        ]);
    });

    it('produces Surge root headers for HTTP, HTTPS, HTTP/2 CONNECT, and TrustTunnel', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'http',
                    name: 'Surge HTTP Headers',
                    server: 'http.example.com',
                    port: 8080,
                    username: 'user',
                    password: 'pass',
                    headers: {
                        'X-Client': 'Surge',
                        'X-Token': 'abc',
                    },
                },
                {
                    type: 'http',
                    name: 'Surge HTTPS Headers',
                    server: 'https.example.com',
                    port: 443,
                    tls: true,
                    sni: 'sni.example.com',
                    headers: {
                        'X-Padding': '<random-string(16)>',
                    },
                },
                {
                    type: 'h2-connect',
                    name: 'Surge H2 Headers',
                    server: 'h2.example.com',
                    port: 443,
                    tls: true,
                    sni: 'sni.example.com',
                    headers: {
                        'X-Padding': '<random-string(16-32)>',
                    },
                },
                {
                    type: 'trusttunnel',
                    name: 'Surge Trust Headers',
                    server: 'trust.example.com',
                    port: 443,
                    username: 'user',
                    password: 'pass',
                    headers: {
                        'X-Client': 'Surge',
                    },
                    sni: 'sni.example.com',
                },
            ],
            'Surge',
            'external',
        );

        expect(output.split('\n')).to.deep.equal([
            `Surge HTTP Headers=http,http.example.com,8080,username="user",password="pass",headers="X-Client:"Surge";X-Token:"abc""`,
            `Surge HTTPS Headers=https,https.example.com,443,headers="X-Padding:"<random-string(16)>"",sni="sni.example.com"`,
            `Surge H2 Headers=h2-connect,h2.example.com,443,headers="X-Padding:"<random-string(16-32)>"",sni="sni.example.com"`,
            `Surge Trust Headers=trust-tunnel,trust.example.com,443,username="user",password="pass",headers="X-Client:"Surge"",sni="sni.example.com"`,
        ]);
    });

    it('produces Surge max-streams for HTTP/2 CONNECT and TrustTunnel', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'h2-connect',
                    name: 'Surge H2 Max Streams',
                    server: 'h2.example.com',
                    port: 443,
                    tls: true,
                    sni: 'sni.example.com',
                    headers: {
                        'X-Padding': '<random-string(16-32)>',
                    },
                    'max-streams': 1,
                },
                {
                    type: 'trusttunnel',
                    name: 'Surge Trust Max Streams',
                    server: 'trust.example.com',
                    port: 443,
                    username: 'user',
                    password: 'pass',
                    headers: {
                        'X-Client': 'Surge',
                    },
                    'max-streams': 3,
                    sni: 'sni.example.com',
                },
            ],
            'Surge',
            'external',
        );

        expect(output.split('\n')).to.deep.equal([
            `Surge H2 Max Streams=h2-connect,h2.example.com,443,headers="X-Padding:"<random-string(16-32)>"",max-streams=1,sni="sni.example.com"`,
            `Surge Trust Max Streams=trust-tunnel,trust.example.com,443,username="user",password="pass",headers="X-Client:"Surge"",max-streams=3,sni="sni.example.com"`,
        ]);
    });

    it('warns when Surge max-streams is greater than 3', function () {
        const { result: output, warnings } = captureWarns(() =>
            ProxyUtils.produce(
                [
                    {
                        type: 'h2-connect',
                        name: 'Surge H2 High Max Streams',
                        server: 'h2.example.com',
                        port: 443,
                        tls: true,
                        'max-streams': 4,
                    },
                    {
                        type: 'trusttunnel',
                        name: 'Surge Trust High Max Streams',
                        server: 'trust.example.com',
                        port: 443,
                        tls: true,
                        'max-streams': 5,
                    },
                ],
                'Surge',
                'external',
            ),
        );

        expect(output.split('\n')).to.deep.equal([
            'Surge H2 High Max Streams=h2-connect,h2.example.com,443,max-streams=4',
            'Surge Trust High Max Streams=trust-tunnel,trust.example.com,443,max-streams=5',
        ]);
        expect(warnings).to.have.length(2);
        expect(warnings[0]).to.include('max-streams=4');
        expect(warnings[0]).to.include('greater than 3');
        expect(warnings[0]).to.include('performance');
        expect(warnings[1]).to.include('max-streams=5');
        expect(warnings[1]).to.include('greater than 3');
        expect(warnings[1]).to.include('performance');
    });

    it('round-trips Surge max-streams for HTTP/2 CONNECT and TrustTunnel', function () {
        const proxies = ProxyUtils.parse(
            [
                'Surge H2 Round Trip = h2-connect,h2.example.com,443,headers=X-Padding:<random-string(16-32)>,max-streams=1,sni=sni.example.com',
                'Surge Trust Round Trip = trust-tunnel,trust.example.com,443,username=user,password=pass,headers=X-Client:Surge,max-streams="3",sni=sni.example.com',
            ].join('\n'),
        );
        const output = ProxyUtils.produce(proxies, 'Surge', 'external');

        expect(output.split('\n')).to.deep.equal([
            `Surge H2 Round Trip=h2-connect,h2.example.com,443,headers="X-Padding:"<random-string(16-32)>"",max-streams=1,sni="sni.example.com"`,
            `Surge Trust Round Trip=trust-tunnel,trust.example.com,443,username="user",password="pass",headers="X-Client:"Surge"",max-streams=3,sni="sni.example.com"`,
        ]);
    });

    it('round-trips Surge root headers with nested quotes and separators', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'http',
                    name: 'Surge Nested Headers',
                    server: 'nested.example.com',
                    port: 443,
                    tls: true,
                    sni: 'sni.example.com',
                    headers: {
                        Host: 'nested.example.com',
                        'X-Comma': 'a,b',
                        'User-Agent': 'client/1.0 (Linux; U; Android 11)',
                        'X-Quote': 'a",b',
                        'X-Backslash': 'c\\d',
                    },
                },
            ],
            'Surge',
            'external',
        );

        const [proxy] = ProxyUtils.parse(output);

        expect(proxy.headers).to.deep.equal({
            Host: 'nested.example.com',
            'X-Comma': 'a,b',
            'User-Agent': 'client/1.0 (Linux; U; Android 11)',
            'X-Quote': 'a",b',
            'X-Backslash': 'c\\d',
        });
        expect(output).to.include(String.raw`X-Quote:"a",b"`);
        expect(output).to.include(String.raw`X-Backslash:"c\d"`);
        expect(proxy.sni).to.equal('sni.example.com');
    });

    it('round-trips Surge websocket headers with pipe separators', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'vmess',
                    name: 'Surge WS Headers',
                    server: 'ws.example.com',
                    port: 443,
                    uuid: UUID,
                    aead: true,
                    tls: true,
                    sni: 'sni.example.com',
                    network: 'ws',
                    'ws-opts': {
                        path: '/ws',
                        headers: {
                            Host: 'cdn.example.com',
                            'X-Comma': 'a,b',
                            'X-Quote': 'a",b',
                        },
                    },
                },
            ],
            'Surge',
            'external',
        );

        const [proxy] = ProxyUtils.parse(output);

        expect(proxy['ws-opts'].headers).to.deep.equal({
            Host: 'cdn.example.com',
            'X-Comma': 'a,b',
            'X-Quote': 'a",b',
        });
        expect(output).to.include(
            String.raw`ws-headers="Host:"cdn.example.com"|X-Comma:"a,b"|X-Quote:"a",b""`,
        );
    });

    it('filters root proxy headers for unsupported text targets with an error log', function () {
        const { result, errors } = captureErrors(() =>
            ProxyUtils.produce(
                [
                    {
                        type: 'http',
                        name: 'QX HTTPS Headers',
                        server: 'https.example.com',
                        port: 443,
                        tls: true,
                        headers: {
                            'X-Token': 'abc',
                        },
                    },
                ],
                'QX',
                'external',
            ),
        );

        expect(result).to.equal('');
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include(
            'Target platform QX does not support headers for HTTPS proxy QX HTTPS Headers',
        );
    });

    it('keeps root proxy headers for unsupported text targets when include-unsupported-proxy is enabled', function () {
        const { result, errors } = captureErrors(() =>
            ProxyUtils.produce(
                [
                    {
                        type: 'http',
                        name: 'QX HTTPS Headers',
                        server: 'https.example.com',
                        port: 443,
                        tls: true,
                        headers: {
                            'X-Token': 'abc',
                        },
                    },
                ],
                'QX',
                'external',
                { 'include-unsupported-proxy': true },
            ),
        );

        expect(result).to.equal(
            'http=https.example.com:443,over-tls=true,tag=QX HTTPS Headers',
        );
        expect(errors).to.have.length(0);
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

    it('does not emit empty Surfboard Hysteria2 port hopping fields', function () {
        const output = produceExternal('Surfboard', {
            type: 'hysteria2',
            name: 'Surfboard Hysteria2 Plain',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            ports: '',
            'hop-interval': '   ',
            sni: 'peer.example.com',
            'skip-cert-verify': true,
        });

        expect(output).to.equal(
            'Surfboard Hysteria2 Plain=hysteria2,hy2.example.com,443,password="secret",sni="peer.example.com",skip-cert-verify=true',
        );
    });

    it('produces Surfboard Hysteria2 salamander obfs lines', function () {
        const output = produceExternal('Surfboard', {
            type: 'hysteria2',
            name: 'Surfboard Hysteria2 Salamander',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            obfs: 'salamander',
            'obfs-password': 'mask',
        });

        expect(output).to.equal(
            'Surfboard Hysteria2 Salamander=hysteria2,hy2.example.com,443,password="secret",salamander-password="mask"',
        );
    });

    it('omits Surfboard Hysteria2 lines when unsupported obfs is present', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'hysteria2',
                    name: 'Surfboard Hysteria2 Gecko',
                    server: 'hy2.example.com',
                    port: 443,
                    password: 'secret',
                    obfs: 'gecko',
                    'obfs-password': 'mask',
                },
            ],
            'Surfboard',
            'external',
        );

        expect(output).to.equal('');
    });

    it('produces Surfboard TLS server certificate fingerprints', function () {
        const fingerprint = 'SHA256:FINGERPRINT';
        const cases = [
            {
                name: 'Surfboard HTTPS Fingerprint',
                proxy: {
                    type: 'http',
                    name: 'Surfboard HTTPS Fingerprint',
                    server: 'https.example.com',
                    port: 443,
                    tls: true,
                    sni: 'https.example.com',
                    'tls-fingerprint': fingerprint,
                },
                prefix: 'Surfboard HTTPS Fingerprint=https',
            },
            {
                name: 'Surfboard Socks5 TLS Fingerprint',
                proxy: {
                    type: 'socks5',
                    name: 'Surfboard Socks5 TLS Fingerprint',
                    server: 'socks.example.com',
                    port: 443,
                    tls: true,
                    sni: 'socks.example.com',
                    'tls-fingerprint': fingerprint,
                },
                prefix: 'Surfboard Socks5 TLS Fingerprint=socks5-tls',
            },
            {
                name: 'Surfboard Trojan Fingerprint',
                proxy: {
                    type: 'trojan',
                    name: 'Surfboard Trojan Fingerprint',
                    server: 'trojan.example.com',
                    port: 443,
                    password: 'secret',
                    tls: true,
                    sni: 'trojan.example.com',
                    'tls-fingerprint': fingerprint,
                },
                prefix: 'Surfboard Trojan Fingerprint=trojan',
            },
            {
                name: 'Surfboard VMess TLS Fingerprint',
                proxy: {
                    type: 'vmess',
                    name: 'Surfboard VMess TLS Fingerprint',
                    server: 'vmess.example.com',
                    port: 443,
                    uuid: UUID,
                    alterId: 0,
                    tls: true,
                    sni: 'vmess.example.com',
                    'tls-fingerprint': fingerprint,
                },
                prefix: 'Surfboard VMess TLS Fingerprint=vmess',
            },
            {
                name: 'Surfboard Hysteria2 Fingerprint',
                proxy: {
                    type: 'hysteria2',
                    name: 'Surfboard Hysteria2 Fingerprint',
                    server: 'hy2.example.com',
                    port: 443,
                    password: 'secret',
                    sni: 'hy2.example.com',
                    'tls-fingerprint': fingerprint,
                },
                prefix: 'Surfboard Hysteria2 Fingerprint=hysteria2',
            },
            {
                name: 'Surfboard AnyTLS Fingerprint',
                proxy: {
                    type: 'anytls',
                    name: 'Surfboard AnyTLS Fingerprint',
                    server: 'anytls.example.com',
                    port: 443,
                    password: 'secret',
                    sni: 'anytls.example.com',
                    'tls-fingerprint': fingerprint,
                },
                prefix: 'Surfboard AnyTLS Fingerprint=anytls',
            },
        ];

        for (const { name, proxy, prefix } of cases) {
            const output = produceExternal('Surfboard', proxy);

            expect(output, name).to.include(prefix);
            expect(output, name).to.include(
                `,server-cert-fingerprint-sha256=${fingerprint}`,
            );
        }
    });

    it('omits Surfboard TLS-only params for plain HTTP, SOCKS5, and VMess nodes', function () {
        const cases = [
            {
                type: 'http',
                name: 'Surfboard HTTP Plain TLS Params',
                server: 'http.example.com',
                port: 80,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'socks5',
                name: 'Surfboard Socks5 Plain TLS Params',
                server: 'socks.example.com',
                port: 1080,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'vmess',
                name: 'Surfboard VMess Plain TLS Params',
                server: 'vmess.example.com',
                port: 80,
                uuid: UUID,
                alterId: 0,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
        ];

        for (const proxy of cases) {
            const output = produceExternal('Surfboard', proxy);

            expect(output, proxy.name).to.not.include(',sni=');
            expect(output, proxy.name).to.not.include(',skip-cert-verify=');
            expect(output, proxy.name).to.not.include(
                ',server-cert-fingerprint-sha256=',
            );
        }
    });

    it('produces Surfboard Snell versions 1 through 5', function () {
        for (const version of [1, 2, 3, 4, 5]) {
            const output = produceExternal('Surfboard', {
                type: 'snell',
                name: `Surfboard Snell ${version}`,
                server: 'snell.example.com',
                port: 443,
                psk: 'secret',
                version,
            });

            expect(output).to.equal(
                `Surfboard Snell ${version}=snell,snell.example.com,443,version=${version},psk="secret"`,
            );
        }
    });

    it('appends Surfboard block-quic to supported protocols', function () {
        const proxies = [
            {
                type: 'ss',
                name: 'Surfboard SS Block QUIC',
                server: 'ss.example.com',
                port: 443,
                cipher: 'aes-128-gcm',
                password: 'secret',
            },
            {
                type: 'snell',
                name: 'Surfboard Snell Block QUIC',
                server: 'snell.example.com',
                port: 443,
                psk: 'secret',
                version: 5,
            },
            {
                type: 'http',
                name: 'Surfboard HTTP Block QUIC',
                server: 'http.example.com',
                port: 80,
            },
            {
                type: 'socks5',
                name: 'Surfboard Socks5 Block QUIC',
                server: 'socks.example.com',
                port: 1080,
            },
            {
                type: 'trojan',
                name: 'Surfboard Trojan Block QUIC',
                server: 'trojan.example.com',
                port: 443,
                password: 'secret',
            },
            {
                type: 'vmess',
                name: 'Surfboard VMess Block QUIC',
                server: 'vmess.example.com',
                port: 443,
                uuid: UUID,
                alterId: 0,
            },
            {
                type: 'hysteria2',
                name: 'Surfboard Hysteria2 Block QUIC',
                server: 'hy2.example.com',
                port: 443,
                password: 'secret',
            },
            {
                type: 'anytls',
                name: 'Surfboard AnyTLS Block QUIC',
                server: 'anytls.example.com',
                port: 443,
                password: 'secret',
            },
            {
                type: 'wireguard-surge',
                name: 'Surfboard WireGuard Block QUIC',
            },
        ];

        for (const proxy of proxies) {
            const output = produceExternal('Surfboard', {
                ...proxy,
                'block-quic': 'on',
            });

            expect(output, proxy.name).to.include(',block-quic=on');
        }
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

    it('does not wrap malformed SurgeMac nodes with Mihomo external mode', function () {
        const output = ProxyUtils.produce(
            [
                {
                    type: 'ss',
                    name: 'Broken Obfs',
                    server: 'ss.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'secret',
                    plugin: 'obfs',
                },
            ],
            'SurgeMac',
            'external',
            { useMihomoExternal: true, localPort: 16666 },
        );

        expect(output).to.equal('');
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

    it('produces URI shadowsocks httpupgrade links with early data metadata', function () {
        const output = produceExternal('URI', {
            type: 'ss',
            name: 'SS Upgrade',
            server: 'ss-upgrade.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&b=2',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                '_v2ray-http-upgrade-ed': '1024',
            },
        });

        expect(output).to.equal(
            `ss://${Base64.encode(
                'aes-128-gcm:secret',
            )}@ss-upgrade.example.com:443?sni=ss-upgrade.example.com&type=httpupgrade&path=%2Fupgrade%3Fa%3D1%26b%3D2%26ed%3D1024&host=upgrade.example.com&security=tls#SS%20Upgrade`,
        );

        const reparsed = ProxyUtils.parse(output)[0];
        expect(reparsed['ws-opts'].path).to.equal('/upgrade?a=1&b=2');
        expect(reparsed['ws-opts']['v2ray-http-upgrade-fast-open']).to.equal(
            true,
        );
        expect(reparsed['ws-opts']['_v2ray-http-upgrade-ed']).to.equal('1024');
        expect(reparsed['ws-opts']).to.not.have.property('max-early-data');
        expect(reparsed['ws-opts']).to.not.have.property(
            'early-data-header-name',
        );
    });

    it('produces URI shadowsocks websocket links with early data metadata', function () {
        const output = produceExternal('URI', {
            type: 'ss',
            name: 'SS WS Early',
            server: 'ss-ws.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': 2048,
                'early-data-header-name': 'Sec-WebSocket-Protocol',
            },
        });

        expect(output).to.equal(
            `ss://${Base64.encode(
                'aes-128-gcm:secret',
            )}@ss-ws.example.com:443?sni=ss-ws.example.com&type=ws&path=%2Fws%3Fa%3D1%26b%3D2%26ed%3D2048&host=cdn.example.com&security=tls#SS%20WS%20Early`,
        );

        const reparsed = ProxyUtils.parse(output)[0];
        expect(reparsed['ws-opts'].path).to.equal('/ws?a=1&b=2');
        expect(reparsed['ws-opts']['max-early-data']).to.equal(2048);
        expect(reparsed['ws-opts']['early-data-header-name']).to.equal(
            'Sec-WebSocket-Protocol',
        );
        expect(reparsed['ws-opts']).to.not.have.property('v2ray-http-upgrade');
    });

    it('does not serialize URI websocket early data for formats without custom header support', function () {
        const proxies = [
            {
                type: 'ss',
                name: 'SS WS Custom Early',
                server: 'ss-ws.example.com',
                port: 443,
                cipher: 'aes-128-gcm',
                password: 'secret',
                tls: true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws?a=1&ed=1024&b=2',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'max-early-data': 2048,
                    'early-data-header-name': 'X-Data',
                },
            },
            {
                type: 'vmess',
                name: 'VMess WS Custom Early',
                server: 'vmess-ws.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                tls: true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws?a=1&ed=1024&b=2',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'max-early-data': 2048,
                    'early-data-header-name': 'X-Data',
                },
            },
            {
                type: 'trojan',
                name: 'Trojan WS Custom Early',
                server: 'trojan-ws.example.com',
                port: 443,
                password: 'secret',
                tls: true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws?a=1&ed=1024&b=2',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                    'max-early-data': 2048,
                    'early-data-header-name': 'X-Data',
                },
            },
        ];

        for (const proxy of proxies) {
            const reparsed = ProxyUtils.parse(produceExternal('URI', proxy))[0];

            expect(reparsed['ws-opts'].path, proxy.type).to.equal(
                '/ws?a=1&b=2',
            );
            expect(reparsed['ws-opts'], proxy.type).to.not.have.property(
                'max-early-data',
            );
            expect(reparsed['ws-opts'], proxy.type).to.not.have.property(
                'early-data-header-name',
            );
        }
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
            'packet-encoding': 'packetaddr',
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

    it('produces URI VLESS websocket links with xudp packet encoding', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS XUDP',
            server: 'vless-xudp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            udp: true,
            'packet-encoding': 'xudp',
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xudp.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&packetEncoding=xudp#URI%20WS%20XUDP`,
        );
    });

    it('prefers legacy xudp over legacy packet addr for URI VLESS links', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS Legacy XUDP',
            server: 'vless-legacy-xudp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            udp: true,
            xudp: true,
            'packet-addr': true,
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-legacy-xudp.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&packetEncoding=xudp#URI%20WS%20Legacy%20XUDP`,
        );
    });

    it('replaces stale URI VLESS websocket path early data with max-early-data', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS Conflict',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=999&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': 2048,
                'early-data-header-name': 'Sec-WebSocket-Protocol',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws%3Fa%3D1%26b%3D2&host=cdn.example.com&ed=2048#URI%20WS%20Conflict`,
        );

        const reparsed = ProxyUtils.parse(output)[0];
        expect(reparsed['ws-opts'].path).to.equal('/ws?a=1&b=2');
        expect(reparsed['ws-opts']['max-early-data']).to.equal(2048);
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

    it('produces URI VLESS links with vcn from name-cert-verify', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS VCN',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            'name-cert-verify': 'edited.example.com',
            _vcn: ['cert.example.com', 'backup.example.com'],
            network: 'ws',
            'ws-opts': {
                path: '/ws',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws&vcn=cert.example.com%2Cbackup.example.com#URI%20WS%20VCN`,
        );
    });

    it('produces URI VLESS links with ech from mihomo ech opts config', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS ECH',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            _echConfigList: 'STALE',
            'ech-opts': {
                enable: true,
                config: 'ECHCONFIG',
            },
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&ech=ECHCONFIG&sni=sni.example.com#URI%20WS%20ECH`,
        );
    });

    it('matches mihomo ECH enable decoding when producing URI VLESS links', function () {
        const baseProxy = {
            type: 'vless',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            _echConfigList: 'FALLBACK',
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        };
        const outputWithNumericEnable = produceExternal('URI', {
            ...baseProxy,
            name: 'URI WS ECH Numeric',
            'ech-opts': {
                enable: 1,
                config: 'ECHCONFIG',
            },
        });
        const outputWithoutEnable = produceExternal('URI', {
            ...baseProxy,
            name: 'URI WS ECH Missing Enable',
            'ech-opts': {
                config: 'ECHCONFIG',
            },
        });
        const outputWithStringEnable = produceExternal('URI', {
            ...baseProxy,
            name: 'URI WS ECH String Enable',
            'ech-opts': {
                enable: 'true',
                config: 'ECHCONFIG',
            },
        });

        expect(outputWithNumericEnable).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&ech=ECHCONFIG&sni=sni.example.com#URI%20WS%20ECH%20Numeric`,
        );
        expect(outputWithoutEnable).to.not.include('&ech=');
        expect(outputWithStringEnable).to.not.include('&ech=');
    });

    it('produces URI VLESS links with ech DNS from mihomo sidecar fields', function () {
        const echConfigList = 'ech.example.com+https://1.1.1.1/dns-query';
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS ECH DNS',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            'ech-opts': {
                enable: true,
                _dns: 'https://1.1.1.1/dns-query',
                'query-server-name': 'ech.example.com',
            },
            network: 'ws',
            'ws-opts': {
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&ech=${encodeURIComponent(
                echConfigList,
            )}&sni=sni.example.com#URI%20WS%20ECH%20DNS`,
        );
    });

    it('uses default ECH DNS and warns when URI VLESS ech opts only set query server name', function () {
        const echConfigList =
            'ech.example.com+https://dns.alidns.com/dns-query';
        const { result: output, warnings } = captureWarns(() =>
            produceExternal('URI', {
                type: 'vless',
                name: 'URI WS ECH Default DNS',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'sni.example.com',
                'ech-opts': {
                    enable: true,
                    'query-server-name': 'ech.example.com',
                },
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            }),
        );

        expect(output).to.equal(
            `vless://${UUID}@vless.example.com:443?security=tls&type=ws&path=%2Fws&host=cdn.example.com&ech=${encodeURIComponent(
                echConfigList,
            )}&sni=sni.example.com#URI%20WS%20ECH%20Default%20DNS`,
        );
        expect(warnings).to.have.length(1);
        expect(warnings[0]).to.include('https://dns.alidns.com/dns-query');
        expect(warnings[0]).to.include('ech-opts._dns');
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
            'packet-encoding': '',
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
                '_v2ray-http-upgrade-ed': '1024',
                'early-data-header-name': 'X-Upgrade',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-upgrade.example.com:443?security=tls&type=httpupgrade&path=%2Fupgrade%3Fed%3D1024&host=upgrade.example.com&eh=X-Upgrade#URI%20Upgrade`,
        );
    });

    it('defaults URI VLESS httpupgrade path early data without reusing websocket early data', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI Upgrade Default',
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
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-upgrade.example.com:443?security=tls&type=httpupgrade&path=%2Fupgrade%3Fed%3D2560&host=upgrade.example.com#URI%20Upgrade%20Default`,
        );
    });

    it('keeps URI VLESS httpupgrade early data from path when metadata is absent', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI Upgrade Existing Path Early',
            server: 'vless-upgrade.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&ed=1024&b=2',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-upgrade.example.com:443?security=tls&type=httpupgrade&path=%2Fupgrade%3Fa%3D1%26b%3D2%26ed%3D1024&host=upgrade.example.com#URI%20Upgrade%20Existing%20Path%20Early`,
        );
    });

    it('adds URI VLESS httpupgrade early data to paths with existing query params', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI Upgrade Query',
            server: 'vless-upgrade.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&b=2',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                '_v2ray-http-upgrade-ed': '1024',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-upgrade.example.com:443?security=tls&type=httpupgrade&path=%2Fupgrade%3Fa%3D1%26b%3D2%26ed%3D1024&host=upgrade.example.com#URI%20Upgrade%20Query`,
        );
    });

    it('replaces invalid URI VLESS httpupgrade path early data', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI Upgrade Invalid Query',
            server: 'vless-upgrade.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?ed=abc&x=1',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                '_v2ray-http-upgrade-ed': '1024',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-upgrade.example.com:443?security=tls&type=httpupgrade&path=%2Fupgrade%3Fx%3D1%26ed%3D1024&host=upgrade.example.com#URI%20Upgrade%20Invalid%20Query`,
        );
    });

    it('does not serialize invalid URI early data values', function () {
        const invalidVlessWsOutput = produceExternal('URI', {
            type: 'vless',
            name: 'URI WS Invalid Early',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=1024&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': '999999999999999999999',
                'early-data-header-name': 'Sec-WebSocket-Protocol',
            },
        });
        const invalidSsWsOutput = produceExternal('URI', {
            type: 'ss',
            name: 'SS WS Invalid Early',
            server: 'ss-ws.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=1024&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': 'abc',
                'early-data-header-name': 'Sec-WebSocket-Protocol',
            },
        });
        const invalidHttpUpgradeOutput = produceExternal('URI', {
            type: 'vless',
            name: 'URI Upgrade Invalid Metadata',
            server: 'vless-upgrade.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?ed=abc',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                '_v2ray-http-upgrade-ed': 'abc',
            },
        });

        const reparsedVlessWs = ProxyUtils.parse(invalidVlessWsOutput)[0];
        const reparsedSsWs = ProxyUtils.parse(invalidSsWsOutput)[0];

        expect(reparsedVlessWs['ws-opts'].path).to.equal('/ws?a=1&b=2');
        expect(reparsedVlessWs['ws-opts']).to.not.have.property(
            'max-early-data',
        );
        expect(reparsedSsWs['ws-opts'].path).to.equal('/ws?a=1&b=2');
        expect(reparsedSsWs['ws-opts']).to.not.have.property('max-early-data');
        expect(invalidHttpUpgradeOutput).to.equal(
            `vless://${UUID}@vless-upgrade.example.com:443?security=tls&type=httpupgrade&path=%2Fupgrade%3Fed%3D2560&host=upgrade.example.com#URI%20Upgrade%20Invalid%20Metadata`,
        );
    });

    it('produces URI VMess httpupgrade links with early data metadata', function () {
        const output = produceExternal('URI', {
            type: 'vmess',
            name: 'URI VMess Upgrade',
            server: 'vmess-upgrade.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&b=2',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                '_v2ray-http-upgrade-ed': '1024',
            },
        });
        const payload = JSON.parse(
            Base64.decode(output.replace(/^vmess:\/\//, '')),
        );

        expect(payload.net).to.equal('httpupgrade');
        expect(payload.path).to.equal('/upgrade?a=1&b=2&ed=1024');

        const reparsed = ProxyUtils.parse(output)[0];
        expect(reparsed['ws-opts'].path).to.equal('/upgrade?a=1&b=2');
        expect(reparsed['ws-opts']['v2ray-http-upgrade-fast-open']).to.equal(
            true,
        );
        expect(reparsed['ws-opts']['_v2ray-http-upgrade-ed']).to.equal('1024');
        expect(reparsed['ws-opts']).to.not.have.property('max-early-data');
        expect(reparsed['ws-opts']).to.not.have.property(
            'early-data-header-name',
        );
    });

    it('produces URI VMess websocket links with early data metadata', function () {
        const output = produceExternal('URI', {
            type: 'vmess',
            name: 'URI VMess WS Early',
            server: 'vmess-ws.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': 2048,
                'early-data-header-name': 'Sec-WebSocket-Protocol',
            },
        });
        const payload = JSON.parse(
            Base64.decode(output.replace(/^vmess:\/\//, '')),
        );

        expect(payload.net).to.equal('ws');
        expect(payload.path).to.equal('/ws?a=1&b=2&ed=2048');

        const reparsed = ProxyUtils.parse(output)[0];
        expect(reparsed['ws-opts'].path).to.equal('/ws?a=1&b=2');
        expect(reparsed['ws-opts']['max-early-data']).to.equal(2048);
        expect(reparsed['ws-opts']['early-data-header-name']).to.equal(
            'Sec-WebSocket-Protocol',
        );
    });

    it('normalizes unsupported URI VMess scy values to auto', function () {
        const output = produceExternal('URI', {
            type: 'vmess',
            name: 'URI VMess Invalid Security',
            server: 'vmess-invalid.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'aes-128-ctr',
            alterId: 0,
            tls: true,
            network: 'ws',
        });
        const payload = JSON.parse(
            Base64.decode(output.replace(/^vmess:\/\//, '')),
        );

        expect(payload.scy).to.equal('auto');
    });

    it('produces URI VMess h2 links from mihomo h2-opts host', function () {
        const output = produceExternal('URI', {
            type: 'vmess',
            name: 'URI VMess H2',
            server: 'vmess-h2.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            tls: true,
            network: 'h2',
            'h2-opts': {
                path: '/h2',
                host: ['h2.example.com'],
            },
        });
        const payload = JSON.parse(
            Base64.decode(output.replace(/^vmess:\/\//, '')),
        );

        expect(payload.net).to.equal('h2');
        expect(payload.path).to.equal('/h2');
        expect(payload.host).to.equal('h2.example.com');
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
            'packet-encoding': '',
            network: 'h2',
            _h2: true,
            'h2-opts': {
                path: '/h2',
                host: ['h2.example.com'],
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
            sessionIDTable: 'Base62',
            sessionIDLength: 16,
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
                'session-table': 'Base62',
                'session-length': 16,
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP`,
        );
    });

    it('produces URI VLESS xhttp links with explicit empty session table strings', function () {
        const extra = JSON.stringify({
            sessionIDTable: '',
        });
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Empty Session Table',
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
                'session-table': '',
            },
        });

        expect(output).to.equal(
            `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&host=cdn.example.com&sni=sni.example.com&mode=stream-up&extra=${encodeURIComponent(
                extra,
            )}#URI%20XHTTP%20Empty%20Session%20Table`,
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['session-table']).to.equal('');
        expect(reparsed[0]).to.not.have.property('_extra_unsupported');
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
                sessionIDTable: 'stale-table',
                downloadSettings: {
                    sockopt: {
                        mark: 255,
                    },
                    address: 'old.example.com',
                    xhttpSettings: {
                        sessionIDLength: '1-2',
                    },
                },
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                headers: {
                    Host: 'cdn.example.com',
                },
                'no-grpc-header': true,
                'session-table': 'Base62',
                'session-length': '16-32',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    'session-table': 'abcXYZ012',
                    'session-length': '8-12',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.customField).to.equal('keep-me');
        expect(extra.noGRPCHeader).to.equal(true);
        expect(extra.sessionIDTable).to.equal('Base62');
        expect(extra.sessionIDLength).to.equal('16-32');
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
        expect(extra.downloadSettings?.xhttpSettings?.sessionIDTable).to.equal(
            'abcXYZ012',
        );
        expect(extra.downloadSettings?.xhttpSettings?.sessionIDLength).to.equal(
            '8-12',
        );

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.server,
        ).to.equal('download.example.com');
        expect(reparsed[0]['xhttp-opts']?.['session-table']).to.equal('Base62');
        expect(reparsed[0]['xhttp-opts']?.['session-length']).to.equal('16-32');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.['session-table'],
        ).to.equal('abcXYZ012');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'session-length'
            ],
        ).to.equal('8-12');
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
            sessionIDTable: 'raw-table',
            sessionIDLength: '8-12',
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
                'session-table': 'structured-table',
                'session-length': '16-32',
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        expect(decodeURIComponent(encodedExtra)).to.equal(rawExtra);

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal('0-300');
        expect(reparsed[0]['xhttp-opts']?.['session-table']).to.equal(
            'raw-table',
        );
        expect(reparsed[0]['xhttp-opts']?.['session-length']).to.equal('8-12');
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
        expect(extra.downloadSettings?.address).to.equal(
            'download.example.com',
        );
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
            xhttpSettings: {
                path: '/xhttp',
                host: 'cdn.example.com',
                mode: 'stream-up',
            },
            sockopt: {
                mark: 255,
            },
        });

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.['download-settings']).to.deep.equal({
            network: 'xhttp',
            path: '/xhttp',
            host: 'cdn.example.com',
            mode: 'stream-up',
        });
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
        expect(
            extra.downloadSettings?.xhttpSettings?.extra?.xmux,
        ).to.deep.equal({
            hMaxRequestTimes: '4-8',
            hKeepAlivePeriod: -1,
        });

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
            sessionIDPlacement: 'query',
            sessionIDKey: 'x_session_id',
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
                    mode: 'stream-up',
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
                    sessionIDPlacement: 'header',
                    sessionIDKey: 'X-Session',
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

    it('normalizes Mihomo leading-zero structured xhttp values when producing URI VLESS links', function () {
        const extra = JSON.stringify({
            scMaxEachPostBytes: '1-1000000',
            scMinPostsIntervalMs: 300,
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                    host: 'download-host.example.com',
                    mode: 'stream-up',
                    scMaxEachPostBytes: '1-1000000',
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
                'sc-max-each-post-bytes': '000001-1000000',
                'sc-min-posts-interval-ms': '0300',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    host: 'download-host.example.com',
                    'sc-max-each-post-bytes': '000001-1000000',
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
            '1-1000000',
        );
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal(300);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-max-each-post-bytes'
            ],
        ).to.equal('1-1000000');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-min-posts-interval-ms'
            ],
        ).to.equal('0-300');
    });

    it('normalizes Mihomo explicit-plus structured xhttp values when producing URI VLESS links', function () {
        const extra = JSON.stringify({
            scMaxEachPostBytes: '500000-1000000',
            scMinPostsIntervalMs: 300,
            downloadSettings: {
                address: 'download.example.com',
                network: 'xhttp',
                port: 8443,
                security: 'tls',
                xhttpSettings: {
                    path: '/download',
                    host: 'download-host.example.com',
                    mode: 'stream-up',
                    scMaxEachPostBytes: '1-1000000',
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
                    'sc-max-each-post-bytes': '+1-+1000000',
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
            '500000-1000000',
        );
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal(300);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-max-each-post-bytes'
            ],
        ).to.equal('1-1000000');
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
                    mode: 'stream-up',
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

    it('produces nested xhttp download TLS ECH DNS fields from mihomo sidecar fields', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Nested ECH DNS',
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
                    'ech-opts': {
                        enable: true,
                        _dns: 'https://1.1.1.1/dns-query',
                        'query-server-name': 'download-ech.example.com',
                        '_force-query': 'full',
                        _sockopt: {
                            mark: 255,
                        },
                    },
                    path: '/download',
                    host: 'download-host.example.com',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings?.tlsSettings).to.deep.equal({
            echConfigList: 'download-ech.example.com+https://1.1.1.1/dns-query',
            echForceQuery: 'full',
            echSockopt: {
                mark: 255,
            },
        });

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.['ech-opts'],
        ).to.deep.equal({
            enable: true,
            _dns: 'https://1.1.1.1/dns-query',
            'query-server-name': 'download-ech.example.com',
            '_force-query': 'full',
            _sockopt: {
                mark: 255,
            },
        });
    });

    it('uses default ECH DNS and warns for nested xhttp download ECH query server name without DNS', function () {
        const { result: output, warnings } = captureWarns(() =>
            produceExternal('URI', {
                type: 'vless',
                name: 'URI XHTTP Nested ECH Default DNS',
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
                        'ech-opts': {
                            enable: true,
                            'query-server-name': 'download-ech.example.com',
                            '_force-query': 'half',
                        },
                        path: '/download',
                    },
                },
            }),
        );

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings?.tlsSettings).to.deep.equal({
            echConfigList:
                'download-ech.example.com+https://dns.alidns.com/dns-query',
            echForceQuery: 'half',
        });
        expect(warnings).to.have.length(1);
        expect(warnings[0]).to.include('https://dns.alidns.com/dns-query');
        expect(warnings[0]).to.include(
            'xhttp-opts.download-settings.ech-opts._dns',
        );
    });

    it('omits nested xhttp download TLS ECH extras without an ECH config list', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Nested ECH Sidecar Only',
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
                    'ech-opts': {
                        enable: true,
                        '_force-query': 'full',
                        _sockopt: {
                            mark: 255,
                        },
                    },
                    path: '/download',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings?.security).to.equal('tls');
        expect(extra.downloadSettings).to.not.have.property('tlsSettings');
    });

    it('drops unsupported nested xhttp download TLS ECH force query values', function () {
        const output = produceExternal('URI', {
            type: 'vless',
            name: 'URI XHTTP Nested ECH Invalid Force Query',
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
                    'ech-opts': {
                        enable: true,
                        _dns: 'https://1.1.1.1/dns-query',
                        '_force-query': 'invalid',
                        _sockopt: {
                            mark: 255,
                        },
                    },
                    path: '/download',
                },
            },
        });

        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const extra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(extra.downloadSettings?.tlsSettings).to.deep.equal({
            echConfigList: 'https://1.1.1.1/dns-query',
            echSockopt: {
                mark: 255,
            },
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
        expect(reparsed[0]['xhttp-opts']?.['download-settings']?.host).to.equal(
            'download-host.example.com',
        );
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
        expect(reparsed[0]['xhttp-opts']?.['download-settings']?.host).to.equal(
            'download-host.example.com',
        );
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.headers,
        ).to.deep.equal({
            'X-Download': '1',
        });
    });

    it('preserves empty xhttp header values when round-tripping URI VLESS links', function () {
        const extra = JSON.stringify({
            headers: {
                'X-Empty': '',
                'X-Value': '1',
            },
            noGRPCHeader: false,
            xPaddingObfsMode: false,
            downloadSettings: {
                network: 'xhttp',
                xhttpSettings: {
                    path: '/download',
                    headers: {
                        'X-Download-Empty': '',
                        'X-Download': '1',
                    },
                    noGRPCHeader: false,
                    xPaddingObfsMode: false,
                },
            },
        });
        const input = `vless://${UUID}@vless-xhttp.example.com:443?security=tls&type=xhttp&path=%2Fxhttp&extra=${encodeURIComponent(
            extra,
        )}#URI%20XHTTP%20Empty%20Headers`;

        const parsed = ProxyUtils.parse(input);
        expect(parsed, input).to.have.length(1);
        expect(parsed[0]['xhttp-opts']?.headers).to.deep.equal({
            'X-Empty': '',
            'X-Value': '1',
        });
        expect(
            parsed[0]['xhttp-opts']?.['download-settings']?.headers,
        ).to.deep.equal({
            'X-Download-Empty': '',
            'X-Download': '1',
        });

        const output = produceExternal('URI', parsed[0]);
        const [, encodedExtra] = output.match(/[?&]extra=([^#]+)/);
        const reparsedExtra = JSON.parse(decodeURIComponent(encodedExtra));
        expect(reparsedExtra.headers).to.deep.equal({
            'X-Empty': '',
            'X-Value': '1',
        });
        expect(reparsedExtra.noGRPCHeader).to.equal(false);
        expect(reparsedExtra.xPaddingObfsMode).to.equal(false);
        expect(
            reparsedExtra.downloadSettings?.xhttpSettings?.headers,
        ).to.deep.equal({
            'X-Download-Empty': '',
            'X-Download': '1',
        });
        expect(
            reparsedExtra.downloadSettings?.xhttpSettings?.noGRPCHeader,
        ).to.equal(false);
        expect(
            reparsedExtra.downloadSettings?.xhttpSettings?.xPaddingObfsMode,
        ).to.equal(false);

        const reparsed = ProxyUtils.parse(output);
        expect(reparsed, output).to.have.length(1);
        expect(reparsed[0]['xhttp-opts']?.headers).to.deep.equal({
            'X-Empty': '',
            'X-Value': '1',
        });
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.headers,
        ).to.deep.equal({
            'X-Download-Empty': '',
            'X-Download': '1',
        });
    });

    it('normalizes structured xhttp range-form scalars when producing URI VLESS links', function () {
        const extra = JSON.stringify({
            noGRPCHeader: true,
            xPaddingBytes: '64-128',
            sessionIDTable: 'Base62',
            sessionIDLength: '16-32',
            scMaxEachPostBytes: '1-1000000',
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
                    mode: 'stream-up',
                    sessionIDTable: 'abcXYZ012',
                    sessionIDLength: '8-12',
                    scMaxEachPostBytes: '500000-1000000',
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
                'session-table': 'Base62',
                'session-length': '16-32',
                'sc-max-each-post-bytes': '1-1000000',
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
                    'session-table': 'abcXYZ012',
                    'session-length': '8-12',
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
            '1-1000000',
        );
        expect(
            reparsed[0]['xhttp-opts']?.['sc-min-posts-interval-ms'],
        ).to.equal('0-300');
        expect(reparsed[0]['xhttp-opts']?.['session-table']).to.equal('Base62');
        expect(reparsed[0]['xhttp-opts']?.['session-length']).to.equal('16-32');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-max-each-post-bytes'
            ],
        ).to.equal('500000-1000000');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'sc-min-posts-interval-ms'
            ],
        ).to.equal('0-300');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.['session-table'],
        ).to.equal('abcXYZ012');
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings']?.[
                'session-length'
            ],
        ).to.equal('8-12');
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
                host: 'cdn.example.com',
                mode: 'stream-up',
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
            host: 'cdn.example.com',
            mode: 'stream-up',
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
                    mode: 'stream-up',
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
                'session-length': '0-32',
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
                    'session-length': 0,
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
        expect(reparsed[0]['xhttp-opts']).to.not.have.property(
            'session-length',
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
        expect(
            reparsed[0]['xhttp-opts']?.['download-settings'],
        ).to.not.have.property('session-length');
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
                'session-table': 123,
                'session-length': '0-32',
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
                xhttpSettings: {
                    path: '/xhttp',
                    host: 'cdn.example.com',
                    mode: 'stream-up',
                },
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
                    'session-table': false,
                    'session-length': 0,
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
        expect(reparsed[0]['xhttp-opts']?.['download-settings']?.path).to.equal(
            '/xhttp',
        );
        expect(reparsed[0]['xhttp-opts']?.['download-settings']?.host).to.equal(
            'cdn.example.com',
        );
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

    it('produces URI Trojan links with vcn from the sidecar', function () {
        const output = produceExternal('URI', {
            type: 'trojan',
            name: 'URI Trojan VCN',
            server: 'trojan.example.com',
            port: 443,
            password: 'secret',
            tls: true,
            sni: 'sni.example.com',
            'name-cert-verify': 'edited.example.com',
            _vcn: ['cert.example.com', 'backup.example.com'],
        });

        expect(output).to.equal(
            'trojan://secret@trojan.example.com:443?sni=sni.example.com&vcn=cert.example.com%2Cbackup.example.com#URI%20Trojan%20VCN',
        );
    });

    it('produces URI Trojan websocket links with early data metadata', function () {
        const output = produceExternal('URI', {
            type: 'trojan',
            name: 'URI Trojan WS Early',
            server: 'trojan.example.com',
            port: 443,
            password: 'secret',
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': 2048,
                'early-data-header-name': 'Sec-WebSocket-Protocol',
            },
        });

        expect(output).to.equal(
            'trojan://secret@trojan.example.com:443?sni=trojan.example.com&type=ws&path=%2Fws%3Fa%3D1%26b%3D2%26ed%3D2048&host=cdn.example.com#URI%20Trojan%20WS%20Early',
        );

        const reparsed = ProxyUtils.parse(output)[0];
        expect(reparsed['ws-opts'].path).to.equal('/ws?a=1&b=2');
        expect(reparsed['ws-opts']['max-early-data']).to.equal(2048);
        expect(reparsed['ws-opts']['early-data-header-name']).to.equal(
            'Sec-WebSocket-Protocol',
        );
    });

    it('produces URI Trojan httpupgrade links with early data metadata', function () {
        const output = produceExternal('URI', {
            type: 'trojan',
            name: 'URI Trojan Upgrade',
            server: 'trojan-upgrade.example.com',
            port: 443,
            password: 'secret',
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&b=2',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                '_v2ray-http-upgrade-ed': '1024',
            },
        });

        expect(output).to.equal(
            'trojan://secret@trojan-upgrade.example.com:443?sni=trojan-upgrade.example.com&type=httpupgrade&path=%2Fupgrade%3Fa%3D1%26b%3D2%26ed%3D1024&host=upgrade.example.com#URI%20Trojan%20Upgrade',
        );

        const reparsed = ProxyUtils.parse(output)[0];
        expect(reparsed['ws-opts'].path).to.equal('/upgrade?a=1&b=2');
        expect(reparsed['ws-opts']['v2ray-http-upgrade-fast-open']).to.equal(
            true,
        );
        expect(reparsed['ws-opts']['_v2ray-http-upgrade-ed']).to.equal('1024');
        expect(reparsed['ws-opts']).to.not.have.property('max-early-data');
        expect(reparsed['ws-opts']).to.not.have.property(
            'early-data-header-name',
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
