import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import { describe, it } from 'mocha';

const backendPath = path.resolve(__dirname, '../../..');

function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-store-bundle-'));
    const fixturePath = path.join(root, 'backend');

    fs.mkdirSync(fixturePath);
    fs.symlinkSync(
        path.join(backendPath, 'node_modules'),
        path.join(fixturePath, 'node_modules'),
        'dir',
    );
    fs.symlinkSync(
        path.join(backendPath, 'src'),
        path.join(fixturePath, 'src'),
        'dir',
    );
    fs.copyFileSync(
        path.join(backendPath, 'bundle-esbuild.js'),
        path.join(fixturePath, 'bundle-esbuild.js'),
    );
    fs.copyFileSync(
        path.join(backendPath, 'package.json'),
        path.join(fixturePath, 'package.json'),
    );
    fs.mkdirSync(path.join(fixturePath, 'dist'));

    return { root, fixturePath };
}

describe('runtime manifest bundle', function () {
    this.timeout(10000);

    it('fails when the manifest cannot read the tested Node version', function () {
        const { root, fixturePath } = createFixture();

        try {
            const result = spawnSync(process.execPath, ['bundle-esbuild.js'], {
                cwd: fixturePath,
                encoding: 'utf8',
            });

            expect(result.status).to.equal(1);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('excludes require examples inside strings from npm dependencies', function () {
        const { root, fixturePath } = createFixture();

        try {
            fs.copyFileSync(
                path.join(backendPath, '..', '.node-version'),
                path.join(root, '.node-version'),
            );

            const result = spawnSync(process.execPath, ['bundle-esbuild.js'], {
                cwd: fixturePath,
                encoding: 'utf8',
            });
            const manifest = JSON.parse(
                fs.readFileSync(
                    path.join(fixturePath, 'dist/runtime-manifest.json'),
                    'utf8',
                ),
            );

            expect(result.status).to.equal(0);
            expect(manifest.npm).not.to.include('iconv-lite');
            expect(manifest.npm).not.to.include('shoutrrr-ts');
            expect(manifest.externalBinary).to.deep.equal([]);
            const nodeBundle = fs.readFileSync(
                path.join(fixturePath, 'dist/sub-store.bundle.js'),
                'utf8',
            );
            expect(nodeBundle).to.include(
                'service is not supported by shoutrrr-ts',
            );
            expect(nodeBundle).not.to.include('import("shoutrrr-ts")');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('delivers a notification from the standalone Node bundle', async function () {
        this.timeout(20000);
        const { root, fixturePath } = createFixture();
        let child;
        const webhook = http.createServer(async (request, response) => {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            received = Buffer.concat(chunks).toString();
            response.end('ok');
        });
        let received;
        try {
            fs.copyFileSync(
                path.join(backendPath, '..', '.node-version'),
                path.join(root, '.node-version'),
            );
            const build = spawnSync(process.execPath, ['bundle-esbuild.js'], {
                cwd: fixturePath,
                encoding: 'utf8',
            });
            expect(build.status, build.stderr).to.equal(0);
            await new Promise((resolve) =>
                webhook.listen(0, '127.0.0.1', resolve),
            );
            const portServer = http.createServer();
            await new Promise((resolve) =>
                portServer.listen(0, '127.0.0.1', resolve),
            );
            const port = portServer.address().port;
            await new Promise((resolve) => portServer.close(resolve));
            child = spawn(process.execPath, ['dist/sub-store.bundle.js'], {
                cwd: fixturePath,
                env: {
                    ...process.env,
                    SUB_STORE_BACKEND_API_HOST: '127.0.0.1',
                    SUB_STORE_BACKEND_API_PORT: `${port}`,
                    SUB_STORE_DATA_BASE_PATH: root,
                    SUB_STORE_PUSH_SERVICE: `generic+http://127.0.0.1:${
                        webhook.address().port
                    }/notify`,
                },
                stdio: 'ignore',
            });
            const deadline = Date.now() + 10000;
            while (Date.now() < deadline && !received) {
                try {
                    await fetch(
                        `http://127.0.0.1:${port}/api/file/smoke?fakeFile=1&url=http%3A%2F%2F127.0.0.1%3A1%2Foffline`,
                    );
                } catch {
                    // Wait for the standalone server to start.
                }
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            expect(
                received,
                'standalone bundle did not deliver a notification',
            ).to.be.a('string');
        } finally {
            if (child && child.exitCode === null) {
                child.kill();
                await new Promise((resolve) => child.once('exit', resolve));
            }
            if (webhook.listening) {
                await new Promise((resolve) => webhook.close(resolve));
            }
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
