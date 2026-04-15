import _ from 'lodash';
import YAML from '@/utils/yaml';
import { isIPv4, isIPv6 } from '@/utils';

export class Result {
    constructor(proxy) {
        this.proxy = proxy;
        this.output = [];
    }

    append(data) {
        if (typeof data === 'undefined') {
            throw new Error('required field is missing');
        }
        this.output.push(data);
    }

    appendIfPresent(data, attr) {
        if (isPresent(this.proxy, attr)) {
            this.append(data);
        }
    }

    toString() {
        return this.output.join('');
    }
}

export function isPresent(obj, attr) {
    const data = _.get(obj, attr);
    return typeof data !== 'undefined' && data !== null;
}

export function isShadowsocksOverTls(proxy) {
    const normalizedNetwork =
        typeof proxy?.network === 'string'
            ? proxy.network.trim().toLowerCase()
            : proxy?.network;
    return (
        proxy?.type === 'ss' &&
        proxy?.tls === true &&
        !isPresent(proxy, 'plugin') &&
        (!isPresent(proxy, 'network') || normalizedNetwork === 'tcp')
    );
}

export function normalizePluginMuxValue(mux) {
    if (typeof mux === 'boolean') return Number(mux);
    if (typeof mux === 'string') {
        const normalized = mux.trim().toLowerCase();
        if (normalized === 'true') return 1;
        if (normalized === 'false') return 0;
        if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);
    }
    return mux;
}

export function supportsShadowsocksV2rayPluginMode(proxy, supportedModes) {
    if (proxy?.type !== 'ss' || proxy?.plugin !== 'v2ray-plugin') return true;

    const normalizedMode =
        typeof proxy?.['plugin-opts']?.mode === 'string'
            ? proxy['plugin-opts'].mode.trim().toLowerCase()
            : proxy?.['plugin-opts']?.mode;

    return supportedModes.includes(normalizedMode);
}

function parseWireGuardCIDR(cidr, max) {
    if (cidr == null) return undefined;
    const normalized = `${cidr}`.trim();
    if (!/^\d+$/.test(normalized)) return undefined;
    const parsed = parseInt(normalized, 10);
    if (parsed < 0 || parsed > max) return undefined;
    return parsed;
}

function parseWireGuardInterfaceAddress(value, family) {
    if (value == null) return null;
    const raw = `${value}`.trim();
    if (!raw) return null;
    const [, hostRaw = raw, cidrRaw] = /^(.*?)(?:\/(\d+))?$/.exec(raw) || [];
    const host = `${hostRaw}`.trim().replace(/^\[/, '').replace(/\]$/, '');
    const isIPv4Family = family === 'ipv4';
    const isValid = isIPv4Family ? isIPv4(host) : isIPv6(host);
    if (!isValid) return null;
    const max = isIPv4Family ? 32 : 128;
    return {
        address: host,
        cidr: parseWireGuardCIDR(cidrRaw, max),
    };
}

function normalizeWireGuardInterfaceAddress(proxy, config) {
    const { addressKey, cidrKey, family, defaultCIDR } = config;
    const parsed = parseWireGuardInterfaceAddress(proxy[addressKey], family);
    if (!parsed) {
        if (
            proxy[addressKey] == null ||
            `${proxy[addressKey]}`.trim().length === 0
        ) {
            delete proxy[cidrKey];
        }
        return;
    }
    proxy[addressKey] = parsed.address;
    const normalizedCIDR = parseWireGuardCIDR(proxy[cidrKey], defaultCIDR);
    proxy[cidrKey] = normalizedCIDR ?? parsed.cidr ?? defaultCIDR;
}

export function normalizeWireGuardInterface(proxy = {}) {
    normalizeWireGuardInterfaceAddress(proxy, {
        addressKey: 'ip',
        cidrKey: 'ip-cidr',
        family: 'ipv4',
        defaultCIDR: 32,
    });
    normalizeWireGuardInterfaceAddress(proxy, {
        addressKey: 'ipv6',
        cidrKey: 'ipv6-cidr',
        family: 'ipv6',
        defaultCIDR: 128,
    });
    return proxy;
}

export function getWireGuardAddressWithCIDR(proxy = {}, family = 'ipv4') {
    const config =
        family === 'ipv6'
            ? { addressKey: 'ipv6', cidrKey: 'ipv6-cidr', defaultCIDR: 128 }
            : { addressKey: 'ip', cidrKey: 'ip-cidr', defaultCIDR: 32 };
    const parsed = parseWireGuardInterfaceAddress(
        proxy[config.addressKey],
        family,
    );
    if (!parsed) return undefined;
    const normalizedCIDR = parseWireGuardCIDR(
        proxy[config.cidrKey],
        config.defaultCIDR,
    );
    return `${parsed.address}/${normalizedCIDR ?? parsed.cidr ?? config.defaultCIDR}`;
}

export function produceProxyListOutput(list, type, opts = {}) {
    if (type === 'internal') return list;

    if (
        opts.prettyYaml ||
        opts['pretty-yaml']
    ) {
        return YAML.safeDump(
            {
                proxies: list,
            },
            {
                lineWidth: -1,
            },
        );
    }

    return 'proxies:\n' +
        list.map((proxy) => '  - ' + JSON.stringify(proxy) + '\n').join('');
}
