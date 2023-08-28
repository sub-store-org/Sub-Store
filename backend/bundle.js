#!/usr/bin/env node
const fs = require('fs');

const path = require('path');

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

const { build } = require('estrella');
build({
    entry: 'dist/sub-store.no-bundle.js',
    outfile: 'dist/sub-store.bundle.js',
    bundle: true,
    platform: 'node',
});
