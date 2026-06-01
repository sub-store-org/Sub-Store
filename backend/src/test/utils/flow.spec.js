import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import { HEADERS_RESOURCE_CACHE_KEY, SETTINGS_KEY } from '@/constants';

let $;
let openApi;
let getFlowHeaders;
let headersResourceCache;
let originalRead;
let originalWrite;
let originalInfo;
let originalError;
let originalHTTP;
let originalENV;
let state;
let capturedRequests;
let infoLogs;
let activeRequests;
let maxActiveRequests;
let requestDelay;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('flow headers requests', function () {
    before(function () {
        ({ default: $ } = require('@/core/app'));
        openApi = require('@/vendor/open-api');
        ({ getFlowHeaders } = require('@/utils/flow'));
        ({ default: headersResourceCache } = require(
            '@/utils/headers-resource-cache'
        ));

        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
        originalInfo = $.info.bind($);
        originalError = $.error.bind($);
        originalHTTP = openApi.HTTP;
        originalENV = openApi.ENV;
    });

    after(function () {
        if ($) {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            $.error = originalError;
        }

        if (openApi) {
            openApi.HTTP = originalHTTP;
            openApi.ENV = originalENV;
        }
    });

    beforeEach(function () {
        capturedRequests = [];
        infoLogs = [];
        activeRequests = 0;
        maxActiveRequests = 0;
        requestDelay = 0;
        state = {
            [SETTINGS_KEY]: {
                defaultFlowUserAgent: 'DefaultFlowUA',
            },
            [HEADERS_RESOURCE_CACHE_KEY]: '{}',
        };

        $.read = (key) => state[key];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = (message) => {
            infoLogs.push(message);
        };
        $.error = () => {};

        openApi.ENV = () => ({
            isNode: true,
            isStash: false,
            isLoon: false,
            isShadowRocket: false,
            isQX: false,
            isSurge: false,
            isGUIforCores: false,
            isEgern: false,
            isLanceX: false,
        });
        openApi.HTTP = () => ({
            head: async (options) => {
                capturedRequests.push({ method: 'HEAD', options });
                activeRequests += 1;
                maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
                if (requestDelay > 0) await sleep(requestDelay);
                activeRequests -= 1;
                return {
                    headers: {
                        'subscription-userinfo':
                            'upload=1; download=2; total=10',
                    },
                };
            },
            get: async (options) => {
                capturedRequests.push({ method: 'GET', options });
                activeRequests += 1;
                maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
                if (requestDelay > 0) await sleep(requestDelay);
                activeRequests -= 1;
                return {
                    body: 'upload=1; download=2; total=10',
                    headers: {},
                    statusCode: 200,
                };
            },
        });

        headersResourceCache.revokeAll();
    });

    it('uses flowHeaders from the subscription URL for flow requests', async function () {
        await getFlowHeaders(
            'https://example.com/sub',
            undefined,
            undefined,
            undefined,
            undefined,
            JSON.stringify({
                'X-Flow-Token': 'token-1',
                'User-Agent': 'CustomFlowUA',
            }),
        );

        expect(capturedRequests[0].method).to.equal('HEAD');
        expect(capturedRequests[0].options.headers).to.deep.include({
            'x-flow-token': 'token-1',
            'user-agent': 'CustomFlowUA',
        });
        expect(infoLogs[0]).to.include(
            '{"user-agent":"CustomFlowUA","x-flow-token":"token-1"}',
        );
    });

    it('uses headers embedded in a flow URL such as subUserinfo links', async function () {
        await getFlowHeaders(
            undefined,
            undefined,
            undefined,
            undefined,
            `https://example.com/info#headers=${encodeURIComponent(
                JSON.stringify({ 'X-Sub-Token': 'token-2' }),
            )}`,
        );

        expect(capturedRequests[0].method).to.equal('GET');
        expect(capturedRequests[0].options.url).to.equal(
            'https://example.com/info',
        );
        expect(capturedRequests[0].options.headers).to.deep.include({
            'x-sub-token': 'token-2',
            'user-agent': 'DefaultFlowUA',
        });
        expect(infoLogs[0]).to.include(
            '{"user-agent":"DefaultFlowUA","x-sub-token":"token-2"}',
        );
    });

    it('limits concurrent outbound flow requests by backend setting', async function () {
        state[SETTINGS_KEY].backendRequestConcurrency = 2;
        requestDelay = 5;

        await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                getFlowHeaders(`https://example.com/sub-${index}`),
            ),
        );

        expect(maxActiveRequests).to.equal(2);
    });

    it('uses cached flow headers without a new outbound request', async function () {
        await getFlowHeaders('https://example.com/cached-flow');
        await getFlowHeaders('https://example.com/cached-flow');

        expect(capturedRequests.map((request) => request.options.url)).to.deep.equal([
            'https://example.com/cached-flow',
        ]);
        expect(maxActiveRequests).to.equal(1);
    });
});
