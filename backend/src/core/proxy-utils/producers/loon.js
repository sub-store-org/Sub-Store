/* eslint-disable no-case-declarations */
const targetPlatform = 'Loon';
import { isPresent, Result } from './utils';

export default function Loon_Producer() {
    const produce = (proxy) => {
        switch (proxy.type) {
            case 'ss':
                return shadowsocks(proxy);
            case 'ssr':
                return shadowsocksr(proxy);
            case 'trojan':
                return trojan(proxy);
            case 'vmess':
                return vmess(proxy);
            case 'vless':
                return vless(proxy);
            case 'http':
                return http(proxy);
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}

function shadowsocks(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"`,
    );

    // obfs
    if (isPresent(proxy, 'plugin')) {
        if (proxy.plugin === 'obfs') {
            result.append(`,obfs-name=${proxy['plugin-opts'].mode}`);
            result.appendIfPresent(
                `,obfs-host=${proxy['plugin-opts'].host}`,
                'plugin-opts.host',
            );
            result.appendIfPresent(
                `,obfs-uri=${proxy['plugin-opts'].path}`,
                'plugin-opts.path',
            );
        } else {
            throw new Error(`plugin ${proxy.plugin} is not supported`);
        }
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');

    return result.toString();
}

function shadowsocksr(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=shadowsocksr,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"`,
    );

    // ssr protocol
    result.append(`,protocol=${proxy.protocol}`);
    result.appendIfPresent(
        `,protocol-param=${proxy['protocol-param']}`,
        'protocol-param',
    );

    // obfs
    result.appendIfPresent(`,obfs=${proxy.obfs}`, 'obfs');
    result.appendIfPresent(`,obfs-param=${proxy['obfs-param']}`, 'obfs-param');

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');

    return result.toString();
}

function trojan(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=trojan,${proxy.server},${proxy.port},"${proxy.password}"`,
    );

    // transport
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,transport=ws`);
            result.appendIfPresent(
                `,path=${proxy['ws-opts'].path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['ws-opts'].headers.Host}`,
                'ws-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');

    return result.toString();
}

function vmess(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=vmess,${proxy.server},${proxy.port},${
            proxy.cipher === 'auto' ? 'none' : proxy.cipher
        },"${proxy.uuid}"`,
    );

    // transport
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,transport=ws`);
            result.appendIfPresent(
                `,path=${proxy['ws-opts'].path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['ws-opts'].headers.Host}`,
                'ws-opts.headers.Host',
            );
        } else if (proxy.network === 'http') {
            result.append(`,transport=http`);
            result.appendIfPresent(
                `,path=${proxy['http-opts'].path}`,
                'http-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['http-opts'].headers.Host}`,
                'http-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    } else {
        result.append(`,transport=tcp`);
    }

    // tls
    result.appendIfPresent(`,over-tls=${proxy.tls}`, 'tls');

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');

    // AEAD
    if (isPresent(proxy, 'aead')) {
        result.append(`,alterId=0`);
    } else {
        result.append(`,alterId=${proxy.alterId}`);
    }

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');
    return result.toString();
}

function vless(proxy) {
    const result = new Result(proxy);
    result.append(
        `${proxy.name}=vless,${proxy.server},${proxy.port},"${proxy.uuid}"`,
    );

    // transport
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            result.append(`,transport=ws`);
            result.appendIfPresent(
                `,path=${proxy['ws-opts'].path}`,
                'ws-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['ws-opts'].headers.Host}`,
                'ws-opts.headers.Host',
            );
        } else if (proxy.network === 'http') {
            result.append(`,transport=http`);
            result.appendIfPresent(
                `,path=${proxy['http-opts'].path}`,
                'http-opts.path',
            );
            result.appendIfPresent(
                `,host=${proxy['http-opts'].headers.Host}`,
                'http-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    } else {
        result.append(`,transport=tcp`);
    }

    // tls
    result.appendIfPresent(`,over-tls=${proxy.tls}`, 'tls');

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // sni
    result.appendIfPresent(`,tls-name=${proxy.sni}`, 'sni');

    // tfo
    result.appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp=${proxy.udp}`, 'udp');
    return result.toString();
}

function http(proxy) {
    const result = new Result(proxy);
    const type = proxy.tls ? 'https' : 'http';
    result.append(`${proxy.name}=${type},${proxy.server},${proxy.port}`);
    result.appendIfPresent(`,${proxy.username}`, 'username');
    result.appendIfPresent(`,"${proxy.password}"`, 'password');

    // sni
    result.appendIfPresent(`,sni=${proxy.sni}`, 'sni');

    // tls verification
    result.appendIfPresent(
        `,skip-cert-verify=${proxy['skip-cert-verify']}`,
        'skip-cert-verify',
    );

    // tfo
    result.appendIfPresent(`,tfo=${proxy.tfo}`, 'tfo');

    // udp
    result.appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');
    return result.toString();
}
