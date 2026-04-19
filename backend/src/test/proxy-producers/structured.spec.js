import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import {
    UUID,
    expectSubset,
    loadProducedJson,
    loadProducedYaml,
    produceExternal,
    produceInternal,
} from './helpers';

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
                    path: '/ws?ed=2048',
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
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
                'early-data-header-name': 'Sec-WebSocket-Protocol',
                'max-early-data': 2048,
            },
        });
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
            expect(external.proxies.map((proxy) => proxy.name), platform).to
                .deep.equal(['WS', 'QUIC']);
        }
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
                path: '/ws?ed=2048',
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
                path: '/ws',
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
            },
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'XHTTP',
            network: 'xhttp',
            servername: 'sni.example.com',
            'xhttp-opts': {
                'sc-min-posts-interval-ms': 300,
            },
        });
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

    it('promotes shadow-tls fields for Shadowrocket', function () {
        const proxy = {
            type: 'ss',
            name: 'ShadowTLS SS',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            'shadow-tls-password': 'shadow-pass',
            'shadow-tls-sni': 'mask.example.com',
            'shadow-tls-version': 3,
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

    it('maps shadowsocks shadow-tls fields into Egern nested structures', function () {
        const proxy = {
            type: 'ss',
            name: 'ShadowTLS SS',
            server: 'ss.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'secret',
            'shadow-tls-password': 'shadow-pass',
            'shadow-tls-sni': 'mask.example.com',
            'shadow-tls-version': 3,
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

    it('preserves numeric v2ray-plugin mux values across Clash-family YAML producers', function () {
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

        for (const platform of [
            'Clash',
            'ClashMeta',
            'Shadowrocket',
            'Stash',
        ]) {
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
                path: '/ws?ed=2048',
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
                path: '/ws',
                headers: {
                    Host: 'cdn.example.com',
                },
                early_data_header_name: 'Sec-WebSocket-Protocol',
                max_early_data: 2048,
            },
        });
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
});
