import { tryNodeBuiltin } from './platform';

export default function getNet() {
    return tryNodeBuiltin(() => require('net'));
}
