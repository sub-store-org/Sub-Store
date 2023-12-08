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
    try {
        const sub = req.body;
        const target = req.query.target || 'JSON';
        let content;
        if (
            sub.source === 'local' &&
            !['localFirst', 'remoteFirst'].includes(sub.mergeSources)
        ) {
            content = sub.content;
        } else {
            try {
                content = await Promise.all(
                    sub.url
                        .split(/[\r\n]+/)
                        .map((i) => i.trim())
                        .filter((i) => i.length)
                        .map((url) => download(url, sub.ua)),
                );
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
            if (sub.mergeSources === 'localFirst') {
                content.unshift(sub.content);
            } else if (sub.mergeSources === 'remoteFirst') {
                content.push(sub.content);
            }
        }
        // parse proxies
        const original = (Array.isArray(content) ? content : [content])
            .map((i) => ProxyUtils.parse(i))
            .flat();

        // add id
        original.forEach((proxy, i) => {
            proxy.id = i;
            proxy.subName = sub.name;
        });

        // apply processors
        const processed = await ProxyUtils.process(
            original,
            sub.process || [],
            target,
            { [sub.name]: sub },
        );

        // produce
        success(res, { original, processed });
    } catch (err) {
        $.error(err.message ?? err);
        failed(
            res,
            new InternalServerError(
                `INTERNAL_SERVER_ERROR`,
                `Failed to preview subscription`,
                `Reason: ${err.message ?? err}`,
            ),
        );
    }
}

async function compareCollection(req, res) {
    try {
        const allSubs = $.read(SUBS_KEY);
        const collection = req.body;
        const subnames = collection.subscriptions;
        const results = {};
        let hasError;
        await Promise.all(
            subnames.map(async (name) => {
                if (!hasError) {
                    const sub = findByName(allSubs, name);
                    try {
                        let raw;
                        if (
                            sub.source === 'local' &&
                            !['localFirst', 'remoteFirst'].includes(
                                sub.mergeSources,
                            )
                        ) {
                            raw = sub.content;
                        } else {
                            raw = await Promise.all(
                                sub.url
                                    .split(/[\r\n]+/)
                                    .map((i) => i.trim())
                                    .filter((i) => i.length)
                                    .map((url) => download(url, sub.ua)),
                            );
                            if (sub.mergeSources === 'localFirst') {
                                raw.unshift(sub.content);
                            } else if (sub.mergeSources === 'remoteFirst') {
                                raw.push(sub.content);
                            }
                        }
                        // parse proxies
                        let currentProxies = (Array.isArray(raw) ? raw : [raw])
                            .map((i) => ProxyUtils.parse(i))
                            .flat();

                        currentProxies.forEach((proxy) => {
                            proxy.subName = sub.name;
                            proxy.collectionName = collection.name;
                        });

                        // apply processors
                        currentProxies = await ProxyUtils.process(
                            currentProxies,
                            sub.process || [],
                            'JSON',
                            { [sub.name]: sub, _collection: collection },
                        );
                        results[name] = currentProxies;
                    } catch (err) {
                        if (!hasError) {
                            hasError = true;
                            failed(
                                res,
                                new InternalServerError(
                                    'PROCESS_FAILED',
                                    `处理子订阅 ${name} 失败`,
                                    `Reason: ${err}`,
                                ),
                            );
                        }
                    }
                }
            }),
        );
        if (hasError) return;
        // merge proxies with the original order
        const original = Array.prototype.concat.apply(
            [],
            subnames.map((name) => results[name] || []),
        );

        original.forEach((proxy, i) => {
            proxy.id = i;
            proxy.collectionName = collection.name;
        });

        const processed = await ProxyUtils.process(
            original,
            collection.process || [],
            'JSON',
            { _collection: collection },
        );

        success(res, { original, processed });
    } catch (err) {
        $.error(err.message ?? err);
        failed(
            res,
            new InternalServerError(
                `INTERNAL_SERVER_ERROR`,
                `Failed to preview collection`,
                `Reason: ${err.message ?? err}`,
            ),
        );
    }
}
