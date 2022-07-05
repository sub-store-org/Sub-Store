import { getPlatformFromHeaders } from '@/utils/platform';
import { COLLECTIONS_KEY, SUBS_KEY } from '@/constants';
import { findByName } from '@/utils/database';
import { getFlowHeaders } from '@/utils/flow';
import { produceArtifact } from './artifacts';
import $ from '@/core/app';

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
                `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`,
                `❌ 无法下载订阅：${name}！`,
                `🤔 原因：${JSON.stringify(err)}`,
            );
            $.error(JSON.stringify(err));
            res.status(500).json({
                status: 'failed',
                message: err,
            });
        }
    } else {
        $.notify(`🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`, `❌ 未找到订阅：${name}！`);
        res.status(404).json({
            status: 'failed',
        });
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
                `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载组合订阅失败`,
                `❌ 下载组合订阅错误：${name}！`,
                `🤔 原因：${err}`,
            );
            res.status(500).json({
                status: 'failed',
                message: err,
            });
        }
    } else {
        $.notify(
            `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载组合订阅失败`,
            `❌ 未找到组合订阅：${name}！`,
        );
        res.status(404).json({
            status: 'failed',
        });
    }
}
