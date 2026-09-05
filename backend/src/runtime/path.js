import { tryNodeBuiltin } from './platform';

export default function getPath() {
    return tryNodeBuiltin(() => require('path'));
}
