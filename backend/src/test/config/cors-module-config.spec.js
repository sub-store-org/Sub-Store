import fs from 'fs';
import path from 'path';

import { expect } from 'chai';
import { describe, it } from 'mocha';

import { load } from '@/utils/yaml';

const DEFAULT_ORIGINS =
    'https://sub-store.vercel.app,http://substore.stash,https://substore.stash';

describe('module CORS allowlist config', function () {
    it('adds the default CORS argument to Surge modules', function () {
        for (const filename of ['Surge.sgmodule', 'Surge-Beta.sgmodule']) {
            const content = readConfig(filename);

            expect(content).to.include(`cors:"${DEFAULT_ORIGINS}"`);
            expect(content).to.include('argument="cors={{{cors}}}"');
            expect(
                content.match(/argument="cors=\{\{\{cors\}\}\}"/g),
            ).to.have.length(2);
        }
    });

    it('adds the default CORS argument to the Egern module', function () {
        const config = load(readConfig('Egern.yaml'));
        const httpRequests = config.scriptings
            .map((item) => item.http_request)
            .filter(Boolean);

        expect(config.compat_arguments.cors).to.equal(DEFAULT_ORIGINS);
        expect(config.compat_arguments_desc).to.include('1️⃣ cors');
        expect(httpRequests).to.have.length(2);
        for (const script of httpRequests) {
            expect(script.arguments).to.deep.equal({
                '_compat.$argument': 'cors={{{cors}}}',
            });
        }
    });

    it('does not set legacy non-parameterized modules to wildcard CORS', function () {
        for (const filename of [
            'QX.snippet',
            'Stash.stoverride',
            'Surge-Noability.sgmodule',
            'Surge-ability.sgmodule',
        ]) {
            const content = readConfig(filename);

            expect(content).to.not.match(/cors\s*[:=]\s*"?\*/i);
        }
    });
});

function readConfig(filename) {
    return fs.readFileSync(
        path.join(findRepoRoot(), 'config', filename),
        'utf8',
    );
}

function findRepoRoot() {
    for (const dir of [process.cwd(), path.resolve(process.cwd(), '..')]) {
        if (fs.existsSync(path.join(dir, 'config', 'Surge.sgmodule'))) {
            return dir;
        }
    }
    throw new Error('Unable to locate repository root');
}
