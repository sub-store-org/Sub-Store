import getSurgeParser from '@/core/proxy-utils/parsers/peggy/surge';
import { describe, it } from 'mocha';
import testcases from './testcases';
import { expect } from 'chai';

const parser = getSurgeParser();

describe('Surge', function () {
    describe('shadowsocks', function () {
        it('test shadowsocks simple', function () {
            const { input, expected } = testcases.SS.SIMPLE;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks obfs + tls', function () {
            const { input, expected } = testcases.SS.OBFS_TLS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks obfs + http', function () {
            const { input, expected } = testcases.SS.OBFS_HTTP;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });
    });

    describe('trojan', function () {
        it('test trojan simple', function () {
            const { input, expected } = testcases.TROJAN.SIMPLE;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test trojan + ws', function () {
            const { input, expected } = testcases.TROJAN.WS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test trojan + wss', function () {
            const { input, expected } = testcases.TROJAN.WSS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test trojan + tls fingerprint', function () {
            const { input, expected } = testcases.TROJAN.TLS_FINGERPRINT;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });
    });

    describe('vmess', function () {
        it('test vmess simple', function () {
            const { input, expected } = testcases.VMESS.SIMPLE;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected.Surge);
        });

        it('test vmess aead', function () {
            const { input, expected } = testcases.VMESS.AEAD;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected.Surge);
        });

        it('test vmess + ws', function () {
            const { input, expected } = testcases.VMESS.WS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected.Surge);
        });

        it('test vmess + wss', function () {
            const { input, expected } = testcases.VMESS.WSS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected.Surge);
        });
    });

    describe('http', function () {
        it('test http simple', function () {
            const { input, expected } = testcases.HTTP.SIMPLE;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test http with authentication', function () {
            const { input, expected } = testcases.HTTP.AUTH;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test https', function () {
            const { input, expected } = testcases.HTTP.TLS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });
    });

    describe('socks5', function () {
        it('test socks5 simple', function () {
            const { input, expected } = testcases.SOCKS5.SIMPLE;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test socks5 with authentication', function () {
            const { input, expected } = testcases.SOCKS5.AUTH;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test socks5 + tls', function () {
            const { input, expected } = testcases.SOCKS5.TLS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });
    });

    describe('snell', function () {
        it('test snell simple', function () {
            const { input, expected } = testcases.SNELL.SIMPLE;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test snell obfs + http', function () {
            const { input, expected } = testcases.SNELL.OBFS_HTTP;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });

        it('test snell obfs + tls', function () {
            const { input, expected } = testcases.SNELL.OBFS_TLS;
            const proxy = parser.parse(input.Surge);
            expect(proxy).eql(expected);
        });
    });
});
