import { tryNodeBuiltin } from './platform';

export default function getWorkerThreads() {
    return tryNodeBuiltin(() => require('node:worker_threads'));
}
