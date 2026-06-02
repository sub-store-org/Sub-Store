import peggy from 'peggy';
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
            if (proxy['ws-opts'] && proxy['ws-opts']['headers'] && proxy['ws-opts']['headers'].Host) {
                proxy['ws-opts']['headers'].Host = proxy['ws-opts']['headers'].Host.replace(/^"(.*)"$/, '$1')
            }
        }
    }
    function handleShadowTLS() {
        if (proxy['shadow-tls-password'] && !proxy['shadow-tls-version']) {
            proxy['shadow-tls-version'] = 2;
        }
    }
    function stripQuotes(value) {
        const trimmed = value.trim();
        const quote = trimmed[0];
        if (
            (quote === '"' || quote === "'") &&
            trimmed[trimmed.length - 1] === quote
        ) {
            return trimmed.slice(1, -1);
        }

        return trimmed;
    }
    function readQuotedHeaderKey(text, start) {
        const quote = text[start];
        let index = start + 1;
        let hasKey = false;

        while (index < text.length) {
            const char = text[index];
            if (char === quote) {
                return hasKey ? index + 1 : -1;
            }

            hasKey = true;
            index++;
        }

        return -1;
    }
    function startsWithQuotedHeaderKey(text) {
        const trimmed = text.trim();
        if (trimmed[0] !== '"' && trimmed[0] !== "'") return false;

        const index = readQuotedHeaderKey(trimmed, 0);
        if (index === -1) return false;

        let cursor = index;
        while (cursor < trimmed.length && /\s/.test(trimmed[cursor])) cursor++;
        return trimmed[cursor] === ":";
    }
    function stripOuterHeadersQuotes(headers) {
        const trimmed = headers.trim();
        const quote = trimmed[0];

        if (
            (quote === '"' || quote === "'") &&
            trimmed[trimmed.length - 1] === quote &&
            !startsWithQuotedHeaderKey(trimmed)
        ) {
            return trimmed.slice(1, -1);
        }

        return trimmed;
    }
    function isHeaderKeyStart(text, start) {
        let index = start;
        while (index < text.length && /\s/.test(text[index])) index++;

        if (text[index] === '"' || text[index] === "'") {
            index = readQuotedHeaderKey(text, index);
            if (index === -1) return false;
        } else {
            const keyStart = index;
            while (
                index < text.length &&
                /[!#$%&'*+\-.^_|~0-9A-Za-z]/.test(text[index])
            )
                index++;
            if (index === keyStart) return false;
        }

        while (index < text.length && /\s/.test(text[index])) index++;
        return text[index] === ":";
    }
    function isOptionStart(text, start) {
        let index = start;
        while (index < text.length && /\s/.test(text[index])) index++;

        const keyStart = index;
        while (index < text.length && /[0-9A-Za-z-]/.test(text[index])) index++;
        if (index === keyStart) return false;

        while (index < text.length && /\s/.test(text[index])) index++;
        return text[index] === "=";
    }
    function isHeaderValueQuoteEnd(text, index, pairSeparator, allowCommaEnd, containerQuote) {
        let cursor = index + 1;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor++;

        if (cursor >= text.length) return true;
        if (allowCommaEnd && text[cursor] === "," && isOptionStart(text, cursor + 1)) {
            return true;
        }
        if (text[cursor] === pairSeparator && isHeaderKeyStart(text, cursor + 1)) {
            return true;
        }
        if (containerQuote && text[cursor] === containerQuote) {
            let next = cursor + 1;
            while (next < text.length && /\s/.test(text[next])) next++;
            return next >= text.length || text[next] === ",";
        }

        return false;
    }
    function findHeaderSeparator(pair) {
        let quote = "";

        for (let index = 0; index < pair.length; index++) {
            const char = pair[index];

            if (quote) {
                if (char === quote) {
                    quote = "";
                }
                continue;
            }

            if (char === '"' || char === "'") {
                quote = char;
                continue;
            }

            if (char === ":") {
                return index;
            }
        }

        return -1;
    }
    function readUnquotedHeadersEnd(text, start, pairSeparator) {
        let index = start;
        let quote = "";
        let quoteRole = "";
        let seenSeparator = false;

        while (index < text.length) {
            const char = text[index];

            if (quote) {
                if (char === quote) {
                    if (
                        quoteRole === "key" ||
                        isHeaderValueQuoteEnd(text, index, pairSeparator, true)
                    ) {
                        quote = "";
                        quoteRole = "";
                    }
                }
                index++;
                continue;
            }

            if (char === '"' || char === "'") {
                quote = char;
                quoteRole = seenSeparator ? "value" : "key";
                index++;
                continue;
            }

            if (char === ":" && !seenSeparator) {
                seenSeparator = true;
                index++;
                continue;
            }

            if (char === pairSeparator && isHeaderKeyStart(text, index + 1)) {
                seenSeparator = false;
                index++;
                continue;
            }

            if (char === ",") break;
            index++;
        }

        return index;
    }
    function readQuotedHeadersEnd(text, start, pairSeparator) {
        const quote = text[start];
        let index = start + 1;
        let innerQuote = "";
        let quoteRole = "";
        let seenSeparator = false;

        while (index < text.length) {
            const char = text[index];

            if (innerQuote) {
                if (char === innerQuote) {
                    if (
                        quoteRole === "key" ||
                        isHeaderValueQuoteEnd(text, index, pairSeparator, false, quote)
                    ) {
                        innerQuote = "";
                        quoteRole = "";
                    }
                }
                index++;
                continue;
            }

            if (char === quote) {
                let cursor = index + 1;
                while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
                if (cursor >= text.length || text[cursor] === ",") {
                    return index + 1;
                }
            }

            if (char === '"' || char === "'") {
                innerQuote = char;
                quoteRole = seenSeparator ? "value" : "key";
                index++;
                continue;
            }

            if (char === ":" && !seenSeparator) {
                seenSeparator = true;
                index++;
                continue;
            }

            if (char === pairSeparator && isHeaderKeyStart(text, index + 1)) {
                seenSeparator = false;
                index++;
                continue;
            }
            index++;
        }

        return text.length;
    }
    function readHeadersEnd(text, start, pairSeparator) {
        let index = start;
        while (index < text.length && /\s/.test(text[index])) index++;

        if (
            (text[index] === '"' || text[index] === "'") &&
            !startsWithQuotedHeaderKey(text.slice(index))
        ) {
            return readQuotedHeadersEnd(text, index, pairSeparator);
        }

        return readUnquotedHeadersEnd(text, start, pairSeparator);
    }
    function splitHeaders(headers, pairSeparator) {
        const result = [];
        let start = 0;
        let quote = "";
        let quoteRole = "";
        let seenSeparator = false;

        for (let index = 0; index < headers.length; index++) {
            const char = headers[index];

            if (quote) {
                if (char === quote) {
                    if (
                        quoteRole === "key" ||
                        isHeaderValueQuoteEnd(headers, index, pairSeparator, false)
                    ) {
                        quote = "";
                        quoteRole = "";
                    }
                }
                continue;
            }

            if (char === '"' || char === "'") {
                quote = char;
                quoteRole = seenSeparator ? "value" : "key";
                continue;
            }

            if (char === ":" && !seenSeparator) {
                seenSeparator = true;
                continue;
            }

            if (char === pairSeparator && isHeaderKeyStart(headers, index + 1)) {
                result.push(headers.slice(start, index));
                start = index + 1;
                seenSeparator = false;
            }
        }

        result.push(headers.slice(start));
        return result;
    }
    function parseHeaders(headers, pairSeparator) {
        const result = {};
        splitHeaders(stripOuterHeadersQuotes(headers), pairSeparator).forEach((pair) => {
            const index = findHeaderSeparator(pair);
            if (index === -1) return;

            const key = stripQuotes(pair.slice(0, index));
            const value = stripQuotes(pair.slice(index + 1));

            if (key) {
                result[key] = value;
            }
        });
        return result;
    }
    function normalizeVmessSecurity(security) {
        const normalized = String(security || "").trim().toLowerCase();
        const supported = ["aes-128-gcm", "chacha20-ietf-poly1305"];
        if (!supported.includes(normalized)) return "auto";
        return normalized === "chacha20-ietf-poly1305" ? "chacha20-poly1305" : normalized;
    }
}

start = (anytls/shadowsocks/vmess/trojan/h2_connect/https/http/snell/socks5/socks5_tls/tuic/tuic_v5/wireguard/hysteria2/ssh/trust_tunnel/direct) {
    return proxy;
}

shadowsocks = tag equals "ss" address (method/passwordk/obfs/obfs_host/obfs_uri/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/udp_relay/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/udp_port/others)* {
    proxy.type = "ss";
    // handle obfs
    if (obfs.type == "http" || obfs.type === "tls") {
        proxy.plugin = "obfs";
        $set(proxy, "plugin-opts.mode", obfs.type);
        $set(proxy, "plugin-opts.host", obfs.host);
        $set(proxy, "plugin-opts.path", obfs.path);
    }
    handleShadowTLS();
}
vmess = tag equals "vmess" address (vmess_uuid/vmess_aead/ws/ws_path/ws_headers/vmess_method/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/tls/sni/tls_fingerprint/tls_verification/client_cert/fast_open/tfo/udp_relay/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "vmess";
    proxy.cipher = proxy.cipher || "auto";
    // Surfboard 与 Surge 默认不一致, 不管 Surfboard https://getsurfboard.com/docs/profile-format/proxy/external-proxy/vmess
    if (proxy.aead) {
        proxy.alterId = 0;
    } else {
        proxy.alterId = 1;
    }
    handleWebsocket();
    handleShadowTLS();
}
trojan = tag equals "trojan" address (passwordk/ws/ws_path/ws_headers/tls/sni/tls_fingerprint/tls_verification/client_cert/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/udp_relay/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "trojan";
    handleWebsocket();
    handleShadowTLS();
}
https = tag equals "https" address (username password)? (usernamek passwordk)? (headers/sni/tls_fingerprint/tls_verification/client_cert/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "http";
    proxy.tls = true;
    handleShadowTLS();
}
h2_connect = tag equals "h2-connect" address (username password)? (usernamek passwordk)? (headers/max_streams/sni/tls_fingerprint/tls_verification/client_cert/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "h2-connect";
    proxy.tls = true;
    handleShadowTLS();
}
http = tag equals "http" address (username password)? (usernamek passwordk)? (headers/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "http";
    handleShadowTLS();
}
ssh = tag equals "ssh" address (username password)? (usernamek passwordk)? (server_fingerprint/idle_timeout/private_key/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "ssh";
    handleShadowTLS();
}
snell = tag equals "snell" address (snell_version/snell_psk/obfs/obfs_host/obfs_uri/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/udp_relay/reuse/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "snell";
    // handle obfs
    if (obfs.type == "http" || obfs.type === "tls") {
        $set(proxy, "obfs-opts.mode", obfs.type);
        $set(proxy, "obfs-opts.host", obfs.host);
        $set(proxy, "obfs-opts.path", obfs.path);
    }
    handleShadowTLS();
}
tuic = tag equals "tuic" address (alpn/token/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/tls_fingerprint/tls_verification/client_cert/sni/fast_open/tfo/ecn/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/port_hopping_interval/others)* {
    proxy.type = "tuic";
    handleShadowTLS();
}
tuic_v5 = tag equals "tuic-v5" address (alpn/passwordk/uuidk/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/tls_fingerprint/tls_verification/client_cert/sni/fast_open/tfo/ecn/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/port_hopping_interval/others)* {
    proxy.type = "tuic";
    proxy.version = 5;
    handleShadowTLS();
}
wireguard = tag equals "wireguard" (section_name/no_error_alert/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "wireguard-surge";
    handleShadowTLS();
}
hysteria2 = tag equals "hysteria2" address (no_error_alert/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/sni/tls_verification/client_cert/passwordk/tls_fingerprint/download_bandwidth/ecn/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/port_hopping_interval/salamander_password/others)* {
    proxy.type = "hysteria2";
    handleShadowTLS();
}
socks5 = tag equals "socks5" address (username password)? (usernamek passwordk)? (udp_relay/no_error_alert/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/fast_open/tfo/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "socks5";
    handleShadowTLS();
}
socks5_tls = tag equals "socks5-tls" address (username password)? (usernamek passwordk)? (udp_relay/no_error_alert/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/sni/tls_fingerprint/tls_verification/client_cert/fast_open/tfo/shadow_tls_version/shadow_tls_sni/shadow_tls_password/block_quic/others)* {
    proxy.type = "socks5";
    proxy.tls = true;
    handleShadowTLS();
}
anytls = tag equals "anytls" address (passwordk/reuse/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/tls_fingerprint/tls_verification/client_cert/sni/fast_open/tfo/block_quic/others)* {
    proxy.type = "anytls";
    proxy.tls = true;
}
trust_tunnel = tag equals "trust-tunnel" address (usernamek/passwordk/headers/max_streams/reuse/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/tls_fingerprint/tls_verification/client_cert/sni/fast_open/tfo/block_quic/others)* {
    proxy.type = "trusttunnel";
    proxy.tls = true;
}

direct = tag equals "direct" (udp_relay/ip_version/underlying_proxy/tos/allow_other_interface/interface/test_url/test_udp/test_timeout/hybrid/no_error_alert/fast_open/tfo/block_quic/others)* {
    proxy.type = "direct";
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

port_hopping_interval = comma "port-hopping-interval" equals match:$[0-9]+ { proxy["hop-interval"] = parseInt(match.trim()); }

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
} { proxy.username = $.username.trim().replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
password = comma match:[^,]+ { proxy.password = match.join("").replace(/^"(.*)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }

tls = comma "tls" equals flag:bool { proxy.tls = flag; }
sni = comma "sni" equals match:[^,]+ { 
    const sni = match.join("").replace(/^"(.*)"$/, '$1');
    if (sni === "off") {
        proxy["disable-sni"] = true;
    } else {
        proxy.sni = sni;
    }
}
tls_verification = comma "skip-cert-verify" equals flag:bool { proxy["skip-cert-verify"] = flag; }
tls_fingerprint = comma "server-cert-fingerprint-sha256" equals tls_fingerprint:$[^,]+ { proxy["tls-fingerprint"] = tls_fingerprint.trim(); }
client_cert = comma "client-cert" equals match:[^,]+ { proxy["keystore-client-cert"] = stripQuotes(match.join("")); }

snell_psk = comma "psk" equals match:[^,]+ { proxy.psk = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
snell_version = comma "version" equals match:$[0-9]+ { proxy.version = parseInt(match.trim()); }

usernamek = comma "username" equals match:[^,]+ { proxy.username = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
passwordk = comma "password" equals match:[^,]+ { proxy.password = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
vmess_uuid = comma "username" equals match:[^,]+ { proxy.uuid = match.join(""); }
vmess_aead = comma "vmess-aead" equals flag:bool { proxy.aead = flag; }

method = comma "encrypt-method" equals cipher:cipher {
    proxy.cipher = cipher;
}
vmess_method = comma "encrypt-method" equals cipher:$[^,]+ {
    proxy.cipher = normalizeVmessSecurity(cipher);
}
cipher = ("aes-128-cfb"/"aes-128-ctr"/"aes-128-gcm"/"aes-192-cfb"/"aes-192-ctr"/"aes-192-gcm"/"aes-256-cfb"/"aes-256-ctr"/"aes-256-gcm"/"bf-cfb"/"camellia-128-cfb"/"camellia-192-cfb"/"camellia-256-cfb"/"cast5-cfb"/"chacha20-ietf-poly1305"/"chacha20-ietf"/"chacha20-poly1305"/"chacha20"/"des-cfb"/"idea-cfb"/"none"/"rc2-cfb"/"rc4-md5"/"rc4"/"salsa20"/"seed-cfb"/"xchacha20-ietf-poly1305"/"2022-blake3-aes-128-gcm"/"2022-blake3-aes-256-gcm");

ws = comma "ws" equals flag:bool { obfs.type = "ws"; }
ws_headers = comma "ws-headers" equals & {
    const start = peg$currPos;
    const index = readHeadersEnd(input, start, "|");

    $.headers = input.substring(start, index);
    peg$currPos = index;
    return $.headers.trim().length > 0;
} { obfs["ws-headers"] = parseHeaders($.headers, "|"); }
ws_path = comma "ws-path" equals path:uri { obfs.path = path.trim().replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
headers = comma "headers" equals & {
    const start = peg$currPos;
    const index = readHeadersEnd(input, start, ";");

    $.headers = input.substring(start, index);
    peg$currPos = index;
    return $.headers.trim().length > 0;
} { proxy.headers = parseHeaders($.headers, ";"); }

obfs = comma "obfs" equals type:("http"/"tls") { obfs.type = type; }
obfs_host = comma "obfs-host" equals match:[^,]+ { obfs.host = match.join("").replace(/^"(.*)"$/, '$1'); };
obfs_uri = comma "obfs-uri" equals path:uri { obfs.path = path }
uri = $[^,]+

udp_relay = comma "udp-relay" equals flag:bool { proxy.udp = flag; }
fast_open = comma "fast-open" equals flag:bool { proxy.tfo = flag; }
reuse = comma "reuse" equals flag:bool { proxy.reuse = flag; }
ecn = comma "ecn" equals flag:bool { proxy.ecn = flag; }
tfo = comma "tfo" equals flag:bool { proxy.tfo = flag; }
ip_version = comma "ip-version" equals match:[^,]+ { proxy["ip-version"] = match.join(""); }
section_name = comma "section-name" equals match:[^,]+ { proxy["section-name"] = match.join(""); }
no_error_alert = comma "no-error-alert" equals match:[^,]+ { proxy["no-error-alert"] = match.join(""); }
underlying_proxy = comma "underlying-proxy" equals match:[^,]+ { proxy["underlying-proxy"] = match.join(""); }
download_bandwidth = comma "download-bandwidth" equals match:[^,]+ { proxy.down = match.join(""); }
test_url = comma "test-url" equals match:[^,]+ { proxy["test-url"] = match.join(""); }
test_udp = comma "test-udp" equals match:[^,]+ { proxy["test-udp"] = match.join(""); }
test_timeout = comma "test-timeout" equals match:$[0-9]+ { proxy["test-timeout"] = parseInt(match.trim()); }
max_streams = comma "max-streams" equals match:quoted_integer { proxy["max-streams"] = match; }
quoted_integer = '"' match:$[0-9]+ '"' { return parseInt(match.trim()); } / "'" match:$[0-9]+ "'" { return parseInt(match.trim()); } / match:$[0-9]+ { return parseInt(match.trim()); }
tos = comma "tos" equals match:$[0-9]+ { proxy.tos = parseInt(match.trim()); }
interface = comma "interface" equals match:[^,]+ { proxy.interface = match.join(""); }
allow_other_interface = comma "allow-other-interface" equals flag:bool { proxy["allow-other-interface"] = flag; }
hybrid = comma "hybrid" equals flag:bool { proxy.hybrid = flag; }
idle_timeout = comma "idle-timeout" equals match:$[0-9]+ { proxy["idle-timeout"] = parseInt(match.trim()); }
private_key = comma "private-key" equals match:[^,]+ { proxy["keystore-private-key"] = stripQuotes(match.join("")); }
server_fingerprint = comma "server-fingerprint" equals match:[^,]+ { proxy["server-fingerprint"] = match.join("").replace(/^"(.*)"$/, '$1'); }
block_quic = comma "block-quic" equals match:[^,]+ { proxy["block-quic"] = match.join(""); }
udp_port = comma "udp-port" equals match:$[0-9]+ { proxy["udp-port"] = parseInt(match.trim()); }
shadow_tls_version = comma "shadow-tls-version" equals match:$[0-9]+ { proxy["shadow-tls-version"] = parseInt(match.trim()); }
shadow_tls_sni = comma "shadow-tls-sni" equals match:[^,]+ { proxy["shadow-tls-sni"] = match.join(""); }
shadow_tls_password = comma "shadow-tls-password" equals match:[^,]+ { proxy["shadow-tls-password"] = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
token = comma "token" equals match:[^,]+ { proxy.token = match.join(""); }
alpn = comma "alpn" equals match:[^,]+ { proxy.alpn = match.join(""); }
uuidk = comma "uuid" equals match:[^,]+ { proxy.uuid = match.join(""); }
salamander_password = comma "salamander-password" equals match:[^,]+ { proxy['obfs-password'] = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); proxy.obfs = 'salamander'; }

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
