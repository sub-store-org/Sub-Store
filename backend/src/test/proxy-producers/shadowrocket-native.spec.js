import { expect } from 'chai';
import { describe, it } from 'mocha';
import { ProxyUtils } from '@/core/proxy-utils';
import Shadowrocket_Producer from '@/core/proxy-utils/producers/shadowrocket';

function produce(proxy) {
    return Shadowrocket_Producer().produce([proxy], undefined, {
        native: true,
    });
}

function parseAndProduce(raw) {
    return ProxyUtils.produce(
        ProxyUtils.parse(raw),
        'Shadowrocket',
        'external',
        { native: true },
    );
}

describe('Shadowrocket native output', function () {
    it('rejects malformed scalars through Clash JSON and direct native output', function () {
        const base = {
            type: 'vmess',
            name: 'Validation',
            server: 'example.com',
            port: 443,
            uuid: 'test-uuid',
            cipher: 'auto',
            network: 'ws',
            tls: true,
        };
        for (const patch of [
            { password: {} },
            { uuid: {} },
            { cipher: {} },
            { sni: {} },
            { servername: {} },
            { name: {} },
            { server: {} },
            { 'ws-opts': { path: {} } },
            { 'ws-opts': { headers: { Host: {} } } },
            { 'ws-opts': { headers: { host: [] } } },
            { 'ws-opts': [] },
            { alpn: [{}] },
            { alterId: [] },
            { uuid: true },
            { cipher: false },
        ]) {
            for (const run of [
                produce,
                (value) =>
                    parseAndProduce(JSON.stringify({ proxies: [value] })),
            ]) {
                expect(
                    () =>
                        run({ ...base, ...JSON.parse(JSON.stringify(patch)) }),
                    JSON.stringify(patch),
                ).to.throw('Shadowrocket native');
            }
        }
    });

    it('validates all native credential, address, and option scalars before conversion', function () {
        const protocols = {
            ss: ['cipher', 'password'],
            vmess: ['uuid', 'cipher', 'alterId', 'sni', 'servername'],
            vless: ['uuid', 'cipher', 'packet-encoding'],
            http: ['username', 'password'],
            socks5: ['username', 'password'],
            trojan: ['password', 'sni', 'servername', 'network'],
            hysteria: [
                'auth-str',
                'auth_str',
                'auth',
                'obfs',
                'protocol',
                'up',
                'down',
            ],
            hysteria2: ['password', 'obfs-password', 'obfs_password'],
            tuic: [
                'uuid',
                'password',
                'token',
                'version',
                'congestion-controller',
                'udp-relay-mode',
            ],
            juicity: ['uuid', 'password'],
            wireguard: [
                'private-key',
                'public-key',
                'ip',
                'ipv6',
                'ip-cidr',
                'ipv6-cidr',
                'mtu',
                'keepalive',
                'persistent-keepalive',
                'preshared-key',
                'pre-shared-key',
                'reserved',
            ],
            snell: ['psk', 'version'],
        };
        const credentials = {
            ss: { cipher: 'aes-128-gcm', password: 'secret' },
            vmess: { uuid: 'test-uuid', cipher: 'auto' },
            vless: { uuid: 'test-uuid' },
            trojan: { password: 'secret' },
            hysteria: { 'auth-str': 'secret' },
            hysteria2: { password: 'secret' },
            tuic: { uuid: 'test-uuid', password: 'secret' },
            juicity: { uuid: 'test-uuid', password: 'secret' },
            wireguard: {
                'private-key': 'private',
                'public-key': 'public',
                ip: '10.0.0.2',
            },
            snell: { psk: 'secret', version: 2 },
        };
        for (const [type, fields] of Object.entries(protocols)) {
            for (const key of [
                'name',
                'server',
                'port',
                'alpn',
                'dns',
                ...fields,
            ]) {
                for (const value of [{}, { injected: true }, [[]]]) {
                    const proxy = {
                        type,
                        name: 'Scalar',
                        server: 'example.com',
                        port: 443,
                        ...credentials[type],
                        [key]: value,
                    };
                    expect(
                        () => produce(JSON.parse(JSON.stringify(proxy))),
                        `${type}.${key}`,
                    ).to.throw('Shadowrocket native');
                    expect(
                        () =>
                            parseAndProduce(
                                JSON.stringify({ proxies: [proxy] }),
                            ),
                        `${type}.${key} via Clash`,
                    ).to.throw('Shadowrocket native');
                }
            }
        }
    });

    it('rejects values and conflicts that cleanup previously discarded', function () {
        const base = {
            type: 'vmess',
            name: 'Cleanup',
            server: 'example.com',
            port: 443,
            uuid: 'test-uuid',
            cipher: 'auto',
            tls: true,
            network: 'ws',
        };
        for (const patch of [
            { sni: 'one.example', servername: 'two.example' },
            { tfo: true, 'fast-open': false },
            { 'ws-path': {}, 'ws-opts': { path: '/valid' } },
            { 'ws-headers': { Host: {} }, 'ws-opts': { path: '/valid' } },
            { 'tls-fingerprint': false },
            { 'underlying-proxy': false },
            { 'no-resolve': true },
            { plugin: 'shadow-tls', 'plugin-opts': {} },
        ]) {
            for (const run of [
                produce,
                (value) =>
                    parseAndProduce(JSON.stringify({ proxies: [value] })),
            ]) {
                expect(
                    () =>
                        run({ ...base, ...JSON.parse(JSON.stringify(patch)) }),
                    JSON.stringify(patch),
                ).to.throw('Shadowrocket native');
            }
        }
        for (const patch of [
            { ip: 'invalid' },
            { ip: '10.0.0.2/99' },
            { 'ip-cidr': 99 },
            { ipv6: 'invalid' },
        ]) {
            const proxy = {
                type: 'wireguard',
                name: 'WG',
                server: 'example.com',
                port: 51820,
                'private-key': 'private',
                'public-key': 'public',
                ip: '10.0.0.2',
                ...patch,
            };
            expect(() =>
                parseAndProduce(JSON.stringify({ proxies: [proxy] })),
            ).to.throw('Shadowrocket native');
        }
    });

    it('does not normalize invalid numeric ports into valid native ports', function () {
        for (const port of [
            443.5,
            '443.5',
            ' 443 ',
            '0x1bb',
            '4.43e2',
            65536,
        ]) {
            expect(() =>
                parseAndProduce(
                    JSON.stringify({
                        proxies: [
                            {
                                type: 'ss',
                                name: 'Port',
                                server: 'example.com',
                                port,
                                cipher: 'aes-128-gcm',
                                password: 'secret',
                            },
                        ],
                    }),
                ),
            ).to.throw('Invalid Shadowrocket native Shadowsocks port');
        }
    });

    it('checks VMess AEAD consistency before normalization', function () {
        const base = {
            type: 'vmess',
            name: 'AEAD',
            server: 'example.com',
            port: 443,
            uuid: 'test-uuid',
            cipher: 'auto',
        };
        for (const run of [
            produce,
            (value) => parseAndProduce(JSON.stringify({ proxies: [value] })),
        ]) {
            for (const patch of [
                { aead: true, alterId: 2 },
                { aead: false, alterId: 0 },
                { aead: false },
            ]) {
                expect(() => run({ ...base, ...patch })).to.throw(
                    'Conflicting Shadowrocket native VMess aead and alterId',
                );
            }
            for (const aead of ['false', 1, {}, []]) {
                expect(() => run({ ...base, aead })).to.throw(
                    'Shadowrocket native',
                );
            }
            for (const patch of [
                { aead: true },
                { aead: true, alterId: '0' },
                { aead: false, alterId: 2 },
            ]) {
                expect(run({ ...base, ...patch })).to.include(
                    `alterId=${patch.aead ? 0 : 2}`,
                );
            }
        }
    });

    it('validates mandatory TLS before Clash normalization or native deletion', function () {
        for (const type of [
            'trojan',
            'tuic',
            'hysteria',
            'hysteria2',
            'juicity',
        ]) {
            const base = {
                type,
                name: 'TLS',
                server: 'example.com',
                port: 443,
                ...(type === 'hysteria'
                    ? { 'auth-str': 'secret' }
                    : { password: 'secret' }),
                ...(['tuic', 'juicity'].includes(type)
                    ? { uuid: 'test-uuid' }
                    : {}),
            };
            for (const run of [
                produce,
                (value) =>
                    parseAndProduce(JSON.stringify({ proxies: [value] })),
            ]) {
                for (const tls of [
                    false,
                    'true',
                    'false',
                    0,
                    1,
                    {},
                    [],
                    null,
                ]) {
                    expect(
                        () => run({ ...base, tls }),
                        `${type}: ${JSON.stringify(tls)}`,
                    ).to.throw('Shadowrocket native');
                }
                expect(run({ ...base, tls: true })).to.equal(run({ ...base }));
            }
        }
    });

    it('outputs normalized HTTP, HTTPS, and SOCKS5 TLS inputs', function () {
        expect(
            parseAndProduce(
                JSON.stringify({
                    proxies: [
                        {
                            type: 'http',
                            name: 'HTTP',
                            server: 'http.example.com',
                            port: 80,
                            username: 'alice',
                            password: 'http-password',
                        },
                        {
                            type: 'http',
                            name: 'HTTPS',
                            server: 'https.example.com',
                            port: 443,
                            username: 'alice',
                            password: 'https-password',
                            tls: true,
                        },
                        {
                            type: 'socks5',
                            name: 'SOCKS5-TLS',
                            server: 'socks.example.com',
                            port: 443,
                            username: 'alice',
                            password: 'socks-password',
                            tls: true,
                            'skip-cert-verify': true,
                        },
                    ],
                }),
            ),
        ).to.equal(
            [
                'HTTP=http,http.example.com,80,alice,http-password',
                'HTTPS=https,https.example.com,443,alice,https-password',
                'SOCKS5-TLS=socks5-tls,socks.example.com,443,alice,socks-password,skip-common-name-verify=true',
            ].join('\n'),
        );
    });

    it('outputs representative parsed inputs for every other native protocol', function () {
        const cases = [
            {
                proxy: {
                    type: 'ss',
                    name: 'SS',
                    server: 'ss.example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'ss-password',
                },
                expected:
                    'SS=ss,ss.example.com,8388,password=ss-password,method=aes-128-gcm',
            },
            {
                proxy: {
                    type: 'vmess',
                    name: 'VMess',
                    server: 'vmess.example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: 'auto',
                    network: 'ws',
                    tls: true,
                    'ws-opts': {
                        path: '/ws',
                        headers: { Host: 'cdn.example.com' },
                    },
                },
                expected:
                    'VMess=vmess,vmess.example.com,443,password=11111111-1111-4111-8111-111111111111,alterId=0,method=auto,tls=true,obfs=websocket,path=/ws,obfsParam=cdn.example.com,peer=cdn.example.com',
            },
            {
                proxy: {
                    type: 'trojan',
                    name: 'Trojan',
                    server: 'trojan.example.com',
                    port: 443,
                    password: 'trojan-password',
                },
                expected:
                    'Trojan=trojan,trojan.example.com,443,password=trojan-password,peer=trojan.example.com',
            },
            {
                proxy: {
                    type: 'hysteria',
                    name: 'Hysteria',
                    server: 'hysteria.example.com',
                    port: 443,
                    'auth-str': 'hysteria-password',
                },
                expected:
                    'Hysteria=hysteria,hysteria.example.com,443,auth=hysteria-password,udp=1,peer=hysteria.example.com',
            },
            {
                proxy: {
                    type: 'tuic',
                    name: 'TUIC',
                    server: 'tuic.example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    password: 'tuic-password',
                },
                expected:
                    'TUIC=tuic,tuic.example.com,443,password=tuic-password,udp=1,user=11111111-1111-4111-8111-111111111111,peer=tuic.example.com,alpn=h3',
            },
            {
                proxy: {
                    type: 'juicity',
                    name: 'Juicity',
                    server: 'juicity.example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    password: 'juicity-password',
                },
                expected:
                    'Juicity=juicity,juicity.example.com,443,password=juicity-password,udp=1,user=11111111-1111-4111-8111-111111111111,peer=juicity.example.com',
            },
            {
                proxy: {
                    type: 'wireguard',
                    name: 'WireGuard',
                    server: 'wg.example.com',
                    port: 51820,
                    'private-key': 'private-key',
                    'public-key': 'public-key',
                    ip: '10.0.0.2/32',
                },
                expected:
                    'WireGuard=wireguard,wg.example.com,51820,privateKey=private-key,publicKey=public-key,ip=10.0.0.2/32,udp=1',
            },
            {
                proxy: {
                    type: 'snell',
                    name: 'Snell',
                    server: 'snell.example.com',
                    port: 443,
                    psk: 'snell-password',
                    version: 2,
                },
                expected:
                    'Snell=snell,snell.example.com,443,password=snell-password,udp=1',
            },
        ];

        for (const { proxy, expected } of cases) {
            expect(
                parseAndProduce(JSON.stringify({ proxies: [proxy] })),
                proxy.type,
            ).to.equal(expected);
        }
    });

    it('outputs normalized Quantumult X VLESS inputs', function () {
        expect(
            parseAndProduce(
                'vless=example.com:443,method=none,password=11111111-1111-4111-8111-111111111111,obfs=wss,obfs-uri=/ws,obfs-host=cdn.example.com,tls-host=sni.example.com,udp-relay=true,tag=QX VLESS',
            ),
        ).to.equal(
            'QX VLESS=vless,example.com,443,password=11111111-1111-4111-8111-111111111111,tls=true,obfs=websocket,path=/ws,obfsParam=cdn.example.com,peer=sni.example.com',
        );
    });

    it('outputs normalized Hysteria2 URI defaults', function () {
        expect(
            parseAndProduce('hy2://test-password@hy2.example.com:443#HY2'),
        ).to.equal(
            'HY2=hysteria2,hy2.example.com,443,auth=test-password,udp=1,peer=hy2.example.com',
        );
    });

    it('rejects non-default HTTPS and SOCKS5 TLS server names', function () {
        for (const type of ['http', 'socks5']) {
            expect(() =>
                produce({
                    type,
                    name: `${type}-TLS-SNI`,
                    server: 'example.com',
                    port: 443,
                    tls: true,
                    sni: 'different.example.com',
                }),
            ).to.throw(
                `Unsupported Shadowrocket native ${
                    type === 'http' ? 'HTTPS' : 'SOCKS5 TLS'
                } server name`,
            );
        }
    });

    it('outputs Shadowsocks', function () {
        expect(
            produce({
                type: 'ss',
                name: 'SS-Test',
                server: 'example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'test-password',
                udp: true,
            }),
        ).to.equal(
            'SS-Test=ss,example.com,8388,password=test-password,method=aes-128-gcm',
        );
    });

    it('rejects Shadowsocks v2ray-plugin until native syntax is verified', function () {
        expect(() =>
            produce({
                type: 'ss',
                name: 'SS-V2Ray-WS-TLS',
                server: 'example.com',
                port: 443,
                cipher: 'aes-128-gcm',
                password: 'test-password',
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
            }),
        ).to.throw(
            'Unsupported Shadowrocket native Shadowsocks plugin until its native syntax is verified',
        );
    });

    it('rejects other unverified Shadowsocks plugins', function () {
        expect(() =>
            produce({
                type: 'ss',
                name: 'SS-Plugin',
                server: 'example.com',
                port: 443,
                cipher: 'aes-128-gcm',
                password: 'test-password',
                plugin: 'obfs-local',
            }),
        ).to.throw(
            'Unsupported Shadowrocket native Shadowsocks plugin until its native syntax is verified',
        );
    });

    it('outputs VMess', function () {
        expect(
            produce({
                type: 'vmess',
                name: 'VMess-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                alterId: 0,
                cipher: 'auto',
                network: 'tcp',
            }),
        ).to.equal(
            'VMess-Test=vmess,example.com,443,password=11111111-1111-4111-8111-111111111111,alterId=0,method=auto',
        );
    });

    it('preserves VMess WebSocket and TLS connection settings', function () {
        expect(
            produce({
                type: 'vmess',
                name: 'VMess-WS-TLS',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                alterId: 0,
                cipher: 'auto',
                tls: true,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            }),
        ).to.equal(
            'VMess-WS-TLS=vmess,example.com,443,password=11111111-1111-4111-8111-111111111111,alterId=0,method=auto,tls=true,obfs=websocket,path=/ws,obfsParam=cdn.example.com,peer=sni.example.com,allowInsecure=1',
        );
    });

    for (const type of ['vmess', 'vless']) {
        it(`rejects ${type} TLS-only fields when TLS is disabled`, function () {
            expect(() =>
                produce({
                    type,
                    name: `${type}-No-TLS`,
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: type === 'vmess' ? 'auto' : undefined,
                    network: 'tcp',
                    tls: false,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                }),
            ).to.throw(
                `Unsupported Shadowrocket native ${
                    type === 'vmess' ? 'VMess' : 'VLESS'
                } TLS options without TLS`,
            );
        });
    }

    for (const type of ['vmess', 'vless']) {
        it(`rejects unverified ${type} fingerprint and ALPN syntax`, function () {
            expect(() =>
                produce({
                    type,
                    name: `${type}-TLS-Extensions`,
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: type === 'vmess' ? 'auto' : undefined,
                    network: 'tcp',
                    tls: true,
                    'client-fingerprint': 'chrome',
                    alpn: ['h2'],
                }),
            ).to.throw(
                `Unsupported Shadowrocket native ${
                    type === 'vmess' ? 'VMess' : 'VLESS'
                } options: client-fingerprint, alpn`,
            );
        });
    }

    it('rejects unsupported VMess transports instead of dropping them', function () {
        expect(() =>
            produce({
                type: 'vmess',
                name: 'VMess-gRPC',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                alterId: 0,
                cipher: 'auto',
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'example',
                },
            }),
        ).to.throw('Unsupported Shadowrocket native VMess network: grpc');
    });

    it('outputs VLESS', function () {
        expect(
            produce({
                type: 'vless',
                name: 'VLESS-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                tls: true,
                sni: 'example.com',
                network: 'tcp',
            }),
        ).to.equal(
            'VLESS-Test=vless,example.com,443,password=11111111-1111-4111-8111-111111111111,tls=true,peer=example.com',
        );
    });

    it('accepts VLESS xudp only as the native default', function () {
        expect(
            produce({
                type: 'vless',
                name: 'VLESS-XUDP',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                network: 'tcp',
                'packet-encoding': 'xudp',
            }),
        ).to.equal(
            'VLESS-XUDP=vless,example.com,443,password=11111111-1111-4111-8111-111111111111',
        );

        expect(() =>
            produce({
                type: 'vless',
                name: 'VLESS-No-Packet-Encoding',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                network: 'tcp',
                'packet-encoding': '',
            }),
        ).to.throw('Unsupported Shadowrocket native VLESS packet-encoding');
    });

    it('outputs HTTP', function () {
        expect(
            produce({
                type: 'http',
                name: 'HTTP-Test',
                server: 'example.com',
                port: 8080,
                username: 'test',
                password: 'password',
            }),
        ).to.equal('HTTP-Test=http,example.com,8080,test,password');
    });

    it('outputs HTTPS', function () {
        expect(
            produce({
                type: 'http',
                name: 'HTTPS-Test',
                server: 'example.com',
                port: 443,
                username: 'test',
                password: 'password',
                tls: true,
            }),
        ).to.equal('HTTPS-Test=https,example.com,443,test,password');
    });

    it('outputs SOCKS5', function () {
        expect(
            produce({
                type: 'socks5',
                name: 'SOCKS-Test',
                server: 'example.com',
                port: 1080,
                username: 'test',
                password: 'password',
            }),
        ).to.equal('SOCKS-Test=socks5,example.com,1080,test,password');
    });

    it('outputs SOCKS5 TLS', function () {
        expect(
            produce({
                type: 'socks5',
                name: 'SOCKS-TLS-Test',
                server: 'example.com',
                port: 1080,
                username: 'test',
                password: 'password',
                tls: true,
            }),
        ).to.equal('SOCKS-TLS-Test=socks5-tls,example.com,1080,test,password');
    });

    it('rejects SOCKS5 certificate options when TLS is disabled', function () {
        expect(() =>
            produce({
                type: 'socks5',
                name: 'SOCKS-No-TLS-Verify',
                server: 'example.com',
                port: 1080,
                'skip-cert-verify': true,
            }),
        ).to.throw('Unsupported Shadowrocket native SOCKS5 options');
    });

    it('outputs Trojan', function () {
        expect(
            produce({
                type: 'trojan',
                name: 'Trojan-Test',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                sni: 'example.com',
            }),
        ).to.equal(
            'Trojan-Test=trojan,example.com,443,password=test-password,peer=example.com',
        );
    });

    it('preserves Trojan TLS connection settings', function () {
        expect(
            produce({
                type: 'trojan',
                name: 'Trojan-TLS',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                sni: 'sni.example.com',
                'skip-cert-verify': true,
            }),
        ).to.equal(
            'Trojan-TLS=trojan,example.com,443,password=test-password,peer=sni.example.com,allowInsecure=1',
        );
    });

    it('rejects undocumented Trojan TLS extensions', function () {
        expect(() =>
            produce({
                type: 'trojan',
                name: 'Trojan-TLS-Extensions',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                'client-fingerprint': 'chrome',
                alpn: ['h2'],
            }),
        ).to.throw('Unsupported Shadowrocket native Trojan options');
    });

    it('rejects Trojan WebSocket instead of downgrading it', function () {
        expect(() =>
            produce({
                type: 'trojan',
                name: 'Trojan-WS',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                network: 'ws',
                'ws-opts': {
                    path: '/trojan',
                    headers: { Host: 'cdn.example.com' },
                },
            }),
        ).to.throw('Unsupported Shadowrocket native Trojan network: ws');
    });

    it('outputs Hysteria2', function () {
        expect(
            produce({
                type: 'hysteria2',
                name: 'HY2-Test',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
            }),
        ).to.equal(
            'HY2-Test=hysteria2,example.com,443,auth=test-password,udp=1,peer=example.com,alpn=h3',
        );
    });

    it('outputs Hysteria', function () {
        expect(
            produce({
                type: 'hysteria',
                name: 'Hysteria-Test',
                server: 'example.com',
                port: 443,
                'auth-str': 'test-password',
                obfs: 'test-obfs',
                protocol: 'udp',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
                up: 100,
                down: 200,
            }),
        ).to.equal(
            'Hysteria-Test=hysteria,example.com,443,auth=test-password,obfsParam=test-obfs,protocol=udp,udp=1,peer=example.com,alpn=h3,upmbps=100,downmbps=200',
        );
    });

    it('outputs TUIC', function () {
        expect(
            produce({
                type: 'tuic',
                name: 'TUIC-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
            }),
        ).to.equal(
            'TUIC-Test=tuic,example.com,443,password=test-password,udp=1,user=11111111-1111-4111-8111-111111111111,peer=example.com,alpn=h3',
        );
    });

    it('outputs Juicity', function () {
        expect(
            produce({
                type: 'juicity',
                name: 'Juicity-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
                udp: true,
                sni: 'example.com',
                alpn: ['h3'],
            }),
        ).to.equal(
            'Juicity-Test=juicity,example.com,443,password=test-password,udp=1,user=11111111-1111-4111-8111-111111111111,peer=example.com,alpn=h3',
        );
    });

    it('outputs WireGuard', function () {
        expect(
            produce({
                type: 'wireguard',
                name: 'WG-Test',
                server: 'example.com',
                port: 51820,
                'private-key': 'private-key',
                'public-key': 'public-key',
                ip: '10.0.0.2/32',
                udp: true,
                dns: ['1.1.1.1'],
                mtu: 1280,
                keepalive: 25,
                reserved: [1, 2, 3],
            }),
        ).to.equal(
            'WG-Test=wireguard,example.com,51820,privateKey=private-key,publicKey=public-key,ip=10.0.0.2/32,udp=1,dns=1.1.1.1,mtu=1280,keepalive=25,reserved=1/2/3',
        );
    });

    it('outputs Snell', function () {
        expect(
            produce({
                type: 'snell',
                name: 'Snell-Test',
                server: 'example.com',
                port: 443,
                psk: 'test-password',
                udp: true,
                version: 2,
                'obfs-opts': {
                    mode: 'http',
                    host: 'example.com',
                    path: '/abc',
                },
            }),
        ).to.equal(
            'Snell-Test=snell,example.com,443,password=test-password,udp=1,obfs=http,obfs-host=example.com,obfs-uri=/abc',
        );
    });

    it('outputs VLESS WebSocket', function () {
        expect(
            produce({
                type: 'vless',
                name: 'VLESS-WS-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                tls: true,
                sni: 'sni.example.com',
                'skip-cert-verify': true,
                network: 'ws',
                'ws-opts': {
                    path: '/ws',
                    headers: {
                        Host: 'cdn.example.com',
                    },
                },
            }),
        ).to.equal(
            'VLESS-WS-Test=vless,example.com,443,password=11111111-1111-4111-8111-111111111111,tls=true,obfs=websocket,path=/ws,obfsParam=cdn.example.com,peer=sni.example.com,allowInsecure=1',
        );
    });

    it('rejects unsupported VLESS transports instead of dropping them', function () {
        expect(() =>
            produce({
                type: 'vless',
                name: 'VLESS-gRPC',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                network: 'grpc',
                'grpc-opts': {
                    'grpc-service-name': 'example',
                },
            }),
        ).to.throw('Unsupported Shadowrocket native VLESS network: grpc');
    });

    for (const type of ['vmess', 'vless', 'trojan']) {
        it(`rejects ${type} Reality instead of downgrading it`, function () {
            expect(() =>
                produce({
                    type,
                    name: `${type}-Reality`,
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    password: 'test-password',
                    cipher:
                        type === 'vmess'
                            ? 'auto'
                            : type === 'vless'
                            ? 'none'
                            : undefined,
                    network: 'tcp',
                    tls: true,
                    flow: type === 'vless' ? 'xtls-rprx-vision' : undefined,
                    'reality-opts': {
                        'public-key': 'public-key',
                        'short-id': '08',
                    },
                }),
            ).to.throw(
                `Unsupported Shadowrocket native ${
                    type === 'vmess'
                        ? 'VMess'
                        : type === 'vless'
                        ? 'VLESS'
                        : 'Trojan'
                } options`,
            );
        });
    }

    for (const type of ['vmess', 'vless']) {
        it(`rejects ${type} WebSocket early data`, function () {
            expect(() =>
                produce({
                    type,
                    name: `${type}-WS-Early-Data`,
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: type === 'vmess' ? 'auto' : 'none',
                    network: 'ws',
                    'ws-opts': {
                        path: '/ws',
                        headers: { Host: 'cdn.example.com' },
                        'max-early-data': 2048,
                        'early-data-header-name': 'Sec-WebSocket-Protocol',
                    },
                }),
            ).to.throw(
                `Unsupported Shadowrocket native ${
                    type === 'vmess' ? 'VMess' : 'VLESS'
                } WebSocket options: max-early-data, early-data-header-name`,
            );
        });
    }

    it('rejects WireGuard fields that native syntax cannot preserve', function () {
        expect(() =>
            produce({
                type: 'wireguard',
                name: 'WG-Extended',
                server: 'example.com',
                port: 51820,
                'private-key': 'private-key',
                'public-key': 'public-key',
                'preshared-key': 'preshared-key',
                ip: '10.0.0.2/32',
                ipv6: 'fd00::2/128',
            }),
        ).to.throw('Unsupported Shadowrocket native WireGuard options');
    });

    it('rejects Snell ShadowTLS instead of dropping its credentials', function () {
        expect(() =>
            produce({
                type: 'snell',
                name: 'Snell-ShadowTLS',
                server: 'example.com',
                port: 443,
                psk: 'test-password',
                version: 4,
                plugin: 'shadow-tls',
                'plugin-opts': {
                    host: 'mask.example.com',
                    password: 'shadow-password',
                    version: 3,
                    alpn: ['h2'],
                },
            }),
        ).to.throw('Unsupported Shadowrocket native Snell ShadowTLS options');
    });

    it('rejects undocumented TLS verification settings', function () {
        for (const proxy of [
            {
                type: 'hysteria2',
                name: 'HY2-TLS',
                password: 'test-password',
            },
            {
                type: 'tuic',
                name: 'TUIC-TLS',
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
            },
            {
                type: 'juicity',
                name: 'Juicity-TLS',
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
            },
        ]) {
            expect(() =>
                produce({
                    ...proxy,
                    server: 'example.com',
                    port: 443,
                    sni: 'sni.example.com',
                    'skip-cert-verify': true,
                    'client-fingerprint': 'chrome',
                    alpn: ['h3'],
                }),
            ).to.throw(
                `Unsupported Shadowrocket native ${
                    proxy.type === 'hysteria2'
                        ? 'Hysteria2'
                        : proxy.type === 'tuic'
                        ? 'TUIC'
                        : 'Juicity'
                } options`,
            );
        }
    });

    it('preserves SOCKS5 TLS certificate verification settings', function () {
        expect(
            produce({
                type: 'socks5',
                name: 'SOCKS5-TLS',
                server: 'example.com',
                port: 443,
                tls: true,
                username: 'test',
                password: 'password',
                'skip-cert-verify': true,
            }),
        ).to.include('skip-common-name-verify=true');
    });

    it('rejects undocumented HTTPS certificate verification settings', function () {
        expect(() =>
            produce({
                type: 'http',
                name: 'HTTPS-Verify',
                server: 'example.com',
                port: 443,
                tls: true,
                username: 'test',
                password: 'password',
                'skip-cert-verify': true,
            }),
        ).to.throw('Unsupported Shadowrocket native HTTPS options');
    });

    it('rejects unsupported advanced transport options', function () {
        expect(() =>
            produce({
                type: 'hysteria2',
                name: 'HY2-Port-Hopping',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                ports: '8443-9443',
                'hop-interval': 30,
            }),
        ).to.throw('Unsupported Shadowrocket native Hysteria2 options');

        expect(() =>
            produce({
                type: 'tuic',
                name: 'TUIC-BBR',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
                'congestion-controller': 'bbr',
            }),
        ).to.throw(
            'Unsupported Shadowrocket native TUIC congestion-controller',
        );
    });

    it('preserves the enabled Hysteria2 salamander password', function () {
        expect(
            produce({
                type: 'hysteria2',
                name: 'HY2-Salamander',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                obfs: 'salamander',
                'obfs-password': 'obfs-secret',
            }),
        ).to.equal(
            'HY2-Salamander=hysteria2,example.com,443,auth=test-password,obfsParam=obfs-secret,udp=1',
        );
    });

    it('rejects unverified Hysteria2 obfs variants', function () {
        expect(() =>
            produce({
                type: 'hysteria2',
                name: 'HY2-Gecko',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                obfs: 'gecko',
                'obfs-password': 'obfs-secret',
            }),
        ).to.throw('Unsupported Shadowrocket native Hysteria2 obfs: gecko');
    });

    it('requires a password for Hysteria2 salamander obfs', function () {
        expect(() =>
            produce({
                type: 'hysteria2',
                name: 'HY2-Salamander-Missing-Password',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                obfs: 'salamander',
            }),
        ).to.throw(
            'Missing required Shadowrocket native Hysteria2 salamander obfs-password',
        );
    });

    it('rejects every meaningful top-level field outside protocol allowlists', function () {
        const cases = [
            {
                protocol: 'Shadowsocks',
                proxy: {
                    type: 'ss',
                    name: 'SS-UoT',
                    server: 'example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: 'test-password',
                    'udp-over-tcp': true,
                },
            },
            {
                protocol: 'VMess',
                proxy: {
                    type: 'vmess',
                    name: 'VMess-Packet-Encoding',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: 'auto',
                    network: 'tcp',
                    'packet-encoding': 'xudp',
                },
            },
            {
                protocol: 'VLESS',
                proxy: {
                    type: 'vless',
                    name: 'VLESS-Smux',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    network: 'tcp',
                    smux: { enabled: true },
                },
            },
            {
                protocol: 'Trojan',
                proxy: {
                    type: 'trojan',
                    name: 'Trojan-Smux',
                    server: 'example.com',
                    port: 443,
                    password: 'test-password',
                    smux: { enabled: true },
                },
            },
            {
                protocol: 'Hysteria',
                proxy: {
                    type: 'hysteria',
                    name: 'Hysteria-Obfs-Type',
                    server: 'example.com',
                    port: 443,
                    'auth-str': 'test-password',
                    _obfs: 'xplus',
                },
            },
            {
                protocol: 'Hysteria2',
                proxy: {
                    type: 'hysteria2',
                    name: 'HY2-Bandwidth',
                    server: 'example.com',
                    port: 443,
                    password: 'test-password',
                    up: 100,
                },
            },
            {
                protocol: 'TUIC',
                proxy: {
                    type: 'tuic',
                    name: 'TUIC-Heartbeat',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    password: 'test-password',
                    'heartbeat-interval': 10000,
                },
            },
            {
                protocol: 'Juicity',
                proxy: {
                    type: 'juicity',
                    name: 'Juicity-Congestion',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    password: 'test-password',
                    'congestion-controller': 'bbr',
                },
            },
        ];

        for (const { protocol, proxy } of cases) {
            expect(() => produce(proxy)).to.throw(
                `Unsupported Shadowrocket native ${protocol} options`,
            );
        }
    });

    it('rejects UDP disabling when native syntax cannot preserve it', function () {
        const cases = [
            {
                protocol: 'Shadowsocks',
                proxy: {
                    type: 'ss',
                    cipher: 'aes-128-gcm',
                    password: 'test-password',
                },
            },
            {
                protocol: 'VMess',
                proxy: {
                    type: 'vmess',
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: 'auto',
                },
            },
            {
                protocol: 'VLESS',
                proxy: {
                    type: 'vless',
                    uuid: '11111111-1111-4111-8111-111111111111',
                },
            },
            {
                protocol: 'SOCKS5',
                proxy: {
                    type: 'socks5',
                },
            },
            {
                protocol: 'Trojan',
                proxy: {
                    type: 'trojan',
                    password: 'test-password',
                },
            },
        ];

        for (const { protocol, proxy } of cases) {
            expect(() =>
                produce({
                    ...proxy,
                    name: `${protocol}-No-UDP`,
                    server: 'example.com',
                    port: 443,
                    udp: false,
                }),
            ).to.throw(`Unsupported Shadowrocket native ${protocol} udp=false`);
        }
    });

    it('rejects non-boolean native UDP values', function () {
        expect(() =>
            produce({
                type: 'ss',
                name: 'SS-String-UDP',
                server: 'example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'test-password',
                udp: 'false',
            }),
        ).to.throw(
            'Unsupported Shadowrocket native Shadowsocks udp value: false',
        );
    });

    it('rejects non-boolean native flag values before normalization', function () {
        const cases = [
            {
                message: 'Unsupported Shadowrocket native HTTP tls value',
                proxy: {
                    type: 'http',
                    name: 'HTTP-String-TLS',
                    server: 'example.com',
                    port: 443,
                    tls: 'false',
                },
            },
            {
                message:
                    'Unsupported Shadowrocket native SOCKS5 skip-cert-verify value',
                proxy: {
                    type: 'socks5',
                    name: 'SOCKS-String-Verify',
                    server: 'example.com',
                    port: 443,
                    tls: true,
                    'skip-cert-verify': 'false',
                },
            },
            {
                message: 'Unsupported Shadowrocket native VMess tfo value',
                proxy: {
                    type: 'vmess',
                    name: 'VMess-String-TFO',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: 'auto',
                    tfo: 'false',
                },
            },
            {
                message: 'Unsupported Shadowrocket native TUIC fast-open value',
                proxy: {
                    type: 'tuic',
                    name: 'TUIC-Numeric-Fast-Open',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    password: 'test-password',
                    'fast-open': 1,
                },
            },
        ];

        for (const { message, proxy } of cases) {
            expect(() => produce(proxy)).to.throw(message);
        }
    });

    it('rejects conflicting aliases instead of choosing one silently', function () {
        const cases = [
            {
                message:
                    'Conflicting Shadowrocket native VMess server name aliases',
                proxy: {
                    type: 'vmess',
                    name: 'VMess-SNI-Conflict',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    cipher: 'auto',
                    tls: true,
                    sni: 'one.example.com',
                    servername: 'two.example.com',
                },
            },
            {
                message:
                    'Conflicting Shadowrocket native VLESS WebSocket Host aliases',
                proxy: {
                    type: 'vless',
                    name: 'VLESS-Host-Conflict',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    network: 'ws',
                    'ws-opts': {
                        headers: {
                            Host: 'one.example.com',
                            host: 'two.example.com',
                        },
                    },
                },
            },
            {
                message:
                    'Conflicting Shadowrocket native Hysteria authentication aliases',
                proxy: {
                    type: 'hysteria',
                    name: 'Hysteria-Auth-Conflict',
                    server: 'example.com',
                    port: 443,
                    'auth-str': 'one',
                    auth: 'two',
                },
            },
            {
                message:
                    'Conflicting Shadowrocket native WireGuard keepalive aliases',
                proxy: {
                    type: 'wireguard',
                    name: 'WireGuard-Keepalive-Conflict',
                    server: 'example.com',
                    port: 51820,
                    'private-key': 'private-key',
                    'public-key': 'public-key',
                    ip: '10.0.0.2/32',
                    keepalive: 25,
                    'persistent-keepalive': 30,
                },
            },
        ];

        for (const { message, proxy } of cases) {
            expect(() => produce(proxy)).to.throw(message);
        }
    });

    it('accepts duplicate aliases when their values agree', function () {
        expect(
            produce({
                type: 'vless',
                name: 'VLESS-Matching-Aliases',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                tls: true,
                sni: 'sni.example.com',
                servername: 'sni.example.com',
                network: 'ws',
                'ws-opts': {
                    headers: {
                        Host: 'cdn.example.com',
                        host: 'cdn.example.com',
                    },
                },
            }),
        ).to.equal(
            'VLESS-Matching-Aliases=vless,example.com,443,password=11111111-1111-4111-8111-111111111111,tls=true,obfs=websocket,path=/,obfsParam=cdn.example.com,peer=sni.example.com',
        );
    });

    it('rejects advanced VMess fields as a group', function () {
        expect(() =>
            produce({
                type: 'vmess',
                name: 'VMess-Advanced',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                cipher: 'auto',
                network: 'tcp',
                'packet-encoding': 'xudp',
                'global-padding': true,
                'authenticated-length': true,
                smux: { enabled: true },
            }),
        ).to.throw(
            'Unsupported Shadowrocket native VMess options: authenticated-length, global-padding, packet-encoding, smux',
        );
    });

    it('does not let false-valued unknown fields bypass allowlists', function () {
        expect(() =>
            produce({
                type: 'vmess',
                name: 'VMess-False-Advanced-Option',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                cipher: 'auto',
                network: 'tcp',
                'authenticated-length': false,
            }),
        ).to.throw(
            'Unsupported Shadowrocket native VMess options: authenticated-length',
        );
    });

    it('rejects missing required fields and invalid ports', function () {
        expect(() =>
            produce({
                type: 'vless',
                name: 'VLESS-Missing-UUID',
                server: 'example.com',
                port: 443,
            }),
        ).to.throw('Missing required Shadowrocket native VLESS options: uuid');

        for (const port of [70000, '0x1bb', '4.43e2', ' 443 ', '443.0']) {
            expect(() =>
                produce({
                    type: 'ss',
                    name: 'SS-Invalid-Port',
                    server: 'example.com',
                    port,
                    cipher: 'aes-128-gcm',
                    password: 'test-password',
                }),
            ).to.throw('Invalid Shadowrocket native Shadowsocks port');
        }

        expect(
            produce({
                type: 'ss',
                name: 'SS-Normalized-Port',
                server: 'example.com',
                port: '00443',
                cipher: 'aes-128-gcm',
                password: 'test-password',
            }),
        ).to.equal(
            'SS-Normalized-Port=ss,example.com,443,password=test-password,method=aes-128-gcm',
        );
    });

    it('rejects delimiters and control characters in native values', function () {
        expect(() =>
            produce({
                type: 'ss',
                name: 'SS-Test',
                server: 'example.com',
                port: 8388,
                cipher: 'aes-128-gcm',
                password: 'pass,word',
            }),
        ).to.throw(
            'Unsupported comma or control character in Shadowrocket native value',
        );

        expect(() =>
            produce({
                type: 'http',
                name: 'HTTP\nInjected=direct',
                server: 'example.com',
                port: 8080,
            }),
        ).to.throw(
            'Unsupported comma or control character in Shadowrocket native value',
        );

        for (const lineSeparator of ['\u0085', '\u2028', '\u2029']) {
            expect(() =>
                produce({
                    type: 'ss',
                    name: 'SS-Unicode-Line-Separator',
                    server: 'example.com',
                    port: 8388,
                    cipher: 'aes-128-gcm',
                    password: `before${lineSeparator}Injected=direct`,
                }),
            ).to.throw(
                'Unsupported comma or control character in Shadowrocket native value',
            );
        }

        expect(() =>
            produce({
                type: 'http',
                name: 'HTTP=Injected',
                server: 'example.com',
                port: 8080,
            }),
        ).to.throw('Unsupported equals sign in Shadowrocket native proxy name');
    });

    it('throws for proxy types and Snell versions previously filtered out', function () {
        expect(() =>
            produce({
                type: 'tailscale',
                name: 'Tailscale-Test',
                server: 'example.com',
                port: 443,
            }),
        ).to.throw('Unsupported Shadowrocket native proxy type: tailscale');

        expect(() =>
            produce({
                type: 'snell',
                name: 'Snell-Version-7',
                server: 'example.com',
                port: 443,
                psk: 'test-password',
                version: 7,
            }),
        ).to.throw('Unsupported Shadowrocket native Snell version: 7');
    });

    it('does not silently drop unsupported native proxy types', function () {
        expect(() =>
            produce({
                type: 'anytls',
                name: 'AnyTLS-Test',
                server: 'example.com',
                port: 443,
                password: 'test-password',
            }),
        ).to.throw('Unsupported Shadowrocket native proxy type: anytls');
    });

    it('rejects multiple ALPN values in native output', function () {
        expect(() =>
            produce({
                type: 'hysteria2',
                name: 'HY2-Multi-ALPN',
                server: 'example.com',
                port: 443,
                password: 'test-password',
                alpn: ['h3', 'h2'],
            }),
        ).to.throw('Unsupported multiple Shadowrocket native alpn values');
    });

    it('rejects multiple DNS values in native WireGuard output', function () {
        expect(() =>
            produce({
                type: 'wireguard',
                name: 'WG-Multi-DNS',
                server: 'example.com',
                port: 51820,
                'private-key': 'private-key',
                'public-key': 'public-key',
                ip: '10.0.0.2/32',
                dns: ['1.1.1.1', '8.8.8.8'],
            }),
        ).to.throw('Unsupported multiple Shadowrocket native dns values');
    });

    it('rejects undocumented TUIC token authentication in native output', function () {
        expect(() =>
            produce({
                type: 'tuic',
                name: 'TUIC-Token',
                server: 'example.com',
                port: 443,
                token: 'test-token',
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
            }),
        ).to.throw('Unsupported Shadowrocket native TUIC token authentication');
    });

    it('rejects unverified TUIC versions', function () {
        expect(() =>
            produce({
                type: 'tuic',
                name: 'TUIC-v4',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                password: 'test-password',
                version: 4,
            }),
        ).to.throw('Unsupported Shadowrocket native TUIC version: 4');
    });

    it('limits Snell native output to the documented v2 subset', function () {
        expect(() =>
            produce({
                type: 'snell',
                name: 'Snell-v3',
                server: 'example.com',
                port: 443,
                psk: 'test-password',
                version: 3,
            }),
        ).to.throw('Unsupported Shadowrocket native Snell version: 3');
    });

    it('rejects nested WireGuard peer objects', function () {
        for (const peers of [
            [
                {
                    server: 'peer.example.com',
                    port: 51820,
                    'public-key': 'public-key',
                },
            ],
            {
                server: 'peer.example.com',
                port: 51820,
                'public-key': 'public-key',
            },
        ]) {
            expect(() =>
                produce({
                    type: 'wireguard',
                    name: 'WG-Peers',
                    server: 'example.com',
                    port: 51820,
                    'private-key': 'private-key',
                    'public-key': 'public-key',
                    ip: '10.0.0.2/32',
                    peers,
                }),
            ).to.throw('Unsupported Shadowrocket native WireGuard peers');
        }
    });

    it('validates WireGuard reserved bytes', function () {
        for (const reserved of [[1, 2], [1, 2, 256], '1/2', true]) {
            expect(() =>
                produce({
                    type: 'wireguard',
                    name: 'WG-Invalid-Reserved',
                    server: 'example.com',
                    port: 51820,
                    'private-key': 'private-key',
                    'public-key': 'public-key',
                    ip: '10.0.0.2/32',
                    reserved,
                }),
            ).to.throw(
                'Unsupported Shadowrocket native WireGuard reserved value',
            );
        }
    });

    it('keeps internal output as an array when native mode is enabled', function () {
        const output = Shadowrocket_Producer().produce(
            [
                {
                    type: 'vless',
                    name: 'VLESS-Test',
                    server: 'example.com',
                    port: 443,
                    uuid: '11111111-1111-4111-8111-111111111111',
                    tls: true,
                },
            ],
            'internal',
            { native: true },
        );

        expect(output).to.be.an('array');
        expect(output[0].type).to.equal('vless');
    });

    it('keeps the existing YAML output when native mode is disabled', function () {
        const output = Shadowrocket_Producer().produce([
            {
                type: 'vless',
                name: 'VLESS-Test',
                server: 'example.com',
                port: 443,
                uuid: '11111111-1111-4111-8111-111111111111',
                tls: true,
                network: 'tcp',
            },
        ]);

        expect(output).to.include('proxies:');
    });
});
