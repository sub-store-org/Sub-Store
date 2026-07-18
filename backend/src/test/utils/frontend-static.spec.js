import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

import history from 'connect-history-api-fallback';
import express from 'express';

import {
    createFrontendStaticMiddleware,
    isHashedFrontendAsset,
} from '@/utils/frontend-static';

const HOST = '127.0.0.1';

describe('frontend static middleware', function () {
    let tempDir;
    let frontendDir;
    let originalChunk;
    let compressedChunk;

    beforeEach(function () {
        tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'sub-store-frontend-static-'),
        );
        frontendDir = path.join(tempDir, 'frontend');
        fs.mkdirSync(path.join(frontendDir, 'chunks'), { recursive: true });
        fs.mkdirSync(path.join(frontendDir, 'css'));

        originalChunk = Buffer.from('console.log("original chunk")');
        compressedChunk = zlib.gzipSync(originalChunk);
        fs.writeFileSync(
            path.join(frontendDir, 'chunks/main-84da2e86.js'),
            originalChunk,
        );
        fs.writeFileSync(
            path.join(frontendDir, 'chunks/main-84da2e86.js.gz'),
            compressedChunk,
        );
        fs.writeFileSync(
            path.join(frontendDir, 'index.html'),
            '<main>SPA</main>',
        );
        fs.writeFileSync(path.join(frontendDir, 'index.js'), 'entry');
        fs.writeFileSync(path.join(frontendDir, 'css/main.css'), 'body{}');
        fs.writeFileSync(path.join(frontendDir, 'sw.js'), 'worker');
        fs.writeFileSync(path.join(tempDir, 'secret.txt'), 'secret');
    });

    afterEach(function () {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('serves a hashed gzip representation with logical asset headers', async function () {
        await withServer(createStaticApp(frontendDir), async (baseUrl) => {
            const response = await request(
                baseUrl,
                '/chunks/main-84da2e86.js?cache=1',
                {
                    headers: { 'Accept-Encoding': 'gzip' },
                },
            );

            expect(response.statusCode).to.equal(200);
            expect(response.body).to.deep.equal(compressedChunk);
            expect(response.headers['content-encoding']).to.equal('gzip');
            expect(response.headers['content-type']).to.match(/javascript/);
            expect(response.headers.vary).to.include('Accept-Encoding');
            expect(response.headers['content-length']).to.equal(
                `${compressedChunk.length}`,
            );
            expect(response.headers['cache-control']).to.equal(
                'public, max-age=31536000, immutable',
            );
            expect(response.headers.etag).to.be.a('string');
            expect(response.headers['last-modified']).to.equal(
                fs
                    .statSync(
                        path.join(frontendDir, 'chunks/main-84da2e86.js.gz'),
                    )
                    .mtime.toUTCString(),
            );

            const conditional = await request(
                baseUrl,
                '/chunks/main-84da2e86.js',
                {
                    headers: {
                        'Accept-Encoding': 'gzip',
                        'If-None-Match': response.headers.etag,
                    },
                },
            );

            expect(conditional.statusCode).to.equal(304);
            expect(conditional.body).to.have.length(0);

            const replacement = zlib.gzipSync(
                Buffer.from('console.log("replacement chunk")'),
            );
            fs.writeFileSync(
                path.join(frontendDir, 'chunks/main-84da2e86.js.gz'),
                replacement,
            );
            const replaced = await request(
                baseUrl,
                '/chunks/main-84da2e86.js',
                { headers: { 'Accept-Encoding': 'gzip' } },
            );

            expect(replaced.body).to.deep.equal(replacement);
        });
    });

    it('honors identity preferences and falls back when gzip is absent', async function () {
        await withServer(createStaticApp(frontendDir), async (baseUrl) => {
            for (const acceptEncoding of [
                undefined,
                'gzip;q=0',
                'gzip;q=0.5, identity;q=1',
            ]) {
                const headers = acceptEncoding
                    ? { 'Accept-Encoding': acceptEncoding }
                    : {};
                const response = await request(
                    baseUrl,
                    '/chunks/main-84da2e86.js',
                    { headers },
                );

                expect(response.body).to.deep.equal(originalChunk);
                expect(response.headers['content-encoding']).to.equal(
                    undefined,
                );
                expect(response.headers['cache-control']).to.equal(
                    'public, max-age=31536000, immutable',
                );
            }

            const fallback = await request(baseUrl, '/index.js?cache=1', {
                headers: { 'Accept-Encoding': 'gzip' },
            });

            expect(fallback.body.toString()).to.equal('entry');
            expect(fallback.headers['content-encoding']).to.equal(undefined);
            expect(fallback.headers['cache-control']).to.equal(
                'public, max-age=0',
            );
            expect(fallback.headers.etag).to.be.a('string');
        });
    });

    it('returns gzip metadata without a body for HEAD', async function () {
        await withServer(createStaticApp(frontendDir), async (baseUrl) => {
            const response = await request(
                baseUrl,
                '/chunks/main-84da2e86.js',
                {
                    method: 'HEAD',
                    headers: { 'Accept-Encoding': 'gzip' },
                },
            );

            expect(response.statusCode).to.equal(200);
            expect(response.body).to.have.length(0);
            expect(response.headers['content-encoding']).to.equal('gzip');
            expect(response.headers['content-length']).to.equal(
                `${compressedChunk.length}`,
            );
        });
    });

    it('keeps stable names revalidatable and blocks traversal', async function () {
        expect(
            isHashedFrontendAsset('C:\\dist\\release-deadbeef.dir\\index.html'),
        ).to.equal(false);

        const compressedCss = zlib.gzipSync(Buffer.from('body{}'));
        fs.writeFileSync(
            path.join(frontendDir, 'css/main.css.gz'),
            compressedCss,
        );

        await withServer(createStaticApp(frontendDir), async (baseUrl) => {
            for (const pathname of ['/index.html', '/sw.js', '/css/main.css']) {
                const response = await request(baseUrl, pathname, {
                    headers: { 'Accept-Encoding': 'gzip' },
                });

                expect(response.headers['cache-control']).to.equal(
                    'public, max-age=0',
                );
                expect(response.headers.etag).to.be.a('string');
            }

            const traversal = await request(baseUrl, '/%2e%2e%2fsecret.txt');

            expect(traversal.statusCode).to.equal(404);
            expect(traversal.body.toString()).not.to.equal('secret');
        });
    });

    it('preserves merged and standalone SPA routing', async function () {
        const merged = express();
        const mergedFrontend = createFrontendStaticMiddleware(
            frontendDir,
            '/index.html',
        );
        merged.use((req, res, next) => {
            if (/^\/(api|download|share)(\/|$)/.test(req.path)) {
                next();
                return;
            }
            mergedFrontend(req, res, next);
        });
        merged.use(['/api', '/download', '/share'], (req, res) =>
            res.status(204).end(),
        );

        await withServer(merged, async (baseUrl) => {
            const spa = await request(baseUrl, '/settings', {
                headers: { Accept: 'text/html' },
            });

            expect(spa.body.toString()).to.equal('<main>SPA</main>');
            for (const prefix of ['/api', '/download', '/share']) {
                const backend = await request(baseUrl, `${prefix}/settings`);
                expect(backend.statusCode).to.equal(204);
            }
        });

        const standalone = express();
        const staticFiles = createFrontendStaticMiddleware(frontendDir);
        standalone.use(staticFiles);
        standalone.use(history({ disableDotRule: true, verbose: false }));
        standalone.use(staticFiles);

        await withServer(standalone, async (baseUrl) => {
            const spa = await request(baseUrl, '/settings', {
                headers: { Accept: 'text/html' },
            });
            expect(spa.body.toString()).to.equal('<main>SPA</main>');
        });
    });
});

function createStaticApp(root) {
    const app = express();
    app.use(createFrontendStaticMiddleware(root));
    return app;
}

async function withServer(app, run) {
    const server = await listen(app);
    const { port } = server.address();

    try {
        await run(`http://${HOST}:${port}`);
    } finally {
        await close(server);
    }
}

function listen(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, HOST, () => resolve(server));
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function request(baseUrl, pathname, { method = 'GET', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            `${baseUrl}${pathname}`,
            { method, headers },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    });
                });
            },
        );
        req.on('error', reject);
        req.end();
    });
}
