import { expect } from 'chai';
import { describe, it } from 'mocha';

import { matchesBackendPath, stripBackendPath } from '@/restful';

describe('backend path', function () {
    it('keeps root paths and strips non-root prefixes', function () {
        expect(stripBackendPath('/api/utils/env', '/')).to.equal(
            '/api/utils/env',
        );
        expect(stripBackendPath('', '/')).to.equal('/');
        expect(
            stripBackendPath('/sub-store/api/utils/env', '/sub-store'),
        ).to.equal('/api/utils/env');
    });

    it('keeps merged frontend routes outside a root backend path', function () {
        expect(matchesBackendPath('/api/settings', '/', true)).to.equal(true);
        expect(matchesBackendPath('/settings', '/', true)).to.equal(false);
        expect(matchesBackendPath('/share/sub/foo', '/', true)).to.equal(false);
        expect(matchesBackendPath('/share/sub/foo', '/', false)).to.equal(true);
    });
});
