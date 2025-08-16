import $ from '@/core/app';
import dnsPacket from 'dns-packet';
import { Buffer } from 'buffer';
import { isIPv4 } from '@/utils';

export async function doh({ url, domain, type = 'A', timeout, edns }) {
    const buf = dnsPacket.encode({
        type: 'query',
        id: 0,
        flags: dnsPacket.RECURSION_DESIRED,
        questions: [
            {
                type,
                name: domain,
            },
        ],
        additionals: [
            {
                type: 'OPT',
                name: '.',
                udpPayloadSize: 4096,
                flags: 0,
                options: [
                    {
                        code: 'CLIENT_SUBNET',
                        ip: edns,
                        sourcePrefixLength: isIPv4(edns) ? 24 : 56,
                        scopePrefixLength: 0,
                    },
                ],
            },
        ],
    });

    const b64 = Buffer.from(buf).toString('base64');
    const b64url = b64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const res = await $.http.get({
        url: `${url}?dns=${encodeURIComponent(b64url)}`,
        headers: {
            Accept: 'application/dns-message',
            // 'Content-Type': 'application/dns-message',
        },
        // body: buf,
        'binary-mode': true,
        encoding: null, // 使用 null 编码以确保响应是原始二进制数据
        timeout,
    });

    return dnsPacket.decode(Buffer.from($.env.isQX ? res.bodyBytes : res.body));
}
