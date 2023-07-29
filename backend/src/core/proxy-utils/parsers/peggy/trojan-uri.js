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

  function toBool(str) {
    if (typeof str === 'undefined' || str === null) return undefined;
    return /(TRUE)|1/i.test(str);
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

trojan = "trojan://" password:password "@" server:server ":" port:port params? name:name?{
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
  proxy["skip-cert-verify"] = toBool(params["allowInsecure"]);
  proxy.sni = params["sni"] || params["peer"];

  if (toBool(params["ws"])) {
    proxy.network = "ws";
    $set(proxy, "ws-opts.path", params["wspath"]);
  }

  proxy.udp = toBool(params["udp"]);
  proxy.tfo = toBool(params["tfo"]);
}

param = kv/single;

kv = key:$[a-z]i+ "=" value:$[^&#]i+ {
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
