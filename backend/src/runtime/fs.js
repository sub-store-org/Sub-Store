import { tryNodeBuiltin } from './platform';

export default function getFs() {
    return tryNodeBuiltin(() => require('fs'));
}
