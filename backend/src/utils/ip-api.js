import { HTTP } from '../vendor/open-api';

export default async function IP_API(req, res) {
    const server = decodeURIComponent(req.params.server);
    const $http = HTTP();
    const result = await $http
        .get(`http://ip-api.com/json/${server}?lang=zh-CN`)
        .then((resp) => JSON.parse(resp.body));
    res.json(result);
}
