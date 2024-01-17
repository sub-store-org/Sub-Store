import { Result } from './utils';
import Surge_Producer from './surge';
import { isIPv4, isIPv6, isPresent } from '@/utils';
import $ from '@/core/app';

const targetPlatform = 'SurgeMac';

const surge_Producer = Surge_Producer();

export default function SurgeMac_Producer() {
    const produce = (proxy) => {
        switch (proxy.type) {
            case 'external':
                return external(proxy);
            case 'ssr':
                return shadowsocksr(proxy);
            default:
                return surge_Producer.produce(proxy);
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
        password: '-k',
        port: '-p',
        protocol: '-O',
        'protocol-param': '-G',
        server: '-s',
        'local-port': '-l',
        'local-address': '-b',
    })) {
        external_proxy.args.push(value);
        external_proxy.args.push(external_proxy[key]);
    }

    return external(external_proxy);
}

function isIP(ip) {
    return isIPv4(ip) || isIPv6(ip);
}
