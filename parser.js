const $ = API("sub-store");

// Constants
const SUBS_KEY = "subs";
const COLLECTIONS_KEY = "collections";

// SOME INITIALIZATIONS
if (!$.read(SUBS_KEY)) $.write({}, SUBS_KEY);
if (!$.read(COLLECTIONS_KEY)) $.write({}, COLLECTIONS_KEY);

// BACKEND API
const $app = express();

// subscriptions
$app.get("/v1/download/:name", downloadSub)

$app.route("/v1/sub/:name")
    .get(getSub)
    .patch(updateSub)
    .delete(deleteSub);

$app.route("/v1/sub")
    .get(getAllSubs)
    .post(newSub)
    .delete(deleteAllSubs);

// collections
$app.get("/v1/download/collection/:name", downloadCollection);
$app.route("/v1/collection/:name")
    .get(getCollection)
    .patch(updateCollection)
    .delete(deleteCollection);
$app.route("/v1/collection")
    .get(getAllCollections)
    .post(newCollection)
    .delete(deleteAllCollections);

$app.all("/", (req, res) => {
    res.send("Hello from Sub-Store! Made with ❤️ by Peng-YM.")
});

$app.start();

// SOME CONSTANTS
const FALL_BACK_TARGET = "Loon";
const DEFAULT_SUPPORTED_PLATFORMS = {
    QX: true,
    Loon: true,
    Surge: true,
    Node: true
}
const AVAILABLE_FILTERS = {
    "Keyword Filter": KeywordFilter,
    "Discard Keyword Filter": DiscardKeywordFilter,
    "Useless Filter": UselessFilter,
    "Region Filter": RegionFilter,
    "Regex Filter": RegexFilter,
    "Discard Regex Filter": DiscardRegexFilter,
    "Type Filter": TypeFilter,
    "Script Filter": ScriptFilter
}

const AVAILABLE_OPERATORS = {
    "Set Property Operator": SetPropertyOperator,
    "Flag Operator": FlagOperator,
    "Sort Operator": SortOperator,
    "Keyword Sort Operator": KeywordSortOperator,
    "Keyword Rename Operator": KeywordRenameOperator,
    "Keyword Delete Operator": KeywordDeleteOperator,
    "Regex Rename Operator": RegexRenameOperator,
    "Regex Delete Operator": RegexDeleteOperator,
    "Script Operator": ScriptOperator
}

/**************************** API -- Subscriptions ***************************************/
// download subscription, for APP only
async function downloadSub(req, res) {
    const {name} = req.params;
    const platform = getPlatformFromHeaders(req.headers);
    console.log('=======================================')
    console.log(`Downloading subscription: ${name}. Target platform ==> ${platform}\n`);
    const allSubs = $.read(SUBS_KEY);
    if (allSubs[name]) {
        const sub = allSubs[name];
        try {
            const output = await parseSub(sub, platform);
            res.send(output);
        } catch (err) {
            $.notify('[Sub-Store]', '❌ 无法获取订阅！', `错误信息：${err}`)
            res.status(500).json({
                status: "failed",
                message: err
            });
        }
    } else {
        res.status(404).json({
            status: "failed",
            message: `订阅${name}不存在！`
        });
    }
}

async function parseSub(sub, platform) {
    if (!sub) throw new Error("Subscription is undefined!")
    // download from url
    const raw = await $.http.get(sub.url).then(resp => resp.body).catch(err => {
        throw new Error(err);
    });
    const $parser = ProxyParser(platform);
    let proxies = $parser.parse(raw);

    // filters
    const $filter = ProxyFilter();
    // create filters from sub conf
    const userFilters = [];
    for (const item of sub.filters || []) {
        const filter = AVAILABLE_FILTERS[item.type];
        if (filter) {
            userFilters.push(filter(...(item.args || [])));
            console.log(`Filter "${item.type}" added. Arguments: ${item.args || "None"}`);
        }
    }
    $filter.addFilters(...userFilters);

    // operators
    const $operator = ProxyOperator();
    const userOperators = [];
    for (const item of sub.operators || []) {
        const operator = AVAILABLE_OPERATORS[item.type];
        if (operator) {
            userOperators.push(operator(...(item.args || [])));
            console.log(`Operator "${item.type}" added. Arguments: ${item.args || "None"}`);
        }
    }
    $operator.addOperators(...userOperators);

    // process filters and operators
    console.log("\nApplying filters...");
    proxies = $filter.process(proxies);
    console.log("\nApplying operators...");
    proxies = $operator.process(proxies);
    return $parser.produce(proxies)
}

// Subscriptions
async function getSub(req, res) {
    const {name} = req.params;
    const sub = $.read(SUBS_KEY)[name];
    if (sub) {
        res.json({
            status: "success",
            data: sub
        });
    } else {
        res.status(404).json({
            status: "failed",
            message: `未找到订阅：${name}!`
        });
    }
}

async function newSub(req, res) {
    const sub = req.body;
    const allSubs = $.read(SUBS_KEY);
    if (allSubs[sub.name]) {
        res.status(500).json({
            status: "failed",
            message: `订阅${sub.name}已存在！`
        });
    }
    // validate name
    if (/^[\w-_]*$/.test(sub.name)) {
        allSubs[sub.name] = sub;
        $.write(allSubs, SUBS_KEY);
        res.status(201).json({
            status: "success",
            data: sub
        });
    } else {
        res.status(500).json({
            status: "failed",
            message: `订阅名称 ${sub.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`
        })
    }
}

async function updateSub(req, res) {
    const {name} = req.params;
    let sub = req.body;
    const allSubs = $.read(SUBS_KEY);
    if (allSubs[name]) {
        const newSub = {
            ...allSubs[name],
            ...sub
        };
        allSubs[name] = newSub;
        $.write(allSubs, SUBS_KEY);
        res.json({
            status: "success",
            data: newSub
        })
    } else {
        res.status(500).json({
            status: "failed",
            message: `订阅${name}不存在，无法更新！`
        });
    }
}

async function deleteSub(req, res) {
    const {name} = req.params;
    let allSubs = $.read(SUBS_KEY);
    delete allSubs[name];
    $.write(allSubs, SUBS_KEY);
    res.json({
        status: "success"
    });
}

async function getAllSubs(req, res) {
    const allSubs = $.read(SUBS_KEY);
    res.json({
        status: "success",
        data: Object.keys(allSubs)
    });
}

async function deleteAllSubs(req, res) {
    $.write({}, SUBS_KEY);
    res.json({
        status: "success"
    });
}

// Collections
async function downloadCollection(req, res) {
    const {name} = req.params;
    const collection = $.read(COLLECTIONS_KEY)[name];
    const platform = getPlatformFromHeaders(req.headers);
    if (collection) {
        const subs = collection.subscriptions || [];
        const output = await Promise.all(subs.map(async id => {
            const sub = $.read(SUBS_KEY)[id];
            try {
                return parseSub(sub, platform);
            } catch (err) {
                console.log(`ERROR when process subscription: ${id}`);
                return "";
            }
        }));
        res.send(output.join("\n"));
    } else {
        $.notify('[Sub-Store]', `❌ 未找到订阅集：${name}！`)
        res.status(404).json({
            status: "failed",
            message: `❌ 未找到订阅集：${name}！`
        });
    }
}

async function getCollection(req, res) {
    const {name} = req.params;
    const collection = $.read(COLLECTIONS_KEY)[name];
    if (collection) {
        res.json({
            status: "success",
            data: collection
        });
    } else {
        res.status(404).json({
            status: "failed",
            message: `未找到订阅集：${name}!`
        });
    }
}

async function newCollection(req, res) {
    const collection = req.body;
    const allCol = $.read(COLLECTIONS_KEY);
    if (allCol[collection.name]) {
        res.status(500).json({
            status: "failed",
            message: `订阅集${collection.name}已存在！`
        });
    }
    // validate name
    if (/^[\w-_]*$/.test(collection.name)) {
        allCol[collection.name] = collection;
        $.write(allCol, COLLECTIONS_KEY);
        res.status(201).json({
            status: "success",
            data: collection
        });
    } else {
        res.status(500).json({
            status: "failed",
            message: `订阅集名称 ${collection.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`
        })
    }
}

async function updateCollection(req, res) {
    const {name} = req.params;
    let collection = req.body;
    const allCol = $.read(COLLECTIONS_KEY);
    if (allCol[name]) {
        const newCol = {
            ...allCol[name],
            ...collection
        };
        allCol[name] = newCol;
        $.write(allCol, COLLECTIONS_KEY);
        res.json({
            status: "success",
            data: newCol
        })
    } else {
        res.status(500).json({
            status: "failed",
            message: `订阅集${name}不存在，无法更新！`
        });
    }
}

async function deleteCollection(req, res) {
    const {name} = req.params;
    let allCol = $.read(COLLECTIONS_KEY);
    delete allCol[name];
    $.write(allCol, COLLECTIONS_KEY);
    res.json({
        status: "success"
    });
}

async function getAllCollections(req, res) {
    const allCols = $.read(COLLECTIONS_KEY);
    res.json({
        status: "success",
        data: Object.keys(allCols)
    });
}

async function deleteAllCollections(req, res) {
    $.write({}, COLLECTIONS_KEY);
    res.json({
        status: "success"
    });
}

/**************************** Proxy Handlers ***************************************/
function ProxyParser(targetPlatform) {
    // parser collections
    const parsers = [];
    const producers = [];

    function addParsers(...args) {
        args.forEach(a => parsers.push(a()));
    }

    function addProducers(...args) {
        args.forEach(a => producers.push(a()))
    }

    function parse(raw) {
        raw = preprocessing(raw);
        const lines = raw.split("\n");
        const result = [];
        // convert to json format
        for (let line of lines) {
            line = line.trim();
            if (line.length === 0) continue; // skip empty line
            if (line.startsWith("#")) continue; // skip comments
            let matched = false;
            for (const p of parsers) {
                const {patternTest, func} = p;

                // some lines with weird format may produce errors!
                let patternMatched;
                try {
                    patternMatched = patternTest(line);
                } catch (err) {
                    patternMatched = false;
                }

                if (patternMatched) {
                    matched = true;
                    // run parser safely.
                    try {
                        const proxy = func(line);
                        if (!proxy) {
                            // failed to parse this line
                            console.log(`ERROR: parser return nothing for \n${line}\n`);
                            break;
                        }
                        // skip unsupported proxies
                        // if proxy.supported is undefined, assume that all platforms are supported.
                        if (typeof proxy.supported === 'undefined' || proxy.supported[targetPlatform]) {
                            delete proxy.supported;
                            result.push(proxy);
                            break;
                        }
                    } catch (err) {
                        console.log(`ERROR: Failed to parse line: \n ${line}\n Reason: ${err}`);
                    }
                }
            }
            if (!matched) {
                console.log(`ERROR: Failed to find a rule to parse line: \n${line}\n`);
            }
        }
        if (result.length === 0) {
            throw new Error(`ERROR: Input does not contains any valid node for platform ${targetPlatform}`)
        }
        return result;
    }

    function produce(proxies) {
        for (const p of producers) {
            if (p.targetPlatform === targetPlatform) {
                return proxies.map(proxy => {
                    try {
                        return p.output(proxy)
                    } catch (err) {
                        console.log(`ERROR: cannot produce proxy: ${JSON.stringify(proxy)}\nReason: ${err}`);
                        return "";
                    }
                }).join("\n");
            }
        }
        throw new Error(`Cannot find any producer for target platform: ${targetPlatform}`);
    }

    // preprocess raw input
    function preprocessing(raw) {
        let output;
        if (raw.indexOf("DOCTYPE html") !== -1) {
            // HTML format, maybe a wrong URL!
            throw new Error("Invalid format HTML!");
        }
        // check if content is based64 encoded
        const Base64 = new Base64Code();
        const keys = ["dm1lc3M", "c3NyOi8v", "dHJvamFu", "c3M6Ly", "c3NkOi8v"];
        if (keys.some(k => raw.indexOf(k) !== -1)) {
            output = Base64.safeDecode(raw);
        } else {
            output = raw;
        }
        output = output.split("\n");
        for (let i = 0; i < output.length; i++) {
            output[i] = output[i].trim(); // trim lines
        }
        return output.join("\n");
    }

    // Parsers
    addParsers(
        // URI format parsers
        URI_SS, URI_SSR, URI_VMess, URI_Trojan,
        // Quantumult X platform
        QX_SS, QX_SSR, QX_VMess, QX_Trojan, QX_Http,
        // Loon platform
        Loon_SS, Loon_SSR, Loon_VMess, Loon_Trojan, Loon_Http,
        // Surge platform
        Surge_SS, Surge_VMess, Surge_Trojan, Surge_Http
    );

    // Producers
    addProducers(
        QX_Producer, Loon_Producer, Surge_Producer, Node_Producer
    );

    return {
        parse, produce
    };
}

function ProxyFilter() {
    const filters = [];

    function addFilters(...args) {
        args.forEach(a => filters.push(a));
    }

    // select proxies
    function process(proxies) {
        let selected = FULL(proxies.length, true);
        for (const filter of filters) {
            try {
                selected = AND(selected, filter.func(proxies));
            } catch (err) {
                console.log(`Cannot apply filter ${filter.name}\n Reason: ${err}`);
            }
        }
        return proxies.filter((_, i) => selected[i])
    }

    return {
        process, addFilters
    }
}

function ProxyOperator() {
    const operators = [];

    function addOperators(...args) {
        args.forEach(a => operators.push(a));
    }

    // run all operators
    function process(proxies) {
        let output = clone(proxies);
        for (const op of operators) {
            try {
                const output_ = op.func(output);
                if (output_) output = output_;
            } catch (err) {
                // print log and skip this operator
                console.log(`ERROR: cannot apply operator ${op.name}! Reason: ${err}`);
            }
        }
        return output;
    }

    return {addOperators, process}
}

/**************************** URI Format ***************************************/
// Parse SS URI format (only supports new SIP002, legacy format is depreciated).
// reference: https://shadowsocks.org/en/spec/SIP002-URI-Scheme.html
function URI_SS() {
    const patternTest = (line) => {
        return /^ss:\/\//.test(line);
    }
    const Base64 = new Base64Code();
    const supported = clone(DEFAULT_SUPPORTED_PLATFORMS);
    const func = (line) => {
        // parse url
        let content = line.split("ss://")[1];

        const proxy = {
            name: decodeURIComponent(line.split("#")[1]),
            type: "ss",
            supported
        }
        content = content.split("#")[0]; // strip proxy name

        // handle IPV4 and IPV6
        const serverAndPort = content.match(/@([^\/]*)\//)[1];
        const portIdx = serverAndPort.lastIndexOf(":");
        proxy.server = serverAndPort.substring(0, portIdx);
        proxy.port = serverAndPort.substring(portIdx + 1);

        const userInfo = Base64.safeDecode(content.split("@")[0]).split(":");
        proxy.cipher = userInfo[0];
        proxy.password = userInfo[1];

        // handle obfs
        const idx = content.indexOf("?plugin=");
        if (idx !== -1) {
            const pluginInfo = ("plugin=" + decodeURIComponent(content.split("?plugin=")[1])).split(";");
            const params = {};
            for (const item of pluginInfo) {
                const [key, val] = item.split("=");
                if (key) params[key] = val || true; // some options like "tls" will not have value
            }
            switch (params.plugin) {
                case 'simple-obfs':
                    proxy.plugin = 'obfs'
                    proxy['plugin-opts'] = {
                        mode: params.obfs,
                        host: params['obfs-host']
                    }
                    break
                case 'v2ray-plugin':
                    proxy.supported = {
                        ...DEFAULT_SUPPORTED_PLATFORMS,
                        Loon: false,
                        Surge: false
                    }
                    proxy.obfs = 'v2ray-plugin'
                    proxy['plugin-opts'] = {
                        mode: "websocket",
                        host: params['obfs-host'],
                        path: params.path || ""
                    }
                    break
                default:
                    throw new Error(`Unsupported plugin option: ${params.plugin}`)
            }
        }
        return proxy;
    }
    return {patternTest, func};
}

// Parse URI SSR format, such as ssr://xxx
function URI_SSR() {
    const patternTest = (line) => {
        return /^ssr:\/\//.test(line);
    }
    const Base64 = new Base64Code();
    const supported = {
        ...DEFAULT_SUPPORTED_PLATFORMS,
        Surge: false
    }

    const func = (line) => {
        line = Base64.safeDecode(line.split("ssr://")[1]);

        // handle IPV6 & IPV4 format
        let splitIdx = line.indexOf(':origin');
        if (splitIdx === -1) {
            splitIdx = line.indexOf(":auth_");
        }
        const serverAndPort = line.substring(0, splitIdx);
        const server = serverAndPort.substring(0, serverAndPort.lastIndexOf(":"));
        const port = serverAndPort.substring(serverAndPort.lastIndexOf(":") + 1);

        let params = line.substring(splitIdx + 1).split("/?")[0].split(":");
        let proxy = {
            type: "ssr",
            server,
            port,
            protocol: params[0],
            cipher: params[1],
            obfs: params[2],
            password: Base64.safeDecode(params[3]),
            supported
        }
        // get other params
        params = {};
        line = line.split("/?")[1].split("&");
        if (line.length > 1) {
            for (const item of line) {
                const [key, val] = item.split("=");
                params[key] = val;
            }
        }
        proxy = {
            ...proxy,
            name: Base64.safeDecode(params.remarks),
            "protocol-param": Base64.safeDecode(params.protoparam).replace(/\s/g, "") || "",
            "obfs-param": Base64.safeDecode(params.obfsparam).replace(/\s/g, "") || ""
        }
        return proxy;
    }

    return {patternTest, func};
}

// V2rayN URI VMess format
// reference: https://github.com/2dust/v2rayN/wiki/%E5%88%86%E4%BA%AB%E9%93%BE%E6%8E%A5%E6%A0%BC%E5%BC%8F%E8%AF%B4%E6%98%8E(ver-2)
function URI_VMess() {
    const patternTest = (line) => {
        return /^vmess:\/\//.test(line);
    }
    const Base64 = new Base64Code();
    const supported = clone(DEFAULT_SUPPORTED_PLATFORMS);
    const func = (line) => {
        line = line.split("vmess://")[1];
        const params = JSON.parse(Base64.safeDecode(line));
        const proxy = {
            name: params.ps,
            type: "vmess",
            server: params.add,
            port: params.port,
            cipher: "auto", // V2rayN has no default cipher! use aes-128-gcm as default.
            uuid: params.id,
            alterId: params.aid || 0,
            tls: JSON.parse(params.tls || "false"),
            supported
        }
        // handle obfs
        if (params.net === 'ws') {
            proxy.network = 'ws';
            proxy['ws-path'] = params.path;
            proxy['ws-headers'] = {
                Host: params.host || params.add
            }
        }
        return proxy
    }
    return {patternTest, func};
}

// Trojan URI format
function URI_Trojan() {
    const patternTest = (line) => {
        return /^trojan:\/\//.test(line);
    }
    const supported = clone(DEFAULT_SUPPORTED_PLATFORMS);
    const func = (line) => {
        // trojan forces to use 443 port
        if (line.indexOf(":443") === -1) {
            throw new Error("Trojan port should always be 443!");
        }
        line = line.split("trojan://")[1];
        const server = line.split("@")[1].split(":443")[0];

        return {
            name: `[Trojan] ${server}`, // trojan uri has no server tag!
            type: "trojan",
            server,
            port: 443,
            password: line.split("@")[0],
            supported
        }
    }
    return {patternTest, func};
}

/**************************** Quantumult X ***************************************/
function QX_SS() {
    const patternTest = (line) => {
        return /^shadowsocks\s*=/.test(line.split(",")[0].trim()) && line.indexOf("ssr-protocol") === -1;
    };
    const func = (line) => {
        const params = getQXParams(line);
        const proxy = {
            name: params.tag,
            type: "ss",
            server: params.server,
            port: params.port,
            cipher: params.method,
            password: params.password,
            udp: JSON.parse(params["udp-relay"] || "false"),
            tfo: JSON.parse(params["fast-open"] || "false"),
            supported: clone(DEFAULT_SUPPORTED_PLATFORMS)
        };
        // handle obfs options
        if (params.obfs) {
            proxy["plugin-opts"] = {
                host: params['obfs-host'] || proxy.server
            };
            switch (params.obfs) {
                case "http":
                case "tls":
                    proxy.plugin = "obfs";
                    proxy["plugin-opts"].mode = params.obfs;
                    break;
                case "ws":
                case "wss":
                    proxy["plugin-opts"] = {
                        ...proxy["plugin-opts"],
                        mode: "websocket",
                        path: params['obfs-uri'],
                        tls: params.obfs === 'wss'
                    }
                    proxy.plugin = "v2ray-plugin"
                    // Surge and Loon lack support for v2ray-plugin obfs
                    proxy.supported.Surge = false
                    proxy.supported.Loon = false
                    break;
            }
        }
        return proxy;
    };
    return {patternTest, func};
}

function QX_SSR() {
    const patternTest = (line) => {
        return /^shadowsocks\s*=/.test(line.split(",")[0].trim()) && line.indexOf("ssr-protocol") !== -1;
    };
    const supported = {
        ...DEFAULT_SUPPORTED_PLATFORMS,
        Surge: false
    }
    const func = (line) => {
        const params = getQXParams(line);
        const proxy = {
            name: params.tag,
            type: "ssr",
            server: params.server,
            port: params.port,
            cipher: params.method,
            password: params.password,
            protocol: params["ssr-protocol"],
            obfs: "plain", // default obfs
            "protocol-param": params['ssr-protocol-param'],
            udp: JSON.parse(params["udp-relay"] || "false"),
            tfo: JSON.parse(params["fast-open"] || "false"),
            supported
        }
        // handle obfs options
        if (params.obfs) {
            proxy.obfs = params.obfs;
            proxy['obfs-param'] = params['obfs-host']
        }
        return proxy;
    }
    return {patternTest, func};
}

function QX_VMess() {
    const patternTest = (line) => {
        return /^vmess\s*=/.test(line.split(",")[0].trim());
    };
    const func = (line) => {
        const params = getQXParams(line)
        const proxy = {
            type: "vmess",
            name: params.tag,
            server: params.server,
            port: params.port,
            cipher: params.method || 'none',
            uuid: params.password,
            alterId: 0,
            tls: params.obfs === 'over-tls' || params.obfs === 'wss',
            udp: JSON.parse(params["udp-relay"] || "false"),
            tfo: JSON.parse(params["fast-open"] || "false"),
        }
        if (proxy.tls) {
            proxy.sni = params['obfs-host'] || params.server;
            proxy.scert = !JSON.parse(params['tls-verification'] || 'true');
        }
        // handle ws headers
        if (params.obfs === 'ws' || params.obfs === 'wss') {
            proxy.network = 'ws';
            proxy['ws-path'] = params['obfs-uri'];
            proxy['ws-headers'] = {
                Host: params['obfs-host'] || params.server // if no host provided, use the same as server
            }
        }
        return proxy;
    }

    return {patternTest, func};
}

function QX_Trojan() {
    const patternTest = (line) => {
        return /^trojan\s*=/.test(line.split(",")[0].trim());
    };
    const func = (line) => {
        const params = getQXParams(line);
        const proxy = {
            type: "trojan",
            name: params.tag,
            server: params.server,
            port: params.port,
            password: params.password,
            sni: params['tls-host'] || params.server,
            udp: JSON.parse(params["udp-relay"] || "false"),
            tfo: JSON.parse(params["fast-open"] || "false"),
        }
        proxy.scert = !JSON.parse(params['tls-verification'] || 'true');
        return proxy;
    }
    return {patternTest, func}
}

function QX_Http() {
    const patternTest = (line) => {
        return /^http\s*=/.test(line.split(",")[0].trim());
    };
    const func = (line) => {
        const params = getQXParams(line);
        const proxy = {
            type: "http",
            name: params.tag,
            server: params.server,
            port: params.port,
            username: params.username,
            password: params.password,
            tls: JSON.parse(params['over-tls'] || "false"),
            udp: JSON.parse(params["udp-relay"] || "false"),
            tfo: JSON.parse(params["fast-open"] || "false"),
        }
        if (proxy.tls) {
            proxy.sni = params['tls-host'] || proxy.server;
            proxy.scert = !JSON.parse(params['tls-verification'] || 'true');
        }
        return proxy;
    }

    return {patternTest, func};
}

function getQXParams(line) {
    const groups = line.split(",");
    const params = {};
    const protocols = ["shadowsocks", "vmess", "http", "trojan"];
    groups.forEach((g) => {
        const [key, value] = g.split("=");
        if (protocols.indexOf(key) !== -1) {
            params.type = key;
            const conf = value.split(":");
            params.server = conf[0];
            params.port = conf[1];
        } else {
            params[key.trim()] = value.trim();
        }
    });
    return params;
}

/**************************** Loon ***************************************/
function Loon_SS() {
    const patternTest = (line) => {
        return line.split(",")[0].split("=")[1].trim().toLowerCase() === 'shadowsocks';
    }
    const func = (line) => {
        const params = line.split("=")[1].split(",");
        const proxy = {
            name: line.split("=")[0].trim(),
            type: "ss",
            server: params[1],
            port: params[2],
            cipher: params[3],
            password: params[4].replace(/"/g, "")
        }
        // handle obfs
        if (params.length > 5) {
            proxy.plugin = 'obfs';
            proxy['plugin-opts'] = {
                mode: proxy.obfs,
                host: params[6]
            }
        }
        return proxy;
    }
    return {patternTest, func};
}

function Loon_SSR() {
    const patternTest = (line) => {
        return line.split(",")[0].split("=")[1].trim().toLowerCase() === 'shadowsocksr';
    }
    const func = (line) => {
        const params = line.split("=")[1].split(",");
        const supported = clone(DEFAULT_SUPPORTED_PLATFORMS);
        supported.Surge = false;
        return {
            name: line.split("=")[0].trim(),
            type: "ssr",
            server: params[1],
            port: params[2],
            cipher: params[3],
            password: params[4].replace(/"/g, ""),
            protocol: params[5],
            "protocol-param": params[6].match(/{(.*)}/)[1],
            supported,
            obfs: params[7],
            'obfs-param': params[8].match(/{(.*)}/)[1]
        }
    }
    return {patternTest, func};
}

function Loon_VMess() {
    const patternTest = (line) => {
        // distinguish between surge vmess
        return /^.*=\s*vmess/i.test(line.split(",")[0]) && line.indexOf("username") === -1;
    }
    const func = (line) => {
        let params = line.split("=")[1].split(",");
        const proxy = {
            name: line.split("=")[0].trim(),
            type: "vmess",
            server: params[1],
            port: params[2],
            cipher: params[3] || 'none',
            uuid: params[4].replace(/"/g, ""),
            alterId: 0,
        }
        // get transport options
        params = params.splice(5);
        for (const item of params) {
            const [key, val] = item.split(":");
            params[key] = val;
        }
        proxy.tls = JSON.parse(params['over-tls'] || 'false');
        if (proxy.tls) {
            proxy.sni = params['tls-name'] || proxy.server;
            proxy.scert = JSON.parse(params['skip-cert-verify'] || 'false');
        }
        switch (params.transport) {
            case "tcp":
                break;
            case "ws":
                proxy.network = params.transport
                proxy['ws-path'] = params.path
                proxy['ws-headers'] = {
                    Host: params.host
                }
        }
        if (proxy.tls) {
            proxy.scert = JSON.parse(params['skip-cert-verify'] || 'false')
        }
        return proxy;
    }
    return {patternTest, func};
}

function Loon_Trojan() {
    const patternTest = (line) => {
        return /^.*=\s*trojan/i.test(line.split(",")[0]) && line.indexOf("password") === -1;
    }

    const func = (line) => {
        const params = line.split("=")[1].split(",");
        const proxy = {
            name: line.split("=")[0].trim(),
            type: "trojan",
            server: params[1],
            port: params[2],
            password: params[3].replace(/"/g, ""),
            sni: params[1], // default sni is the server itself
            scert: JSON.parse(params['skip-cert-verify'] || 'false')
        }
        // trojan sni
        if (params.length > 4) {
            const [key, val] = params[4].split(":");
            if (key === 'tls-name') proxy.sni = val;
            else throw new Error(`ERROR: unknown option ${key} for line: \n${line}`);
        }
        return proxy;
    }

    return {patternTest, func}
}

function Loon_Http() {
    const patternTest = (line) => {
        return /^.*=\s*http/i.test(line.split(",")[0])
            && line.split(",").length === 5
            && line.indexOf("username") === -1
            && line.indexOf("password") === -1
    }

    const func = (line) => {
        const params = line.split("=")[1].split(",");
        const proxy = {
            name: line.split("=")[0].trim(),
            type: "http",
            server: params[1],
            port: params[2],
            tls: params[2] === "443", // port 443 is considered as https type
            username: (params[3] || "").replace(/"/g, ""),
            password: (params[4] || "").replace(/"/g, "")
        }
        if (proxy.tls) {
            proxy.sni = params['tls-name'] || proxy.server;
            proxy.scert = JSON.parse(params['skip-cert-verify'] || 'false');
        }

        return proxy;
    }
    return {patternTest, func}
}

/**************************** Surge ***************************************/
function Surge_SS() {
    const patternTest = (line) => {
        return /^.*=\s*ss/.test(line.split(",")[0]);
    }
    const func = (line) => {
        const params = getSurgeParams(line);
        const proxy = {
            name: params.name,
            type: "ss",
            server: params.server,
            port: params.port,
            cipher: params['encrypt-method'],
            password: params.password,
            tfo: JSON.parse(params.tfo || "false"),
            udp: JSON.parse(params['udp-relay'] || "false"),
        }
        // handle obfs
        if (params.obfs) {
            proxy.plugin = 'obfs';
            proxy['plugin-opts'] = {
                mode: params.obfs,
                host: params['obfs-host']
            }
        }
        return proxy;
    }
    return {patternTest, func}
}

function Surge_VMess() {
    const patternTest = (line) => {
        return /^.*=\s*vmess/.test(line.split(",")[0]) && line.indexOf("username") !== -1;
    }
    const func = (line) => {
        const params = getSurgeParams(line);
        const proxy = {
            name: params.name,
            type: "vmess",
            server: params.server,
            port: params.port,
            uuid: params.username,
            alterId: 0, // surge does not have this field
            cipher: "none", // surge does not have this field
            tls: JSON.parse(params.tls || "false"),
            tfo: JSON.parse(params.tfo || "false"),
        }
        if (proxy.tls) {
            proxy.scert = JSON.parse(params['skip-cert-verify'] || "false");
            proxy.sni = params['sni'] || params.server;
        }
        // use websocket
        if (JSON.parse(params.ws || "false")) {
            proxy.network = 'ws';
            proxy['ws-path'] = params['ws-path'];
            proxy['ws-headers'] = {
                Host: params.sni
            }
        }
        return proxy;
    }
    return {patternTest, func};
}

function Surge_Trojan() {
    const patternTest = (line) => {
        return /^.*=\s*trojan/.test(line.split(",")[0]) && line.indexOf("sni") !== -1;
    }
    const func = (line) => {
        const params = getSurgeParams(line);
        return {
            name: params.name,
            type: "trojan",
            server: params.server,
            port: params.port,
            password: params.password,
            sni: params.sni || params.server,
            tfo: JSON.parse(params.tfo || "false"),
            scert: JSON.parse(params['skip-cert-verify'] || "false"),
        }
    }

    return {patternTest, func};
}

function Surge_Http() {
    const patternTest = (line) => {
        return /^.*=\s*http/.test(line.split(",")[0]) && !Loon_Http().patternTest(line)
    }
    const func = (line) => {
        const params = getSurgeParams(line);
        const proxy = {
            name: params.name,
            type: "http",
            server: params.server,
            port: params.port,
            tls: JSON.parse(params.tls || "false"),
            tfo: JSON.parse(params.tfo || "false"),
        }
        if (proxy.tls) {
            proxy.scert = JSON.parse(params['skip-cert-verify'] || "false");
            proxy.sni = params.sni || params.server;
        }
        if (params.username !== 'none') proxy.username = params.username;
        if (params.password !== 'none') proxy.password = params.password;
        return proxy;
    }
    return {patternTest, func}
}

function getSurgeParams(line) {
    const params = {};
    params.name = line.split("=")[0].trim();
    const segments = line.split(",");
    params.server = segments[1].trim();
    params.port = segments[2].trim();
    for (let i = 3; i < segments.length; i++) {
        const item = segments[i]
        if (item.indexOf("=") !== -1) {
            const [key, value] = item.split("=");
            params[key.trim()] = value.trim();
        }
    }
    return params;
}

/**************************** Output Functions ***************************************/
function QX_Producer() {
    const targetPlatform = "QX";
    const output = (proxy) => {
        let obfs_opts;
        let tls_opts;
        switch (proxy.type) {
            case 'ss':
                obfs_opts = "";
                if (proxy.plugin === 'obfs') {
                    obfs_opts = `,obfs=${proxy['plugin-opts'].mode},obfs-host=${proxy['plugin-opts'].host}`;
                }
                if (proxy.plugin === 'v2ray-plugin') {
                    const {tls, host, path} = proxy['plugin-opts'];
                    obfs_opts = `,obfs=${tls ? 'wss' : 'ws'},obfs-host=${host}${path ? ',obfs-uri=' + path : ""}`;
                }
                return `shadowsocks = ${proxy.server}:${proxy.port}, method=${proxy.cipher}, password=${proxy.password}${obfs_opts}${proxy.tfo ? ", fast-open=true" : ", fast-open=false"}${proxy.udp ? ", udp-relay=true" : ", udp-relay=false"}, tag=${proxy.name}`
            case 'ssr':
                return `shadowsocks=${proxy.server}:${proxy.port},method=${proxy.cipher},password=${proxy.password},ssr-protocol=${proxy.protocol}${proxy['protocol-param'] ? ",ssr-protocol-param=" + proxy['protocol-param'] : ""}${proxy.obfs ? ",obfs=" + proxy.obfs : ""}${proxy['obfs-param'] ? ",obfs-host=" + proxy['obfs-param'] : ""}${proxy.tfo ? ",fast-open=true" : ",fast-open=false"}${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"},tag=${proxy.name}`
            case 'vmess':
                obfs_opts = "";
                if (proxy.network === 'ws') {
                    // websocket
                    if (proxy.tls) {
                        // ws-tls
                        obfs_opts = `,obfs=wss,obfs-host=${proxy.sni}${proxy['ws-path'] ? ",obfs-uri=" + proxy['ws-path'] : ""},tls-verification=${proxy.scert ? "false" : "true"}`;
                    } else {
                        // ws
                        obfs_opts = `,obfs=ws,obfs-host=${proxy['ws-headers'].Host}${proxy['ws-path'] ? ",obfs-uri=" + proxy['ws-path'] : ""}`;
                    }
                } else {
                    // tcp
                    if (proxy.tls) {
                        obfs_opts = `,obfs=over-tls,obfs-host=${proxy.sni},tls-verification=${proxy.scert ? "false" : "true"}`;
                    }
                }
                return `vmess=${proxy.server}:${proxy.port},method=${proxy.cipher},password=${proxy.uuid}${obfs_opts}${proxy.tfo ? ",fast-open=true" : ",fast-open=false"}${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"},tag=${proxy.name}`
            case 'trojan':
                return `trojan=${proxy.server}:${proxy.port},password=${proxy.password},tls-host=${proxy.sni},tls-verification=${proxy.scert ? "false" : "true"}${proxy.tfo ? ",fast-open=true" : ",fast-open=false"}${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"},tag=${proxy.name}`
            case 'http':
                tls_opts = "";
                if (proxy.tls) {
                    tls_opts = `,over-tls=true,tls-verification=${proxy.scert ? "false" : "true"},tls-host=${proxy.sni}`;
                }
                return `http=${proxy.server}:${proxy.port},username=${proxy.username},password=${proxy.password}${tls_opts}${proxy.tfo ? ",fast-open=true" : ",fast-open=false"},tag=${proxy.name}`;
        }
        throw new Error(`Platform ${targetPlatform} does not support proxy type: ${proxy.type}`);
    }
    return {targetPlatform, output};
}

function Loon_Producer() {
    const targetPlatform = "Loon";
    const output = (proxy) => {
        let obfs_opts, tls_opts;
        switch (proxy.type) {
            case "ss":
                obfs_opts = ",,";
                if (proxy.plugin === 'obfs') {
                    const {mode, host} = proxy['plugin-opts'];
                    obfs_opts = `,${mode},${host}`
                }
                return `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},${proxy.password}${obfs_opts}`;
            case "ssr":
                return `${proxy.name}=shadowsocksr,${proxy.server},${proxy.port},${proxy.cipher},${proxy.password},${proxy.protocol},{${proxy['protocol-param']}},${proxy.obfs},{${proxy['obfs-param']}}`
            case "vmess":
                obfs_opts = "";
                if (proxy.network === 'ws') {
                    const host = proxy['ws-headers'].Host;
                    obfs_opts = `,transport:ws,host:${host},path:${proxy['ws-path']}`;
                } else {
                    obfs_opts = `,transport:tcp`;
                }
                if (proxy.tls) {
                    obfs_opts += `,tls-name=${proxy.sni},skip-cert-verify:${proxy.scert}`;
                }
                return `${proxy.name}=vmess,${proxy.server},${proxy.port},${proxy.cipher},over-tls:${proxy.tls}${obfs_opts}`;
            case "trojan":
                return `${proxy.name}=trojan,${proxy.server},${proxy.port},${proxy.password},tls-name:${proxy.sni},skip-cert-verify:${proxy.scert}`;
            case "http":
                tls_opts = "";
                const base = `${proxy.name}=${proxy.tls ? 'http' : 'https'},${proxy.server},${proxy.port},${proxy.username || ""},${proxy.password || ""}`;
                if (proxy.tls) {
                    // https
                    tls_opts = `,skip-cert-verify:${proxy.scert},tls-name:${proxy.sni}`;
                    return base + tls_opts;
                } else return base;
        }
        throw new Error(`Platform ${targetPlatform} does not support proxy type: ${proxy.type}`);
    }
    return {targetPlatform, output}
}

function Surge_Producer() {
    const targetPlatform = "Surge";
    const output = (proxy) => {
        let obfs_opts, tls_opts;
        switch (proxy.type) {
            case 'ss':
                obfs_opts = "";
                if (proxy.plugin === "obfs") {
                    obfs_opts = `,obfs=${proxy['plugin-opts'].mode},obfs-host=${proxy['plugin-opts'].host}`
                } else {
                    throw new Error(`Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`);
                }
                return `${proxy.name}=ss,${proxy.server},${proxy.port},encrypt-method=${proxy.cipher},password=${proxy.password}${obfs_opts},tfo=${proxy.tfo || 'false'},udp-relay=${proxy.udp || 'false'}`;
            case 'vmess':
                tls_opts = "";
                let config = `${proxy.name}=vmess,${proxy.server},${proxy.port},username=${proxy.uuid},tls=${proxy.tls},tfo=${proxy.tfo || "false"}`;
                if (proxy.network === 'ws') {
                    const path = proxy['ws-path'];
                    const host = proxy['ws-headers'].Host;
                    config += `,ws=true${path ? ',ws-path=' + path : ""}${host ? ',ws-headers=HOST:' + host : ""}`;
                }
                if (proxy.tls) {
                    config += `,skip-cert-verify=${proxy.scert},sni=${proxy.sni}`;
                }
                return config;
            case 'trojan':
                return `${proxy.name}=trojan,${proxy.server},${proxy.port},password=${proxy.password},sni=${proxy.sni},tfo=${proxy.tfo || 'false'}`;
            case 'http':
                tls_opts = ",tls=false";
                if (proxy.tls) {
                    tls_opts = `,tls=true,skip-cert-verify=${proxy.scert},sni=${proxy.sni}`;
                }
                return `${proxy.name}=http,${proxy.server},${proxy.port}${proxy.username ? ",username=" + proxy.username : ""}${proxy.password ? ",password=" + proxy.password : ""}${tls_opts},tfo=${proxy.tfo || 'false'}`;
        }
        throw new Error(`Platform ${targetPlatform} does not support proxy type: ${proxy.type}`);
    }
    return {targetPlatform, output};
}

function Node_Producer() {
    const targetPlatform = "Node";
    const output = (proxy) => {
        return JSON.stringify(proxy);
    }
    return {targetPlatform, output};
}

/**************************** Operators ***************************************/
// force to set some properties (e.g., scert, udp, tfo, etc.)
function SetPropertyOperator(key, val) {
    return {
        name: "Set",
        func: proxies => {
            return proxies.map(p => {
                p[key] = val;
                return p;
            })
        }
    }
}

// add or remove flag for proxies
function FlagOperator(type) {
    return {
        name: "Flag Operator",
        func: proxies => {
            return proxies.map(proxy => {
                switch (type) {
                    case 0:
                        // no flag
                        proxy.name = removeFlag(proxy.name);
                        break
                    case 1:
                        // get flag
                        const newFlag = getFlag(proxy.name);
                        // remove old flag
                        proxy.name = removeFlag(proxy.name);
                        proxy.name = newFlag + " " + proxy.name;
                        proxy.name = proxy.name.replace(/🇹🇼/g, "🇨🇳");
                        break;
                    default:
                        throw new Error("Unknown flag type: " + type);
                }
                return proxy;
            })
        }
    }
}

// sort proxies according to their names
function SortOperator(order = 'asc') {
    return {
        name: "Sort Operator",
        func: proxies => {
            switch (order) {
                case "asc":
                case 'desc':
                    return proxies.sort((a, b) => {
                        let res = (a.name > b.name) ? 1 : -1;
                        res *= order === 'desc' ? -1 : 1;
                        return res
                    })
                case 'random':
                    return shuffle(proxies);
                default:
                    throw new Error("Unknown sort option: " + order);
            }
        }
    }
}

// sort by keywords
function KeywordSortOperator(...keywords) {
    return {
        name: "Keyword Sort Operator",
        func: proxies => proxies.sort((a, b) => {
            const oA = getKeywordOrder(keywords, a.name);
            const oB = getKeywordOrder(keywords, b.name);
            if (oA && !oB) return -1;
            if (oB && !oA) return 1;
            if (oA && oB) return oA < oB ? -1 : 1;
            if ((!oA && !oB) || (oA && oB && oA === oB)) return a.name < b.name ? -1 : 1; // fallback to normal sort
        })
    }
}

function getKeywordOrder(keywords, str) {
    let order = null;
    for (let i = 0; i < keywords.length; i++) {
        if (str.indexOf(keywords[i]) !== -1) {
            order = i + 1; // plus 1 is important! 0 will be treated as false!!!
            break;
        }
    }
    return order;
}

// rename by keywords
// keywords: [{old: "old", now: "now"}]
function KeywordRenameOperator(...keywords) {
    return {
        name: "Keyword Rename Operator",
        func: proxies => {
            return proxies.map(proxy => {
                for (const {old, now} of keywords) {
                    proxy.name = proxy.name.replace(old, now);
                }
                return proxy;
            })
        }
    }
}

// rename by regex
// keywords: [{expr: "string format regex", now: "now"}]
function RegexRenameOperator(...regex) {
    return {
        name: "Regex Rename Operator",
        func: proxies => {
            return proxies.map(proxy => {
                for (const {expr, now} of regex) {
                    proxy.name = proxy.name.replace(new RegExp(expr, "g"), now);
                }
                return proxy;
            })
        }
    }
}

// delete keywords operator
// keywords: ['a', 'b', 'c']
function KeywordDeleteOperator(...keywords) {
    const keywords_ = keywords.map(k => {
        return {
            old: k,
            now: ""
        }
    })
    return {
        name: "Keyword Delete Operator",
        func: KeywordRenameOperator(keywords_).func
    }
}

// delete regex operator
// regex: ['a', 'b', 'c']
function RegexDeleteOperator(...regex) {
    const regex_ = regex.map(r => {
        return {
            expr: r,
            now: ""
        }
    });
    return {
        name: "Regex Delete Operator",
        func: RegexRenameOperator(regex_).func
    }
}

// use base64 encoded script to rename
/** Example script
 function func(proxies) {
    // do something
    return proxies;
 }

 WARNING:
 1. This function name should be `func`!
 2. Always declare variable before using it!
 */
function ScriptOperator(script, encoded = true) {
    if (encoded) {
        const Base64 = new Base64Code();
        script = Base64.safeDecode(script);
    }

    return {
        name: "Script Operator",
        func: (proxies) => {
            ;(function () {
                eval(script);
                return func(proxies);
            })();
        }
    }
}

/**************************** Filters ***************************************/
// filter by keywords
function KeywordFilter(...keywords) {
    return {
        name: "Keyword Filter",
        func: (proxies) => {
            return proxies.map(proxy => keywords.some(k => proxy.name.indexOf(k) !== -1));
        }
    }
}

function DiscardKeywordFilter(...keywords) {
    return {
        name: "Discard Keyword Filter",
        func: proxies => {
            const filter = KeywordFilter(keywords).func;
            return NOT(filter(proxies));
        }
    }
}

// filter useless proxies
function UselessFilter() {
    const KEYWORDS = ["流量", "时间", "应急", "过期", "Bandwidth", "expire"];
    return {
        name: "Useless Filter",
        func: DiscardKeywordFilter(KEYWORDS).func
    }
}

// filter by regions
function RegionFilter(...regions) {
    const REGION_MAP = {
        "HK": "🇭🇰",
        "TW": "🇹🇼",
        "US": "🇺🇸",
        "SG": "🇸🇬",
        "JP": "🇯🇵",
        "UK": "🇬🇧",
        "KR": "🇰🇷"
    };
    return {
        name: "Region Filter",
        func: (proxies) => {
            // this would be high memory usage
            return proxies.map(proxy => {
                const flag = getFlag(proxy.name);
                return regions.some(r => REGION_MAP[r] === flag);
            })
        }
    }
}

// filter by regex
function RegexFilter(...regex) {
    return {
        name: "Regex Filter",
        func: (proxies) => {
            return proxies.map(proxy => regex.some(r => r.test(proxy.name)));
        }
    }
}

function DiscardRegexFilter(...regex) {
    return {
        name: "Discard Regex Filter",
        func: proxies => {
            const filter = RegexFilter(regex).func;
            return NOT(filter(proxies));
        }
    }
}

// filter by proxy types
function TypeFilter(...types) {
    return {
        name: "Type Filter",
        func: (proxies) => {
            return proxies.map(proxy => types.some(t => proxy.type === t));
        }
    }
}

// use base64 encoded script to filter proxies
/** Script Example
 function func(proxies) {
    const selected = FULL(proxies.length, true);
    // do something
    return selected;
 }
 WARNING:
 1. This function name should be `func`!
 2. Always declare variable before using it!
 */
function ScriptFilter(script, encoded = true) {
    if (encoded) {
        const Base64 = new Base64Code();
        script = Base64.safeDecode(script);
    }
    return {
        name: "Script Filter",
        func: (proxies) => {
            !(function () {
                eval(script);
                return filter(proxies);
            })();
        }
    }
}

/******************************** Utility Functions *********************************************/
// get proxy flag according to its name
function getFlag(name) {
    // flags from @KOP-XIAO: https://github.com/KOP-XIAO/QuantumultX/blob/master/Scripts/resource-parser.js
    const flags = {
        "🏳️‍🌈": ["流量", "时间", "应急", "过期", "Bandwidth", "expire"],
        "🇦🇨": ["AC"],
        "🇦🇹": ["奥地利", "维也纳"],
        "🇦🇺": ["AU", "Australia", "Sydney", "澳大利亚", "澳洲", "墨尔本", "悉尼"],
        "🇧🇪": ["BE", "比利时"],
        "🇧🇬": ["保加利亚", "Bulgaria"],
        "🇧🇷": ["BR", "Brazil", "巴西", "圣保罗"],
        "🇨🇦": ["Canada", "Waterloo", "加拿大", "蒙特利尔", "温哥华", "楓葉", "枫叶", "滑铁卢", "多伦多"],
        "🇨🇭": ["瑞士", "苏黎世", "Switzerland"],
        "🇩🇪": ["DE", "German", "GERMAN", "德国", "德國", "法兰克福"],
        "🇩🇰": ["丹麦"],
        "🇪🇸": ["ES", "西班牙", "Spain"],
        "🇪🇺": ["EU", "欧盟", "欧罗巴"],
        "🇫🇮": ["Finland", "芬兰", "赫尔辛基"],
        "🇫🇷": ["FR", "France", "法国", "法國", "巴黎"],
        "🇬🇧": ["UK", "GB", "England", "United Kingdom", "英国", "伦敦", "英"],
        "🇲🇴": ["MO", "Macao", "澳门", "CTM"],
        "🇭🇺": ["匈牙利", "Hungary"],
        "🇭🇰": ["HK", "Hongkong", "Hong Kong", "香港", "深港", "沪港", "呼港", "HKT", "HKBN", "HGC", "WTT", "CMI", "穗港", "京港", "港"],
        "🇮🇩": ["Indonesia", "印尼", "印度尼西亚", "雅加达"],
        "🇮🇪": ["Ireland", "爱尔兰", "都柏林"],
        "🇮🇳": ["India", "印度", "孟买", "Mumbai"],
        "🇰🇵": ["KP", "朝鲜"],
        "🇰🇷": ["KR", "Korea", "KOR", "韩国", "首尔", "韩", "韓"],
        "🇱🇻": ["Latvia", "Latvija", "拉脱维亚"],
        "🇲🇽️": ["MEX", "MX", "墨西哥"],
        "🇲🇾": ["MY", "Malaysia", "马来西亚", "吉隆坡"],
        "🇳🇱": ["NL", "Netherlands", "荷兰", "荷蘭", "尼德蘭", "阿姆斯特丹"],
        "🇵🇭": ["PH", "Philippines", "菲律宾"],
        "🇷🇴": ["RO", "罗马尼亚"],
        "🇷🇺": ["RU", "Russia", "俄罗斯", "俄羅斯", "伯力", "莫斯科", "圣彼得堡", "西伯利亚", "新西伯利亚", "京俄", "杭俄"],
        "🇸🇦": ["沙特", "迪拜"],
        "🇸🇪": ["SE", "Sweden"],
        "🇸🇬": ["SG", "Singapore", "新加坡", "狮城", "沪新", "京新", "泉新", "穗新", "深新", "杭新", "广新"],
        "🇹🇭": ["TH", "Thailand", "泰国", "泰國", "曼谷"],
        "🇹🇷": ["TR", "Turkey", "土耳其", "伊斯坦布尔"],
        "🇹🇼": ["TW", "Taiwan", "台湾", "台北", "台中", "新北", "彰化", "CHT", "台", "HINET"],
        "🇺🇸": ["US", "USA", "America", "United States", "美国", "美", "京美", "波特兰", "达拉斯", "俄勒冈", "凤凰城", "费利蒙", "硅谷", "矽谷", "拉斯维加斯", "洛杉矶", "圣何塞", "圣克拉拉", "西雅图", "芝加哥", "沪美", "哥伦布", "纽约"],
        "🇻🇳": ["VN", "越南", "胡志明市"],
        "🇮🇹": ["Italy", "IT", "Nachash", "意大利", "米兰", "義大利"],
        "🇿🇦": ["South Africa", "南非"],
        "🇦🇪": ["United Arab Emirates", "阿联酋"],
        "🇯🇵": ["JP", "Japan", "日", "日本", "东京", "大阪", "埼玉", "沪日", "穗日", "川日", "中日", "泉日", "杭日", "深日", "辽日", "广日"],
        "🇦🇷": ["AR", "阿根廷"],
        "🇳🇴": ["Norway", "挪威", "NO"],
        "🇨🇳": ["CN", "China", "回国", "中国", "江苏", "北京", "上海", "广州", "深圳", "杭州", "徐州", "青岛", "宁波", "镇江", "back"]
    };
    for (let k of Object.keys(flags)) {
        if (flags[k].some((item => name.indexOf(item) !== -1))) {
            return k;
        }
    }
    // no flag found
    const oldFlag = (name.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/) || [])[0];
    return oldFlag || "🏴‍☠️";
}

// remove flag
function removeFlag(str) {
    return str.replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, "").trim();
}

// clone an object
function clone(obj) {
    return JSON.parse(JSON.stringify(obj))
}

// shuffle array
function shuffle(array) {
    let currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

// some logical functions for proxy filters
function AND(...args) {
    return args.reduce((a, b) => a.map((c, i) => b[i] && c));
}

function OR(...args) {
    return args.reduce((a, b) => a.map((c, i) => b[i] || c))
}

function NOT(array) {
    return array.map(c => !c);
}

function FULL(length, bool) {
    return [...Array(length).keys()].map(() => bool);
}

// UUID
// source: https://stackoverflow.com/questions/105034/how-to-create-guid-uuid
function UUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// get platform form UA
function getPlatformFromHeaders(headers) {
    const keys = Object.keys(headers);
    let UA = "";
    for (let k of keys) {
        if (k.match(/USER-AGENT/i)) {
            UA = headers[k];
            break;
        }
    }
    if (UA.indexOf("Quantumult%20X") !== -1) {
        return "QX";
    } else if (UA.indexOf("Surge") !== -1) {
        return "Surge";
    } else if (UA.indexOf("Decar") !== -1) {
        return "Loon";
    } else {
        return FALL_BACK_TARGET;
    }
}

/*********************************** OpenAPI *************************************/
// OpenAPI
// prettier-ignore
function ENV() {
    const e = "undefined" != typeof $task, t = "undefined" != typeof $loon,
        s = "undefined" != typeof $httpClient && !this.isLoon,
        o = "function" == typeof require && "undefined" != typeof $jsbox;
    return {isQX: e, isLoon: t, isSurge: s, isNode: "function" == typeof require && !o, isJSBox: o}
}

function HTTP(e, t = {}) {
    const {isQX: s, isLoon: o, isSurge: n} = ENV();
    const i = {};
    return ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].forEach(r => i[r.toLowerCase()] = (i => (function (i, r) {
        (r = "string" == typeof r ? {url: r} : r).url = e ? e + r.url : r.url;
        const u = (r = {...t, ...r}).timeout, h = {
            onRequest: () => {
            }, onResponse: e => e, onTimeout: () => {
            }, ...r.events
        };
        let c, l;
        h.onRequest(i, r), c = s ? $task.fetch({method: i, ...r}) : new Promise((e, t) => {
            (n || o ? $httpClient : require("request"))[i.toLowerCase()](r, (s, o, n) => {
                s ? t(s) : e({statusCode: o.status || o.statusCode, headers: o.headers, body: n})
            })
        });
        const a = u ? new Promise((e, t) => {
            l = setTimeout(() => (h.onTimeout(), t(`${i} URL: ${r.url} exceeds the timeout ${u} ms`)), u)
        }) : null;
        return (a ? Promise.race([a, c]).then(e => (clearTimeout(l), e)) : c).then(e => h.onResponse(e))
    })(r, i))), i
}

function API(e = "untitled", t = !1) {
    const {isQX: s, isLoon: o, isSurge: n, isNode: i, isJSBox: r} = ENV();
    return new class {
        constructor(e, t) {
            this.name = e, this.debug = t, this.http = HTTP(), this.env = ENV(), this.node = (() => {
                if (i) {
                    return {fs: require("fs")}
                }
                return null
            })(), this.initCache();
            Promise.prototype.delay = function (e) {
                return this.then(function (t) {
                    return ((e, t) => new Promise(function (s) {
                        setTimeout(s.bind(null, t), e)
                    }))(e, t)
                })
            }
        }

        initCache() {
            if (s && (this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}")), (o || n) && (this.cache = JSON.parse($persistentStore.read(this.name) || "{}")), i) {
                let e = "root.json";
                this.node.fs.existsSync(e) || this.node.fs.writeFileSync(e, JSON.stringify({}), {flag: "wx"}, e => console.log(e)), this.root = {}, e = `${this.name}.json`, this.node.fs.existsSync(e) ? this.cache = JSON.parse(this.node.fs.readFileSync(`${this.name}.json`)) : (this.node.fs.writeFileSync(e, JSON.stringify({}), {flag: "wx"}, e => console.log(e)), this.cache = {})
            }
        }

        persistCache() {
            const e = JSON.stringify(this.cache);
            s && $prefs.setValueForKey(e, this.name), (o || n) && $persistentStore.write(e, this.name), i && (this.node.fs.writeFileSync(`${this.name}.json`, e, {flag: "w"}, e => console.log(e)), this.node.fs.writeFileSync("root.json", JSON.stringify(this.root), {flag: "w"}, e => console.log(e)))
        }

        write(e, t) {
            this.log(`SET ${t}`), -1 !== t.indexOf("#") ? (t = t.substr(1), n & o && $persistentStore.write(e, t), s && $prefs.setValueForKey(e, t), i && (this.root[t] = e)) : this.cache[t] = e, this.persistCache()
        }

        read(e) {
            return this.log(`READ ${e}`), -1 === e.indexOf("#") ? this.cache[e] : (e = e.substr(1), n & o ? $persistentStore.read(e) : s ? $prefs.valueForKey(e) : i ? this.root[e] : void 0)
        }

        delete(e) {
            this.log(`DELETE ${e}`), -1 !== e.indexOf("#") ? (e = e.substr(1), n & o && $persistentStore.write(null, e), s && $prefs.removeValueForKey(e), i && delete this.root[e]) : delete this.cache[e], this.persistCache()
        }

        notify(e, t = "", u = "", h = {}) {
            const c = h["open-url"], l = h["media-url"], a = u + (c ? `\n点击跳转: ${c}` : "") + (l ? `\n多媒体: ${l}` : "");
            if (s && $notify(e, t, u, h), n && $notification.post(e, t, a), o && $notification.post(e, t, u, c), i) if (r) {
                require("push").schedule({title: e, body: (t ? t + "\n" : "") + a})
            } else console.log(`${e}\n${t}\n${a}\n\n`)
        }

        log(e) {
            this.debug && console.log(e)
        }

        info(e) {
            console.log(e)
        }

        error(e) {
            console.log("ERROR: " + e)
        }

        wait(e) {
            return new Promise(t => setTimeout(t, e))
        }

        done(e = {}) {
            s || o || n ? $done(e) : i && !r && "undefined" != typeof $context && ($context.headers = e.headers, $context.statusCode = e.statusCode, $context.body = e.body)
        }
    }(e, t)
}

/*********************************** Mini Express *************************************/
function express(port = 3000) {
    const {isNode} = ENV();

    // node support
    if (isNode) {
        const express_ = require("express");
        const bodyParser = require("body-parser");
        const app = express_();
        app.use(bodyParser.json({verify: rawBodySaver}));
        app.use(bodyParser.urlencoded({verify: rawBodySaver, extended: true}));
        app.use(bodyParser.raw({verify: rawBodySaver, type: '*/*'}));

        // adapter
        app.start = () => {
            app.listen(port, () => {
                console.log(`Express started on port: ${port}`);
            })
        }
        return app;
    }

    // route handlers
    const handlers = [];

    // http methods
    const METHODS_NAMES = [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "OPTIONS",
        "HEAD'",
        "ALL",
    ];

    // dispatch url to route
    const dispatch = (request, start = 0) => {
        let {method, url, headers, body} = request;
        method = method.toUpperCase();
        const {path, query} = extractURL(url);
        let handler = null;
        let i;

        for (i = start; i < handlers.length; i++) {
            if (handlers[i].method === "ALL" || method === handlers[i].method) {
                const {pattern} = handlers[i];
                if (patternMatched(pattern, path)) {
                    handler = handlers[i];
                    break;
                }
            }
        }
        if (handler) {
            // dispatch to next handler
            const next = () => {
                dispatch(method, url, i);
            };
            const req = {
                method, url, path, query,
                params: extractPathParams(handler.pattern, path),
                headers, body
            };
            const res = Response();
            handler.callback(req, res, next).catch(err => {
                res.status(500).json({
                    status: "failed",
                    message: err
                });
            });
        } else {
            // no route, return 404
            const res = Response();
            res.status("404").json({
                status: "failed",
                message: "ERROR: 404 not found"
            });
        }
    };

    const app = {};

    // attach http methods
    METHODS_NAMES.forEach((method) => {
        app[method.toLowerCase()] = (pattern, callback) => {
            // add handler
            handlers.push({method, pattern, callback});
        };
    });

    // chainable route
    app.route = (pattern) => {
        const chainApp = {};
        METHODS_NAMES.forEach((method) => {
            chainApp[method.toLowerCase()] = (callback) => {
                // add handler
                handlers.push({method, pattern, callback});
                return chainApp;
            };
        });
        return chainApp;
    };

    // start service
    app.start = () => {
        dispatch($request);
    };

    return app;

    /************************************************
     Utility Functions
     *************************************************/
    function rawBodySaver(req, res, buf, encoding) {
        if (buf && buf.length) {
            req.rawBody = buf.toString(encoding || 'utf8');
        }
    }

    function Response() {
        let statusCode = "200";
        const {isQX, isLoon, isSurge} = ENV();
        const headers = {
            "Content-Type": "text/plain;charset=UTF-8",
        };
        return new (class {
            status(code) {
                statusCode = code;
                return this;
            }

            send(body = "") {
                const response = {
                    status: statusCode,
                    body,
                    headers,
                };
                if (isQX) {
                    $done(...response);
                } else if (isLoon || isSurge) {
                    $done({
                        response,
                    });
                }
            }

            end() {
                this.send();
            }

            html(data) {
                this.set("Content-Type", "text/html;charset=UTF-8");
                this.send(data);
            }

            json(data) {
                this.set("Content-Type", "application/json;charset=UTF-8");
                this.send(JSON.stringify(data));
            }

            set(key, val) {
                headers[key] = val;
                return this;
            }
        })();
    }

    function patternMatched(pattern, path) {
        if (pattern instanceof RegExp && pattern.test(path)) {
            return true;
        } else {
            // root pattern, match all
            if (pattern === "/") return true;
            // normal string pattern
            if (pattern.indexOf(":") === -1) {
                const spath = path.split("/");
                const spattern = pattern.split("/");
                for (let i = 0; i < spattern.length; i++) {
                    if (spath[i] !== spattern[i]) {
                        return false;
                    }
                }
                return true;
            }
            // string pattern with path parameters
            else if (extractPathParams(pattern, path)) {
                return true;
            }
        }
        return false;
    }

    function extractURL(url) {
        // extract path
        const match = url.match(/https?:\/\/[^\/]+(\/[^?]*)/) || [];
        const path = match[1] || "/";

        // extract query string
        const split = url.indexOf("?");
        const query = {};
        if (split !== -1) {
            let hashes = url.slice(url.indexOf("?") + 1).split("&");
            for (let i = 0; i < hashes.length; i++) {
                hash = hashes[i].split("=");
                query[hash[0]] = hash[1];
            }
        }
        return {
            path,
            query,
        };
    }

    function extractPathParams(pattern, path) {
        if (pattern.indexOf(":") === -1) {
            return null;
        } else {
            const params = {};
            for (let i = 0, j = 0; i < pattern.length; i++, j++) {
                if (pattern[i] === ":") {
                    let key = [];
                    let val = [];
                    while (pattern[++i] !== "/" && i < pattern.length) {
                        key.push(pattern[i]);
                    }
                    while (path[j] !== "/" && j < path.length) {
                        val.push(path[j++]);
                    }
                    params[key.join("")] = val.join("");
                } else {
                    if (pattern[i] !== path[j]) {
                        return null;
                    }
                }
            }
            return params;
        }
    }
}

/******************************** Base 64 *********************************************/
// Base64 Coding Library
// https://github.com/dankogai/js-base64#readme
// Under BSD License
function Base64Code() {
    // constants
    const b64chars
        = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const b64tab = function (bin) {
        const t = {};
        let i = 0;
        const l = bin.length;
        for (; i < l; i++) t[bin.charAt(i)] = i;
        return t;
    }(b64chars);
    const fromCharCode = String.fromCharCode;
    // encoder stuff
    const cb_utob = function (c) {
        let cc;
        if (c.length < 2) {
            cc = c.charCodeAt(0);
            return cc < 0x80 ? c
                : cc < 0x800 ? (fromCharCode(0xc0 | (cc >>> 6))
                    + fromCharCode(0x80 | (cc & 0x3f)))
                    : (fromCharCode(0xe0 | ((cc >>> 12) & 0x0f))
                        + fromCharCode(0x80 | ((cc >>> 6) & 0x3f))
                        + fromCharCode(0x80 | (cc & 0x3f)));
        } else {
            cc = 0x10000
                + (c.charCodeAt(0) - 0xD800) * 0x400
                + (c.charCodeAt(1) - 0xDC00);
            return (fromCharCode(0xf0 | ((cc >>> 18) & 0x07))
                + fromCharCode(0x80 | ((cc >>> 12) & 0x3f))
                + fromCharCode(0x80 | ((cc >>> 6) & 0x3f))
                + fromCharCode(0x80 | (cc & 0x3f)));
        }
    };
    const re_utob = /[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g;
    const utob = function (u) {
        return u.replace(re_utob, cb_utob);
    };
    const cb_encode = function (ccc) {
        const padlen = [0, 2, 1][ccc.length % 3],
            ord = ccc.charCodeAt(0) << 16
                | ((ccc.length > 1 ? ccc.charCodeAt(1) : 0) << 8)
                | ((ccc.length > 2 ? ccc.charCodeAt(2) : 0)),
            chars = [
                b64chars.charAt(ord >>> 18),
                b64chars.charAt((ord >>> 12) & 63),
                padlen >= 2 ? '=' : b64chars.charAt((ord >>> 6) & 63),
                padlen >= 1 ? '=' : b64chars.charAt(ord & 63)
            ];
        return chars.join('');
    };
    const btoa = function (b) {
        return b.replace(/[\s\S]{1,3}/g, cb_encode);
    };
    this.encode = function (u) {
        const isUint8Array = Object.prototype.toString.call(u) === '[object Uint8Array]';
        return isUint8Array ? u.toString('base64')
            : btoa(utob(String(u)));
    }
    const uriencode = function (u, urisafe) {
        return !urisafe
            ? _encode(u)
            : _encode(String(u)).replace(/[+\/]/g, function (m0) {
                return m0 === '+' ? '-' : '_';
            }).replace(/=/g, '');
    };
    const encodeURI = function (u) {
        return uriencode(u, true)
    };
    // decoder stuff
    const re_btou = /[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF7][\x80-\xBF]{3}/g;
    const cb_btou = function (cccc) {
        switch (cccc.length) {
            case 4:
                const cp = ((0x07 & cccc.charCodeAt(0)) << 18)
                    | ((0x3f & cccc.charCodeAt(1)) << 12)
                    | ((0x3f & cccc.charCodeAt(2)) << 6)
                    | (0x3f & cccc.charCodeAt(3)),
                    offset = cp - 0x10000;
                return (fromCharCode((offset >>> 10) + 0xD800)
                    + fromCharCode((offset & 0x3FF) + 0xDC00));
            case 3:
                return fromCharCode(
                    ((0x0f & cccc.charCodeAt(0)) << 12)
                    | ((0x3f & cccc.charCodeAt(1)) << 6)
                    | (0x3f & cccc.charCodeAt(2))
                );
            default:
                return fromCharCode(
                    ((0x1f & cccc.charCodeAt(0)) << 6)
                    | (0x3f & cccc.charCodeAt(1))
                );
        }
    };
    const btou = function (b) {
        return b.replace(re_btou, cb_btou);
    };
    const cb_decode = function (cccc) {
        const len = cccc.length,
            padlen = len % 4,
            n = (len > 0 ? b64tab[cccc.charAt(0)] << 18 : 0)
                | (len > 1 ? b64tab[cccc.charAt(1)] << 12 : 0)
                | (len > 2 ? b64tab[cccc.charAt(2)] << 6 : 0)
                | (len > 3 ? b64tab[cccc.charAt(3)] : 0),
            chars = [
                fromCharCode(n >>> 16),
                fromCharCode((n >>> 8) & 0xff),
                fromCharCode(n & 0xff)
            ];
        chars.length -= [0, 0, 2, 1][padlen];
        return chars.join('');
    };
    const _atob = function (a) {
        return a.replace(/\S{1,4}/g, cb_decode);
    };
    const atob = function (a) {
        return _atob(String(a).replace(/[^A-Za-z0-9\+\/]/g, ''));
    };
    const _decode = function (u) {
        return btou(_atob(u))
    };
    this.decode = function (a) {
        return _decode(
            String(a).replace(/[-_]/g, function (m0) {
                return m0 === '-' ? '+' : '/'
            })
                .replace(/[^A-Za-z0-9\+\/]/g, '')
        ).replace(/&gt;/g, ">").replace(/&lt;/g, "<");
    };
    this.safeEncode = function (a) {
        return this.encode(a.replace(/\+/g, "-").replace(/\//g, "_"));
    }
    this.safeDecode = function (a) {
        return this.decode(a.replace(/-/g, "+").replace(/_/g, "/"));
    }
}