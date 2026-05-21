import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';

import $ from '@/core/app';
import {
    formatArtifactLogName,
    hasArtifactCron,
    normalizeArtifactCron,
    runArtifactCron,
    shouldSyncArtifactInGlobalCron,
    startArtifactCronJobs,
    stopArtifactCronJobs,
    validateArtifactCron,
} from '@/utils/artifact-cron';

describe('artifact cron policy', function () {
    let read;
    let info;
    let error;

    beforeEach(function () {
        read = $.read;
        info = $.info;
        error = $.error;

        $.read = () => [];
        $.info = () => {};
        $.error = () => {};
    });

    afterEach(function () {
        stopArtifactCronJobs();
        $.read = read;
        $.info = info;
        $.error = error;
    });

    it('treats blank cron as unset', function () {
        const artifact = { name: 'demo', cron: '   ' };

        normalizeArtifactCron(artifact);

        expect(artifact).to.not.have.property('cron');
        expect(hasArtifactCron(artifact)).to.equal(false);
        expect(shouldSyncArtifactInGlobalCron(artifact)).to.equal(true);
    });

    it('keeps valid cron and removes it from global cron eligibility', function () {
        const artifact = { name: 'demo', cron: ' 55 23 * * * ' };

        normalizeArtifactCron(artifact);

        expect(artifact.cron).to.equal('55 23 * * *');
        expect(hasArtifactCron(artifact)).to.equal(true);
        expect(shouldSyncArtifactInGlobalCron(artifact)).to.equal(false);
    });

    it('rejects invalid cron expressions', function () {
        expect(() => validateArtifactCron('not a cron')).to.throw(
            /Artifact cron not a cron is invalid/,
        );
    });

    it('formats display name for logs when available', function () {
        expect(
            formatArtifactLogName({
                name: 'demo',
                displayName: 'Demo Display',
            }),
        ).to.equal('demo (Demo Display)');
        expect(
            formatArtifactLogName({
                name: 'legacy',
                'display-name': 'Legacy Display',
            }),
        ).to.equal('legacy (Legacy Display)');
        expect(
            formatArtifactLogName({
                name: 'same',
                displayName: 'same',
            }),
        ).to.equal('same');
    });

    it('skips overlapping runs for the same artifact', async function () {
        const calls = [];
        const logs = [];
        let releaseFirstRun;
        let firstRunStarted;
        let runCount = 0;

        const firstRunPromise = new Promise((resolve) => {
            firstRunStarted = resolve;
        });

        $.info = (message) => {
            logs.push(message);
        };
        startArtifactCronJobs(async (name) => {
            calls.push(name);
            runCount++;
            if (runCount === 1) {
                firstRunStarted();
                await new Promise((resolve) => {
                    releaseFirstRun = resolve;
                });
            }
        });

        const firstRun = runArtifactCron('demo', 'demo', '* * * * * *');
        await firstRunPromise;

        await runArtifactCron('demo', 'demo', '* * * * * *');

        expect(calls).to.deep.equal(['demo']);
        expect(logs).to.include(
            '[ARTIFACT CRON] demo * * * * * * skipped: previous run is still running',
        );

        releaseFirstRun();
        await firstRun;

        await runArtifactCron('demo', 'demo', '* * * * * *');

        expect(calls).to.deep.equal(['demo', 'demo']);
    });
});
