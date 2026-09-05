import { ENV } from '@/vendor/open-api';

export function tryNodeBuiltin(load) {
    if (!ENV().isNode) return undefined;

    try {
        return load();
    } catch (e) {
        return undefined;
    }
}

export function getDnsTransport(protocol, getTls, getNet) {
    return protocol === 'tls' ? getTls() : getNet();
}
