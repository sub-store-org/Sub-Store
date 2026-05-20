import { expect } from 'chai';
import { describe, it } from 'mocha';

import $ from '@/core/app';
import { SETTINGS_KEY } from '@/constants';
import Gist, {
    describeGistApiErrorResponse,
    getGithubGistBaseURL,
    hasGistSyncCredentials,
} from '@/utils/gist';
import {
    normalizeArtifactSyncBatchSize,
    syncToGist,
} from '@/restful/artifacts';
import { uploadArtifactBatches } from '@/restful/sync';

describe('Gist GitHub API URL', function () {
    it('uses the default GitHub API URL when unset', function () {
        expect(getGithubGistBaseURL()).to.equal('https://api.github.com');
    });

    it('uses the default GitHub API URL when blank', function () {
        expect(
            getGithubGistBaseURL({
                githubApiUrl: '   ',
            }),
        ).to.equal('https://api.github.com');
    });

    it('applies GitHub proxy only to the default GitHub API URL', function () {
        expect(
            getGithubGistBaseURL({
                githubProxy: 'https://proxy.example.com/',
            }),
        ).to.equal('https://proxy.example.com/https://api.github.com');
    });

    it('does not apply GitHub proxy to a custom GitHub API URL', function () {
        expect(
            getGithubGistBaseURL({
                githubApiUrl: 'https://litegist.example.com/api/',
                githubProxy: 'https://proxy.example.com/',
            }),
        ).to.equal('https://litegist.example.com/api');
    });

    it('includes HTTP status when describing Gist API errors', function () {
        expect(
            describeGistApiErrorResponse({
                statusCode: 500,
                body: JSON.stringify({
                    message:
                        'Internal Server Error: Error: D1 query budget exceeded',
                }),
            }),
        ).to.equal(
            'ERROR: HTTP 500: Internal Server Error: Error: D1 query budget exceeded',
        );
    });

    it('allows token-only Gist-compatible sync settings', function () {
        expect(
            hasGistSyncCredentials({
                gistToken: 'token',
                githubUser: '',
            }),
        ).to.equal(true);
    });

    it('skips sync when the token is missing', function () {
        expect(
            hasGistSyncCredentials({
                githubUser: 'xream',
            }),
        ).to.equal(false);
    });

    it('normalizes artifact sync batch size', function () {
        expect(normalizeArtifactSyncBatchSize()).to.equal(10);
        expect(normalizeArtifactSyncBatchSize('')).to.equal(10);
        expect(normalizeArtifactSyncBatchSize('0')).to.equal(10);
        expect(normalizeArtifactSyncBatchSize('2.9')).to.equal(2);
    });

    it('keeps an existing Gist alive with a fallback file when a delete would empty it', async function () {
        const manager = Object.create(Gist.prototype);
        let patchBody;

        manager.syncPlatform = '';
        manager.locate = async () => ({
            id: 'gist-id',
            files: {
                artifact: {
                    filename: 'artifact',
                },
            },
        });
        manager.http = {
            patch: async ({ body }) => {
                patchBody = JSON.parse(body);
                return {
                    body: JSON.stringify({
                        files: {
                            '.sub-store-placeholder': {
                                filename: '.sub-store-placeholder',
                            },
                        },
                    }),
                };
            },
        };

        const response = await manager.upload(
            {
                artifact: {
                    content: '',
                },
            },
            {
                emptyFileFallback: {
                    filename: '.sub-store-placeholder',
                    content: 'placeholder',
                },
            },
        );

        expect(patchBody.files.artifact).to.equal(null);
        expect(patchBody.files['.sub-store-placeholder']).to.deep.equal({
            content: 'placeholder',
        });
        expect(response.subStoreUploadMeta.emptyFileFallback).to.deep.equal({
            status: 'created',
            filename: '.sub-store-placeholder',
        });
    });

    it('removes the fallback file when a real file is uploaded later', async function () {
        const manager = Object.create(Gist.prototype);
        let patchBody;

        manager.syncPlatform = '';
        manager.locate = async () => ({
            id: 'gist-id',
            files: {
                '.sub-store-placeholder': {
                    filename: '.sub-store-placeholder',
                },
            },
        });
        manager.http = {
            patch: async ({ body }) => {
                patchBody = JSON.parse(body);
                return {
                    body: JSON.stringify({
                        files: {
                            artifact: {
                                filename: 'artifact',
                            },
                        },
                    }),
                };
            },
        };

        const response = await manager.upload(
            {
                artifact: {
                    content: 'real content',
                },
            },
            {
                emptyFileFallback: {
                    filename: '.sub-store-placeholder',
                    content: 'placeholder',
                },
            },
        );

        expect(patchBody.files.artifact).to.deep.equal({
            content: 'real content',
        });
        expect(patchBody.files['.sub-store-placeholder']).to.equal(null);
        expect(response.subStoreUploadMeta.emptyFileFallback).to.deep.equal({
            status: 'removed',
            filename: '.sub-store-placeholder',
        });
    });

    it('passes the artifact placeholder fallback to syncToGist by default', async function () {
        const originalRead = $.read.bind($);
        const originalWrite = $.write.bind($);
        const originalInfo = $.info.bind($);
        const originalUpload = Gist.prototype.upload;
        let capturedOptions;
        let writtenSettings;
        const infoMessages = [];

        $.read = (key) => {
            if (key === SETTINGS_KEY) {
                return {
                    gistToken: 'token',
                };
            }
            return originalRead(key);
        };
        $.write = (data, key) => {
            if (key === SETTINGS_KEY) {
                writtenSettings = data;
                return true;
            }
            return originalWrite(data, key);
        };
        $.info = (message) => {
            infoMessages.push(message);
        };
        Gist.prototype.upload = async function (_, options) {
            capturedOptions = options;
            return {
                body: JSON.stringify({
                    html_url: 'https://gist.example.com/sub-store',
                    files: {},
                }),
            };
        };

        try {
            await syncToGist({
                artifact: {
                    content: 'real content',
                },
            });
        } finally {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            Gist.prototype.upload = originalUpload;
        }

        expect(capturedOptions.emptyFileFallback).to.deep.equal({
            filename: '.sub-store-placeholder',
            content:
                'Sub-Store placeholder\nThis file keeps the Gist alive when all sync configuration files are deleted.',
        });
        expect(writtenSettings.artifactStore).to.equal(
            'https://gist.example.com/sub-store',
        );
        expect(writtenSettings.artifactStoreStatus).to.equal('VALID');
        expect(infoMessages).to.include(
            '准备同步 Gist: 文件数 1, 总大小 12 B, 最大文件 artifact (12 B)',
        );
    });

    it('continues uploading artifact batches after one batch fails', async function () {
        const originalRead = $.read.bind($);
        const originalWrite = $.write.bind($);
        const originalInfo = $.info.bind($);
        const originalLog = $.log.bind($);
        const originalError = $.error.bind($);
        const originalUpload = Gist.prototype.upload;
        const writes = [];

        $.read = (key) => {
            if (key === SETTINGS_KEY) {
                return {
                    gistToken: 'token',
                    artifactSyncBatchSize: 1,
                };
            }
            return originalRead(key);
        };
        $.write = (data, key) => {
            if (key === SETTINGS_KEY) {
                writes.push(data);
                return true;
            }
            return originalWrite(data, key);
        };
        $.info = () => {};
        $.log = () => {};
        $.error = () => {};
        Gist.prototype.upload = async function (files) {
            const filename = Object.keys(files)[0];
            if (filename === 'b') {
                throw new Error('batch failed');
            }
            return {
                body: JSON.stringify({
                    html_url: 'https://gist.example.com/sub-store',
                    files: {
                        [filename]: {
                            raw_url: `https://gist.example.com/raw/hash/${filename}`,
                        },
                    },
                }),
            };
        };

        const allArtifacts = [
            { name: 'a', sync: true, source: 'sub-a' },
            { name: 'b', sync: true, source: 'sub-b' },
            { name: 'c', sync: true, source: 'sub-c' },
        ];
        const invalid = [];

        try {
            const uploaded = await uploadArtifactBatches({
                allArtifacts,
                files: {
                    a: { content: 'A' },
                    b: { content: 'B' },
                    c: { content: 'C' },
                },
                valid: ['a', 'b', 'c'],
                invalid,
            });

            expect(uploaded).to.deep.equal(['a', 'c']);
            expect(invalid).to.deep.equal(['b']);
            expect(allArtifacts[0].url).to.equal(
                'https://gist.example.com/raw/a',
            );
            expect(allArtifacts[1].url).to.equal(undefined);
            expect(allArtifacts[2].url).to.equal(
                'https://gist.example.com/raw/c',
            );
            expect(writes).to.have.length(2);
        } finally {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            $.log = originalLog;
            $.error = originalError;
            Gist.prototype.upload = originalUpload;
        }
    });

    it('skips artifact batches for items that disabled upload', async function () {
        const originalRead = $.read.bind($);
        const originalWrite = $.write.bind($);
        const originalInfo = $.info.bind($);
        const originalLog = $.log.bind($);
        const originalError = $.error.bind($);
        const originalUpload = Gist.prototype.upload;
        let capturedFiles;

        $.read = (key) => {
            if (key === SETTINGS_KEY) {
                return {
                    gistToken: 'token',
                    artifactSyncBatchSize: 10,
                };
            }
            return originalRead(key);
        };
        $.write = (data, key) => {
            if (key === SETTINGS_KEY) {
                return true;
            }
            return originalWrite(data, key);
        };
        $.info = () => {};
        $.log = () => {};
        $.error = () => {};
        Gist.prototype.upload = async function (files) {
            capturedFiles = files;
            return {
                body: JSON.stringify({
                    html_url: 'https://gist.example.com/sub-store',
                    files: {
                        b: {
                            raw_url: 'https://gist.example.com/raw/hash/b',
                        },
                    },
                }),
            };
        };

        const allArtifacts = [
            { name: 'a', sync: true, source: 'sub-a', upload: false },
            { name: 'b', sync: true, source: 'sub-b' },
        ];
        const invalid = [];

        try {
            const uploaded = await uploadArtifactBatches({
                allArtifacts,
                files: {
                    a: { content: 'A' },
                    b: { content: 'B' },
                },
                valid: ['a', 'b'],
                invalid,
            });

            expect(Object.keys(capturedFiles)).to.deep.equal(['b']);
            expect(uploaded).to.deep.equal(['b']);
            expect(invalid).to.deep.equal([]);
            expect(allArtifacts[0].url).to.equal(undefined);
            expect(allArtifacts[1].url).to.equal(
                'https://gist.example.com/raw/b',
            );
        } finally {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            $.log = originalLog;
            $.error = originalError;
            Gist.prototype.upload = originalUpload;
        }
    });
});
