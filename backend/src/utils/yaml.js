import YAML from 'static-js-yaml';

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

export function safeLoad(content, ...args) {
    return retry(YAML.safeLoad, JSON.parse(JSON.stringify(content)), ...args);
}
export function load(content, ...args) {
    return retry(YAML.load, JSON.parse(JSON.stringify(content)), ...args);
}
export function safeDump(content, ...args) {
    return YAML.safeDump(JSON.parse(JSON.stringify(content)), ...args);
}
export function dump(content, ...args) {
    return YAML.dump(JSON.parse(JSON.stringify(content)), ...args);
}

export default {
    safeLoad,
    load,
    safeDump,
    dump,
};
