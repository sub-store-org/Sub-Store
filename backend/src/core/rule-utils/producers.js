import YAML from 'static-js-yaml';

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
        return `${TRANSFORM[rule.type] || rule.type},${rule.content},SUB-STORE`;
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

export default {
    QX: QXFilter(),
    Surge: SurgeRuleSet(),
    Loon: LoonRules(),
    Clash: ClashRuleProvider(),
};
