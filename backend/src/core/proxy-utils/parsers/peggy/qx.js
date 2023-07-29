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

// per-parse initializer
{
	const proxy = {};
    const obfs = {};
    const $ = {};

    function handleObfs() {
        if (obfs.type === "ws" || obfs.type === "wss") {
            proxy.network = "ws";
            if (obfs.type === 'wss') {
                proxy.tls = true;
            }
            $set(proxy, "ws-opts.path", obfs.path);
            $set(proxy, "ws-opts.headers.Host", obfs.host);
        } else if (obfs.type === "over-tls") {
            proxy.tls = true;
        } else if (obfs.type === "http") {
            proxy.network = "http";
            $set(proxy, "http-opts.path", obfs.path);
            $set(proxy, "http-opts.headers.Host", obfs.host);
        }
    }
}

start = (trojan/shadowsocks/vmess/http/socks5) {
    return proxy
}

trojan = "trojan" equals address
    (password/over_tls/tls_host/tls_fingerprint/tls_verification/obfs/obfs_host/obfs_uri/tag/udp_relay/udp_over_tcp/fast_open/others)* {
    proxy.type = "trojan";
    handleObfs();
}

shadowsocks = "shadowsocks" equals address
    (password/method/obfs_ssr/obfs_ss/obfs_host/obfs_uri/ssr_protocol/ssr_protocol_param/tls_fingerprint/tls_verification/udp_relay/udp_over_tcp/fast_open/tag/others)* {
    if (proxy.protocol) {
        proxy.type = "ssr";
        // handle ssr obfs
        if (obfs.host) proxy["obfs-param"] = obfs.host;
        if (obfs.type) proxy.obfs = obfs.type;
    } else {
        proxy.type = "ss";
        // handle ss obfs
        if (obfs.type == "http" || obfs.type === "tls") {
            proxy.plugin = "obfs";
            $set(proxy, "plugin-opts", {
                mode: obfs.type
            });
        } else if (obfs.type === "ws" || obfs.type === "wss") {
            proxy.plugin = "v2ray-plugin";
            $set(proxy, "plugin-opts.mode", "websocket");
            if (obfs.type === "wss") {
                $set(proxy, "plugin-opts.tls", true);
            }
        } else if (obfs.type === 'over-tls') {
            throw new Error('ss over-tls is not supported');
        }
        if (obfs.type) {
            $set(proxy, "plugin-opts.host", obfs.host);
            $set(proxy, "plugin-opts.path", obfs.path);
        }
    }
}

vmess = "vmess" equals address
    (uuid/method/over_tls/tls_host/tls_fingerprint/tls_verification/tag/obfs/obfs_host/obfs_uri/udp_relay/udp_over_tcp/fast_open/aead/others)* {
    proxy.type = "vmess";
    proxy.cipher = proxy.cipher || "none";
    if (proxy.aead) {
        proxy.alterId = 0;
    } else {
        proxy.alterId = proxy.alterId || 0;
    }
    handleObfs();
}

http = "http" equals address 
    (username/password/over_tls/tls_host/tls_fingerprint/tls_verification/tag/fast_open/udp_relay/udp_over_tcp/others)*{
    proxy.type = "http";
}

socks5 = "socks5" equals address
    (username/password/password/over_tls/tls_host/tls_fingerprint/tls_verification/tag/fast_open/udp_relay/udp_over_tcp/others)* {
    proxy.type = "socks5";
}
    
address = server:server ":" port:port {
    proxy.server = server;
    proxy.port = port;
}
server = ip/domain

domain = match:[0-9a-zA-z-_.]+ { 
    const domain = match.join(""); 
    if (/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/.test(domain)) {
        return domain;
    }
}

ip = & {
    const start = peg$currPos;
    let end;
    let j = start;
    while (j < input.length) {
        if (input[j] === ",") break;
        if (input[j] === ":") end = j;
        j++;
    }
    peg$currPos = end || j;
    $.ip = input.substring(start, end).trim();
    return true;
} { return $.ip; }

port = digits:[0-9]+ { 
    const port = parseInt(digits.join(""), 10); 
    if (port >= 0 && port <= 65535) {
    	return port;
    }
}

username = comma "username" equals username:[^=,]+ { proxy.username = username.join("").trim(); }
password = comma "password" equals password:[^=,]+ { proxy.password = password.join("").trim(); }
uuid = comma "password" equals uuid:[^=,]+ { proxy.uuid = uuid.join("").trim(); }

method = comma "method" equals cipher:cipher { 
    proxy.cipher = cipher;
};
cipher = ("aes-128-gcm"/"aes-192-gcm"/"aes-256-gcm"/"aes-128-cfb"/"aes-192-cfb"/"aes-256-cfb"/"aes-128-ctr"/"aes-192-ctr"/"aes-256-ctr"/"rc4-md5"/"xchacha20-ietf-poly1305"/"chacha20-ietf-poly1305"/"chacha20-ietf"/"chacha20-poly1305"/"chacha20"/"none");
aead = comma "aead" equals flag:bool { proxy.aead = flag; }

udp_relay = comma "udp-relay" equals flag:bool { proxy.udp = flag; }
udp_over_tcp = comma "udp-over-tcp" equals flag:bool { throw new Error("UDP over TCP is not supported"); }
fast_open = comma "fast-open" equals flag:bool { proxy.tfo = flag; }

over_tls = comma "over-tls" equals flag:bool { proxy.tls = flag; }
tls_host = comma "tls-host" equals sni:domain { proxy.sni = sni; }
tls_verification = comma "tls-verification" equals flag:bool { 
    proxy["skip-cert-verify"] = !flag;
}
tls_fingerprint = comma "tls-cert-sha256" equals tls_fingerprint:$[^,]+ { proxy["tls-fingerprint"] = tls_fingerprint.trim(); }

obfs_ss = comma "obfs" equals type:("http"/"tls"/"wss"/"ws"/"over-tls") { obfs.type = type; return type; }
obfs_ssr = comma "obfs" equals type:("plain"/"http_simple"/"http_post"/"random_head"/"tls1.2_ticket_auth"/"tls1.2_ticket_fastauth") { obfs.type = type; return type; }
obfs = comma "obfs" equals type:("wss"/"ws"/"over-tls"/"http") { obfs.type = type; return type; };

obfs_host = comma "obfs-host" equals host:domain { obfs.host = host; }
obfs_uri = comma "obfs-uri" equals uri:uri { obfs.path = uri; }

ssr_protocol = comma "ssr-protocol" equals protocol:("origin"/"auth_sha1_v4"/"auth_aes128_md5"/"auth_aes128_sha1"/"auth_chain_a"/"auth_chain_b") { proxy.protocol = protocol; return protocol; }
ssr_protocol_param = comma "ssr-protocol-param" equals param:$[^=,]+ { proxy["protocol-param"] = param; }

uri = $[^,]+

tag = comma "tag" equals tag:[^=,]+ { proxy.name = tag.join(""); }
others = comma [^=,]+ equals [^=,]+
comma = _ "," _
equals = _ "=" _
_ = [ \r\t]*
bool = b:("true"/"false") { return b === "true" }
`;
let parser;
export default function getParser() {
    if (!parser) {
        parser = peggy.generate(grammars);
    }
    return parser;
}
