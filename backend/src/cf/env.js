let currentCFEnv = null;
let currentCFCtx = null;

export function setCFContext(env, ctx) {
    currentCFEnv = env || null;
    currentCFCtx = ctx || null;
}

export function clearCFContext() {
    currentCFEnv = null;
    currentCFCtx = null;
}

export function getCFEnv() {
    return currentCFEnv || {};
}

export function getCFEnvVar(name) {
    if (!currentCFEnv || typeof currentCFEnv !== 'object') return undefined;
    const value = currentCFEnv[name];
    return value === undefined || value === null ? undefined : String(value);
}

export function waitUntilCF(promise) {
    if (currentCFCtx && typeof currentCFCtx.waitUntil === 'function') {
        currentCFCtx.waitUntil(Promise.resolve(promise));
        return true;
    }
    return false;
}
