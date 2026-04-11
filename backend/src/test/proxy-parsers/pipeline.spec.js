import { Base64 } from 'js-base64';
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { parseAll, parseOne, expectSubset, UUID } from './helpers';

describe('Proxy parser pipeline coverage', function () {
    it('parses base64-encoded subscriptions', function () {
        const raw = Base64.encode(
            [
                'https://alice:pa%24%24@https.example.com#HTTPS%20Default',
                `socks://${encodeURIComponent(
                    Base64.encode('bob:secret'),
                )}@socks.example.com:1080#SOCKS`,
            ].join('\n'),
        );

        const proxies = parseAll(raw);

        expect(proxies).to.have.length(2);
        expectSubset(proxies[0], {
            type: 'http',
            name: 'HTTPS Default',
            server: 'https.example.com',
            port: 443,
            tls: true,
            username: 'alice',
            password: 'pa$$',
        });
        expectSubset(proxies[1], {
            type: 'socks5',
            name: 'SOCKS',
            server: 'socks.example.com',
            port: 1080,
            username: 'bob',
            password: 'secret',
        });
    });

    it('parses SSD subscriptions into shadowsocks nodes', function () {
        const payload = {
            port: 8388,
            encryption: 'aes-128-gcm',
            password: 'shared-secret',
            servers: [
                {
                    server: 'ssd.example.com',
                    remarks: 'SSD Node',
                    plugin: 'obfs-local',
                    plugin_options: 'obfs=http;obfs-host=cdn.example.com',
                },
            ],
        };

        const proxy = parseOne(`ssd://${Base64.encode(JSON.stringify(payload))}`);

        expectSubset(proxy, {
            type: 'ss',
            name: 'SSD Node',
            server: 'ssd.example.com',
            port: 8388,
            cipher: 'aes-128-gcm',
            password: 'shared-secret',
            plugin: 'obfs',
            'plugin-opts': {
                mode: 'http',
                host: 'cdn.example.com',
            },
        });
    });

    it('extracts [Proxy] blocks from full config documents before parsing', function () {
        const raw = `[General]
skip-proxy = 192.168.0.0/16

[Proxy]
Direct = direct
HTTP = http,full-config.example.com,8080,username=user,password=pass

[Rule]
FINAL,DIRECT
`;

        const proxies = parseAll(raw);

        expect(proxies).to.have.length(2);
        expectSubset(proxies[0], {
            type: 'direct',
            name: 'Direct',
        });
        expectSubset(proxies[1], {
            type: 'http',
            name: 'HTTP',
            server: 'full-config.example.com',
            port: 8080,
            username: 'user',
            password: 'pass',
        });
    });

    it('parses full Clash YAML documents end-to-end', function () {
        const raw = `proxies:
  - name: clash-vless
    type: vless
    server: clash.example.com
    port: 443
    uuid: ${UUID}
    servername: sni.example.com
    reality-opts:
      public-key: pubkey
      short-id: 08
  - name: clash-http
    type: http
    server: http.clash.example.com
    port: 8080
    benchmark-url: https://check.example.com
    benchmark-timeout: 9
`;

        const proxies = parseAll(raw);

        expect(proxies).to.have.length(2);
        expectSubset(proxies[0], {
            type: 'vless',
            name: 'clash-vless',
            server: 'clash.example.com',
            port: 443,
            uuid: UUID,
            sni: 'sni.example.com',
            'reality-opts': {
                'public-key': 'pubkey',
                'short-id': '08',
            },
        });
        expectSubset(proxies[1], {
            type: 'http',
            name: 'clash-http',
            server: 'http.clash.example.com',
            port: 8080,
            'test-url': 'https://check.example.com',
            'test-timeout': 9,
        });
    });

    it('splits mihomo hop-interval ranges for Clash-style object inputs', function () {
        const proxy = parseOne(
            JSON.stringify({
                name: 'hy2-range-inline',
                type: 'hysteria2',
                server: 'hy2.example.com',
                port: 443,
                password: 'secret',
                'hop-interval': '15-30',
            }),
        );

        expectSubset(proxy, {
            name: 'hy2-range-inline',
            type: 'hysteria2',
            'hop-interval': 15,
            'hop-interval-max': 30,
        });
    });

    it('drops invalid mihomo hop-interval values for Clash-style object inputs', function () {
        const invalidHopIntervals = [
            { title: 'zero string', value: '0' },
            { title: 'zero number', value: 0 },
            { title: 'negative string', value: '-5' },
            { title: 'negative number', value: -5 },
            { title: 'decimal string', value: '15.5' },
            { title: 'decimal number', value: 15.5 },
            { title: 'comma list', value: '15,30' },
            { title: 'plain text', value: 'abc' },
            { title: 'empty string', value: '' },
            { title: 'blank string', value: '   ' },
            { title: 'zero-start range', value: '0-15' },
            { title: 'zero-end range', value: '15-0' },
            { title: 'reverse range', value: '30-15' },
            { title: 'multi-range', value: '15-30-45' },
            { title: 'double hyphen range', value: '15--30' },
            { title: 'boolean', value: true },
            { title: 'array', value: [15, 30] },
            { title: 'object', value: { min: 15, max: 30 } },
        ];

        for (const { title, value } of invalidHopIntervals) {
            const proxy = parseOne(
                JSON.stringify({
                    name: `hy2-invalid-${title}`,
                    type: 'hysteria2',
                    server: 'hy2.example.com',
                    port: 443,
                    password: 'secret',
                    'hop-interval': value,
                    'hop-interval-max': 999,
                }),
            );

            expect(proxy).to.not.have.property('hop-interval');
            expect(proxy).to.not.have.property('hop-interval-max');
        }
    });

    it('accepts every Clash-supported proxy type as inline objects', function () {
        const supportedTypes = [
            'tailscale',
            'trusttunnel',
            'naive',
            'anytls',
            'mieru',
            'masque',
            'sudoku',
            'juicity',
            'ss',
            'ssr',
            'vmess',
            'socks5',
            'http',
            'snell',
            'trojan',
            'tuic',
            'vless',
            'hysteria',
            'hysteria2',
            'wireguard',
            'ssh',
            'direct',
        ];

        for (const type of supportedTypes) {
            const proxy = parseOne(
                JSON.stringify({
                    name: `${type}-inline`,
                    type,
                    server: `${type}.example.com`,
                    port: 443,
                }),
            );

            expectSubset(proxy, {
                name: `${type}-inline`,
                type,
            });
        }
    });
});
