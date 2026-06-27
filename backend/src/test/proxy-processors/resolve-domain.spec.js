import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import dnsPacket from 'dns-packet';

import $ from '@/core/app';
import PROCESSORS, { ApplyProcessor } from '@/core/proxy-utils/processors';
import { SETTINGS_KEY } from '@/constants';
import resourceCache from '@/utils/resource-cache';
import { parseDnsResolver } from '@/utils/dns';
import { hex_md5 } from '@/vendor/md5';

const ResolveDomainOperator = PROCESSORS['Resolve Domain Operator'];
const dgram = eval("require('dgram')");
const net = eval("require('net')");
const tls = eval("require('tls')");
const { EventEmitter } = eval("require('events')");

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDnsResponse(query, data = '192.0.2.55') {
    const question = query.questions[0];
    return dnsPacket.encode({
        type: 'response',
        id: query.id,
        flags: dnsPacket.RECURSION_DESIRED,
        questions: query.questions,
        answers: [
            {
                type: question.type,
                class: 'IN',
                name: question.name,
                ttl: 60,
                data,
            },
        ],
    });
}

function getEdnsClientSubnet(query) {
    return query.additionals
        ?.find((item) => item.type === 'OPT')
        ?.options?.find(
            (option) => option.code === 'CLIENT_SUBNET' || option.code === 8,
        )?.ip;
}

function startUdpDnsServer(onQuery) {
    return new Promise((resolve, reject) => {
        const server = dgram.createSocket('udp4');
        server.once('error', reject);
        server.on('message', (message, rinfo) => {
            const query = dnsPacket.decode(message);
            onQuery(query);
            server.send(createDnsResponse(query), rinfo.port, rinfo.address);
        });
        server.bind(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve({
                host: '127.0.0.1',
                port: server.address().port,
                close: () =>
                    new Promise((resolveClose) => server.close(resolveClose)),
            });
        });
    });
}

function startTcpDnsServer(onQuery) {
    return new Promise((resolve, reject) => {
        const server = net.createServer((socket) => {
            let request = Buffer.alloc(0);
            socket.on('data', (chunk) => {
                request = Buffer.concat([request, chunk]);
                if (request.length < 2) return;
                const requestLength = request.readUInt16BE(0);
                if (request.length < requestLength + 2) return;

                const query = dnsPacket.decode(
                    request.slice(2, 2 + requestLength),
                );
                onQuery(query);
                const response = createDnsResponse(query, '192.0.2.56');
                const responseLength = Buffer.alloc(2);
                responseLength.writeUInt16BE(response.length, 0);
                socket.end(Buffer.concat([responseLength, response]));
            });
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve({
                host: '127.0.0.1',
                port: server.address().port,
                close: () =>
                    new Promise((resolveClose) => server.close(resolveClose)),
            });
        });
    });
}

describe('Resolve Domain Operator', function () {
    let originalGoogleResolver;
    let originalCustomResolver;
    let originalRead;
    let originalHttpGet;
    let originalIsNode;
    let cacheKeys;

    beforeEach(function () {
        originalGoogleResolver = ResolveDomainOperator.resolver.Google;
        originalCustomResolver = ResolveDomainOperator.resolver.Custom;
        originalRead = $.read.bind($);
        originalHttpGet = $.http.get;
        originalIsNode = $.env.isNode;
        cacheKeys = [];
    });

    afterEach(function () {
        ResolveDomainOperator.resolver.Google = originalGoogleResolver;
        ResolveDomainOperator.resolver.Custom = originalCustomResolver;
        $.read = originalRead;
        $.http.get = originalHttpGet;
        $.env.isNode = originalIsNode;
        cacheKeys.forEach((key) => {
            delete resourceCache.resourceCache[key];
        });
        resourceCache._persist();
    });

    it('limits resolver requests to the configured unresolved unique domains', async function () {
        const calls = [];
        const resolvedIps = {
            'a.example.com': '192.0.2.10',
            'b.example.com': '192.0.2.11',
            'c.example.com': '192.0.2.12',
        };
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            calls.push(domain);
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return resolvedIps[domain];
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
            concurrency: 2,
        });
        const output = await ApplyProcessor(processor, [
            { name: 'A', server: 'a.example.com', port: 443 },
            { name: 'A Duplicate', server: 'a.example.com', port: 443 },
            { name: 'Existing IP', server: '192.0.2.1', port: 443 },
            {
                name: 'No Resolve',
                server: 'skip.example.com',
                port: 443,
                '_no-resolve': true,
            },
            { name: 'B', server: 'b.example.com', port: 443 },
            { name: 'C', server: 'c.example.com', port: 443 },
        ]);

        expect(maxActiveRequests).to.equal(2);
        expect(calls).to.have.members([
            'a.example.com',
            'b.example.com',
            'c.example.com',
        ]);
        expect(calls).to.have.length(3);
        expect(output.find((proxy) => proxy.name === 'A').server).to.equal(
            '192.0.2.10',
        );
        expect(
            output.find((proxy) => proxy.name === 'A Duplicate').server,
        ).to.equal('192.0.2.10');
        expect(
            output.find((proxy) => proxy.name === 'Existing IP').server,
        ).to.equal('192.0.2.1');
        expect(
            output.find((proxy) => proxy.name === 'No Resolve').server,
        ).to.equal('skip.example.com');
    });

    it('excludes cache hits from the concurrency pool', async function () {
        const cachedDomain = 'cached-resolve-domain.example.com';
        const uncachedDomain = 'uncached-resolve-domain.example.com';
        const cacheKey = hex_md5(`GOOGLE:${cachedDomain}:IPv4`);
        cacheKeys.push(cacheKey);
        resourceCache.set(cacheKey, ['192.0.2.30']);
        const calls = [];

        ResolveDomainOperator.resolver.Google = async (domain) => {
            calls.push(domain);
            return ['192.0.2.31'];
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
            concurrency: 1,
        });
        const output = await ApplyProcessor(processor, [
            { name: 'Cached', server: cachedDomain, port: 443 },
            { name: 'Uncached', server: uncachedDomain, port: 443 },
        ]);

        expect(calls).to.deep.equal([uncachedDomain]);
        expect(output.find((proxy) => proxy.name === 'Cached').server).to.equal(
            '192.0.2.30',
        );
        expect(
            output.find((proxy) => proxy.name === 'Uncached').server,
        ).to.equal('192.0.2.31');
    });

    it('keeps the existing default concurrency at 10', async function () {
        const domains = Array.from({ length: 20 }, (_, index) => ({
            name: `Node ${index}`,
            server: `node-${index}.example.com`,
            port: 443,
        }));
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return `192.0.2.${Number(domain.match(/\d+/)[0]) + 1}`;
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
        });
        await ApplyProcessor(processor, domains);

        expect(maxActiveRequests).to.equal(10);
    });

    it('does not use backend request concurrency as the default', async function () {
        $.read = (key) => {
            if (key === SETTINGS_KEY) return { backendRequestConcurrency: 1 };
            return originalRead(key);
        };
        const domains = Array.from({ length: 20 }, (_, index) => ({
            name: `Node ${index}`,
            server: `backend-setting-${index}.example.com`,
            port: 443,
        }));
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return `192.0.2.${Number(domain.match(/\d+/)[0]) + 1}`;
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
        });
        await ApplyProcessor(processor, domains);

        expect(maxActiveRequests).to.equal(10);
    });

    it('prefers explicit domain resolver concurrency over backend request concurrency', async function () {
        $.read = (key) => {
            if (key === SETTINGS_KEY) return { backendRequestConcurrency: 1 };
            return originalRead(key);
        };
        const domains = Array.from({ length: 5 }, (_, index) => ({
            name: `Node ${index}`,
            server: `explicit-domain-${index}.example.com`,
            port: 443,
        }));
        let activeRequests = 0;
        let maxActiveRequests = 0;

        ResolveDomainOperator.resolver.Google = async (domain) => {
            activeRequests += 1;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            await sleep(5);
            activeRequests -= 1;
            return `192.0.2.${Number(domain.match(/\d+/)[0]) + 1}`;
        };

        const processor = ResolveDomainOperator({
            provider: 'Google',
            type: 'IPv4',
            concurrency: 2,
        });
        await ApplyProcessor(processor, domains);

        expect(maxActiveRequests).to.equal(2);
    });

    it('rejects invalid concurrency values', function () {
        expect(() =>
            ResolveDomainOperator({
                provider: 'Google',
                type: 'IPv4',
                concurrency: 0,
            }),
        ).to.throw('域名解析并发数应为大于 0 的整数');
    });

    it('warns but allows high concurrency values', async function () {
        const originalWarn = $.warn;
        const warnings = [];
        $.warn = (message) => warnings.push(message);
        ResolveDomainOperator.resolver.Google = async () => '192.0.2.40';

        try {
            const processor = ResolveDomainOperator({
                provider: 'Google',
                type: 'IPv4',
                concurrency: 21,
            });
            const output = await ApplyProcessor(processor, [
                {
                    name: 'High Concurrency',
                    server: 'high.example.com',
                    port: 443,
                },
            ]);

            expect(output[0].server).to.equal('192.0.2.40');
            expect(
                warnings.some(
                    (message) =>
                        message.includes('21') && message.includes('20'),
                ),
            ).to.equal(true);
        } finally {
            $.warn = originalWarn;
        }
    });

    it('parses Custom DNS resolver formats', function () {
        expect(parseDnsResolver('https://1.1.1.1/dns-query')).to.deep.equal({
            protocol: 'doh',
            url: 'https://1.1.1.1/dns-query',
        });
        expect(parseDnsResolver('1.1.1.1:5353')).to.deep.equal({
            protocol: 'udp',
            host: '1.1.1.1',
            port: 5353,
        });
        expect(parseDnsResolver('1.1.1.1')).to.deep.equal({
            protocol: 'udp',
            host: '1.1.1.1',
            port: 53,
        });
        expect(parseDnsResolver('udp://1.1.1.1')).to.deep.equal({
            protocol: 'udp',
            host: '1.1.1.1',
            port: 53,
        });
        expect(parseDnsResolver('tcp://1.1.1.1')).to.deep.equal({
            protocol: 'tcp',
            host: '1.1.1.1',
            port: 53,
        });
        expect(parseDnsResolver('tcp://1.1.1.1:5353')).to.deep.equal({
            protocol: 'tcp',
            host: '1.1.1.1',
            port: 5353,
        });
        expect(parseDnsResolver('tls://223.5.5.5')).to.deep.equal({
            protocol: 'tls',
            host: '223.5.5.5',
            port: 853,
        });
        expect(parseDnsResolver('tls://223.5.5.5:8853')).to.deep.equal({
            protocol: 'tls',
            host: '223.5.5.5',
            port: 8853,
        });
    });

    it('passes skip certificate verification to non-Node Custom DoH requests', async function () {
        const url = 'https://doh.example/dns-query';
        const requests = [];
        cacheKeys.push(
            hex_md5(`CUSTOM:INSECURE:${url}:doh-insecure.example.com:IPv4`),
        );

        $.env.isNode = false;
        $.http.get = async (options) => {
            requests.push(options);
            const dns = new URL(options.url).searchParams.get('dns');
            const query = dnsPacket.decode(
                Buffer.from(
                    `${dns}`.replace(/-/g, '+').replace(/_/g, '/'),
                    'base64',
                ),
            );
            return {
                body: createDnsResponse(query, '192.0.2.58'),
            };
        };

        const processor = ResolveDomainOperator({
            provider: 'Custom',
            type: 'IPv4',
            url,
            cache: 'disabled',
            tlsSkipCertVerify: 'enabled',
        });
        const output = await ApplyProcessor(processor, [
            {
                name: 'DoH Insecure Custom',
                server: 'doh-insecure.example.com',
                port: 443,
            },
        ]);

        expect(output[0].server).to.equal('192.0.2.58');
        expect(requests).to.have.length(1);
        expect(requests[0].insecure).to.equal(true);
    });

    it('resolves Custom UDP DNS and sends EDNS', async function () {
        const queries = [];
        const server = await startUdpDnsServer((query) => queries.push(query));
        const url = `${server.host}:${server.port}`;
        cacheKeys.push(hex_md5(`CUSTOM:${url}:udp.example.com:IPv4`));

        try {
            const processor = ResolveDomainOperator({
                provider: 'Custom',
                type: 'IPv4',
                url,
                edns: '198.51.100.1',
                cache: 'disabled',
            });
            const output = await ApplyProcessor(processor, [
                { name: 'UDP Custom', server: 'udp.example.com', port: 443 },
            ]);

            expect(output[0].server).to.equal('192.0.2.55');
            expect(queries).to.have.length(1);
            expect(queries[0].questions[0]).to.include({
                type: 'A',
                name: 'udp.example.com',
            });
            expect(getEdnsClientSubnet(queries[0])).to.equal('198.51.100.0');
        } finally {
            await server.close();
        }
    });

    it('resolves Custom TCP DNS and sends EDNS', async function () {
        const queries = [];
        const server = await startTcpDnsServer((query) => queries.push(query));
        const url = `tcp://${server.host}:${server.port}`;
        cacheKeys.push(hex_md5(`CUSTOM:${url}:tcp.example.com:IPv4`));

        try {
            const processor = ResolveDomainOperator({
                provider: 'Custom',
                type: 'IPv4',
                url,
                edns: '198.51.101.2',
                cache: 'disabled',
            });
            const output = await ApplyProcessor(processor, [
                { name: 'TCP Custom', server: 'tcp.example.com', port: 443 },
            ]);

            expect(output[0].server).to.equal('192.0.2.56');
            expect(queries).to.have.length(1);
            expect(queries[0].questions[0]).to.include({
                type: 'A',
                name: 'tcp.example.com',
            });
            expect(getEdnsClientSubnet(queries[0])).to.equal('198.51.101.0');
        } finally {
            await server.close();
        }
    });

    it('resolves Custom TLS DNS through Node TLS transport and can skip certificate verification', async function () {
        const originalConnect = tls.connect;
        const connections = [];
        const queries = [];
        const url = 'tls://223.5.5.5';
        cacheKeys.push(
            hex_md5(`CUSTOM:${url}:tls.example.com:IPv4`),
            hex_md5(`CUSTOM:INSECURE:${url}:tls-insecure.example.com:IPv4`),
        );

        tls.connect = (options) => {
            const socket = new EventEmitter();
            connections.push(options);
            socket.setTimeout = () => socket;
            socket.destroy = () => {};
            socket.write = (request) => {
                const requestLength = request.readUInt16BE(0);
                const query = dnsPacket.decode(
                    request.slice(2, 2 + requestLength),
                );
                queries.push(query);
                const response = createDnsResponse(query, '192.0.2.57');
                const responseLength = Buffer.alloc(2);
                responseLength.writeUInt16BE(response.length, 0);
                process.nextTick(() => {
                    socket.emit(
                        'data',
                        Buffer.concat([responseLength, response]),
                    );
                });
                return true;
            };
            process.nextTick(() => socket.emit('secureConnect'));
            return socket;
        };

        try {
            const processor = ResolveDomainOperator({
                provider: 'Custom',
                type: 'IPv4',
                url,
                edns: '198.51.102.3',
                cache: 'disabled',
            });
            const output = await ApplyProcessor(processor, [
                { name: 'TLS Custom', server: 'tls.example.com', port: 443 },
            ]);
            const insecureProcessor = ResolveDomainOperator({
                provider: 'Custom',
                type: 'IPv4',
                url,
                edns: '198.51.102.3',
                cache: 'disabled',
                tlsSkipCertVerify: 'enabled',
            });
            const insecureOutput = await ApplyProcessor(insecureProcessor, [
                {
                    name: 'TLS Insecure Custom',
                    server: 'tls-insecure.example.com',
                    port: 443,
                },
            ]);

            expect(output[0].server).to.equal('192.0.2.57');
            expect(insecureOutput[0].server).to.equal('192.0.2.57');
            expect(connections).to.have.length(2);
            expect(connections[0]).to.include({
                host: '223.5.5.5',
                port: 853,
            });
            expect(connections[0].servername).to.equal(undefined);
            expect(connections[0].rejectUnauthorized).to.equal(undefined);
            expect(connections[1]).to.include({
                host: '223.5.5.5',
                port: 853,
                rejectUnauthorized: false,
            });
            expect(queries).to.have.length(2);
            expect(queries[0].questions[0]).to.include({
                type: 'A',
                name: 'tls.example.com',
            });
            expect(queries[1].questions[0]).to.include({
                type: 'A',
                name: 'tls-insecure.example.com',
            });
            expect(getEdnsClientSubnet(queries[0])).to.equal('198.51.102.0');
        } finally {
            tls.connect = originalConnect;
        }
    });
});
