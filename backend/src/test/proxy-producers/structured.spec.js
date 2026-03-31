import { expect } from 'chai';
import { describe, it } from 'mocha';

import { ProxyUtils } from '@/core/proxy-utils';
import {
    UUID,
    expectSubset,
    loadProducedJson,
    loadProducedYaml,
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
            },
            _extra: JSON.stringify({
                noGRPCHeader: true,
                xPaddingBytes: '64-128',
            }),
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
            },
        });
        expectSubset(external.proxies[0], {
            type: 'vless',
            name: 'XHTTP',
            network: 'xhttp',
            servername: 'sni.example.com',
        });
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
