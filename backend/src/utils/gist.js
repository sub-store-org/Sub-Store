import { HTTP } from '@/vendor/open-api';

/**
 * Gist backup
 */
export default class Gist {
    constructor({ token, key }) {
        this.http = HTTP({
            baseURL: 'https://api.github.com',
            headers: {
                Authorization: `token ${token}`,
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36',
            },
            events: {
                onResponse: (resp) => {
                    if (/^[45]/.test(String(resp.statusCode))) {
                        return Promise.reject(
                            `ERROR: ${JSON.parse(resp.body).message}`,
                        );
                    } else {
                        return resp;
                    }
                },
            },
        });
        this.key = key;
    }

    async locate() {
        return this.http.get('/gists').then((response) => {
            const gists = JSON.parse(response.body);
            for (let g of gists) {
                if (g.description === this.key) {
                    return g;
                }
            }
            return;
        });
    }

    async upload(files) {
        if (Object.keys(files).length === 0) {
            return Promise.reject('未提供需上传的文件');
        }

        const gist = await this.locate();

        if (gist?.id) {
            // update an existing gist
            return this.http.patch({
                url: `/gists/${gist.id}`,
                body: JSON.stringify({ files }),
            });
        } else {
            // create a new gist for backup
            return this.http.post({
                url: '/gists',
                body: JSON.stringify({
                    description: this.key,
                    public: false,
                    files,
                }),
            });
        }
    }

    async download(filename) {
        const gist = await this.locate();
        if (gist?.id) {
            try {
                const { files } = await this.http
                    .get(`/gists/${gist.id}`)
                    .then((resp) => JSON.parse(resp.body));
                const url = files[filename].raw_url;
                return await this.http.get(url).then((resp) => resp.body);
            } catch (err) {
                return Promise.reject(err);
            }
        } else {
            return Promise.reject('找不到 Sub-Store Gist');
        }
    }
}
