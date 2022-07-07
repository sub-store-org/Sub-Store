import { safeLoad } from 'static-js-yaml';
import { Base64 } from 'js-base64';

function HTML() {
    const name = 'HTML';
    const test = (raw) => /^<!DOCTYPE html>/.test(raw);
    // simply discard HTML
    const parse = () => '';
    return { name, test, parse };
}

function Base64Encoded() {
    const name = 'Base64 Pre-processor';

    const keys = [
        'dm1lc3M',
        'c3NyOi8v',
        'dHJvamFu',
        'c3M6Ly',
        'c3NkOi8v',
        'c2hhZG93',
        'aHR0c',
    ];

    const test = function (raw) {
        return keys.some((k) => raw.indexOf(k) !== -1);
    };
    const parse = function (raw) {
        raw = Base64.decode(raw);
        return raw;
    };
    return { name, test, parse };
}

function Clash() {
    const name = 'Clash Pre-processor';
    const test = function (raw) {
        return /proxies/.test(raw);
    };
    const parse = function (raw) {
        // Clash YAML format
        const proxies = safeLoad(raw).proxies;
        return proxies.map((p) => JSON.stringify(p)).join('\n');
    };
    return { name, test, parse };
}

function SSD() {
    const name = 'SSD Pre-processor';
    const test = function (raw) {
        return raw.indexOf('ssd://') === 0;
    };
    const parse = function (raw) {
        // preprocessing for SSD subscription format
        const output = [];
        let ssdinfo = JSON.parse(Base64.decode(raw.split('ssd://')[1]));
        let port = ssdinfo.port;
        let method = ssdinfo.encryption;
        let password = ssdinfo.password;
        // servers config
        let servers = ssdinfo.servers;
        for (let i = 0; i < servers.length; i++) {
            let server = servers[i];
            method = server.encryption ? server.encryption : method;
            password = server.password ? server.password : password;
            let userinfo = Base64.encode(method + ':' + password);
            let hostname = server.server;
            port = server.port ? server.port : port;
            let tag = server.remarks ? server.remarks : i;
            let plugin = server.plugin_options
                ? '/?plugin=' +
                  encodeURIComponent(
                      server.plugin + ';' + server.plugin_options,
                  )
                : '';
            output[i] =
                'ss://' +
                userinfo +
                '@' +
                hostname +
                ':' +
                port +
                plugin +
                '#' +
                tag;
        }
        return output.join('\n');
    };
    return { name, test, parse };
}

function FullConfig() {
    const name = 'Full Config Preprocessor';
    const test = function (raw) {
        return /^(\[server_local\]|\[Proxy\])/gm.test(raw);
    };
    const parse = function (raw) {
        const regex = /^\[server_local]|\[Proxy]/gm;
        const match = regex.exec(raw);
        const results = [];

        let first = true;
        if (match) {
            raw = raw.substring(match.index);
            for (const line of raw.split('\n')) {
                if (!first && !line.test(/^\s*\[/)) {
                    results.push(line);
                }
                // skip the first line
                first = false;
            }
            return results.join('\n');
        }
    };
    return { name, test, parse };
}

export default [HTML(), Base64Encoded(), Clash(), SSD(), FullConfig()];
