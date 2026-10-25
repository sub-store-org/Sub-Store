import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';
import { deflateSync, gzipSync } from 'zlib';

import express from '@/vendor/express';

describe('express request body compatibility', function () {
    let server;
    let baseUrl;
    let originalLimit;

    before(async function () {
        originalLimit = process.env.SUB_STORE_BODY_JSON_LIMIT;
        process.env.SUB_STORE_BODY_JSON_LIMIT = '128b';
        const app = express({ substore: { info() {} } });
        app.post('/probe', (req, res) => {
            res.json({ body: req.body, rawBody: req.rawBody });
        });
        // eslint-disable-next-line no-unused-vars -- Express detects error middleware by arity.
        app.use((error, req, res, next) => {
            res.status(error.status || 500).json({ type: error.type });
        });
        server = await new Promise((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () =>
                resolve(listener),
            );
        });
        baseUrl = `http://127.0.0.1:${server.address().port}/probe`;
    });

    after(async function () {
        if (originalLimit == null) {
            delete process.env.SUB_STORE_BODY_JSON_LIMIT;
        } else {
            process.env.SUB_STORE_BODY_JSON_LIMIT = originalLimit;
        }
        if (server) await new Promise((resolve) => server.close(resolve));
    });

    it('parses plain, gzip and deflate JSON and preserves UTF-8 raw bodies', async function () {
        const data = { name: '测试订阅', url: 'https://example.com/sub' };
        const rawBody = JSON.stringify(data);
        for (const [encoding, body] of [
            ['identity', rawBody],
            ['gzip', gzipSync(rawBody)],
            ['deflate', deflateSync(rawBody)],
        ]) {
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Encoding': encoding,
                },
                body,
            });

            expect(response.status, encoding).to.equal(200);
            expect(await response.json()).to.deep.equal({
                body: data,
                rawBody,
            });
        }
    });

    it('preserves nested form fields and arrays', async function () {
        const rawBody = 'options[udp]=true&tags[]=a&tags[]=b';
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: rawBody,
        });

        expect(response.status).to.equal(200);
        expect(await response.json()).to.deep.equal({
            body: { options: { udp: 'true' }, tags: ['a', 'b'] },
            rawBody,
        });
    });

    it('rejects invalid JSON and enforces limits after decompression', async function () {
        const oversized = JSON.stringify({ name: 'x'.repeat(256) });
        for (const [encoding, body, status, type] of [
            ['identity', '{', 400, 'entity.parse.failed'],
            ['identity', oversized, 413, 'entity.too.large'],
            ['gzip', gzipSync(oversized), 413, 'entity.too.large'],
        ]) {
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Encoding': encoding,
                },
                body,
            });

            expect(response.status, encoding).to.equal(status);
            expect(await response.json()).to.deep.equal({ type });
        }
    });
});
