/* eslint-disable no-case-declarations */
import { Base64 } from 'js-base64';
import URI_Producer from './uri';

const URI = URI_Producer();

export default function V2Ray_Producer() {
    const type = 'ALL';
    const produce = (proxies) =>
        Base64.encode(proxies.map((proxy) => URI.produce(proxy)).join('\n'));
    return { type, produce };
}
