import { expect } from 'chai';
import { after, before, beforeEach, describe, it } from 'mocha';

import {
    SETTINGS_KEY,
    SUBS_KEY,
    TOKENS_KEY,
} from '@/constants';

let $;
let createTokenItem;
let state;
let originalRead;
let originalWrite;
let originalInfo;
let originalError;

describe('token routes', function () {
    before(async function () {
        ({ default: $ } = require('@/core/app'));
        ({ createTokenItem } = require('@/restful/token'));

        originalRead = $.read.bind($);
        originalWrite = $.write.bind($);
        originalInfo = $.info.bind($);
        originalError = $.error.bind($);
    });

    after(function () {
        if ($) {
            $.read = originalRead;
            $.write = originalWrite;
            $.info = originalInfo;
            $.error = originalError;
        }
    });

    beforeEach(function () {
        state = {
            [SUBS_KEY]: [{ name: 'shared-sub' }],
            [TOKENS_KEY]: [],
            [SETTINGS_KEY]: {},
        };

        $.read = (key) => state[key];
        $.write = (data, key) => {
            state[key] = data;
            return true;
        };
        $.info = () => {};
        $.error = () => {};
    });

    it('stores exact datetime shares without converting them to expiresIn', function () {
        const exp = Date.now() + 5 * 60 * 1000;

        const token = createTokenItem(
            {
                type: 'sub',
                name: 'shared-sub',
                token: 'datetime-token',
            },
            {
                mode: 'datetime',
                exp,
            },
        );

        expect(token.token).to.equal('datetime-token');
        expect(token.mode).to.equal('datetime');
        expect(token.exp).to.equal(exp);
        expect(token).to.not.have.property('expiresIn');
        expect(state[TOKENS_KEY][0].mode).to.equal('datetime');
        expect(state[TOKENS_KEY][0].exp).to.equal(exp);
    });

    it('allows exact datetime shares in the past', function () {
        const exp = Date.now() - 5 * 60 * 1000;

        const token = createTokenItem(
            {
                type: 'sub',
                name: 'shared-sub',
                token: 'expired-token',
            },
            {
                mode: 'datetime',
                exp,
            },
        );

        expect(token.mode).to.equal('datetime');
        expect(token.exp).to.equal(exp);
        expect(state[TOKENS_KEY]).to.have.length(1);
    });

    it('rejects invalid exact datetime shares', function () {
        let capturedError;

        try {
            createTokenItem(
                {
                    type: 'sub',
                    name: 'shared-sub',
                    token: 'bad-token',
                },
                {
                    mode: 'datetime',
                    exp: 'not-a-timestamp',
                },
            );
        } catch (error) {
            capturedError = error;
        }

        expect(capturedError).to.include({
            type: 'RequestInvalidError',
            code: 'INVALID_EXPIRATION_DATETIME',
        });
        expect(state[TOKENS_KEY]).to.deep.equal([]);
    });

    it('rejects exact datetime shares that are not positive millisecond timestamps', function () {
        for (const invalidExp of [
            0,
            -1,
            1713753600,
            '1713753600',
            1713753600000.5,
            '1713753600000.5',
        ]) {
            let capturedError;

            try {
                createTokenItem(
                    {
                        type: 'sub',
                        name: 'shared-sub',
                        token: `invalid-ms-${String(invalidExp)}`,
                    },
                    {
                        mode: 'datetime',
                        exp: invalidExp,
                    },
                );
            } catch (error) {
                capturedError = error;
            }

            expect(capturedError).to.include({
                type: 'RequestInvalidError',
                code: 'INVALID_EXPIRATION_DATETIME',
            });
        }

        expect(state[TOKENS_KEY]).to.deep.equal([]);
    });

    it('rejects empty exact datetime shares', function () {
        for (const invalidExp of [null, '', '   ']) {
            let capturedError;

            try {
                createTokenItem(
                    {
                        type: 'sub',
                        name: 'shared-sub',
                        token: `bad-token-${String(invalidExp)}`,
                    },
                    {
                        mode: 'datetime',
                        exp: invalidExp,
                    },
                );
            } catch (error) {
                capturedError = error;
            }

            expect(capturedError).to.include({
                type: 'RequestInvalidError',
                code: 'INVALID_EXPIRATION_DATETIME',
            });
        }

        expect(state[TOKENS_KEY]).to.deep.equal([]);
    });

    it('rejects duration shares when expiresIn is missing', function () {
        let capturedError;

        try {
            createTokenItem(
                {
                    type: 'sub',
                    name: 'shared-sub',
                    token: 'duration-missing-expiration',
                },
                {
                    mode: 'duration',
                },
            );
        } catch (error) {
            capturedError = error;
        }

        expect(capturedError).to.include({
            type: 'RequestInvalidError',
            code: 'INVALID_EXPIRES_IN',
        });
        expect(state[TOKENS_KEY]).to.deep.equal([]);
    });

    it('keeps legacy duration behavior when mode is omitted', function () {
        const token = createTokenItem(
            {
                type: 'sub',
                name: 'shared-sub',
                token: 'legacy-duration',
            },
            {
                expiresIn: '1d',
                exp: Date.now() + 10 * 24 * 60 * 60 * 1000,
            },
        );

        expect(token.mode).to.equal('duration');
        expect(token.expiresIn).to.equal('1d');
        expect(token.exp).to.be.a('number');
    });

    it('infers legacy exact datetime behavior when mode is omitted but exp exists', function () {
        const exp = Date.now() - 5 * 60 * 1000;

        const token = createTokenItem(
            {
                type: 'sub',
                name: 'shared-sub',
                token: 'legacy-datetime',
            },
            {
                exp,
            },
        );

        expect(token.mode).to.equal('datetime');
        expect(token.exp).to.equal(exp);
        expect(token).to.not.have.property('expiresIn');
        expect(state[TOKENS_KEY][0].mode).to.equal('datetime');
        expect(state[TOKENS_KEY][0].exp).to.equal(exp);
    });

    it('ignores expiration metadata injected through payload', function () {
        const token = createTokenItem(
            {
                type: 'sub',
                name: 'shared-sub',
                token: 'payload-mode-ignored',
                mode: 'datetime',
                exp: Date.now() + 60 * 1000,
                expiresIn: '1d',
            },
            {},
        );

        expect(token).to.not.have.property('mode');
        expect(token).to.not.have.property('exp');
        expect(token).to.not.have.property('expiresIn');
        expect(state[TOKENS_KEY][0]).to.not.have.property('mode');
        expect(state[TOKENS_KEY][0]).to.not.have.property('exp');
        expect(state[TOKENS_KEY][0]).to.not.have.property('expiresIn');
    });
});
