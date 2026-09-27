import { isNotBlank, isPlainObject } from '@/utils';

export const ECH_DNS_FIELD = '_dns';
export const ECH_FORCE_QUERY_FIELD = '_force-query';
export const ECH_SOCKOPT_FIELD = '_sockopt';
export const DEFAULT_XRAY_ECH_DNS = 'https://dns.alidns.com/dns-query';

export function parseXrayEchConfigList(echConfigList) {
    if (!isNotBlank(echConfigList)) {
        return undefined;
    }

    if (!echConfigList.includes('://')) {
        return {
            type: 'config',
            config: echConfigList,
        };
    }

    const parts = echConfigList.split('+');
    if (parts.length === 1 && isNotBlank(parts[0])) {
        return {
            type: 'dns',
            dns: parts[0],
        };
    }

    if (parts.length === 2 && isNotBlank(parts[0]) && isNotBlank(parts[1])) {
        return {
            type: 'dns',
            queryServerName: parts[0],
            dns: parts[1],
        };
    }

    return undefined;
}

export function isSupportedXrayEchConfigList(echConfigList) {
    return parseXrayEchConfigList(echConfigList) != null;
}

export function isSupportedXrayEchForceQuery(forceQuery) {
    return ['none', 'half', 'full'].includes(forceQuery);
}

function isMihomoEchEnabled(value) {
    // Match mihomo's current `ech-opts.enable` handling:
    // - adapter/parser.go decodes proxies with WeaklyTypedInput=true.
    // - common/structure/structure.go decodeBool accepts bool directly and
    //   converts int/uint to `value != 0`, but does not convert strings.
    // - adapter/outbound/ech.go then gates ECH with `if !o.Enable`.
    if (typeof value === 'boolean') {
        return value;
    }

    return typeof value === 'number' && Number.isInteger(value) && value !== 0;
}

export function buildMihomoEchOptsFromXrayFields({
    echConfigList,
    echForceQuery,
    echSockopt,
} = {}) {
    const parsedEchConfigList = parseXrayEchConfigList(echConfigList);
    if (!parsedEchConfigList) {
        return undefined;
    }

    const echOpts = {
        enable: true,
    };
    if (parsedEchConfigList.type === 'config') {
        echOpts.config = parsedEchConfigList.config;
    } else {
        echOpts[ECH_DNS_FIELD] = parsedEchConfigList.dns;
        if (parsedEchConfigList.queryServerName) {
            echOpts['query-server-name'] = parsedEchConfigList.queryServerName;
        }
    }

    if (isSupportedXrayEchForceQuery(echForceQuery)) {
        echOpts[ECH_FORCE_QUERY_FIELD] = echForceQuery;
    }

    if (isPlainObject(echSockopt)) {
        echOpts[ECH_SOCKOPT_FIELD] = echSockopt;
    }

    return echOpts;
}

export function buildXrayEchFieldsFromMihomo(
    echOpts,
    fallbackEchConfigList,
    { dnsFieldPath = 'ech-opts._dns', warnDefaultDns } = {},
) {
    const fields = {};

    if (isPlainObject(echOpts)) {
        if (!isMihomoEchEnabled(echOpts.enable)) {
            return fields;
        }

        const queryServerName = echOpts['query-server-name'];
        if (isNotBlank(echOpts.config)) {
            fields.echConfigList = echOpts.config;
        } else if (isNotBlank(echOpts[ECH_DNS_FIELD])) {
            fields.echConfigList = isNotBlank(queryServerName)
                ? `${queryServerName}+${echOpts[ECH_DNS_FIELD]}`
                : echOpts[ECH_DNS_FIELD];
        } else if (isNotBlank(queryServerName)) {
            fields.echConfigList = `${queryServerName}+${DEFAULT_XRAY_ECH_DNS}`;
            warnDefaultDns?.({
                defaultDns: DEFAULT_XRAY_ECH_DNS,
                dnsFieldPath,
                queryServerName,
            });
        }

        if (
            fields.echConfigList &&
            isSupportedXrayEchForceQuery(echOpts[ECH_FORCE_QUERY_FIELD])
        ) {
            fields.echForceQuery = echOpts[ECH_FORCE_QUERY_FIELD];
        }

        if (fields.echConfigList && isPlainObject(echOpts[ECH_SOCKOPT_FIELD])) {
            fields.echSockopt = echOpts[ECH_SOCKOPT_FIELD];
        }

        return fields;
    }

    if (isNotBlank(fallbackEchConfigList)) {
        fields.echConfigList = fallbackEchConfigList;
    }

    return fields;
}

export function buildXrayEchConfigListFromMihomo(
    echOpts,
    fallbackEchConfigList,
    options,
) {
    return buildXrayEchFieldsFromMihomo(echOpts, fallbackEchConfigList, options)
        .echConfigList;
}
