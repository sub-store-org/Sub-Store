import { Result } from './utils';
import Surge_Producer from './surge';

const targetPlatform = 'SurgeMac';

const surge_Producer = Surge_Producer();

export default function SurgeMac_Producer() {
    const produce = (proxy) => {
        switch (proxy.type) {
            case 'ssr':
                return shadowsocksr(proxy);
            case 'ss':
                return surge_Producer.produce(proxy);
            case 'trojan':
                return surge_Producer.produce(proxy);
            case 'vmess':
                return surge_Producer.produce(proxy);
            case 'http':
                return surge_Producer.produce(proxy);
            case 'socks5':
                return surge_Producer.produce(proxy);
            case 'snell':
                return surge_Producer.produce(proxy);
            case 'tuic':
                return surge_Producer.produce(proxy);
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}

function shadowsocksr(proxy) {
    const result = new Result(proxy);

    proxy.local_port = '__SubStoreLocalPort__';
    proxy.local_address = proxy.local_address ?? '127.0.0.1';

    result.append(
        `${proxy.name} = external, exec = "${
            proxy.exec || '/usr/local/bin/ssr-local'
        }", address = "${proxy.server}", local-port = ${proxy.local_port}`,
    );

    for (const [key, value] of Object.entries({
        cipher: '-m',
        obfs: '-o',
        password: '-k',
        port: '-p',
        protocol: '-O',
        'protocol-param': '-G',
        server: '-s',
        local_port: '-l',
        local_address: '-b',
    })) {
        result.appendIfPresent(
            `, args = "${value}", args = "${proxy[key]}"`,
            key,
        );
    }

    return result.toString();
}
