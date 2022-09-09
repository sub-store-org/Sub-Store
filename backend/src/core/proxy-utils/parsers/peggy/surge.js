import * as peggy from 'peggy';
const grammars = String.raw`
// global initializer
{{
    function $set(obj, path, value) {
      if (Object(obj) !== obj) return obj;
      if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
      path
        .slice(0, -1)
        .reduce((a, c, i) => (Object(a[c]) === a[c] ? a[c] : (a[c] = Math.abs(path[i + 1]) >> 0 === +path[i + 1] ? [] : {})), obj)[
        path[path.length - 1]
      ] = value;
      return obj;
    }
}}

// per-parser initializer
{
    const proxy = {};
    const obfs = {};
    const $ = {};

    function handleWebsocket() {
        if (obfs.type === "ws") {
            proxy.network = "ws";
            $set(proxy, "ws-opts.path", obfs.path);
            $set(proxy, "ws-opts.headers", obfs['ws-headers']);
        }
    }
}

start = (shadowsocks/vmess/trojan/https/http/snell/socks5/socks5_tls) {
    return proxy;
}

shadowsocks = tag equals "ss" address (method/passwordk/obfs/obfs_host/obfs_uri/fast_open/udp_relay/others)* {
    proxy.type = "ss";
    // handle obfs
    if (obfs.type == "http" || obfs.type === "tls") {
        proxy.plugin = "obfs";
        $set(proxy, "plugin-opts.mode", obfs.type);
        $set(proxy, "plugin-opts.host", obfs.host);
        $set(proxy, "plugin-opts.path", obfs.path);
    }
}
vmess = tag equals "vmess" address (vmess_uuid/vmess_aead/ws/ws_path/ws_headers/method/tls/sni/tls_fingerprint/tls_verification/fast_open/udp_relay/others)* {
    proxy.type = "vmess";
    proxy.cipher = proxy.cipher || "none";
    if (proxy.aead) {
        proxy.alterId = 0;
    } else {
        proxy.alterId = proxy.alterId || 0;
    }
    handleWebsocket();
}
trojan = tag equals "trojan" address (passwordk/ws/ws_path/ws_headers/tls/sni/tls_fingerprint/tls_verification/fast_open/udp_relay/others)* {
    proxy.type = "trojan";
    handleWebsocket();
}
https = tag equals "https" address (username password)? (sni/tls_fingerprint/tls_verification/fast_open/others)* {
    proxy.type = "http";
    proxy.tls = true;
}
http = tag equals "http" address (username password)? (fast_open/others)* {
    proxy.type = "http";
}
snell = tag equals "snell" address (snell_version/snell_psk/obfs/obfs_host/obfs_uri/fast_open/udp_relay/others)* {
    proxy.type = "snell";
    // handle obfs
    if (obfs.type == "http" || obfs.type === "tls") {
        $set(proxy, "obfs-opts.mode", obfs.type);
        $set(proxy, "obfs-opts.host", obfs.host);
        $set(proxy, "obfs-opts.path", obfs.path);
    }
}
socks5 = tag equals "socks5" address (username password)? (fast_open/others)* {
    proxy.type = "socks5";
}
socks5_tls = tag equals "socks5-tls" address (username password)? (sni/tls_fingerprint/tls_verification/fast_open/others)* {
    proxy.type = "socks5";
    proxy.tls = true;
}

address = comma server:server comma port:port {
    proxy.server = server;
    proxy.port = port;
}

server = ip/domain

ip = & {
    const start = peg$currPos;
    let j = start;
    while (j < input.length) {
        if (input[j] === ",") break;
        j++;
    }
    peg$currPos = j;
    $.ip = input.substring(start, j).trim();
    return true;
} { return $.ip; }

domain = match:[0-9a-zA-z-_.]+ { 
    const domain = match.join(""); 
    if (/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/.test(domain)) {
        return domain;
    }
}

port = digits:[0-9]+ { 
    const port = parseInt(digits.join(""), 10); 
    if (port >= 0 && port <= 65535) {
    	return port;
    }
}

username = & {
    let j = peg$currPos; 
    let start, end;
    let first = true;
    while (j < input.length) {
        if (input[j] === ',') {
            if (first) {
                start = j + 1;
                first = false;
            } else {
                end = j;
                break;
            }
        }
        j++;
    }
    const match = input.substring(start, end);
    if (match.indexOf("=") === -1) {
        $.username = match;
        peg$currPos = end;
        return true;
    }
} { proxy.username = $.username; }
password = comma match:[^,]+ { proxy.password = match.join(""); }

tls = comma "tls" equals flag:bool { proxy.tls = flag; }
sni = comma "sni" equals sni:domain { proxy.sni = sni; }
tls_verification = comma "skip-cert-verify" equals flag:bool { proxy["skip-cert-verify"] = flag; }
tls_fingerprint = comma "server-cert-fingerprint-sha256" equals tls_fingerprint:$[^,]+ { proxy["tls-fingerprint"] = tls_fingerprint.trim(); }

snell_psk = comma "psk" equals match:[^,]+ { proxy.psk = match.join(""); }
snell_version = comma "version" equals match:$[0-9]+ { proxy.version = parseInt(match.trim()); }

passwordk = comma "password" equals match:[^,]+ { proxy.password = match.join(""); }
vmess_uuid = comma "username" equals match:[^,]+ { proxy.uuid = match.join(""); }
vmess_aead = comma "vmess-aead" equals flag:bool { proxy.aead = flag; }

method = comma "encrypt-method" equals cipher:cipher {
    proxy.cipher = cipher;
}
cipher = ("aes-128-gcm"/"aes-192-gcm"/"aes-256-gcm"/"aes-128-cfb"/"aes-192-cfb"/"aes-256-cfb"/"aes-128-ctr"/"aes-192-ctr"/"aes-256-ctr"/"rc4-md5"/"xchacha20-ietf-poly1305"/"chacha20-ietf-poly1305"/"chacha20-ietf"/"chacha20-poly1305"/"chacha20"/"none");

ws = comma "ws" equals flag:bool { obfs.type = "ws"; }
ws_headers = comma "ws-headers" equals headers:$[^,]+ {
    const pairs = headers.split("|");
    const result = {};
    pairs.forEach(pair => {
        const [key, value] = pair.trim().split(":");
        result[key.trim()] = value.trim();
    })
    obfs["ws-headers"] = result;
}
ws_path = comma "ws-path" equals path:uri { obfs.path = path; }

obfs = comma "obfs" equals type:("http"/"tls") { obfs.type = type; }
obfs_host = comma "obfs-host" equals host:domain { obfs.host = host; };
obfs_uri = comma "obfs-uri" equals path:uri { obfs.path = path }
uri = $[^,]+

udp_relay = comma "udp" equals flag:bool { proxy.udp = flag; }
fast_open = comma "fast-open" equals flag:bool { proxy.tfo = flag; }

tag = match:[^=,]* { proxy.name = match.join("").trim(); }
comma = _ "," _
equals = _ "=" _
_ = [ \r\t]*
bool = b:("true"/"false") { return b === "true" }
others = comma [^=,]+ equals [^=,]+
`;
let parser;
export default function getParser() {
    if (!parser) {
        parser = peggy.generate(grammars);
    }
    return parser;
}
