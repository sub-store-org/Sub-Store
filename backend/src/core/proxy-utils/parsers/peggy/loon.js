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
    const transport = {};
    const $ = {};

    function handleTransport() {
        if (transport.type === "tcp") { /* do nothing */ }
        else if (transport.type === "ws") {
            proxy.network = "ws";
            $set(proxy, "ws-opts.path", transport.path);
            $set(proxy, "ws-opts.headers.Host", transport.host);
        } else if (transport.type === "http") {
            proxy.network = "http";
            $set(proxy, "http-opts.path", transport.path);
            $set(proxy, "http-opts.headers.Host", transport.host);
        }
    }
}

start = (shadowsocksr/shadowsocks/vmess/vless/trojan/https/http/socks5/hysteria2) {
    return proxy;
}

shadowsocksr = tag equals "shadowsocksr"i address method password (ssr_protocol/ssr_protocol_param/obfs_ssr/obfs_ssr_param/obfs_host/obfs_uri/fast_open/udp_relay/udp_port/shadow_tls_version/shadow_tls_sni/shadow_tls_password/ip_mode/block_quic/others)*{
    proxy.type = "ssr";
    // handle ssr obfs
    proxy.obfs = obfs.type;
}
shadowsocks = tag equals "shadowsocks"i address method password (obfs_typev obfs_hostv)? (obfs_ss/obfs_host/obfs_uri/fast_open/udp_relay/udp_port/shadow_tls_version/shadow_tls_sni/shadow_tls_password/ip_mode/block_quic/others)* {
    proxy.type = "ss";
    // handle ss obfs
    if (obfs.type == "http" || obfs.type === "tls") {
        proxy.plugin = "obfs";
        $set(proxy, "plugin-opts.mode", obfs.type);
        $set(proxy, "plugin-opts.host", obfs.host);
        $set(proxy, "plugin-opts.path", obfs.path);
    }
}
vmess = tag equals "vmess"i address method uuid (transport/transport_host/transport_path/over_tls/tls_name/sni/tls_verification/tls_cert_sha256/tls_pubkey_sha256/vmess_alterId/fast_open/udp_relay/ip_mode/public_key/short_id/block_quic/others)* {
    proxy.type = "vmess";
    proxy.cipher = proxy.cipher || "none";
    proxy.alterId = proxy.alterId || 0;
    handleTransport();
}
vless = tag equals "vless"i address uuid (transport/transport_host/transport_path/over_tls/tls_name/sni/tls_verification/tls_cert_sha256/tls_pubkey_sha256/fast_open/udp_relay/ip_mode/flow/public_key/short_id/block_quic/others)* {
    proxy.type = "vless";
    handleTransport();
}
trojan = tag equals "trojan"i address password (transport/transport_host/transport_path/over_tls/tls_name/sni/tls_verification/tls_cert_sha256/tls_pubkey_sha256/fast_open/udp_relay/ip_mode/block_quic/others)* {
    proxy.type = "trojan";
    handleTransport();
}
hysteria2 = tag equals "hysteria2"i address password (tls_name/sni/tls_verification/tls_cert_sha256/tls_pubkey_sha256/udp_relay/fast_open/download_bandwidth/salamander_password/ecn/ip_mode/block_quic/others)* {
    proxy.type = "hysteria2";
}
https = tag equals "https"i address (username password)? (tls_name/sni/tls_verification/tls_cert_sha256/tls_pubkey_sha256/fast_open/udp_relay/ip_mode/block_quic/others)* {
    proxy.type = "http";
    proxy.tls = true;
}
http = tag equals "http"i address (username password)? (fast_open/udp_relay/ip_mode/block_quic/others)* {
    proxy.type = "http";
}
socks5 = tag equals "socks5"i address (username password)? (over_tls/tls_name/sni/tls_verification/tls_cert_sha256/tls_pubkey_sha256/fast_open/udp_relay/ip_mode/block_quic/others)* {
    proxy.type = "socks5";
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
    throw new Error("Invalid domain: " + domain);
}

port = digits:[0-9]+ { 
    const port = parseInt(digits.join(""), 10); 
    if (port >= 0 && port <= 65535) {
    	return port;
    }
    throw new Error("Invalid port number: " + port);
}

method = comma cipher:cipher { 
    proxy.cipher = cipher;
}
cipher = ("aes-128-cfb"/"aes-128-ctr"/"aes-128-gcm"/"aes-192-cfb"/"aes-192-ctr"/"aes-192-gcm"/"aes-256-cfb"/"aes-256-ctr"/"aes-256-gcm"/"auto"/"bf-cfb"/"camellia-128-cfb"/"camellia-192-cfb"/"camellia-256-cfb"/"chacha20-ietf-poly1305"/"chacha20-ietf"/"chacha20-poly1305"/"chacha20"/"none"/"rc4-md5"/"rc4"/"salsa20"/"xchacha20-ietf-poly1305"/"2022-blake3-aes-128-gcm"/"2022-blake3-aes-256-gcm");

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
password = comma '"' match:[^"]* '"' { proxy.password = match.join(""); }
uuid = comma '"' match:[^"]+ '"' { proxy.uuid = match.join(""); }

obfs_typev = comma type:("http"/"tls") { obfs.type = type; }
obfs_hostv = comma match:[^,]+ { obfs.host = match.join(""); }

obfs_ss = comma "obfs-name" equals type:("http"/"tls") { obfs.type = type; }

obfs_ssr = comma "obfs" equals type:("plain"/"http_simple"/"http_post"/"random_head"/"tls1.2_ticket_auth"/"tls1.2_ticket_fastauth") { obfs.type = type; }
obfs_ssr_param = comma "obfs-param" equals match:$[^,]+ { proxy["obfs-param"] = match; }

obfs_host = comma "obfs-host" equals host:domain { obfs.host = host; }
obfs_uri = comma "obfs-uri" equals uri:uri { obfs.path = uri; }
uri = $[^,]+

transport = comma "transport" equals type:("tcp"/"ws"/"http") { transport.type = type; }
transport_host = comma "host" equals host:domain { transport.host = host; }
transport_path = comma "path" equals path:uri { transport.path = path; }

ssr_protocol = comma "protocol" equals protocol:("origin"/"auth_sha1_v4"/"auth_aes128_md5"/"auth_aes128_sha1"/"auth_chain_a"/"auth_chain_b") { proxy.protocol = protocol; }
ssr_protocol_param = comma "protocol-param" equals param:$[^=,]+ { proxy["protocol-param"] = param; }

vmess_alterId = comma "alterId" equals alterId:$[0-9]+ { proxy.alterId = parseInt(alterId); } 

udp_port = comma "udp-port" equals match:$[0-9]+ { proxy["udp-port"] = parseInt(match.trim()); }
shadow_tls_version = comma "shadow-tls-version" equals match:$[0-9]+ { proxy["shadow-tls-version"] = parseInt(match.trim()); }
shadow_tls_sni = comma "shadow-tls-sni" equals match:[^,]+ { proxy["shadow-tls-sni"] = match.join(""); }
shadow_tls_password = comma "shadow-tls-password" equals match:[^,]+ { proxy["shadow-tls-password"] = match.join(""); }

over_tls = comma "over-tls" equals flag:bool { proxy.tls = flag; }
tls_name = comma sni:("tls-name") equals host:domain { proxy.sni = host; }
sni = comma sni:("sni") equals host:domain { proxy.sni = host; }
tls_verification = comma "skip-cert-verify" equals flag:bool { proxy["skip-cert-verify"] = flag; }
tls_cert_sha256 = comma "tls-cert-sha256" equals match:[^,]+ { proxy["tls-fingerprint"] = match.join("").replace(/^"(.*)"$/, '$1'); }
tls_pubkey_sha256 = comma "tls-pubkey-sha256" equals match:[^,]+ { proxy["tls-pubkey-sha256"] = match.join("").replace(/^"(.*)"$/, '$1'); }

flow = comma "flow" equals match:[^,]+ { proxy["flow"] = match.join("").replace(/^"(.*)"$/, '$1'); }
public_key = comma "public-key" equals match:[^,]+ { proxy["reality-opts"] = proxy["reality-opts"] || {}; proxy["reality-opts"]["public-key"] = match.join("").replace(/^"(.*)"$/, '$1'); }
short_id = comma "short-id" equals match:[^,]+ { proxy["reality-opts"] = proxy["reality-opts"] || {}; proxy["reality-opts"]["short-id"] = match.join("").replace(/^"(.*)"$/, '$1'); }

fast_open = comma "fast-open" equals flag:bool { proxy.tfo = flag; }
udp_relay = comma "udp" equals flag:bool { proxy.udp = flag; }
ip_mode = comma "ip-mode" equals match:[^,]+ { proxy["ip-version"] = match.join(""); }

ecn = comma "ecn" equals flag:bool { proxy.ecn = flag; }
download_bandwidth = comma "download-bandwidth" equals match:[^,]+ { proxy.down = match.join(""); }
salamander_password = comma "salamander-password" equals match:[^,]+ { proxy['obfs-password'] = match.join(""); proxy.obfs = 'salamander'; }

block_quic = comma "block-quic" equals flag:bool { if(flag) proxy["block-quic"] = "on"; else proxy["block-quic"] = "off"; }

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
