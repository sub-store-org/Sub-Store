import getLoonParser from '@/core/proxy-utils/parsers/peggy/loon';
import { describe, it } from 'mocha';
import testcases from './testcases';
import { expect } from 'chai';

const parser = getLoonParser();

describe('Loon', function () {
    describe('shadowsocks', function () {
        it('test shadowsocks simple', function () {
            const { input, expected } = testcases.SS.SIMPLE;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks obfs + tls', function () {
            const { input, expected } = testcases.SS.OBFS_TLS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks obfs + http', function () {
            const { input, expected } = testcases.SS.OBFS_HTTP;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });
    });

    describe('shadowsocksr', function () {
        it('test shadowsocksr simple', function () {
            const { input, expected } = testcases.SSR.SIMPLE;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });
    });

    describe('trojan', function () {
        it('test trojan simple', function () {
            const { input, expected } = testcases.TROJAN.SIMPLE;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });

        it('test trojan + ws', function () {
            const { input, expected } = testcases.TROJAN.WS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });

        it('test trojan + wss', function () {
            const { input, expected } = testcases.TROJAN.WSS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });
    });

    describe('vmess', function () {
        it('test vmess simple', function () {
            const { input, expected } = testcases.VMESS.SIMPLE;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vmess + aead', function () {
            const { input, expected } = testcases.VMESS.AEAD;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vmess + ws', function () {
            const { input, expected } = testcases.VMESS.WS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vmess + wss', function () {
            const { input, expected } = testcases.VMESS.WSS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vmess + http', function () {
            const { input, expected } = testcases.VMESS.HTTP;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vmess + http + tls', function () {
            const { input, expected } = testcases.VMESS.HTTP_TLS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });
    });

    describe('vless', function () {
        it('test vless simple', function () {
            const { input, expected } = testcases.VLESS.SIMPLE;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vless + ws', function () {
            const { input, expected } = testcases.VLESS.WS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vless + wss', function () {
            const { input, expected } = testcases.VLESS.WSS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vless + http', function () {
            const { input, expected } = testcases.VLESS.HTTP;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });

        it('test vless + http + tls', function () {
            const { input, expected } = testcases.VLESS.HTTP_TLS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected.Loon);
        });
    });

    describe('http(s)', function () {
        it('test http simple', function () {
            const { input, expected } = testcases.HTTP.SIMPLE;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });

        it('test http with authentication', function () {
            const { input, expected } = testcases.HTTP.AUTH;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });

        it('test https', function () {
            const { input, expected } = testcases.HTTP.TLS;
            const proxy = parser.parse(input.Loon);
            expect(proxy).eql(expected);
        });
    });
});
