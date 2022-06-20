import Surge_Producer from './surge';
import Clash_Producer from './clash';
import Stash_Producer from './stash';
import Loon_Producer from './loon';
import URI_Producer from './uri';
import QX_Producer from './qx';

function JSON_Producer() {
    const type = 'ALL';
    const produce = (proxies) => JSON.stringify(proxies, null, 2);
    return { type, produce };
}

export default {
    QX: QX_Producer(),
    Surge: Surge_Producer(),
    Loon: Loon_Producer(),
    Clash: Clash_Producer(),
    URI: URI_Producer(),
    JSON: JSON_Producer(),
    Stash: Stash_Producer(),
};
