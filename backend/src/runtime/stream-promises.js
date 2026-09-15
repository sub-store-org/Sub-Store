import { tryNodeBuiltin } from './platform';

export default function getStreamPromises() {
    return tryNodeBuiltin(() => require('stream/promises'));
}
