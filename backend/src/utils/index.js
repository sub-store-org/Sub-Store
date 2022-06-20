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

export { isIPv4, isIPv6, isNotBlank, getIfNotBlank, isPresent, getIfPresent };
