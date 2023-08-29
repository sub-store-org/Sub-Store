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
                if (!matched) throw new Error('Invalid rule type: ' + rawType);
            } catch (e) {
                console.log(`Failed to parse line: ${line}\n Reason: ${e}`);
            }
        }
        return result;
    };
    return { name, test, parse };
}

export default [AllRuleParser()];
