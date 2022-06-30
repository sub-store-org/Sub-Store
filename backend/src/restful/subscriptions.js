import {
    NetworkError,
    InternalServerError,
    ResourceNotFoundError,
} from './errors';
import { SUBS_KEY, COLLECTIONS_KEY } from './constants';
import { getFlowHeaders } from '@/utils/flow';
import { success, failed } from './response';
import $ from '@/core/app';

export default function register($app) {
    if (!$.read(SUBS_KEY)) $.write({}, SUBS_KEY);
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
    const sub = $.read(SUBS_KEY)[name];

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
        failed(res, new InternalServerError('NO_FLOW_INFO', 'N/A'));
        return;
    }
    try {
        const flowHeaders = await getFlowHeaders(sub.url);
        if (!flowHeaders) {
            failed(res, new InternalServerError('NO_FLOW_INFO', 'N/A'));
            return;
        }

        // unit is KB
        const upload = Number(flowHeaders.match(/upload=(\d+)/)[1]);
        const download = Number(flowHeaders.match(/download=(\d+)/)[1]);
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
    const allSubs = $.read(SUBS_KEY);
    $.info(`正在创建订阅： ${sub.name}`);
    if (allSubs[sub.name]) {
        res.status(500).json({
            status: 'failed',
            message: `订阅${sub.name}已存在！`,
        });
    }
    allSubs[sub.name] = sub;
    $.write(allSubs, SUBS_KEY);
    res.status(201).json({
        status: 'success',
        data: sub,
    });
}

function getSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    const sub = $.read(SUBS_KEY)[name];
    if (sub) {
        res.json({
            status: 'success',
            data: sub,
        });
    } else {
        res.status(404).json({
            status: 'failed',
            message: `未找到订阅：${name}!`,
        });
    }
}

function updateSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    let sub = req.body;
    const allSubs = $.read(SUBS_KEY);
    if (allSubs[name]) {
        const newSub = {
            ...allSubs[name],
            ...sub,
        };
        $.info(`正在更新订阅： ${name}`);
        // allow users to update the subscription name
        if (name !== sub.name) {
            // we need to find out all collections refer to this name
            const allCols = $.read(COLLECTIONS_KEY);
            for (const k of Object.keys(allCols)) {
                const idx = allCols[k].subscriptions.indexOf(name);
                if (idx !== -1) {
                    allCols[k].subscriptions[idx] = sub.name;
                }
            }
            // update subscriptions
            delete allSubs[name];
            allSubs[sub.name] = newSub;
        } else {
            allSubs[name] = newSub;
        }
        $.write(allSubs, SUBS_KEY);
        res.json({
            status: 'success',
            data: newSub,
        });
    } else {
        res.status(500).json({
            status: 'failed',
            message: `订阅${name}不存在，无法更新！`,
        });
    }
}

function deleteSubscription(req, res) {
    let { name } = req.params;
    name = decodeURIComponent(name);
    $.info(`删除订阅：${name}...`);
    // delete from subscriptions
    let allSubs = $.read(SUBS_KEY);
    delete allSubs[name];
    $.write(allSubs, SUBS_KEY);
    // delete from collections
    let allCols = $.read(COLLECTIONS_KEY);
    for (const k of Object.keys(allCols)) {
        allCols[k].subscriptions = allCols[k].subscriptions.filter(
            (s) => s !== name,
        );
    }
    $.write(allCols, COLLECTIONS_KEY);
    res.json({
        status: 'success',
    });
}

function getAllSubscriptions(req, res) {
    const allSubs = $.read(SUBS_KEY);
    res.json({
        status: 'success',
        data: allSubs,
    });
}
