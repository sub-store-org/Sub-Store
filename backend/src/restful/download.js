import { getPlatformFromHeaders } from '@/utils/platform';
import { COLLECTIONS_KEY, SUBS_KEY } from '@/constants';
import { findByName } from '@/utils/database';
import { getFlowHeaders } from '@/utils/flow';
import $ from '@/core/app';
import { failed } from '@/restful/response';
import { InternalServerError, ResourceNotFoundError } from '@/restful/errors';
import { produceArtifact } from '@/restful/sync';

export default function register($app) {
    $app.get('/download/collection/:name', downloadCollection);
    $app.get('/download/:name', downloadSubscription);
}

async function downloadSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);

    const platform =
        req.query.target || getPlatformFromHeaders(req.headers) || 'JSON';

    $.info(`正在下载订阅：${name}`);

    const allSubs = $.read(SUBS_KEY);
    const sub = findByName(allSubs, name);
    if (sub) {
        try {
            const output = await produceArtifact({
                type: 'subscription',
                name,
                platform,
            });

            if (sub.source !== 'local') {
                // forward flow headers
                const flowInfo = await getFlowHeaders(sub.url);
                if (flowInfo) {
                    res.set('subscription-userinfo', flowInfo);
                }
            }

            if (platform === 'JSON') {
                res.set('Content-Type', 'application/json;charset=utf-8').send(
                    output,
                );
            } else {
                res.send(output);
            }
        } catch (err) {
            $.notify(
                `🌍 Sub-Store 下载订阅失败`,
                `❌ 无法下载订阅：${name}！`,
                `🤔 原因：${JSON.stringify(err)}`,
            );
            $.error(JSON.stringify(err));
            failed(
                res,
                new InternalServerError(
                    'INTERNAL_SERVER_ERROR',
                    `Failed to download subscription: ${name}`,
                    `Reason: ${JSON.stringify(err)}`,
                ),
            );
        }
    } else {
        $.notify(`🌍 Sub-Store 下载订阅失败`, `❌ 未找到订阅：${name}！`);
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Subscription ${name} does not exist!`,
            ),
            404,
        );
    }
}

async function downloadCollection(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);

    const platform =
        req.query.target || getPlatformFromHeaders(req.headers) || 'JSON';

    const allCols = $.read(COLLECTIONS_KEY);
    const collection = findByName(allCols, name);

    $.info(`正在下载组合订阅：${name}`);

    if (collection) {
        try {
            const output = await produceArtifact({
                type: 'collection',
                name,
                platform,
            });

            // forward flow header from the first subscription in this collection
            const allSubs = $.read(SUBS_KEY);
            const subnames = collection.subscriptions;
            if (subnames.length > 0) {
                const sub = findByName(allSubs, subnames[0]);
                if (sub.source !== 'local') {
                    const flowInfo = await getFlowHeaders(sub.url);
                    if (flowInfo) {
                        res.set('subscription-userinfo', flowInfo);
                    }
                }
            }

            if (platform === 'JSON') {
                res.set('Content-Type', 'application/json;charset=utf-8').send(
                    output,
                );
            } else {
                res.send(output);
            }
        } catch (err) {
            $.notify(
                `🌍 Sub-Store 下载组合订阅失败`,
                `❌ 下载组合订阅错误：${name}！`,
                `🤔 原因：${err}`,
            );
            failed(
                res,
                new InternalServerError(
                    'INTERNAL_SERVER_ERROR',
                    `Failed to download collection: ${name}`,
                    `Reason: ${JSON.stringify(err)}`,
                ),
            );
        }
    } else {
        $.notify(
            `🌍 Sub-Store 下载组合订阅失败`,
            `❌ 未找到组合订阅：${name}！`,
        );
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Collection ${name} does not exist!`,
            ),
            404,
        );
    }
}
