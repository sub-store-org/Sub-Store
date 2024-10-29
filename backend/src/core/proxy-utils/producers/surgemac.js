import { Base64 } from 'js-base64';
import { Result, isPresent } from './utils';
import Surge_Producer from './surge';
import ClashMeta_Producer from './clashmeta';
import { isIPv4, isIPv6 } from '@/utils';
import $ from '@/core/app';

const targetPlatform = 'SurgeMac';

const surge_Producer = Surge_Producer();

export default function SurgeMac_Producer() {
    const produce = (proxy, type, opts = {}) => {
        switch (proxy.type) {
            case 'external':
                return external(proxy);
            // case 'ssr':
            //     return shadowsocksr(proxy);
            default: {
                try {
                    return surge_Producer.produce(proxy, type, opts);
                } catch (e) {
                    if (opts.useMihomoExternal) {
                        $.log(
                            `${proxy.name} is not supported on ${targetPlatform}, try to use Mihomo(SurgeMac - External Proxy Program) instead`,
                        );
                        return mihomo(proxy, type, opts);
                    } else {
                        throw new Error(
                            `Surge for macOS 可手动指定链接参数 target=SurgeMac 或在 同步配置 中指定 SurgeMac 来启用 mihomo 支援 Surge 本身不支持的协议`,
                        );
                    }
                }
            }
        }
    };
    return { produce };
}
function external(proxy) {
    const result = new Result(proxy);
    if (!proxy.exec || !proxy['local-port']) {
        throw new Error(`${proxy.type}: exec and local-port are required`);
    }
    result.append(
        `${proxy.name}=external,exec="${proxy.exec}",local-port=${proxy['local-port']}`,
    );

    if (Array.isArray(proxy.args)) {
        proxy.args.map((args) => {
            result.append(`,args="${args}"`);
        });
    }
    if (Array.isArray(proxy.addresses)) {
        proxy.addresses.map((addresses) => {
            result.append(`,addresses=${addresses}`);
        });
    }

    result.appendIfPresent(
        `,no-error-alert=${proxy['no-error-alert']}`,
        'no-error-alert',
    );

    // tfo
    if (isPresent(proxy, 'tfo')) {
        result.append(`,tfo=${proxy['tfo']}`);
    } else if (isPresent(proxy, 'fast-open')) {
        result.append(`,tfo=${proxy['fast-open']}`);
    }

    // test-url
    result.appendIfPresent(`,test-url=${proxy['test-url']}`, 'test-url');

    // block-quic
    result.appendIfPresent(`,block-quic=${proxy['block-quic']}`, 'block-quic');

    return result.toString();
}
// eslint-disable-next-line no-unused-vars
function shadowsocksr(proxy) {
    const external_proxy = {
        ...proxy,
        type: 'external',
        exec: proxy.exec || '/usr/local/bin/ssr-local',
        'local-port': '__SubStoreLocalPort__',
        args: [],
        addresses: [],
        'local-address':
            proxy.local_address ?? proxy['local-address'] ?? '127.0.0.1',
    };

    // https://manual.nssurge.com/policy/external-proxy.html
    if (isIP(proxy.server)) {
        external_proxy.addresses.push(proxy.server);
    } else {
        $.log(
            `Platform ${targetPlatform}, proxy type ${proxy.type}: addresses should be an IP address, but got ${proxy.server}`,
        );
    }

    for (const [key, value] of Object.entries({
        cipher: '-m',
        obfs: '-o',
        'obfs-param': '-g',
        password: '-k',
        port: '-p',
        protocol: '-O',
        'protocol-param': '-G',
        server: '-s',
        'local-port': '-l',
        'local-address': '-b',
    })) {
        if (external_proxy[key] != null) {
            external_proxy.args.push(value);
            external_proxy.args.push(external_proxy[key]);
        }
    }

    return external(external_proxy);
}
// eslint-disable-next-line no-unused-vars
function mihomo(proxy, type, opts) {
    const clashProxy = ClashMeta_Producer().produce([proxy], 'internal')?.[0];
    if (clashProxy) {
        const localPort = opts?.localPort || proxy._localPort || 65535;
        const ipv6 = ['ipv4', 'v4-only'].includes(proxy['ip-version'])
            ? false
            : true;
        const external_proxy = {
            name: proxy.name,
            type: 'external',
            exec: proxy._exec || '/usr/local/bin/mihomo',
            'local-port': localPort,
            args: [
                '-config',
                Base64.encode(
                    JSON.stringify({
                        'mixed-port': localPort,
                        ipv6,
                        mode: 'global',
                        dns: {
                            enable: true,
                            ipv6,
                            nameserver: [
                                'https://223.6.6.6/dns-query',
                                'https://120.53.53.53/dns-query',
                            ],
                        },
                        proxies: [
                            {
                                ...clashProxy,
                                name: 'proxy',
                            },
                        ],
                        'proxy-groups': [
                            {
                                name: 'GLOBAL',
                                type: 'select',
                                proxies: ['proxy'],
                            },
                        ],
                    }),
                ),
            ],
            addresses: [],
        };

        // https://manual.nssurge.com/policy/external-proxy.html
        if (isIP(proxy.server)) {
            external_proxy.addresses.push(proxy.server);
        } else {
            $.log(
                `Platform ${targetPlatform}, proxy type ${proxy.type}: addresses should be an IP address, but got ${proxy.server}`,
            );
        }
        opts.localPort = localPort - 1;
        return external(external_proxy);
    }
}

function isIP(ip) {
    return isIPv4(ip) || isIPv6(ip);
}
