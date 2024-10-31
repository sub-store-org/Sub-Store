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
    TOKENS_KEY,
    FILES_KEY,
    COLLECTIONS_KEY,
    SUBS_KEY,
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
    $app.post('/api/token', signToken);

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
    if (req.query.share) {
        env.feature.share = true;
    }
    success(res, env);
}

async function signToken(req, res) {
    if (!ENV().isNode) {
        return failed(
            res,
            new RequestInvalidError(
                'INVALID_ENV',
                `This endpoint is only available in Node.js environment`,
            ),
        );
    }
    try {
        const { payload, options } = req.body;
        const ms = eval(`require("ms")`);
        let token = payload?.token;
        if (token != null) {
            if (typeof token !== 'string' || token.length < 1) {
                return failed(
                    res,
                    new RequestInvalidError(
                        'INVALID_CUSTOM_TOKEN',
                        `Invalid custom token: ${token}`,
                    ),
                );
            }
            const tokens = $.read(TOKENS_KEY) || [];
            if (tokens.find((t) => t.token === token)) {
                return failed(
                    res,
                    new RequestInvalidError(
                        'DUPLICATE_TOKEN',
                        `Token ${token} already exists`,
                    ),
                );
            }
        }
        const type = payload?.type;
        const name = payload?.name;
        if (!type || !name)
            return failed(
                res,
                new RequestInvalidError(
                    'INVALID_PAYLOAD',
                    `payload type and name are required`,
                ),
            );
        if (type === 'col') {
            const collections = $.read(COLLECTIONS_KEY) || [];
            const collection = collections.find((c) => c.name === name);
            if (!collection)
                return failed(
                    res,
                    new RequestInvalidError(
                        'INVALID_COLLECTION',
                        `collection ${name} not found`,
                    ),
                );
        } else if (type === 'file') {
            const files = $.read(FILES_KEY) || [];
            const file = files.find((f) => f.name === name);
            if (!file)
                return failed(
                    res,
                    new RequestInvalidError(
                        'INVALID_FILE',
                        `file ${name} not found`,
                    ),
                );
        } else if (type === 'sub') {
            const subs = $.read(SUBS_KEY) || [];
            const sub = subs.find((s) => s.name === name);
            if (!sub)
                return failed(
                    res,
                    new RequestInvalidError(
                        'INVALID_SUB',
                        `sub ${name} not found`,
                    ),
                );
        } else {
            return failed(
                res,
                new RequestInvalidError(
                    'INVALID_TYPE',
                    `type ${name} not supported`,
                ),
            );
        }
        let expiresIn = options?.expiresIn;
        if (options?.expiresIn != null) {
            expiresIn = ms(options.expiresIn);
            if (expiresIn == null || isNaN(expiresIn) || expiresIn <= 0) {
                return failed(
                    res,
                    new RequestInvalidError(
                        'INVALID_EXPIRES_IN',
                        `Invalid expiresIn option: ${options.expiresIn}`,
                    ),
                );
            }
        }
        const secret = eval('process.env.SUB_STORE_FRONTEND_BACKEND_PATH');
        const nanoid = eval(`require("nanoid")`);
        const tokens = $.read(TOKENS_KEY) || [];
        // const now = Date.now();
        // for (const key in tokens) {
        //     const token = tokens[key];
        //     if (token.exp != null || token.exp < now) {
        //         delete tokens[key];
        //     }
        // }
        if (!token) {
            do {
                token = nanoid.customAlphabet(nanoid.urlAlphabet)();
            } while (tokens.find((t) => t.token === token));
        }
        tokens.push({
            ...payload,
            token,
            createdAt: Date.now(),
            expiresIn: expiresIn > 0 ? options?.expiresIn : undefined,
            exp: expiresIn > 0 ? Date.now() + expiresIn : undefined,
        });

        $.write(tokens, TOKENS_KEY);
        return success(res, {
            token,
            secret,
        });
    } catch (e) {
        return failed(
            res,
            new InternalServerError(
                'TOKEN_SIGN_FAILED',
                `Failed to sign token`,
                `Reason: ${e.message ?? e}`,
            ),
        );
    }
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
            // update syncTime
            settings.syncTime = new Date().getTime();
            $.write(settings, SETTINGS_KEY);
            content = $.read('#sub-store');
            if ($.env.isNode) content = JSON.stringify($.cache, null, `  `);
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
