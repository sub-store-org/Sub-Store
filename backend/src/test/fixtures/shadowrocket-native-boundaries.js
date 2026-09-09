import { Base64 } from 'js-base64';

const UUID = '11111111-1111-4111-8111-111111111111';
const quantumult = (options, transport = 'obfs=wss,') =>
    'vmess://' +
    Base64.encode(
        `VM=vmess,example.com,443,auto,"${UUID}",${transport}${options}`,
    );
const vmess = (fields) =>
    'vmess://' +
    Base64.encode(
        JSON.stringify({
            ps: 'VM',
            add: 'example.com',
            port: 443,
            id: UUID,
            scy: 'auto',
            aid: 0,
            tls: 'tls',
            net: 'ws',
            sni: 'tls.example.com',
            ...fields,
        }),
    );
const vmessQuery = (query) =>
    'vmess://' + Base64.encode(`auto:${UUID}@example.com:443`) + '?' + query;
const clash = (fields) =>
    JSON.stringify({
        proxies: [
            {
                name: 'Node',
                type: 'vmess',
                server: 'example.com',
                port: 443,
                uuid: UUID,
                cipher: 'auto',
                ...fields,
            },
        ],
    });
const ssd = (fields) =>
    'ssd://' +
    Base64.encode(
        JSON.stringify({
            airport: 'Test',
            port: 8388,
            encryption: 'aes-128-gcm',
            password: 'default',
            servers: [{ server: 'example.com', remarks: 'SSD' }],
            ...fields,
        }),
    );

// Shared by direct conversion and both download routes. Every positive case
// asserts preserved content, rather than only checking that export succeeds.
export const nativeBoundarySuccesses = [
    [
        'WireGuard query private key',
        'wg://example.com:51820?privatekey=private&publickey=public&address=10.0.0.2/32#WG',
        ['privateKey=private'],
    ],
    [
        'QX control',
        `vmess=example.com:443,method=aes-128-gcm,password=${UUID},tag=QX`,
        ['QX=vmess,', 'method=aes-128-gcm'],
    ],
    [
        'Loon control',
        `VM=vmess,example.com,443,auto,"${UUID}",over-tls=true,tls-name=one.example`,
        ['peer=one.example'],
    ],
    [
        'Surge control',
        `VM=vmess,example.com,443,username=${UUID},tls=true,skip-cert-verify=false`,
        ['tls=true'],
    ],
    [
        'Quantumult Host port',
        quantumult('obfs-header="Host: cdn.example.com:8443"'),
        ['obfsParam=cdn.example.com:8443', 'peer=cdn.example.com'],
    ],
    [
        'Quantumult IPv6 Host',
        quantumult('obfs-header="Host: [2001:db8::1]:8443"'),
        ['obfsParam=[2001:db8::1]:8443'],
    ],
    [
        'Quantumult query path',
        quantumult('obfs-path="/ws?token=abc=="'),
        ['path=/ws?token=abc=='],
    ],
    [
        'Quantumult lowercase Host',
        quantumult('obfs-header="host: cdn.example.com:8443"'),
        ['obfsParam=cdn.example.com:8443'],
    ],
    [
        'Quantumult equal flags',
        quantumult('tls-verification=false,tls-verification=false'),
        ['allowInsecure=1'],
    ],
    [
        'VMess encoded Host',
        vmess({ host: JSON.stringify({ Host: 'cdn.example.com:8443' }) }),
        ['obfsParam=cdn.example.com:8443', 'peer=tls.example.com'],
    ],
    [
        'VMess encoded equal aliases',
        vmess({
            host: JSON.stringify({
                Host: 'cdn.example.com',
                HOST: 'cdn.example.com',
            }),
        }),
        ['obfsParam=cdn.example.com'],
    ],
    [
        'VMess encoded lowercase Host',
        vmess({ host: JSON.stringify({ host: 'cdn.example.com' }) }),
        ['obfsParam=cdn.example.com'],
    ],
    [
        'VMess query equals',
        vmessQuery('tls=true&obfs=websocket&path=%2Fws%3Ftoken%3Dabc%3D%3D'),
        ['path=/ws?token=abc=='],
    ],
    [
        'SOCKS password colon',
        'socks://' +
            Base64.encode('user:secret:tail') +
            '@example.com:1080#SOCKS',
        [',user,secret:tail'],
    ],
    [
        'TUIC literal percent escape',
        `tuic://${UUID}:secret%2521@example.com:443#TUIC`,
        ['password=secret%21'],
    ],
    [
        'SSD independent defaults',
        ssd({
            servers: [
                {
                    server: 'one.example',
                    remarks: 'one',
                    password: 'override',
                    port: 9000,
                },
                { server: 'two.example', remarks: 'two' },
            ],
        }),
        [
            'one=ss,one.example,9000,password=override',
            'two=ss,two.example,8388,password=default',
        ],
    ],
    [
        'SSD escaped credentials and name',
        ssd({
            password: 'secret#%@:',
            servers: [{ server: 'example.com', remarks: 'SSD#name' }],
        }),
        ['SSD#name=ss,example.com,8388,password=secret#%@:'],
    ],
];
export const nativeBoundaryFailures = [
    [
        'WireGuard missing private key',
        'wg://example.com:51820?publickey=public&address=10.0.0.2/32#WG',
    ],
    ['HTTP malformed port', 'http://user:secret@example.com:bogus#HTTP'],
    ['Hysteria malformed port', 'hysteria://example.com:bogus?auth=secret#HY'],
    [
        'WireGuard conflicting private key',
        'wg://one@example.com:51820?publickey=public&privatekey=two&address=10.0.0.2/32#WG',
    ],

    [
        'QX conflicting TLS and obfs',
        `vmess=example.com:443,method=aes-128-gcm,password=${UUID},over-tls=false,obfs=wss,tag=QX`,
    ],
    [
        'Loon conflicting SNI aliases',
        `VM=vmess,example.com,443,auto,"${UUID}",over-tls=true,tls-name=one.example,sni=two.example`,
    ],
    ['Clash invalid disable-sni', clash({ tls: true, 'disable-sni': {} })],
    [
        'Quantumult conflicting flags',
        quantumult('tls-verification=false,tls-verification=true'),
    ],
    [
        'Quantumult conflicting path',
        quantumult('obfs-path="/one",obfs-path="/two"'),
    ],
    ['Quantumult orphan path', quantumult('obfs-path="/lost"', '')],
    [
        'Quantumult orphan header',
        quantumult('obfs-header="Host: cdn.example.com"', ''),
    ],
    [
        'Quantumult extra header',
        quantumult('obfs-header="Host: cdn.example.com\\r\\nX-Test: secret"'),
    ],
    [
        'Quantumult conflicting headers',
        quantumult('obfs-header="Host: one.example\\r\\nhost: two.example"'),
    ],
    ['Quantumult comma path', quantumult('obfs-path="/ws?token=a,b"')],
    [
        'VMess encoded extra header',
        vmess({
            host: JSON.stringify({
                Host: 'cdn.example.com',
                'X-Test': 'secret',
            }),
        }),
    ],
    [
        'VMess encoded Host conflict',
        vmess({
            host: JSON.stringify({ Host: 'one.example', host: 'two.example' }),
        }),
    ],
    [
        'VMess encoded invalid Host',
        vmess({ host: JSON.stringify({ Host: { bad: true } }) }),
    ],
    ['VMess query duplicate conflict', vmessQuery('tls=false&tls=true')],
    ['VMess query authority override', vmessQuery('add=other.example')],
    ['VMess conflicting transport', vmess({ net: 'ws', obfs: 'none' })],
    ['Clash orphan ws options', clash({ 'ws-opts': { path: '/lost' } })],
    [
        'Clash SOCKS SNI without TLS',
        clash({
            type: 'socks5',
            uuid: undefined,
            cipher: undefined,
            sni: 'ignored.example',
        }),
    ],
    [
        'QX repeated password',
        `vmess=example.com:443,method=aes-128-gcm,password=${UUID},password=22222222-2222-4222-8222-222222222222,tag=QX`,
    ],
    [
        'Surge repeated certificate verification',
        `VM=vmess,example.com,443,username=${UUID},tls=true,skip-cert-verify=false,skip-cert-verify=true`,
    ],
    [
        'Loon repeated SNI',
        `VM=vmess,example.com,443,auto,"${UUID}",over-tls=true,tls-name=one.example,tls-name=two.example`,
    ],
    [
        'Surge repeated Host',
        `VM=vmess,example.com,443,username=${UUID},ws=true,ws-headers=Host:one.example|Host:two.example`,
    ],
    ['SSD password object', ssd({ password: { bad: true } })],
    [
        'SSD unknown server option',
        ssd({
            servers: [{ server: 'example.com', remarks: 'SSD', unknown: true }],
        }),
    ],
];

const surgeVmess = `VM=vmess,example.com,443,username=${UUID}`;
const loonVmess = `VM=vmess,example.com,443,auto,"${UUID}"`;
const qxVmess = `vmess=example.com:443,method=aes-128-gcm,password=${UUID},tag=QX`;
const surgeTrojan = 'T=trojan,example.com,443,password=';
const surgeSS =
    'SS=ss,example.com,443,encrypt-method=aes-128-gcm,password=secret';
const loonSS = 'SS=shadowsocks,example.com,443,aes-128-gcm,"secret"';

nativeBoundarySuccesses.push(
    [
        'Text Surge disabled WS',
        surgeVmess + ',ws=false',
        ['method=auto'],
        ['obfs=websocket'],
    ],
    [
        'Text Surge enabled WS',
        surgeVmess + ',ws=true,ws-path=/ws',
        ['obfs=websocket,path=/ws'],
    ],
    [
        'Text Surge equal TFO aliases',
        surgeVmess + ',tfo=true,fast-open=true',
        ['tfo=1'],
    ],
    [
        'Text Surge disabled TFO aliases',
        surgeVmess + ',tfo=false,fast-open=false',
        ['method=auto'],
        ['tfo=1'],
    ],
    [
        'Text Loon enabled WS',
        loonVmess + ',transport=ws,path=/ws,host=cdn.example.com',
        ['obfs=websocket,path=/ws,obfsParam=cdn.example.com'],
    ],
    [
        'Text QX enabled WS',
        qxVmess + ',obfs=ws,obfs-uri=/ws,obfs-host=cdn.example.com',
        ['obfs=websocket,path=/ws,obfsParam=cdn.example.com'],
    ],
    [
        'Text QX TLS Host alias',
        qxVmess + ',obfs=over-tls,obfs-host=cdn.example.com',
        ['tls=true', 'peer=cdn.example.com'],
    ],
);
for (const password of [
    'secret[',
    'secret]',
    'secret{',
    'secret}',
    'secret="',
    "secret='",
]) {
    nativeBoundaryFailures.push([
        'Text conflicting flags after ' + password,
        surgeTrojan +
            password +
            ',skip-cert-verify=false,skip-cert-verify=true',
    ]);
    nativeBoundarySuccesses.push([
        'Text literal password ' + password,
        surgeTrojan + password + ',skip-cert-verify=false',
        ['password=' + password],
        ['allowInsecure=1'],
    ]);
}
for (const [label, raw] of [
    ['Surge orphan path', surgeVmess + ',ws-path=/lost'],
    ['Surge orphan headers', surgeVmess + ',ws-headers=Host:cdn.example.com'],
    ['Surge disabled WS with path', surgeVmess + ',ws=false,ws-path=/lost'],
    ['Loon orphan path', loonVmess + ',path=/lost'],
    ['Loon orphan host', loonVmess + ',host=cdn.example.com'],
    ['Loon TCP path', loonVmess + ',transport=tcp,path=/lost'],
    ['QX orphan path', qxVmess + ',obfs-uri=/lost'],
    ['QX orphan host', qxVmess + ',obfs-host=cdn.example.com'],
    ['QX TLS orphan path', qxVmess + ',obfs=over-tls,obfs-uri=/lost'],
    ['Surge TFO conflict', surgeVmess + ',tfo=false,fast-open=true'],
    ['Surge reversed TFO conflict', surgeVmess + ',fast-open=true,tfo=false'],
])
    nativeBoundaryFailures.push(['Text ' + label, raw]);
for (const [format, raw] of [
    ['Surge', surgeSS],
    ['Loon', loonSS],
]) {
    for (const option of [
        'shadow-tls-version=3',
        'shadow-tls-sni=cdn.example.com',
        'shadow-tls-version=3,shadow-tls-password=secret',
        'shadow-tls-password=""',
    ]) {
        nativeBoundaryFailures.push([
            'Text ' + format + ' ' + option,
            raw + ',' + option,
        ]);
    }
}

nativeBoundaryFailures.push(
    [
        'Text QX TLS transport conflict',
        qxVmess + ',over-tls=false,obfs=over-tls',
    ],
    [
        'Text QX TLS Host conflict',
        qxVmess + ',obfs=over-tls,obfs-host=one.example,tls-host=two.example',
    ],
    ['Text Surge conflicting WS flags', surgeVmess + ',ws=true,ws=false'],
    [
        'Text Surge reversed conflicting WS flags',
        surgeVmess + ',ws=false,ws=true',
    ],
);

// Named options must be distinguished from positional credentials, and SNI
// aliases must be compared using the values interpreted by the text grammar.
for (const protocol of ['http', 'https', 'socks5', 'socks5-tls']) {
    nativeBoundarySuccesses.push([
        'Text Surge positional option-like password ' + protocol,
        `H=${protocol},example.com,8080,user,tfo=true,tfo=false`,
        ['user,tfo=true'],
        ['tfo=1'],
    ]);
}
nativeBoundarySuccesses.push([
    'Text Surge named option-like password',
    'H=http,example.com,8080,username=user,password=tfo=true,tfo=false',
    ['user,tfo=true'],
    ['tfo=1'],
]);
for (const options of [
    'sni=example.com,tls-name="example.com"',
    'tls-name="example.com",sni=example.com',
    'sni="example.com",sni=example.com',
]) {
    nativeBoundarySuccesses.push([
        'Text Loon equivalent SNI ' + options,
        loonVmess + ',over-tls=true,' + options,
        ['peer=example.com'],
    ]);
}
for (const [format, raw, sni] of [
    ['Surge', surgeVmess + ',tls=true', 'sni'],
    ['QX', qxVmess + ',over-tls=true', 'tls-host'],
]) {
    nativeBoundarySuccesses.push([
        'Text ' + format + ' equivalent quoted SNI',
        raw + `,${sni}="example.com",${sni}=example.com`,
        ['peer=example.com'],
    ]);
}
for (const [format, raw] of [
    ['Surge SS', surgeSS],
    ['Loon SS', loonSS],
    ['QX SS', 'shadowsocks=example.com:443,method=aes-128-gcm,password=secret,tag=SS'],
    ['Surge Snell', 'SN=snell,example.com,443,psk=secret,version=2'],
]) {
    for (const option of ['obfs-host=cdn.example.com', 'obfs-uri=/lost']) {
        nativeBoundaryFailures.push([
            'Text ' + format + ' orphan ' + option,
            raw + ',' + option,
        ]);
    }
}
for (const mode of ['bogus', '"bogus"', 'default', 'unshaped', 'unsafe-raw']) {
    nativeBoundaryFailures.push([
        'Text Surge Snell mode ' + mode,
        'SN=snell,example.com,443,psk=secret,version=2,mode=' + mode,
    ]);
}
for (const options of [
    'sni=one.example,tls-name="two.example"',
    'tls-name="two.example",sni=one.example',
]) {
    nativeBoundaryFailures.push([
        'Text Loon conflicting quoted SNI ' + options,
        loonVmess + ',over-tls=true,' + options,
    ]);
}

for (const [label, raw] of [
    ['spaced TFO', surgeVmess + ',tfo = false,fast-open = true'],
    ['spaced quoted SNI', loonVmess + ',over-tls=true,sni = one.example,tls-name = "two.example"'],
    ['options after positional password', 'H=http,example.com,8080,user,tfo=true,tfo = false,tfo = true'],
    ['QX SS TLS orphan path', 'shadowsocks=example.com:443,method=aes-128-gcm,password=secret,tag=SS,obfs=over-tls,obfs-uri=/lost'],
]) {
    nativeBoundaryFailures.push([label.startsWith('QX SS TLS') ? label : 'Text ' + label, raw]);
}
nativeBoundarySuccesses.push([
    'Text Loon spaced equivalent SNI',
    loonVmess + ',over-tls=true,sni = example.com,tls-name = "example.com"',
    ['peer=example.com'],
]);

for (const options of [
    'password="secret",password=secret',
    "password='secret',password=secret",
]) {
    nativeBoundarySuccesses.push([
        'Text Surge equivalent password ' + options,
        'T=trojan,example.com,443,' + options,
        ['password=secret'],
    ]);
}
for (const [label, raw] of [
    ['Surge significant password whitespace', 'T=trojan,example.com,443,password=secret ,password=secret'],
    ['QX literal password quotes', 'trojan=example.com:443,password="secret",password=secret,tag=T'],
    ['Surge quoted password conflict', 'T=trojan,example.com,443,password="one",password=two'],
    ['Surge SNI disable conflict', 'T=trojan,example.com,443,password=secret,sni=off,sni=example.com'],
    ['Surge empty obfs Host', surgeSS + ',obfs-host=""'],
]) {
    nativeBoundaryFailures.push(['Text ' + label, raw]);
}
nativeBoundarySuccesses.push(
    [
        'Text QX trimmed equivalent password',
        'trojan=example.com:443,password=secret ,password=secret,tag=T',
        ['password=secret'],
    ],
    [
        'Text Surge equivalent Snell version',
        'SN=snell,example.com,443,psk=secret,version=02,version=2',
        ['=snell,example.com,443,password=secret,udp=1'],
    ],
    [
        'Text Surge equivalent Snell obfs Host',
        'SN=snell,example.com,443,psk=secret,version=2,obfs=http,obfs-host="cdn.example.com",obfs-host=cdn.example.com',
        ['obfs=http', 'obfs-host=cdn.example.com'],
    ],
);

// Fixed PR review R1–R5: exercise these inputs in direct export and both
// download routes. Keep equivalent spellings and real conflicts together.
const reviewWireGuard = (fields) => clash({
    type: 'wireguard',
    uuid: undefined,
    cipher: undefined,
    port: 51820,
    'private-key': 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
    'public-key': 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=',
    ip: '10.0.0.2/32',
    ...fields,
});
const reviewHysteria = (fields) => clash({
    type: 'hysteria', uuid: undefined, cipher: undefined,
    up: 10, down: 20, ...fields,
});
const reviewSurgeVMess = `VM=vmess,example.com,443,username=${UUID}`;
const reviewWGUri = 'wg://private-key@example.com:51820?address=10.0.0.2/32&publickey=public-key';

nativeBoundarySuccesses.push(
    ['R1 WG keepalive alias', reviewWireGuard({'persistent-keepalive': 25}), ['keepalive=25']],
    ['R1 Hysteria auth alias', reviewHysteria({auth_str: 'secret'}), ['auth=secret']],
    ['R1 VMess Host alias', vmess({obfsParam: 'cdn.example.com'}), ['obfsParam=cdn.example.com']],
    ['R2 VMess JSON fragment', vmess({}) + '#VM', ['tls=true']],
    ['R2 Quantumult fragment', quantumult('fast-open=1', '') + '#VM', ['tfo=1']],
    ['R2 Shadowrocket query', vmessQuery('tls=true'), ['tls=true']],
    ['R4 Surge Host header', reviewSurgeVMess + ',ws=true,ws-headers=Host:cdn.example.com', ['obfsParam=cdn.example.com']],
    ['R5 ALPN equivalent', 'H=hysteria2,example.com,443,password=secret,alpn="h3",alpn=h3', ['alpn=h3']],
    ['R5 cipher equivalent', reviewSurgeVMess + ',encrypt-method=AUTO,encrypt-method=auto', ['method=auto']],
    ['R5 Quantumult flag equivalent', quantumult('fast-open=true,fast-open=1', ''), ['tfo=1']],
    ['R5 Trojan flag equivalent', 'trojan://secret@example.com:443?allowInsecure=false&allowInsecure=0', ['password=secret'], ['allowInsecure=1']],
    ['R5 VMess aid equivalent', vmess({aid: '00', alterId: 0}), ['alterId=0']],
);
for (const [key, value, expected, absent = []] of [
    ['congestion-control', 'cubic', ['password=secret']],
    ['fast-open', 'false', ['password=secret'], ['tfo=1']],
    ['allow-insecure', '0', ['password=secret'], ['allowInsecure=1']],
    ['disable-sni', 'false', ['password=secret']],
    ['reduce-rtt', '0', ['password=secret']],
]) {
    for (const alias of [key, key.replace(/-/g, '_')]) {
        nativeBoundarySuccesses.push([
            `R3 TUIC ${alias}`,
            `tuic://${UUID}:secret@example.com:443?${alias}=${value}`,
            expected, absent,
        ]);
    }
}
for (const key of ['publickey', 'publicKey', 'privatekey', 'privateKey']) {
    const value = key.toLowerCase() === 'publickey' ? 'public-key' : 'private-key';
    nativeBoundarySuccesses.push([
        `R3 WireGuard ${key}`, `${reviewWGUri}&${key}=${value}`,
        ['privateKey=private-key', 'publicKey=public-key'],
    ]);
}

nativeBoundaryFailures.push(
    ['Text R1 empty PSK hides alias', reviewWireGuard({'preshared-key': '', 'pre-shared-key': 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='})],
    ['Text R1 unsupported PSK alias', reviewWireGuard({'pre-shared-key': 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI='})],
    ['Text R1 empty keepalive hides alias', reviewWireGuard({keepalive: '', 'persistent-keepalive': 25})],
    ['Text R1 empty auth hides alias', reviewHysteria({'auth-str': '', auth_str: 'secret'})],
    ['Text R1 empty Host hides alias', vmess({host: '', obfsParam: 'cdn.example.com'})],
    ['Text R2 VMess outer TLS query', vmess({}) + '?tls=false'],
    ['Text R2 VMess outer unknown query', vmess({}) + '?unknown=value'],
    ['Text R2 Quantumult outer query', quantumult('fast-open=1', '') + '?unknown=value'],
    ['Text R3 TUIC conflicting alias', `tuic://${UUID}:secret@example.com:443?fast_open=false&fast-open=true`],
    ['Text R3 WG conflicting public key', reviewWGUri + '&publicKey=different-key'],
    ['Text R3 WG conflicting authority key', reviewWGUri + '&privateKey=different-key'],
    ['Text R4 Surge prototype header', reviewSurgeVMess + ',ws=true,ws-headers=Host:cdn.example.com|__proto__:secret'],
    ['Text R4 Surge extra header control', reviewSurgeVMess + ',ws=true,ws-headers=Host:cdn.example.com|X-Test:secret'],
    ['Text R5 ALPN conflict', 'H=hysteria2,example.com,443,password=secret,alpn="h3",alpn=h2'],
    ['Text R5 cipher conflict', reviewSurgeVMess + ',encrypt-method=auto,encrypt-method=aes-128-gcm'],
    ['Text R5 cipher unsupported duplicate', reviewSurgeVMess + ',encrypt-method=bogus,encrypt-method=auto'],
    ['Text R5 Quantumult flag conflict', quantumult('fast-open=true,fast-open=0', '')],
    ['Text R5 Quantumult malformed flag', quantumult('fast-open=bogus,fast-open=0', '')],
    ['Text R5 Trojan flag conflict', 'trojan://secret@example.com:443?allowInsecure=true&allowInsecure=0'],
    ['Text R5 Trojan malformed flag', 'trojan://secret@example.com:443?allowInsecure=bogus&allowInsecure=0'],
    ['Text R5 VMess aid conflict', vmess({aid: '00', alterId: 1})],
    ['Text R5 VMess empty aid conflict', vmess({aid: '', alterId: 0})],
    ['Text R5 VMess malformed aid', vmess({aid: '0x', alterId: 0})],
);
