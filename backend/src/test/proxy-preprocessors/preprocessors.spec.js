import { expect } from 'chai';
import { Base64 } from 'js-base64';
import { describe, it } from 'mocha';

import PREPROCESSORS, {
    normalizeClashYaml,
} from '@/core/proxy-utils/preprocessors';

function getPreprocessor(name) {
    const processor = PREPROCESSORS.find((item) => item.name === name);
    expect(processor, name).to.exist;
    return processor;
}

describe('Proxy preprocessors', function () {
    describe('normalizeClashYaml', function () {
        it('quotes reality short-id scalars that may be re-parsed as numbers', function () {
            const input = `proxies:
  - name: test-1
    type: vless
    reality-opts:
      short-id: 08
  - name: test-2
    type: vless
    reality-opts:
      short-id: 0088
  - name: test-3
    type: vless
    reality-opts:
      short-id: '51'
  - name: test-4
    type: vless
    reality-opts:
      short-id: ""
  - name: test-5
    type: vless
    reality-opts:
      short-id: null
`;

            const output = normalizeClashYaml(input);

            expect(output).to.include('short-id: "08"');
            expect(output).to.include('short-id: "0088"');
            expect(output).to.include("short-id: '51'");
            expect(output).to.include('short-id: ""');
            expect(output).to.include('short-id: null');
        });

        it('keeps non-clash or invalid yaml input untouched', function () {
            const invalid = 'proxies:\n  - name: broken\n    short-id: [';
            const unrelated = 'ss://YWVzLTEyOC1nY206c2VjcmV0@example.com:8388';

            expect(normalizeClashYaml(invalid)).to.equal(invalid);
            expect(normalizeClashYaml(unrelated)).to.equal(unrelated);
        });
    });

    describe('HTML preprocessor', function () {
        it('detects html payloads and discards them', function () {
            const processor = getPreprocessor('HTML');
            const raw = '<!DOCTYPE html><html><body>blocked</body></html>';

            expect(processor.test(raw)).to.equal(true);
            expect(processor.parse(raw)).to.equal('');
        });
    });

    describe('Base64 preprocessor', function () {
        it('decodes base64 subscriptions that expand to proxy lines', function () {
            const processor = getPreprocessor('Base64 Pre-processor');
            const decoded =
                'ss://YWVzLTEyOC1nY206c2VjcmV0@example.com:8388#Node\n' +
                'trojan://secret@example.com:443#Trojan';
            const encoded = Base64.encode(decoded);

            expect(processor.test(encoded)).to.equal(true);
            expect(processor.parse(encoded)).to.equal(decoded);
        });

        it('ignores already decoded proxy payloads', function () {
            const processor = getPreprocessor('Base64 Pre-processor');
            const raw = 'ss://YWVzLTEyOC1nY206c2VjcmV0@example.com:8388#Node';

            expect(processor.test(raw)).to.equal(false);
        });
    });

    describe('Fallback Base64 preprocessor', function () {
        it('decodes valid fallback payloads and preserves invalid ones', function () {
            const processor = getPreprocessor('Fallback Base64 Pre-processor');
            const decoded = 'vmess://dGVzdA==';
            const encoded = Base64.encode(decoded);
            const invalid = 'not-base64-and-not-a-proxy';

            expect(processor.test(invalid)).to.equal(true);
            expect(processor.parse(encoded)).to.equal(decoded);
            expect(processor.parse(invalid)).to.equal(invalid);
        });
    });

    describe('Clash preprocessor', function () {
        it('converts clash yaml proxies into json lines', function () {
            const processor = getPreprocessor('Clash Pre-processor');
            const raw = `proxies:
  - name: Clash SS
    type: ss
    server: ss.example.com
    port: 8388
    cipher: aes-128-gcm
    password: secret
  - name: Clash VLESS
    type: vless
    server: vless.example.com
    port: 443
    uuid: 11111111-1111-4111-8111-111111111111
    reality-opts:
      short-id: 08
`;

            expect(processor.test(raw)).to.equal(true);

            const output = processor.parse(raw);
            const wrapped = processor.parse(raw, true);

            expect(output).to.include('"name":"Clash SS"');
            expect(output).to.include('"name":"Clash VLESS"');
            expect(output).to.include('"short-id":"08"');
            expect(wrapped).to.match(/^proxies:\n  - /);
        });
    });

    describe('SSD preprocessor', function () {
        it('expands SSD documents into ss uris with inherited and overridden fields', function () {
            const processor = getPreprocessor('SSD Pre-processor');
            const raw = `ssd://${Base64.encode(
                JSON.stringify({
                    airport: 'Test SSD',
                    port: 8388,
                    encryption: 'aes-128-gcm',
                    password: 'base-secret',
                    servers: [
                        {
                            server: 'ssd1.example.com',
                            remarks: 'SSD 1',
                        },
                        {
                            server: 'ssd2.example.com',
                            port: 443,
                            encryption: 'chacha20-ietf-poly1305',
                            password: 'override-secret',
                            remarks: 'SSD 2',
                            plugin: 'v2ray-plugin',
                            plugin_options: 'host=cdn.example.com;path=/ws;tls',
                        },
                    ],
                }),
            )}`;

            expect(processor.test(raw)).to.equal(true);

            const output = processor.parse(raw).split('\n');

            expect(output).to.have.length(2);
            expect(output[0]).to.equal(
                `ss://${Base64.encode(
                    'aes-128-gcm:base-secret',
                )}@ssd1.example.com:8388#SSD 1`,
            );
            expect(output[1]).to.equal(
                `ss://${Base64.encode(
                    'chacha20-ietf-poly1305:override-secret',
                )}@ssd2.example.com:443/?plugin=${encodeURIComponent(
                    'v2ray-plugin;host=cdn.example.com;path=/ws;tls',
                )}#SSD 2`,
            );
        });
    });

    describe('Full config preprocessor', function () {
        it('extracts the [Proxy] block from full config payloads', function () {
            const processor = getPreprocessor('Full Config Preprocessor');
            const raw = `[General]
skip-proxy = 192.168.0.0/16

[Proxy]
Node 1 = ss,example.com,8388,encrypt-method=aes-128-gcm,password=secret
Node 2 = trojan,example.com,443,password=secret

[Rule]
FINAL,DIRECT
`;

            expect(processor.test(raw)).to.equal(true);
            expect(processor.parse(raw).trim()).to.equal(
                [
                    'Node 1 = ss,example.com,8388,encrypt-method=aes-128-gcm,password=secret',
                    'Node 2 = trojan,example.com,443,password=secret',
                ].join('\n'),
            );
        });
    });
});
