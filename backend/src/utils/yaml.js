import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const DEFAULT_PARSE_OPTIONS = {
    logLevel: 'error',
    merge: true,
};

function retry(fn, content, ...args) {
    try {
        return fn(content, ...args);
    } catch (e) {
        return fn(
            dump(
                fn(
                    content.replace(/!<str>\s*/g, '__SubStoreJSYAMLString__'),
                    ...args,
                ),
            ).replace(/__SubStoreJSYAMLString__/g, ''),
            ...args,
        );
    }
}

function toSerializable(content) {
    return JSON.parse(JSON.stringify(content));
}

function normalizeParseOptions(options) {
    return {
        ...DEFAULT_PARSE_OPTIONS,
        ...(options || {}),
    };
}

function normalizeStringifyOptions(options = {}) {
    const {
        forceQuotes,
        lineWidth,
        noArrayIndent,
        noRefs,
        quotingType,
        sortKeys,
        ...rest
    } = options || {};
    const normalized = { ...rest };

    if (typeof lineWidth === 'number') {
        normalized.lineWidth = lineWidth <= 0 ? 0 : lineWidth;
    }
    if (typeof noArrayIndent === 'boolean') {
        normalized.indentSeq = !noArrayIndent;
    }
    if (typeof noRefs === 'boolean') {
        normalized.aliasDuplicateObjects = !noRefs;
    }
    if (typeof sortKeys !== 'undefined') {
        normalized.sortMapEntries = sortKeys;
    }
    if (quotingType === "'") {
        normalized.singleQuote = true;
    } else if (quotingType === '"') {
        normalized.singleQuote = false;
    }
    if (forceQuotes) {
        normalized.defaultStringType =
            quotingType === "'" ? 'QUOTE_SINGLE' : 'QUOTE_DOUBLE';
    }

    return normalized;
}

function parse(content, options) {
    return parseYaml(content, normalizeParseOptions(options));
}

function stringify(content, options) {
    return stringifyYaml(content, normalizeStringifyOptions(options));
}

export function safeLoad(content, ...args) {
    return retry(parse, toSerializable(content), ...args);
}
export function load(content, ...args) {
    return retry(parse, toSerializable(content), ...args);
}
export function safeDump(content, ...args) {
    return stringify(toSerializable(content), ...args);
}
export function dump(content, ...args) {
    return stringify(toSerializable(content), ...args);
}

export default {
    safeLoad,
    load,
    safeDump,
    dump,
    parse: safeLoad,
    stringify: safeDump,
};
