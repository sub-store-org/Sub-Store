import $ from '@/core/app';
import { ENV } from '@/vendor/open-api';
import { failed, success } from '@/restful/response';
import { updateArtifactStore, updateAvatar } from '@/restful/settings';
import resourceCache from '@/utils/resource-cache';
import scriptResourceCache from '@/utils/script-resource-cache';
import headersResourceCache from '@/utils/headers-resource-cache';
import {
    GIST_BACKUP_FILE_NAME,
    GIST_BACKUP_KEY,
    SETTINGS_KEY,
} from '@/constants';
import { InternalServerError, RequestInvalidError } from '@/restful/errors';
import Gist from '@/utils/gist';
import migrate from '@/utils/migration';
import env from '@/utils/env';
import { formatDateTime } from '@/utils';

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
                    `attachment; filename="${encodeURIComponent(
                        `sub-store_data_${formatDateTime(new Date())}.json`,
                    )}"`,
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

    if (ENV().isNode) {
        $app.get('/', getEnv);
    } else {
        // Redirect sub.store to vercel webpage
        $app.get('/', async (req, res) => {
            // 302 redirect
            res.set('location', 'https://sub-store.vercel.app/')
                .status(302)
                .end();
        });
    }

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
    if (req.query.share) {
        env.feature.share = true;
    }
    res.set('Content-Type', 'application/json;charset=UTF-8').send(
        JSON.stringify(
            {
                status: 'success',
                data: {
                    guide: '⚠️⚠️⚠️ 您当前看到的是后端的响应. 若想配合前端使用, 可访问官方前端 https://sub-store.vercel.app 后自行配置后端地址, 或一键配置后端 https://sub-store.vercel.app?api=https://a.com/xxx (假设 https://a.com 是你后端的域名, /xxx 是自定义路径). 需注意 HTTPS 前端无法请求非本地的 HTTP 后端(部分浏览器上也无法访问本地 HTTP 后端). 请配置反代或在局域网自建 HTTP 前端. 如果还有问题, 可查看此排查说明: https://t.me/zhetengsha/1068',
                    ...env,
                },
            },
            null,
            2,
        ),
    );
}

async function refresh(_, res) {
    // 1. get GitHub avatar and artifact store
    await updateAvatar();
    await updateArtifactStore();

    // 2. clear resource cache
    resourceCache.revokeAll();
    scriptResourceCache.revokeAll();
    headersResourceCache.revokeAll();
    success(res);
}

async function gistBackupAction(action) {
    // read token
    const { gistToken, syncPlatform } = $.read(SETTINGS_KEY);
    if (!gistToken) throw new Error('GitHub Token is required for backup!');

    const gist = new Gist({
        token: gistToken,
        key: GIST_BACKUP_KEY,
        syncPlatform,
    });
    let content;
    const settings = $.read(SETTINGS_KEY);
    const updated = settings.syncTime;
    switch (action) {
        case 'upload':
            try {
                content = $.read('#sub-store');
                content = content ? JSON.parse(content) : {};
                if ($.env.isNode) content = JSON.parse(JSON.stringify($.cache));
                content.settings.gistToken = '恢复后请重新设置 GitHub Token';
                content = JSON.stringify(content, null, `  `);
                $.info(`下载备份, 与本地内容对比...`);
                const onlineContent = await gist.download(
                    GIST_BACKUP_FILE_NAME,
                );
                if (onlineContent === content) {
                    $.info(`内容一致, 无需上传备份`);
                    return;
                }
            } catch (error) {
                $.error(`${error.message ?? error}`);
            }

            // update syncTime
            settings.syncTime = new Date().getTime();
            $.write(settings, SETTINGS_KEY);
            content = $.read('#sub-store');
            content = content ? JSON.parse(content) : {};
            if ($.env.isNode) content = JSON.parse(JSON.stringify($.cache));
            content.settings.gistToken = '恢复后请重新设置 GitHub Token';
            content = JSON.stringify(content, null, `  `);
            $.info(`上传备份中...`);
            try {
                await gist.upload({
                    [GIST_BACKUP_FILE_NAME]: { content },
                });
                $.info(`上传备份完成`);
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
                if (Object.keys(JSON.parse(content).settings).length === 0) {
                    throw new Error('备份文件应该至少包含 settings 字段');
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
        try {
            await gistBackupAction(action);
            success(res);
        } catch (err) {
            $.error(
                `Failed to ${action} gist data.\nReason: ${err.message ?? err}`,
            );
            failed(
                res,
                new InternalServerError(
                    'BACKUP_FAILED',
                    `Failed to ${action} gist data!`,
                    `Reason: ${err.message ?? err}`,
                ),
            );
        }
    }
}

export { gistBackupAction };
