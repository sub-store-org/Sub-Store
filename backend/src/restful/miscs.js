import $ from '@/core/app';
import { ENV } from '@/vendor/open-api';
import { failed, success } from '@/restful/response';
import { updateArtifactStore, updateGitHubAvatar } from '@/restful/settings';
import resourceCache from '@/utils/resource-cache';
import {
    GIST_BACKUP_FILE_NAME,
    GIST_BACKUP_KEY,
    SETTINGS_KEY,
} from '@/constants';
import { InternalServerError, RequestInvalidError } from '@/restful/errors';
import Gist from '@/utils/gist';
import migrate from '@/utils/migration';
import env from '@/utils/env';

export default function register($app) {
    // utils
    $app.get('/api/utils/env', getEnv); // get runtime environment
    $app.get('/api/utils/backup', gistBackup); // gist backup actions
    $app.get('/api/utils/refresh', refresh);

    // Storage management
    $app.route('/api/storage')
        .get((req, res) => {
            res.set('content-type', 'application/json')
                .set(
                    'content-disposition',
                    'attachment; filename="sub-store.json"',
                )
                .send(
                    $.env.isNode
                        ? JSON.stringify($.cache)
                        : $.read('#sub-store'),
                );
        })
        .post((req, res) => {
            const { content } = req.body;
            $.write(content, '#sub-store');
            if ($.env.isNode) {
                $.cache = JSON.parse(content);
                $.persistCache();
            }
            migrate();
            success(res);
        });

    // Redirect sub.store to vercel webpage
    $app.get('/', async (req, res) => {
        // 302 redirect
        res.set('location', 'https://sub-store.vercel.app/').status(302).end();
    });

    // handle preflight request for QX
    if (ENV().isQX) {
        $app.options('/', async (req, res) => {
            res.status(200).end();
        });
    }

    $app.all('/', (_, res) => {
        res.send('Hello from sub-store, made with ❤️ by Peng-YM');
    });
}

function getEnv(req, res) {
    success(res, env);
}

async function refresh(_, res) {
    // 1. get GitHub avatar and artifact store
    await updateGitHubAvatar();
    await updateArtifactStore();

    // 2. clear resource cache
    resourceCache.revokeAll();
    success(res);
}

async function gistBackup(req, res) {
    const { action } = req.query;
    // read token
    const { gistToken } = $.read(SETTINGS_KEY);
    if (!gistToken) {
        failed(
            res,
            new RequestInvalidError(
                'GIST_TOKEN_NOT_FOUND',
                `GitHub Token is required for backup!`,
            ),
        );
    } else {
        const gist = new Gist({
            token: gistToken,
            key: GIST_BACKUP_KEY,
        });
        try {
            let content;
            const settings = $.read(SETTINGS_KEY);
            const updated = settings.syncTime;
            switch (action) {
                case 'upload':
                    // update syncTime
                    settings.syncTime = new Date().getTime();
                    $.write(settings, SETTINGS_KEY);
                    content = $.read('#sub-store');
                    if ($.env.isNode)
                        content = JSON.stringify($.cache, null, `  `);
                    $.info(`上传备份中...`);
                    try {
                        await gist.upload({
                            [GIST_BACKUP_FILE_NAME]: { content },
                        });
                    } catch (err) {
                        // restore syncTime if upload failed
                        settings.syncTime = updated;
                        $.write(settings, SETTINGS_KEY);
                        throw err;
                    }
                    break;
                case 'download':
                    $.info(`还原备份中...`);
                    content = await gist.download(GIST_BACKUP_FILE_NAME);
                    try {
                        if (
                            Object.keys(JSON.parse(content).settings).length ===
                            0
                        ) {
                            throw new Error(
                                '备份文件应该至少包含 settings 字段',
                            );
                        }
                    } catch (err) {
                        $.error(
                            `Gist 备份文件校验失败, 无法还原\nReason: ${
                                err.message ?? err
                            }`,
                        );
                        throw new Error('Gist 备份文件校验失败, 无法还原');
                    }
                    // restore settings
                    $.write(content, '#sub-store');
                    if ($.env.isNode) {
                        content = JSON.parse(content);
                        $.cache = content;
                        $.persistCache();
                    }
                    $.info(`perform migration after restoring from gist...`);
                    migrate();
                    $.info(`migration completed`);
                    $.info(`还原备份完成`);
                    break;
            }
            success(res);
        } catch (err) {
            failed(
                res,
                new InternalServerError(
                    'BACKUP_FAILED',
                    `Failed to ${action} data to gist!`,
                    `Reason: ${err.message ?? err}`,
                ),
            );
        }
    }
}
