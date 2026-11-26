import peggy from 'peggy';
import { normalizeInlineEchConfigList } from '../../ech-utils';
import { setSurgeXhttpOption } from '../../surge-xhttp';

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
    const shadowTLS = {};
    const xhttpOpts = { mode: "auto" };
    let xhttpEnabled = false;
    let clientFingerprint;
    let echConfig;
    const $ = {};

    function handleWebsocket() {
        if (obfs.type === "ws") {
            proxy.network = "ws";
            $set(proxy, "ws-opts.path", obfs.path);
            $set(proxy, "ws-opts.headers", obfs['ws-headers']);
            if (obfs.httpUpgrade) $set(proxy, "ws-opts.v2ray-http-upgrade", true);
            if (proxy['ws-opts'] && proxy['ws-opts']['headers'] && proxy['ws-opts']['headers'].Host) {
                proxy['ws-opts']['headers'].Host = proxy['ws-opts']['headers'].Host.replace(/^"(.*)"$/, '$1')
            }
        }
    }
    function handleShadowTLS() {
        if (shadowTLS.password && !shadowTLS.version) {
            shadowTLS.version = 2;
        }
        if (shadowTLS.password) {
            if (shadowTLS.version < 2) {
                throw new Error("shadow-tls version " + shadowTLS.version + " is not supported");
            }
            proxy.plugin = "shadow-tls";
            proxy["plugin-opts"] = {
                host: shadowTLS.host,
                password: shadowTLS.password,
                version: shadowTLS.version,
            };
            if (proxy.alpn) {
                $set(proxy, "plugin-opts.alpn", proxy.alpn);
                delete proxy.alpn;
            }
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
    function isQuotedEscape(text, index) {
        return text[index] === "\\" &&
            (text[index + 1] === '"' || text[index + 1] === "\\");
    }
    function unescapeQuotedValue(value) {
        return value.replace(/\\(["\\])/g, "$1");
    }
    function readQuotedHeaderKey(text, start) {
        const quote = text[start];
        const withEscapes = proxy.type === "vless" && quote === '"';
        let index = start + 1;
        let hasKey = false;

        while (index < text.length) {
            const char = text[index];
            if (withEscapes && isQuotedEscape(text, index)) {
                hasKey = true;
                index += 2;
                continue;
            }
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
        const withEscapes = proxy.type === "vless";
        let index = start + 1;
        let innerQuote = "";
        let quoteRole = "";
        let seenSeparator = false;

        while (index < text.length) {
            const char = text[index];
            if (withEscapes && isQuotedEscape(text, index)) {
                index += 2;
                continue;
            }

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
    function splitHeaders(headers, pairSeparator, withEscapes) {
        const result = [];
        let start = 0;
        let quote = "";
        let quoteRole = "";
        let seenSeparator = false;

        for (let index = 0; index < headers.length; index++) {
            const char = headers[index];
            if (withEscapes && isQuotedEscape(headers, index)) {
                index++;
                continue;
            }

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
        const trimmed = headers.trim();
        const content = stripOuterHeadersQuotes(trimmed);
        const withEscapes = proxy.type === "vless" && content !== trimmed;
        splitHeaders(content, pairSeparator, withEscapes).forEach((pair) => {
            const index = findHeaderSeparator(pair);
            if (index === -1) return;

            const key = stripQuotes(pair.slice(0, index));
            const value = stripQuotes(pair.slice(index + 1));

            if (key) {
                result[key] = withEscapes ? unescapeQuotedValue(value) : value;
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
    function parseAlpn(value) {
        return stripQuotes(value)
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== "");
    }
}

start = (masque/anytls/shadowsocks/vmess/vless/trojan/h2_connect/https/http/snell/socks5/socks5_tls/tuic/tuic_v5/wireguard/hysteria2/ssh/trust_tunnel/direct/external) {
    if (
        ["auto", "none", "apple-26", "chromium-155"].includes(clientFingerprint) &&
        proxy.network !== "h3" &&
        (proxy.tls || proxy.type === "trojan")
    ) {
        proxy._surge_client_fingerprint = clientFingerprint;
        if (clientFingerprint === "apple-26") proxy["client-fingerprint"] = "ios";
        if (clientFingerprint === "chromium-155") proxy["client-fingerprint"] = "chrome";
    }
    if (
        echConfig !== undefined &&
        (proxy.tls || ["trojan", "tuic", "hysteria2"].includes(proxy.type))
    ) {
        if (proxy["reality-opts"]) error("ECH cannot be combined with REALITY");
        // Preserve malformed ECH for export validation so another parser cannot discard it.
        const config = options.normalizeInlineEchConfigList(echConfig) ?? echConfig;
        proxy["ech-opts"] = { enable: true, config };
    }
    return proxy;
}

shadowsocks = tag equals "ss" address (method/passwordk/obfs/obfs_host/obfs_uri/udp_relay/alpn/shadow_tls_version/shadow_tls_sni/shadow_tls_password/udp_port/proxy_policy_parameter/others)* {
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
vmess = tag equals "vmess" address (vmess_uuid/vmess_aead/ws/ws_http_upgrade/ws_path/ws_headers/vmess_method/tls/sni/cert_verify_name/alpn/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/udp_relay/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
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
vless = tag equals vless_address (vless_username/vless_option/reality_option/ws/ws_http_upgrade/ws_path/ws_headers/grpc/grpc_service_name/grpc_mode/grpc_authority/xhttp/xhttp_headers/xhttp_option/tls/sni/cert_verify_name/alpn/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/udp_relay/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy["packet-encoding"] = "xudp";
    if (proxy["reality-opts"] && proxy["reality-opts"]["public-key"]) proxy.tls = true;
    if (xhttpEnabled) {
        proxy.network = "xhttp";
        proxy["xhttp-opts"] = xhttpOpts;
    } else {
        handleWebsocket();
    }
    handleShadowTLS();
}
vless_address = "vless" address { proxy.type = "vless"; }
trojan = tag equals "trojan" address (passwordk/ws/ws_http_upgrade/ws_path/ws_headers/tls/sni/cert_verify_name/alpn/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/udp_relay/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "trojan";
    handleWebsocket();
    handleShadowTLS();
}
https = tag equals "https" address (username password)? (usernamek passwordk)? (headers/sni/cert_verify_name/alpn/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "http";
    proxy.tls = true;
    handleShadowTLS();
}
h2_connect = tag equals "h2-connect" address (username password)? (usernamek passwordk)? (headers/max_streams/sni/cert_verify_name/alpn/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "h2-connect";
    proxy.tls = true;
    handleShadowTLS();
}
http = tag equals "http" address (username password)? (usernamek passwordk)? (headers/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "http";
    handleShadowTLS();
}
ssh = tag equals "ssh" address (username password)? (usernamek passwordk)? (server_fingerprint/idle_timeout/private_key/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "ssh";
    handleShadowTLS();
}
snell = tag equals ("snell"i/"opensnell"i) address (snell_version/snell_mode/snell_psk/obfs/obfs_host/obfs_uri/udp_relay/reuse/alpn/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "snell";
    // handle obfs
    if (obfs.type == "http" || obfs.type === "tls") {
        $set(proxy, "obfs-opts.mode", obfs.type);
        $set(proxy, "obfs-opts.host", obfs.host);
        $set(proxy, "obfs-opts.path", obfs.path);
    }
    handleShadowTLS();
}
tuic = tag equals "tuic" address (alpn/token/tls_fingerprint/tls_verification/client_cert/ech_config/sni/cert_verify_name/shadow_tls_version/shadow_tls_sni/shadow_tls_password/port_hopping/port_hopping_interval/proxy_policy_parameter/others)* {
    proxy.type = "tuic";
    handleShadowTLS();
}
tuic_v5 = tag equals "tuic-v5" address (alpn/passwordk/uuidk/tls_fingerprint/tls_verification/client_cert/ech_config/sni/cert_verify_name/shadow_tls_version/shadow_tls_sni/shadow_tls_password/port_hopping/port_hopping_interval/proxy_policy_parameter/others)* {
    proxy.type = "tuic";
    proxy.version = 5;
    handleShadowTLS();
}
wireguard = tag equals "wireguard" (section_name/common_policy_parameter/proxy_only_parameter/ignored_policy_parameter)* {
    if (!proxy["section-name"]) error("WireGuard requires section-name");
    proxy.type = "wireguard-surge";
}
hysteria2 = tag equals "hysteria2" address (sni/cert_verify_name/alpn/tls_verification/client_cert/ech_config/passwordk/tls_fingerprint/download_bandwidth/shadow_tls_version/shadow_tls_sni/shadow_tls_password/port_hopping/port_hopping_interval/salamander_password/gecko_password/proxy_policy_parameter/others)* {
    proxy.type = "hysteria2";
    handleShadowTLS();
}
socks5 = tag equals "socks5" address (username password)? (usernamek passwordk)? (udp_relay/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "socks5";
    handleShadowTLS();
}
socks5_tls = tag equals "socks5-tls" address (username password)? (usernamek passwordk)? (udp_relay/sni/cert_verify_name/alpn/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/shadow_tls_version/shadow_tls_sni/shadow_tls_password/proxy_policy_parameter/others)* {
    proxy.type = "socks5";
    proxy.tls = true;
    handleShadowTLS();
}
anytls = tag equals "anytls" address (passwordk/reuse/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/sni/cert_verify_name/alpn/proxy_policy_parameter/others)* {
    proxy.type = "anytls";
    proxy.tls = true;
}
trust_tunnel = tag equals "trust-tunnel" address (usernamek/passwordk/client_random_auth_key/headers/max_streams/reuse/tls_fingerprint/client_fingerprint/tls_verification/client_cert/ech_config/sni/cert_verify_name/alpn/h3/proxy_policy_parameter/others)* {
    proxy.type = "trusttunnel";
    proxy.tls = true;
}
masque = tag equals "masque" address (usernamek/passwordk/port_hopping/port_hopping_interval/tls_fingerprint/tls_verification/client_cert/ech_config/sni/cert_verify_name/alpn/udp_relay/proxy_policy_parameter/others)* {
    proxy.type = "masque-surge";
    proxy.tls = true;
}

direct = tag equals "direct"i (common_policy_parameter/interface_parameter/udp_relay/ignored_policy_parameter)* {
    proxy.type = "direct";
}

external = tag equals "external" (external_exec/external_local_port/external_arg/external_address/udp_relay/proxy_policy_parameter/ignored_policy_parameter)* {
    proxy.type = "external";
    proxy.args = proxy.args || [];
    proxy.addresses = proxy.addresses || [];
}
external_exec = comma "exec" equals value:quoted_value { if (proxy.exec === undefined) proxy.exec = value; }
external_local_port = comma "local-port" equals value:quoted_value { if (proxy["local-port"] === undefined) proxy["local-port"] = value; }
external_arg = comma "args" equals value:quoted_value {
    proxy.args = proxy.args || [];
    proxy.args.push(value);
}
external_address = comma "addresses" equals value:quoted_value {
    proxy.addresses = proxy.addresses || [];
    proxy.addresses.push(value);
}

proxy_policy_parameter = common_policy_parameter / interface_parameter / proxy_only_parameter
common_policy_parameter = ip_version / hybrid / tfo / fast_open / tos / block_quic / test_url / test_timeout / test_udp
interface_parameter = interface / allow_other_interface / dns_follow_interface
proxy_only_parameter = no_error_alert / ecn / underlying_proxy
ignored_policy_parameter = comma [^=,]+ equals quoted_value

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

port_hopping = comma "port-hopping" equals value:(
    '"' _ list:port_hopping_list _ '"' { return list; }
    / "'" _ list:port_hopping_list _ "'" { return list; }
    / port_hopping_list
) &(_ ("," / !.)) { proxy.ports = value.replace(/\s+/g, "").replace(/;/g, ","); }
port_hopping_list = $(port_hopping_range (_ [,;] _ port_hopping_range)*)
port_hopping_range = [0-9]+ ("-" [0-9]+)?
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
cert_verify_name = comma "server-cert-verify-name" equals match:[^,]+ { proxy["name-cert-verify"] = stripQuotes(match.join("")); }
tls_verification = comma "skip-cert-verify" equals flag:bool { proxy["skip-cert-verify"] = flag; }
tls_fingerprint = comma "server-cert-fingerprint-sha256" equals tls_fingerprint:$[^,]+ { proxy["tls-fingerprint"] = tls_fingerprint.trim(); }
client_fingerprint = comma "client-fingerprint" equals value:quoted_value { clientFingerprint = value.trim().toLowerCase(); }
client_cert = comma "client-cert" equals match:[^,]+ { proxy["keystore-client-cert"] = stripQuotes(match.join("")); }
ech_config = comma "ech-config" equals value:quoted_value { echConfig = value; }

snell_psk = comma "psk" equals value:quoted_value { proxy.psk = value; }
snell_version = comma "version" equals match:$[0-9]+ { proxy.version = parseInt(match.trim()); }
snell_mode = comma "mode" equals match:[^,]+ {
    const mode = stripQuotes(match.join("")).trim();
    if (["default", "unshaped", "unsafe-raw"].includes(mode)) {
        proxy.mode = mode;
    }
}

usernamek = comma "username" equals match:[^,]+ { proxy.username = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
passwordk = comma "password" equals match:[^,]+ { proxy.password = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
vmess_uuid = comma "username" equals match:[^,]+ { proxy.uuid = match.join(""); }
vmess_aead = comma "vmess-aead" equals flag:bool { proxy.aead = flag; }
// shortcut: keep text IDs as given, convert them to UUIDv5 when a target requires it.
vless_username = comma "username" equals value:quoted_value { proxy.uuid = value.trim(); }
vless_option = comma key:("flow"/"encryption") equals value:quoted_value { proxy[key] = value.trim(); }
reality_option = comma "reality-" key:("public-key"/"short-id") equals value:quoted_value { $set(proxy, "reality-opts." + key, value.trim()); }
client_random_auth_key = comma "client-random-auth-key" equals value:$[^,]* { proxy["client-random-auth-key"] = stripQuotes(value); }

method = comma "encrypt-method" equals cipher:cipher {
    proxy.cipher = cipher;
}
vmess_method = comma "encrypt-method" equals cipher:$[^,]+ {
    proxy.cipher = normalizeVmessSecurity(cipher);
}
cipher = ("aes-128-cfb"/"aes-128-ctr"/"aes-128-gcm"/"aes-192-cfb"/"aes-192-ctr"/"aes-192-gcm"/"aes-256-cfb"/"aes-256-ctr"/"aes-256-gcm"/"bf-cfb"/"camellia-128-cfb"/"camellia-192-cfb"/"camellia-256-cfb"/"cast5-cfb"/"chacha20-ietf-poly1305"/"chacha20-ietf"/"chacha20-poly1305"/"chacha20"/"des-cfb"/"idea-cfb"/"none"/"rc2-cfb"/"rc4-md5"/"rc4"/"salsa20"/"seed-cfb"/"xchacha20-ietf-poly1305"/"2022-blake3-aes-128-gcm"/"2022-blake3-aes-256-gcm");

ws = comma "ws" equals flag:bool { if (flag) obfs.type = "ws"; }
ws_http_upgrade = comma "ws-http-upgrade" equals flag:bool { obfs.httpUpgrade = flag; }
ws_headers = comma "ws-headers" equals value:pipe_headers { obfs["ws-headers"] = value; }
pipe_headers = & {
    const start = peg$currPos;
    const index = readHeadersEnd(input, start, "|");

    $.headers = input.substring(start, index);
    peg$currPos = index;
    return $.headers.trim().length > 0;
} { return parseHeaders($.headers, "|"); }
ws_path = comma "ws-path" equals path:(vless_quoted_value / value:uri { return stripQuotes(value); }) { obfs.path = path; }
grpc = comma "grpc" equals flag:bool { if (flag) proxy.network = "grpc"; }
grpc_service_name = comma "grpc-service-name" equals value:quoted_value { $set(proxy, "grpc-opts.grpc-service-name", value.trim()); }
grpc_mode = comma "grpc-mode" equals value:quoted_value { $set(proxy, "grpc-opts._grpc-type", value.trim()); }
grpc_authority = comma "grpc-authority" equals value:quoted_value { $set(proxy, "grpc-opts._grpc-authority", value.trim()); }
xhttp = comma "xhttp" equals flag:bool { xhttpEnabled = flag; }
xhttp_headers = comma "xhttp-headers" equals value:pipe_headers {
    for (const key of Object.keys(value)) {
        if (/^host$/i.test(key)) delete value[key];
    }
    xhttpOpts.headers = value;
}
xhttp_option = comma "xhttp-" key:$[a-z0-9-]+ equals value:quoted_value {
    options.setSurgeXhttpOption(xhttpOpts, key, value.trim());
}
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
fast_open = comma "fast-open" equals flag:policy_bool { proxy.tfo = flag; }
reuse = comma "reuse" equals flag:bool { proxy.reuse = flag; }
ecn = comma "ecn" equals mode:policy_toggle { if (mode !== undefined) proxy.ecn = mode; }
tfo = comma "tfo" equals flag:policy_bool { proxy.tfo = flag; }
ip_version = comma "ip-version" equals value:quoted_value { proxy["ip-version"] = value.trim(); }
section_name = comma "section-name" equals value:quoted_value { proxy["section-name"] = value.trim(); }
no_error_alert = comma "no-error-alert" equals value:quoted_value { proxy["no-error-alert"] = value.trim(); }
underlying_proxy = comma "underlying-proxy" equals value:quoted_value { proxy["underlying-proxy"] = value.trim(); }
download_bandwidth = comma "download-bandwidth" equals match:[^,]+ { proxy.down = match.join(""); }
test_url = comma "test-url" equals value:quoted_value { proxy["test-url"] = value.trim(); }
test_udp = comma "test-udp" equals value:quoted_value { proxy["test-udp"] = value.trim(); }
test_timeout = comma "test-timeout" equals value:quoted_value {
    const seconds = value.trim();
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(seconds)) proxy["test-timeout"] = Number(seconds);
}
max_streams = comma "max-streams" equals match:quoted_integer { proxy["max-streams"] = match; }
quoted_integer = '"' match:$[0-9]+ '"' { return parseInt(match.trim()); } / "'" match:$[0-9]+ "'" { return parseInt(match.trim()); } / match:$[0-9]+ { return parseInt(match.trim()); }
tos = comma "tos" equals value:quoted_value {
    const text = value.trim();
    proxy.tos = /^(?:\d+|0x[\da-f]+)$/i.test(text) ? Number(text) : text;
}
interface = comma "interface" equals value:quoted_value { proxy.interface = value.trim(); }
allow_other_interface = comma "allow-other-interface" equals flag:policy_bool { proxy["allow-other-interface"] = flag; }
dns_follow_interface = comma "dns-follow-interface" equals flag:policy_bool { proxy["dns-follow-interface"] = flag; }
hybrid = comma "hybrid" equals mode:policy_toggle { if (mode !== undefined) proxy.hybrid = mode; }
policy_bool = value:quoted_value &{ return /^(?:true|false)$/.test(value.trim()); } { return value.trim() === "true"; }
policy_toggle = value:quoted_value {
    const mode = value.trim();
    if (mode === "true" || mode === "false") return mode === "true";
    if (["auto", "on", "off"].includes(mode)) return mode;
}
idle_timeout = comma "idle-timeout" equals match:$[0-9]+ { proxy["idle-timeout"] = parseInt(match.trim()); }
private_key = comma "private-key" equals match:[^,]+ { proxy["keystore-private-key"] = stripQuotes(match.join("")); }
server_fingerprint = comma "server-fingerprint" equals match:[^,]+ { proxy["server-fingerprint"] = match.join("").replace(/^"(.*)"$/, '$1'); }
block_quic = comma "block-quic" equals value:quoted_value { proxy["block-quic"] = value.trim(); }
udp_port = comma "udp-port" equals match:$[0-9]+ { proxy["udp-port"] = parseInt(match.trim()); }
shadow_tls_version = comma "shadow-tls-version" equals match:$[0-9]+ { shadowTLS.version = parseInt(match.trim()); }
shadow_tls_sni = comma "shadow-tls-sni" equals match:[^,]+ { shadowTLS.host = match.join(""); }
shadow_tls_password = comma "shadow-tls-password" equals match:[^,]+ { shadowTLS.password = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); }
token = comma "token" equals match:[^,]+ { proxy.token = match.join(""); }
alpn = comma "alpn" equals match:quoted_value {
    const values = parseAlpn(match);
    if (values.length > 0) proxy.alpn = values;
}
h3 = comma "h3" equals flag:bool { if (flag) proxy.network = "h3"; }
quoted_value
    = '"' value:$(("\\" ('"' / "\\") / [^"])*) '"' &(_ ("," / !.)) { return proxy.type === "vless" ? unescapeQuotedValue(value) : value; }
    / '"' match:$[^"]* '"' { return match; }
    / "'" match:$[^']* "'" { return proxy.type === "vless" ? unescapeQuotedValue(match) : match; }
    / value:uri { return value.trim(); }
vless_quoted_value = &{ return proxy.type === "vless"; } value:quoted_value { return value.trim(); }
uuidk = comma "uuid" equals match:[^,]+ { proxy.uuid = match.join(""); }
salamander_password = comma "salamander-password" equals match:[^,]+ { proxy['obfs-password'] = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); proxy.obfs = 'salamander'; }
gecko_password = comma "gecko-password" equals match:[^,]+ { proxy['obfs-password'] = match.join("").replace(/^"(.*?)"$/, '$1').replace(/^'(.*?)'$/, '$1'); proxy.obfs = 'gecko'; }

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
        const generated = peggy.generate(grammars);
        parser = {
            parse: (input) =>
                generated.parse(input, {
                    normalizeInlineEchConfigList,
                    setSurgeXhttpOption,
                }),
        };
    }
    return parser;
}
