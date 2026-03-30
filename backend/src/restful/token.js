import { ENV } from '@/vendor/open-api';
import { TOKENS_KEY, SUBS_KEY, FILES_KEY, COLLECTIONS_KEY } from '@/constants';
import { failed, success } from '@/restful/response';
import $ from '@/core/app';
import {
    RequestInvalidError,
    InternalServerError,
    ResourceNotFoundError,
} from '@/restful/errors';
import { insertByPosition } from '@/utils/database';
import { getCreateItemPosition } from '@/utils/create-item-position';
import { archiveShare } from '@/utils/archive';

export default function register($app) {
    if (!$.read(TOKENS_KEY)) $.write([], TOKENS_KEY);

    $app.post('/api/token', signToken);

    $app.route('/api/token/:token').delete(deleteToken);

    $app.route('/api/tokens').get(getAllTokens);
}

function deleteToken(req, res) {
    try {
        let { token } = req.params;
        const { type, name } = req.query;
        if (!type || !name) {
            throw new RequestInvalidError(
                'INVALID_PAYLOAD',
                `Payload type and name are required. Please update your front-end(version >= 2.15.76)`,
            );
        }
        $.info(`正在删除...\ntoken: ${token}, 类型：${type}, 名称：${name}`);
        if (shouldArchiveDeletion(req.query.mode)) {
            archiveShare(token, type, name);
        }
        deleteTokenItem(token, type, name);
        success(res);
    } catch (error) {
        failed(res, error);
    }
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
        const tokenData = createTokenItem(req.body.payload, req.body.options);
        return success(res, {
            token: tokenData.token,
            // secret,
        });
    } catch (e) {
        return failed(
            res,
            e instanceof RequestInvalidError
                ? e
                : new InternalServerError(
                      'TOKEN_SIGN_FAILED',
                      `Failed to sign token`,
                      `Reason: ${e.message ?? e}`,
                  ),
        );
    }
}

function createTokenItem(payload, options = {}) {
    const ms = eval(`require("ms")`);
    const type = payload?.type;
    const name = payload?.name;
    if (!type || !name) {
        throw new RequestInvalidError(
            'INVALID_PAYLOAD',
            `payload type and name are required`,
        );
    }
    let token = payload?.token;
    if (token != null) {
        if (typeof token !== 'string' || token.length < 1) {
            throw new RequestInvalidError(
                'INVALID_CUSTOM_TOKEN',
                `Invalid custom token: ${token}`,
            );
        }
        const tokens = $.read(TOKENS_KEY) || [];
        if (
            tokens.find(
                (item) =>
                    item.token === token &&
                    item.type === type &&
                    item.name === name,
            )
        ) {
            throw new RequestInvalidError(
                'DUPLICATE_TOKEN',
                `Token ${token} already exists`,
            );
        }
    }

    if (type === 'col') {
        const collections = $.read(COLLECTIONS_KEY) || [];
        const collection = collections.find((item) => item.name === name);
        if (!collection) {
            throw new RequestInvalidError(
                'INVALID_COLLECTION',
                `collection ${name} not found`,
            );
        }
    } else if (type === 'file') {
        const files = $.read(FILES_KEY) || [];
        const file = files.find((item) => item.name === name);
        if (!file) {
            throw new RequestInvalidError(
                'INVALID_FILE',
                `file ${name} not found`,
            );
        }
    } else if (type === 'sub') {
        const subs = $.read(SUBS_KEY) || [];
        const sub = subs.find((item) => item.name === name);
        if (!sub) {
            throw new RequestInvalidError(
                'INVALID_SUB',
                `sub ${name} not found`,
            );
        }
    } else {
        throw new RequestInvalidError(
            'INVALID_TYPE',
            `type ${name} not supported`,
        );
    }

    let expiresIn = options?.expiresIn;
    if (options?.expiresIn != null) {
        expiresIn = ms(options.expiresIn);
        if (expiresIn == null || isNaN(expiresIn) || expiresIn <= 0) {
            throw new RequestInvalidError(
                'INVALID_EXPIRES_IN',
                `Invalid expiresIn option: ${options.expiresIn}`,
            );
        }
    }

    const nanoid = eval(`require("nanoid")`);
    const tokens = $.read(TOKENS_KEY) || [];
    if (!token) {
        do {
            token = nanoid.customAlphabet(nanoid.urlAlphabet)();
        } while (
            tokens.find(
                (item) =>
                    item.token === token &&
                    item.type === type &&
                    item.name === name,
            )
        );
    }
    const tokenData = {
        ...payload,
        token,
        createdAt: Date.now(),
        expiresIn: expiresIn > 0 ? options?.expiresIn : undefined,
        exp: expiresIn > 0 ? Date.now() + expiresIn : undefined,
    };
    insertByPosition(tokens, tokenData, getCreateItemPosition());
    $.write(tokens, TOKENS_KEY);
    return tokenData;
}

function deleteTokenItem(token, type, name) {
    const allTokens = $.read(TOKENS_KEY) || [];
    const match = allTokens.find(
        (item) => item.token === token && item.type === type && item.name === name,
    );
    if (!match) {
        throw new ResourceNotFoundError(
            'RESOURCE_NOT_FOUND',
            `Share ${type}/${name}/${token} does not exist!`,
        );
    }
    const filtered = allTokens.filter(
        (item) =>
            !(item.token === token && item.type === type && item.name === name),
    );
    $.write(filtered, TOKENS_KEY);
    return match;
}

function shouldArchiveDeletion(mode) {
    if (mode == null || mode === '' || mode === 'permanent') {
        return false;
    }
    if (mode === 'archive') {
        return true;
    }
    throw new RequestInvalidError(
        'INVALID_DELETE_MODE',
        `Unsupported delete mode: ${mode}`,
    );
}

export { createTokenItem, deleteTokenItem };
