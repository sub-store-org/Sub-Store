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
import { normalizeAgePublicKeyConfig } from '@/utils/age';

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

function normalizeExpirationMode(mode) {
    if (mode == null || mode === '') {
        return undefined;
    }
    if (mode === 'duration' || mode === 'datetime' || mode === 'count') {
        return mode;
    }
    throw new RequestInvalidError(
        'INVALID_EXPIRATION_MODE',
        `Unsupported expiration mode: ${mode}`,
    );
}

function inferLegacyExpirationMode(options = {}) {
    if (options?.expiresIn != null && options.expiresIn !== '') {
        return 'duration';
    }
    if (options?.exp != null && options.exp !== '') {
        return 'datetime';
    }
    return undefined;
}

function resolveExactExpiration(options = {}) {
    const rawExp = options?.exp;
    if (typeof rawExp !== 'number' && typeof rawExp !== 'string') {
        throw new RequestInvalidError(
            'INVALID_EXPIRATION_DATETIME',
            `Invalid exp option: ${rawExp}`,
        );
    }

    const normalizedRawExp =
        typeof rawExp === 'string' ? rawExp.trim() : rawExp;
    if (normalizedRawExp === '') {
        throw new RequestInvalidError(
            'INVALID_EXPIRATION_DATETIME',
            `Invalid exp option: ${rawExp}`,
        );
    }

    const exp = Number(normalizedRawExp);
    if (
        !Number.isSafeInteger(exp) ||
        exp <= 0 ||
        // Require an explicit millisecond Unix timestamp to avoid
        // silently accepting second-based values from non-frontend callers.
        exp < 1000000000000
    ) {
        throw new RequestInvalidError(
            'INVALID_EXPIRATION_DATETIME',
            `Invalid exp option: ${rawExp}`,
        );
    }
    return exp;
}

function resolveDurationExpiration(options = {}, { required = false } = {}) {
    const rawExpiresIn = options?.expiresIn;
    if (rawExpiresIn == null || rawExpiresIn === '') {
        if (required) {
            throw new RequestInvalidError(
                'INVALID_EXPIRES_IN',
                `Invalid expiresIn option: ${rawExpiresIn}`,
            );
        }
        return null;
    }

    const ms = eval(`require("ms")`);
    const expiresIn = ms(rawExpiresIn);
    if (expiresIn == null || isNaN(expiresIn) || expiresIn <= 0) {
        throw new RequestInvalidError(
            'INVALID_EXPIRES_IN',
            `Invalid expiresIn option: ${rawExpiresIn}`,
        );
    }

    return {
        rawExpiresIn,
        expiresIn,
        exp: Date.now() + expiresIn,
    };
}

const DURATION_INPUT_UNIT_MS = {
    day: 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    season: 90 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
};

function resolveDurationInput(options = {}, durationExpiration) {
    const rawExpiresValue = options?.expiresValue;
    const rawExpiresUnit = options?.expiresUnit;
    const hasExpiresValue = rawExpiresValue != null && rawExpiresValue !== '';
    const hasExpiresUnit = rawExpiresUnit != null && rawExpiresUnit !== '';
    if (!hasExpiresValue && !hasExpiresUnit) {
        return null;
    }

    const expiresValue = Number(rawExpiresValue);
    if (!Number.isFinite(expiresValue) || expiresValue <= 0) {
        throw new RequestInvalidError(
            'INVALID_EXPIRES_VALUE',
            `Invalid expiresValue option: ${rawExpiresValue}`,
        );
    }

    const expiresUnit =
        typeof rawExpiresUnit === 'string' ? rawExpiresUnit.trim() : '';
    if (!['day', 'month', 'season', 'year'].includes(expiresUnit)) {
        throw new RequestInvalidError(
            'INVALID_EXPIRES_UNIT',
            `Invalid expiresUnit option: ${rawExpiresUnit}`,
        );
    }

    const normalizedExpiresValue = Number(expiresValue.toFixed(2));
    const expectedExpiresIn =
        normalizedExpiresValue * DURATION_INPUT_UNIT_MS[expiresUnit];
    if (
        durationExpiration &&
        Math.abs(durationExpiration.expiresIn - expectedExpiresIn) > 1
    ) {
        throw new RequestInvalidError(
            'INVALID_DURATION_INPUT',
            `expiresValue/expiresUnit do not match expiresIn option: ${rawExpiresValue}${expiresUnit} != ${options?.expiresIn}`,
        );
    }

    return {
        expiresValue: String(normalizedExpiresValue),
        expiresUnit,
    };
}

function resolveCountExpiration(options = {}) {
    const rawCount = options?.count;
    if (rawCount == null || rawCount === '') {
        throw new RequestInvalidError(
            'INVALID_SHARE_COUNT',
            `Invalid count option: ${rawCount}`,
        );
    }

    const count = Number(rawCount);
    if (!Number.isSafeInteger(count) || count <= 0) {
        throw new RequestInvalidError(
            'INVALID_SHARE_COUNT',
            `Invalid count option: ${rawCount}`,
        );
    }

    const rawUsedCount = options?.usedCount ?? 0;
    const usedCount = Number(rawUsedCount);
    if (!Number.isSafeInteger(usedCount) || usedCount < 0 || usedCount > count) {
        throw new RequestInvalidError(
            'INVALID_SHARE_USED_COUNT',
            `Invalid usedCount option: ${rawUsedCount}`,
        );
    }

    return {
        count,
        usedCount,
    };
}

function createTokenItem(payload, options = {}) {
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

    const expirationMode =
        normalizeExpirationMode(options?.mode) ??
        inferLegacyExpirationMode(options);
    let durationExpiration = null;
    let durationInput = null;
    let exp;
    let countExpiration = null;
    if (expirationMode === 'datetime') {
        exp = resolveExactExpiration(options);
    } else if (expirationMode === 'count') {
        countExpiration = resolveCountExpiration(options);
    } else {
        durationExpiration = resolveDurationExpiration(options, {
            required: expirationMode === 'duration',
        });
        if (durationExpiration) {
            durationInput = resolveDurationInput(options, durationExpiration);
        }
        exp = durationExpiration?.exp;
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
    const normalizedMode =
        expirationMode === 'datetime'
            ? 'datetime'
            : expirationMode === 'count'
              ? 'count'
            : durationExpiration
              ? 'duration'
              : undefined;
    const safePayload = { ...payload };
    delete safePayload.mode;
    delete safePayload.exp;
    delete safePayload.expiresIn;
    delete safePayload.expiresValue;
    delete safePayload.expiresUnit;
    delete safePayload.count;
    delete safePayload.usedCount;
    normalizeAgePublicKeyConfig(safePayload);
    const tokenData = {
        ...safePayload,
        token,
        createdAt: Date.now(),
        ...(normalizedMode ? { mode: normalizedMode } : {}),
        ...(normalizedMode === 'datetime'
            ? { exp }
            : normalizedMode === 'count'
              ? {
                    count: countExpiration.count,
                    usedCount: countExpiration.usedCount,
                }
            : durationExpiration
              ? {
                    expiresIn: durationExpiration.rawExpiresIn,
                    ...(durationInput || {}),
                    exp,
                }
              : {}),
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

function matchesShareToken(item, { token, type, name, pathname }) {
    return (
        item.token === token &&
        (type ? item.type === type : true) &&
        (name ? item.name === name : true) &&
        (pathname
            ? `/share/${item.type}/${item.name}` === pathname ||
              pathname.startsWith(`/share/${item.type}/${item.name}/`)
            : true)
    );
}

function isShareTokenUsable(item) {
    if (item.exp != null && item.exp <= Date.now()) {
        return false;
    }

    if (item.mode === 'count') {
        const count = Number(item.count);
        const usedCount = item.usedCount == null ? 0 : Number(item.usedCount);
        return (
            Number.isSafeInteger(count) &&
            count > 0 &&
            Number.isSafeInteger(usedCount) &&
            usedCount >= 0 &&
            usedCount < count
        );
    }

    return true;
}

function consumeShareToken(query) {
    const allTokens = $.read(TOKENS_KEY) || [];
    const tokenIndex = allTokens.findIndex(
        (item) => matchesShareToken(item, query) && isShareTokenUsable(item),
    );
    if (tokenIndex < 0) {
        return null;
    }

    const token = allTokens[tokenIndex];
    if (token.mode !== 'count') {
        return token;
    }

    const nextToken = {
        ...token,
        usedCount: Number(token.usedCount ?? 0) + 1,
    };
    allTokens[tokenIndex] = nextToken;
    $.write(allTokens, TOKENS_KEY);
    return nextToken;
}

function findShareToken(query) {
    const allTokens = $.read(TOKENS_KEY) || [];
    return (
        allTokens.find(
            (item) => matchesShareToken(item, query) && isShareTokenUsable(item),
        ) || null
    );
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

export { createTokenItem, deleteTokenItem, consumeShareToken, findShareToken };
