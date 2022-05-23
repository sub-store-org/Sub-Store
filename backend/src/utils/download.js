const { HTTP } = require('./open-api');

const cache = new Map();

async function download(url, userAgent = 'Quantumult%20X') {
	const id = userAgent + url;
	if (cache.has(id)) {
		return cache.get(id);
	}

	const $http = HTTP({
		headers: {
			'User-Agent': userAgent
		}
	});

	const result = new Promise((resolve, reject) => {
		$http.get(url).then((resp) => {
			const body = resp.body;
			if (body.replace(/\s/g, '').length === 0) reject(new Error('订阅内容为空！'));
			else resolve(body);
		});
	});

	cache[id] = result;
	return result;
}

module.exports = download;
