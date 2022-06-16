import { HTTP } from '@/vendor/open-api';

const cache = new Map();

export default async function download(url, ua) {
    ua = ua || 'Quantumult%20X/1.0.29 (iPhone14,5; iOS 15.4.1)';
    const id = ua + url;
    if (cache.has(id)) {
        return cache.get(id);
    }

    const http = HTTP({
        headers: {
            'User-Agent': ua,
        },
    });

    const result = new Promise((resolve, reject) => {
        http.get(url).then((resp) => {
            const body = resp.body;
            if (body.replace(/\s/g, '').length === 0)
                reject(new Error('订阅内容为空！'));
            else resolve(body);
        });
    });

    cache.set(id, result);
    return result;
}
