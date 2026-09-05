#!/usr/bin/env node
const fs = require('fs');
const { builtinModules } = require('module');
const path = require('path');
const { build } = require('esbuild');

const objectHasOwnPolyfill = require.resolve('core-js/actual/object/has-own');
const builtinModuleNames = new Set(
    builtinModules.map((name) => name.replace(/^node:/, '')),
);

function normalizeSpecifier(specifier) {
    return specifier.replace(/^node:/, '');
}

function getRequireSpecifiers(content) {
    return new Set(
        [...content.matchAll(/\brequire\(\s*['\"]([^'\"]+)['\"]\s*\)/g)].map(
            ([, specifier]) => specifier,
        ),
    );
}

function getExternalSpecifiers(metafiles) {
    return new Set(
        metafiles.flatMap((metafile) =>
            Object.values(metafile.outputs).flatMap((output) =>
                (output.imports || [])
                    .filter((item) => item.external)
                    .map((item) => item.path),
            ),
        ),
    );
}

function createRuntimeManifest({ metafiles, content }) {
    const specifiers = new Set([
        ...getExternalSpecifiers(metafiles),
        ...getRequireSpecifiers(content),
    ]);
    const builtins = new Set();
    const npm = new Set();

    for (const specifier of specifiers) {
        const normalized = normalizeSpecifier(specifier);
        if (builtinModuleNames.has(normalized)) {
            builtins.add(normalized);
        } else if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
            npm.add(specifier);
        }
    }

    return {
        builtins: [...builtins].sort(),
        npm: [...npm].sort(),
        requiresEval: /\beval\s*\(/.test(content),
        requiresProcessGlobal: /\bprocess\b/.test(content),
        workerThreads: builtins.has('worker_threads'),
        childProcess: builtins.has('child_process'),
        externalBinary: ['shoutrrr'],
        testedNode: fs
            .readFileSync(path.join(__dirname, '..', '.node-version'), 'utf8')
            .trim(),
    };
}

const nodeBuiltinExternalPlugin = {
    name: 'node-builtin-external',
    setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
            if (
                args.path !== 'buffer' &&
                builtinModuleNames.has(normalizeSpecifier(args.path))
            ) {
                return { path: args.path, external: true };
            }
        });
    },
};

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
    const browserMetafiles = [];

    for await (const artifact of artifacts) {
        const browserBuild = await build({
            entryPoints: [artifact.src],
            bundle: true,
            minify: true,
            sourcemap: false,
            platform: 'browser',
            format: 'iife',
            outfile: artifact.dest,
            inject: [objectHasOwnPolyfill],
            plugins: [nodeBuiltinExternalPlugin],
            metafile: true,
        });
        browserMetafiles.push(browserBuild.metafile);
    }

    const browserEsmArtifacts = [
        {
            src: 'src/products/proxy-utils.esm.js',
            dest: 'dist/proxy-utils.esm.mjs',
        },
    ];

    for await (const artifact of browserEsmArtifacts) {
        const browserBuild = await build({
            entryPoints: [artifact.src],
            bundle: true,
            minify: true,
            sourcemap: false,
            platform: 'browser',
            format: 'esm',
            outfile: artifact.dest,
            inject: [objectHasOwnPolyfill],
            plugins: [nodeBuiltinExternalPlugin],
            metafile: true,
        });
        browserMetafiles.push(browserBuild.metafile);
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

    const nodeBuild = await build({
        entryPoints: ['dist/sub-store.no-bundle.js'],
        bundle: true,
        minify: true,
        sourcemap: false,
        platform: 'node',
        format: 'cjs',
        outfile: 'dist/sub-store.bundle.js',
        metafile: true,
        // `sub-store.no-bundle.js` comes from `sub-store.min.js`, which already
        // has the Object.hasOwn polyfill injected in the first build stage.
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
    const bundlePath = path.join(__dirname, 'dist/sub-store.bundle.js');
    fs.writeFileSync(
        path.join(__dirname, 'dist/runtime-manifest.json'),
        `${JSON.stringify(
            createRuntimeManifest({
                metafiles: [...browserMetafiles, nodeBuild.metafile],
                content: fs.readFileSync(bundlePath, 'utf8'),
            }),
            null,
            2,
        )}\n`,
    );
})()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => {
        console.log('done');
    });
