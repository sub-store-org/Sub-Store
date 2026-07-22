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
let downloadFile;
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
let infoLogs;
let errorLogs;
let activeRequests;
let maxActiveRequests;
let requestDelay;
let responseBody;
let ageUtils;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('download github proxy regex', function () {
    before(function () {
        previousDataBasePath = process.env.SUB_STORE_DATA_BASE_PATH;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-store-download-'));
        process.env.SUB_STORE_DATA_BASE_PATH = tempDir;

        ({ default: $ } = require('@/core/app'));
        openApi = require('@/vendor/open-api');
        ({ default: resourceCache } = require('@/utils/resource-cache'));
        ({
            default: headersResourceCache,
        } = require('@/utils/headers-resource-cache'));
        ({ default: download, downloadFile } = require('@/utils/download'));
        ageUtils = require('@/utils/age');

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
        infoLogs = [];
        errorLogs = [];
        activeRequests = 0;
        maxActiveRequests = 0;
        requestDelay = 0;
        responseBody = 'test-body';
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
        $.info = (message) => {
            infoLogs.push(message);
        };
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
                activeRequests += 1;
                maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
                if (requestDelay > 0) await sleep(requestDelay);
                activeRequests -= 1;
                return {
                    body: responseBody,
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

        expect(capturedUrls).to.deep.equal(['https://example.com/archive.txt']);
    });

    it('matches regex patterns case-insensitively by default', async function () {
        state[SETTINGS_KEY].githubProxyRegex =
            '^https://RAW\\.GITHUBUSERCONTENT\\.COM';

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

    it('limits concurrent outbound download requests by backend setting', async function () {
        state[SETTINGS_KEY].backendRequestConcurrency = 2;
        requestDelay = 5;

        await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                download(`https://example.com/archive-${index}.txt`),
            ),
        );

        expect(maxActiveRequests).to.equal(2);
    });

    it('uses cached download content without a new outbound request', async function () {
        await download('https://example.com/cached.txt');
        await download('https://example.com/cached.txt');

        expect(capturedUrls).to.deep.equal(['https://example.com/cached.txt']);
        expect(maxActiveRequests).to.equal(1);
    });

    it('returns unpreprocessed raw content when requested', async function () {
        responseBody = [
            'proxies:',
            '  - name: A',
            '    type: ss',
            '    server: example.com',
            '    port: 443',
            '    cipher: aes-128-gcm',
            '    password: pass',
            '',
        ].join('\n');

        const body = await download(
            'https://example.com/clash.yaml',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            true,
            { returnRaw: true },
        );

        expect(body.raw).to.equal(responseBody);
        expect(body.result).to.not.equal(responseBody);
        expect(body.result).to.contain('proxies:\n');
    });

    it('decrypts age-armored downloads without caching plaintext for unkeyed requests', async function () {
        const pair = await ageUtils.generateKeyPair();
        responseBody = await ageUtils.encryptArmor(
            'decrypted-body',
            pair['age-public-key'],
        );

        const keyed = await download(
            `https://example.com/age.txt#age-secret-key=${encodeURIComponent(
                pair['age-secret-key'],
            )}`,
        );
        const unkeyed = await download('https://example.com/age.txt');

        expect(keyed).to.equal('decrypted-body');
        expect(unkeyed).to.contain(ageUtils.AGE_ARMOR_HEADER);
        expect(unkeyed).to.not.equal('decrypted-body');
        expect(capturedUrls).to.deep.equal(['https://example.com/age.txt']);
    });

    it('decrypts age-armored downloads with an explicit age secret option', async function () {
        const pair = await ageUtils.generateKeyPair();
        responseBody = await ageUtils.encryptArmor(
            'explicit-decrypted-body',
            pair['age-public-key'],
        );

        const body = await download(
            'https://example.com/explicit-age.txt',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            {
                'age-secret-key': pair['age-secret-key'],
            },
        );

        expect(body).to.equal('explicit-decrypted-body');
        expect(capturedUrls).to.deep.equal([
            'https://example.com/explicit-age.txt',
        ]);
    });

    it('leaves non-armor downloads unchanged when age-secret-key is present', async function () {
        const pair = await ageUtils.generateKeyPair();
        responseBody = 'plain subscription body';

        const body = await download(
            `https://example.com/plain.txt#age-secret-key=${encodeURIComponent(
                pair['age-secret-key'],
            )}`,
        );

        expect(body).to.equal('plain subscription body');
    });

    it('does not expose age-secret-key in failed download errors or logs', async function () {
        const encryptPair = await ageUtils.generateKeyPair();
        const wrongPair = await ageUtils.generateKeyPair();
        responseBody = await ageUtils.encryptArmor(
            'decrypted-body',
            encryptPair['age-public-key'],
        );

        try {
            await download(
                `https://example.com/wrong-key.txt#age-secret-key=${encodeURIComponent(
                    wrongPair['age-secret-key'],
                )}`,
            );
            throw new Error('Expected download to fail');
        } catch (e) {
            expect(e.message).to.contain('age 解密失败');
            expect(e.message).to.not.contain(wrongPair['age-secret-key']);
        }

        expect(infoLogs.join('\n')).to.not.contain(wrongPair['age-secret-key']);
        expect(errorLogs.join('\n')).to.not.contain(
            wrongPair['age-secret-key'],
        );
    });

    it('uses the Undici option that throws at the file redirect limit', async function () {
        const undici = eval("require('undici')");
        const originalAgent = undici.Agent;
        const originalRedirect = undici.interceptors.redirect;
        const originalRequest = undici.request;
        let redirectOptions;
        let error;

        undici.Agent = class {
            compose() {
                return this;
            }
        };
        undici.interceptors.redirect = (options) => {
            redirectOptions = options;
            return () => {};
        };
        undici.request = async () => ({ statusCode: 500 });

        try {
            await downloadFile(
                'https://example.com/redirecting-file',
                path.join(tempDir, 'redirecting-file'),
            );
        } catch (e) {
            error = e;
        } finally {
            undici.Agent = originalAgent;
            undici.interceptors.redirect = originalRedirect;
            undici.request = originalRequest;
        }

        expect(error).to.be.instanceOf(Error);
        expect(redirectOptions).to.deep.equal({
            maxRedirections: 3,
            throwOnMaxRedirect: true,
        });
    });
});
