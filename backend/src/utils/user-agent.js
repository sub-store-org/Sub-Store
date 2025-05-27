import gte from 'semver/functions/gte';
import coerce from 'semver/functions/coerce';
import $ from '@/core/app';

export function getUserAgentFromHeaders(headers) {
    const keys = Object.keys(headers);
    let UA = '';
    let ua = '';
    let accept = '';
    for (let k of keys) {
        const lower = k.toLowerCase();
        if (lower === 'user-agent') {
            UA = headers[k];
            ua = UA.toLowerCase();
        } else if (lower === 'accept') {
            accept = headers[k];
        }
    }
    return { UA, ua, accept };
}

export function getPlatformFromUserAgent({ ua, UA, accept }) {
    if (UA.indexOf('Quantumult%20X') !== -1) {
        return 'QX';
    } else if (ua.indexOf('egern') !== -1) {
        return 'Egern';
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
        (ua.indexOf('clash') !== -1 && ua.indexOf('meta') !== -1) ||
        ua.indexOf('clash-verge') !== -1 ||
        ua.indexOf('flclash') !== -1
    ) {
        return 'ClashMeta';
    } else if (ua.indexOf('clash') !== -1) {
        return 'Clash';
    } else if (ua.indexOf('v2ray') !== -1) {
        return 'V2Ray';
    } else if (ua.indexOf('sing-box') !== -1 || ua.indexOf('singbox') !== -1) {
        return 'sing-box';
    } else if (accept.indexOf('application/json') === 0) {
        return 'JSON';
    } else {
        return 'V2Ray';
    }
}

export function getPlatformFromHeaders(headers) {
    const { UA, ua, accept } = getUserAgentFromHeaders(headers);
    return getPlatformFromUserAgent({ ua, UA, accept });
}
export function shouldIncludeUnsupportedProxy(platform, ua) {
    // try {
    //     const target = getPlatformFromUserAgent({
    //         UA: ua,
    //         ua: ua.toLowerCase(),
    //     });
    //     if (!['Stash', 'Egern', 'Loon'].includes(target)) {
    //         return false;
    //     }
    //     const coerceVersion = coerce(ua);
    //     $.log(JSON.stringify(coerceVersion, null, 2));
    //     const { version } = coerceVersion;
    //     if (
    //         platform === 'Stash' &&
    //         target === 'Stash' &&
    //         gte(version, '3.1.0')
    //     ) {
    //         return true;
    //     }
    //     if (
    //         platform === 'Egern' &&
    //         target === 'Egern' &&
    //         gte(version, '1.29.0')
    //     ) {
    //         return true;
    //     }
    //     // Loon 的 UA 不规范, version 取出来是 build
    //     if (
    //         platform === 'Loon' &&
    //         target === 'Loon' &&
    //         gte(version, '842.0.0')
    //     ) {
    //         return true;
    //     }
    // } catch (e) {
    //     $.error(`获取版本号失败: ${e}`);
    // }
    return false;
}
