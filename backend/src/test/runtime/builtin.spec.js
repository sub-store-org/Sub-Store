import { expect } from 'chai';

import getChildProcess from '@/runtime/child-process';
import getDgram from '@/runtime/dgram';
import getFs from '@/runtime/fs';
import getNet from '@/runtime/net';
import getPath from '@/runtime/path';
import { getDnsTransport } from '@/runtime/platform';
import getStreamPromises from '@/runtime/stream-promises';
import getTls from '@/runtime/tls';
import getWorkerThreads from '@/runtime/worker-threads';

describe('runtime builtin getters', function () {
    it('loads the Node builtins used by the backend', function () {
        expect(getChildProcess()).to.equal(require('child_process'));
        expect(getDgram()).to.equal(require('dgram'));
        expect(getFs()).to.equal(require('fs'));
        expect(getNet()).to.equal(require('net'));
        expect(getPath()).to.equal(require('path'));
        expect(getStreamPromises()).to.equal(require('stream/promises'));
        expect(getTls()).to.equal(require('tls'));
        expect(getWorkerThreads()).to.equal(require('node:worker_threads'));
    });

    it('selects the requested DNS transport', function () {
        expect(getDnsTransport('tls', getTls, getNet)).to.equal(getTls());
        expect(getDnsTransport('tcp', getTls, getNet)).to.equal(getNet());
    });
});
