import { deleteByName } from '@/utils/database';
import { ENV } from '@/vendor/open-api';
import { TOKENS_KEY, SUBS_KEY, FILES_KEY, COLLECTIONS_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import { RequestInvalidError, InternalServerError } from '@/restful/errors';

export default function register($app) {
    if (!$.read(TOKENS_KEY)) $.write([], TOKENS_KEY);

    $app.post('/api/token', signToken);

    $app.route('/api/token/:token').delete(deleteToken);

    $app.route('/api/tokens').get(getAllTokens);
}

function deleteToken(req, res) {
    let { token } = req.params;
    $.info(`正在删除：${token}`);
    let allTokens = $.read(TOKENS_KEY);
    deleteByName(allTokens, token, 'token');
    $.write(allTokens, TOKENS_KEY);
    success(res);
}

function getAllTokens(req, res) {
    const { type, name } = req.query;
    const allTokens = $.read(TOKENS_KEY) || [];
    success(
        res,
        type || name
            ? allTokens.filter(
                  (item) =>
                      (type ? item.type === type : true) &&
                      (name ? item.name === name : true),
              )
            : allTokens,
    );
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
            if (
                tokens.find(
                    (t) =>
                        t.token === token && t.type === type && t.name === name,
                )
            ) {
                return failed(
                    res,
                    new RequestInvalidError(
                        'DUPLICATE_TOKEN',
                        `Token ${token} already exists`,
                    ),
                );
            }
        }

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
        // const secret = eval('process.env.SUB_STORE_FRONTEND_BACKEND_PATH');
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
            } while (
                tokens.find(
                    (t) =>
                        t.token === token && t.type === type && t.name === name,
                )
            );
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
            // secret,
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
