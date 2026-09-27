function decodeQueryComponent(value) {
    try {
        return decodeURIComponent(`${value}`.replace(/\+/g, '%20'));
    } catch (e) {
        return value;
    }
}

function splitQueryPart(part) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
        return {
            key: decodeQueryComponent(part),
            value: '',
        };
    }

    return {
        key: decodeQueryComponent(part.slice(0, separatorIndex)),
        value: decodeQueryComponent(part.slice(separatorIndex + 1)),
    };
}

export function parseSafeIntegerValue(value) {
    if (!/^\d+$/.test(`${value}`)) return null;

    const parsed = parseInt(`${value}`, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

export function extractPathQueryParam(rawPath, paramName) {
    const path = rawPath == null ? '' : `${rawPath}`;
    const queryIndex = path.indexOf('?');

    if (queryIndex === -1) {
        return {
            path,
            value: '',
        };
    }

    const basePath = path.slice(0, queryIndex);
    const query = path.slice(queryIndex + 1);
    const keptParts = [];
    let value = '';

    for (const part of query.split('&')) {
        if (part === '') continue;

        const parsed = splitQueryPart(part);
        if (parsed.key === paramName) {
            if (value === '' && parsed.value !== '') {
                value = parsed.value;
            }
            continue;
        }

        keptParts.push(part);
    }

    return {
        path:
            keptParts.length > 0
                ? `${basePath}?${keptParts.join('&')}`
                : basePath,
        value,
    };
}

export function getPathQueryParam(rawPath, paramName) {
    const path = rawPath == null ? '' : `${rawPath}`;
    const queryIndex = path.indexOf('?');

    if (queryIndex === -1) return '';

    const query = path.slice(queryIndex + 1);
    for (const part of query.split('&')) {
        if (part === '') continue;

        const parsed = splitQueryPart(part);
        if (parsed.key === paramName && parsed.value !== '') {
            return parsed.value;
        }
    }

    return '';
}

export function getSafeIntegerPathQueryParam(rawPath, paramName) {
    const value = getPathQueryParam(rawPath, paramName);
    const parsed = parseSafeIntegerValue(value);

    if (parsed == null) {
        return {
            value: '',
            parsed: null,
        };
    }

    return {
        value,
        parsed,
    };
}

function appendPathQueryParam(path, paramName, value) {
    const separator = path.includes('?')
        ? path.endsWith('?') || path.endsWith('&')
            ? ''
            : '&'
        : '?';

    return `${path}${separator}${encodeURIComponent(
        paramName,
    )}=${encodeURIComponent(`${value}`)}`;
}

export function setPathQueryParam(rawPath, paramName, value) {
    const path = rawPath == null || rawPath === '' ? '/' : `${rawPath}`;
    const { path: pathWithoutParam } = extractPathQueryParam(path, paramName);

    return appendPathQueryParam(pathWithoutParam, paramName, value);
}

export function normalizeWebSocketEarlyDataPath(wsOpts) {
    const networkPath = wsOpts?.path;
    if (!wsOpts) return;

    const { value: ed, parsed: maxEarlyData } = getSafeIntegerPathQueryParam(
        networkPath,
        'ed',
    );
    if (wsOpts['v2ray-http-upgrade']) {
        if (ed !== '') {
            wsOpts.path = extractPathQueryParam(networkPath, 'ed').path;
            wsOpts['v2ray-http-upgrade-fast-open'] = true;
            if (
                wsOpts['_v2ray-http-upgrade-ed'] == null ||
                `${wsOpts['_v2ray-http-upgrade-ed']}` === ''
            ) {
                wsOpts['_v2ray-http-upgrade-ed'] = ed;
            }
        }
        delete wsOpts['early-data-header-name'];
        delete wsOpts['max-early-data'];
        return;
    }

    if (ed === '') return;

    wsOpts.path = extractPathQueryParam(networkPath, 'ed').path;
    if (wsOpts['early-data-header-name'] == null) {
        wsOpts['early-data-header-name'] = 'Sec-WebSocket-Protocol';
    }
    if (wsOpts['max-early-data'] == null) {
        wsOpts['max-early-data'] = maxEarlyData;
    }
}

export function deleteHttpUpgradeEarlyDataMetadata(wsOpts) {
    if (!wsOpts) return;

    delete wsOpts['_v2ray-http-upgrade-ed'];
}
