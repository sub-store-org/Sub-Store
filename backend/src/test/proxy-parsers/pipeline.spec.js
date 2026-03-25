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

