import { expect } from 'chai';
import { describe, it } from 'mocha';

import { normalizeClashYaml } from '@/core/proxy-utils/preprocessors';

describe('Clash preprocessor helper', function () {
    it('quotes reality short-id scalars that may be re-parsed as numbers', function () {
        const input = `proxies:
  - name: test-1
    type: vless
    reality-opts:
      short-id: 08
  - name: test-2
    type: vless
    reality-opts:
      short-id: 0088
  - name: test-3
    type: vless
    reality-opts:
      short-id: '51'
  - name: test-4
    type: vless
    reality-opts:
      short-id: ""
  - name: test-5
    type: vless
    reality-opts:
      short-id: null
`;

        const output = normalizeClashYaml(input);

        expect(output).to.include('short-id: "08"');
        expect(output).to.include('short-id: "0088"');
        expect(output).to.include("short-id: '51'");
        expect(output).to.include('short-id: ""');
        expect(output).to.include('short-id: null');
    });
});
