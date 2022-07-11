function createTestCases() {
    const name = 'name';
    const server = 'example.com';
    const port = 10086;

    const cipher = 'chacha20';

    const username = 'username';
    const password = 'password';

    const obfs_host = 'obfs.com';
    const obfs_path = '/resource/file';

    const ssr_protocol = 'auth_chain_b';
    const ssr_protocol_param = 'def';
    const ssr_obfs = 'tls1.2_ticket_fastauth';
    const ssr_obfs_param = 'obfs.com';

    const uuid = '23ad6b10-8d1a-40f7-8ad0-e3e35cd32291';

    const sni = 'sni.com';

    const tls_fingerprint =
        '67:1B:C8:F2:D4:60:DD:A7:EE:60:DA:BB:A3:F9:A4:D7:C8:29:0F:3E:2F:75:B6:A9:46:88:48:7D:D3:97:7E:98';

    const SS = {
        SIMPLE: {
            input: {
                Loon: `${name}=shadowsocks,${server},${port},${cipher},"${password}"`,
                QX: `shadowsocks=${server}:${port},method=${cipher},password=${password},tag=${name}`,
                Surge: `${name}=ss,${server},${port},encrypt-method=${cipher},password=${password}`,
            },
            expected: {
                type: 'ss',
                name,
                server,
                port,
                cipher,
                password,
            },
        },
        OBFS_TLS: {
            input: {
                Loon: `${name}=shadowsocks,${server},${port},${cipher},"${password}",obfs-name=tls,obfs-uri=${obfs_path},obfs-host=${obfs_host}`,
                QX: `shadowsocks=${server}:${port},method=${cipher},password=${password},obfs=tls,obfs-host=${obfs_host},obfs-uri=${obfs_path},tag=${name}`,
                Surge: `${name}=ss,${server},${port},encrypt-method=${cipher},password=${password},obfs=tls,obfs-host=${obfs_host},obfs-uri=${obfs_path}`,
            },
            expected: {
                type: 'ss',
                name,
                server,
                port,
                cipher,
                password,
                plugin: 'obfs',
                'plugin-opts': {
                    mode: 'tls',
                    path: obfs_path,
                    host: obfs_host,
                },
            },
        },
        OBFS_HTTP: {
            input: {
                Loon: `${name}=shadowsocks,${server},${port},${cipher},"${password}",obfs-name=http,obfs-uri=${obfs_path},obfs-host=${obfs_host}`,
                QX: `shadowsocks=${server}:${port},method=${cipher},password=${password},obfs=http,obfs-host=${obfs_host},obfs-uri=${obfs_path},tag=${name}`,
                Surge: `${name}=ss,${server},${port},encrypt-method=${cipher},password=${password},obfs=http,obfs-host=${obfs_host},obfs-uri=${obfs_path}`,
            },
            expected: {
                type: 'ss',
                name,
                server,
                port,
                cipher,
                password,
                plugin: 'obfs',
                'plugin-opts': {
                    mode: 'http',
                    path: obfs_path,
                    host: obfs_host,
                },
            },
        },
        V2RAY_PLUGIN_WS: {
            input: {
                QX: `shadowsocks=${server}:${port},method=${cipher},password=${password},obfs=ws,obfs-host=${obfs_host},obfs-uri=${obfs_path},tag=${name}`,
            },
            expected: {
                type: 'ss',
                name,
                server,
                port,
                cipher,
                password,
                plugin: 'v2ray-plugin',
                'plugin-opts': {
                    mode: 'websocket',
                    path: obfs_path,
                    host: obfs_host,
                },
            },
        },
        V2RAY_PLUGIN_WSS: {
            input: {
                QX: `shadowsocks=${server}:${port},method=${cipher},password=${password},obfs=wss,obfs-host=${obfs_host},obfs-uri=${obfs_path},tag=${name}`,
            },
            expected: {
                type: 'ss',
                name,
                server,
                port,
                cipher,
                password,
                plugin: 'v2ray-plugin',
                'plugin-opts': {
                    mode: 'websocket',
                    path: obfs_path,
                    host: obfs_host,
                    tls: true,
                },
            },
        },
    };
    const SSR = {
        SIMPLE: {
            input: {
                QX: `shadowsocks=${server}:${port},method=${cipher},password=${password},ssr-protocol=${ssr_protocol},ssr-protocol-param=${ssr_protocol_param},obfs=${ssr_obfs},obfs-host=${ssr_obfs_param},tag=${name}`,
                Loon: `${name}=shadowsocksr,${server},${port},${cipher},"${password}",protocol=${ssr_protocol},protocol-param=${ssr_protocol_param},obfs=${ssr_obfs},obfs-param=${ssr_obfs_param}`,
            },
            expected: {
                type: 'ssr',
                name,
                server,
                port,
                cipher,
                password,
                obfs: ssr_obfs,
                protocol: ssr_protocol,
                'obfs-param': ssr_obfs_param,
                'protocol-param': ssr_protocol_param,
            },
        },
    };
    const TROJAN = {
        SIMPLE: {
            input: {
                QX: `trojan=${server}:${port},password=${password},tag=${name}`,
                Loon: `${name}=trojan,${server},${port},"${password}"`,
                Surge: `${name}=trojan,${server},${port},password=${password}`,
            },
            expected: {
                type: 'trojan',
                name,
                server,
                port,
                password,
            },
        },
        WS: {
            input: {
                QX: `trojan=${server}:${port},password=${password},obfs=ws,obfs-host=${obfs_host},obfs-uri=${obfs_path},tag=${name}`,
                Loon: `${name}=trojan,${server},${port},"${password}",transport=ws,path=${obfs_path},host=${obfs_host}`,
                Surge: `${name}=trojan,${server},${port},password=${password},ws=true,ws-path=${obfs_path},ws-headers=Host:${obfs_host}`,
            },
            expected: {
                type: 'trojan',
                name,
                server,
                port,
                password,
                network: 'ws',
                'ws-opts': {
                    path: obfs_path,
                    headers: {
                        Host: obfs_host,
                    },
                },
            },
        },
        WSS: {
            input: {
                QX: `trojan=${server}:${port},password=${password},obfs=wss,obfs-host=${obfs_host},obfs-uri=${obfs_path},tls-verification=false,tls-host=${sni},tag=${name}`,
                Loon: `${name}=trojan,${server},${port},"${password}",transport=ws,path=${obfs_path},host=${obfs_host},over-tls=true,tls-name=${sni},skip-cert-verify=true`,
                Surge: `${name}=trojan,${server},${port},password=${password},ws=true,ws-path=${obfs_path},ws-headers=Host:${obfs_host},skip-cert-verify=true,sni=${sni},tls=true`,
            },
            expected: {
                type: 'trojan',
                name,
                server,
                port,
                password,
                network: 'ws',
                tls: true,
                'ws-opts': {
                    path: obfs_path,
                    headers: {
                        Host: obfs_host,
                    },
                },
                'skip-cert-verify': true,
                sni,
            },
        },
        TLS_FINGERPRINT: {
            input: {
                QX: `trojan=${server}:${port},password=${password},tls-verification=false,tls-host=${sni},tls-cert-sha256=${tls_fingerprint},tag=${name},over-tls=true`,
                Surge: `${name}=trojan,${server},${port},password=${password},skip-cert-verify=true,sni=${sni},tls=true,server-cert-fingerprint-sha256=${tls_fingerprint}`,
            },
            expected: {
                type: 'trojan',
                name,
                server,
                port,
                password,
                tls: true,
                'skip-cert-verify': true,
                sni,
                'tls-fingerprint': tls_fingerprint,
            },
        },
    };
    const VMESS = {
        SIMPLE: {
            input: {
                QX: `vmess=${server}:${port},method=${cipher},password=${uuid},tag=${name}`,
                Loon: `${name}=vmess,${server},${port},${cipher},"${uuid}"`,
                Surge: `${name}=vmess,${server},${port},username=${uuid}`,
            },
            expected: {
                QX: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    alterId: 0,
                },
                Loon: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    alterId: 0,
                },
                Surge: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher: 'none', // Surge lacks support for specifying cipher for vmess protocol!
                    alterId: 0,
                },
            },
        },
        AEAD: {
            input: {
                QX: `vmess=${server}:${port},method=${cipher},password=${uuid},aead=true,tag=${name}`,
                Loon: `${name}=vmess,${server},${port},${cipher},"${uuid}",alterId=0`,
                Surge: `${name}=vmess,${server},${port},username=${uuid},vmess-aead=true`,
            },
            expected: {
                QX: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    aead: true,
                    alterId: 0,
                },
                Loon: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    alterId: 0,
                },
                Surge: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher: 'none', // Surge lacks support for specifying cipher for vmess protocol!
                    alterId: 0,
                    aead: true,
                },
            },
        },
        WS: {
            input: {
                QX: `vmess=${server}:${port},method=${cipher},password=${uuid},obfs=ws,obfs-host=${obfs_host},obfs-uri=${obfs_path},tag=${name}`,
                Loon: `${name}=vmess,${server},${port},${cipher},"${uuid}",transport=ws,host=${obfs_host},path=${obfs_path}`,
                Surge: `${name}=vmess,${server},${port},username=${uuid},ws=true,ws-path=${obfs_path},ws-headers=Host:${obfs_host}`,
            },
            expected: {
                QX: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    alterId: 0,
                },
                Loon: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    alterId: 0,
                },
                Surge: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher: 'none', // Surge lacks support for specifying cipher for vmess protocol!
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    alterId: 0,
                },
            },
        },
        WSS: {
            input: {
                QX: `vmess=${server}:${port},method=${cipher},password=${uuid},obfs=wss,obfs-host=${obfs_host},obfs-uri=${obfs_path},tls-verification=false,tls-host=${sni},tag=${name}`,
                Loon: `${name}=vmess,${server},${port},${cipher},"${uuid}",transport=ws,host=${obfs_host},path=${obfs_path},over-tls=true,tls-name=${sni},skip-cert-verify=true`,
                Surge: `${name}=vmess,${server},${port},username=${uuid},ws=true,ws-path=${obfs_path},ws-headers=Host:${obfs_host},skip-cert-verify=true,sni=${sni},tls=true`,
            },
            expected: {
                QX: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    tls: true,
                    'skip-cert-verify': true,
                    sni,
                    alterId: 0,
                },
                Loon: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    tls: true,
                    'skip-cert-verify': true,
                    sni,
                    alterId: 0,
                },
                Surge: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher: 'none', // Surge lacks support for specifying cipher for vmess protocol!
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    tls: true,
                    'skip-cert-verify': true,
                    sni,
                    alterId: 0,
                },
            },
        },
        HTTP: {
            input: {
                QX: `vmess=${server}:${port},method=${cipher},password=${uuid},obfs=http,obfs-host=${obfs_host},obfs-uri=${obfs_path},tag=${name}`,
                Loon: `${name}=vmess,${server},${port},${cipher},"${uuid}",transport=http,host=${obfs_host},path=${obfs_path}`,
            },
            expected: {
                QX: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    network: 'http',
                    'http-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    alterId: 0,
                },
                Loon: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    network: 'http',
                    'http-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    alterId: 0,
                },
            },
        },
        HTTP_TLS: {
            input: {
                Loon: `${name}=vmess,${server},${port},${cipher},"${uuid}",transport=http,host=${obfs_host},path=${obfs_path},over-tls=true,tls-name=${sni},skip-cert-verify=true`,
            },
            expected: {
                Loon: {
                    type: 'vmess',
                    name,
                    server,
                    port,
                    uuid,
                    cipher,
                    network: 'http',
                    'http-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    tls: true,
                    'skip-cert-verify': true,
                    sni,
                    alterId: 0,
                },
            },
        },
    };
    const VLESS = {
        SIMPLE: {
            input: {
                Loon: `${name}=vless,${server},${port},"${uuid}"`,
            },
            expected: {
                Loon: {
                    type: 'vless',
                    name,
                    server,
                    port,
                    uuid,
                },
            },
        },
        WS: {
            input: {
                Loon: `${name}=vless,${server},${port},"${uuid}",transport=ws,host=${obfs_host},path=${obfs_path}`,
            },
            expected: {
                Loon: {
                    type: 'vless',
                    name,
                    server,
                    port,
                    uuid,
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                },
            },
        },
        WSS: {
            input: {
                Loon: `${name}=vless,${server},${port},"${uuid}",transport=ws,host=${obfs_host},path=${obfs_path},over-tls=true,tls-name=${sni},skip-cert-verify=true`,
            },
            expected: {
                Loon: {
                    type: 'vless',
                    name,
                    server,
                    port,
                    uuid,
                    network: 'ws',
                    'ws-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    tls: true,
                    'skip-cert-verify': true,
                    sni,
                },
            },
        },
        HTTP: {
            input: {
                Loon: `${name}=vless,${server},${port},"${uuid}",transport=http,host=${obfs_host},path=${obfs_path}`,
            },
            expected: {
                Loon: {
                    type: 'vless',
                    name,
                    server,
                    port,
                    uuid,
                    network: 'http',
                    'http-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                },
            },
        },
        HTTP_TLS: {
            input: {
                Loon: `${name}=vless,${server},${port},"${uuid}",transport=http,host=${obfs_host},path=${obfs_path},over-tls=true,tls-name=${sni},skip-cert-verify=true`,
            },
            expected: {
                Loon: {
                    type: 'vless',
                    name,
                    server,
                    port,
                    uuid,
                    network: 'http',
                    'http-opts': {
                        path: obfs_path,
                        headers: {
                            Host: obfs_host,
                        },
                    },
                    tls: true,
                    'skip-cert-verify': true,
                    sni,
                },
            },
        },
    };
    const HTTP = {
        SIMPLE: {
            input: {
                Loon: `${name}=http,${server},${port}`,
                QX: `http=${server}:${port},tag=${name}`,
                Surge: `${name}=http,${server},${port}`,
            },
            expected: {
                type: 'http',
                name,
                server,
                port,
            },
        },
        AUTH: {
            input: {
                Loon: `${name}=http,${server},${port},${username},"${password}"`,
                QX: `http=${server}:${port},tag=${name},username=${username},password=${password}`,
                Surge: `${name}=http,${server},${port},${username},${password}`,
            },
            expected: {
                type: 'http',
                name,
                server,
                port,
                username,
                password,
            },
        },
        TLS: {
            input: {
                Loon: `${name}=https,${server},${port},${username},"${password}",tls-name=${sni},skip-cert-verify=true`,
                QX: `http=${server}:${port},username=${username},password=${password},over-tls=true,tls-host=${sni},tls-verification=false,tag=${name}`,
                Surge: `${name}=https,${server},${port},${username},${password},sni=${sni},skip-cert-verify=true`,
            },
            expected: {
                type: 'http',
                name,
                server,
                port,
                username,
                password,
                sni,
                'skip-cert-verify': true,
                tls: true,
            },
        },
    };
    const SOCKS5 = {
        SIMPLE: {
            input: {
                QX: `socks5=${server}:${port},tag=${name}`,
                Surge: `${name}=socks5,${server},${port}`,
            },
            expected: {
                type: 'socks5',
                name,
                server,
                port,
            },
        },
        AUTH: {
            input: {
                QX: `socks5=${server}:${port},tag=${name},username=${username},password=${password}`,
                Surge: `${name}=socks5,${server},${port},${username},${password}`,
            },
            expected: {
                type: 'socks5',
                name,
                server,
                port,
                username,
                password,
            },
        },
        TLS: {
            input: {
                QX: `socks5=${server}:${port},username=${username},password=${password},over-tls=true,tls-host=${sni},tls-verification=false,tag=${name}`,
                Surge: `${name}=socks5-tls,${server},${port},${username},${password},sni=${sni},skip-cert-verify=true`,
            },
            expected: {
                type: 'socks5',
                name,
                server,
                port,
                username,
                password,
                sni,
                'skip-cert-verify': true,
                tls: true,
            },
        },
    };
    const SNELL = {
        SIMPLE: {
            input: {
                Surge: `${name}=snell,${server},${port},psk=${password},version=3`,
            },
            expected: {
                type: 'snell',
                name,
                server,
                port,
                psk: password,
                version: 3,
            },
        },
        OBFS_HTTP: {
            input: {
                Surge: `${name}=snell,${server},${port},psk=${password},version=3,obfs=http,obfs-host=${obfs_host},obfs-uri=${obfs_path}`,
            },
            expected: {
                type: 'snell',
                name,
                server,
                port,
                psk: password,
                version: 3,
                'obfs-opts': {
                    mode: 'http',
                    host: obfs_host,
                    path: obfs_path,
                },
            },
        },
        OBFS_TLS: {
            input: {
                Surge: `${name}=snell,${server},${port},psk=${password},version=3,obfs=tls,obfs-host=${obfs_host},obfs-uri=${obfs_path}`,
            },
            expected: {
                type: 'snell',
                name,
                server,
                port,
                psk: password,
                version: 3,
                'obfs-opts': {
                    mode: 'tls',
                    host: obfs_host,
                    path: obfs_path,
                },
            },
        },
    };
    return {
        SS,
        SSR,
        VMESS,
        VLESS,
        TROJAN,
        HTTP,
        SOCKS5,
        SNELL,
    };
}

export default createTestCases();
