import { expect } from 'chai';
import { describe, it } from 'mocha';

import getQxParser from '@/core/proxy-utils/parsers/peggy/qx';
import QX_Producer from '@/core/proxy-utils/producers/qx';

const parser = getQxParser();

describe('QX comma password parsing', function () {
    const cases = [
        {
            name: 'HTTP',
            input: 'http=127.0.0.1:18080,username=test,password=abc,123,udp-relay=true,tag=HTTP-Comma-Test',
            tag: 'HTTP-Comma-Test',
        },
        {
            name: 'SOCKS5',
            input: 'socks5=127.0.0.1:1080,username=test,password=abc,123,udp-relay=true,tag=SOCKS-Comma-Test',
            tag: 'SOCKS-Comma-Test',
        },
        {
            name: 'Trojan',
            input: 'trojan=example.com:443,password=abc,123,over-tls=true,tls-verification=false,tag=Trojan-Comma-Test',
            tag: 'Trojan-Comma-Test',
        },
        {
            name: 'Shadowsocks',
            input: 'shadowsocks=example.com:443,method=aes-128-gcm,password=abc,123,udp-relay=true,tag=SS-Comma-Test',
            tag: 'SS-Comma-Test',
        },
        {
            name: 'AnyTLS',
            input: 'anytls=example.com:443,password=abc,123,over-tls=true,tls-verification=false,tag=AnyTLS-Comma-Test',
            tag: 'AnyTLS-Comma-Test',
        },
    ];

    for (const testCase of cases) {
        it(`preserves commas inside ${testCase.name} passwords`, function () {
            const proxy = parser.parse(testCase.input);

            expect(proxy.password).to.equal('abc,123');
            expect(proxy.name).to.equal(testCase.tag);
        });
    }

    it('preserves multiple commas inside a password', function () {
        const proxy = parser.parse(
            'http=127.0.0.1:18080,username=test,password=abc,123,456,udp-relay=true,tag=Multi-Comma-Test',
        );

        expect(proxy.password).to.equal('abc,123,456');
        expect(proxy.udp).to.equal(true);
        expect(proxy.name).to.equal('Multi-Comma-Test');
    });

    it('stops the password before following TLS parameters', function () {
        const proxy = parser.parse(
            'http=127.0.0.1:18080,username=test,password=abc,123,over-tls=true,tls-host=example.com,tag=TLS-Test',
        );

        expect(proxy.password).to.equal('abc,123');
        expect(proxy.tls).to.equal(true);
        expect(proxy.sni).to.equal('example.com');
        expect(proxy.name).to.equal('TLS-Test');
    });

    it('keeps normal passwords unchanged', function () {
        const proxy = parser.parse(
            'http=127.0.0.1:18080,username=test,password=abc123,udp-relay=true,tag=Normal-Test',
        );

        expect(proxy.password).to.equal('abc123');
        expect(proxy.name).to.equal('Normal-Test');
    });

    it('preserves a comma password through QX parse and output', function () {
        const proxy = parser.parse(
            'http=127.0.0.1:18080,username=test,password=abc,123,udp-relay=true,tag=Roundtrip-Test',
        );

        const output = QX_Producer().produce(proxy);

        expect(proxy.password).to.equal('abc,123');
        expect(output).to.include('password=abc,123');
        expect(output).to.include('tag=Roundtrip-Test');
    });
});
