import express from '@/vendor/express';
import $ from '@/core/app';

import registerSubscriptionRoutes from './subscriptions';
import registerCollectionRoutes from './collections';
import registerArtifactRoutes from './artifacts';
import registerSyncRoutes from './sync';
import registerDownloadRoutes from './download';
import registerSettingRoutes from './settings';
import registerPreviewRoutes from './preview';
import registerSortingRoutes from './sort';
import registerMiscRoutes from './miscs';
import registerNodeInfoRoutes from './node-info';

export default function serve() {
    const $app = express({ substore: $ });

    // register routes
    registerCollectionRoutes($app);
    registerSubscriptionRoutes($app);
    registerDownloadRoutes($app);
    registerPreviewRoutes($app);
    registerSortingRoutes($app);
    registerSettingRoutes($app);
    registerArtifactRoutes($app);
    registerSyncRoutes($app);
    registerNodeInfoRoutes($app);
    registerMiscRoutes($app);

    $app.start();
}
