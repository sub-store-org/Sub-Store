import { tryNodeBuiltin } from './platform';

export default function getChildProcess() {
    return tryNodeBuiltin(() => require('child_process'));
}
