import { expect } from 'chai';
import { describe, it } from 'mocha';

import $ from '@/core/app';
import { ProxyUtils } from '@/core/proxy-utils';
import {
    UUID,
    expectSubset,
    loadProducedJson,
    loadProducedYaml,
    produceExternal,
    produceInternal,
} from './helpers';

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

describe('Proxy structured producers', function () {
    it('filters unsupported Clash proxies by default and normalizes vmess ws early data', function () {
        const proxies = [
            {
                type: 'vmess',
                name: 'Clash VMess',
                server: 'vmess.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'chacha20',
                aead: true,
                tls: true,
                sni: 'sni.example.com',
                network: 'ws',
                'ws-opts': {
                    path: '/ws?a=1&ed=2048&b=2',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            },
            {
                type: 'vless',
                name: 'Clash Reality',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                flow: 'xtls-rprx-vision',
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
        ];

        const internal = produceInternal('Clash', proxies);
        const external = loadProducedYaml('Clash', proxies);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expectSubset(internal[0], {
            type: 'vmess',
            name: 'Clash VMess',
            cipher: 'auto',
            alterId: 0,
            servername: 'sni.example.com',
            'ws-opts': {
                path: '/ws?a=1&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'early-data-header-name': 'Sec-WebSocket-Protocol',
                'max-early-data': 2048,
            },
        });
    });

    it('normalizes Loon tls-profile before emitting Mihomo client fingerprints', function () {
        const [proxy] = ProxyUtils.parse(
            `Loon IOS26=vmess,loon-ios26.example.com,443,auto,"${UUID}",over-tls=true,tls-profile=ios26,alterId=0`,
        );
        const output = loadProducedYaml('Mihomo', proxy);

        expect(proxy._loon_tls_profile).to.equal('ios26');
        expect(proxy['client-fingerprint']).to.equal('ios');
        expect(output.proxies[0]['client-fingerprint']).to.equal('ios');
        expect(output.proxies[0]['client-fingerprint']).to.not.equal('ios26');
        expect(output.proxies[0]).to.not.have.property('_loon_tls_profile');
    });

    it('normalizes VMess security values for documented target platforms', function () {
        const invalidSecurityProxy = {
            type: 'vmess',
            name: 'VMess Invalid Security',
            server: 'vmess-invalid.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'aes-128-ctr',
            alterId: 0,
        };
        const chachaProxy = {
            ...invalidSecurityProxy,
            name: 'VMess Chacha Security',
            cipher: 'chacha20-poly1305',
        };
        const legacyChachaAliasProxy = {
            ...invalidSecurityProxy,
            name: 'VMess Chacha Alias Security',
            cipher: 'chacha20-ietf-poly1305',
        };
        const noneSecurityProxy = {
            ...invalidSecurityProxy,
            name: 'VMess None Security',
            cipher: 'none',
        };
        const zeroSecurityProxy = {
            ...invalidSecurityProxy,
            name: 'VMess Zero Security',
            cipher: 'zero',
        };
        const getEgernVmess = (items, name) =>
            items.find((item) => item.vmess?.name === name)?.vmess;

        expectSubset(
            getEgernVmess(
                produceInternal('Egern', invalidSecurityProxy),
                'VMess Invalid Security',
            ),
            {
                security: 'auto',
            },
        );
        expectSubset(
            getEgernVmess(
                loadProducedYaml('Egern', invalidSecurityProxy).proxies,
                'VMess Invalid Security',
            ),
            {
                security: 'auto',
            },
        );

        expect(produceExternal('Loon', invalidSecurityProxy)).to.include(
            ',auto,"',
        );
        expect(produceExternal('Loon', chachaProxy)).to.include(
            ',chacha20-ietf-poly1305,"',
        );

        expect(produceExternal('Surge', invalidSecurityProxy)).to.not.include(
            'encrypt-method=',
        );
        expect(produceExternal('Surge', chachaProxy)).to.include(
            ',encrypt-method=chacha20-ietf-poly1305',
        );

        expect(produceExternal('QX', invalidSecurityProxy)).to.include(
            'method=chacha20-poly1305',
        );
        expect(produceExternal('QX', legacyChachaAliasProxy)).to.include(
            'method=chacha20-poly1305',
        );
        expect(produceExternal('QX', noneSecurityProxy)).to.include(
            'method=none',
        );

        for (const platform of ['Clash', 'Stash']) {
            expect(
                loadProducedYaml(platform, invalidSecurityProxy).proxies[0]
                    .cipher,
            ).to.equal('auto');
            expect(
                loadProducedYaml(platform, legacyChachaAliasProxy).proxies[0]
                    .cipher,
            ).to.equal('chacha20-poly1305');
            expect(
                loadProducedYaml(platform, noneSecurityProxy).proxies[0].cipher,
            ).to.equal('none');
            expect(
                loadProducedYaml(platform, zeroSecurityProxy).proxies[0].cipher,
            ).to.equal('auto');
        }

        expect(
            loadProducedYaml('Mihomo', invalidSecurityProxy).proxies[0].cipher,
        ).to.equal('auto');
        expect(
            loadProducedYaml('Mihomo', legacyChachaAliasProxy).proxies[0]
                .cipher,
        ).to.equal('chacha20-poly1305');
        expect(
            loadProducedYaml('Mihomo', zeroSecurityProxy).proxies[0].cipher,
        ).to.equal('zero');
        expect(
            loadProducedYaml('Shadowrocket', invalidSecurityProxy).proxies[0]
                .cipher,
        ).to.equal('auto');
        expect(
            loadProducedYaml('Shadowrocket', legacyChachaAliasProxy).proxies[0]
                .cipher,
        ).to.equal('chacha20-poly1305');
        expect(
            loadProducedYaml('Shadowrocket', zeroSecurityProxy).proxies[0]
                .cipher,
        ).to.equal('zero');

        expect(
            loadProducedJson('sing-box', invalidSecurityProxy).outbounds[0]
                .security,
        ).to.equal('auto');
        expect(
            loadProducedJson('sing-box', legacyChachaAliasProxy).outbounds[0]
                .security,
        ).to.equal('chacha20-poly1305');
    });

    it('keeps unsupported Clash proxies when include-unsupported-proxy is enabled', function () {
        const internal = produceInternal(
            'Clash',
            {
                type: 'vless',
                name: 'Clash Reality',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                flow: 'xtls-rprx-vision',
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
            { 'include-unsupported-proxy': true },
        );

        expect(internal).to.have.length(1);
        expectSubset(internal[0], {
            type: 'vless',
            name: 'Clash Reality',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });
    });

    it('keeps only websocket shadowsocks v2ray-plugin modes for Mihomo and Stash by default', function () {
        const buildProxy = (name, mode) => ({
            type: 'ss',
            name,
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'v2ray-plugin',
            'plugin-opts': {
                mode,
                host: 'cdn.example.com',
                path: '/socket',
                tls: true,
            },
        });

        const proxies = [
            buildProxy('WS', 'websocket'),
            buildProxy('QUIC', 'quic'),
        ];

        for (const platform of ['Mihomo', 'Stash']) {
            const internal = produceInternal(platform, proxies);
            const external = loadProducedYaml(platform, proxies, {
                'include-unsupported-proxy': true,
            });

            expect(internal, platform).to.have.length(1);
            expect(internal[0].name, platform).to.equal('WS');
            expect(
                external.proxies.map((proxy) => proxy.name),
                platform,
            ).to.deep.equal(['WS', 'QUIC']);
        }
    });

    it('keeps Mihomo Snell versions 1 through 5', function () {
        const proxies = [1, 2, 3, 4, 5, 6].map((version) => ({
            type: 'snell',
            name: `Snell ${version}`,
            server: 'snell.example.com',
            port: 44046,
            psk: 'secret',
            version,
            udp: true,
        }));

        const internal = produceInternal('Mihomo', proxies);
        const external = loadProducedYaml('Mihomo', proxies);

        expect(internal.map((proxy) => proxy.version)).to.deep.equal([
            1, 2, 3, 4, 5,
        ]);
        expect(external.proxies.map((proxy) => proxy.version)).to.deep.equal([
            1, 2, 3, 4, 5,
        ]);
        expect(
            internal.find((proxy) => proxy.version === 1),
        ).to.not.have.property('udp');
        expect(
            internal.find((proxy) => proxy.version === 2),
        ).to.not.have.property('udp');
        expect(internal.find((proxy) => proxy.version === 4).udp).to.equal(
            true,
        );
        expect(internal.find((proxy) => proxy.version === 5).udp).to.equal(
            true,
        );
    });

    it('keeps supported Snell in sing-box by default', function () {
        const proxy = {
            type: 'snell',
            name: 'sing-box Snell',
            server: 'snell.example.com',
            port: 44046,
            psk: 'secret',
            version: 5,
            _userkey: 'user-secret',
            udp: false,
            tfo: true,
            'fast-open': true,
            reuse: true,
            'dialer-proxy': 'proxy-out',
            'ip-version': 'v4-only',
            _dns_server: 'dns-out',
            _domain_resolver: {
                client_subnet: '1.2.3.0/24',
            },
            'obfs-opts': {
                mode: 'tls',
                host: 'obfs.example.com',
                path: '/ignored-by-sing-box',
            },
        };

        const { result: internal, errors } = captureErrors(() =>
            produceInternal('sing-box', proxy),
        );
        const external = loadProducedJson('sing-box', proxy);

        expect(errors).to.deep.equal([]);
        expect(internal).to.have.length(1);
        expectSubset(internal[0], {
            tag: 'sing-box Snell',
            type: 'snell',
            server: 'snell.example.com',
            server_port: 44046,
            psk: 'secret',
            version: 4,
            userkey: 'user-secret',
            reuse: true,
            network: 'tcp',
            obfs_mode: 'tls',
            obfs_host: 'obfs.example.com',
            tcp_fast_open: true,
            udp_fragment: true,
            detour: 'proxy-out',
            domain_resolver: {
                server: 'dns-out',
                strategy: 'ipv4_only',
                client_subnet: '1.2.3.0/24',
            },
        });
        expect(internal[0]).to.not.have.property('obfs_uri');
        expectSubset(external.outbounds[0], internal[0]);
    });

    it('keeps sing-box supported Snell versions by default and maps v5 to v4', function () {
        const proxies = [1, 4, 5, 6, '4x'].map((version) => ({
            type: 'snell',
            name: `sing-box Snell ${version}`,
            server: 'snell.example.com',
            port: 44046,
            psk: 'secret',
            version,
            mode: 'unshaped',
            udp: true,
            reuse: true,
            'obfs-opts': {
                mode: 'http',
                host: 'obfs.example.com',
            },
        }));

        const { result, errors } = captureErrors(() =>
            produceInternal('sing-box', proxies),
        );

        expect(result.map((proxy) => proxy.version)).to.deep.equal([4, 4, 6]);
        expect(result[1].tag).to.equal('sing-box Snell 5');
        expect(result[2].mode).to.equal('unshaped');
        expect(result[2]).to.not.have.property('obfs_mode');
        expect(errors).to.have.length(2);
        expect(errors[0]).to.include(
            'Platform sing-box does not support snell version 1',
        );
        expect(errors[1]).to.include(
            'Platform sing-box does not support snell version 4x',
        );
    });

    it('keeps legacy Snell versions when include-unsupported-proxy is enabled', function () {
        const proxies = [1, 2, 3, 4, 5, 6, '4x'].map((version) => ({
            type: 'snell',
            name: `sing-box Snell ${version}`,
            server: 'snell.example.com',
            port: 44046,
            psk: 'secret',
            version,
            _userkey: `user-${version}`,
            udp: true,
            reuse: true,
        }));

        const { result, errors } = captureErrors(() =>
            produceInternal('sing-box', proxies, {
                'include-unsupported-proxy': true,
            }),
        );

        expect(result.map((proxy) => proxy.version)).to.deep.equal([
            1, 2, 3, 4, 5, 6,
        ]);
        expect(
            result.find((proxy) => proxy.version === 1),
        ).to.not.have.property('network');
        expect(
            result.find((proxy) => proxy.version === 3),
        ).to.not.have.property('reuse');
        expect(result.find((proxy) => proxy.version === 4).reuse).to.equal(
            true,
        );
        expect(result.find((proxy) => proxy.version === 5).userkey).to.equal(
            'user-5',
        );
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include(
            'Platform sing-box does not support snell version 4x',
        );
    });

    it('exports parsed Surge Snell lines to sing-box Snell outbounds', function () {
        const [proxy] = ProxyUtils.parse(
            'Surge Snell = snell,surge-snell.example.com,443,psk=secret,version=5,obfs=http,obfs-host=obfs.example.com,obfs-uri=/snell,reuse=true,tfo=true,udp-relay=false,underlying-proxy=proxy-out',
        );

        const output = loadProducedJson('sing-box', proxy, {
            'include-unsupported-proxy': true,
        });

        expectSubset(output.outbounds[0], {
            tag: 'Surge Snell',
            type: 'snell',
            server: 'surge-snell.example.com',
            server_port: 443,
            psk: 'secret',
            version: 5,
            reuse: true,
            network: 'tcp',
            obfs_mode: 'http',
            obfs_host: 'obfs.example.com',
            tcp_fast_open: true,
            detour: 'proxy-out',
        });
        expect(output.outbounds[0]).to.not.have.property('obfs_uri');
    });

    it('exports Snell shadow-tls plugin form to sing-box chained outbounds', function () {
        const output = loadProducedJson(
            'sing-box',
            {
                type: 'snell',
                name: 'sing-box Snell ShadowTLS',
                server: 'snell.example.com',
                port: 44046,
                psk: 'secret',
                version: 4,
                udp: false,
                tfo: true,
                'fast-open': true,
                reuse: true,
                'dialer-proxy': 'proxy-out',
                'ip-version': 'v6-only',
                _dns_server: 'dns-out',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'shadow-pass',
                    version: 3,
                },
                'obfs-opts': {
                    mode: 'http',
                    host: 'obfs.example.com',
                },
            },
            { 'include-unsupported-proxy': true },
        );

        expect(output.outbounds).to.have.length(2);
        expectSubset(output.outbounds[0], {
            tag: 'sing-box Snell ShadowTLS',
            type: 'snell',
            psk: 'secret',
            version: 4,
            reuse: true,
            network: 'tcp',
            obfs_mode: 'http',
            obfs_host: 'obfs.example.com',
            detour: 'sing-box Snell ShadowTLS_shadowtls',
        });
        expect(output.outbounds[0]).to.not.have.property('server');
        expect(output.outbounds[0]).to.not.have.property('server_port');
        expect(output.outbounds[0]).to.not.have.property('tcp_fast_open');
        expectSubset(output.outbounds[1], {
            tag: 'sing-box Snell ShadowTLS_shadowtls',
            type: 'shadowtls',
            server: 'snell.example.com',
            server_port: 44046,
            version: 3,
            password: 'shadow-pass',
            udp_fragment: true,
            tcp_fast_open: true,
            detour: 'proxy-out',
            tls: {
                enabled: true,
                server_name: 'mask.example.com',
            },
            domain_resolver: {
                server: 'dns-out',
                strategy: 'ipv6_only',
            },
        });
        expect(output.outbounds[1].tls).to.not.have.property('utls');
    });

    it('exports parsed Surge Snell shadow-tls lines to sing-box chained outbounds', function () {
        const [proxy] = ProxyUtils.parse(
            'Surge Snell ShadowTLS = snell,surge-snell.example.com,443,psk=secret,version=5,reuse=true,tfo=true,udp-relay=false,underlying-proxy=proxy-out,shadow-tls-password=shadow-pass,shadow-tls-sni=mask.example.com,shadow-tls-version=3',
        );

        const output = loadProducedJson('sing-box', proxy, {
            'include-unsupported-proxy': true,
        });

        expectSubset(output.outbounds[0], {
            tag: 'Surge Snell ShadowTLS',
            type: 'snell',
            psk: 'secret',
            version: 5,
            reuse: true,
            network: 'tcp',
            detour: 'Surge Snell ShadowTLS_shadowtls',
        });
        expectSubset(output.outbounds[1], {
            tag: 'Surge Snell ShadowTLS_shadowtls',
            type: 'shadowtls',
            server: 'surge-snell.example.com',
            server_port: 443,
            version: 3,
            password: 'shadow-pass',
            detour: 'proxy-out',
            tls: {
                server_name: 'mask.example.com',
            },
        });
    });

    it('exports parsed Surge Snell shadow-tls ALPN lines to sing-box chained outbounds', function () {
        const [proxy] = ProxyUtils.parse(
            'Surge Snell ShadowTLS ALPN = snell,surge-snell.example.com,443,psk=secret,version=5,alpn="h2,http/1.1",shadow-tls-password=shadow-pass,shadow-tls-sni=mask.example.com,shadow-tls-version=3',
        );

        const output = loadProducedJson('sing-box', proxy, {
            'include-unsupported-proxy': true,
        });

        expectSubset(output.outbounds[1], {
            tag: 'Surge Snell ShadowTLS ALPN_shadowtls',
            type: 'shadowtls',
            tls: {
                server_name: 'mask.example.com',
                alpn: ['h2', 'http/1.1'],
            },
        });
    });

    it('emits Mihomo Snell shadow-tls as obfs-opts mode shadow-tls', function () {
        const proxy = {
            type: 'snell',
            name: 'Mihomo Snell ShadowTLS',
            server: 'mihomo-snell.example.com',
            port: 443,
            psk: 'secret',
            version: 4,
            udp: false,
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
                alpn: ['h2', 'http/1.1'],
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        const external = loadProducedYaml('Mihomo', proxy);

        expectSubset(internal[0], {
            type: 'snell',
            name: 'Mihomo Snell ShadowTLS',
            server: 'mihomo-snell.example.com',
            port: 443,
            psk: 'secret',
            version: 4,
            'obfs-opts': {
                mode: 'shadow-tls',
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
                alpn: ['h2', 'http/1.1'],
            },
        });
        expect(internal[0]).to.not.have.property('plugin');
        expect(internal[0]).to.not.have.property('plugin-opts');
        expectSubset(external.proxies[0], {
            type: 'snell',
            name: 'Mihomo Snell ShadowTLS',
            'obfs-opts': {
                mode: 'shadow-tls',
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
                alpn: ['h2', 'http/1.1'],
            },
        });
        expect(external.proxies[0]).to.not.have.property('plugin');
        expect(external.proxies[0]).to.not.have.property('plugin-opts');
    });

    it('filters Mihomo Snell shadow-tls when obfs also exists', function () {
        const proxy = {
            type: 'snell',
            name: 'Mihomo Snell ShadowTLS With Obfs',
            server: 'mihomo-snell.example.com',
            port: 443,
            psk: 'secret',
            version: 4,
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
            },
            'obfs-opts': {
                mode: 'http',
                host: 'obfs.example.com',
            },
        };

        const { result: internal, errors } = captureErrors(() =>
            produceInternal('Mihomo', proxy),
        );
        const { result: external, errors: externalErrors } = captureErrors(() =>
            loadProducedYaml('Mihomo', proxy),
        );

        expect(errors).to.deep.equal([
            'Platform Mihomo does not support Snell shadow-tls with obfs for proxy Mihomo Snell ShadowTLS With Obfs. Proxy has been filtered.',
        ]);
        expect(externalErrors).to.deep.equal(errors);
        expect(internal).to.have.length(0);
        expect(external).to.deep.equal({ proxies: null });
    });

    it('exports Mihomo-style Snell obfs shadow-tls objects to sing-box chained outbounds', function () {
        const [proxy] = ProxyUtils.parse(`proxies:
  - name: Mihomo Snell ShadowTLS
    type: snell
    server: mihomo-snell.example.com
    port: 443
    psk: secret
    version: 4
    udp: false
    obfs-opts:
      mode: shadow-tls
      host: mask.example.com
      password: shadow-pass
      version: 2
      alpn:
        - h2
        - http/1.1`);

        const output = loadProducedJson('sing-box', proxy, {
            'include-unsupported-proxy': true,
        });

        expectSubset(output.outbounds[0], {
            tag: 'Mihomo Snell ShadowTLS',
            type: 'snell',
            psk: 'secret',
            version: 4,
            network: 'tcp',
            detour: 'Mihomo Snell ShadowTLS_shadowtls',
        });
        expectSubset(output.outbounds[1], {
            tag: 'Mihomo Snell ShadowTLS_shadowtls',
            type: 'shadowtls',
            server: 'mihomo-snell.example.com',
            server_port: 443,
            version: 2,
            password: 'shadow-pass',
            tls: {
                server_name: 'mask.example.com',
                alpn: ['h2', 'http/1.1'],
            },
        });
    });

    it('exports Shadowsocks shadow-tls plugin ALPN to sing-box shadowtls tls options', function () {
        const [proxy] = ProxyUtils.parse(`proxies:
  - name: SS ShadowTLS ALPN
    type: ss
    server: ss.example.com
    port: 443
    cipher: chacha20-ietf-poly1305
    password: password
    plugin: shadow-tls
    client-fingerprint: chrome
    plugin-opts:
      host: cloud.tencent.com
      password: shadow_tls_password
      version: 2
      alpn:
        - h2
        - http/1.1`);

        const output = loadProducedJson('sing-box', proxy);

        expect(output.outbounds).to.have.length(2);
        expectSubset(output.outbounds[0], {
            tag: 'SS ShadowTLS ALPN',
            type: 'shadowsocks',
            method: 'chacha20-ietf-poly1305',
            password: 'password',
            detour: 'SS ShadowTLS ALPN_shadowtls',
        });
        expectSubset(output.outbounds[1], {
            tag: 'SS ShadowTLS ALPN_shadowtls',
            type: 'shadowtls',
            server: 'ss.example.com',
            server_port: 443,
            version: 2,
            password: 'shadow_tls_password',
            tls: {
                enabled: true,
                server_name: 'cloud.tencent.com',
                alpn: ['h2', 'http/1.1'],
                utls: {
                    enabled: true,
                    fingerprint: 'chrome',
                },
            },
        });
    });

    it('does not emit sing-box ShadowTLS uTLS without client fingerprint', function () {
        const [proxy] = ProxyUtils.parse(`proxies:
  - name: SS ShadowTLS No Fingerprint
    type: ss
    server: ss.example.com
    port: 443
    cipher: 2022-blake3-aes-128-gcm
    password: password
    udp-over-tcp: true
    udp-over-tcp-version: 2
    plugin: shadow-tls
    plugin-opts:
      host: gateway.icloud.com
      password: shadow_tls_password
      version: 3`);

        const output = loadProducedJson('sing-box', proxy);
        const shadowtls = output.outbounds.find(
            (item) => item.tag === 'SS ShadowTLS No Fingerprint_shadowtls',
        );

        expectSubset(shadowtls, {
            tls: {
                enabled: true,
                server_name: 'gateway.icloud.com',
            },
        });
        expect(shadowtls.tls).to.not.have.property('utls');
    });

    it('omits unsupported sing-box ShadowTLS uTLS fingerprints', function () {
        const [proxy] = ProxyUtils.parse(`proxies:
  - name: SS ShadowTLS Unsupported Fingerprint
    type: ss
    server: ss.example.com
    port: 443
    cipher: chacha20-ietf-poly1305
    password: password
    plugin: shadow-tls
    client-fingerprint: chrome120
    plugin-opts:
      host: cloud.tencent.com
      password: shadow_tls_password
      version: 2`);

        const output = loadProducedJson('sing-box', proxy);
        const shadowtls = output.outbounds.find(
            (item) =>
                item.tag === 'SS ShadowTLS Unsupported Fingerprint_shadowtls',
        );

        expectSubset(shadowtls, {
            tls: {
                enabled: true,
                server_name: 'cloud.tencent.com',
            },
        });
        expect(shadowtls.tls).to.not.have.property('utls');
    });

    it('keeps only Shadowsocks shadow-tls versions 1 through 3 for Mihomo', function () {
        const buildShadowTlsProxy = (name, version) => ({
            type: 'ss',
            name,
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version,
            },
        });
        const proxies = [
            buildShadowTlsProxy('ShadowTLS 1', 1),
            {
                type: 'ss',
                name: 'ShadowTLS 2',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'shadow-pass',
                    version: 2,
                },
            },
            buildShadowTlsProxy('ShadowTLS 3', 3),
            buildShadowTlsProxy('ShadowTLS 4', 4),
            {
                type: 'vmess',
                name: 'VMess ShadowTLS',
                server: 'vmess.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'shadow-pass',
                    version: 3,
                },
            },
        ];

        const internal = produceInternal('Mihomo', proxies);
        const external = loadProducedYaml('Mihomo', proxies);

        expect(internal.map((proxy) => proxy.name)).to.deep.equal([
            'ShadowTLS 1',
            'ShadowTLS 2',
            'ShadowTLS 3',
        ]);
        expect(
            internal.map((proxy) => proxy['plugin-opts'].version),
        ).to.deep.equal([1, 2, 3]);
        expect(external.proxies.map((proxy) => proxy.name)).to.deep.equal([
            'ShadowTLS 1',
            'ShadowTLS 2',
            'ShadowTLS 3',
        ]);
    });

    it('keeps only supported shadowsocks v2ray-plugin modes for Shadowrocket by default', function () {
        const buildProxy = (name, mode) => ({
            type: 'ss',
            name,
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'v2ray-plugin',
            'plugin-opts': {
                mode,
                host: 'cdn.example.com',
                path: '/socket',
                tls: true,
            },
        });

        const proxies = [
            buildProxy('WS', 'websocket'),
            buildProxy('QUIC', 'quic'),
            buildProxy('HTTP2', 'http2'),
            buildProxy('MKCP', 'mkcp'),
            buildProxy('GRPC', 'grpc'),
            buildProxy('TLS', 'tls'),
        ];

        const internal = produceInternal('Shadowrocket', proxies);
        const external = loadProducedYaml('Shadowrocket', proxies, {
            'include-unsupported-proxy': true,
        });

        expect(internal.map((proxy) => proxy.name)).to.deep.equal([
            'WS',
            'QUIC',
            'HTTP2',
            'MKCP',
            'GRPC',
        ]);
        expect(external.proxies.map((proxy) => proxy.name)).to.deep.equal([
            'WS',
            'QUIC',
            'HTTP2',
            'MKCP',
            'GRPC',
            'TLS',
        ]);
    });

    it('adds Clash.Meta reality defaults and preserves websocket early data', function () {
        const proxy = {
            type: 'vless',
            name: 'Reality',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            flow: 'xtls-rprx-vision',
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=2048&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        };

        const internal = produceInternal('ClashMeta', proxy)[0];
        const external = loadProducedYaml('ClashMeta', proxy);

        expectSubset(internal, {
            type: 'vless',
            name: 'Reality',
            'client-fingerprint': 'chrome',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
            'ws-opts': {
                path: '/ws?a=1&b=2',
                'early-data-header-name': 'Sec-WebSocket-Protocol',
                'max-early-data': 2048,
            },
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'Reality',
            'client-fingerprint': 'chrome',
        });
    });

    it('normalizes websocket early data query params for Stash and Shadowrocket', function () {
        const proxy = {
            type: 'vmess',
            name: 'WS Early Query',
            server: 'vmess.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=2048&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        };

        for (const platform of ['Stash', 'Shadowrocket']) {
            const internal = produceInternal(platform, proxy)[0];
            expectSubset(internal, {
                name: 'WS Early Query',
                'ws-opts': {
                    path: '/ws?a=1&b=2',
                    'early-data-header-name': 'Sec-WebSocket-Protocol',
                    'max-early-data': 2048,
                },
            });
        }
    });

    it('leaves unsafe websocket early data query params untouched', function () {
        const proxy = {
            type: 'vmess',
            name: 'WS Unsafe Early Query',
            server: 'vmess.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=999999999999999999999&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
        };

        const wsOpts = produceInternal('Clash', proxy)[0]['ws-opts'];

        expect(wsOpts.path).to.equal('/ws?a=1&ed=999999999999999999999&b=2');
        expect(wsOpts).to.not.have.property('early-data-header-name');
        expect(wsOpts).to.not.have.property('max-early-data');
    });

    it('keeps explicit websocket early data fields over stale path query values', function () {
        const proxy = {
            type: 'vmess',
            name: 'WS Explicit Early Fields',
            server: 'vmess.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=2048&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'max-early-data': 4096,
                'early-data-header-name': 'X-Data',
            },
        };

        for (const platform of [
            'Clash',
            'ClashMeta',
            'Stash',
            'Shadowrocket',
        ]) {
            const wsOpts = loadProducedYaml(platform, proxy).proxies[0][
                'ws-opts'
            ];

            expect(wsOpts.path, platform).to.equal('/ws?a=1&b=2');
            expect(wsOpts['max-early-data'], platform).to.equal(4096);
            expect(wsOpts['early-data-header-name'], platform).to.equal(
                'X-Data',
            );
        }
    });

    it('normalizes httpupgrade path early data as httpupgrade metadata', function () {
        const proxy = {
            type: 'vmess',
            name: 'HTTPUpgrade Early Query',
            server: 'vmess.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&ed=2048&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'v2ray-http-upgrade': true,
            },
        };

        for (const platform of [
            'Clash',
            'ClashMeta',
            'Stash',
            'Shadowrocket',
        ]) {
            const wsOpts = produceInternal(platform, proxy, {
                'include-unsupported-proxy': true,
            })[0]['ws-opts'];

            expect(wsOpts.path).to.equal('/upgrade?a=1&b=2');
            expect(wsOpts['v2ray-http-upgrade']).to.equal(true);
            expect(wsOpts['v2ray-http-upgrade-fast-open']).to.equal(true);
            expect(wsOpts['_v2ray-http-upgrade-ed']).to.equal('2048');
            expect(wsOpts).to.not.have.property('early-data-header-name');
            expect(wsOpts).to.not.have.property('max-early-data');

            const externalWsOpts = loadProducedYaml(platform, proxy, {
                'include-unsupported-proxy': true,
            }).proxies[0]['ws-opts'];
            expect(externalWsOpts.path).to.equal('/upgrade?a=1&b=2');
            expect(externalWsOpts['v2ray-http-upgrade-fast-open']).to.equal(
                true,
            );
            expect(externalWsOpts).to.not.have.property(
                '_v2ray-http-upgrade-ed',
            );
        }
    });

    it('keeps explicit httpupgrade early data over stale path query values', function () {
        const proxy = {
            type: 'vmess',
            name: 'HTTPUpgrade Explicit Early',
            server: 'vmess.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&ed=1024&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                '_v2ray-http-upgrade-ed': '4096',
            },
        };

        for (const platform of [
            'Clash',
            'ClashMeta',
            'Stash',
            'Shadowrocket',
        ]) {
            const wsOpts = produceInternal(platform, proxy, {
                'include-unsupported-proxy': true,
            })[0]['ws-opts'];

            expect(wsOpts.path, platform).to.equal('/upgrade?a=1&b=2');
            expect(wsOpts['_v2ray-http-upgrade-ed'], platform).to.equal('4096');
        }
    });

    it('does not emit websocket early data fields for httpupgrade transports', function () {
        const directProxy = {
            type: 'vmess',
            name: 'HTTPUpgrade Legacy Fields',
            server: 'vmess.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade',
                headers: {
                    Host: 'cdn.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                'max-early-data': 1024,
                'early-data-header-name': 'X-Upgrade',
            },
        };
        const directProxyWithoutPath = {
            type: 'vmess',
            name: 'HTTPUpgrade Legacy Fields Without Path',
            server: 'vmess.example.com',
            port: 443,
            uuid: UUID,
            cipher: 'auto',
            alterId: 0,
            network: 'ws',
            'ws-opts': {
                headers: {
                    Host: 'cdn.example.com',
                },
                'v2ray-http-upgrade': true,
                'v2ray-http-upgrade-fast-open': true,
                'max-early-data': 2048,
                'early-data-header-name': 'X-Upgrade',
            },
        };
        const parsedVlessProxy = ProxyUtils.parse(
            `vless://${UUID}@vless-upgrade.example.com:443?type=httpupgrade&host=upgrade.example.com&path=%2Fupgrade&ed=1024&eh=X-Upgrade#VLESS%20Upgrade`,
        )[0];

        for (const proxy of [
            directProxy,
            directProxyWithoutPath,
            parsedVlessProxy,
        ]) {
            for (const platform of [
                'Clash',
                'ClashMeta',
                'Stash',
                'Shadowrocket',
            ]) {
                const externalWsOpts = loadProducedYaml(platform, proxy, {
                    'include-unsupported-proxy': true,
                }).proxies[0]['ws-opts'];

                expect(externalWsOpts['v2ray-http-upgrade']).to.equal(true);
                expect(externalWsOpts).to.not.have.property(
                    'early-data-header-name',
                );
                expect(externalWsOpts).to.not.have.property('max-early-data');
                expect(externalWsOpts).to.not.have.property(
                    '_v2ray-http-upgrade-ed',
                );
            }
        }
    });

    it('emits Mihomo VLESS xhttp proxies and preserves xhttp options', function () {
        const proxy = {
            type: 'vless',
            name: 'XHTTP',
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
                'sc-min-posts-interval-ms': 300,
                'session-table': 'Base62',
                'session-length': '16-32',
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        const external = loadProducedYaml('Mihomo', proxy);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expectSubset(internal[0], {
            type: 'vless',
            name: 'XHTTP',
            network: 'xhttp',
            servername: 'sni.example.com',
            'xhttp-opts': {
                path: '/xhttp',
                headers: {
                    Host: 'cdn.example.com',
                },
                mode: 'stream-up',
                'no-grpc-header': true,
                'x-padding-bytes': '64-128',
                'sc-min-posts-interval-ms': 300,
                'session-table': 'Base62',
                'session-length': '16-32',
            },
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'XHTTP',
            network: 'xhttp',
            servername: 'sni.example.com',
            'xhttp-opts': {
                'sc-min-posts-interval-ms': 300,
                'session-table': 'Base62',
                'session-length': '16-32',
            },
        });
    });

    it('warns when Mihomo ECH sidecar DNS fields are exported', function () {
        const proxy = {
            type: 'vless',
            name: 'Mihomo ECH DNS',
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
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    'ech-opts': {
                        enable: true,
                        _dns: 'https://dns.example.com/dns-query',
                        'query-server-name': 'download-ech.example.com',
                    },
                },
            },
        };

        const { result: external, warnings } = captureWarns(() =>
            loadProducedYaml('Mihomo', proxy),
        );

        expect(external.proxies).to.have.length(1);
        expect(warnings).to.have.length(2);
        expect(warnings[0]).to.include(
            'mihomo 不支持在 ech-opts 中配置 ECH DNS',
        );
        expect(warnings[0]).to.include(
            'dns["nameserver-policy"]["ech.example.com"] = ["https://1.1.1.1/dns-query"]',
        );
        expect(warnings[1]).to.include(
            'dns["nameserver-policy"]["download-ech.example.com"] = ["https://dns.example.com/dns-query"]',
        );
    });

    it('emits Mihomo VLESS xhttp download settings with scMinPostsIntervalMs', function () {
        const proxy = {
            type: 'vless',
            name: 'XHTTP Download',
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
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    servername: 'download-sni.example.com',
                    path: '/download',
                    host: 'download-host.example.com',
                    'sc-min-posts-interval-ms': 300,
                    'session-table': 'Base62',
                    'session-length': '8-12',
                    'reuse-settings': {
                        'max-connections': '8',
                        'h-max-reusable-secs': '900',
                    },
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        const external = loadProducedYaml('Mihomo', proxy);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expectSubset(internal[0], {
            type: 'vless',
            name: 'XHTTP Download',
            network: 'xhttp',
            servername: 'sni.example.com',
            'xhttp-opts': {
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    servername: 'download-sni.example.com',
                    path: '/download',
                    host: 'download-host.example.com',
                    'sc-min-posts-interval-ms': 300,
                    'session-table': 'Base62',
                    'session-length': '8-12',
                    'reuse-settings': {
                        'max-connections': '8',
                        'h-max-reusable-secs': '900',
                    },
                },
            },
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'XHTTP Download',
            network: 'xhttp',
            servername: 'sni.example.com',
            'xhttp-opts': {
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    servername: 'download-sni.example.com',
                    path: '/download',
                    host: 'download-host.example.com',
                    'sc-min-posts-interval-ms': 300,
                    'session-table': 'Base62',
                    'session-length': '8-12',
                    'reuse-settings': {
                        'max-connections': '8',
                        'h-max-reusable-secs': '900',
                    },
                },
            },
        });
    });

    it('skips Mihomo VLESS xhttp stream-one proxies when download-settings are present', function () {
        const proxy = {
            type: 'vless',
            name: 'XHTTP Stream One Download',
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
                mode: 'stream-one',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        const external = ProxyUtils.produce([proxy], 'Mihomo', 'external');

        expect(internal).to.have.length(0);
        expect(external.trim()).to.equal('proxies:');
    });

    it('keeps VLESS xhttp proxy when download-settings reality-opts has empty public-key and main reality is valid', function () {
        // 上行（主代理）有合法 reality-opts，下行（download-settings）用
        // reality-opts: { public-key: '' } 取消继承上行 Reality，合法配置。
        const proxy = {
            type: 'vless',
            name: 'XHTTP Reality Cancel',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    servername: 'download-sni.example.com',
                    'reality-opts': { 'public-key': '' },
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        expect(internal).to.have.length(1);
        expect(internal[0].name).to.equal('XHTTP Reality Cancel');
    });

    it('filters out VLESS xhttp proxy when download-settings reality-opts is empty object (broken URI) even with valid main reality', function () {
        // 下行 download-settings.reality-opts 为 {} (没有 public-key 字段)，
        // 代表 URI 里声明了 security=reality 但 pbk 缺失，属于残缺配置，应过滤。
        const proxy = {
            type: 'vless',
            name: 'XHTTP Broken Reality',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    'reality-opts': {},
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        expect(internal).to.have.length(0);
    });

    it('filters out VLESS xhttp proxy when download-settings reality-opts has empty public-key and main has no valid reality', function () {
        // 下行 download-settings 有 reality-opts: { public-key: '' }，
        // 但上行主代理本身没有合法 Reality，属于无效配置，应被过滤。
        const proxy = {
            type: 'vless',
            name: 'XHTTP Invalid Reality',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    'reality-opts': { 'public-key': '' },
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        expect(internal).to.have.length(0);
    });

    it('filters out VLESS proxy when main reality-opts has empty public-key', function () {
        // 主代理 reality-opts.public-key 为空，无论下行如何，都应被过滤。
        const proxy = {
            type: 'vless',
            name: 'Reality Empty Key',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'tcp',
            'reality-opts': { 'public-key': '' },
        };

        const internal = produceInternal('Mihomo', proxy);
        expect(internal).to.have.length(0);
    });

    it('does not let include-unsupported-proxy bypass malformed VLESS Reality validation', function () {
        const proxy = {
            type: 'vless',
            name: 'Reality Empty Key',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'tcp',
            'reality-opts': { 'public-key': '' },
        };

        const { result, errors } = captureErrors(() =>
            produceInternal('Mihomo', proxy, {
                'include-unsupported-proxy': true,
            }),
        );

        expect(result).to.have.length(0);
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include(
            'Skipping VLESS Reality proxy Reality Empty Key: empty reality-opts.public-key',
        );
    });

    it('normalizes Stash TUIC defaults and external yaml wrapper', function () {
        const proxy = {
            type: 'tuic',
            name: 'TUIC',
            server: 'tuic.example.com',
            port: 443,
            uuid: UUID,
            password: 'secret',
            tfo: true,
        };

        const internal = produceInternal('Stash', proxy)[0];
        const external = loadProducedYaml('Stash', proxy);

        expectSubset(internal, {
            type: 'tuic',
            name: 'TUIC',
            alpn: ['h3'],
            'fast-open': true,
            version: 5,
        });
        expectSubset(external.proxies[0], {
            type: 'tuic',
            name: 'TUIC',
            alpn: ['h3'],
            'fast-open': true,
            version: 5,
        });
    });

    it('emits Stash VLESS TCP REALITY proxies without validating flow values', function () {
        const proxy = {
            type: 'vless',
            name: 'Stash Reality Custom Flow',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'tcp',
            flow: 'xtls-rprx-unknown',
            sni: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        };

        const internal = produceInternal('Stash', proxy);
        const external = loadProducedYaml('Stash', proxy);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expectSubset(internal[0], {
            type: 'vless',
            name: 'Stash Reality Custom Flow',
            network: 'tcp',
            flow: 'xtls-rprx-unknown',
            servername: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'Stash Reality Custom Flow',
            network: 'tcp',
            flow: 'xtls-rprx-unknown',
            servername: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });
    });

    it('keeps default-tcp Stash VLESS REALITY proxies when network is omitted', function () {
        const proxy = {
            type: 'vless',
            name: 'Implicit TCP Reality',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        };

        const internal = produceInternal('Stash', proxy);
        const external = loadProducedYaml('Stash', proxy);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expectSubset(internal[0], {
            type: 'vless',
            name: 'Implicit TCP Reality',
            servername: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });
        expect(external.proxies[0]).to.not.have.property('network');
    });

    it('keeps Stash VLESS TCP REALITY proxies when URI input omits flow', function () {
        const proxies = ProxyUtils.parse(
            `vless://${UUID}@vless.example.com:443?type=tcp&security=reality&sni=sni.example.com&pbk=pubkey&sid=08#No%20Flow`,
        );

        const internal = produceInternal('Stash', proxies);
        const external = loadProducedYaml('Stash', proxies);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expect(internal[0]).to.not.have.property('flow');
        expectSubset(internal[0], {
            type: 'vless',
            name: 'No Flow',
            network: 'tcp',
            servername: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'No Flow',
            network: 'tcp',
            servername: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });
    });

    it('keeps Stash VLESS TCP REALITY nodes while still filtering non-tcp and unsupported variants', function () {
        const proxies = [
            {
                type: 'vless',
                name: 'Supported Reality',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'tcp',
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
            {
                type: 'vless',
                name: 'Custom Flow',
                server: 'unsupported-flow.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'tcp',
                flow: 'xtls-rprx-unknown',
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
            {
                type: 'vless',
                name: 'Reality WS',
                server: 'vless-ws.example.com',
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
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
            {
                type: 'vless',
                name: 'XHTTP',
                server: 'vless-xhttp.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'xhttp',
                'xhttp-opts': {
                    path: '/xhttp',
                },
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
            {
                type: 'vless',
                name: 'Encrypted VLESS',
                server: 'encrypted.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'tcp',
                encryption: 'aes-128-gcm',
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
        ];

        const internal = produceInternal('Stash', proxies);
        const external = loadProducedYaml('Stash', proxies);

        expect(internal).to.have.length(2);
        expect(external.proxies).to.have.length(2);
        expect(internal.map((proxy) => proxy.name)).to.deep.equal([
            'Supported Reality',
            'Custom Flow',
        ]);
        expect(external.proxies.map((proxy) => proxy.name)).to.deep.equal([
            'Supported Reality',
            'Custom Flow',
        ]);
        expectSubset(internal[0], {
            type: 'vless',
            name: 'Supported Reality',
        });
        expectSubset(internal[1], {
            type: 'vless',
            name: 'Custom Flow',
            flow: 'xtls-rprx-unknown',
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'Supported Reality',
        });
        expectSubset(external.proxies[1], {
            type: 'vless',
            name: 'Custom Flow',
            flow: 'xtls-rprx-unknown',
        });
    });

    it('keeps shadow-tls plugin objects for Shadowrocket', function () {
        const proxy = {
            type: 'ss',
            name: 'ShadowTLS SS',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 3,
            },
            'skip-cert-verify': true,
        };

        const internal = produceInternal('Shadowrocket', proxy)[0];
        const external = loadProducedYaml('Shadowrocket', proxy);

        expectSubset(internal, {
            type: 'ss',
            name: 'ShadowTLS SS',
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 3,
            },
        });
        expectSubset(external.proxies[0], {
            type: 'ss',
            plugin: 'shadow-tls',
        });
    });

    it('emits Snell shadow-tls as obfs-opts mode shadow-tls for Shadowrocket', function () {
        const proxy = {
            type: 'snell',
            name: 'Shadowrocket Snell ShadowTLS',
            server: 'snell.example.com',
            port: 44046,
            psk: 'secret',
            version: 4,
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
                alpn: ['h2', 'http/1.1'],
            },
        };

        const internal = produceInternal('Shadowrocket', proxy)[0];
        const external = loadProducedYaml('Shadowrocket', proxy);

        expectSubset(internal, {
            type: 'snell',
            name: 'Shadowrocket Snell ShadowTLS',
            'obfs-opts': {
                mode: 'shadow-tls',
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
                alpn: ['h2', 'http/1.1'],
            },
        });
        expect(internal).to.not.have.property('plugin');
        expect(internal).to.not.have.property('plugin-opts');
        expectSubset(external.proxies[0], {
            type: 'snell',
            'obfs-opts': {
                mode: 'shadow-tls',
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
                alpn: ['h2', 'http/1.1'],
            },
        });
    });

    it('filters Shadowrocket Snell shadow-tls when obfs also exists', function () {
        const proxy = {
            type: 'snell',
            name: 'Shadowrocket Snell ShadowTLS With Obfs',
            server: 'snell.example.com',
            port: 44046,
            psk: 'secret',
            version: 4,
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 2,
            },
            'obfs-opts': {
                mode: 'http',
                host: 'obfs.example.com',
            },
        };

        const { result: internal, errors } = captureErrors(() =>
            produceInternal('Shadowrocket', proxy),
        );
        const { result: external, errors: externalErrors } = captureErrors(() =>
            loadProducedYaml('Shadowrocket', proxy),
        );

        expect(errors).to.deep.equal([
            'Platform Shadowrocket does not support Snell shadow-tls with obfs for proxy Shadowrocket Snell ShadowTLS With Obfs. Proxy has been filtered.',
        ]);
        expect(externalErrors).to.deep.equal(errors);
        expect(internal).to.have.length(0);
        expect(external).to.deep.equal({ proxies: null });
    });

    it('maps canonical shadowsocks tls fields into Shadowrocket structured output', function () {
        const proxy = {
            type: 'ss',
            name: 'Shadowrocket SS TLS',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
            'skip-cert-verify': true,
        };

        const internal = produceInternal('Shadowrocket', proxy)[0];
        const external = loadProducedYaml('Shadowrocket', proxy);

        expectSubset(internal, {
            type: 'ss',
            name: 'Shadowrocket SS TLS',
            tls: true,
            servername: 'a.com',
            'skip-cert-verify': true,
        });
        // expect(internal).to.not.have.property('sni');
        expectSubset(external.proxies[0], {
            type: 'ss',
            name: 'Shadowrocket SS TLS',
            tls: true,
            servername: 'a.com',
            'skip-cert-verify': true,
        });
        // expect(external.proxies[0]).to.not.have.property('sni');
    });

    it('keeps canonical shadowsocks tls nodes without servername in Shadowrocket output when sni is absent', function () {
        const proxy = {
            type: 'ss',
            name: 'Shadowrocket SS TLS No Host',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
        };

        const internal = produceInternal('Shadowrocket', proxy)[0];
        const external = loadProducedYaml('Shadowrocket', proxy);

        expectSubset(internal, {
            type: 'ss',
            name: 'Shadowrocket SS TLS No Host',
            tls: true,
        });
        expect(internal).to.not.have.property('sni');
        expect(internal).to.not.have.property('servername');
        expectSubset(external.proxies[0], {
            type: 'ss',
            name: 'Shadowrocket SS TLS No Host',
            tls: true,
        });
        expect(external.proxies[0]).to.not.have.property('sni');
        expect(external.proxies[0]).to.not.have.property('servername');
    });

    it('maps canonical shadowsocks tcp tls fields into Shadowrocket structured output', function () {
        const proxy = {
            type: 'ss',
            name: 'Shadowrocket SS TLS TCP',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
            network: 'tcp',
        };

        const internal = produceInternal('Shadowrocket', proxy)[0];
        const external = loadProducedYaml('Shadowrocket', proxy);

        expectSubset(internal, {
            type: 'ss',
            name: 'Shadowrocket SS TLS TCP',
            tls: true,
            network: 'tcp',
            servername: 'a.com',
        });
        // expect(internal).to.not.have.property('sni');
        expectSubset(external.proxies[0], {
            type: 'ss',
            name: 'Shadowrocket SS TLS TCP',
            tls: true,
            network: 'tcp',
            servername: 'a.com',
        });
        // expect(external.proxies[0]).to.not.have.property('sni');
    });

    it('maps shadowsocks shadow-tls plugin objects into Egern nested structures', function () {
        const proxy = {
            type: 'ss',
            name: 'ShadowTLS SS',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'shadow-tls',
            'plugin-opts': {
                host: 'mask.example.com',
                password: 'shadow-pass',
                version: 3,
            },
        };

        const internal = produceInternal('Egern', proxy)[0];
        const external = loadProducedYaml('Egern', proxy);

        expectSubset(internal, {
            shadowsocks: {
                name: 'ShadowTLS SS',
                method: 'aes-128-gcm',
                server: 'ss.example.com',
                port: 8388,
                password: 'secret',
                shadow_tls: {
                    password: 'shadow-pass',
                    sni: 'mask.example.com',
                },
            },
        });
        expectSubset(external.proxies[0], {
            shadowsocks: {
                name: 'ShadowTLS SS',
            },
        });
    });

    it('emits Egern SSH nodes with auth, host keys, flags, and shadow-tls', function () {
        const proxies = [
            {
                type: 'ssh',
                name: 'Egern SSH Plugin',
                server: 'ssh.example.com',
                port: 443,
                username: 'user',
                password: 'pass',
                'private-key': 'ssh-key',
                'host-key': ['ssh-ed25519 AAAATEST'],
                tfo: true,
                'block-quic': 'off',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'shadow-pass',
                    version: 3,
                },
            },
            {
                type: 'ss',
                name: 'Healthy SS',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
            },
        ];
        const getProxy = (items, type, name) =>
            items.find((item) => item[type]?.name === name)?.[type];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        for (const output of [internal, external.proxies]) {
            expectSubset(getProxy(output, 'ssh', 'Egern SSH Plugin'), {
                name: 'Egern SSH Plugin',
                server: 'ssh.example.com',
                port: 443,
                username: 'user',
                password: 'pass',
                private_key: 'ssh-key',
                host_keys: ['ssh-ed25519 AAAATEST'],
                tfo: true,
                block_quic: false,
                shadow_tls: {
                    password: 'shadow-pass',
                    sni: 'mask.example.com',
                },
            });
            expectSubset(getProxy(output, 'shadowsocks', 'Healthy SS'), {
                method: 'aes-128-gcm',
                password: 'secret',
            });
        }
    });

    it('skips Egern SSH with unsupported shadow-tls versions', function () {
        const proxies = [
            {
                type: 'ssh',
                name: 'Invalid SSH ShadowTLS',
                server: 'ssh.example.com',
                port: 443,
                username: 'user',
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'shadow-pass',
                    version: 2,
                },
            },
            {
                type: 'ss',
                name: 'Healthy SS',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
            },
        ];

        const { result, errors } = captureErrors(() =>
            produceInternal('Egern', proxies),
        );
        const { result: external, errors: externalErrors } = captureErrors(() =>
            loadProducedYaml('Egern', proxies),
        );

        expect(result).to.have.length(1);
        expect(errors).to.have.length(1);
        expect(errors[0]).to.include('shadow-tls version 2 is not supported');
        expect(externalErrors).to.have.length(1);
        expect(externalErrors[0]).to.include(
            'shadow-tls version 2 is not supported',
        );
        expectSubset(result[0], {
            shadowsocks: {
                name: 'Healthy SS',
            },
        });
        expect(external.proxies).to.have.length(1);
        expectSubset(external.proxies[0], {
            shadowsocks: {
                name: 'Healthy SS',
            },
        });
    });

    it('emits Egern HTTP and HTTPS root headers', function () {
        const proxies = [
            {
                type: 'http',
                name: 'Egern HTTP Headers',
                server: 'http.example.com',
                port: 8080,
                username: 'user',
                password: 'pass',
                headers: {
                    'X-Client': 'Egern',
                    'X-Token': 'abc',
                },
            },
            {
                type: 'http',
                name: 'Egern HTTPS Headers',
                server: 'https.example.com',
                port: 443,
                tls: true,
                sni: 'sni.example.com',
                headers: {
                    'X-Padding': '<random-string(16-32)>',
                },
            },
        ];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        expectSubset(internal[0], {
            http: {
                name: 'Egern HTTP Headers',
                headers: {
                    'X-Client': 'Egern',
                    'X-Token': 'abc',
                },
            },
        });
        expectSubset(internal[1], {
            https: {
                name: 'Egern HTTPS Headers',
                headers: {
                    'X-Padding': '<random-string(16-32)>',
                },
            },
        });
        expectSubset(external.proxies[0], {
            http: {
                headers: {
                    'X-Client': 'Egern',
                    'X-Token': 'abc',
                },
            },
        });
        expectSubset(external.proxies[1], {
            https: {
                headers: {
                    'X-Padding': '<random-string(16-32)>',
                },
            },
        });
    });

    it('emits Egern Hysteria2 upload bandwidth as bandwidth', function () {
        const proxy = {
            type: 'hysteria2',
            name: 'Egern Hysteria2 Bandwidth',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            up: '50 Mbps',
            sni: 'peer.example.com',
        };

        const internal = produceInternal('Egern', proxy)[0];
        const external = loadProducedYaml('Egern', proxy);

        expectSubset(internal, {
            hysteria2: {
                name: 'Egern Hysteria2 Bandwidth',
                bandwidth: 50,
            },
        });
        expectSubset(external.proxies[0], {
            hysteria2: {
                name: 'Egern Hysteria2 Bandwidth',
                bandwidth: 50,
            },
        });
    });

    it('emits Egern Snell versions 1 through 5', function () {
        const proxies = [1, 2, 3, 4, 5, 6, '4x'].map((version) => ({
            type: 'snell',
            name: `Egern Snell ${version}`,
            server: 'snell.example.com',
            port: 44046,
            psk: 'secret',
            version,
            udp: true,
            reuse: true,
            tfo: true,
            'block-quic': 'on',
            'obfs-opts': {
                mode: 'http',
                host: 'obfs.example.com',
            },
        }));
        const getProxy = (items, name) =>
            items.find((item) => item.snell?.name === name)?.snell;
        const getVersions = (items) => items.map((item) => item.snell.version);

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        expect(getVersions(internal)).to.deep.equal([1, 2, 3, 4, 5]);
        expect(getVersions(external.proxies)).to.deep.equal([1, 2, 3, 4, 5]);
        expect(getProxy(internal, 'Egern Snell 1')).to.not.have.property(
            'udp_relay',
        );
        expect(getProxy(internal, 'Egern Snell 2')).to.not.have.property(
            'udp_relay',
        );
        for (const output of [internal, external.proxies]) {
            expectSubset(getProxy(output, 'Egern Snell 5'), {
                name: 'Egern Snell 5',
                server: 'snell.example.com',
                port: 44046,
                psk: 'secret',
                version: 5,
                udp_relay: true,
                reuse: true,
                obfs: 'http',
                obfs_host: 'obfs.example.com',
                tfo: true,
                block_quic: true,
            });
        }
    });

    it('emits Egern Snell shadow-tls variants', function () {
        const proxies = [
            {
                type: 'snell',
                name: 'Egern Snell ShadowTLS',
                server: 'snell-shadowtls.example.com',
                port: 44046,
                psk: 'secret',
                version: 5,
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'shadow-pass',
                    version: 3,
                },
            },
            {
                type: 'snell',
                name: 'Egern Snell Plain',
                server: 'snell.example.com',
                port: 44046,
                psk: 'secret',
                version: 5,
            },
        ];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        for (const output of [internal, external.proxies]) {
            expect(output).to.have.length(2);
            expectSubset(output[0], {
                snell: {
                    name: 'Egern Snell ShadowTLS',
                    server: 'snell-shadowtls.example.com',
                    version: 5,
                    shadow_tls: {
                        password: 'shadow-pass',
                        sni: 'mask.example.com',
                    },
                },
            });
            expectSubset(output[1], {
                snell: {
                    name: 'Egern Snell Plain',
                    server: 'snell.example.com',
                    version: 5,
                },
            });
        }
    });

    it('emits Egern SOCKS5 over TLS and root REALITY options', function () {
        const proxies = [
            {
                type: 'socks5',
                name: 'Egern SOCKS5 TLS Reality',
                server: 'socks.example.com',
                port: 1080,
                username: 'user',
                password: 'pass',
                tls: true,
                sni: 'socks-sni.example.com',
                tfo: false,
                udp: true,
                'skip-cert-verify': false,
                'tls-fingerprint': 'SHA256:SOCKS',
                'reality-opts': {
                    'public-key': 'socks-pub',
                    'short-id': '01',
                },
            },
            {
                type: 'https',
                name: 'Egern HTTPS Reality',
                server: 'https.example.com',
                port: 443,
                sni: 'https-sni.example.com',
                'skip-cert-verify': true,
                'reality-opts': {
                    'public-key': 'https-pub',
                    'short-id': '02',
                },
            },
            {
                type: 'trojan',
                name: 'Egern Trojan Reality',
                server: 'trojan.example.com',
                port: 443,
                password: 'secret',
                tfo: false,
                udp: true,
                'skip-cert-verify': false,
                'reality-opts': {
                    'public-key': 'trojan-pub',
                    'short-id': '03',
                },
            },
            {
                type: 'anytls',
                name: 'Egern AnyTLS Reality',
                server: 'anytls.example.com',
                port: 443,
                password: 'secret',
                network: 'tcp',
                'reality-opts': {
                    'public-key': 'anytls-pub',
                    'short-id': '04',
                },
            },
        ];
        const getProxy = (items, type, name) =>
            items.find((item) => item[type]?.name === name)?.[type];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        for (const output of [internal, external.proxies]) {
            expectSubset(
                getProxy(output, 'socks5_tls', 'Egern SOCKS5 TLS Reality'),
                {
                    server: 'socks.example.com',
                    port: 1080,
                    username: 'user',
                    password: 'pass',
                    tfo: false,
                    udp_relay: true,
                    skip_tls_verify: false,
                    fingerprint_sha256: 'SHA256:SOCKS',
                    reality: {
                        public_key: 'socks-pub',
                        short_id: '01',
                    },
                },
            );
            expectSubset(getProxy(output, 'https', 'Egern HTTPS Reality'), {
                skip_tls_verify: true,
                reality: {
                    public_key: 'https-pub',
                    short_id: '02',
                },
            });
            expectSubset(getProxy(output, 'trojan', 'Egern Trojan Reality'), {
                tfo: false,
                udp_relay: true,
                skip_tls_verify: false,
                reality: {
                    public_key: 'trojan-pub',
                    short_id: '03',
                },
            });
            expectSubset(getProxy(output, 'anytls', 'Egern AnyTLS Reality'), {
                reality: {
                    public_key: 'anytls-pub',
                    short_id: '04',
                },
            });
        }
    });

    it('emits Egern VMess and VLESS gRPC Gun transports with REALITY', function () {
        const proxies = [
            {
                type: 'vmess',
                name: 'Egern VMess gRPC Reality',
                server: 'vmess.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'aes-128-gcm',
                alterId: 0,
                tls: true,
                sni: 'vmess-sni.example.com',
                network: 'grpc',
                tfo: false,
                udp: true,
                'skip-cert-verify': true,
                'tls-fingerprint': 'SHA256:GRPC',
                'grpc-opts': {
                    'grpc-service-name': 'vmess-service',
                    '_grpc-type': 'gun',
                },
                'reality-opts': {
                    'public-key': 'vmess-pub',
                    'short-id': '05',
                },
            },
            {
                type: 'vless',
                name: 'Egern VLESS gRPC Reality',
                server: 'vless.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                sni: 'vless-sni.example.com',
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'vless-service',
                },
                'reality-opts': {
                    'public-key': 'vless-pub',
                    'short-id': '06',
                },
            },
            {
                type: 'vmess',
                name: 'Egern VMess gRPC Multi',
                server: 'vmess-multi.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'multi-service',
                    '_grpc-type': 'multi',
                },
            },
        ];
        const getProxy = (items, type, name) =>
            items.find((item) => item[type]?.name === name)?.[type];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        for (const output of [internal, external.proxies]) {
            expect(output).to.have.length(2);
            expectSubset(
                getProxy(output, 'vmess', 'Egern VMess gRPC Reality'),
                {
                    user_id: UUID,
                    security: 'aes-128-gcm',
                    legacy: false,
                    tfo: false,
                    udp_relay: true,
                    transport: {
                        grpc: {
                            service_name: 'vmess-service',
                            sni: 'vmess-sni.example.com',
                            skip_tls_verify: true,
                            fingerprint_sha256: 'SHA256:GRPC',
                            reality: {
                                public_key: 'vmess-pub',
                                short_id: '05',
                            },
                        },
                    },
                },
            );
            expectSubset(
                getProxy(output, 'vless', 'Egern VLESS gRPC Reality'),
                {
                    user_id: UUID,
                    transport: {
                        grpc: {
                            service_name: 'vless-service',
                            sni: 'vless-sni.example.com',
                            reality: {
                                public_key: 'vless-pub',
                                short_id: '06',
                            },
                        },
                    },
                },
            );
        }
    });

    it('emits Egern fingerprint_sha256 for supported TLS proxy types and transports', function () {
        const fingerprint = 'SHA256:FINGERPRINT';
        const proxies = [
            {
                type: 'http',
                name: 'Egern HTTPS Fingerprint',
                server: 'https.example.com',
                port: 443,
                tls: true,
                sni: 'sni.example.com',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'https',
                name: 'Egern Direct HTTPS Fingerprint',
                server: 'direct-https.example.com',
                port: 443,
                sni: 'direct-sni.example.com',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'trojan',
                name: 'Egern Trojan Fingerprint',
                server: 'trojan.example.com',
                port: 443,
                password: 'secret',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'anytls',
                name: 'Egern AnyTLS Fingerprint',
                server: 'anytls.example.com',
                port: 443,
                password: 'secret',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'hysteria2',
                name: 'Egern Hysteria2 Fingerprint',
                server: 'hy2.example.com',
                port: 443,
                password: 'secret',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'tuic',
                name: 'Egern TUIC Fingerprint',
                server: 'tuic.example.com',
                port: 443,
                uuid: UUID,
                password: 'secret',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'vmess',
                name: 'Egern VMess H2 Fingerprint',
                server: 'vmess-h2.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                tls: true,
                network: 'h2',
                sni: 'vmess-h2.example.com',
                'h2-opts': {
                    path: '/h2',
                    host: ['h2.example.com'],
                    headers: {
                        Host: 'fallback-h2.example.com',
                        b: 'a,b',
                    },
                },
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'vmess',
                name: 'Egern VMess TLS Fingerprint',
                server: 'vmess-tls.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                tls: true,
                network: 'tcp',
                sni: 'vmess-tls.example.com',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'vmess',
                name: 'Egern VMess WSS Fingerprint',
                server: 'vmess-wss.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                tls: true,
                network: 'ws',
                sni: 'vmess-wss.example.com',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'vless',
                name: 'Egern VLESS H2 Fingerprint',
                server: 'vless-h2.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'h2',
                sni: 'vless-h2.example.com',
                'h2-opts': {
                    path: '/h2',
                    host: ['h2.example.com'],
                    headers: {
                        Host: 'fallback-h2.example.com',
                        b: 'a,b',
                    },
                },
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'vless',
                name: 'Egern VLESS TLS Fingerprint',
                server: 'vless-tls.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'tcp',
                sni: 'vless-tls.example.com',
                'tls-fingerprint': fingerprint,
            },
            {
                type: 'vless',
                name: 'Egern VLESS WSS Fingerprint',
                server: 'vless-wss.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                network: 'ws',
                sni: 'vless-wss.example.com',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
                'tls-fingerprint': fingerprint,
            },
        ];
        const getProxy = (items, type, name) =>
            items.find((item) => item[type]?.name === name)?.[type];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        for (const output of [internal, external.proxies]) {
            for (const [type, name] of [
                ['https', 'Egern HTTPS Fingerprint'],
                ['https', 'Egern Direct HTTPS Fingerprint'],
                ['trojan', 'Egern Trojan Fingerprint'],
                ['anytls', 'Egern AnyTLS Fingerprint'],
                ['hysteria2', 'Egern Hysteria2 Fingerprint'],
                ['tuic', 'Egern TUIC Fingerprint'],
            ]) {
                const producedProxy = getProxy(output, type, name);
                expectSubset(producedProxy, {
                    fingerprint_sha256: fingerprint,
                });
                expect(producedProxy).to.not.have.property('tls-fingerprint');
            }

            for (const [type, name, transport] of [
                ['vmess', 'Egern VMess H2 Fingerprint', 'http2'],
                ['vmess', 'Egern VMess TLS Fingerprint', 'tls'],
                ['vmess', 'Egern VMess WSS Fingerprint', 'wss'],
                ['vless', 'Egern VLESS H2 Fingerprint', 'http2'],
                ['vless', 'Egern VLESS TLS Fingerprint', 'tls'],
                ['vless', 'Egern VLESS WSS Fingerprint', 'wss'],
            ]) {
                const producedProxy = getProxy(output, type, name);
                expectSubset(producedProxy, {
                    transport: {
                        [transport]: {
                            fingerprint_sha256: fingerprint,
                        },
                    },
                });
                expect(producedProxy).to.not.have.property('tls-fingerprint');
            }

            expectSubset(
                getProxy(output, 'vmess', 'Egern VMess H2 Fingerprint'),
                {
                    transport: {
                        http2: {
                            headers: {
                                Host: 'h2.example.com',
                                b: 'a,b',
                            },
                            sni: 'vmess-h2.example.com',
                        },
                    },
                },
            );
            expectSubset(
                getProxy(output, 'vless', 'Egern VLESS H2 Fingerprint'),
                {
                    transport: {
                        http2: {
                            headers: {
                                Host: 'h2.example.com',
                                b: 'a,b',
                            },
                            sni: 'vless-h2.example.com',
                        },
                    },
                },
            );
        }
    });

    it('omits Egern fingerprint_sha256 for blank fingerprints and non-TLS transports', function () {
        const proxies = [
            {
                type: 'http',
                name: 'Egern HTTP Plain Fingerprint',
                server: 'http.example.com',
                port: 8080,
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'https',
                name: 'Egern HTTPS Blank Fingerprint',
                server: 'https.example.com',
                port: 443,
                'tls-fingerprint': '   ',
            },
            {
                type: 'vmess',
                name: 'Egern VMess HTTP1 Fingerprint',
                server: 'vmess-http.example.com',
                port: 80,
                uuid: UUID,
                cipher: 'auto',
                network: 'http',
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'vmess',
                name: 'Egern VMess WS Fingerprint',
                server: 'vmess-ws.example.com',
                port: 80,
                uuid: UUID,
                cipher: 'auto',
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                },
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'vmess',
                name: 'Egern VMess TCP Fingerprint',
                server: 'vmess-tcp.example.com',
                port: 80,
                uuid: UUID,
                cipher: 'auto',
                network: 'tcp',
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'vless',
                name: 'Egern VLESS HTTP1 Fingerprint',
                server: 'vless-http.example.com',
                port: 80,
                uuid: UUID,
                network: 'http',
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'vless',
                name: 'Egern VLESS WS Fingerprint',
                server: 'vless-ws.example.com',
                port: 80,
                uuid: UUID,
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                },
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
            {
                type: 'vless',
                name: 'Egern VLESS TCP Fingerprint',
                server: 'vless-tcp.example.com',
                port: 80,
                uuid: UUID,
                network: 'tcp',
                'tls-fingerprint': 'SHA256:FINGERPRINT',
            },
        ];
        const findByName = (items, name) =>
            Object.values(
                items.find((item) =>
                    Object.values(item).some((proxy) => proxy?.name === name),
                ),
            )[0];
        const expectNoFingerprint = (proxy) => {
            expect(proxy).to.not.have.property('fingerprint_sha256');
            expect(proxy).to.not.have.property('tls-fingerprint');
            if (proxy.transport) {
                for (const transport of Object.values(proxy.transport)) {
                    expect(transport).to.not.have.property(
                        'fingerprint_sha256',
                    );
                }
            }
        };

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        for (const output of [internal, external.proxies]) {
            for (const proxy of proxies) {
                expectNoFingerprint(findByName(output, proxy.name));
            }
        }
    });

    it('trims Egern fingerprint_sha256 values', function () {
        const external = loadProducedYaml('Egern', {
            type: 'https',
            name: 'Egern HTTPS Trimmed Fingerprint',
            server: 'https.example.com',
            port: 443,
            'tls-fingerprint': '  SHA256:FINGERPRINT  ',
        });

        expect(external.proxies[0].https.fingerprint_sha256).to.equal(
            'SHA256:FINGERPRINT',
        );
    });

    it('keeps Mihomo h2 headers while lifting Host into h2-opts host', function () {
        const input = `proxies:
  - name: vmess-h2
    type: vmess
    server: server
    port: 443
    uuid: ${UUID}
    alterId: 32
    cipher: auto
    network: h2
    tls: true
    fingerprint: xxxx
    h2-opts:
      host:
        - http.example.com
        - http-alt.example.com
      headers:
        Host: v2ray.com
        b: a
      path:
`;
        const [proxy] = ProxyUtils.parse(input);
        const external = loadProducedYaml('Mihomo', [proxy]);
        const h2Opts = external.proxies[0]['h2-opts'];

        expect(h2Opts).to.deep.equal({
            host: ['http.example.com', 'http-alt.example.com'],
            headers: {
                b: 'a',
            },
            path: '/',
        });
        expect(external.proxies[0].servername).to.equal('http.example.com');
        expect(h2Opts.headers).to.not.have.property('Host');
        expect(h2Opts.headers).to.not.have.property('host');
    });

    it('keeps h2 Host arrays when lifting legacy headers into h2-opts host', function () {
        const proxy = {
            type: 'vmess',
            name: 'VMess H2 Legacy Host Array',
            server: 'server',
            port: 443,
            uuid: UUID,
            alterId: 0,
            cipher: 'auto',
            tls: true,
            network: 'h2',
            'h2-opts': {
                path: '/',
                headers: {
                    Host: ['cdn.example.com', 'alt.example.com'],
                    'User-Agent': 'curl/7.77.0',
                },
            },
        };

        for (const platform of ['Clash', 'Mihomo', 'Stash', 'Shadowrocket']) {
            const external = loadProducedYaml(platform, proxy);
            const h2Opts = external.proxies[0]['h2-opts'];

            expect(h2Opts).to.deep.equal({
                host: ['cdn.example.com', 'alt.example.com'],
                headers: {
                    'User-Agent': 'curl/7.77.0',
                },
                path: '/',
            });
            expect(h2Opts.headers).to.not.have.property('Host');
            expect(h2Opts.headers).to.not.have.property('host');
        }
    });

    it('keeps Mihomo HTTP headers and filters unsupported h2-connect/trusttunnel header variants', function () {
        const { result, errors } = captureErrors(() =>
            produceInternal('Mihomo', [
                {
                    type: 'http',
                    name: 'Mihomo HTTPS Headers',
                    server: 'https.example.com',
                    port: 443,
                    tls: true,
                    headers: {
                        'X-Token': 'abc',
                    },
                },
                {
                    type: 'h2-connect',
                    name: 'Mihomo H2 Headers',
                    server: 'h2.example.com',
                    port: 443,
                    headers: {
                        'X-Padding': '<random-string(16)>',
                    },
                },
                {
                    type: 'trusttunnel',
                    name: 'Mihomo Trust Headers',
                    server: 'trust.example.com',
                    port: 443,
                    headers: {
                        'X-Client': 'Surge',
                    },
                },
            ]),
        );

        expect(result).to.have.length(1);
        expectSubset(result[0], {
            type: 'http',
            name: 'Mihomo HTTPS Headers',
            headers: {
                'X-Token': 'abc',
            },
        });
        expect(errors).to.have.length(2);
        expect(errors[0]).to.include(
            'Target platform Mihomo does not support headers for HTTP/2 CONNECT proxy Mihomo H2 Headers',
        );
        expect(errors[1]).to.include(
            'Target platform Mihomo does not support headers for TrustTunnel proxy Mihomo Trust Headers',
        );
    });

    it('keeps Mihomo h2-connect/trusttunnel header variants when include-unsupported-proxy is enabled', function () {
        const { result, errors } = captureErrors(() =>
            produceInternal(
                'Mihomo',
                [
                    {
                        type: 'h2-connect',
                        name: 'Mihomo H2 Headers',
                        server: 'h2.example.com',
                        port: 443,
                        headers: {
                            'X-Padding': '<random-string(16)>',
                        },
                    },
                    {
                        type: 'trusttunnel',
                        name: 'Mihomo Trust Headers',
                        server: 'trust.example.com',
                        port: 443,
                        headers: {
                            'X-Client': 'Surge',
                        },
                    },
                ],
                { 'include-unsupported-proxy': true },
            ),
        );

        expect(result).to.have.length(2);
        expectSubset(result[0], {
            type: 'h2-connect',
            name: 'Mihomo H2 Headers',
            headers: {
                'X-Padding': '<random-string(16)>',
            },
        });
        expectSubset(result[1], {
            type: 'trusttunnel',
            name: 'Mihomo Trust Headers',
            headers: {
                'X-Client': 'Surge',
            },
        });
        expect(errors).to.have.length(0);
    });

    it('preserves supported HTTP root headers for sing-box and JSON outputs', function () {
        const buildProxy = (name) => ({
            type: 'http',
            name,
            server: 'http.example.com',
            port: 8080,
            username: 'user',
            password: 'pass',
            headers: {
                'X-Token': 'abc',
            },
        });

        const singBoxInternal = produceInternal(
            'sing-box',
            buildProxy('sing-box HTTP Headers'),
        );
        const singBoxExternal = loadProducedJson(
            'sing-box',
            buildProxy('sing-box HTTP Headers'),
        );
        const jsonExternal = loadProducedJson(
            'JSON',
            buildProxy('JSON HTTP Headers'),
        );

        expect(singBoxInternal).to.have.length(1);
        expectSubset(singBoxInternal[0], {
            type: 'http',
            tag: 'sing-box HTTP Headers',
            headers: {
                'X-Token': 'abc',
            },
        });
        expectSubset(singBoxExternal.outbounds[0], {
            type: 'http',
            tag: 'sing-box HTTP Headers',
            headers: {
                'X-Token': 'abc',
            },
        });
        expectSubset(jsonExternal[0], {
            type: 'http',
            name: 'JSON HTTP Headers',
            headers: {
                'X-Token': 'abc',
            },
        });
    });

    it('maps shadowsocks obfs plugin fields into Egern nested structures', function () {
        const proxy = {
            type: 'ss',
            name: 'Egern SS Obfs TLS',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'obfs',
            'plugin-opts': {
                mode: 'tls',
                host: 'legacy.example.com',
                path: '/legacy',
            },
        };

        const internal = produceInternal('Egern', proxy)[0];
        const external = loadProducedYaml('Egern', proxy);

        expectSubset(internal, {
            shadowsocks: {
                name: 'Egern SS Obfs TLS',
                method: 'aes-128-gcm',
                server: 'ss.example.com',
                port: 8388,
                password: 'secret',
                obfs: 'tls',
                obfs_host: 'legacy.example.com',
                obfs_uri: '/legacy',
            },
        });
        expectSubset(external.proxies[0], {
            shadowsocks: {
                name: 'Egern SS Obfs TLS',
                obfs: 'tls',
                obfs_host: 'legacy.example.com',
                obfs_uri: '/legacy',
            },
        });
    });

    it('preserves numeric v2ray-plugin mux values across non-Mihomo Clash-family YAML producers', function () {
        const buildProxy = (name, mux) => ({
            type: 'ss',
            name,
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            'skip-cert-verify': false,
            plugin: 'v2ray-plugin',
            'plugin-opts': {
                mode: 'websocket',
                host: 'cdn.example.com',
                path: '/socket',
                tls: true,
                'skip-cert-verify': true,
                mux,
            },
        });

        for (const platform of ['Clash', 'Shadowrocket', 'Stash']) {
            const internal = produceInternal(platform, [
                buildProxy(`${platform} Mux On`, 1),
                buildProxy(`${platform} Mux Off`, 0),
            ]);

            expect(internal, platform).to.have.length(2);
            expectSubset(internal[0], {
                name: `${platform} Mux On`,
                'plugin-opts': {
                    tls: true,
                    'skip-cert-verify': true,
                    mux: 1,
                },
            });
            expectSubset(internal[1], {
                name: `${platform} Mux Off`,
                'plugin-opts': {
                    tls: true,
                    'skip-cert-verify': true,
                    mux: 0,
                },
            });
        }
    });

    it('normalizes plugin mux values to booleans for Mihomo-compatible YAML producers', function () {
        const buildProxy = (name, mux) => ({
            type: 'ss',
            name,
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'v2ray-plugin',
            'plugin-opts': {
                mode: 'websocket',
                host: 'cdn.example.com',
                path: '/socket',
                tls: true,
                mux,
            },
        });
        const cases = [
            ['Number On', 1, true],
            ['Number Off', 0, false],
            ['Boolean On', true, true],
            ['Boolean Off', false, false],
            ['String True', ' TRUE ', true],
            ['String False', ' false ', false],
            ['String One', '1', true],
            ['String Zero', '0', false],
        ];
        const proxies = cases.map(([name, mux]) =>
            buildProxy(`Mihomo ${name}`, mux),
        );

        for (const platform of ['Mihomo', 'ClashMeta']) {
            const internal = produceInternal(platform, proxies);
            const external = loadProducedYaml(platform, proxies);

            expect(internal, platform).to.have.length(cases.length);
            expect(external.proxies, platform).to.have.length(cases.length);

            cases.forEach(([name, , expected], index) => {
                expect(
                    internal[index]['plugin-opts'].mux,
                    `${platform} internal ${name}`,
                ).to.equal(expected);
                expect(
                    external.proxies[index]['plugin-opts'].mux,
                    `${platform} external ${name}`,
                ).to.equal(expected);
            });
        }
    });

    it('preserves Mihomo shadowsocks gost-plugin options with boolean mux', function () {
        const proxy = {
            type: 'ss',
            name: 'Mihomo Gost Plugin',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'gost-plugin',
            'plugin-opts': {
                mode: 'websocket',
                tls: true,
                fingerprint: 'SHA256:TEST',
                certificate: 'inline-test-client-cert',
                'private-key': 'inline-test-client-key',
                'skip-cert-verify': true,
                host: 'cdn.example.com',
                path: '/socket',
                mux: 1,
                headers: {
                    custom: 'value',
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        const external = loadProducedYaml('Mihomo', proxy);
        const expected = {
            type: 'ss',
            name: 'Mihomo Gost Plugin',
            plugin: 'gost-plugin',
            'plugin-opts': {
                mode: 'websocket',
                tls: true,
                fingerprint: 'SHA256:TEST',
                certificate: 'inline-test-client-cert',
                'private-key': 'inline-test-client-key',
                'skip-cert-verify': true,
                host: 'cdn.example.com',
                path: '/socket',
                mux: true,
                headers: {
                    custom: 'value',
                },
            },
        };

        expect(internal).to.have.length(1);
        expectSubset(internal[0], expected);
        expectSubset(external.proxies[0], expected);
    });

    it('keeps legacy single-line proxy output by default for Clash-style YAML producers', function () {
        const proxy = {
            type: 'ss',
            name: 'Legacy YAML',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
        };

        for (const platform of [
            'Clash',
            'ClashMeta',
            'Shadowrocket',
            'Stash',
            'Egern',
        ]) {
            const output = produceExternal(platform, proxy);

            expect(output, platform).to.match(/\n {2}- \{/);
        }
    });

    it('emits pretty yaml for Clash-style YAML producers when prettyYaml is enabled', function () {
        const proxy = {
            type: 'ss',
            name: 'Real YAML',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
        };

        for (const platform of [
            'Clash',
            'ClashMeta',
            'Shadowrocket',
            'Stash',
            'Egern',
        ]) {
            const output = produceExternal(platform, proxy, {
                prettyYaml: true,
            });
            const external = loadProducedYaml(platform, proxy, {
                prettyYaml: true,
            });

            expect(output, platform).to.not.match(/\n {2}- \{/);
            expect(external.proxies, platform).to.have.length(1);

            if (platform === 'Egern') {
                expectSubset(external.proxies[0], {
                    shadowsocks: {
                        name: 'Real YAML',
                    },
                });
            } else {
                expectSubset(external.proxies[0], {
                    type: 'ss',
                    name: 'Real YAML',
                });
            }
        }
    });

    it('emits WireGuard interface CIDR suffixes for Mihomo and Shadowrocket outputs', function () {
        const proxies = [
            {
                type: 'wireguard',
                name: 'WG Explicit CIDR',
                server: 'wg-explicit.example.com',
                port: 51820,
                'private-key': 'private-key-1',
                'public-key': 'public-key-1',
                ip: '10.0.0.2',
                ipv6: 'fd00::2',
                'ip-cidr': 24,
                'ipv6-cidr': 64,
            },
            {
                type: 'wireguard',
                name: 'WG Default CIDR',
                server: 'wg-default.example.com',
                port: 51820,
                'private-key': 'private-key-2',
                'public-key': 'public-key-2',
                ip: '10.0.0.3',
                ipv6: 'fd00::3',
            },
        ];

        for (const platform of ['Mihomo', 'Shadowrocket']) {
            const output = loadProducedYaml(platform, proxies);
            const explicit = output.proxies.find(
                (proxy) => proxy.name === 'WG Explicit CIDR',
            );
            const defaults = output.proxies.find(
                (proxy) => proxy.name === 'WG Default CIDR',
            );

            expectSubset(explicit, {
                ip: '10.0.0.2/24',
                ipv6: 'fd00::2/64',
            });
            expectSubset(defaults, {
                ip: '10.0.0.3/32',
                ipv6: 'fd00::3/128',
            });
            expect(explicit).to.not.have.property('ip-cidr');
            expect(explicit).to.not.have.property('ipv6-cidr');
            expect(defaults).to.not.have.property('ip-cidr');
            expect(defaults).to.not.have.property('ipv6-cidr');
        }
    });

    it('emits WireGuard address CIDR suffixes for sing-box exports', function () {
        const output = loadProducedJson('sing-box', [
            {
                type: 'wireguard',
                name: 'Sing-box WG Explicit CIDR',
                server: 'wg-explicit.example.com',
                port: 51820,
                'private-key': 'private-key-1',
                'public-key': 'public-key-1',
                ip: '10.0.0.2',
                ipv6: 'fd00::2',
                'ip-cidr': 24,
                'ipv6-cidr': 64,
            },
            {
                type: 'wireguard',
                name: 'Sing-box WG Default CIDR',
                server: 'wg-default.example.com',
                port: 51820,
                'private-key': 'private-key-2',
                'public-key': 'public-key-2',
                ip: '10.0.0.3',
                ipv6: 'fd00::3',
            },
        ]);

        const explicit = output.endpoints.find(
            (endpoint) => endpoint.tag === 'Sing-box WG Explicit CIDR',
        );
        const defaults = output.endpoints.find(
            (endpoint) => endpoint.tag === 'Sing-box WG Default CIDR',
        );

        expectSubset(explicit, {
            type: 'wireguard',
            address: ['10.0.0.2/24', 'fd00::2/64'],
        });
        expectSubset(defaults, {
            type: 'wireguard',
            address: ['10.0.0.3/32', 'fd00::3/128'],
        });
    });

    it('emits Tailscale endpoint fields for sing-box exports', function () {
        const output = loadProducedJson('sing-box', {
            type: 'tailscale',
            name: 'Mihomo TS',
            'state-dir': './mihomo-ts',
            'auth-key': 'tskey-auth-test',
            'control-url': 'https://headscale.example.com',
            ephemeral: true,
            hostname: 'sub-store',
            udp: true,
            'accept-routes': true,
            'exit-node': '100.64.0.1',
            'exit-node-allow-lan-access': true,
            'dialer-proxy': 'proxy-out',
            'udp-timeout': '30s',
        });

        const mihomo = output.endpoints.find(
            (endpoint) => endpoint.tag === 'Mihomo TS',
        );

        expectSubset(mihomo, {
            type: 'tailscale',
            state_directory: './mihomo-ts',
            auth_key: 'tskey-auth-test',
            control_url: 'https://headscale.example.com',
            ephemeral: true,
            hostname: 'sub-store',
            accept_routes: true,
            exit_node: '100.64.0.1',
            exit_node_allow_lan_access: true,
            detour: 'proxy-out',
            udp_timeout: '30s',
        });
        expect(mihomo).to.not.have.property('udp');
    });

    it('does not mix Tailscale control_http_client with legacy sing-box dialer fields', function () {
        const output = loadProducedJson('sing-box', {
            type: 'tailscale',
            name: 'Tailscale Control Client',
            'control-http-client': {
                detour: 'control-out',
            },
            'dialer-proxy': 'legacy-out',
        });

        const tailscale = output.endpoints.find(
            (endpoint) => endpoint.tag === 'Tailscale Control Client',
        );

        expect(tailscale.control_http_client).to.deep.equal({
            detour: 'control-out',
        });
        expect(tailscale).to.not.have.property('detour');
    });

    it('emits boolean ssh_server for sing-box Tailscale endpoints', function () {
        const output = loadProducedJson('sing-box', {
            type: 'tailscale',
            name: 'Tailscale SSH Boolean',
            'ssh-server': true,
        });

        const tailscale = output.endpoints.find(
            (endpoint) => endpoint.tag === 'Tailscale SSH Boolean',
        );

        expect(tailscale.ssh_server).to.equal(true);
    });

    it('emits object ssh_server for sing-box Tailscale endpoints', function () {
        const output = loadProducedJson('sing-box', {
            type: 'tailscale',
            name: 'Tailscale SSH Object',
            'ssh-server': {
                enabled: false,
                'disable-pty': true,
                'disable-sftp': true,
                'disable-forwarding': true,
            },
        });

        const tailscale = output.endpoints.find(
            (endpoint) => endpoint.tag === 'Tailscale SSH Object',
        );

        expect(tailscale.ssh_server).to.deep.equal({
            enabled: false,
            disable_pty: true,
            disable_sftp: true,
            disable_forwarding: true,
        });
    });

    it('does not emit gecko packet sizes for sing-box when using default values', function () {
        const output = loadProducedJson('sing-box', {
            type: 'hysteria2',
            name: 'Gecko Default Sizes',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            obfs: 'gecko',
            'obfs-password': 'mask',
        });

        const hysteria2 = output.outbounds.find(
            (outbound) => outbound.tag === 'Gecko Default Sizes',
        );

        expectSubset(hysteria2, {
            type: 'hysteria2',
            obfs: {
                type: 'gecko',
                password: 'mask',
            },
        });
        expect(hysteria2.obfs).to.not.have.property('min_packet_size');
        expect(hysteria2.obfs).to.not.have.property('max_packet_size');
    });

    it('emits a single gecko packet size for sing-box and relies on the other default', function () {
        const minOnlyOutput = loadProducedJson('sing-box', {
            type: 'hysteria2',
            name: 'Gecko Min Only',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            obfs: 'gecko',
            'obfs-password': 'mask',
            'obfs-min-packet-size': 600,
        });
        const maxOnlyOutput = loadProducedJson('sing-box', {
            type: 'hysteria2',
            name: 'Gecko Max Only',
            server: 'hy2.example.com',
            port: 443,
            password: 'secret',
            obfs: 'gecko',
            'obfs-password': 'mask',
            'obfs-max-packet-size': 1300,
        });

        const minOnly = minOnlyOutput.outbounds.find(
            (outbound) => outbound.tag === 'Gecko Min Only',
        );
        const maxOnly = maxOnlyOutput.outbounds.find(
            (outbound) => outbound.tag === 'Gecko Max Only',
        );

        expectSubset(minOnly, {
            obfs: {
                type: 'gecko',
                password: 'mask',
                min_packet_size: 600,
            },
        });
        expect(minOnly.obfs).to.not.have.property('max_packet_size');

        expectSubset(maxOnly, {
            obfs: {
                type: 'gecko',
                password: 'mask',
                max_packet_size: 1300,
            },
        });
        expect(maxOnly.obfs).to.not.have.property('min_packet_size');
    });

    it('does not emit invalid gecko packet sizes for sing-box', function () {
        const { result, errors } = captureErrors(() =>
            produceInternal('sing-box', [
                {
                    type: 'hysteria2',
                    name: 'Gecko Invalid Decimal',
                    server: 'hy2.example.com',
                    port: 443,
                    password: 'secret',
                    obfs: 'gecko',
                    'obfs-password': 'mask',
                    'obfs-min-packet-size': '600.5',
                },
                {
                    type: 'hysteria2',
                    name: 'Gecko Invalid Range',
                    server: 'hy2.example.com',
                    port: 443,
                    password: 'secret',
                    obfs: 'gecko',
                    'obfs-password': 'mask',
                    'obfs-min-packet-size': 1300,
                },
            ]),
        );

        expect(errors).to.have.length(2);
        expect(errors[0]).to.include('Gecko Invalid Decimal');
        expect(errors[1]).to.include('Gecko Invalid Range');
        for (const hysteria2 of result) {
            expect(hysteria2.obfs).to.deep.equal({
                type: 'gecko',
                password: 'mask',
            });
        }
    });

    it('clamps oversized gecko max packet size for sing-box and logs a warning', function () {
        const { result, warnings } = captureWarns(() =>
            produceInternal('sing-box', {
                type: 'hysteria2',
                name: 'Gecko Oversized Max',
                server: 'hy2.example.com',
                port: 443,
                password: 'secret',
                obfs: 'gecko',
                'obfs-password': 'mask',
                'obfs-min-packet-size': 1024,
                'obfs-max-packet-size': 4096,
            }),
        );

        expect(warnings).to.have.length(1);
        expect(warnings[0]).to.include('Gecko Oversized Max');
        expect(warnings[0]).to.include('clamped to 2048');
        expectSubset(result[0], {
            obfs: {
                type: 'gecko',
                password: 'mask',
                min_packet_size: 1024,
                max_packet_size: 2048,
            },
        });
    });

    it('emits WireGuard interface CIDR suffixes for Egern exports', function () {
        const proxies = [
            {
                type: 'wireguard',
                name: 'Egern WG Explicit CIDR',
                server: 'wg-explicit.example.com',
                port: 51820,
                'private-key': 'private-key-1',
                'public-key': 'public-key-1',
                ip: '10.0.0.2',
                ipv6: 'fd00::2',
                'ip-cidr': 24,
                'ipv6-cidr': 64,
            },
            {
                type: 'wireguard',
                name: 'Egern WG Default CIDR',
                server: 'wg-default.example.com',
                port: 51820,
                'private-key': 'private-key-2',
                'public-key': 'public-key-2',
                ip: '10.0.0.3',
                ipv6: 'fd00::3',
            },
        ];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        const explicitInternal = internal.find(
            (proxy) => proxy.wireguard?.name === 'Egern WG Explicit CIDR',
        );
        const defaultsInternal = internal.find(
            (proxy) => proxy.wireguard?.name === 'Egern WG Default CIDR',
        );
        const explicitExternal = external.proxies.find(
            (proxy) => proxy.wireguard?.name === 'Egern WG Explicit CIDR',
        );
        const defaultsExternal = external.proxies.find(
            (proxy) => proxy.wireguard?.name === 'Egern WG Default CIDR',
        );

        for (const proxy of [
            explicitInternal,
            defaultsInternal,
            explicitExternal,
            defaultsExternal,
        ]) {
            expect(proxy.wireguard).to.not.have.property('ip-cidr');
            expect(proxy.wireguard).to.not.have.property('ipv6-cidr');
        }

        expectSubset(explicitInternal, {
            wireguard: {
                local_ipv4: '10.0.0.2/24',
                local_ipv6: 'fd00::2/64',
            },
        });
        expectSubset(defaultsInternal, {
            wireguard: {
                local_ipv4: '10.0.0.3/32',
                local_ipv6: 'fd00::3/128',
            },
        });
        expectSubset(explicitExternal, {
            wireguard: {
                local_ipv4: '10.0.0.2/24',
                local_ipv6: 'fd00::2/64',
            },
        });
        expectSubset(defaultsExternal, {
            wireguard: {
                local_ipv4: '10.0.0.3/32',
                local_ipv6: 'fd00::3/128',
            },
        });
    });

    it('filters canonical shadowsocks over-tls nodes for unsupported client targets by default', function () {
        const proxy = {
            type: 'ss',
            name: 'Unsupported SS TLS',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
        };

        for (const platform of [
            'Clash',
            'ClashMeta',
            'Mihomo',
            'Stash',
            'Loon',
            'Surge',
            'SurgeMac',
            'Surfboard',
            'Egern',
            'sing-box',
            'URI',
            'V2Ray',
        ]) {
            expect(produceInternal(platform, proxy), platform).to.have.length(
                0,
            );
        }

        expect(ProxyUtils.produce([proxy], 'Clash', 'external')).to.equal(
            'proxies:\n',
        );
        expect(ProxyUtils.produce([proxy], 'Loon', 'external')).to.equal('');
        expect(ProxyUtils.produce([proxy], 'URI', 'external')).to.equal('');
        expect(produceInternal('QX', proxy), 'QX').to.have.length(1);
        expect(
            produceInternal('Shadowrocket', proxy),
            'Shadowrocket',
        ).to.have.length(1);
    });

    it('keeps canonical shadowsocks over-tls nodes when include-unsupported-proxy is enabled for Clash', function () {
        const proxy = {
            type: 'ss',
            name: 'Clash SS TLS',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
        };

        const internal = produceInternal('Clash', proxy, {
            'include-unsupported-proxy': true,
        });

        expect(internal).to.have.length(1);
        expectSubset(internal[0], {
            type: 'ss',
            name: 'Clash SS TLS',
            tls: true,
            sni: 'a.com',
        });
    });

    it('still treats canonical shadowsocks tls nodes without sni as unsupported for disallowed targets', function () {
        const proxy = {
            type: 'ss',
            name: 'Unsupported SS TLS No Host',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
        };

        expect(produceInternal('Clash', proxy)).to.have.length(0);
        expect(produceExternal('Clash', proxy)).to.equal('proxies:\n');
    });

    it('still treats canonical shadowsocks tcp tls nodes as unsupported for disallowed targets', function () {
        const proxy = {
            type: 'ss',
            name: 'Unsupported SS TLS TCP',
            server: 'ss.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'secret',
            tls: true,
            sni: 'a.com',
            network: 'tcp',
        };

        expect(produceInternal('Clash', proxy)).to.have.length(0);
        expect(ProxyUtils.produce([proxy], 'URI', 'external')).to.equal('');
    });

    it('skips invalid Egern nodes and keeps the rest of the subscription', function () {
        const proxies = [
            {
                type: 'vless',
                name: 'Invalid VLESS',
                server: 'invalid.example.com',
                port: 443,
                uuid: UUID,
                encryption: 'aes-128-gcm',
            },
            {
                type: 'ss',
                name: 'Healthy SS',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
            },
        ];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expectSubset(internal[0], {
            shadowsocks: {
                name: 'Healthy SS',
                method: 'aes-128-gcm',
            },
        });
        expectSubset(external.proxies[0], {
            shadowsocks: {
                name: 'Healthy SS',
            },
        });
    });

    it('skips Egern shadowsocks proxies with unsupported plugins and keeps the rest of the subscription', function () {
        const proxies = [
            {
                type: 'ss',
                name: 'Invalid SS Plugin',
                server: 'invalid.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
                plugin: 'v2ray-plugin',
                'plugin-opts': {
                    mode: 'websocket',
                    host: 'cdn.example.com',
                    path: '/socket',
                    tls: true,
                },
            },
            {
                type: 'ss',
                name: 'Healthy SS',
                server: 'ss.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
            },
        ];

        const internal = produceInternal('Egern', proxies);
        const external = loadProducedYaml('Egern', proxies);

        expect(internal).to.have.length(1);
        expect(external.proxies).to.have.length(1);
        expectSubset(internal[0], {
            shadowsocks: {
                name: 'Healthy SS',
                method: 'aes-128-gcm',
            },
        });
        expectSubset(external.proxies[0], {
            shadowsocks: {
                name: 'Healthy SS',
            },
        });
    });

    it('keeps numeric v2ray-plugin mux state in sing-box plugin opts', function () {
        const buildProxy = (name, mux) => ({
            type: 'ss',
            name,
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'v2ray-plugin',
            'plugin-opts': {
                mode: 'websocket',
                host: 'cdn.example.com',
                path: '/socket',
                tls: true,
                mux,
            },
        });

        const output = loadProducedJson('sing-box', [
            buildProxy('Sing-box Mux On', 1),
            buildProxy('Sing-box Mux Off', 0),
        ]);
        const muxOn = output.outbounds.find(
            (outbound) => outbound.tag === 'Sing-box Mux On',
        );
        const muxOff = output.outbounds.find(
            (outbound) => outbound.tag === 'Sing-box Mux Off',
        );

        expect(output.outbounds).to.have.length(2);
        expectSubset(muxOn, {
            tag: 'Sing-box Mux On',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
            multiplex: {
                enabled: true,
            },
        });
        expect(muxOn.plugin_opts).to.include('mux=1');

        expectSubset(muxOff, {
            tag: 'Sing-box Mux Off',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
        });
        expect(muxOff).to.not.have.property('multiplex');
        expect(muxOff.plugin_opts).to.include('mux=0');
    });

    it('normalizes boolean v2ray-plugin mux state in sing-box plugin opts', function () {
        const buildProxy = (name, mux) => ({
            type: 'ss',
            name,
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            plugin: 'v2ray-plugin',
            'plugin-opts': {
                mode: 'websocket',
                host: 'cdn.example.com',
                path: '/socket',
                tls: true,
                mux,
            },
        });

        const output = loadProducedJson('sing-box', [
            buildProxy('Sing-box Boolean Mux On', true),
            buildProxy('Sing-box Boolean Mux Off', false),
        ]);
        const muxOn = output.outbounds.find(
            (outbound) => outbound.tag === 'Sing-box Boolean Mux On',
        );
        const muxOff = output.outbounds.find(
            (outbound) => outbound.tag === 'Sing-box Boolean Mux Off',
        );

        expectSubset(muxOn, {
            tag: 'Sing-box Boolean Mux On',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
            multiplex: {
                enabled: true,
            },
        });
        expect(muxOn.plugin_opts).to.include('mux=1');

        expectSubset(muxOff, {
            tag: 'Sing-box Boolean Mux Off',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
        });
        expect(muxOff).to.not.have.property('multiplex');
        expect(muxOff.plugin_opts).to.include('mux=0');
    });

    it('round-trips Clash-style boolean v2ray-plugin mux flags into sing-box exports', function () {
        const proxies = ProxyUtils.parse(`proxies:
  - name: Clash Boolean Mux On
    type: ss
    server: ss.example.com
    port: 8388
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
    port: 8388
    cipher: aes-128-gcm
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: cdn.example.com
      path: /socket
      tls: true
      mux: false
`);

        const output = loadProducedJson('sing-box', proxies);
        const muxOn = output.outbounds.find(
            (outbound) => outbound.tag === 'Clash Boolean Mux On',
        );
        const muxOff = output.outbounds.find(
            (outbound) => outbound.tag === 'Clash Boolean Mux Off',
        );

        expectSubset(muxOn, {
            tag: 'Clash Boolean Mux On',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
            multiplex: {
                enabled: true,
            },
        });
        expect(muxOn.plugin_opts).to.include('mux=1');

        expectSubset(muxOff, {
            tag: 'Clash Boolean Mux Off',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
        });
        expect(muxOff).to.not.have.property('multiplex');
        expect(muxOff.plugin_opts).to.include('mux=0');
    });

    it('round-trips Clash-style string boolean v2ray-plugin mux flags into sing-box exports', function () {
        const proxies = ProxyUtils.parse(`proxies:
  - name: Clash String Mux On
    type: ss
    server: ss.example.com
    port: 8388
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
    port: 8388
    cipher: aes-128-gcm
    password: secret
    plugin: v2ray-plugin
    plugin-opts:
      mode: websocket
      host: cdn.example.com
      path: /socket
      tls: true
      mux: ' false '
`);

        const output = loadProducedJson('sing-box', proxies);
        const muxOn = output.outbounds.find(
            (outbound) => outbound.tag === 'Clash String Mux On',
        );
        const muxOff = output.outbounds.find(
            (outbound) => outbound.tag === 'Clash String Mux Off',
        );

        expectSubset(muxOn, {
            tag: 'Clash String Mux On',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
            multiplex: {
                enabled: true,
            },
        });
        expect(muxOn.plugin_opts).to.include('mux=1');

        expectSubset(muxOff, {
            tag: 'Clash String Mux Off',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
        });
        expect(muxOff).to.not.have.property('multiplex');
        expect(muxOff.plugin_opts).to.include('mux=0');
    });

    it('treats string v2ray-plugin mux values from legacy JSON payloads as disabled in sing-box exports', function () {
        const legacy = 'YWVzLTEyOC1nY206c2VjcmV0QHNzLmV4YW1wbGUuY29tOjgzODg=';
        const plugin =
            'eyJtb2RlIjoid2Vic29ja2V0IiwiaG9zdCI6ImNkbi5leGFtcGxlLmNvbSIsInBhdGgiOiIvc29ja2V0IiwidGxzIjp0cnVlLCJtdXgiOiIwIn0=';

        const proxies = ProxyUtils.parse(
            `ss://${legacy}?v2ray-plugin=${plugin}#Legacy%20JSON%20Mux%20Off`,
        );
        const output = loadProducedJson('sing-box', proxies);
        const outbound = output.outbounds.find(
            (item) => item.tag === 'Legacy JSON Mux Off',
        );

        expectSubset(outbound, {
            tag: 'Legacy JSON Mux Off',
            type: 'shadowsocks',
            plugin: 'v2ray-plugin',
        });
        expect(outbound).to.not.have.property('multiplex');
        expect(outbound.plugin_opts).to.include('mux=0');
    });

    it('maps mihomo udp capability flags to sing-box network only when disabling UDP', function () {
        const output = loadProducedJson('sing-box', [
            {
                type: 'ss',
                name: 'SS UDP On',
                server: 'ss-on.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
                udp: true,
            },
            {
                type: 'ss',
                name: 'SS UDP Off',
                server: 'ss-off.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
                udp: false,
            },
            {
                type: 'ss',
                name: 'SS Network Override',
                server: 'ss-override.example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'secret',
                udp: false,
                _network: 'udp',
            },
        ]);

        const udpOn = output.outbounds.find((item) => item.tag === 'SS UDP On');
        const udpOff = output.outbounds.find(
            (item) => item.tag === 'SS UDP Off',
        );
        const networkOverride = output.outbounds.find(
            (item) => item.tag === 'SS Network Override',
        );

        expect(udpOn).to.not.have.property('network');
        expect(udpOff).to.have.property('network', 'tcp');
        expect(networkOverride).to.have.property('network', 'udp');
    });

    it('does not emit sing-box network for protocols without sing-box network options', function () {
        const output = loadProducedJson('sing-box', [
            {
                type: 'anytls',
                name: 'AnyTLS No Network',
                server: 'anytls.example.com',
                port: 443,
                password: 'secret',
                udp: false,
                _network: 'udp',
            },
            {
                type: 'tailscale',
                name: 'Tailscale No Network',
                udp: false,
                _network: 'udp',
            },
            {
                type: 'wireguard',
                name: 'WireGuard No Network',
                server: 'wg.example.com',
                port: 51820,
                'private-key': 'private-key',
                'public-key': 'public-key',
                ip: '10.0.0.2',
                udp: false,
                _network: 'udp',
            },
        ]);

        const anytls = output.outbounds.find(
            (item) => item.tag === 'AnyTLS No Network',
        );
        const tailscale = output.endpoints.find(
            (item) => item.tag === 'Tailscale No Network',
        );
        const wireguard = output.endpoints.find(
            (item) => item.tag === 'WireGuard No Network',
        );

        expect(anytls).to.not.have.property('network');
        expect(tailscale).to.not.have.property('network');
        expect(wireguard).to.not.have.property('network');
    });

    it('emits sing-box outbounds with reality tls and websocket transport', function () {
        const output = loadProducedJson('sing-box', {
            type: 'vless',
            name: 'Reality',
            server: 'vless.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            flow: 'xtls-rprx-vision',
            network: 'ws',
            'ws-opts': {
                path: '/ws?a=1&ed=2048&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
            },
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });

        expect(output.outbounds).to.have.length(1);
        expect(output.endpoints).to.have.length(0);
        expectSubset(output.outbounds[0], {
            tag: 'Reality',
            type: 'vless',
            server: 'vless.example.com',
            server_port: 443,
            flow: 'xtls-rprx-vision',
            tls: {
                enabled: true,
                server_name: 'vless.example.com',
                reality: {
                    enabled: true,
                    public_key: 'pubkey',
                    short_id: '08',
                },
                utls: {
                    enabled: true,
                    fingerprint: 'chrome',
                },
            },
            transport: {
                type: 'ws',
                path: '/ws?a=1&b=2',
                headers: {
                    Host: 'cdn.example.com',
                },
                early_data_header_name: 'Sec-WebSocket-Protocol',
                max_early_data: 2048,
            },
        });
    });

    it('validates sing-box uTLS fingerprints for regular TLS and Reality outbounds', function () {
        const output = loadProducedJson('sing-box', [
            {
                type: 'vmess',
                name: 'VMess Supported Fingerprint',
                server: 'vmess-supported.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                tls: true,
                'client-fingerprint': 'chrome',
            },
            {
                type: 'vmess',
                name: 'VMess Unsupported Fingerprint',
                server: 'vmess-unsupported.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                tls: true,
                'client-fingerprint': 'chrome120',
            },
            {
                type: 'vless',
                name: 'Reality Unsupported Fingerprint',
                server: 'reality-unsupported.example.com',
                port: 443,
                uuid: UUID,
                tls: true,
                flow: 'xtls-rprx-vision',
                'client-fingerprint': 'chrome120',
                'reality-opts': {
                    'public-key': 'pubkey',
                    'short-id': '08',
                },
            },
        ]);

        const supported = output.outbounds.find(
            (item) => item.tag === 'VMess Supported Fingerprint',
        );
        const unsupported = output.outbounds.find(
            (item) => item.tag === 'VMess Unsupported Fingerprint',
        );
        const reality = output.outbounds.find(
            (item) => item.tag === 'Reality Unsupported Fingerprint',
        );

        expectSubset(supported, {
            tls: {
                utls: {
                    enabled: true,
                    fingerprint: 'chrome',
                },
            },
        });
        expect(unsupported.tls).to.not.have.property('utls');
        expectSubset(reality, {
            tls: {
                reality: {
                    enabled: true,
                    public_key: 'pubkey',
                    short_id: '08',
                },
                utls: {
                    enabled: true,
                },
            },
        });
        expect(reality.tls.utls).to.not.have.property('fingerprint');
    });

    it('emits sing-box VMess and VLESS packet protocol options', function () {
        const output = loadProducedJson('sing-box', [
            {
                type: 'vmess',
                name: 'VMess Packet Options',
                server: 'vmess-packet.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                'packet-encoding': 'packetaddr',
                'global-padding': true,
                'authenticated-length': false,
            },
            {
                type: 'vless',
                name: 'VLESS Packet Options',
                server: 'vless-packet.example.com',
                port: 443,
                uuid: UUID,
                'packet-encoding': 'packetaddr',
                'global-padding': true,
                'authenticated-length': false,
            },
            {
                type: 'vmess',
                name: 'VMess XUDP Packet Options',
                server: 'vmess-xudp-packet.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                'packet-encoding': ' XUDP ',
                'global-padding': false,
                'authenticated-length': true,
            },
            {
                type: 'vless',
                name: 'VLESS XUDP Packet Options',
                server: 'vless-xudp-packet.example.com',
                port: 443,
                uuid: UUID,
                'packet-encoding': 'xudp',
                'global-padding': false,
                'authenticated-length': true,
            },
            {
                type: 'vmess',
                name: 'VMess Invalid Packet Encoding',
                server: 'vmess-invalid-packet.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                xudp: true,
                'packet-encoding': 'invalid',
                'global-padding': 'yes',
                'authenticated-length': 1,
            },
            {
                type: 'vless',
                name: 'VLESS Invalid Packet Encoding',
                server: 'vless-invalid-packet.example.com',
                port: 443,
                uuid: UUID,
                xudp: true,
                'packet-encoding': 'invalid',
                'global-padding': 'yes',
                'authenticated-length': 1,
            },
            {
                type: 'vmess',
                name: 'VMess Empty Packet',
                server: 'vmess-empty.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                xudp: true,
                'packet-encoding': '',
            },
            {
                type: 'vless',
                name: 'VLESS Empty Packet',
                server: 'vless-empty.example.com',
                port: 443,
                uuid: UUID,
                xudp: true,
                'packet-encoding': '',
            },
            {
                type: 'vmess',
                name: 'VMess Legacy XUDP',
                server: 'vmess-xudp.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                xudp: true,
            },
            {
                type: 'vless',
                name: 'VLESS Legacy XUDP',
                server: 'vless-xudp.example.com',
                port: 443,
                uuid: UUID,
                xudp: true,
            },
            {
                type: 'vmess',
                name: 'VMess Legacy Packet Addr',
                server: 'vmess-packet-addr.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                'packet-addr': true,
            },
            {
                type: 'vless',
                name: 'VLESS Legacy Packet Addr',
                server: 'vless-packet-addr.example.com',
                port: 443,
                uuid: UUID,
                'packet-addr': true,
            },
            {
                type: 'vmess',
                name: 'VMess Legacy XUDP Packet Addr',
                server: 'vmess-xudp-packet-addr.example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                alterId: 0,
                xudp: true,
                'packet-addr': true,
            },
            {
                type: 'vless',
                name: 'VLESS Legacy XUDP Packet Addr',
                server: 'vless-xudp-packet-addr.example.com',
                port: 443,
                uuid: UUID,
                xudp: true,
                'packet-addr': true,
            },
        ]);
        const findOutbound = (tag) =>
            output.outbounds.find((item) => item.tag === tag);

        expectSubset(findOutbound('VMess Packet Options'), {
            packet_encoding: 'packetaddr',
            global_padding: true,
            authenticated_length: false,
        });
        expectSubset(findOutbound('VLESS Packet Options'), {
            packet_encoding: 'packetaddr',
        });
        expect(findOutbound('VLESS Packet Options')).to.not.have.property(
            'global_padding',
        );
        expect(findOutbound('VLESS Packet Options')).to.not.have.property(
            'authenticated_length',
        );
        expectSubset(findOutbound('VMess XUDP Packet Options'), {
            packet_encoding: 'xudp',
            global_padding: false,
            authenticated_length: true,
        });
        expectSubset(findOutbound('VLESS XUDP Packet Options'), {
            packet_encoding: 'xudp',
        });
        expect(findOutbound('VLESS XUDP Packet Options')).to.not.have.property(
            'global_padding',
        );
        expect(findOutbound('VLESS XUDP Packet Options')).to.not.have.property(
            'authenticated_length',
        );
        for (const tag of ['VMess Empty Packet', 'VLESS Empty Packet']) {
            expectSubset(findOutbound(tag), {
                packet_encoding: '',
            });
            expect(findOutbound(tag)).to.not.have.property('global_padding');
            expect(findOutbound(tag)).to.not.have.property(
                'authenticated_length',
            );
        }
        expect(
            findOutbound('VMess Invalid Packet Encoding'),
        ).to.not.have.property('packet_encoding');
        expectSubset(findOutbound('VMess Invalid Packet Encoding'), {
            global_padding: true,
            authenticated_length: true,
        });
        expect(
            findOutbound('VLESS Invalid Packet Encoding'),
        ).to.not.have.property('packet_encoding');
        expect(
            findOutbound('VLESS Invalid Packet Encoding'),
        ).to.not.have.property('global_padding');
        expect(
            findOutbound('VLESS Invalid Packet Encoding'),
        ).to.not.have.property('authenticated_length');
        expectSubset(findOutbound('VMess Legacy XUDP'), {
            packet_encoding: 'xudp',
        });
        expectSubset(findOutbound('VLESS Legacy XUDP'), {
            packet_encoding: 'xudp',
        });
        expectSubset(findOutbound('VMess Legacy Packet Addr'), {
            packet_encoding: 'packetaddr',
        });
        expectSubset(findOutbound('VLESS Legacy Packet Addr'), {
            packet_encoding: 'packetaddr',
        });
        expectSubset(findOutbound('VMess Legacy XUDP Packet Addr'), {
            packet_encoding: 'xudp',
        });
        expectSubset(findOutbound('VLESS Legacy XUDP Packet Addr'), {
            packet_encoding: 'xudp',
        });
    });

    it('emits sing-box httpupgrade transport without websocket early data fields', function () {
        const output = loadProducedJson('sing-box', {
            type: 'vless',
            name: 'Upgrade',
            server: 'vless-upgrade.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            network: 'ws',
            'ws-opts': {
                path: '/upgrade?a=1&ed=2048&b=2',
                headers: {
                    Host: 'upgrade.example.com',
                },
                'v2ray-http-upgrade': true,
            },
        });

        expect(output.outbounds).to.have.length(1);
        expectSubset(output.outbounds[0], {
            tag: 'Upgrade',
            type: 'vless',
            transport: {
                type: 'httpupgrade',
                path: '/upgrade?a=1&b=2',
                host: 'upgrade.example.com',
            },
        });
        expect(output.outbounds[0].transport).to.not.have.property(
            'early_data_header_name',
        );
        expect(output.outbounds[0].transport).to.not.have.property(
            'max_early_data',
        );
    });

    it('normalizes sing-box ech PEM config strings with escaped newlines', function () {
        const output = loadProducedJson('sing-box', {
            type: 'vless',
            name: 'ECH PEM',
            server: 'ech.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            'ech-opts': {
                enable: true,
                config: [
                    '-----BEGIN ECH CONFIGS-----\\nZWNoLWNvbmZpZw==\\n-----END ECH CONFIGS-----',
                ],
            },
        });

        expectSubset(output.outbounds[0], {
            tag: 'ECH PEM',
            tls: {
                enabled: true,
                server_name: 'ech.example.com',
                ech: {
                    enabled: true,
                    config: [
                        '-----BEGIN ECH CONFIGS-----',
                        'ZWNoLWNvbmZpZw==',
                        '-----END ECH CONFIGS-----',
                    ],
                },
            },
        });
    });

    it('omits xhttp proxies from sing-box exports', function () {
        const output = loadProducedJson('sing-box', {
            type: 'vless',
            name: 'XHTTP',
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
                mode: 'stream-up',
            },
        });

        expect(output.outbounds).to.have.length(0);
        expect(output.endpoints).to.have.length(0);
    });

    it('stringifies JSON producer outputs as plain arrays', function () {
        const proxy = {
            type: 'http',
            name: 'JSON HTTP',
            server: 'http.example.com',
            port: 8080,
            username: 'user',
            password: 'pass',
        };

        const internal = produceInternal('JSON', proxy);
        const external = loadProducedJson('JSON', proxy);

        expect(internal).to.have.length(1);
        expectSubset(internal[0], {
            type: 'http',
            name: 'JSON HTTP',
        });
        expect(external).to.have.length(1);
        expectSubset(external[0], {
            type: 'http',
            name: 'JSON HTTP',
        });
    });

    it('blocks Mihomo xhttp reality-opts inheritance when upload has reality-opts but download does not', function () {
        const proxy = {
            type: 'vless',
            name: 'XHTTP Reality No Download Reality',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'reality-opts': {
                'public-key': 'upload-pubkey',
                'short-id': 'ab',
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);
        const external = loadProducedYaml('Mihomo', proxy);

        expect(internal).to.have.length(1);
        expectSubset(internal[0], {
            'xhttp-opts': {
                'download-settings': {
                    'reality-opts': { 'public-key': '' },
                },
            },
        });
        expectSubset(external.proxies[0], {
            'xhttp-opts': {
                'download-settings': {
                    'reality-opts': { 'public-key': '' },
                },
            },
        });
    });

    it('does not inject reality-opts blocker when download-settings already has reality-opts', function () {
        const proxy = {
            type: 'vless',
            name: 'XHTTP Reality Both',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'reality-opts': {
                'public-key': 'upload-pubkey',
                'short-id': 'ab',
            },
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                    'reality-opts': {
                        'public-key': 'download-pubkey',
                        'short-id': 'cd',
                    },
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);

        expect(internal).to.have.length(1);
        expectSubset(internal[0], {
            'xhttp-opts': {
                'download-settings': {
                    'reality-opts': {
                        'public-key': 'download-pubkey',
                        'short-id': 'cd',
                    },
                },
            },
        });
    });

    it('does not inject reality-opts blocker when upload has no reality-opts', function () {
        const proxy = {
            type: 'vless',
            name: 'XHTTP No Reality',
            server: 'vless-xhttp.example.com',
            port: 443,
            uuid: UUID,
            tls: true,
            sni: 'sni.example.com',
            network: 'xhttp',
            'xhttp-opts': {
                path: '/xhttp',
                mode: 'stream-up',
                'download-settings': {
                    server: 'download.example.com',
                    port: 8443,
                    tls: true,
                    path: '/download',
                },
            },
        };

        const internal = produceInternal('Mihomo', proxy);

        expect(internal).to.have.length(1);
        const ds = internal[0]['xhttp-opts']['download-settings'];
        expect(ds).to.not.have.property('reality-opts');
    });
});
