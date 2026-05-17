import { ProxyUtils } from '@/core/proxy-utils';

function getCurrentHeaders(res) {
    return typeof res.getHeaders === 'function' ? { ...res.getHeaders() } : {};
}

function setHeaders(res, currentHeaders, nextHeaders = {}) {
    for (const key of Object.keys(currentHeaders)) {
        if (!Object.prototype.hasOwnProperty.call(nextHeaders, key)) {
            res.removeHeader(key);
        }
    }
    for (const [key, value] of Object.entries(nextHeaders)) {
        if (value == null) {
            res.removeHeader(key);
        } else {
            res.set(key, value);
        }
    }
}

function setStatus(res, status) {
    const statusCode = Number(status);
    if (
        Number.isInteger(statusCode) &&
        statusCode >= 100 &&
        statusCode <= 599
    ) {
        res.status(statusCode);
    }
}

export async function applyResponseTransformers({
    res,
    body,
    process,
    targetPlatform,
    source,
    $options,
}) {
    const currentHeaders = getCurrentHeaders(res);
    const transformed = await ProxyUtils.processResponse(
        {
            status: res.statusCode || 200,
            headers: currentHeaders,
            body,
        },
        process || [],
        targetPlatform,
        source,
        $options,
    );
    setHeaders(res, currentHeaders, transformed.header || transformed.headers);
    setStatus(res, transformed.status || transformed.statusCode);
    return transformed.body;
}
