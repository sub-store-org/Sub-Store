import { expect } from 'chai';
import QX_Producer from '@/core/proxy-utils/producers/qx';

describe('Quantumult X ALPN output', function () {
    it('encodes canonical VLESS ALPN values as tls-alpn', function () {
        const producer = QX_Producer();

        const output = producer.produce({
            type: 'vless',
            name: 'ALPN-Test',
            server: 'example.com',
            port: 443,
            uuid: '11111111-1111-4111-8111-111111111111',
            tls: true,
            sni: 'example.com',
            alpn: ['h2', 'http/1.1'],
            'skip-cert-verify': false,
            udp: true,
            network: 'tcp',
        });

        expect(output).to.include(
            'tls-alpn=02683208687474702f312e31',
        );
    });

    it('preserves an existing QX tls-alpn value', function () {
        const producer = QX_Producer();

        const output = producer.produce({
            type: 'vless',
            name: 'ALPN-Test',
            server: 'example.com',
            port: 443,
            uuid: '11111111-1111-4111-8111-111111111111',
            tls: true,
            sni: 'example.com',
            alpn: ['http/1.1'],
            'tls-alpn': '026832',
            'skip-cert-verify': false,
            udp: true,
            network: 'tcp',
        });

        expect(output).to.include('tls-alpn=026832');
        expect(output).not.to.include('tls-alpn=08687474702f312e31');
    });
});
