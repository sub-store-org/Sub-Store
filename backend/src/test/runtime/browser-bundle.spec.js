import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const backendPath = path.resolve(__dirname, '../../..');

describe('browser bundle compatibility', function () {
    this.timeout(10000);

    it('keeps the Buffer polyfill inside browser artifacts', function () {
        const result = spawnSync(process.execPath, ['bundle-esbuild.js'], {
            cwd: backendPath,
            encoding: 'utf8',
        });

        expect(result.status, result.stderr).to.equal(0);

        for (const artifact of [
            'sub-store.min.js',
            'dist/proxy-utils.esm.mjs',
        ]) {
            const content = fs.readFileSync(
                path.join(backendPath, artifact),
                'utf8',
            );
            expect(content).to.not.match(
                /\b[A-Za-z_$][\w$]*\(\s*['\"]buffer['\"]\)/,
            );
            expect(content).to.not.match(/\bfrom\s+['\"]buffer['\"]/);
        }
    });
});
