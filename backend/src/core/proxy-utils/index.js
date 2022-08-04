import download from '@/utils/download';

import PROXY_PROCESSORS, { ApplyProcessor } from './processors';
import PROXY_PREPROCESSORS from './preprocessors';
import PROXY_PRODUCERS from './producers';
import PROXY_PARSERS from './parsers';
import $ from '@/core/app';

function preprocess(raw) {
    for (const processor of PROXY_PREPROCESSORS) {
        try {
            if (processor.test(raw)) {
                $.info(`Pre-processor [${processor.name}] activated`);
                return processor.parse(raw);
            }
        } catch (e) {
            $.error(`Parser [${processor.name}] failed\n Reason: ${e}`);
        }
    }
    return raw;
}

function parse(raw) {
    raw = preprocess(raw);
    // parse
    const lines = raw.split('\n');
    const proxies = [];
    let lastParser;

    for (let line of lines) {
        line = line.trim();
        if (line.length === 0) continue; // skip empty line
        let success = false;

        // try to parse with last used parser
        if (lastParser) {
            const [proxy, error] = tryParse(lastParser, line);
            if (!error) {
                proxies.push(proxy);
                success = true;
            }
        }

        if (!success) {
            // search for a new parser
            for (const parser of PROXY_PARSERS) {
                const [proxy, error] = tryParse(parser, line);
                if (!error) {
                    proxies.push(proxy);
                    lastParser = parser;
                    success = true;
                    $.info(`${parser.name} is activated`);
                    break;
                }
            }
        }

        if (!success) {
            $.error(`Failed to parse line: ${line}`);
        }
    }

    return proxies;
}

async function process(proxies, operators = [], targetPlatform) {
    for (const item of operators) {
        // process script
        let script;
        const $arguments = {};
        if (item.type.indexOf('Script') !== -1) {
            const { mode, content } = item.args;
            if (mode === 'link') {
                const url = content;
                // extract link arguments
                const rawArgs = url.split('#');
                if (rawArgs.length > 1) {
                    for (const pair of rawArgs[1].split('&')) {
                        const key = pair.split('=')[0];
                        const value = pair.split('=')[1] || true;
                        $arguments[key] = value;
                    }
                }

                // if this is a remote script, download it
                try {
                    script = await download(url.split('#')[0]);
                    // $.info(`Script loaded: >>>\n ${script}`);
                } catch (err) {
                    $.error(
                        `Error when downloading remote script: ${item.args.content}.\n Reason: ${err}`,
                    );
                    // skip the script if download failed.
                    continue;
                }
            } else {
                script = content;
            }
        }

        if (!PROXY_PROCESSORS[item.type]) {
            $.error(`Unknown operator: "${item.type}"`);
            continue;
        }

        $.info(
            `Applying "${item.type}" with arguments:\n >>> ${
                JSON.stringify(item.args, null, 2) || 'None'
            }`,
        );
        let processor;
        if (item.type.indexOf('Script') !== -1) {
            processor = PROXY_PROCESSORS[item.type](
                script,
                targetPlatform,
                $arguments,
            );
        } else {
            processor = PROXY_PROCESSORS[item.type](item.args || {});
        }
        proxies = await ApplyProcessor(processor, proxies);
    }
    return proxies;
}

function produce(proxies, targetPlatform) {
    const producer = PROXY_PRODUCERS[targetPlatform];
    if (!producer) {
        throw new Error(`Target platform: ${targetPlatform} is not supported!`);
    }

    // filter unsupported proxies
    proxies = proxies.filter(
        (proxy) =>
            !(proxy.supported && proxy.supported[targetPlatform] === false),
    );

    $.info(`Producing proxies for target: ${targetPlatform}`);
    if (typeof producer.type === 'undefined' || producer.type === 'SINGLE') {
        return proxies
            .map((proxy) => {
                try {
                    return producer.produce(proxy);
                } catch (err) {
                    $.error(
                        `Cannot produce proxy: ${JSON.stringify(
                            proxy,
                            null,
                            2,
                        )}\nReason: ${err}`,
                    );
                    return '';
                }
            })
            .filter((line) => line.length > 0)
            .join('\n');
    } else if (producer.type === 'ALL') {
        return producer.produce(proxies);
    }
}

export const ProxyUtils = {
    parse,
    process,
    produce,
};

function tryParse(parser, line) {
    if (!safeMatch(parser, line)) return [null, new Error('Parser mismatch')];
    try {
        const proxy = parser.parse(line);
        return [proxy, null];
    } catch (err) {
        return [null, err];
    }
}

function safeMatch(parser, line) {
    try {
        return parser.test(line);
    } catch (err) {
        return false;
    }
}
