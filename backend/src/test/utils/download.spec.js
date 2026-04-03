import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    HEADERS_RESOURCE_CACHE_KEY,
    RESOURCE_CACHE_KEY,
    SETTINGS_KEY,
} from '@/constants';

let $;
let openApi;
let download;
let resourceCache;
let headersResourceCache;
let originalRead;
let originalWrite;
let originalInfo;
let originalError;
let originalHTTP;
let originalENV;
let state;
let tempDir;
let previousDataBasePath;
let capturedUrls;
let errorLogs;

describe('download github proxy regex', function () {
    before(function () {
        previousDataBasePath = process.env.SUB_STORE_DATA_BASE_PATH;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-store-download-'));
        process.env.SUB_STORE_DATA_BASE_PATH = tempDir;

        ({ default: $ } = require('@/core/app'));
        openApi = require('@/vendor/open-api');
        ({ default: resourceCache } = require('@/utils/resource-cache'));
        ({ default: headersResourceCache } = require(
            '@/utils/headers-resource-cache'
        ));
        ({ default: download } = require('@/utils/download'));

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

        if (previousDataBasePath == null) {
            delete process.env.SUB_STORE_DATA_BASE_PATH;
        } else {
            process.env.SUB_STORE_DATA_BASE_PATH = previousDataBasePath;
        }

        if (tempDir) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    beforeEach(function () {
        capturedUrls = [];
        errorLogs = [];
        state = {
            [SETTINGS_KEY]: {
                githubProxy: 'https://ghproxy.test',
                githubProxyRegex: 'raw\\.githubusercontent\\.com',
            },
            [RESOURCE_CACHE_KEY]: '{}',
            [HEADERS_RESOURCE_CACHE_KEY]: '{}',
        };

        $.read = (key) => state[key];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = () => {};
        $.error = (message) => {
            errorLogs.push(message);
        };

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
            get: async ({ url }) => {
                capturedUrls.push(url);
                return {
                    body: 'test-body',
                    headers: {},
                    statusCode: 200,
                };
            },
        });

        resourceCache.revokeAll();
        headersResourceCache.revokeAll();
    });

    it('prefixes matching download urls with the github proxy', async function () {
        await download(
            'https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/README.md',
        );

        expect(capturedUrls).to.deep.equal([
            'https://ghproxy.test/https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/README.md',
        ]);
    });

    it('keeps download urls unchanged when the regex does not match', async function () {
        await download('https://example.com/archive.txt');

        expect(capturedUrls).to.deep.equal([
            'https://example.com/archive.txt',
        ]);
    });

    it('matches regex patterns case-insensitively by default', async function () {
        state[SETTINGS_KEY].githubProxyRegex = '^https://RAW\\.GITHUBUSERCONTENT\\.COM';

        await download(
            'https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/README.md',
        );

        expect(capturedUrls).to.deep.equal([
            'https://ghproxy.test/https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/README.md',
        ]);
    });

    it('skips proxy prefixing when the regex is invalid', async function () {
        state[SETTINGS_KEY].githubProxyRegex = '[';

        await download(
            'https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/README.md',
        );

        expect(capturedUrls).to.deep.equal([
            'https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/README.md',
        ]);
        expect(errorLogs).to.have.length(1);
        expect(errorLogs[0]).to.contain('GitHub 加速代理匹配正则无效');
    });
});
