import YAML from '@/utils/yaml';

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
            'GEOSITE',
            'GEOIP',
        ];
        if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;

        const TRANSFORM = {
            'DOMAIN-KEYWORD': 'HOST-KEYWORD',
            'DOMAIN-SUFFIX': 'HOST-SUFFIX',
            DOMAIN: 'HOST',
            'IP-CIDR6': 'IP6-CIDR',
        };

        // QX does not support the no-resolve option
        return `${TRANSFORM[rule.type] || rule.type},${rule.content},SUB-STORE`;
    };
    return { type, func };
}

function SurgeRuleSet() {
    const type = 'SINGLE';
    const func = (rule) => {
        const UNSUPPORTED = ['GEOSITE', 'GEOIP'];
        if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;
        let output = `${rule.type},${rule.content}`;
        if (['IP-CIDR', 'IP-CIDR6'].includes(rule.type)) {
            output +=
                rule.options?.length > 0 ? `,${rule.options.join(',')}` : '';
        }
        return output;
    };
    return { type, func };
}

function LoonRules() {
    const type = 'SINGLE';
    const func = (rule) => {
        // skip unsupported rules
        const UNSUPPORTED = ['SRC-IP', 'GEOSITE', 'GEOIP'];
        if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;
        if (['IP-CIDR', 'IP-CIDR6'].includes(rule.type) && rule.options) {
            // Loon only supports the no-resolve option
            rule.options = rule.options.filter((option) =>
                ['no-resolve'].includes(option),
            );
        }
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
                if (['IP-CIDR', 'IP-CIDR6', 'GEOIP'].includes(rule.type)) {
                    if (rule.options) {
                        // Clash only supports the no-resolve option
                        rule.options = rule.options.filter((option) =>
                            ['no-resolve'].includes(option),
                        );
                    }
                    output +=
                        rule.options?.length > 0
                            ? `,${rule.options.join(',')}`
                            : '';
                }
                return output;
            }),
        };
        return YAML.dump(conf);
    };
    return { type, func };
}

export default {
    QX: QXFilter(),
    Surge: SurgeRuleSet(),
    Loon: LoonRules(),
    Clash: ClashRuleProvider(),
};
