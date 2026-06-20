import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
import { Base64 } from 'js-base64';

import $ from '@/core/app';
import { GIST_BACKUP_FILE_NAME } from '@/constants';
import { gistBackupAction } from '@/restful/miscs';
import Gist from '@/utils/gist';
import {
    AGE_ARMOR_HEADER,
    AGE_PUBLIC_KEY,
    AGE_SECRET_KEY,
    decryptArmorIfPresent,
    encryptArmor,
    generateKeyPair,
} from '@/utils/age';

describe('Gist backup age encryption', function () {
    const originalRead = $.read.bind($);
    const originalWrite = $.write.bind($);
    const originalInfo = $.info.bind($);
    const originalError = $.error.bind($);
    const originalUpload = Gist.prototype.upload;
    const originalDownload = Gist.prototype.download;
    const originalCache = $.cache;
    const originalPersistCache = $.persistCache.bind($);

    afterEach(function () {
        $.read = originalRead;
        $.write = originalWrite;
        $.info = originalInfo;
        $.error = originalError;
        Gist.prototype.upload = originalUpload;
        Gist.prototype.download = originalDownload;
        $.cache = originalCache;
        $.persistCache = originalPersistCache;
    });

    function installState(initialContent) {
        $.cache = JSON.parse(JSON.stringify(initialContent));
        $.read = (key) => {
            if (key === '#sub-store') return JSON.stringify($.cache);
            return $.cache[key];
        };
        $.write = (data, key) => {
            if (key === '#sub-store') {
                $.cache = JSON.parse(data);
                return true;
            }
            $.cache[key] = data;
            return true;
        };
        $.persistCache = () => {};
        $.info = () => {};
        $.error = () => {};
    }

    it('encrypts Gist backup uploads in age mode', async function () {
        const pair = await generateKeyPair();
        let uploadedContent;

        installState({
            settings: {
                gistToken: 'token',
                gistUpload: 'age',
                [AGE_SECRET_KEY]: pair[AGE_SECRET_KEY],
            },
            subs: [],
        });

        Gist.prototype.download = async () => 'old backup';
        Gist.prototype.upload = async (files) => {
            uploadedContent = files[GIST_BACKUP_FILE_NAME].content;
            return {};
        };

        await gistBackupAction('upload', undefined, 'age');

        expect(uploadedContent).to.contain(AGE_ARMOR_HEADER);
        const decrypted = await decryptArmorIfPresent(
            uploadedContent,
            pair[AGE_SECRET_KEY],
        );
        const backup = JSON.parse(Base64.decode(decrypted));

        expect(backup.settings.gistToken).to.equal('token');
        expect(backup.settings).not.to.have.property(AGE_PUBLIC_KEY);
        expect(backup.settings[AGE_SECRET_KEY]).to.equal(pair[AGE_SECRET_KEY]);
        expect(backup.settings.syncTime).to.be.a('number');
    });

    it('does not use age encryption outside age mode', async function () {
        const pair = await generateKeyPair();
        let uploadedContent;

        installState({
            settings: {
                gistToken: 'token',
                gistUpload: 'base64',
                [AGE_SECRET_KEY]: pair[AGE_SECRET_KEY],
            },
            subs: [],
        });

        Gist.prototype.download = async () => 'old backup';
        Gist.prototype.upload = async (files) => {
            uploadedContent = files[GIST_BACKUP_FILE_NAME].content;
            return {};
        };

        await gistBackupAction('upload', undefined, 'base64');

        expect(uploadedContent).not.to.contain(AGE_ARMOR_HEADER);
        const backup = JSON.parse(Base64.decode(uploadedContent));

        expect(backup.settings.gistToken).to.equal('token');
        expect(backup.settings).not.to.have.property(AGE_PUBLIC_KEY);
        expect(backup.settings).not.to.have.property(AGE_SECRET_KEY);
        expect(backup.settings.syncTime).to.be.a('number');
    });

    it('replaces matching unencrypted online backups in age mode', async function () {
        const pair = await generateKeyPair();
        const initialContent = {
            settings: {
                gistToken: 'token',
                gistUpload: 'age',
                syncTime: 123,
                [AGE_SECRET_KEY]: pair[AGE_SECRET_KEY],
            },
            subs: [],
        };
        const unencryptedOnlineContent = Base64.encode(
            JSON.stringify(initialContent, null, `  `),
        );
        let uploadedContent;

        installState(initialContent);

        Gist.prototype.download = async () => unencryptedOnlineContent;
        Gist.prototype.upload = async (files) => {
            uploadedContent = files[GIST_BACKUP_FILE_NAME].content;
            return {};
        };

        await gistBackupAction('upload', undefined, 'age');

        expect(uploadedContent).to.contain(AGE_ARMOR_HEADER);
    });

    it('decrypts age-armored Gist backup downloads before restoring', async function () {
        const pair = await generateKeyPair();
        const restoredBackup = {
            settings: {
                gistToken: 'restored-token',
                [AGE_SECRET_KEY]: pair[AGE_SECRET_KEY],
            },
            subs: [
                {
                    name: 'restored-sub',
                    source: 'local',
                    content: 'content',
                },
            ],
        };
        const encryptedBackup = await encryptArmor(
            Base64.encode(JSON.stringify(restoredBackup, null, `  `)),
            pair[AGE_PUBLIC_KEY],
        );

        installState({
            settings: {
                gistToken: 'current-token',
                gistUpload: 'age',
                [AGE_SECRET_KEY]: pair[AGE_SECRET_KEY],
            },
            subs: [],
        });

        Gist.prototype.download = async () => encryptedBackup;

        await gistBackupAction('download');

        expect($.cache.settings.gistToken).to.equal('restored-token');
        expect($.cache.settings).not.to.have.property(AGE_PUBLIC_KEY);
        expect($.cache.subs).to.deep.equal(restoredBackup.subs);
    });

    it('rejects age upload mode without an age secret key', async function () {
        installState({
            settings: {
                gistToken: 'token',
                gistUpload: 'age',
            },
            subs: [],
        });

        Gist.prototype.download = async () => 'old backup';

        try {
            await gistBackupAction('upload', undefined, 'age');
            throw new Error('Expected age upload to fail');
        } catch (error) {
            expect(error.message).to.contain('age 解密私钥');
        }
    });
});
