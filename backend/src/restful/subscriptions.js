import {
    NetworkError,
    InternalServerError,
    ResourceNotFoundError,
    RequestInvalidError,
} from './errors';
import { deleteByName, findByName, updateByName } from '@/utils/database';
import { SUBS_KEY, COLLECTIONS_KEY, ARTIFACTS_KEY } from '@/constants';
import { getFlowHeaders } from '@/utils/flow';
import { success, failed } from './response';
import $ from '@/core/app';

if (!$.read(SUBS_KEY)) $.write({}, SUBS_KEY);

export default function register($app) {
    $app.get('/api/sub/flow/:name', getFlowInfo);

    $app.route('/api/sub/:name')
        .get(getSubscription)
        .patch(updateSubscription)
        .delete(deleteSubscription);

    $app.route('/api/subs').get(getAllSubscriptions).post(createSubscription);
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
    if (sub.source === 'local') {
        failed(
            res,
            new RequestInvalidError(
                'NO_FLOW_INFO',
                'N/A',
                `Local subscription ${name} has no flow information!`,
            ),
        );
        return;
    }
    try {
        const flowHeaders = await getFlowHeaders(sub.url);
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

        // unit is KB
        const uploadMatch = flowHeaders.match(/upload=(-?)(\d+)/)
        const upload = Number(uploadMatch[1] + uploadMatch[2]);

        const downloadMatch = flowHeaders.match(/download=(-?)(\d+)/)
        const download = Number(downloadMatch[1] + downloadMatch[2]);

        const total = Number(flowHeaders.match(/total=(\d+)/)[1]);

        // optional expire timestamp
        const match = flowHeaders.match(/expire=(\d+)/);
        const expires = match ? Number(match[1]) : undefined;

        success(res, { expires, total, usage: { upload, download } });
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
    const allSubs = $.read(SUBS_KEY);
    if (findByName(allSubs, sub.name)) {
        failed(
            res,
            new RequestInvalidError(
                'DUPLICATE_KEY',
                `Subscription ${sub.name} already exists.`,
            ),
        );
    }
    allSubs.push(sub);
    $.write(allSubs, SUBS_KEY);
    success(res, sub, 201);
}

function getSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const allSubs = $.read(SUBS_KEY);
    const sub = findByName(allSubs, name);
    if (sub) {
        success(res, sub);
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
