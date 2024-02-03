#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { build } = require('esbuild');

!(async () => {
    const version = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'),
    ).version.trim();

    const artifacts = [
        { src: 'src/main.js', dest: 'sub-store.min.js' },
        {
            src: 'src/products/resource-parser.loon.js',
            dest: 'dist/sub-store-parser.loon.min.js',
        },
        {
            src: 'src/products/cron-sync-artifacts.js',
            dest: 'dist/cron-sync-artifacts.min.js',
        },
        { src: 'src/products/sub-store-0.js', dest: 'dist/sub-store-0.min.js' },
        { src: 'src/products/sub-store-1.js', dest: 'dist/sub-store-1.min.js' },
    ];

    for await (const artifact of artifacts) {
        await build({
            entryPoints: [artifact.src],
            bundle: true,
            minify: true,
            sourcemap: false,
            platform: 'browser',
            format: 'iife',
            outfile: artifact.dest,
        });
    }

    let content = fs.readFileSync(path.join(__dirname, 'sub-store.min.js'), {
        encoding: 'utf8',
    });
    content = content.replace(
        /eval\(('|")(require\(('|").*?('|")\))('|")\)/g,
        '$2',
    );
    fs.writeFileSync(
        path.join(__dirname, 'dist/sub-store.no-bundle.js'),
        content,
        {
            encoding: 'utf8',
        },
    );

    await build({
        entryPoints: ['dist/sub-store.no-bundle.js'],
        bundle: true,
        minify: true,
        sourcemap: false,
        platform: 'node',
        format: 'cjs',
        outfile: 'dist/sub-store.bundle.js',
    });
    fs.writeFileSync(
        path.join(__dirname, 'dist/sub-store.bundle.js'),
        `// SUB_STORE_BACKEND_VERSION: ${version}
${fs.readFileSync(path.join(__dirname, 'dist/sub-store.bundle.js'), {
    encoding: 'utf8',
})}`,
        {
            encoding: 'utf8',
        },
    );
})()
    .catch((e) => {
        console.log(e);
    })
    .finally(() => {
        console.log('done');
    });
