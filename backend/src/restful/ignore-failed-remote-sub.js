import { ProxyUtils } from '@/core/proxy-utils';

const IGNORE_FAILED_REMOTE_SUB_NOTIFY_MODES = new Set([
    'enabled',
    'fallbackNotify',
]);
const IGNORE_FAILED_REMOTE_SUB_FALLBACK_MODES = new Set([
    'fallbackNotify',
    'fallbackQuiet',
]);

function normalizeIgnoreFailedRemoteSub(mode) {
    if (mode === true) return 'quiet';
    if (mode === false || mode == null || mode === '') return 'disabled';
    return mode;
}

function resolveIgnoreFailedRemoteSubMode(...values) {
    for (const value of values) {
        if (value != null && value !== '') {
            return normalizeIgnoreFailedRemoteSub(value);
        }
    }

    return 'disabled';
}

function shouldNotifyIgnoreFailedRemoteSub(mode) {
    return IGNORE_FAILED_REMOTE_SUB_NOTIFY_MODES.has(
        normalizeIgnoreFailedRemoteSub(mode),
    );
}

function shouldFallbackIgnoreFailedRemoteSub(mode) {
    return IGNORE_FAILED_REMOTE_SUB_FALLBACK_MODES.has(
        normalizeIgnoreFailedRemoteSub(mode),
    );
}

function handleIgnoreFailedRemoteSubError({ mode, message, notify }) {
    const resolvedMode = normalizeIgnoreFailedRemoteSub(mode);

    if (
        resolvedMode === 'disabled' ||
        shouldFallbackIgnoreFailedRemoteSub(resolvedMode)
    ) {
        throw new Error(message);
    }

    if (shouldNotifyIgnoreFailedRemoteSub(resolvedMode)) {
        notify?.(message);
    }
}

function notifyIgnoreFailedRemoteSubFallback({ mode, notify, error }) {
    if (!shouldNotifyIgnoreFailedRemoteSub(mode)) return;
    notify?.(error);
}

function buildEmptySubscriptionOutput({
    platform = 'JSON',
    produceType,
    produceOpts = {},
}) {
    if (produceType === 'raw') {
        return JSON.stringify([]);
    }

    return ProxyUtils.produce([], platform, produceType, produceOpts);
}

export {
    buildEmptySubscriptionOutput,
    handleIgnoreFailedRemoteSubError,
    normalizeIgnoreFailedRemoteSub,
    notifyIgnoreFailedRemoteSubFallback,
    resolveIgnoreFailedRemoteSubMode,
    shouldFallbackIgnoreFailedRemoteSub,
    shouldNotifyIgnoreFailedRemoteSub,
};
