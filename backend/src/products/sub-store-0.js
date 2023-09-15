/**
 * 路由拆分 - 本文件只包含不涉及到解析器的 RESTFul API
 */

import { version } from '../../package.json';
console.log(
    `
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
     Sub-Store -- v${version}
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
`,
);

import migrate from '@/utils/migration';
import express from '@/vendor/express';
import $ from '@/core/app';
import registerCollectionRoutes from '@/restful/collections';
import registerSubscriptionRoutes from '@/restful/subscriptions';
import registerArtifactRoutes from '@/restful/artifacts';
import registerSettingRoutes from '@/restful/settings';
import registerMiscRoutes from '@/restful/miscs';
import registerSortRoutes from '@/restful/sort';
import registerFileRoutes from '@/restful/file';
import registerModuleRoutes from '@/restful/module';

migrate();
serve();

function serve() {
    const $app = express({ substore: $ });

    // register routes
    registerCollectionRoutes($app);
    registerSubscriptionRoutes($app);
    registerFileRoutes($app);
    registerModuleRoutes($app);
    registerArtifactRoutes($app);
    registerSettingRoutes($app);
    registerSortRoutes($app);
    registerMiscRoutes($app);

    $app.start();
}
