import { tryNodeBuiltin } from './platform';

export default function getTls() {
    return tryNodeBuiltin(() => require('tls'));
}
