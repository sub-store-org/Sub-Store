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

  function toBool(str) {
    if (typeof str === 'undefined' || str === null) return undefined;
    return /(TRUE)|1/i.test(str);
  }

  function decodeQueryComponent(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, '%20'));
    } catch (e) {
      return value;
    }
  }

  function splitQueryPart(part) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      return {
        key: decodeQueryComponent(part),
        value: '',
      };
    }

    return {
      key: decodeQueryComponent(part.slice(0, separatorIndex)),
      value: decodeQueryComponent(part.slice(separatorIndex + 1)),
    };
  }

  function getPathQueryParam(path, paramName) {
    const queryIndex = path.indexOf('?');
    if (queryIndex === -1) return '';

    const query = path.slice(queryIndex + 1);
    for (const part of query.split('&')) {
      if (part === '') continue;

      const parsed = splitQueryPart(part);
      if (parsed.key === paramName && parsed.value !== '') {
        return parsed.value;
      }
    }

    return '';
  }

  function extractPathQueryParam(path, paramName) {
    const queryIndex = path.indexOf('?');
    if (queryIndex === -1) {
      return {
        path,
        value: '',
      };
    }

    const basePath = path.slice(0, queryIndex);
    const query = path.slice(queryIndex + 1);
    const keptParts = [];
    let value = '';

    for (const part of query.split('&')) {
      if (part === '') continue;

      const parsed = splitQueryPart(part);
      if (parsed.key === paramName) {
        if (value === '' && parsed.value !== '') {
          value = parsed.value;
        }
        continue;
      }

      keptParts.push(part);
    }

    return {
      path: keptParts.length > 0 ? basePath + '?' + keptParts.join('&') : basePath,
      value,
    };
  }

  function parseEarlyDataSize(value) {
    if (value == null || !/^\d+$/.test(String(value))) return null;

    const parsed = parseInt(String(value), 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  function isNumericEarlyData(value) {
    return parseEarlyDataSize(value) != null;
  }
}}

{
  const proxy = {};
  const obfs = {};
  const $ = {};
  const params = {};
}

start = (trojan) {
  return proxy
}

trojan = "trojan://" password:password "@" server:server ":" port:port "/"? params? name:name?{
  proxy.type = "trojan";
  proxy.password = password;
  proxy.server = server;
  proxy.port = port;
  proxy.name = name;

  // name may be empty
  if (!proxy.name) {
    proxy.name = server + ":" + port;
  }
};

password = match:$[^@]+ {
  return decodeURIComponent(match);
};

server = ip/domain;

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
  } else {
    throw new Error("Invalid port: " + port);
  }
}

params = "?" head:param tail:("&"@param)* {
  for (const [key, value] of Object.entries(params)) {
    params[key] = decodeURIComponent(value);
  }
  proxy["skip-cert-verify"] = toBool(params["allowInsecure"]);
  proxy.sni = params["sni"] || params["peer"];
  proxy['client-fingerprint'] = params.fp;
  proxy['tls-fingerprint'] = params.pcs;
  proxy.alpn = params.alpn ? decodeURIComponent(params.alpn).split(',') : undefined;

  if (toBool(params["ws"])) {
    proxy.network = "ws";
    $set(proxy, "ws-opts.path", params["wspath"]);
  }
  
  if (params["type"]) {
    let httpupgrade
    let httpUpgradeEd = ''
    let pathEarlyData = ''
    proxy.network = params["type"]
    if(proxy.network === 'httpupgrade') {
      proxy.network = 'ws'
      httpupgrade = true
    }
    if (['grpc'].includes(proxy.network)) {
        proxy[proxy.network + '-opts'] = {
            'grpc-service-name': params["serviceName"],
            '_grpc-type': params["mode"],
            '_grpc-authority': params["authority"],
        };
    } else {
      if (params["path"]) {
        let transportPath = params["path"]
        if (proxy.network === 'ws') {
          const pathEd = getPathQueryParam(transportPath, 'ed')
          if (isNumericEarlyData(pathEd)) {
            transportPath = extractPathQueryParam(transportPath, 'ed').path
            if (httpupgrade) {
              httpUpgradeEd = pathEd
            } else {
              pathEarlyData = pathEd
            }
          }
        }
        $set(proxy, proxy.network+"-opts.path", transportPath);
      }
      if (params["host"]) {
        $set(proxy, proxy.network+"-opts.headers.Host", decodeURIComponent(params["host"])); 
      }
      if (httpupgrade) {
        httpUpgradeEd = httpUpgradeEd || (isNumericEarlyData(params.ed) ? String(params.ed) : '')
        $set(proxy, proxy.network+"-opts.v2ray-http-upgrade", true); 
        if (httpUpgradeEd !== '') {
          $set(proxy, proxy.network+"-opts.v2ray-http-upgrade-fast-open", true);
          $set(proxy, proxy.network+"-opts._v2ray-http-upgrade-ed", httpUpgradeEd);
        }
      } else if (proxy.network === 'ws' && pathEarlyData !== '') {
        $set(proxy, proxy.network+"-opts.max-early-data", parseEarlyDataSize(pathEarlyData));
        $set(proxy, proxy.network+"-opts.early-data-header-name", 'Sec-WebSocket-Protocol');
      }
    }
    if (['reality'].includes(params.security)) {
      const opts = {};
      if (params.pbk) {
        opts['public-key'] = params.pbk;
      }
      if (params.sid) {
        opts['short-id'] = params.sid;
      }
      if (params.spx) {
        opts['_spider-x'] = params.spx;
      }
      if (params.mode) {
        proxy._mode = params.mode;
      }
      if (params.extra) {
        proxy._extra = params.extra;
      }
      if (Object.keys(opts).length > 0) {
        $set(proxy, params.security+"-opts", opts); 
      }
    }
  }

  proxy.udp = toBool(params["udp"]);
  proxy.tfo = toBool(params["tfo"]);
}

param = kv/single;

kv = key:$[a-z]i+ "=" value:$[^&#]i* {
  params[key] = value;
}

single = key:$[a-z]i+ {
  params[key] = true;
};

name = "#" + match:$.* {
  return decodeURIComponent(match);
}
`;
let parser;
export default function getParser() {
    if (!parser) {
        parser = peggy.generate(grammars);
    }
    return parser;
}
