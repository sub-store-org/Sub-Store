import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const backendPath = path.resolve(__dirname, '../../..');

describe('runtime manifest bundle', function () {
    this.timeout(10000);

    it('fails when the manifest cannot read the tested Node version', function () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-store-bundle-'));
        const fixturePath = path.join(root, 'backend');

        try {
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

            const result = spawnSync(process.execPath, ['bundle-esbuild.js'], {
                cwd: fixturePath,
                encoding: 'utf8',
            });

            expect(result.status).to.equal(1);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
