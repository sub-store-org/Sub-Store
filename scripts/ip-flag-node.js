const $ = $substore;

const {onlyFlagIP = true} = $arguments

async function operator(proxies) {
    const BATCH_SIZE = 10;

    let i = 0;
    while (i < proxies.length) {
        const batch = proxies.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async proxy => {
            if (onlyFlagIP && !ProxyUtils.isIP(proxy.server)) return;
            try {
                // remove the original flag
                let proxyName = removeFlag(proxy.name);

                // query ip-api
                const countryCode = await queryIpApi(proxy);

                proxyName = getFlagEmoji(countryCode) + ' ' + proxyName;
                proxy.name = proxyName;
            } catch (err) {
                // TODO:
            }
        }));

        await sleep(1000);
        i += BATCH_SIZE;
    }
    return proxies;
}


async function queryIpApi(proxy) {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.10; rv:78.0) Gecko/20100101 Firefox/78.0";
    const headers = {
        "User-Agent": ua
    };
    const result = new Promise((resolve, reject) => {
        const url =
            `http://ip-api.com/json/${encodeURIComponent(proxy.server)}?lang=zh-CN`;
        $.http.get({
            url,
            headers,
        }).then(resp => {
            const data = JSON.parse(resp.body);
            if (data.status === "success") {
                resolve(data.countryCode);
            } else {
                reject(new Error(data.message));
            }
        }).catch(err => {
            console.log(err);
            reject(err);
        });
    });
    return result;
}

function getFlagEmoji(countryCode) {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt());
    return String
        .fromCodePoint(...codePoints)
        .replace(/🇹🇼/g, '🇨🇳');
}

function removeFlag(str) {
    return str
        .replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, '')
        .trim();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

