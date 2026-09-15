#!/usr/bin/env node
const { build } = require('esbuild');
const { builtinModules } = require('module');
const objectHasOwnPolyfill = require.resolve('core-js/actual/object/has-own');
const cloudflareStaticPeggy = require('./cloudflare-peggy-plugin');

// Match the upstream browser bundler, including its Buffer polyfill exception.
const builtinModuleNames = new Set(
    builtinModules.map((name) => name.replace(/^node:/, '')),
);
const nodeBuiltinExternalPlugin = {
    name: 'node-builtin-external',
    setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
            if (
                args.path !== 'buffer' &&
                builtinModuleNames.has(args.path.replace(/^node:/, ''))
            ) {
                return { path: args.path, external: true };
            }
        });
    },
};

build({
    entryPoints: ['src/platforms/cloudflare/index.js'],
    bundle: true,
    minify: true,
    sourcemap: true,
    platform: 'browser',
    format: 'esm',
    outfile: 'dist/sub-store.cloudflare.js',
    inject: [
        objectHasOwnPolyfill,
        'src/platforms/cloudflare/legacy-globals.js',
    ],
    loader: { '.wasm': 'copy' },
    plugins: [cloudflareStaticPeggy, nodeBuiltinExternalPlugin],
    define: {
        'globalThis.__SUB_STORE_RUNTIME__': JSON.stringify('cloudflare-worker'),
    },
    logOverride: { 'direct-eval': 'silent' },
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
