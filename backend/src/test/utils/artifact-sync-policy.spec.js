import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
    resolveCronArtifactSyncPolicy,
    shouldSkipCronArtifactWithoutUploadCredentials,
} from '@/utils/artifact-sync-policy';

describe('cron sync artifact policy', function () {
    it('keeps upload-only schedules quiet without Gist credentials', function () {
        const policy = resolveCronArtifactSyncPolicy({
            settings: {},
            artifacts: [{ name: 'upload-me', sync: true }],
        });

        expect(policy).to.deep.equal({
            canUpload: false,
            shouldRun: false,
        });
    });

    it('runs only no-upload artifacts when mixed schedules have no Gist credentials', function () {
        const policy = resolveCronArtifactSyncPolicy({
            settings: {},
            artifacts: [
                { name: 'cache-refresh', sync: true, upload: false },
                { name: 'gist-upload', sync: true },
            ],
        });

        expect(policy).to.deep.equal({
            canUpload: false,
            shouldRun: true,
        });
        expect(
            shouldSkipCronArtifactWithoutUploadCredentials(
                { name: 'cache-refresh', upload: false },
                policy,
            ),
        ).to.equal(false);
        expect(
            shouldSkipCronArtifactWithoutUploadCredentials(
                { name: 'gist-upload' },
                policy,
            ),
        ).to.equal(true);
    });

    it('allows every synced artifact when Gist credentials exist', function () {
        const policy = resolveCronArtifactSyncPolicy({
            settings: { gistToken: 'token' },
            artifacts: [
                { name: 'cache-refresh', sync: true, upload: false },
                { name: 'gist-upload', sync: true },
            ],
        });

        expect(policy).to.deep.equal({
            canUpload: true,
            shouldRun: true,
        });
        expect(
            shouldSkipCronArtifactWithoutUploadCredentials(
                { name: 'gist-upload' },
                policy,
            ),
        ).to.equal(false);
    });
});
