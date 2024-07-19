/* eslint-disable no-case-declarations */
import { Base64 } from 'js-base64';
import URI_Producer from './uri';
import $ from '@/core/app';

const URI = URI_Producer();

export default function V2Ray_Producer() {
    const type = 'ALL';
    const produce = (proxies) => {
        let result = [];
        proxies.map((proxy) => {
            try {
                result.push(URI.produce(proxy));
            } catch (err) {
                $.error(
                    `Cannot produce proxy: ${JSON.stringify(
                        proxy,
                        null,
                        2,
                    )}\nReason: ${err}`,
                );
            }
        });

        return Base64.encode(result.join('\n'));
    };

    return { type, produce };
}
