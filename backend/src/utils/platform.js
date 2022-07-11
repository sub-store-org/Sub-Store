export function getPlatformFromHeaders(headers) {
    const keys = Object.keys(headers);
    let UA = '';
    for (let k of keys) {
        if (/USER-AGENT/i.test(k)) {
            UA = headers[k];
            break;
        }
    }
    if (UA.indexOf('Quantumult%20X') !== -1) {
        return 'QX';
    } else if (UA.indexOf('Surge') !== -1) {
        return 'Surge';
    } else if (UA.indexOf('Decar') !== -1 || UA.indexOf('Loon') !== -1) {
        return 'Loon';
    } else if (UA.indexOf('Shadowrocket') !== -1) {
        return 'ShadowRocket';
    } else if (UA.indexOf('Stash') !== -1) {
        return 'Stash';
    } else {
        return 'JSON';
    }
}
