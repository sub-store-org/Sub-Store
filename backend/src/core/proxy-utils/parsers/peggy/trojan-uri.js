// trojan-parser.js

import {
  extractPathQueryParam,
  getPathQueryParam,
  parseSafeIntegerValue,
} from '../../transport-path';
import { isIPv6 } from '@/utils';

const unsafePathSegments = new Set(["__proto__", "constructor", "prototype"]);

let parser;

function $set(obj, path, value) {
  if (Object(obj) !== obj) return obj;
  if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
  if (path.some((segment) => unsafePathSegments.has(segment))) {
    throw new Error("Unsafe property path");
  }

  path
    .slice(0, -1)
    .reduce((a, c, i) => (
      Object.prototype.hasOwnProperty.call(a, c) && Object(a[c]) === a[c]
        ? a[c]
        : (a[c] = Math.abs(path[i + 1]) >> 0 === +path[i + 1] ? [] : {})
    ), obj)[path[path.length - 1]] = value;

  return obj;
}

function toBool(str) {
  if (str == null) return undefined;
  return /(TRUE)|1/i.test(str);
}

function isNumericEarlyData(value) {
  return parseSafeIntegerValue(value) != null;
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}


function parseTrojan(url) {
  const proxy = {};

  const match = url.match(
    /^trojan:\/\/([^@]+)@(\[[^\]]+\]|[^/?#]+):(\d+)(?:\/)?(?:\?([^#]*))?(?:#(.*))?$/
  );

  if (!match) {
    throw new Error("Invalid trojan url");
  }

  const [
    ,
    password,
    server,
    port,
    query,
    name
  ] = match;

  const normalizedServer = server.replace(/^\[|\]$/g, "");
  if ((server.startsWith("[") || server.includes(":")) && !isIPv6(normalizedServer)) {
    throw new Error(`Invalid server: ${server}`);
  }


  proxy.type = "trojan";
  proxy.password = decode(password);
  proxy.server = server;
  proxy.port = Number(port);
  if (!Number.isSafeInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }

  proxy.name = name
    ? decode(name)
    : `${server}:${port}`;


  const params = {};

  if (query) {
    for (const item of query.split("&")) {
      const separatorIndex = item.indexOf("=");
      const key = separatorIndex === -1 ? item : item.slice(0, separatorIndex);
      params[key] = separatorIndex === -1
        ? true
        : decode(item.slice(separatorIndex + 1));
    }
  }


  proxy["skip-cert-verify"] =
    toBool(params.allowInsecure);

  proxy.sni =
    params.sni || params.peer;

  proxy["client-fingerprint"] =
    params.fp;

  proxy["tls-fingerprint"] =
    params.pcs;

  proxy._vcn = params.vcn
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  proxy["name-cert-verify"] =
    proxy._vcn?.[0];


  if (params.alpn) {
    proxy.alpn = params.alpn.split(",");
  }


  if (toBool(params.ws)) {
    proxy.network = "ws";

    $set(
      proxy,
      "ws-opts.path",
      params.wspath
    );
  }


  if (params.type) {

    let httpupgrade = false;
    let httpUpgradeEd = "";
    let pathEarlyData = "";

    proxy.network = params.type;


    if (proxy.network === "httpupgrade") {
      proxy.network = "ws";
      httpupgrade = true;
    }


    if (proxy.network === "grpc") {

      proxy["grpc-opts"] = {
        "grpc-service-name": params.serviceName,
        "_grpc-type": params.mode,
        "_grpc-authority": params.authority,
      };

    } else {


      if (params.path) {

        let path = params.path;


        if (proxy.network === "ws") {

          const ed = getPathQueryParam(path, "ed");


          if (isNumericEarlyData(ed)) {

            path = extractPathQueryParam(path, "ed").path;


            if (httpupgrade)
              httpUpgradeEd = ed;
            else
              pathEarlyData = ed;
          }
        }


        $set(
          proxy,
          `${proxy.network}-opts.path`,
          path
        );
      }


      if (params.host) {

        $set(
          proxy,
          `${proxy.network}-opts.headers.Host`,
          params.host
        );

      }


      if (httpupgrade) {

        httpUpgradeEd =
          httpUpgradeEd ||
          (
            isNumericEarlyData(params.ed)
              ? String(params.ed)
              : ""
          );


        $set(
          proxy,
          "ws-opts.v2ray-http-upgrade",
          true
        );


        if (httpUpgradeEd) {

          $set(
            proxy,
            "ws-opts.v2ray-http-upgrade-fast-open",
            true
          );


          $set(
            proxy,
            "ws-opts._v2ray-http-upgrade-ed",
            httpUpgradeEd
          );
        }

      } else if (
        proxy.network === "ws" &&
        pathEarlyData
      ) {

        $set(
          proxy,
          "ws-opts.max-early-data",
          parseSafeIntegerValue(pathEarlyData)
        );


        $set(
          proxy,
          "ws-opts.early-data-header-name",
          "Sec-WebSocket-Protocol"
        );
      }
    }


    if (params.security === "reality") {

      const opts = {};

      if (params.pbk)
        opts["public-key"] = params.pbk;

      if (params.sid)
        opts["short-id"] = params.sid;

      if (params.spx)
        opts["_spider-x"] = params.spx;

      if (params.mode)
        proxy._mode = params.mode;

      if (params.extra)
        proxy._extra = params.extra;


      if (Object.keys(opts).length) {
        $set(
          proxy,
          "reality-opts",
          opts
        );
      }
    }
  }


  proxy.udp = toBool(params.udp);
  proxy.tfo = toBool(params.tfo);


  return proxy;
}


export default function getParser() {
  if (!parser) {
    parser = {
      parse: parseTrojan
    };
  }

  return parser;
}
