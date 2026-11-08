import { expect } from 'chai';
import { Base64 } from 'js-base64';
import { describe, it } from 'mocha';
import { Alias } from 'yaml';

import PREPROCESSORS, {
    normalizeClashYaml,
} from '@/core/proxy-utils/preprocessors';
import { safeLoad } from '@/utils/yaml';

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

        it('limits scalar normalization to reality options', function () {
            const input = `metadata: {short-id: 1234}
proxies:
  - name: test
    short-id: 5678
    reality-opts: {short-id: 0088}
`;

            expect(normalizeClashYaml(input)).to.equal(
                input.replace('short-id: 0088', 'short-id: "0088"'),
            );
        });

        it('resolves aliases without rescanning the document for each use', function () {
            const resolve = Alias.prototype.resolve;
            const contexts = [];
            Alias.prototype.resolve = function (document, context) {
                contexts.push(context);
                return resolve.call(this, document, context);
            };

            try {
                const input = `opts: &opts {short-id: 0088}
proxies:
  - reality-opts: *opts
  - reality-opts: *opts
`;

                expect(normalizeClashYaml(input)).to.include(
                    'short-id: "0088"',
                );
                expect(contexts.every((context) => context != null)).to.equal(
                    true,
                );
            } finally {
                Alias.prototype.resolve = resolve;
            }
        });

        for (const [name, input] of [
            [
                'scalar alias',
                `id: &id 0011
proxies: [{reality-opts: {short-id: *id}}]
`,
            ],
            [
                'multiple merges',
                `base: &base {short-id: 0011}
mid: &mid {<<: *base}
opts: &opts {<<: *mid}
proxies: [{reality-opts: *opts}]
`,
            ],
            [
                'proxy template merge sequence',
                `template: &template {reality-opts: {short-id: 0011}}
templates: &templates [*template]
node: &node {<<: *templates}
proxies: [*node]
`,
            ],
            [
                'inherited profile',
                `opts: &opts {short-id: 0011}
node: &node {reality-opts: *opts}
nodes: &nodes [*node]
profile: &profile {proxies: *nodes}
inherited: &inherited {<<: *profile}
<<: *inherited
`,
            ],
        ]) {
            it(`normalizes short-ids through a ${name}`, function () {
                const output = normalizeClashYaml(input);

                expect(output).to.equal(input.replace('0011', '"0011"'));
                expect(
                    safeLoad(output).proxies[0]['reality-opts']['short-id'],
                ).to.equal('0011');
                expect(normalizeClashYaml(output)).to.equal(output);
            });
        }

        for (const [field, options, shortId, expected] of [
            ['listeners', 'reality-config', '[0011]', ['0011']],
            ['proxies', 'reality-opts', '0011', '0011'],
        ]) {
            it(`normalizes ${field} inherited through an aliased merge sequence`, function () {
                const input = `profile: &profile {${field}: [{${options}: {short-id: ${shortId}}}]}
profiles: &profiles [*profile]
<<: *profiles
`;
                const output = normalizeClashYaml(input);

                expect(output).to.equal(input.replace('0011', '"0011"'));
                expect(
                    safeLoad(output)[field][0][options]['short-id'],
                ).to.deep.equal(expected);
                expect(normalizeClashYaml(output)).to.equal(output);
            });
        }

        it('preserves the YAML version when quoting anchored short-ids', function () {
            const input = `%YAML 1.1
---
ids: &ids [0011]
listeners: [{reality-config: {short-id: *ids}}]
`;
            const output = normalizeClashYaml(input);

            expect(output).to.equal(input.replace('0011', '"0011"'));
            expect(
                safeLoad(output).listeners[0]['reality-config']['short-id'],
            ).to.deep.equal(['0011']);
            expect(normalizeClashYaml(output)).to.equal(output);
        });

        it('preserves explicit tags and nulls in aliased short-id lists', function () {
            const input = `ids: &ids [0088, !!int 0011, !!str 0088, null]
listeners: [{reality-config: {short-id: *ids}}]
`;
            const output = normalizeClashYaml(input);

            expect(output).to.equal(input.replace('[0088,', '["0088",'));
            expect(
                safeLoad(output).listeners[0]['reality-config']['short-id'],
            ).to.deep.equal(['0088', 11, '0088', null]);
            expect(normalizeClashYaml(output)).to.equal(output);
        });

        for (const [name, definition, reference, expected] of [
            ['scalar comment', 'ids: &ids 0011 # keep', '[*ids]', ['0011']],
            ['list comment', 'ids: &ids [0011] # keep', '*ids', ['0011']],
            ['item comment', 'ids: &ids [0011 # keep\n]', '*ids', ['0011']],
            [
                'leading comment',
                'ids: &ids\n  # keep\n  - 0011',
                '*ids',
                ['0011'],
            ],
            [
                'blank line',
                'ids: &ids\n  - 0011\n\n  - 0022',
                '*ids',
                ['0011', '0022'],
            ],
        ]) {
            it(`quotes a short-id anchor with a ${name}`, function () {
                const input = `${definition}\nlisteners: [{reality-config: {short-id: ${reference}}}]\n`;
                const output = normalizeClashYaml(input);
                const content = safeLoad(output);

                expect(output).to.equal(
                    expected.reduce(
                        (text, id) => text.replace(id, JSON.stringify(id)),
                        input,
                    ),
                );
                expect(
                    content.listeners[0]['reality-config']['short-id'],
                ).to.deep.equal(expected);
                expect(normalizeClashYaml(output)).to.equal(output);
            });
        }

        for (const [name, proxies, ids] of [
            [
                'listener-only block',
                '',
                '\n        - 11111111111\n        - 0000000000000001\n        - 9007199254740993',
            ],
            [
                'empty proxies flow',
                'proxies: []\n',
                ' [11111111111, 0000000000000001, 9007199254740993]',
            ],
            [
                'nonempty proxies block',
                'proxies: [{name: test}]\n',
                '\n        - 11111111111\n        - 0000000000000001\n        - 9007199254740993',
            ],
        ]) {
            it(`quotes numeric listener short-id items in ${name}`, function () {
                const input = `${proxies}listeners:
  - name: relay-proxy
    type: vless
    reality-config:
      short-id:${ids}
`;
                const expected = [
                    '11111111111',
                    '0000000000000001',
                    '9007199254740993',
                ];
                const output = normalizeClashYaml(input);

                expect(output).to.equal(
                    expected.reduce(
                        (content, id) => content.replace(id, `"${id}"`),
                        input,
                    ),
                );
                expect(
                    safeLoad(output).listeners[0]['reality-config']['short-id'],
                ).to.deep.equal(expected);
            });
        }

        it('quotes numeric items in aliased listener short-id lists', function () {
            const input = `ids: &ids [11111111111, 0000000000000001]
listeners:
  - reality-config: {short-id: *ids}
  - reality-config: {short-id: *ids}
`;

            const output = normalizeClashYaml(input);
            const content = safeLoad(output);

            expect(output).to.include(
                'ids: &ids ["11111111111", "0000000000000001"]',
            );
            expect(content.ids).to.deep.equal([
                '11111111111',
                '0000000000000001',
            ]);
            for (const listener of content.listeners) {
                expect(listener['reality-config']['short-id']).to.deep.equal([
                    '11111111111',
                    '0000000000000001',
                ]);
            }
        });

        for (const value of [
            'abcdef0123456789',
            '!!str 0088',
            '!!int 0088',
            '!custom 0088',
        ]) {
            it(`preserves resolved strings and explicit tags: ${value}`, function () {
                const input = `proxies:
  - name: test
    reality-opts: {short-id: ${value}}
`;

                expect(normalizeClashYaml(input)).to.equal(input);
            });
        }

        for (const [name, value, expected] of [
            ['block', '\n        - 6a0f0e0ede903cad', ['6a0f0e0ede903cad']],
            [
                'commented block',
                ' # ids\n        - 6a0f0e0ede903cad',
                ['6a0f0e0ede903cad'],
            ],
            [
                'anchored block',
                ' &ids\n        - 6a0f0e0ede903cad',
                ['6a0f0e0ede903cad'],
            ],
            ['empty flow', ' []', []],
            ['flow', ' [6a0f0e0ede903cad, "08"]', ['6a0f0e0ede903cad', '08']],
            ['anchored flow', ' &ids [6a0f0e0ede903cad]', ['6a0f0e0ede903cad']],
        ]) {
            it(`preserves ${name} reality short-id sequences`, function () {
                const input = `proxies:
  - name: test
    type: vless
    reality-opts:
      short-id: 0088
listeners:
  - type: vless
    reality-config:
      short-id:${value}
`;

                const output = normalizeClashYaml(input);
                const content = safeLoad(output);

                expect(output).to.equal(
                    input.replace('short-id: 0088', 'short-id: "0088"'),
                );
                expect(content.proxies[0]['reality-opts']['short-id']).to.equal(
                    '0088',
                );
                expect(
                    content.listeners[0]['reality-config']['short-id'],
                ).to.deep.equal(expected);
            });
        }

        it('preserves aliases, comments, strings and null values', function () {
            const input = `# short-id: 0011
proxies:
  - {name: test, reality-opts: {short-id: 0088}}
short-ids: &ids [6a0f0e0ede903cad]
listeners:
  - reality-config: {short-id: *ids}
description: 'short-id: 0022'
script: |
  short-id: 0033
empty:
  short-id:
`;

            expect(normalizeClashYaml(input)).to.equal(
                input.replace('short-id: 0088', 'short-id: "0088"'),
            );
        });

        it('keeps literal merge-looking keys valid when normalizing aliases', function () {
            const input = `opts: &opts {short-id: 0011, "<<": keep}
metadata: *opts
proxies: [{reality-opts: *opts}]
`;
            const output = normalizeClashYaml(input);

            expect(safeLoad(output).metadata['<<']).to.equal('keep');
            expect(output).to.equal(
                input.replace('short-id: 0011', 'short-id: "0011"'),
            );
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

        it('ignores invalid base64 containing an encoded proxy prefix', function () {
            const processor = getPreprocessor('Base64 Pre-processor');
            const raw = `🔥${Base64.encode('vmess://test')}`;

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

        it('ignores invalid base64 that decodes to a proxy prefix', function () {
            const processor = getPreprocessor('Fallback Base64 Pre-processor');
            const raw = `🔥${Base64.encode('vmess://test')}`;

            expect(processor.test(raw)).to.equal(false);
        });
    });

    describe('Clash preprocessor', function () {
        it('preserves short-ids when REALITY field names are aliases', function () {
            const processor = getPreprocessor('Clash Pre-processor');
            const input = `proxies:
  - name: first
    &opts reality-opts: {&sid short-id: 0088}
  - name: second
    *opts : {*sid : 0011}
`;

            const proxies = processor
                .parse(input)
                .trim()
                .split('\n')
                .map(JSON.parse);

            expect(
                proxies.map((proxy) => proxy['reality-opts']['short-id']),
            ).to.deep.equal(['0088', '0011']);
        });

        it('resolves redefined anchors at each alias position', function () {
            const processor = getPreprocessor('Clash Pre-processor');
            const input = `first: &opts {short-id: 0088}
proxies:
  - reality-opts: *opts
  - reality-opts: &opts {short-id: 0011}
  - reality-opts: *opts
`;

            const proxies = processor
                .parse(input)
                .trim()
                .split('\n')
                .map(JSON.parse);

            expect(
                proxies.map((proxy) => proxy['reality-opts']['short-id']),
            ).to.deep.equal(['0088', '0011', '0011']);
        });

        for (const merge of [false, true]) {
            it(`preserves short-ids in ${
                merge ? 'merged' : 'aliased'
            } reality options`, function () {
                const processor = getPreprocessor('Clash Pre-processor');
                const raw = `first: &first {short-id: 0011}
second: &second {short-id: 0022}
proxies:
  - name: second
    reality-opts: *second
  - name: first
    reality-opts: ${merge ? '{<<: *first}' : '*first'}
  - name: second-again
    reality-opts: *second
`;

                expect(normalizeClashYaml(raw)).to.equal(
                    raw
                        .replace('short-id: 0011', 'short-id: "0011"')
                        .replace('short-id: 0022', 'short-id: "0022"'),
                );
                const proxies = processor
                    .parse(raw)
                    .trim()
                    .split('\n')
                    .map(JSON.parse);

                expect(
                    proxies.map((p) => p['reality-opts']['short-id']),
                ).to.deep.equal(['0022', '0011', '0022']);
            });
        }

        it('preserves numeric short-ids through legacy tag recovery', function () {
            const processor = getPreprocessor('Clash Pre-processor');
            const raw = `proxies:
  - name: !<str>Legacy
    type: vless
    server: !<str>example.com
    reality-opts:
      short-id: 0088
`;

            expect(processor.test(raw)).to.equal(true);
            expect(normalizeClashYaml(raw)).to.equal(
                raw.replace('short-id: 0088', 'short-id: "0088"'),
            );
            const proxy = JSON.parse(processor.parse(raw));

            expect(proxy.name).to.equal('Legacy');
            expect(proxy.server).to.equal('example.com');
            expect(proxy['reality-opts']['short-id']).to.equal('0088');
        });

        it('accepts an empty proxies field', function () {
            const processor = getPreprocessor('Clash Pre-processor');
            const raw = `proxies:

proxy-groups:
  - name: Select
    type: select
    proxies:
      - DIRECT
`;

            expect(processor.test(raw)).to.equal(true);
            expect(processor.parse(raw)).to.equal('');
            expect(processor.parse(raw, true)).to.equal('proxies:\n');
        });

        it('accepts a proxy groups array when proxies is invalid', function () {
            const processor = getPreprocessor('Clash Pre-processor');
            const raw = `proxies: invalid
proxy-groups:
  - test
`;

            expect(processor.test(raw)).to.equal(true);
            expect(processor.parse(raw)).to.equal('');
            expect(
                processor.test('proxies: invalid\nproxy-groups: {}'),
            ).to.equal(false);
            expect(processor.test('proxies: invalid\nrules: []')).to.equal(
                false,
            );
        });

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
