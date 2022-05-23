const { HTTP } = require('./open-api');

/**
 * Gist backup
 */
function Gist({ token, key }) {
	const http = HTTP({
		baseURL: 'https://api.github.com',
		headers: {
			Authorization: `token ${token}`,
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36'
		},
		events: {
			onResponse: (resp) => {
				if (/^[45]/.test(String(resp.statusCode))) {
					return Promise.reject(`ERROR: ${JSON.parse(resp.body).message}`);
				} else {
					return resp;
				}
			}
		}
	});

	async function locate() {
		return http.get('/gists').then((response) => {
			const gists = JSON.parse(response.body);
			for (let g of gists) {
				if (g.description === key) {
					return g.id;
				}
			}
			return -1;
		});
	}

	this.upload = async function(files) {
		const id = await locate();

		if (id === -1) {
			// create a new gist for backup
			return http.post({
				url: '/gists',
				body: JSON.stringify({
					description: key,
					public: false,
					files
				})
			});
		} else {
			// update an existing gist
			return http.patch({
				url: `/gists/${id}`,
				body: JSON.stringify({ files })
			});
		}
	};

	this.download = async function(filename) {
		const id = await locate();
		if (id === -1) {
			return Promise.reject('未找到Gist备份！');
		} else {
			try {
				const { files } = await http.get(`/gists/${id}`).then((resp) => JSON.parse(resp.body));
				const url = files[filename].raw_url;
				return await http.get(url).then((resp) => resp.body);
			} catch (err) {
				return Promise.reject(err);
			}
		}
	};
}

module.exports = Gist;
