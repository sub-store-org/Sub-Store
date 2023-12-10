#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { build } = require('esbuild');

let content = fs.readFileSync(path.join(__dirname, 'sub-store.min.js'), {
    encoding: 'utf8',
});
content = content.replace(
    /eval\(('|")(require\(('|").*?('|")\))('|")\)/g,
    '$2',
);
fs.writeFileSync(path.join(__dirname, 'dist/sub-store.no-bundle.js'), content, {
    encoding: 'utf8',
});

build({
    entryPoints: ['dist/sub-store.no-bundle.js'],
    bundle: true,
    minify: true,
    sourcemap: true,
    platform: 'node',
    format: 'cjs',
    outfile: 'dist/sub-store.bundle.js',
});
