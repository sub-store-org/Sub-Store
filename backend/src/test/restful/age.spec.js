import { expect } from 'chai';
import { describe, it } from 'mocha';

import registerAgeRoutes from '@/restful/age';

function createRouteHarness() {
    const routes = {};
    const app = {
        post(path, handler) {
            routes[path] = handler;
        },
    };
    registerAgeRoutes(app);

    async function request(path, body) {
        let statusCode;
        let payload;
        const res = {
            req: { route: { path } },
            status(code) {
                statusCode = code;
                return this;
            },
            json(data) {
                payload = data;
                return this;
            },
        };

        await routes[path]({ body }, res);
        return { statusCode, payload };
    }

    return { request };
}

describe('age routes', function () {
    this.timeout(10000);

    it('generates a key pair and derives its public key', async function () {
        const { request } = createRouteHarness();

        const generated = await request('/api/utils/age/key-pair', {
            type: 'x25519',
        });
        expect(generated.statusCode).to.equal(200);
        expect(generated.payload.status).to.equal('success');
        expect(generated.payload.data['age-public-key']).to.match(/^age1/);
        expect(generated.payload.data['age-secret-key']).to.match(
            /^AGE-SECRET-KEY-1/,
        );

        const derived = await request('/api/utils/age/public-key', {
            'age-secret-key': generated.payload.data['age-secret-key'],
        });
        expect(derived.statusCode).to.equal(200);
        expect(derived.payload.data['age-public-key']).to.equal(
            generated.payload.data['age-public-key'],
        );
    });

    it('rejects unsupported key generation types', async function () {
        const { request } = createRouteHarness();

        const response = await request('/api/utils/age/key-pair', {
            type: 'ssh',
        });

        expect(response.statusCode).to.equal(500);
        expect(response.payload.status).to.equal('failed');
        expect(response.payload.error.message).to.contain(
            '不支持的 age key 类型',
        );
    });
});
