import YAML from 'static-js-yaml';

function retry(fn, content, ...args) {
    try {
        return fn(content, ...args);
    } catch (e) {
        return fn(content.replace(/!<str>/g, ''), ...args);
    }
}

export function safeLoad(content, ...args) {
    return retry(YAML.safeLoad, content, ...args);
}
export function load(content, ...args) {
    return retry(YAML.load, content, ...args);
}
export function safeDump(...args) {
    return YAML.safeDump(...args);
}
export function dump(...args) {
    return YAML.dump(...args);
}

export default {
    safeLoad,
    load,
    safeDump,
    dump,
};
