#!/usr/bin/env node
const { build } = require('esbuild');

!(async () => {
    const artifacts = [{ src: 'src/main.js', dest: 'sub-store.min.js' }];

    for await (const artifact of artifacts) {
        await build({
            entryPoints: [artifact.src],
            bundle: true,
            minify: false,
            sourcemap: false,
            platform: 'node',
            format: 'cjs',
            outfile: artifact.dest,
        });
    }
})()
    .catch((e) => {
        console.log(e);
    })
    .finally(() => {
        console.log('done');
    });
