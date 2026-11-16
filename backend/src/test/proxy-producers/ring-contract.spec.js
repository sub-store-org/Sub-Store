import { expect } from 'chai';
import { describe, it } from 'mocha';
import Ring_Producer, {
    RingUnsupportedProxyError,
} from '@/core/proxy-utils/producers/ring';
import { ProxyUtils } from '@/core/proxy-utils';
import { UUID } from './helpers';

describe('Ring 配置契约', function () {
    const producer = Ring_Producer();
    const base = {
        name: 'Node',
        server: 'proxy.example.com',
        port: 443,
        uuid: UUID,
        username: '<SECRET>',
        password: '<SECRET>',
    };
    const produce = (type, options = {}) =>
        producer.produce({ ...base, type, ...options });
    const reject = (type, options) =>
        expect(() => produce(type, options)).to.throw(
            RingUnsupportedProxyError,
        );

    it('保留字面量引号及结构分隔符，并阻止配置值插入新行', function () {
        for (const password of [
            '"<SECRET>"',
            '<SECRET>[a,b]',
            '<SECRET>{a,b}',
            "'<SECRET>'",
        ]) {
            const output = produce('trojan', { password });
            const escaped = password.replace(/"/g, '\\"');
            expect(output).to.include(
                `password=${
                    /["[\]{},]/.test(password) ? `"${escaped}"` : escaped
                }`,
            );
        }
        reject('trojan', { password: '<SECRET>\nInjected = direct' });
        reject('trojan', { port: '443\nInjected = direct' });
        const source = { ...base, type: 'trojan', name: 'Node=1,Name' };
        expect(producer.produce(source)).to.match(/^Node1Name = /);
        expect(source.name).to.equal('Node=1,Name');
    });

    it('区分字符串 false 与 true，并映射 VMess alterId', function () {
        for (const aead of [false, 'false', 0, '0']) {
            expect(produce('vmess', { aead })).to.include('aead=false');
        }
        expect(produce('vmess', { alterId: '0' })).to.include('aead=true');
        expect(produce('vmess', { tls: 'false' })).not.to.include('tls=true');
        expect(produce('vmess', { tls: 'true' })).to.include('tls=true');
    });

    it('显式关闭 Sing Mux 优先于嵌套开关，并保留零空闲超时', function () {
        const disabled = produce('trojan', {
            'sing-mux': false,
            smux: { enabled: true },
        });
        expect(disabled).to.include('sing-mux=false');
        expect(disabled).not.to.include('sing-mux=true');
        expect(
            produce('trojan', { smux: { enabled: 'true', 'idle-timeout': 0 } }),
        ).to.include('sing-mux-idle-timeout=0');
        reject('trojan', { smux: { enabled: true, 'max-streams': 1.5 } });
        reject('trojan', { smux: { enabled: true, protocol: 'h2mux' } });
        reject('direct', { 'sing-mux': true });
    });

    it('为支持的 TCP 协议保留独立 JLS 认证且不叠加普通 TLS', function () {
        for (const type of [
            'ss',
            'vmess',
            'trojan',
            'socks5',
            'http',
            'anytls',
            'ssh',
        ]) {
            const output = produce(type, {
                cipher: 'aes-128-gcm',
                tls: true,
                jls: true,
                'jls-username': '<SECRET>',
                'jls-password': '<SECRET>,part=1',
                'jls-sni': 'cover.example.com',
                'jls-alpns': ['h2', 'http/1.1'],
            });
            expect(output).to.include('jls=true');
            expect(output).to.include('jls-password="<SECRET>,part=1"');
            expect(output).to.include('jls-alpns="h2,http/1.1"');
            expect(output).not.to.match(/(?:^|,\s*)tls=true(?:,|$)/);
        }
    });

    it('拒绝 JLS 缺少认证、覆盖认证或不兼容的插件组合', function () {
        const jls = {
            jls: true,
            'jls-username': '<SECRET>',
            'jls-password': '<SECRET>',
        };
        reject('trojan', { jls: true });
        for (const options of [
            { 'jls-tls': false },
            { 'jls-skip-cert-verify': true },
            { 'jls-enable-early-data': true },
            { 'jls-server-cert-fingerprint-sha256': '11'.repeat(32) },
            { 'shadow-tls': true, 'shadow-tls-password': '<SECRET>' },
        ])
            reject('trojan', { ...jls, ...options });
        for (const type of [
            'vless',
            'tuic',
            'hysteria2',
            'wireguard',
            'tailscale',
            'direct',
        ]) {
            reject(type, jls);
        }
    });

    it('ShadowTLS 不借用协议密码，并校验版本与适用协议', function () {
        reject('ss', { 'shadow-tls': true });
        reject('ss', { 'shadow-tls': true, 'shadow-tls-version': 4 });
        reject('vless', {
            'shadow-tls-opts': { version: 3, password: '<SECRET>' },
        });
        const output = produce('ss', {
            'shadow-tls': true,
            'shadow-tls-version': 1,
        });
        expect(output).to.include('shadow-tls-version=1');
        expect(output).not.to.include('shadow-tls-password');
        expect(
            produce('vmess', {
                'shadow-tls-opts': { version: 3, password: '<SECRET>' },
            }),
        ).to.include('shadow-tls-password=<SECRET>');
    });

    it('ShadowQUIC 保留 JLS 凭据、UDP 模式与可选早期数据', function () {
        const output = produce('shadowquic', {
            'udp-relay-mode': 'QUIC',
            alpn: ['h3'],
            'enable-early-data': true,
        });
        expect(output).to.include(
            'shadowquic, proxy.example.com, 443, username=<SECRET>, password=<SECRET>',
        );
        expect(output).to.include('udp-relay-mode=quic');
        expect(output).to.include('alpns=h3');
        expect(output).to.include('enable-early-data=true');
        for (const options of [
            { username: '' },
            { password: '' },
            { tls: false },
            { 'skip-cert-verify': true },
            { 'tls-fingerprint': '11'.repeat(32) },
            { 'udp-relay-mode': 'invalid' },
            { 'shadow-tls': true },
        ])
            reject('shadowquic', options);
    });

    it('VLESS URI 的 packetaddr 编码完整映射到 Ring packet', function () {
        const nodes = ProxyUtils.parse(
            `vless://${UUID}@proxy.example.com:443?security=tls&type=ws&packetEncoding=packet&path=%2Fchat#Node`,
        );
        expect(nodes).to.have.length(1);
        expect(nodes[0]['packet-encoding']).to.equal('packetaddr');
        const output = ProxyUtils.produce(nodes, 'Ring', 'external');
        expect(output).to.include('packet-encoding=packet');
        expect(output).to.include('transport=ws');
        expect(output).to.include('path=/chat');
        for (const encoding of ['', 'none', 'packetaddr', 'packet']) {
            expect(
                produce('vless', { 'packet-encoding': encoding }),
            ).to.include('packet-encoding=packet');
        }
        reject('vless', { 'packet-encoding': 'unknown' });
        expect(
            produce('vless', {
                tls: true,
                flow: 'xtls-rprx-vision',
                'packet-encoding': 'packetaddr',
            }),
        ).not.to.include('packet-encoding=packet');
    });

    it('VLESS 正确处理 transport 别名和显式 security', function () {
        expect(produce('vless', { transport: 'websocket' })).to.include(
            'transport=ws',
        );
        expect(produce('vless', { transport: 'raw' })).to.include(
            'transport=tcp',
        );
        expect(produce('vless', { security: 'none', tls: 'false' })).to.include(
            'security=none',
        );
        reject('vless', { transport: 'kcp' });
        reject('vless', { security: 'unknown' });
        reject('vless', { security: 'none', tls: true });
        reject('vless', { flow: 'xtls-rprx-vision' });
    });

    it('VLESS REALITY 规范化公钥、保留 ALPN 并校验 short ID', function () {
        const reality = {
            security: 'reality',
            sni: 'cover.example.com',
            'reality-public-key':
                'CQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
            'reality-short-id': '0102',
            alpn: ['h2'],
        };
        const output = produce('vless', reality);
        expect(output).to.include('security=reality');
        expect(output).to.include(
            'reality-public-key=CQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,',
        );
        expect(output).to.include('reality-short-id=0102');
        expect(output).to.include('alpns=h2');
        expect(output).not.to.include('tls=true');
        for (const options of [
            { 'reality-public-key': 'invalid' },
            { 'reality-short-id': '123' },
            { 'reality-short-id': '00'.repeat(9) },
            { network: 'ws' },
            { 'skip-cert-verify': true },
            { 'tls-fingerprint': '11'.repeat(32) },
        ])
            reject('vless', { ...reality, ...options });
    });

    it('XHTTP 规范化路径、提取 Host 请求头、支持独立下行与 HTTP/3 并拒绝非法扩展', function () {
        const output = produce('vless', {
            network: 'xhttp',
            tls: true,
            alpn: ['h3'],
            'xhttp-opts': {
                path: 'stream',
                mode: 'streamup',
                headers: { Host: 'cdn.example.com', 'X-Test': 'a,b=c' },
                'download-settings': {
                    address: 'download.example.com',
                    port: 8443,
                    security: 'tls',
                    sni: 'download.example.com',
                    alpns: ['h3'],
                },
            },
        });
        expect(output).to.include('path=/stream');
        expect(output).to.include('host=cdn.example.com');
        expect(output).to.include('headers="X-Test:a,b=c"');
        expect(output).not.to.include('Host:cdn.example.com');
        expect(output).to.include('xhttp-mode=stream-up');
        expect(output).to.include('alpns=h3');
        expect(output).to.include('xhttp-download=true');
        expect(output).to.include(
            'xhttp-download-address=download.example.com',
        );
        expect(output).to.include('xhttp-download-port=8443');
        expect(output).to.include('xhttp-download-alpns=h3');
        expect(output).to.include('xhttp-download-path=/stream');

        for (const opts of [
            { 'download-settings': { address: 'download.example.com' } },
            { 'x-padding-key': 'padding' },
            { 'reuse-settings': {} },
            { mode: 'invalid' },
        ])
            reject('vless', { network: 'xhttp', 'xhttp-opts': opts });
        reject('vless', { network: 'xhttp', alpn: ['h3'] });
        reject('vless', {
            network: 'xhttp',
            tls: true,
            'xhttp-download': true,
            'xhttp-download-address': 'download.example.com',
            'xhttp-download-port': 443,
            'xhttp-download-enable-early-data': true,
        });
        reject('vless', {
            network: 'xhttp',
            _extra_unsupported: { unknown: true },
        });
    });

    it('HTTP 请求头通过完整导出链路，其他平台能力保持独立', function () {
        const nodes = ProxyUtils.parse(
            JSON.stringify({
                ...base,
                type: 'http',
                headers: { 'X-Test': 'value' },
            }),
        );
        for (const target of ['Ring', 'ring']) {
            expect(ProxyUtils.produce(nodes, target, 'external')).to.include(
                'headers=X-Test:value',
            );
        }
    });

    it('校验 WireGuard Peer、reserved、IPv6 endpoint 与 keepalive', function () {
        const wg = {
            'private-key': '<SECRET>',
            ip: '10.0.0.2',
            'public-key': '<SECRET>',
            server: '2001:db8::1',
            port: 51820,
            'congestion-control': 'cubic',
            keepalive: 0,
        };
        const output = produce('wireguard', wg);
        expect(output).to.include('endpoint="[2001:db8::1]:51820"');
        expect(output).to.include('keepalive=0');
        expect(output).to.include('congestion-control=cubic');
        for (const options of [
            { peers: [] },
            { peers: [{}, {}] },
            { reserved: [0, 1, 0] },
            { reserved: ['invalid', 0, 0] },
            { keepalive: 65536 },
        ])
            reject('wireguard', { ...wg, ...options });
    });

    it('校验 TUIC v5、SSH 认证及 Tailscale 连接模式与隧道参数', function () {
        reject('tuic', { version: 4 });
        reject('tuic', { uuid: '' });
        reject('tuic', { password: '', token: '<SECRET>' });
        reject('ssh', { 'private-key': 'named-key' });
        reject('ssh', { username: '' });
        reject('tailscale', { 'auth-key': '' });
        reject('tailscale', {
            'auth-key': '<SECRET>',
            'control-url': 'http://insecure.example.com',
        });
        reject('tailscale', {
            'auth-key': '<SECRET>',
            'connection-mode': 'invalid-mode',
        });
        for (const mode of ['auto', 'no-peer-relay', 'derp-only']) {
            const tsOut = produce('tailscale', {
                'auth-key': '<SECRET>',
                'connection-mode': mode,
                'derp-only': true,
                'congestion-control': 'bbrv3',
            });
            expect(tsOut).to.include(`connection-mode=${mode}`);
            expect(tsOut).not.to.include('derp-only=');
            expect(tsOut).to.include('congestion-control=bbrv3');
        }
    });

    it('单个不支持的节点不会阻断其他节点导出', function () {
        const nodes = [
            { ...base, type: 'shadowquic', name: 'Valid' },
            { ...base, type: 'shadowtls', name: 'Invalid' },
            {
                ...base,
                type: 'vless',
                network: 'xhttp',
                'xhttp-opts': { 'download-settings': {} },
            },
        ];
        const output = ProxyUtils.produce(nodes, 'Ring', 'external');
        expect(output.split('\n')).to.have.length(1);
        expect(output).to.match(/^Valid = shadowquic,/);
    });

    it('Shadowsocks 插件接管 TLS 时通过完整导出链路', function () {
        const nodes = ProxyUtils.parse(
            JSON.stringify({
                ...base,
                type: 'ss',
                cipher: 'aes-128-gcm',
                tls: true,
                jls: true,
                'jls-username': '<SECRET>',
                'jls-password': '<SECRET>',
            }),
        );
        const output = ProxyUtils.produce(nodes, 'Ring', 'external');
        expect(output).to.include('shadowsocks, proxy.example.com, 443');
        expect(output).to.include('jls=true');
        expect(output).not.to.match(/(?:^|,\s*)tls=true(?:,|$)/);
    });
});
