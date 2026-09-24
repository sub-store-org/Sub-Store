import { expect } from 'chai';
import http from 'http';
import { afterEach, describe, it } from 'mocha';
import { OpenAPI } from '@/vendor/open-api';

describe('Node push notifications', function () {
    this.timeout(10000);

    const previousPush = process.env.SUB_STORE_PUSH_SERVICE;
    const previousLog = console.log;
    let server;
    let logs;

    afterEach(async function () {
        console.log = previousLog;
        if (previousPush === undefined)
            delete process.env.SUB_STORE_PUSH_SERVICE;
        else process.env.SUB_STORE_PUSH_SERVICE = previousPush;
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            server = undefined;
        }
    });

    function captureLogs() {
        logs = [];
        console.log = (...args) => logs.push(args.join(' '));
    }

    function waitForLog(text) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                clearInterval(check);
                reject(new Error(`missing log: ${text}`));
            }, 3000);
            const check = setInterval(() => {
                if (logs.some((line) => line.includes(text))) {
                    clearTimeout(timeout);
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });
    }

    async function listen(handler) {
        server = http.createServer(handler);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        return `127.0.0.1:${server.address().port}`;
    }

    it('sends the existing assembled message through the in-process sender', async function () {
        let received;
        const host = await listen(async (request, response) => {
            let body = '';
            for await (const chunk of request) body += chunk;
            received = { method: request.method, body };
            response.end('ok');
        });
        process.env.SUB_STORE_PUSH_SERVICE = `generic+http://${host}/notify`;
        captureLogs();

        expect(
            OpenAPI.prototype.notify('Title', 'Subtitle', 'Content', {
                'open-url': 'https://example.test/open',
                'media-url': 'https://example.test/image',
            }),
        ).to.equal(undefined);
        await waitForLog('[Push Service]');

        expect(received).to.include({ method: 'POST' });
        expect(received.body).to.include(
            'Title\nSubtitle\nContent\n点击跳转: https://example.test/open\n多媒体: https://example.test/image',
        );
        expect(logs.join('\n')).not.to.include('shoutrrr:');
    });

    it('does not send anything without push configuration', async function () {
        delete process.env.SUB_STORE_PUSH_SERVICE;
        captureLogs();
        expect(OpenAPI.prototype.notify('Title', '', 'Body')).to.equal(
            undefined,
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(logs).to.have.length(1);
        expect(logs[0]).to.include('[Notify] Title');
    });

    it('keeps HTTP URL template handling separate', async function () {
        let requested;
        const host = await listen((request, response) => {
            requested = request.url;
            response.end('ok');
        });
        process.env.SUB_STORE_PUSH_SERVICE = `http://${host}/[推送标题]?body=[推送内容]`;
        captureLogs();
        OpenAPI.prototype.notify('Title', 'Subtitle', 'Content');
        await waitForLog('RES: 200');
        expect(requested).to.equal('/Title?body=Subtitle%0AContent');
    });

    it('reports unsupported services without logging credential-bearing URLs', async function () {
        process.env.SUB_STORE_PUSH_SERVICE =
            'matrix://secret-user:secret-pass@example.test/secret-path?token=secret-query';
        captureLogs();
        OpenAPI.prototype.notify('Title', '', 'Body');
        await waitForLog('service is not supported');
        const output = logs.join('\n');
        for (const secret of [
            'secret-user',
            'secret-pass',
            'secret-path',
            'secret-query',
        ]) {
            expect(output).not.to.include(secret);
        }
    });

    it('does not log arbitrary secret-bearing webhook query fields', async function () {
        const host = await listen((_request, response) => response.end('ok'));
        process.env.SUB_STORE_PUSH_SERVICE = `generic+http://${host}/notify?code=synthetic-secret-value`;
        captureLogs();
        OpenAPI.prototype.notify('Title', '', 'Body');
        await waitForLog('RES: sent');
        expect(logs.join('\n')).not.to.include('synthetic-secret-value');
    });

    it('reports malformed URLs and rejected provider responses', async function () {
        captureLogs();
        process.env.SUB_STORE_PUSH_SERVICE = 'not-a-url';
        OpenAPI.prototype.notify('Title', '', 'Body');
        await waitForLog('ERROR:');
        expect(logs.join('\n')).not.to.include('not-a-url');

        const host = await listen((_request, response) => {
            response.statusCode = 500;
            response.end('failure');
        });
        process.env.SUB_STORE_PUSH_SERVICE = `generic+http://${host}/notify`;
        captureLogs();
        OpenAPI.prototype.notify('Title', '', 'Body');
        await waitForLog('ERROR:');
    });

    it('does not leak credentials from hostnames when sending fails', async function () {
        for (const url of [
            // Invalid service options fail URL validation before any network call.
            'ifttt://synthetic-secret.example.test',
            'pushbullet://short-secret/device-id',
        ]) {
            process.env.SUB_STORE_PUSH_SERVICE = url;
            captureLogs();
            OpenAPI.prototype.notify('Title', '', 'Body');
            await waitForLog('ERROR:');
            expect(logs.join('\n')).not.to.include(
                url.split('://')[1].split(/[/?]/)[0],
            );
        }
    });
});
