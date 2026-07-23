import _ from 'lodash';
import YAML from '@/utils/yaml';
import { isIPv4, isIPv6, isNotBlank } from '@/utils';
import { normalizeClashYaml } from '@/core/proxy-utils/preprocessors';

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

export function normalizePluginMuxBooleanValue(mux) {
    return Boolean(normalizePluginMuxValue(mux));
}

export function supportsShadowsocksV2rayPluginMode(proxy, supportedModes) {
    if (proxy?.type !== 'ss' || proxy?.plugin !== 'v2ray-plugin') return true;

    const normalizedMode =
        typeof proxy?.['plugin-opts']?.mode === 'string'
            ? proxy['plugin-opts'].mode.trim().toLowerCase()
            : proxy?.['plugin-opts']?.mode;

    return supportedModes.includes(normalizedMode);
}

function restoreShadowTLSOpts(target, serverNameKey) {
    if (target?.plugin !== 'shadow-tls' || !target['plugin-opts']) {
        return undefined;
    }

    const opts = target['plugin-opts'];
    const enabled =
        Boolean(opts.password) ||
        (opts.version != null && Number(opts.version) !== 0);
    target['shadow-tls-opts'] = {
        password: opts.password,
        version: opts.version,
    };
    if (opts.host != null) target[serverNameKey] = opts.host;
    if (opts.alpn != null) target.alpn = opts.alpn;
    delete target.plugin;
    delete target['plugin-opts'];
    return enabled;
}

export function restoreShadowTLSProxyOpts(proxy) {
    if (['vmess', 'vless', 'trojan', 'anytls'].includes(proxy.type)) {
        const restored = restoreShadowTLSOpts(proxy, 'sni');
        if (restored && ['vmess', 'vless'].includes(proxy.type)) {
            proxy.tls = true;
        }
    }

    if (proxy.type === 'vless' && proxy.network === 'xhttp') {
        const downloadSettings = proxy['xhttp-opts']?.['download-settings'];
        if (restoreShadowTLSOpts(downloadSettings, 'servername')) {
            downloadSettings.tls = true;
        }
    }
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
    return `${parsed.address}/${
        normalizedCIDR ?? parsed.cidr ?? config.defaultCIDR
    }`;
}

const DEFAULT_CLASH_PROXY_GROUP = '节点选择';
const DEFAULT_CLASH_AUTO_GROUP = '自动选择';
const DEFAULT_CLASH_FALLBACK_GROUP = '故障转移';

function wantsProxyListFragment(opts = {}) {
    return Boolean(
        opts.fragment ||
            opts['proxy-provider'] ||
            opts.proxyProvider ||
            opts.proxiesOnly ||
            opts['proxies-only'],
    );
}

function getProxyNames(list = []) {
    return list.map((proxy) => proxy.name).filter((name) => isNotBlank(name));
}

function produceClashProxyListOutput(list) {
    return normalizeClashYaml(
        YAML.safeDump(
            {
                proxies: list,
            },
            {
                lineWidth: -1,
            },
        ),
    );
}

export function produceClashProfileOutput(list, opts = {}) {
    const proxyGroup = opts['proxy-group'] || opts.proxyGroup || DEFAULT_CLASH_PROXY_GROUP;
    const autoGroup = opts['auto-group'] || opts.autoGroup || DEFAULT_CLASH_AUTO_GROUP;
    const fallbackGroup =
        opts['fallback-group'] || opts.fallbackGroup || DEFAULT_CLASH_FALLBACK_GROUP;
    const testUrl = opts['test-url'] || opts.testUrl || 'http://www.gstatic.com/generate_204';
    const proxyNames = getProxyNames(list);
    const selectable = [autoGroup, fallbackGroup, ...proxyNames];
    const fullConfig = {
        'mixed-port': Number(opts['mixed-port'] || opts.mixedPort) || 7890,
        'allow-lan': opts['allow-lan'] ?? opts.allowLan ?? true,
        'bind-address': opts['bind-address'] || opts.bindAddress || '*',
        mode: opts.mode || 'rule',
        'log-level': opts['log-level'] || opts.logLevel || 'info',
        'external-controller':
            opts['external-controller'] || opts.externalController || '127.0.0.1:9090',
        dns: {
            enable: true,
            ipv6: false,
            'default-nameserver': ['223.5.5.5', '119.29.29.29', '114.114.114.114'],
            'enhanced-mode': 'fake-ip',
            'fake-ip-range': '198.18.0.1/16',
            'use-hosts': true,
            'respect-rules': true,
            'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29', '114.114.114.114'],
            nameserver: ['223.5.5.5', '119.29.29.29', '114.114.114.114'],
            fallback: ['1.1.1.1', '8.8.8.8'],
            'fallback-filter': {
                geoip: true,
                'geoip-code': 'CN',
                geosite: ['gfw'],
                ipcidr: ['240.0.0.0/4'],
                domain: ['+.google.com', '+.facebook.com', '+.youtube.com'],
            },
        },
        proxies: list,
        'proxy-groups': [
            {
                name: proxyGroup,
                type: 'select',
                proxies: selectable,
            },
            {
                name: autoGroup,
                type: 'url-test',
                proxies: proxyNames,
                url: testUrl,
                interval: Number(opts['test-interval'] || opts.testInterval) || 600,
            },
            {
                name: fallbackGroup,
                type: 'fallback',
                proxies: proxyNames,
                url: testUrl,
                interval: Number(opts['fallback-interval'] || opts.fallbackInterval) || 600,
            },
        ],
        rules: [
            'DOMAIN-KEYWORD,adservice,REJECT',
            'DOMAIN-SUFFIX,doubleclick.net,REJECT',
            'IP-CIDR,127.0.0.0/8,DIRECT',
            'IP-CIDR,10.0.0.0/8,DIRECT',
            'IP-CIDR,172.16.0.0/12,DIRECT',
            'IP-CIDR,192.168.0.0/16,DIRECT',
            'IP-CIDR,100.64.0.0/10,DIRECT',
            'DOMAIN-SUFFIX,cn,DIRECT',
            'GEOIP,CN,DIRECT',
            `MATCH,${proxyGroup}`,
        ],
    };

    if (proxyNames.length === 0) {
        fullConfig['proxy-groups'][0].proxies = ['DIRECT'];
        fullConfig['proxy-groups'][1].proxies = ['DIRECT'];
        fullConfig['proxy-groups'][2].proxies = ['DIRECT'];
    }

    return normalizeClashYaml(YAML.safeDump(fullConfig, { lineWidth: -1 }));
}

export function produceProxyListOutput(list, type, opts = {}) {
    if (type === 'internal') return list;

    if (wantsProxyListFragment(opts) || !opts._clashProfile) {
        return produceClashProxyListOutput(list);
    }

    return produceClashProfileOutput(list, opts);
}
