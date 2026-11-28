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

const CF_MODULE_ALIASES = {
    '@/vendor/open-api': path.join(__dirname, 'src/cf/open-api.js'),
    '@/vendor/express': path.join(__dirname, 'src/cf/router.js'),
    '@/utils/env': path.join(__dirname, 'src/cf/env-info.js'),
    '@/utils/resource-cache': path.join(__dirname, 'src/cf/resource-cache.js'),
    '@/utils/headers-resource-cache': path.join(
        __dirname,
        'src/cf/headers-resource-cache.js',
    ),
    '@/utils/script-resource-cache': path.join(
        __dirname,
        'src/cf/script-resource-cache.js',
    ),
    '@/runtime/dynamic-function': path.join(
        __dirname,
        'src/cf/dynamic-function.js',
    ),
    '@/utils/rs': path.join(__dirname, 'src/cf/rs.js'),
};

const cfWorkerPlugin = {
    name: 'cf-worker-compat',
    setup(buildApi) {
        // Redirect runtime/vendor modules to dedicated CF Workers adapters
        // so upstream source files remain virtually untouched.
        buildApi.onResolve({ filter: /^@\// }, (args) => {
            const target = CF_MODULE_ALIASES[args.path];
            if (target) {
                return { path: target };
            }
        });

        // Also handle relative imports to open-api inside vendor/ if any exist.
        buildApi.onResolve({ filter: /^\.\/open-api$/ }, (args) => {
            if (args.resolveDir.endsWith(path.join('src', 'vendor'))) {
                return { path: CF_MODULE_ALIASES['@/vendor/open-api'] };
            }
        });

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
