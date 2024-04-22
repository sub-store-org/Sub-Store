import {
    NetworkError,
    InternalServerError,
    ResourceNotFoundError,
    RequestInvalidError,
} from './errors';
import { deleteByName, findByName, updateByName } from '@/utils/database';
import { SUBS_KEY, COLLECTIONS_KEY, ARTIFACTS_KEY } from '@/constants';
import {
    getFlowHeaders,
    parseFlowHeaders,
    getRmainingDays,
} from '@/utils/flow';
import { success, failed } from './response';
import $ from '@/core/app';

if (!$.read(SUBS_KEY)) $.write({}, SUBS_KEY);

export default function register($app) {
    $app.get('/api/sub/flow/:name', getFlowInfo);

    $app.route('/api/sub/:name')
        .get(getSubscription)
        .patch(updateSubscription)
        .delete(deleteSubscription);

    $app.route('/api/subs')
        .get(getAllSubscriptions)
        .post(createSubscription)
        .put(replaceSubscriptions);
}

// subscriptions API
async function getFlowInfo(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const allSubs = $.read(SUBS_KEY);
    const sub = findByName(allSubs, name);
    if (!sub) {
        failed(
            res,
            new ResourceNotFoundError(
                'RESOURCE_NOT_FOUND',
                `Subscription ${name} does not exist!`,
            ),
            404,
        );
        return;
    }
    if (
        sub.source === 'local' &&
        !['localFirst', 'remoteFirst'].includes(sub.mergeSources)
    ) {
        if (sub.subUserinfo) {
            success(res, {
                ...parseFlowHeaders(sub.subUserinfo),
            });
        } else {
            failed(
                res,
                new RequestInvalidError(
                    'NO_FLOW_INFO',
                    'N/A',
                    `Local subscription ${name} has no flow information!`,
                ),
            );
        }
        return;
    }
    try {
        let url = `${sub.url}`
            .split(/[\r\n]+/)
            .map((i) => i.trim())
            .filter((i) => i.length)?.[0];

        let $arguments = {};
        const rawArgs = url.split('#');
        url = url.split('#')[0];
        if (rawArgs.length > 1) {
            try {
                // 支持 `#${encodeURIComponent(JSON.stringify({arg1: "1"}))}`
                $arguments = JSON.parse(decodeURIComponent(rawArgs[1]));
            } catch (e) {
                for (const pair of rawArgs[1].split('&')) {
                    const key = pair.split('=')[0];
                    const value = pair.split('=')[1];
                    // 部分兼容之前的逻辑 const value = pair.split('=')[1] || true;
                    $arguments[key] =
                        value == null || value === ''
                            ? true
                            : decodeURIComponent(value);
                }
            }
        }
        if ($arguments.noFlow) {
            failed(
                res,
                new RequestInvalidError(
                    'NO_FLOW_INFO',
                    'N/A',
                    `Subscription ${name}: noFlow`,
                ),
            );
            return;
        }
        if (sub.subUserinfo) {
            success(res, {
                ...parseFlowHeaders(sub.subUserinfo),
                remainingDays: getRmainingDays({
                    resetDay: $arguments.resetDay,
                    startDate: $arguments.startDate,
                    cycleDays: $arguments.cycleDays,
                }),
            });
        } else {
            const flowHeaders = await getFlowHeaders(
                url,
                $arguments.flowUserAgent,
                undefined,
                sub.proxy,
            );
            if (!flowHeaders) {
                failed(
                    res,
                    new InternalServerError(
                        'NO_FLOW_INFO',
                        'No flow info',
                        `Failed to fetch flow headers`,
                    ),
                );
                return;
            }
            success(res, {
                ...parseFlowHeaders(flowHeaders),
                remainingDays: getRmainingDays({
                    resetDay: $arguments.resetDay,
                    startDate: $arguments.startDate,
                    cycleDays: $arguments.cycleDays,
                }),
            });
        }
    } catch (err) {
        failed(
            res,
            new NetworkError(
                `URL_NOT_ACCESSIBLE`,
                `The URL for subscription ${name} is inaccessible.`,
            ),
        );
    }
}

function createSubscription(req, res) {
    const sub = req.body;
    $.info(`正在创建订阅： ${sub.name}`);
    if (/\//.test(sub.name)) {
        failed(
            res,
            new RequestInvalidError(
                'INVALID_NAME',
                `Subscription ${sub.name} is invalid`,
            ),
        );
        return;
    }
    const allSubs = $.read(SUBS_KEY);
    if (findByName(allSubs, sub.name)) {
        failed(
            res,
            new RequestInvalidError(
                'DUPLICATE_KEY',
                `Subscription ${sub.name} already exists.`,
            ),
        );
        return;
    }
    allSubs.push(sub);
    $.write(allSubs, SUBS_KEY);
    success(res, sub, 201);
}

function getSubscription(req, res) {
    let { name } = req.params;
    let { raw } = req.query;
    name = decodeURIComponent(name);
    const allSubs = $.read(SUBS_KEY);
    const sub = findByName(allSubs, name);
    if (sub) {
        if (raw) {
            res.set('content-type', 'application/json')
                .set(
                    'content-disposition',
                    `attachment; filename="${encodeURIComponent(name)}.json"`,
                )
                .send(JSON.stringify(sub));
        } else {
            success(res, sub);
        }
    } else {
        failed(
            res,
            new ResourceNotFoundError(
                `SUBSCRIPTION_NOT_FOUND`,
                `Subscription ${name} does not exist`,
                404,
            ),
        );
    }
}

function updateSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name); // the original name
    let sub = req.body;
    const allSubs = $.read(SUBS_KEY);
    const oldSub = findByName(allSubs, name);
    if (oldSub) {
        const newSub = {
            ...oldSub,
            ...sub,
        };
        $.info(`正在更新订阅： ${name}`);
        // allow users to update the subscription name
        if (name !== sub.name) {
            // update all collections refer to this name
            const allCols = $.read(COLLECTIONS_KEY) || [];
            for (const collection of allCols) {
                const idx = collection.subscriptions.indexOf(name);
                if (idx !== -1) {
                    collection.subscriptions[idx] = sub.name;
                }
            }

            // update all artifacts referring this subscription
            const allArtifacts = $.read(ARTIFACTS_KEY) || [];
            for (const artifact of allArtifacts) {
                if (
                    artifact.type === 'subscription' &&
                    artifact.source == name
                ) {
                    artifact.source = sub.name;
                }
            }

            $.write(allCols, COLLECTIONS_KEY);
            $.write(allArtifacts, ARTIFACTS_KEY);
        }
        updateByName(allSubs, name, newSub);
        $.write(allSubs, SUBS_KEY);
        success(res, newSub);
    } else {
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

function deleteSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    $.info(`删除订阅：${name}...`);
    // delete from subscriptions
    let allSubs = $.read(SUBS_KEY);
    deleteByName(allSubs, name);
    $.write(allSubs, SUBS_KEY);
    // delete from collections
    const allCols = $.read(COLLECTIONS_KEY);
    for (const collection of allCols) {
        collection.subscriptions = collection.subscriptions.filter(
            (s) => s !== name,
        );
    }
    $.write(allCols, COLLECTIONS_KEY);
    success(res);
}

function getAllSubscriptions(req, res) {
    const allSubs = $.read(SUBS_KEY);
    success(res, allSubs);
}

function replaceSubscriptions(req, res) {
    const allSubs = req.body;
    $.write(allSubs, SUBS_KEY);
    success(res);
}
