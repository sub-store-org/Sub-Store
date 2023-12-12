import express from '@/vendor/express';
import $ from '@/core/app';

import registerSubscriptionRoutes from './subscriptions';
import registerCollectionRoutes from './collections';
import registerArtifactRoutes from './artifacts';
import registerFileRoutes from './file';
import registerModuleRoutes from './module';
import registerSyncRoutes from './sync';
import registerDownloadRoutes from './download';
import registerSettingRoutes from './settings';
import registerPreviewRoutes from './preview';
import registerSortingRoutes from './sort';
import registerMiscRoutes from './miscs';
import registerNodeInfoRoutes from './node-info';

export default function serve() {
    let port;
    let host;
    if ($.env.isNode) {
        port = eval('process.env.SUB_STORE_BACKEND_API_PORT') || 3000;
        host = eval('process.env.SUB_STORE_BACKEND_API_HOST') || '::';
    }
    const $app = express({ substore: $, port, host });
    // register routes
    registerCollectionRoutes($app);
    registerSubscriptionRoutes($app);
    registerDownloadRoutes($app);
    registerPreviewRoutes($app);
    registerSortingRoutes($app);
    registerSettingRoutes($app);
    registerArtifactRoutes($app);
    registerFileRoutes($app);
    registerModuleRoutes($app);
    registerSyncRoutes($app);
    registerNodeInfoRoutes($app);
    registerMiscRoutes($app);

    $app.start();

    if ($.env.isNode) {
        const path = eval(`require("path")`);
        const fs = eval(`require("fs")`);
        const fe_be_path = eval('process.env.SUB_STORE_FRONTEND_BACKEND_PATH');
        const fe_port = eval('process.env.SUB_STORE_FRONTEND_PORT') || 3001;
        const fe_host =
            eval('process.env.SUB_STORE_FRONTEND_HOST') || host || '::';
        const fe_path = eval('process.env.SUB_STORE_FRONTEND_PATH');
        const fe_abs_path = path.resolve(
            fe_path || path.join(__dirname, 'frontend'),
        );
        if (fe_path) {
            try {
                fs.accessSync(path.join(fe_abs_path, 'index.html'));
            } catch (e) {
                throw new Error(
                    `[FRONTEND] index.html file not found in ${fe_abs_path}`,
                );
            }

            const express_ = eval(`require("express")`);
            const history = eval(`require("connect-history-api-fallback")`);
            const { createProxyMiddleware } = eval(
                `require("http-proxy-middleware")`,
            );

            const app = express_();

            const staticFileMiddleware = express_.static(fe_path);

            let be_rewrite = '';
            let be_api = '/api/';
            if (fe_be_path) {
                if (!fe_be_path.startsWith('/')) {
                    throw new Error(
                        'SUB_STORE_FRONTEND_BACKEND_PATH should start with /',
                    );
                }
                be_rewrite = `${fe_be_path === '/' ? '' : fe_be_path}${be_api}`;
                app.use(
                    be_rewrite,
                    createProxyMiddleware({
                        target: `http://127.0.0.1:${port}`,
                        changeOrigin: true,
                        pathRewrite: (path) => {
                            return path.startsWith(be_rewrite)
                                ? path.replace(be_rewrite, be_api)
                                : path;
                        },
                    }),
                );
            }

            app.use(staticFileMiddleware);
            app.use(
                history({
                    disableDotRule: true,
                    verbose: false,
                }),
            );
            app.use(staticFileMiddleware);

            const listener = app.listen(fe_port, fe_host, () => {
                const { address: fe_address, port: fe_port } =
                    listener.address();
                $.info(`[FRONTEND] ${fe_address}:${fe_port}`);
                if (fe_be_path) {
                    $.info(
                        `[FRONTEND -> BACKEND] ${fe_address}:${fe_port}${be_rewrite} -> http://127.0.0.1:${port}${be_api}`,
                    );
                }
            });
        }
    }
}
