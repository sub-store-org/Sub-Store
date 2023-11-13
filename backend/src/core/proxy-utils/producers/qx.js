import { isPresent, Result } from './utils';

const targetPlatform = 'QX';

export default function QX_Producer() {
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
            case 'http':
                return http(proxy);
            case 'socks5':
                return socks5(proxy);
        }
        throw new Error(
            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`,
        );
    };
    return { produce };
}

function shadowsocks(proxy) {
    const result = new Result(proxy);
    const append = result.append.bind(result);
    const appendIfPresent = result.appendIfPresent.bind(result);

    append(`shadowsocks=${proxy.server}:${proxy.port}`);
    append(`,method=${proxy.cipher}`);
    append(`,password=${proxy.password}`);

    // obfs
    if (needTls(proxy)) {
        proxy.tls = true;
    }
    if (isPresent(proxy, 'plugin')) {
        if (proxy.plugin === 'obfs') {
            const opts = proxy['plugin-opts'];
            append(`,obfs=${opts.mode}`);
        } else if (
            proxy.plugin === 'v2ray-plugin' &&
            proxy['plugin-opts'].mode === 'websocket'
        ) {
            const opts = proxy['plugin-opts'];
            if (opts.tls) append(`,obfs=wss`);
            else append(`,obfs=ws`);
        } else {
            throw new Error(`plugin is not supported`);
        }
        appendIfPresent(
            `,obfs-host=${proxy['plugin-opts'].host}`,
            'plugin-opts.host',
        );
        appendIfPresent(
            `,obfs-uri=${proxy['plugin-opts'].path}`,
            'plugin-opts.path',
        );
    }

    if (needTls(proxy)) {
        appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
        appendIfPresent(`,tls-alpn=${proxy['tls-alpn']}`, 'tls-alpn');
        appendIfPresent(
            `,tls-no-session-ticket=${proxy['tls-no-session-ticket']}`,
            'tls-no-session-ticket',
        );
        appendIfPresent(
            `,tls-no-session-reuse=${proxy['tls-no-session-reuse']}`,
            'tls-no-session-reuse',
        );
        // tls fingerprint
        appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );

        // tls verification
        appendIfPresent(
            `,tls-verification=${!proxy['skip-cert-verify']}`,
            'skip-cert-verify',
        );
        appendIfPresent(`,tls-host=${proxy.sni}`, 'sni');
    }

    // tfo
    appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // server_check_url
    result.appendIfPresent(
        `,server_check_url=${proxy['test-url']}`,
        'test-url',
    );

    // tag
    append(`,tag=${proxy.name}`);

    return result.toString();
}

function shadowsocksr(proxy) {
    const result = new Result(proxy);
    const append = result.append.bind(result);
    const appendIfPresent = result.appendIfPresent.bind(result);

    append(`shadowsocks=${proxy.server}:${proxy.port}`);
    append(`,method=${proxy.cipher}`);
    append(`,password=${proxy.password}`);

    // ssr protocol
    append(`,ssr-protocol=${proxy.protocol}`);
    appendIfPresent(
        `,ssr-protocol-param=${proxy['protocol-param']}`,
        'protocol-param',
    );

    // obfs
    appendIfPresent(`,obfs=${proxy.obfs}`, 'obfs');
    appendIfPresent(`,obfs-host=${proxy['obfs-param']}`, 'obfs-param');

    // tfo
    appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // server_check_url
    result.appendIfPresent(
        `,server_check_url=${proxy['test-url']}`,
        'test-url',
    );

    // tag
    append(`,tag=${proxy.name}`);

    return result.toString();
}

function trojan(proxy) {
    const result = new Result(proxy);
    const append = result.append.bind(result);
    const appendIfPresent = result.appendIfPresent.bind(result);

    append(`trojan=${proxy.server}:${proxy.port}`);
    append(`,password=${proxy.password}`);

    // obfs ws
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            if (needTls(proxy)) append(`,obfs=wss`);
            else append(`,obfs=ws`);
            appendIfPresent(
                `,obfs-uri=${proxy['ws-opts']?.path}`,
                'ws-opts.path',
            );
            appendIfPresent(
                `,obfs-host=${proxy['ws-opts']?.headers?.Host}`,
                'ws-opts.headers.Host',
            );
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
    }

    // over tls
    if (proxy.network !== 'ws' && needTls(proxy)) {
        append(`,over-tls=true`);
    }

    if (needTls(proxy)) {
        appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
        appendIfPresent(`,tls-alpn=${proxy['tls-alpn']}`, 'tls-alpn');
        appendIfPresent(
            `,tls-no-session-ticket=${proxy['tls-no-session-ticket']}`,
            'tls-no-session-ticket',
        );
        appendIfPresent(
            `,tls-no-session-reuse=${proxy['tls-no-session-reuse']}`,
            'tls-no-session-reuse',
        );
        // tls fingerprint
        appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );

        // tls verification
        appendIfPresent(
            `,tls-verification=${!proxy['skip-cert-verify']}`,
            'skip-cert-verify',
        );
        appendIfPresent(`,tls-host=${proxy.sni}`, 'sni');
    }

    // tfo
    appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // server_check_url
    result.appendIfPresent(
        `,server_check_url=${proxy['test-url']}`,
        'test-url',
    );

    // tag
    append(`,tag=${proxy.name}`);

    return result.toString();
}

function vmess(proxy) {
    const result = new Result(proxy);
    const append = result.append.bind(result);
    const appendIfPresent = result.appendIfPresent.bind(result);

    append(`vmess=${proxy.server}:${proxy.port}`);

    // cipher
    let cipher;
    if (proxy.cipher === 'auto') {
        cipher = 'chacha20-ietf-poly1305';
    } else {
        cipher = proxy.cipher;
    }
    append(`,method=${cipher}`);

    append(`,password=${proxy.uuid}`);

    // obfs
    if (needTls(proxy)) {
        proxy.tls = true;
    }
    if (isPresent(proxy, 'network')) {
        if (proxy.network === 'ws') {
            if (proxy.tls) append(`,obfs=wss`);
            else append(`,obfs=ws`);
        } else if (proxy.network === 'http') {
            append(`,obfs=http`);
        } else {
            throw new Error(`network ${proxy.network} is unsupported`);
        }
        let transportPath = proxy[`${proxy.network}-opts`]?.path;
        let transportHost = proxy[`${proxy.network}-opts`]?.headers?.Host;
        appendIfPresent(
            `,obfs-uri=${
                Array.isArray(transportPath) ? transportPath[0] : transportPath
            }`,
            `${proxy.network}-opts.path`,
        );
        appendIfPresent(
            `,obfs-host=${
                Array.isArray(transportHost) ? transportHost[0] : transportHost
            }`,
            `${proxy.network}-opts.headers.Host`,
        );
    } else {
        // over-tls
        if (proxy.tls) append(`,obfs=over-tls`);
    }

    if (needTls(proxy)) {
        appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
        appendIfPresent(`,tls-alpn=${proxy['tls-alpn']}`, 'tls-alpn');
        appendIfPresent(
            `,tls-no-session-ticket=${proxy['tls-no-session-ticket']}`,
            'tls-no-session-ticket',
        );
        appendIfPresent(
            `,tls-no-session-reuse=${proxy['tls-no-session-reuse']}`,
            'tls-no-session-reuse',
        );
        // tls fingerprint
        appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );

        // tls verification
        appendIfPresent(
            `,tls-verification=${!proxy['skip-cert-verify']}`,
            'skip-cert-verify',
        );
        appendIfPresent(`,tls-host=${proxy.sni}`, 'sni');
    }

    // AEAD
    if (isPresent(proxy, 'aead')) {
        append(`,aead=${proxy.aead}`);
    } else {
        append(`,aead=${proxy.alterId === 0}`);
    }

    // tfo
    appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // server_check_url
    result.appendIfPresent(
        `,server_check_url=${proxy['test-url']}`,
        'test-url',
    );

    // tag
    append(`,tag=${proxy.name}`);

    return result.toString();
}

function http(proxy) {
    const result = new Result(proxy);
    const append = result.append.bind(result);
    const appendIfPresent = result.appendIfPresent.bind(result);

    append(`http=${proxy.server}:${proxy.port}`);
    appendIfPresent(`,username=${proxy.username}`, 'username');
    appendIfPresent(`,password=${proxy.password}`, 'password');

    // tls
    if (needTls(proxy)) {
        proxy.tls = true;
    }
    appendIfPresent(`,over-tls=${proxy.tls}`, 'tls');

    if (needTls(proxy)) {
        appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
        appendIfPresent(`,tls-alpn=${proxy['tls-alpn']}`, 'tls-alpn');
        appendIfPresent(
            `,tls-no-session-ticket=${proxy['tls-no-session-ticket']}`,
            'tls-no-session-ticket',
        );
        appendIfPresent(
            `,tls-no-session-reuse=${proxy['tls-no-session-reuse']}`,
            'tls-no-session-reuse',
        );
        // tls fingerprint
        appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );

        // tls verification
        appendIfPresent(
            `,tls-verification=${!proxy['skip-cert-verify']}`,
            'skip-cert-verify',
        );
        appendIfPresent(`,tls-host=${proxy.sni}`, 'sni');
    }

    // tfo
    appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // server_check_url
    result.appendIfPresent(
        `,server_check_url=${proxy['test-url']}`,
        'test-url',
    );

    // tag
    append(`,tag=${proxy.name}`);

    return result.toString();
}

function socks5(proxy) {
    const result = new Result(proxy);
    const append = result.append.bind(result);
    const appendIfPresent = result.appendIfPresent.bind(result);

    append(`socks5=${proxy.server}:${proxy.port}`);
    appendIfPresent(`,username=${proxy.username}`, 'username');
    appendIfPresent(`,password=${proxy.password}`, 'password');

    // tls
    if (needTls(proxy)) {
        proxy.tls = true;
    }
    appendIfPresent(`,over-tls=${proxy.tls}`, 'tls');

    if (needTls(proxy)) {
        appendIfPresent(
            `,tls-pubkey-sha256=${proxy['tls-pubkey-sha256']}`,
            'tls-pubkey-sha256',
        );
        appendIfPresent(`,tls-alpn=${proxy['tls-alpn']}`, 'tls-alpn');
        appendIfPresent(
            `,tls-no-session-ticket=${proxy['tls-no-session-ticket']}`,
            'tls-no-session-ticket',
        );
        appendIfPresent(
            `,tls-no-session-reuse=${proxy['tls-no-session-reuse']}`,
            'tls-no-session-reuse',
        );
        // tls fingerprint
        appendIfPresent(
            `,tls-cert-sha256=${proxy['tls-fingerprint']}`,
            'tls-fingerprint',
        );

        // tls verification
        appendIfPresent(
            `,tls-verification=${!proxy['skip-cert-verify']}`,
            'skip-cert-verify',
        );
        appendIfPresent(`,tls-host=${proxy.sni}`, 'sni');
    }

    // tfo
    appendIfPresent(`,fast-open=${proxy.tfo}`, 'tfo');

    // udp
    appendIfPresent(`,udp-relay=${proxy.udp}`, 'udp');

    // server_check_url
    result.appendIfPresent(
        `,server_check_url=${proxy['test-url']}`,
        'test-url',
    );

    // tag
    append(`,tag=${proxy.name}`);

    return result.toString();
}

function needTls(proxy) {
    return proxy.tls;
}
