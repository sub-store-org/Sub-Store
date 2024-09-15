import * as ipAddress from 'ip-address';
// source: https://stackoverflow.com/a/36760050
const IPV4_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/;

// source: https://ihateregex.io/expr/ipv6/
const IPV6_REGEX =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

function isIPv4(ip) {
    return IPV4_REGEX.test(ip);
}

function isIPv6(ip) {
    return IPV6_REGEX.test(ip);
}

function isValidPortNumber(port) {
    return /^((6553[0-5])|(655[0-2][0-9])|(65[0-4][0-9]{2})|(6[0-4][0-9]{3})|([1-5][0-9]{4})|([0-5]{0,5})|([0-9]{1,4}))$/.test(
        port,
    );
}

function isNotBlank(str) {
    return typeof str === 'string' && str.trim().length > 0;
}

function getIfNotBlank(str, defaultValue) {
    return isNotBlank(str) ? str : defaultValue;
}

function isPresent(obj) {
    return typeof obj !== 'undefined' && obj !== null;
}

function getIfPresent(obj, defaultValue) {
    return isPresent(obj) ? obj : defaultValue;
}

function getPolicyDescriptor(str) {
    if (!str) return {};
    return /^.+?\s*?=\s*?.+?\s*?,.+?/.test(str)
        ? {
              'policy-descriptor': str,
          }
        : {
              policy: str,
          };
}

// const utf8ArrayToStr =
//     typeof TextDecoder !== 'undefined'
//         ? (v) => new TextDecoder().decode(new Uint8Array(v))
//         : (function () {
//               var charCache = new Array(128); // Preallocate the cache for the common single byte chars
//               var charFromCodePt = String.fromCodePoint || String.fromCharCode;
//               var result = [];

//               return function (array) {
//                   var codePt, byte1;
//                   var buffLen = array.length;

//                   result.length = 0;

//                   for (var i = 0; i < buffLen; ) {
//                       byte1 = array[i++];

//                       if (byte1 <= 0x7f) {
//                           codePt = byte1;
//                       } else if (byte1 <= 0xdf) {
//                           codePt = ((byte1 & 0x1f) << 6) | (array[i++] & 0x3f);
//                       } else if (byte1 <= 0xef) {
//                           codePt =
//                               ((byte1 & 0x0f) << 12) |
//                               ((array[i++] & 0x3f) << 6) |
//                               (array[i++] & 0x3f);
//                       } else if (String.fromCodePoint) {
//                           codePt =
//                               ((byte1 & 0x07) << 18) |
//                               ((array[i++] & 0x3f) << 12) |
//                               ((array[i++] & 0x3f) << 6) |
//                               (array[i++] & 0x3f);
//                       } else {
//                           codePt = 63; // Cannot convert four byte code points, so use "?" instead
//                           i += 3;
//                       }

//                       result.push(
//                           charCache[codePt] ||
//                               (charCache[codePt] = charFromCodePt(codePt)),
//                       );
//                   }

//                   return result.join('');
//               };
//           })();

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomPort(portString) {
    let portParts = portString.split(/,|\//);
    let randomPart = portParts[Math.floor(Math.random() * portParts.length)];
    if (randomPart.includes('-')) {
        let [min, max] = randomPart.split('-').map(Number);
        return getRandomInt(min, max);
    } else {
        return Number(randomPart);
    }
}

function numberToString(value) {
    return Number.isSafeInteger(value)
        ? String(value)
        : BigInt(value).toString();
}

export {
    ipAddress,
    isIPv4,
    isIPv6,
    isValidPortNumber,
    isNotBlank,
    getIfNotBlank,
    isPresent,
    getIfPresent,
    // utf8ArrayToStr,
    getPolicyDescriptor,
    getRandomPort,
    numberToString,
};
