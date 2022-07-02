import getQXParser from '@/core/proxy-utils/parsers/peggy/qx';
import { describe, it } from 'mocha';
import testcases from './testcases';
import { expect } from 'chai';

const parser = getQXParser();

describe('QX', function () {
    describe('shadowsocks', function () {
        it('test shadowsocks simple', function () {
            const { input, expected } = testcases.SS.SIMPLE;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks obfs + tls', function () {
            const { input, expected } = testcases.SS.OBFS_TLS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks obfs + http', function () {
            const { input, expected } = testcases.SS.OBFS_HTTP;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks v2ray-plugin + ws', function () {
            const { input, expected } = testcases.SS.V2RAY_PLUGIN_WS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
        it('test shadowsocks v2ray-plugin + wss', function () {
            const { input, expected } = testcases.SS.V2RAY_PLUGIN_WSS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
    });

    describe('shadowsocksr', function () {
        it('test shadowsocksr simple', function () {
            const { input, expected } = testcases.SSR.SIMPLE;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
    });

    describe('trojan', function () {
        it('test trojan simple', function () {
            const { input, expected } = testcases.TROJAN.SIMPLE;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });

        it('test trojan + ws', function () {
            const { input, expected } = testcases.TROJAN.WS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });

        it('test trojan + wss', function () {
            const { input, expected } = testcases.TROJAN.WSS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });

        it('test trojan + tls fingerprint', function () {
            const { input, expected } = testcases.TROJAN.TLS_FINGERPRINT;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
    });

    describe('vmess', function () {
        it('test vmess simple', function () {
            const { input, expected } = testcases.VMESS.SIMPLE;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected.QX);
        });

        it('test vmess aead', function () {
            const { input, expected } = testcases.VMESS.AEAD;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected.QX);
        });

        it('test vmess + ws', function () {
            const { input, expected } = testcases.VMESS.WS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected.QX);
        });

        it('test vmess + wss', function () {
            const { input, expected } = testcases.VMESS.WSS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected.QX);
        });

        it('test vmess + http', function () {
            const { input, expected } = testcases.VMESS.HTTP;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected.QX);
        });
    });

    describe('http', function () {
        it('test http simple', function () {
            const { input, expected } = testcases.HTTP.SIMPLE;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });

        it('test http with authentication', function () {
            const { input, expected } = testcases.HTTP.AUTH;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });

        it('test https', function () {
            const { input, expected } = testcases.HTTP.TLS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
    });

    describe('socks5', function () {
        it('test socks5 simple', function () {
            const { input, expected } = testcases.SOCKS5.SIMPLE;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });

        it('test socks5 with authentication', function () {
            const { input, expected } = testcases.SOCKS5.AUTH;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });

        it('test socks5 + tls', function () {
            const { input, expected } = testcases.SOCKS5.TLS;
            const proxy = parser.parse(input.QX);
            expect(proxy).eql(expected);
        });
    });
});
