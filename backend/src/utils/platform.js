export function getPlatformFromHeaders(headers) {
    const keys = Object.keys(headers);
    let UA = '';
    let ua = '';
    for (let k of keys) {
        if (/USER-AGENT/i.test(k)) {
            UA = headers[k];
            ua = UA.toLowerCase();
            break;
        }
    }
    if (UA.indexOf('Quantumult%20X') !== -1) {
        return 'QX';
    } else if (UA.indexOf('Surfboard') !== -1) {
        return 'Surfboard';
    } else if (UA.indexOf('Surge Mac') !== -1) {
        return 'SurgeMac';
    } else if (UA.indexOf('Surge') !== -1) {
        return 'Surge';
    } else if (UA.indexOf('Decar') !== -1 || UA.indexOf('Loon') !== -1) {
        return 'Loon';
    } else if (UA.indexOf('Shadowrocket') !== -1) {
        return 'Shadowrocket';
    } else if (UA.indexOf('Stash') !== -1) {
        return 'Stash';
    } else if (
        ua === 'meta' ||
        (ua.indexOf('clash') !== -1 && ua.indexOf('meta') !== -1)
    ) {
        return 'ClashMeta';
    } else if (ua.indexOf('clash') !== -1) {
        return 'Clash';
    } else if (ua.indexOf('v2ray') !== -1) {
        return 'V2Ray';
    } else if (ua.indexOf('sing-box') !== -1) {
        return 'sing-box';
    } else {
        return 'JSON';
    }
}
