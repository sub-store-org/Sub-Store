import { nativeBoundarySuccesses, nativeBoundaryFailures } from '../fixtures/shadowrocket-native-boundaries';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { Base64 } from 'js-base64';
import { ProxyUtils } from '@/core/proxy-utils';

const UUID = '11111111-1111-4111-8111-111111111111';
const exportRaw = (raw, native = true) =>
    ProxyUtils.produce(
        ProxyUtils.parse(raw, { native }),
        'Shadowrocket',
        'external',
        { native: true },
    );
const sources = [
    ['ss', 'ss://YWVzLTEyOC1nY206c2VjcmV0@example.com:8388#SS'],
    [
        'vless',
        `vless://${UUID}@example.com:443?security=tls&type=ws&host=cdn.example.com&encryption=none#VLESS`,
    ],
    ['trojan', 'trojan://secret@example.com:443#Trojan'],
    [
        'hysteria',
        'hysteria://example.com:443?auth=secret&insecure=false&upmbps=10&downmbps=20#HY',
    ],
    ['hysteria2', 'hysteria2://secret@example.com:443#HY2'],
    ['tuic', `tuic://${UUID}:secret@example.com:443#TUIC`],
    [
        'wireguard',
        'wg://private-key@example.com:51820?publickey=public-key&address=10.0.0.2/32#WG',
    ],
    ['http', 'http://user:secret@example.com:8080#HTTP'],
    ['socks5', 'socks5://user:secret@example.com:1080#SOCKS'],
];
const withOption = (raw, option) => {
    const [body, name] = raw.split('#');
    return (
        body +
        (body.includes('?') ? '&' : '?') +
        option +
        (name ? '#' + name : '')
    );
};

describe('Shadowrocket native URI and input matrix', function () {
    for (const [label, raw, expected, absent = []] of nativeBoundarySuccesses) {
        it(`preserves boundary input: ${label}`, function () {
            const output = exportRaw(raw);
            for (const part of expected) expect(output).to.include(part);
            for (const part of absent) expect(output).not.to.include(part);
        });
    }
    it('preserves URI fixes and header maps in ordinary JSON output', function () {
        for (const [label, raw] of nativeBoundarySuccesses) {
            const output = ProxyUtils.produce(ProxyUtils.parse(raw), 'JSON', 'external');
            expect(JSON.parse(output), label).not.to.be.empty;
            expect(output, label).not.to.include('_shadowrocket-native-validation-error');
            if (label === 'Text Surge disabled WS') expect(JSON.parse(output)[0].network).to.equal('tcp');
            if (label === 'Text Surge enabled WS') expect(JSON.parse(output)[0].network).to.equal('ws');
            if (label === 'SOCKS password colon') expect(JSON.parse(output)[0].password).to.equal('secret:tail');
            if (label === 'TUIC literal percent escape') expect(JSON.parse(output)[0].password).to.equal('secret%21');
            if (label === 'SSD independent defaults') expect(JSON.parse(output)[1]).to.include({password: 'default', port: 8388});
        }
        const raw = nativeBoundaryFailures.find(([label]) => label === 'VMess encoded extra header')[1];
        const output = ProxyUtils.produce(ProxyUtils.parse(raw), 'JSON', 'external');
        expect(JSON.parse(output)[0]['ws-opts'].headers['X-Test']).to.equal('secret');
        expect(output).not.to.include('_shadowrocket-native-validation-error');
    });
    for (const [label, raw] of nativeBoundaryFailures) {
        it(`rejects boundary information loss: ${label}`, function () {
            expect(() => exportRaw(raw)).to.throw('Shadowrocket native');
            if (label.startsWith('Text ')) {
                expect(() => exportRaw(raw, false)).to.throw('Shadowrocket native');
                const output = ProxyUtils.produce(ProxyUtils.parse(raw), 'JSON', 'external');
                expect(JSON.parse(output)).to.have.length(1);
                expect(output).not.to.include('_shadowrocket-native-validation-error');
            }
        });
    }

    for (const [protocol, raw] of sources) {
        it(`exports supported ${protocol} URIs through both parsing paths`, function () {
            const output = exportRaw(raw);
            expect(output).to.include(`=${protocol},example.com,`);
            expect(output).to.equal(exportRaw(raw, false));
            expect(output).not.to.include('[object Object]');
        });
        it(`rejects ignored ${protocol} URI options without changing ordinary parsing`, function () {
            const invalid = withOption(raw, 'unrecognized-setting=value');
            expect(() => exportRaw(invalid)).to.throw('Shadowrocket native');
            expect(() => exportRaw(invalid, false)).to.throw(
                'Shadowrocket native',
            );
            const output = ProxyUtils.produce(
                ProxyUtils.parse(invalid),
                'JSON',
                'external',
            );
            expect(JSON.parse(output)).to.have.length(1);
            expect(output).not.to.include(
                '_shadowrocket-native-validation-error',
            );
        });
    }
    for (const raw of [
        `vless://${UUID}@example.com:443?security=tls&sni=one.example&sni=two.example`,
        `vless://${UUID}@example.com:443?security=tls&allowInsecure=bogus`,
        `vless://${UUID}@example.com:443?security=tls&encryption=bogus`,
        `vless://${UUID}@example.com:443?security=tls&packetEncoding=bogus`,
        `vless://${UUID}@example.com:443?security=tls&type=tcp&path=%2Flost`,
        'trojan://secret@example.com:443?insecure=true',
        'hysteria2://secret@example.com:443?keepalive=bogus',
        'hysteria2://secret@example.com:443?tls=false',
        'hysteria2://secret@example.com:443?insecure=nottrue',
        'wg://private@example.com?publickey=public&address=10.0.0.2/32&mtu=1280garbage',
        'wg://private@example.com?publickey=public&address=10.0.0.2/32&reserved=1,2,3garbage',
        'wg://private@example.com?publickey=public&address=10.0.0.2/99',
        'wg://private@example.com?publickey=public&address=10.0.0.2/32,10.0.0.3/32',
    ]) {
        it(`rejects URI information loss: ${raw.split('?')[1]}`, function () {
            expect(() => exportRaw(raw)).to.throw('Shadowrocket native');
        });
    }
    it('accepts explicitly disabled SS TLS as the plain transport', function () {
        expect(
            exportRaw(withOption(sources[0][1], 'security=none')),
        ).to.include('=ss,');
    });
    it('preserves padded Hysteria authentication and does not append a port to Trojan names', function () {
        expect(
            exportRaw('hysteria://example.com:443?auth=secret==#HY'),
        ).to.include('auth=secret==,');
        expect(exportRaw('trojan://secret@example.com:443#Trojan')).to.match(
            /^Trojan=trojan,/,
        );
        expect(exportRaw('trojan://secret@example.com#Trojan')).to.match(
            /^Trojan=trojan,example.com,443/,
        );
        expect(
            exportRaw(
                `tuic://${UUID}:secret@example.com:443?fast-open=false#TUIC`,
            ),
        ).to.include('=tuic,');
    });
    it('exports Quantumult VMess WebSocket URIs and validates their options', function () {
        const make = (option = '') =>
            'vmess://' +
            Base64.encode(
                `VM=vmess,example.com,443,auto,"${UUID}",obfs=wss,obfs-path="/ws",obfs-header="Host: cdn.example.com"${option}`,
            );
        expect(exportRaw(make())).to.include(
            'obfs=websocket,path=/ws,obfsParam=cdn.example.com',
        );
        expect(exportRaw(make(',tls-verification=false'))).to.include(
            'allowInsecure=1',
        );
        expect(() => exportRaw(make(',tls-verification=bogus'))).to.throw(
            'Shadowrocket native',
        );
        expect(() => exportRaw(make(',unknown-setting=value'))).to.throw(
            'Shadowrocket native',
        );
    });
    it('keeps ordinary VMess TLS semantics independent of native support checks', function () {
        for (const fields of [{}, { unknownOption: true }, { net: 'grpc' }]) {
            const raw =
                'vmess://' +
                Base64.encode(
                    JSON.stringify({
                        ps: 'VM',
                        add: 'example.com',
                        port: 443,
                        id: UUID,
                        aid: 0,
                        scy: 'auto',
                        tls: 'true',
                        verify_cert: 'false',
                        ...fields,
                    }),
                );
            const output = JSON.parse(
                ProxyUtils.produce(ProxyUtils.parse(raw), 'JSON', 'external'),
            )[0];
            expect(output.tls, JSON.stringify(fields)).to.equal(true);
            expect(output['skip-cert-verify'], JSON.stringify(fields)).to.equal(
                true,
            );
            expect(output).not.to.have.property(
                '_shadowrocket-native-validation-error',
            );
        }
    });

    it('preserves confirmed VMess URI boolean representations', function () {
        for (const [tls, verify, expectedTLS, expectedInsecure] of [
            ['tls', 'false', true, true],
            ['true', 'true', true, false],
            ['false', undefined, false, false],
        ]) {
            const raw =
                'vmess://' +
                Base64.encode(
                    JSON.stringify({
                        ps: 'VM',
                        add: 'example.com',
                        port: 443,
                        id: UUID,
                        aid: 0,
                        scy: 'auto',
                        tls,
                        verify_cert: verify,
                    }),
                );
            const output = exportRaw(raw);
            expect(output.includes('tls=true')).to.equal(expectedTLS);
            expect(output.includes('allowInsecure=1')).to.equal(
                expectedInsecure,
            );
        }
    });
    for (const [type, fields] of [
        ['ss', { cipher: 'aes-128-gcm', password: 'secret' }],
        ['vmess', { cipher: 'auto', uuid: UUID }],
        ['vless', { uuid: UUID }],
        ['http', { username: 'user', password: 'secret' }],
        ['socks5', { username: 'user', password: 'secret' }],
        ['trojan', { password: 'secret' }],
        ['hysteria', { 'auth-str': 'secret', up: 10, down: 20 }],
        ['hysteria2', { password: 'secret' }],
        ['tuic', { uuid: UUID, password: 'secret' }],
        ['juicity', { uuid: UUID, password: 'secret' }],
        [
            'wireguard',
            {
                'private-key': 'private',
                'public-key': 'public',
                ip: '10.0.0.2/32',
                mtu: 1280,
            },
        ],
        ['snell', { psk: 'secret', version: 2 }],
    ]) {
        it(`validates ${type} scalar fields through Clash JSON`, function () {
            const base = {
                type,
                name: 'Node',
                server: 'example.com',
                port: 443,
                ...fields,
            };
            expect(exportRaw(JSON.stringify({ proxies: [base] }))).to.include(
                `=${type},`,
            );
            for (const key of Object.keys(base).filter(
                (key) => key !== 'type',
            )) {
                for (const value of [{}, [], true]) {
                    expect(
                        () =>
                            exportRaw(
                                JSON.stringify({
                                    proxies: [{ ...base, [key]: value }],
                                }),
                            ),
                        `${type}.${key}`,
                    ).to.throw('Shadowrocket native');
                }
            }
        });
    }
    for (const [type, fields] of [
        ['hysteria', { up: '10 Mbps' }],
        ['hysteria', { down: -1 }],
        ['wireguard', { mtu: '1280garbage' }],
        ['wireguard', { keepalive: -1 }],
    ]) {
        it(`rejects invalid numeric ${type} options ${JSON.stringify(
            fields,
        )}`, function () {
            expect(() =>
                exportRaw(
                    JSON.stringify({
                        proxies: [
                            {
                                type,
                                name: 'Node',
                                server: 'example.com',
                                port: 443,
                                ...fields,
                            },
                        ],
                    }),
                ),
            ).to.throw('Shadowrocket native');
        });
    }
});
