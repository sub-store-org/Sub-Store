import { DEFAULT_LOGS_MAX_COUNT, LOGS_KEY, SETTINGS_KEY } from '@/constants';

const DEFAULT_LOG_LIMIT = 200;
const MAX_LOGS_MAX_COUNT = 10000;
const LOGS_MAX_COUNT_CACHE_TTL_MS = 1000;
const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
const DEFAULT_LOG_SCOPE = 'unknown';
const SUB_STORE_BANNER_VERSION_RE = /^Sub-Store\s+--\s+v\d+(?:\.\d+){0,3}$/;
const SUB_STORE_BANNER_SEPARATOR_RE = /^\u2505{8,}$/;
const SUB_STORE_LOG_PREFIX_RE =
    /^\[sub-store\]\s+(?:LOG|INFO|WARN|ERROR|DEBUG):\s*/;
const LOG_WITH_SCOPE_AND_LEVEL_PREFIX_RE =
    /^\[[^\]\r\n]+\]\s+(?:LOG|INFO|WARN|ERROR|DEBUG):\s*/i;
const LOG_WITH_SCOPE_PREFIX_RE = /^\[([^\]\r\n]+)\]\s*/;
const DEFAULT_IGNORED_SINGLE_LINE_LOG_MESSAGE_RES = [
    /^(?:.+\sParser|Rule parser \[.+\]) is activated!?$/,
    // /^Pre-processor \[Fallback Base64 Pre-processor\] activated$/,
    /^Pre-processor \[.+\] activated!?$/,
    /^Fallback Base64 Pre-processor error: decoded line does not start with protocol$/,
];

let consoleCaptureInstalled = false;
let isAppendingConsoleLog = false;
let cachedLogsMaxCount = null;
let cachedLogsMaxCountExpiresAt = 0;

export function normalizeLogLimit(value, fallback = DEFAULT_LOG_LIMIT) {
    const normalizedFallback = normalizePositiveInteger(
        fallback,
        DEFAULT_LOG_LIMIT,
        MAX_LOGS_MAX_COUNT,
    );
    return normalizePositiveInteger(
        value,
        normalizedFallback,
        MAX_LOGS_MAX_COUNT,
    );
}

export function normalizeLogsMaxCount(
    value,
    fallback = DEFAULT_LOGS_MAX_COUNT,
) {
    const normalizedFallback = normalizeNonNegativeInteger(
        fallback,
        DEFAULT_LOGS_MAX_COUNT,
        MAX_LOGS_MAX_COUNT,
    );
    return normalizeNonNegativeInteger(
        value,
        normalizedFallback,
        MAX_LOGS_MAX_COUNT,
    );
}

export function formatLogArguments(args) {
    return Array.from(args || [])
        .map(formatLogValue)
        .join(' ');
}

export function readLogEntries($) {
    try {
        const raw = $.read(LOGS_KEY);
        if (!raw) return [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isLogEntry);
    } catch {
        return [];
    }
}

export function persistLogEntries($, logs) {
    $.write(JSON.stringify(Array.isArray(logs) ? logs : []), LOGS_KEY);
}

export function appendLogEntry($, level, args) {
    try {
        const maxCount = getCachedLogsMaxCount($);
        if (maxCount === 0) return;

        const message = formatLogArguments(args);
        if (shouldIgnoreLogMessage(message)) return;

        const logs = readLogEntries($);
        const normalizedLevel = normalizeLogLevel(level);
        logs.push({
            id: createLogId(),
            time: Date.now(),
            level: normalizedLevel,
            message: normalizeStoredLogMessage(message, normalizedLevel),
        });
        persistLogEntries($, logs.slice(-maxCount));
    } catch {
        // Logging must never break the caller or recursively log failures.
    }
}

export function clearLogSettingsCache() {
    cachedLogsMaxCount = null;
    cachedLogsMaxCountExpiresAt = 0;
}

export function getLogEntries($, query = {}) {
    const settings = $.read(SETTINGS_KEY) || {};
    const maxCount = normalizeLogsMaxCount(settings.logsMaxCount);
    if (maxCount === 0) {
        return {
            logs: [],
            total: 0,
            maxCount,
        };
    }

    const limit = normalizeLogLimit(query.limit, maxCount);
    const keyword = `${query.keyword || ''}`.trim();
    const isRegex = normalizeBooleanQuery(query.regex);
    const ignoreCase = normalizeBooleanQuery(query.ignoreCase);
    const keywordMatcher = createKeywordMatcher(keyword, {
        isRegex,
        ignoreCase,
    });
    let logs = readLogEntries($);
    const sanitizedLogs = logs.filter((entry) => !shouldIgnoreLogEntry(entry));
    const shouldPersistSanitizedLogs = sanitizedLogs.length !== logs.length;
    logs = sanitizedLogs;

    if (logs.length > maxCount) {
        logs = logs.slice(-maxCount);
        persistLogEntries($, logs);
    } else if (shouldPersistSanitizedLogs) {
        persistLogEntries($, logs);
    }

    if (keywordMatcher) {
        logs = logs.filter((entry) => keywordMatcher(getSearchText(entry)));
    }

    return {
        logs: logs.slice(-limit).reverse(),
        total: logs.length,
        maxCount,
    };
}

export function clearLogEntries($) {
    persistLogEntries($, []);
}

export function installConsoleLogCapture($) {
    if (consoleCaptureInstalled || typeof console === 'undefined') return;
    consoleCaptureInstalled = true;

    LOG_LEVELS.forEach((level) => {
        const original = console[level];
        if (typeof original !== 'function') return;
        console[level] = function (...args) {
            original.apply(console, args);
            if (isAppendingConsoleLog) return;
            try {
                isAppendingConsoleLog = true;
                appendLogEntry($, level, args);
            } finally {
                isAppendingConsoleLog = false;
            }
        };
    });
}

function normalizePositiveInteger(value, fallback, max) {
    const number = Number(value);
    if (!isFinite(number) || number <= 0) return fallback;
    return Math.min(Math.floor(number), max);
}

function getCachedLogsMaxCount($) {
    const now = Date.now();
    if (cachedLogsMaxCount !== null && now < cachedLogsMaxCountExpiresAt) {
        return cachedLogsMaxCount;
    }

    const settings = $.read(SETTINGS_KEY) || {};
    cachedLogsMaxCount = normalizeLogsMaxCount(settings.logsMaxCount);
    cachedLogsMaxCountExpiresAt = now + LOGS_MAX_COUNT_CACHE_TTL_MS;
    return cachedLogsMaxCount;
}

function normalizeNonNegativeInteger(value, fallback, max) {
    if (value === null || value === undefined || value === '') return fallback;

    const number = Number(value);
    if (!isFinite(number) || number < 0) return fallback;
    return Math.min(Math.floor(number), max);
}

function normalizeBooleanQuery(value) {
    return (
        value === true ||
        value === 1 ||
        value === '1' ||
        value === 'true' ||
        value === 'on'
    );
}

function normalizeLogLevel(level) {
    return LOG_LEVELS.includes(level) ? level : 'log';
}

function normalizeStoredLogMessage(message, level) {
    const rawMessage = `${message || ''}`;
    if (LOG_WITH_SCOPE_AND_LEVEL_PREFIX_RE.test(rawMessage)) {
        return rawMessage;
    }

    const normalizedLevel = normalizeLogLevel(level).toUpperCase();
    const scopedMatch = rawMessage.match(LOG_WITH_SCOPE_PREFIX_RE);
    if (scopedMatch) {
        const scope = scopedMatch[1].trim() || DEFAULT_LOG_SCOPE;
        const content = rawMessage.slice(scopedMatch[0].length).trimStart();
        return `[${scope}] ${normalizedLevel}: ${content}`;
    }

    return `[${DEFAULT_LOG_SCOPE}] ${normalizedLevel}: ${rawMessage}`;
}

function createKeywordMatcher(keyword, { isRegex, ignoreCase }) {
    if (!keyword) return null;
    if (isRegex) {
        const regexp = new RegExp(keyword, ignoreCase ? 'i' : '');
        return (text) => regexp.test(text);
    }

    const needle = ignoreCase ? keyword.toLowerCase() : keyword;
    return (text) => {
        const haystack = ignoreCase ? text.toLowerCase() : text;
        return haystack.includes(needle);
    };
}

function getSearchText(entry) {
    return `${entry.level || ''}\n${entry.message || ''}`;
}

function shouldIgnoreLogEntry(entry) {
    return shouldIgnoreLogMessage(entry.message);
}

function shouldIgnoreLogMessage(message) {
    const lines = getNormalizedLogMessageLines(message);

    if (lines.length === 1) {
        return (
            SUB_STORE_BANNER_VERSION_RE.test(lines[0]) ||
            shouldIgnoreSingleLineLogMessage(lines[0])
        );
    }

    return isSubStoreBannerLog(lines);
}

function getNormalizedLogMessageLines(message) {
    const lines = `${message || ''}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return lines;

    const firstLineWithoutPrefix = lines[0]
        .replace(LOG_WITH_SCOPE_AND_LEVEL_PREFIX_RE, '')
        .trim();
    if (firstLineWithoutPrefix !== lines[0]) {
        if (firstLineWithoutPrefix) {
            lines[0] = firstLineWithoutPrefix;
        } else {
            lines.shift();
        }
    }

    return lines;
}

function isSubStoreBannerLog(lines) {
    if (lines.length < 3) return false;
    if (!SUB_STORE_BANNER_SEPARATOR_RE.test(lines[0])) return false;
    if (!SUB_STORE_BANNER_SEPARATOR_RE.test(lines[lines.length - 1])) {
        return false;
    }

    return lines
        .slice(1, -1)
        .some((line) => SUB_STORE_BANNER_VERSION_RE.test(line));
}

function shouldIgnoreSingleLineLogMessage(line) {
    const normalizedLine = line.replace(SUB_STORE_LOG_PREFIX_RE, '');
    return DEFAULT_IGNORED_SINGLE_LINE_LOG_MESSAGE_RES.some((regexp) =>
        regexp.test(normalizedLine),
    );
}

function formatLogValue(value) {
    if (value instanceof Error) {
        return value.stack || value.message || String(value);
    }
    if (typeof value === 'string') return value;
    if (value == null) return String(value);
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function isLogEntry(entry) {
    return (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.time === 'number' &&
        typeof entry.level === 'string' &&
        typeof entry.message === 'string'
    );
}

function createLogId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
