import { tryNodeBuiltin } from './platform';

export default function getDgram() {
    return tryNodeBuiltin(() => require('dgram'));
}
