import { version as substoreVersion } from '../../package.json';
import { ENV } from '@/vendor/open-api';

const {
    isNode,
    isQX,
    isLoon,
    isSurge,
    isStash,
    isShadowRocket,
    isLanceX,
    isEgern,
} = ENV();
let backend = 'Node';
if (isNode) backend = 'Node';
if (isQX) backend = 'QX';
if (isLoon) backend = 'Loon';
if (isSurge) backend = 'Surge';
if (isStash) backend = 'Stash';
if (isShadowRocket) backend = 'ShadowRocket';
if (isEgern) backend = 'Egern';
if (isLanceX) backend = 'LanceX';

let meta = {};

try {
    if (typeof $environment !== 'undefined') {
        // eslint-disable-next-line no-undef
        meta.env = $environment;
    }
    if (typeof $loon !== 'undefined') {
        // eslint-disable-next-line no-undef
        meta.loon = $loon;
    }
    if (typeof $script !== 'undefined') {
        // eslint-disable-next-line no-undef
        meta.script = $script;
    }
    // eslint-disable-next-line no-empty
} catch (e) {}

export default {
    backend,
    version: substoreVersion,
    meta,
};
