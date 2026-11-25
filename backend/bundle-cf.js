#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const { build } = require('esbuild');

const objectHasOwnPolyfill = require.resolve('core-js/actual/object/has-own');
const builtinModuleNames = new Set(
    builtinModules.map((name) => name.replace(/^node:/, '')),
);

function normalizeSpecifier(specifier) {
    return specifier.replace(/^node:/, '');
}

const cfWorkerPlugin = {
    name: 'cf-worker-compat',
    setup(buildApi) {
        // Swap the default new Function runner for the pure-JS sval interpreter.
        buildApi.onResolve({ filter: /^@\/runtime\/dynamic-function$/ }, () => ({
            path: path.join(__dirname, 'src/cf/dynamic-function.js'),
        }));

        // Replace 300KB jsrsasign with a lightweight pure-JS SHA-256 PEM fingerprint helper.
        buildApi.onResolve({ filter: /^@\/utils\/rs$/ }, () => ({
            path: path.join(__dirname, 'src/cf/rs.js'),
        }));

        // Stub out Node built-ins (except 'buffer', which uses the npm browser polyfill)
        // so the resulting ESM worker bundle has zero unresolved require() calls.
        buildApi.onResolve({ filter: /.*/ }, (args) => {
            const normalized = normalizeSpecifier(args.path);
            if (
                args.path !== 'buffer' &&
                builtinModuleNames.has(normalized)
            ) {
                return {
                    path: normalized,
                    namespace: 'cf-node-builtin-stub',
                };
            }
        });

        buildApi.onLoad(
            { filter: /.*/, namespace: 'cf-node-builtin-stub' },
            () => ({
                contents: 'export default {};',
                loader: 'js',
            }),
        );
    },
};

!(async () => {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
    );
    const version = pkg.version.trim();
    const outfile = path.join(__dirname, 'dist/cf-worker.mjs');

    await build({
        entryPoints: [path.join(__dirname, 'src/cf-worker.js')],
        bundle: true,
        minify: true,
        sourcemap: false,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        outfile,
        define: {
            __SUB_STORE_CF_WORKER__: 'true',
        },
        inject: [objectHasOwnPolyfill],
        plugins: [cfWorkerPlugin],
        banner: {
            js: `// SUB_STORE_CF_WORKER_VERSION: ${version}`,
        },
    });

    const content = fs.readFileSync(outfile, 'utf8');
    const sizeKB = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
    console.log(`Built ${outfile} (${sizeKB} KB)`);
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
