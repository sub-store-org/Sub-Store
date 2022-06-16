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
                    return g.id;
                }
            }
            return -1;
        });
    }

    async upload(files) {
        const id = await this.locate();

        if (id === -1) {
            // create a new gist for backup
            return this.http.post({
                url: '/gists',
                body: JSON.stringify({
                    description: this.key,
                    public: false,
                    files,
                }),
            });
        } else {
            // update an existing gist
            return this.http.patch({
                url: `/gists/${id}`,
                body: JSON.stringify({ files }),
            });
        }
    }

    async download(filename) {
        const id = await this.locate();
        if (id === -1) {
            return Promise.reject('未找到Gist备份！');
        } else {
            try {
                const { files } = await this.http
                    .get(`/gists/${id}`)
                    .then((resp) => JSON.parse(resp.body));
                const url = files[filename].raw_url;
                return await this.http.get(url).then((resp) => resp.body);
            } catch (err) {
                return Promise.reject(err);
            }
        }
    }
}
