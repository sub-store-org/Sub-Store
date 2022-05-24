import { ApplyProcessor } from './proxy-utils';
import YAML from 'static-js-yaml';
import $ from './app';

const RULE_TYPES_MAPPING = [
    [/^(DOMAIN|host|HOST)$/, 'DOMAIN'],
    [/^(DOMAIN-KEYWORD|host-keyword|HOST-KEYWORD)$/, 'DOMAIN-KEYWORD'],
    [/^(DOMAIN-SUFFIX|host-suffix|HOST-SUFFIX)$/, 'DOMAIN-SUFFIX'],
    [/^USER-AGENT$/i, 'USER-AGENT'],
    [/^PROCESS-NAME$/, 'PROCESS-NAME'],
    [/^(DEST-PORT|DST-PORT)$/, 'DST-PORT'],
    [/^SRC-IP(-CIDR)?$/, 'SRC-IP'],
    [/^(IN|SRC)-PORT$/, 'IN-PORT'],
    [/^PROTOCOL$/, 'PROTOCOL'],
    [/^IP-CIDR$/i, 'IP-CIDR'],
    [/^(IP-CIDR6|ip6-cidr|IP6-CIDR)$/],
];

const RULE_PREPROCESSORS = (function () {
    function HTML() {
        const name = 'HTML';
        const test = (raw) => /^<!DOCTYPE html>/.test(raw);
        // simply discard HTML
        const parse = () => '';
        return { name, test, parse };
    }

    function ClashProvider() {
        const name = 'Clash Provider';
        const test = (raw) => raw.indexOf('payload:') === 0;
        const parse = (raw) => {
            return raw.replace('payload:', '').replace(/^\s*-\s*/gm, '');
        };
        return { name, test, parse };
    }

    return [HTML(), ClashProvider()];
})();
const RULE_PARSERS = (function () {
    function AllRuleParser() {
        const name = 'Universal Rule Parser';
        const test = () => true;
        const parse = (raw) => {
            const lines = raw.split('\n');
            const result = [];
            for (let line of lines) {
                line = line.trim();
                // skip empty line
                if (line.length === 0) continue;
                // skip comments
                if (/\s*#/.test(line)) continue;
                try {
                    const params = line.split(',').map((w) => w.trim());
                    let rawType = params[0];
                    let matched = false;
                    for (const item of RULE_TYPES_MAPPING) {
                        const regex = item[0];
                        if (regex.test(rawType)) {
                            matched = true;
                            const rule = {
                                type: item[1],
                                content: params[1],
                            };
                            if (
                                rule.type === 'IP-CIDR' ||
                                rule.type === 'IP-CIDR6'
                            ) {
                                rule.options = params.slice(2);
                            }
                            result.push(rule);
                        }
                    }
                    if (!matched)
                        throw new Error('Invalid rule type: ' + rawType);
                } catch (e) {
                    console.error(
                        `Failed to parse line: ${line}\n Reason: ${e}`,
                    );
                }
            }
            return result;
        };
        return { name, test, parse };
    }

    return [AllRuleParser()];
})();
const RULE_PROCESSORS = (function () {
    function RegexFilter({ regex = [], keep = true }) {
        return {
            name: 'Regex Filter',
            func: (rules) => {
                return rules.map((rule) => {
                    const selected = regex.some((r) => {
                        r = new RegExp(r);
                        return r.test(rule);
                    });
                    return keep ? selected : !selected;
                });
            },
        };
    }

    function TypeFilter(types) {
        return {
            name: 'Type Filter',
            func: (rules) => {
                return rules.map((rule) => types.some((t) => rule.type === t));
            },
        };
    }

    function RemoveDuplicateFilter() {
        return {
            name: 'Remove Duplicate Filter',
            func: (rules) => {
                const seen = new Set();
                const result = [];
                rules.forEach((rule) => {
                    const options = rule.options || [];
                    options.sort();
                    const key = `${rule.type},${rule.content},${JSON.stringify(
                        options,
                    )}`;
                    if (!seen.has(key)) {
                        result.push(rule);
                        seen.add(key);
                    }
                });
                return result;
            },
        };
    }

    // regex: [{expr: "string format regex", now: "now"}]
    function RegexReplaceOperator(regex) {
        return {
            name: 'Regex Rename Operator',
            func: (rules) => {
                return rules.map((rule) => {
                    for (const { expr, now } of regex) {
                        rule.content = rule.content
                            .replace(new RegExp(expr, 'g'), now)
                            .trim();
                    }
                    return rule;
                });
            },
        };
    }

    return {
        'Regex Filter': RegexFilter,
        'Remove Duplicate Filter': RemoveDuplicateFilter,
        'Type Filter': TypeFilter,

        'Regex Replace Operator': RegexReplaceOperator,
    };
})();
const RULE_PRODUCERS = (function () {
    function QXFilter() {
        const type = 'SINGLE';
        const func = (rule) => {
            // skip unsupported rules
            const UNSUPPORTED = [
                'URL-REGEX',
                'DEST-PORT',
                'SRC-IP',
                'IN-PORT',
                'PROTOCOL',
            ];
            if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;

            const TRANSFORM = {
                'DOMAIN-KEYWORD': 'HOST-KEYWORD',
                'DOMAIN-SUFFIX': 'HOST-SUFFIX',
                DOMAIN: 'HOST',
                'IP-CIDR6': 'IP6-CIDR',
            };

            // QX does not support the no-resolve option
            return `${TRANSFORM[rule.type] || rule.type},${
                rule.content
            },SUB-STORE`;
        };
        return { type, func };
    }

    function SurgeRuleSet() {
        const type = 'SINGLE';
        const func = (rule) => {
            let output = `${rule.type},${rule.content}`;
            if (rule.type === 'IP-CIDR' || rule.type === 'IP-CIDR6') {
                output += rule.options ? `,${rule.options[0]}` : '';
            }
            return output;
        };
        return { type, func };
    }

    function LoonRules() {
        const type = 'SINGLE';
        const func = (rule) => {
            // skip unsupported rules
            const UNSUPPORTED = ['DEST-PORT', 'SRC-IP', 'IN-PORT', 'PROTOCOL'];
            if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;
            return SurgeRuleSet().func(rule);
        };
        return { type, func };
    }

    function ClashRuleProvider() {
        const type = 'ALL';
        const func = (rules) => {
            const TRANSFORM = {
                'DEST-PORT': 'DST-PORT',
                'SRC-IP': 'SRC-IP-CIDR',
                'IN-PORT': 'SRC-PORT',
            };
            const conf = {
                payload: rules.map((rule) => {
                    let output = `${TRANSFORM[rule.type] || rule.type},${
                        rule.content
                    }`;
                    if (rule.type === 'IP-CIDR' || rule.type === 'IP-CIDR6') {
                        output += rule.options ? `,${rule.options[0]}` : '';
                    }
                    return output;
                }),
            };
            return YAML.dump(conf);
        };
        return { type, func };
    }

    return {
        QX: QXFilter(),
        Surge: SurgeRuleSet(),
        Loon: LoonRules(),
        Clash: ClashRuleProvider(),
    };
})();

export const RuleUtils = (function () {
    function preprocess(raw) {
        for (const processor of RULE_PREPROCESSORS) {
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
        for (const parser of RULE_PARSERS) {
            let matched;
            try {
                matched = parser.test(raw);
            } catch (err) {
                matched = false;
            }
            if (matched) {
                $.info(`Rule parser [${parser.name}] is activated!`);
                return parser.parse(raw);
            }
        }
    }

    async function process(rules, operators) {
        for (const item of operators) {
            if (!RULE_PROCESSORS[item.type]) {
                console.error(`Unknown operator: ${item.type}!`);
                continue;
            }
            const processor = RULE_PROCESSORS[item.type](item.args);
            $.info(
                `Applying "${item.type}" with arguments: \n >>> ${
                    JSON.stringify(item.args) || 'None'
                }`,
            );
            rules = ApplyProcessor(processor, rules);
        }
        return rules;
    }

    function produce(rules, targetPlatform) {
        const producer = RULE_PRODUCERS[targetPlatform];
        if (!producer) {
            throw new Error(
                `Target platform: ${targetPlatform} is not supported!`,
            );
        }
        if (
            typeof producer.type === 'undefined' ||
            producer.type === 'SINGLE'
        ) {
            return rules
                .map((rule) => {
                    try {
                        return producer.func(rule);
                    } catch (err) {
                        console.log(
                            `ERROR: cannot produce rule: ${JSON.stringify(
                                rule,
                            )}\nReason: ${err}`,
                        );
                        return '';
                    }
                })
                .filter((line) => line.length > 0)
                .join('\n');
        } else if (producer.type === 'ALL') {
            return producer.func(rules);
        }
    }

    return { parse, process, produce };
})();
