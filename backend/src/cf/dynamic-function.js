import Sval from 'sval';

const STANDARD_GLOBALS = [
    'Object',
    'Array',
    'String',
    'Number',
    'Boolean',
    'RegExp',
    'Date',
    'Math',
    'JSON',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Promise',
    'Symbol',
    'BigInt',
    'Proxy',
    'Reflect',
    'Error',
    'TypeError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'URIError',
    'EvalError',
    'ArrayBuffer',
    'SharedArrayBuffer',
    'DataView',
    'Int8Array',
    'Uint8Array',
    'Uint8ClampedArray',
    'Int16Array',
    'Uint16Array',
    'Int32Array',
    'Uint32Array',
    'Float32Array',
    'Float64Array',
    'URL',
    'URLSearchParams',
    'TextEncoder',
    'TextDecoder',
    'Headers',
    'Request',
    'Response',
    'AbortController',
    'AbortSignal',
    'Intl',
    'console',
    'crypto',
    'fetch',
    'atob',
    'btoa',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'queueMicrotask',
    'structuredClone',
    'encodeURIComponent',
    'decodeURIComponent',
    'encodeURI',
    'decodeURI',
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'NaN',
    'Infinity',
    'undefined',
];

function collectRuntimeGlobals() {
    const scope = {};
    const root = typeof globalThis !== 'undefined' ? globalThis : {};
    for (const key of STANDARD_GLOBALS) {
        if (key in root) {
            scope[key] = root[key];
        }
    }
    return scope;
}

export function createDynamicFunctionFromBody(paramNames, body, paramValues) {
    const interpreter = new Sval({
        ecmaVer: 'latest',
        sandBox: true,
    });

    const scope = collectRuntimeGlobals();
    for (let i = 0; i < paramNames.length; i++) {
        scope[paramNames[i]] = paramValues[i];
    }
    interpreter.import(scope);

    interpreter.run(
        `exports.__subStoreDynamicResult = (function() {\n${body}\n})();`,
    );
    return interpreter.exports.__subStoreDynamicResult;
}

export function getOptionalRequire() {
    return undefined;
}
