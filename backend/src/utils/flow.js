import { HTTP } from '@/vendor/open-api';

export async function getFlowHeaders(url) {
    const http = HTTP();
    const { headers } = await http.get({
        url,
        headers: {
            'User-Agent': 'Quantumult%20X/1.0.30 (iPhone14,2; iOS 15.6)',
        },
    });
    const subkey = Object.keys(headers).filter((k) =>
        /SUBSCRIPTION-USERINFO/i.test(k),
    )[0];
    return headers[subkey];
}
