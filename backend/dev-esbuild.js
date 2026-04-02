#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const { context } = require('esbuild');

const outfile = path.join(__dirname, 'sub-store.min.js');

let serverProcess = null;
let buildContext = null;
let shuttingDown = false;
let restartQueue = Promise.resolve();

function log(message) {
    console.log(`[dev:esbuild] ${message}`);
}

function startServer() {
    const child = spawn(process.execPath, [outfile], {
        cwd: __dirname,
        stdio: 'inherit',
    });

    serverProcess = child;
    log(`server started (pid ${child.pid})`);

    child.on('exit', (code, signal) => {
        if (serverProcess === child) {
            serverProcess = null;
        }

        if (!shuttingDown && signal !== 'SIGTERM') {
            log(
                `server exited${code === null ? '' : ` with code ${code}`}${
                    signal ? ` (${signal})` : ''
                }`,
            );
        }
    });
}

async function stopServer() {
    const child = serverProcess;
    if (!child) {
        return;
    }

    serverProcess = null;

    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }

    await new Promise((resolve) => {
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
        }, 3000);

        child.once('exit', () => {
            clearTimeout(timeout);
            resolve();
        });

        child.kill('SIGTERM');
    });
}

async function restartServer() {
    if (serverProcess) {
        log('restarting server');
        await stopServer();
    }

    if (!shuttingDown) {
        startServer();
    }
}

async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    log(`received ${signal}, shutting down`);

    if (buildContext) {
        await buildContext.dispose();
    }

    await restartQueue.catch((error) => {
        console.error(error);
    });
    await stopServer();
}

!(async () => {
    buildContext = await context({
        entryPoints: ['src/main.js'],
        bundle: true,
        minify: false,
        sourcemap: false,
        platform: 'node',
        format: 'cjs',
        outfile,
        logOverride: {
            'direct-eval': 'silent',
        },
        plugins: [
            {
                name: 'restart-server-on-build',
                setup(build) {
                    build.onStart(() => {
                        log('building');
                    });

                    build.onEnd((result) => {
                        if (result.errors.length > 0) {
                            log(`build failed with ${result.errors.length} error(s)`);
                            return;
                        }

                        log('build succeeded');
                        restartQueue = restartQueue
                            .catch((error) => {
                                console.error(error);
                            })
                            .then(() => restartServer());
                        return restartQueue;
                    });
                },
            },
        ],
    });

    process.on('SIGINT', () => {
        shutdown('SIGINT').finally(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
        shutdown('SIGTERM').finally(() => process.exit(0));
    });

    await buildContext.watch();
    log('watching for changes');
})()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
