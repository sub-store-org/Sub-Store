import RULE_PREPROCESSORS from './preprocessors';
import RULE_PRODUCERS from './producers';
import RULE_PARSERS from './parsers';
import $ from '@/core/app';

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

    return { parse, produce };
})();
