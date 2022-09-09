import { InternalServerError, NetworkError } from './errors';
import { ProxyUtils } from '@/core/proxy-utils';
import { findByName } from '@/utils/database';
import { success, failed } from './response';
import download from '@/utils/download';
import { SUBS_KEY } from '@/constants';
import $ from '@/core/app';

export default function register($app) {
    $app.post('/api/preview/sub', compareSub);
    $app.post('/api/preview/collection', compareCollection);
}

async function compareSub(req, res) {
    const sub = req.body;
    const target = req.query.target || 'JSON';
    let content;
    if (sub.source === 'local') {
        content = sub.content;
    } else {
        try {
            content = await download(sub.url, sub.ua);
        } catch (err) {
            failed(
                res,
                new NetworkError(
                    'FAILED_TO_DOWNLOAD_RESOURCE',
                    '无法下载远程资源',
                    `Reason: ${err}`,
                ),
            );
            return;
        }
    }
    // parse proxies
    const original = ProxyUtils.parse(content);

    // add id
    original.forEach((proxy, i) => {
        proxy.id = i;
    });

    // apply processors
    const processed = await ProxyUtils.process(
        original,
        sub.process || [],
        target,
    );

    // produce
    success(res, { original, processed });
}

async function compareCollection(req, res) {
    const allSubs = $.read(SUBS_KEY);
    const collection = req.body;
    const subnames = collection.subscriptions;
    const results = {};

    await Promise.all(
        subnames.map(async (name) => {
            const sub = findByName(allSubs, name);
            try {
                let raw;
                if (sub.source === 'local') {
                    raw = sub.content;
                } else {
                    raw = await download(sub.url, sub.ua);
                }
                // parse proxies
                let currentProxies = ProxyUtils.parse(raw);
                // apply processors
                currentProxies = await ProxyUtils.process(
                    currentProxies,
                    sub.process || [],
                    'JSON',
                );
                results[name] = currentProxies;
            } catch (err) {
                failed(
                    res,
                    new InternalServerError(
                        'PROCESS_FAILED',
                        `处理子订阅 ${name} 失败`,
                        `Reason: ${err}`,
                    ),
                );
            }
        }),
    );

    // merge proxies with the original order
    const original = Array.prototype.concat.apply(
        [],
        subnames.map((name) => results[name] || []),
    );

    original.forEach((proxy, i) => {
        proxy.id = i;
    });

    const processed = await ProxyUtils.process(
        original,
        collection.process || [],
        'JSON',
    );

    success(res, { original, processed });
}
