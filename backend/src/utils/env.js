import { version as substoreVersion } from '../../package.json';
import { ENV } from '@/vendor/open-api';

const { isNode, isQX, isLoon, isSurge, isStash, isShadowRocket } = ENV();
let backend = 'Node';
if (isNode) backend = 'Node';
if (isQX) backend = 'QX';
if (isLoon) backend = 'Loon';
if (isSurge) backend = 'Surge';
if (isStash) backend = 'Stash';
if (isShadowRocket) backend = 'ShadowRocket';

export default {
    backend,
    version: substoreVersion,
};
