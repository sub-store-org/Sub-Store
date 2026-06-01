import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';

import { SETTINGS_KEY } from '@/constants';
import $ from '@/core/app';
import {
    getBackendRequestConcurrency,
    getBackendRequestConcurrencyWaitTime,
    normalizeBackendRequestConcurrency,
    normalizeBackendRequestConcurrencyWaitTime,
    runBackendRequestTask,
    runBackendRequestTasks,
} from '@/utils/request-concurrency';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('backend request concurrency', function () {
    const originalRead = $.read.bind($);

    afterEach(function () {
        $.read = originalRead;
    });

    function setRequestConcurrencySettings(settings) {
        $.read = (key) => {
            if (key !== SETTINGS_KEY) return undefined;
            return settings;
        };
    }

    function setConcurrency(concurrency) {
        setRequestConcurrencySettings({
            backendRequestConcurrency: concurrency,
        });
    }

    it('normalizes missing and invalid values to the default', function () {
        [undefined, null, '', 'abc', '1.5', 0, -1].forEach((value) => {
            expect(normalizeBackendRequestConcurrency(value)).to.equal(15);
        });
    });

    it('normalizes missing and invalid wait time values to the default', function () {
        [undefined, null, '', 'abc', '1.5', -1].forEach((value) => {
            expect(normalizeBackendRequestConcurrencyWaitTime(value)).to.equal(
                0,
            );
        });
    });

    it('reads positive integer values from settings', function () {
        setConcurrency('2');

        expect(getBackendRequestConcurrency()).to.equal(2);
    });

    it('reads non-negative integer wait time values from settings', function () {
        setRequestConcurrencySettings({
            backendRequestConcurrency: 2,
            backendRequestConcurrencyWaitTime: '25',
        });

        expect(getBackendRequestConcurrencyWaitTime()).to.equal(25);
    });

    it('limits active backend request tasks to the configured concurrency', async function () {
        setConcurrency(2);
        let activeTasks = 0;
        let maxActiveTasks = 0;

        await Promise.all(
            Array.from({ length: 5 }, () =>
                runBackendRequestTask(async () => {
                    activeTasks += 1;
                    maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
                    await sleep(5);
                    activeTasks -= 1;
                }),
            ),
        );

        expect(maxActiveTasks).to.equal(2);
    });

    it('releases request slots when a task rejects', async function () {
        setConcurrency(1);
        const completed = [];

        const results = await Promise.allSettled([
            runBackendRequestTask(async () => {
                await sleep(5);
                throw new Error('request failed');
            }),
            runBackendRequestTask(async () => {
                completed.push('second');
                return 'ok';
            }),
        ]);

        expect(results[0].status).to.equal('rejected');
        expect(results[1]).to.deep.include({
            status: 'fulfilled',
            value: 'ok',
        });
        expect(completed).to.deep.equal(['second']);
    });

    it('waits after acquiring a request slot when configured', async function () {
        setRequestConcurrencySettings({
            backendRequestConcurrency: 1,
            backendRequestConcurrencyWaitTime: 15,
        });
        const startedAt = Date.now();
        let taskStartedAfter = 0;

        await runBackendRequestTask(async () => {
            taskStartedAfter = Date.now() - startedAt;
        });

        expect(taskStartedAfter).to.be.at.least(10);
    });

    it('starts queued tasks only after a request slot is released', async function () {
        setConcurrency(1);
        const events = [];
        let releaseFirstTask;
        let secondTaskStarted = false;

        const firstTask = runBackendRequestTask(async () => {
            events.push('first:start');
            await new Promise((resolve) => {
                releaseFirstTask = resolve;
            });
            events.push('first:end');
            return 'first';
        }, 'first');

        const secondTask = runBackendRequestTask(async () => {
            secondTaskStarted = true;
            events.push('second:start');
            return 'second';
        }, 'second');

        await sleep(5);

        expect(secondTaskStarted).to.equal(false);

        releaseFirstTask();

        const results = await Promise.all([firstTask, secondTask]);

        expect(results).to.deep.equal(['first', 'second']);
        expect(events).to.deep.equal([
            'first:start',
            'first:end',
            'second:start',
        ]);
    });

    it('preserves result ordering for task lists', async function () {
        setConcurrency(2);

        const results = await runBackendRequestTasks([
            async () => {
                await sleep(10);
                return 'first';
            },
            async () => {
                await sleep(1);
                return 'second';
            },
            async () => 'third',
        ]);

        expect(results).to.deep.equal(['first', 'second', 'third']);
    });
});
