/**
 *  ███████╗██╗   ██╗██████╗       ███████╗████████╗ ██████╗ ██████╗ ███████╗
 *  ██╔════╝██║   ██║██╔══██╗      ██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██╔════╝
 *  ███████╗██║   ██║██████╔╝█████╗███████╗   ██║   ██║   ██║██████╔╝█████╗
 *  ╚════██║██║   ██║██╔══██╗╚════╝╚════██║   ██║   ██║   ██║██╔══██╗██╔══╝
 *  ███████║╚██████╔╝██████╔╝      ███████║   ██║   ╚██████╔╝██║  ██║███████╗
 *  ╚══════╝ ╚═════╝ ╚═════╝       ╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝
 * Advanced Subscription Manager for QX, Loon, Surge and Clash.
 * @author: Peng-YM
 * @github: https://github.com/Peng-YM/Sub-Store
 * @documentation: https://www.notion.so/Sub-Store-6259586994d34c11a4ced5c406264b46
 */
const $ = API("sub-store");
const Base64 = new Base64Code();

service();

/****************************************** Service **********************************************************/

function service() {
    console.log(
        `
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
            𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 © 𝑷𝒆𝒏𝒈-𝒀𝑴
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
`);
    const $app = express();
    // Constants
    const SETTINGS_KEY = "settings";
    const SUBS_KEY = "subs";
    const COLLECTIONS_KEY = "collections";
    const RULES_KEY = "rules";
    const BUILT_IN_KEY = "builtin";
    const ARTIFACTS_KEY = "artifacts";

    const GIST_BACKUP_KEY = "Auto Generated Sub-Store Backup";
    const GIST_BACKUP_FILE_NAME = "Sub-Store";
    const ARTIFACT_REPOSITORY_KEY = "Sub-Store Artifacts Repository";

    // Initialization
    if (!$.read(SUBS_KEY)) $.write({}, SUBS_KEY);
    if (!$.read(COLLECTIONS_KEY)) $.write({}, COLLECTIONS_KEY);
    if (!$.read(SETTINGS_KEY)) $.write({}, SETTINGS_KEY);
    if (!$.read(RULES_KEY)) $.write({}, RULES_KEY);
    if (!$.read(ARTIFACTS_KEY)) $.write({}, ARTIFACTS_KEY);

    $.write({
        rules: getBuiltInRules(),
    }, BUILT_IN_KEY);

    // download
    $app.get("/download/collection/:name", downloadCollection);
    $app.get("/download/:name", downloadSubscription);

    // subscription API
    $app.route("/api/sub/:name")
        .get(getSubscription)
        .patch(updateSubscription)
        .delete(deleteSubscription);

    $app.route("/api/subs")
        .get(getAllSubscriptions)
        .post(createSubscription);

    $app.get("/api/sub/statistics/:name");

    // collection API
    $app.route("/api/collection/:name")
        .get(getCollection)
        .patch(updateCollection)
        .delete(deleteCollection);

    $app.route("/api/collections")
        .get(getAllCollections)
        .post(createCollection);

    // rules API
    $app.get("/download/rule/:name", downloadRule);
    $app.route("/api/rules")
        .post(createRule)
        .get(getAllRules);
    $app.route("/api/rule/:name")
        .patch(updateRule)
        .delete(deleteRule)
        .get(getRule);

    // Storage management
    $app.route("/api/storage")
        .get((req, res) => {
            res.json($.read("#sub-store"));
        })
        .post((req, res) => {
            const data = req.body;
            $.write(JSON.stringify(data), "#sub-store");
            res.end();
        });

    // Settings
    $app.route("/api/settings")
        .get(getSettings)
        .patch(updateSettings);

    // Artifacts
    $app.route("/api/artifacts")
        .get(getAllArtifacts)
        .post(createArtifact);

    $app.route("/api/artifact/:name")
        .get(getArtifact)
        .patch(updateArtifact)
        .delete(deleteArtifact);

    // utils
    $app.get("/api/utils/IP_API/:server", IP_API); // IP-API reverse proxy
    $app.post("/api/utils/refresh", refreshCache); // force refresh resource
    $app.get("/api/utils/env", getEnv); // get runtime environment
    $app.get("/api/utils/backup", gistBackup); // gist backup actions

    // cron triggered functions
    $app.get("/api/cron/sync-artifacts", cronSyncArtifacts); // sync all artifacts

    // Redirect sub.store to vercel webpage
    $app.get("/", async (req, res) => {
        // 302 redirect
        res.set("location", "https://sub-store.vercel.app/").status(302).end();
    });

    // handle preflight request for QX
    if (ENV().isQX) {
        $app.options("/", async (req, res) => {
            res.status(200).end();
        });
    }

    $app.all("/", (req, res) => {
        res.send("Hello from sub-store, made with ❤️ by Peng-YM");
    });

    $app.start();

    // subscriptions API
    async function downloadSubscription(req, res) {
        const {name} = req.params;
        const {cache} = req.query;
        const {raw} = req.query || "false";
        const platform = req.query.target || getPlatformFromHeaders(req.headers) || "JSON";
        const useCache = typeof cache === 'undefined' ? (platform === 'JSON' || platform === 'URI') : cache;

        $.info(`正在下载订阅：${name}`);

        const allSubs = $.read(SUBS_KEY);
        const sub = allSubs[name];
        if (sub) {
            try {
                const output = await produceArtifact({
                    type: 'subscription',
                    item: sub,
                    platform,
                    useCache,
                    noProcessor: raw
                });

                // forward flow headers
                if (["QX", "Surge", "Loon"].indexOf(getPlatformFromHeaders(req.headers)) !== -1) {
                    const {headers} = await $.http.get({
                        url: sub.url,
                        headers: {
                            "User-Agent":
                                "Quantumult/1.0.13 (iPhone10,3; iOS 14.0)"
                        }
                    });
                    const subkey = Object.keys(headers).filter(k => /SUBSCRIPTION-USERINFO/i.test(k))[0];
                    const userinfo = headers[subkey];
                    res.set("subscription-userinfo", userinfo);
                }

                if (platform === 'JSON') {
                    res.set("Content-Type", "application/json;charset=utf-8").send(output);
                } else {
                    res.send(output);
                }
            } catch (err) {
                $.notify(
                    `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`,
                    `❌ 无法下载订阅：${name}！`,
                    `🤔 原因：${err}`
                );
                res.status(500).json({
                    status: "failed",
                    message: err,
                });
            }
        } else {
            $.notify(
                `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`,
                `❌ 未找到订阅：${name}！`,
            );
            res.status(404).json({
                status: "failed",
            });
        }
    }

    function createSubscription(req, res) {
        const sub = req.body;
        const allSubs = $.read(SUBS_KEY);
        $.info(`正在创建订阅： ${sub.name}`);
        if (allSubs[sub.name]) {
            res.status(500).json({
                status: "failed",
                message: `订阅${sub.name}已存在！`,
            });
        }
        // validate name
        if (/^[\w-_]*$/.test(sub.name)) {
            allSubs[sub.name] = sub;
            $.write(allSubs, SUBS_KEY);
            res.status(201).json({
                status: "success",
                data: sub,
            });
        } else {
            res.status(500).json({
                status: "failed",
                message: `订阅名称 ${sub.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`,
            });
        }
    }

    function getSubscription(req, res) {
        const {name} = req.params;
        const sub = $.read(SUBS_KEY)[name];
        if (sub) {
            res.json({
                status: "success",
                data: sub,
            });
        } else {
            res.status(404).json({
                status: "failed",
                message: `未找到订阅：${name}!`,
            });
        }
    }

    function updateSubscription(req, res) {
        const {name} = req.params;
        let sub = req.body;
        const allSubs = $.read(SUBS_KEY);
        if (allSubs[name]) {
            const newSub = {
                ...allSubs[name],
                ...sub,
            };
            $.info(`正在更新订阅： ${name}`);
            // allow users to update the subscription name
            if (name !== sub.name) {
                // we need to find out all collections refer to this name
                const allCols = $.read(COLLECTIONS_KEY);
                for (const k of Object.keys(allCols)) {
                    const idx = allCols[k].subscriptions.indexOf(name);
                    if (idx !== -1) {
                        allCols[k].subscriptions[idx] = sub.name;
                    }
                }
                // update subscriptions
                delete allSubs[name];
                allSubs[sub.name] = newSub;
            } else {
                allSubs[name] = newSub;
            }
            $.write(allSubs, SUBS_KEY);
            res.json({
                status: "success",
                data: newSub,
            });
        } else {
            res.status(500).json({
                status: "failed",
                message: `订阅${name}不存在，无法更新！`,
            });
        }
    }

    function deleteSubscription(req, res) {
        const {name} = req.params;
        $.info(`删除订阅：${name}...`);
        // delete from subscriptions
        let allSubs = $.read(SUBS_KEY);
        delete allSubs[name];
        $.write(allSubs, SUBS_KEY);
        // delete from collections
        let allCols = $.read(COLLECTIONS_KEY);
        for (const k of Object.keys(allCols)) {
            allCols[k].subscriptions = allCols[k].subscriptions.filter(
                (s) => s !== name
            );
        }
        $.write(allCols, COLLECTIONS_KEY);
        res.json({
            status: "success",
        });
    }

    function getAllSubscriptions(req, res) {
        const allSubs = $.read(SUBS_KEY);
        res.json({
            status: "success",
            data: allSubs,
        });
    }

    // collection API
    async function downloadCollection(req, res) {
        const {name} = req.params;
        const {cache} = req.query || "false";
        const {raw} = req.query || "false";
        const platform = req.query.target || getPlatformFromHeaders(req.headers) || "JSON";
        const useCache = typeof cache === 'undefined' ? (platform === 'JSON' || platform === 'URI') : cache;

        const allCollections = $.read(COLLECTIONS_KEY);
        const collection = allCollections[name];

        $.info(`正在下载组合订阅：${name}`);

        if (collection) {
            try {
                const output = await produceArtifact({
                    type: "collection",
                    item: collection,
                    platform,
                    useCache,
                    noProcessor: raw
                });
                if (platform === 'JSON') {
                    res.set("Content-Type", "application/json;charset=utf-8").send(output);
                } else {
                    res.send(output);
                }
            } catch (err) {
                $.notify(
                    `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载组合订阅失败`,
                    `❌ 下载组合订阅错误：${name}！`,
                    `🤔 原因：${err}`
                );
                res.status(500).json({
                    status: "failed",
                    message: err,
                });
            }

        } else {
            $.notify(
                `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载组合订阅失败`,
                `❌ 未找到组合订阅：${name}！`,
            );
            res.status(404).json({
                status: "failed",
            });
        }
    }

    function createCollection(req, res) {
        const collection = req.body;
        $.info(`正在创建组合订阅：${collection.name}`);
        const allCol = $.read(COLLECTIONS_KEY);
        if (allCol[collection.name]) {
            res.status(500).json({
                status: "failed",
                message: `订阅集${collection.name}已存在！`,
            });
        }
        // validate name
        if (/^[\w-_]*$/.test(collection.name)) {
            allCol[collection.name] = collection;
            $.write(allCol, COLLECTIONS_KEY);
            res.status(201).json({
                status: "success",
                data: collection,
            });
        } else {
            res.status(500).json({
                status: "failed",
                message: `订阅集名称 ${collection.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`,
            });
        }
    }

    function getCollection(req, res) {
        const {name} = req.params;
        const collection = $.read(COLLECTIONS_KEY)[name];
        if (collection) {
            res.json({
                status: "success",
                data: collection,
            });
        } else {
            res.status(404).json({
                status: "failed",
                message: `未找到订阅集：${name}!`,
            });
        }
    }

    function updateCollection(req, res) {
        const {name} = req.params;
        let collection = req.body;
        const allCol = $.read(COLLECTIONS_KEY);
        if (allCol[name]) {
            const newCol = {
                ...allCol[name],
                ...collection,
            };
            $.info(`正在更新组合订阅：${name}...`);
            // allow users to update collection name
            delete allCol[name];
            allCol[collection.name || name] = newCol;
            $.write(allCol, COLLECTIONS_KEY);
            res.json({
                status: "success",
                data: newCol,
            });
        } else {
            res.status(500).json({
                status: "failed",
                message: `订阅集${name}不存在，无法更新！`,
            });
        }
    }

    function deleteCollection(req, res) {
        const {name} = req.params;
        $.info(`正在删除组合订阅：${name}`);
        let allCol = $.read(COLLECTIONS_KEY);
        delete allCol[name];
        $.write(allCol, COLLECTIONS_KEY);
        res.json({
            status: "success",
        });
    }

    function getAllCollections(req, res) {
        const allCols = $.read(COLLECTIONS_KEY);
        res.json({
            status: "success",
            data: allCols,
        });
    }

    // rules API
    async function downloadRule(req, res) {
        const {name} = req.params;
        const {builtin} = req.query;
        const platform = req.query.target || getPlatformFromHeaders(req.headers) || "Surge";

        $.info(`正在下载${builtin ? "内置" : ""}分流订阅：${name}...`);

        let rule;
        if (builtin) {
            rule = $.read(BUILT_IN_KEY)['rules'][name];
        }
        if (rule) {
            const output = await produceArtifact({type: "rule", item: rule, platform})
            res.send(output);
        } else {
            // rule not found
            $.notify(
                `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载分流订阅失败`,
                `❌ 未找到分流订阅：${name}！`,
            );
            res.status(404).json({
                status: "failed",
            });
        }
    }

    function createRule(req, res) {

    }

    function deleteRule(req, res) {

    }

    function updateRule(req, res) {

    }

    function getAllRules(req, res) {

    }

    function getRule(req, res) {

    }

    // settings API
    function getSettings(req, res) {
        const settings = $.read(SETTINGS_KEY);
        res.json(settings);
    }

    function updateSettings(req, res) {
        const data = req.body;
        const settings = $.read(SETTINGS_KEY);
        $.write({
            ...settings,
            ...data
        }, SETTINGS_KEY);
        res.json({
            status: "success"
        });
    }

    // artifact API
    async function getArtifact(req, res) {
        const name = req.params.name;
        const action = req.query.action;
        const allArtifacts = $.read(ARTIFACTS_KEY);
        const artifact = allArtifacts[name];

        if (artifact) {
            if (action) {
                let item;
                switch (artifact.type) {
                    case 'subscription':
                        item = $.read(SUBS_KEY)[artifact.source];
                        break;
                    case 'collection':
                        item = $.read(COLLECTIONS_KEY)[artifact.source];
                        break;
                    case 'rule':
                        item = $.read(RULES_KEY)[artifact.source];
                        break;
                }
                const output = await produceArtifact({
                    type: artifact.type,
                    item,
                    platform: artifact.platform
                })
                if (action === 'preview') {
                    res.send(output);
                } else if (action === 'sync') {
                    $.info(`正在上传配置：${artifact.name}\n>>>`);
                    console.log(JSON.stringify(artifact, null, 2));
                    try {
                        const resp = await syncArtifact({
                            filename: artifact.name,
                            content: output
                        });
                        artifact.updated = new Date().getTime();
                        const body = JSON.parse(resp.body);
                        artifact.url = body.files[artifact.name].raw_url.replace(/\/raw\/[^\/]*\/(.*)/, "/raw/$1");
                        $.write(allArtifacts, ARTIFACTS_KEY);
                        res.json({
                            status: "success"
                        });
                    } catch (err) {
                        res.status(500).json({
                            status: "failed",
                            message: err
                        });
                    }
                }
            } else {
                res.json({
                    status: "success",
                    data: artifact
                });
            }
        } else {
            res.status(404).json({
                status: "failed",
                message: "未找到对应的配置！",
            });
        }
    }

    function createArtifact(req, res) {
        const artifact = req.body;
        $.info(`正在创建远程配置：${artifact.name}`);
        const allArtifacts = $.read(ARTIFACTS_KEY);
        if (allArtifacts[artifact.name]) {
            res.status(500).json({
                status: "failed",
                message: `远程配置${artifact.name}已存在！`,
            });
        } else {
            if (/^[\w-_.]*$/.test(artifact.name)) {
                allArtifacts[artifact.name] = artifact;
                $.write(allArtifacts, ARTIFACTS_KEY);
                res.status(201).json({
                    status: "success",
                    data: artifact
                });
            } else {
                res.status(500).json({
                    status: "failed",
                    message: `远程配置名称 ${artifact.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`,
                });
            }
        }
    }

    function updateArtifact(req, res) {
        const allArtifacts = $.read(ARTIFACTS_KEY);
        const oldName = req.params.name;
        const artifact = allArtifacts[oldName];
        if (artifact) {
            $.info(`正在更新远程配置：${artifact.name}`);
            const newArtifact = req.body;
            if (typeof newArtifact.name !== 'undefined' && !/^[\w-_.]*$/.test(newArtifact.name)) {
                res.status(500).json({
                    status: "failed",
                    message: `远程配置名称 ${newArtifact.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`,
                });
            } else {
                const merged = {
                    ...artifact,
                    ...newArtifact
                };
                allArtifacts[merged.name] = merged;
                if (merged.name !== oldName) delete allArtifacts[oldName];
                $.write(allArtifacts, ARTIFACTS_KEY);
                res.json({
                    status: "success",
                    data: merged
                });
            }
        } else {
            res.status(404).json({
                status: "failed",
                message: "未找到对应的远程配置！",
            });
        }
    }

    async function cronSyncArtifacts(req, res) {
        $.info("开始同步所有远程配置...");
        const allArtifacts = $.read(ARTIFACTS_KEY);
        let success = [], failed = [];
        for (const artifact of Object.values(allArtifacts)) {
            if (artifact.sync) {
                $.info(`正在同步云配置：${artifact.name}...`);
                try {
                    let item;
                    switch (artifact.type) {
                        case 'subscription':
                            item = $.read(SUBS_KEY)[artifact.source];
                            break;
                        case 'collection':
                            item = $.read(COLLECTIONS_KEY)[artifact.source];
                            break;
                        case 'rule':
                            item = $.read(RULES_KEY)[artifact.source];
                            break;
                    }
                    const output = await produceArtifact({
                        type: artifact.type,
                        item,
                        platform: artifact.platform
                    });
                    const resp = await syncArtifact({
                        filename: artifact.name,
                        content: output
                    });
                    artifact.updated = new Date().getTime();
                    const body = JSON.parse(resp.body);
                    artifact.url = body.files[artifact.name].raw_url.replace(/\/raw\/[^\/]*\/(.*)/, "/raw/$1");
                    $.write(allArtifacts, ARTIFACTS_KEY);
                    $.info(`✅ 成功同步云配置：${artifact.name}`);
                    success.push(artifact);
                } catch (err) {
                    $.error(`云配置: ${artifact.name} 同步失败！原因：${err}`);
                    $.notify(
                        `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 同步订阅失败`,
                        `❌ 无法同步订阅：${artifact.name}！`,
                        `🤔 原因：${err}`
                    );
                    failed.push(artifact);
                }
            }
        }
        res.json({
            success,
            failed
        });
    }

    async function deleteArtifact(req, res) {
        const name = req.params.name;
        $.info(`正在删除远程配置：${name}`);
        const allArtifacts = $.read(ARTIFACTS_KEY);
        try {
            const artifact = allArtifacts[name];
            if (!artifact) throw new Error(`远程配置：${name}不存在！`);
            if (artifact.updated) {
                // delete gist
                await syncArtifact({
                    filename: name,
                    content: ""
                });
            }
            // delete local cache
            delete allArtifacts[name];
            $.write(allArtifacts, ARTIFACTS_KEY);
            res.json({
                status: "success"
            });
        } catch (err) {
            // delete local cache
            delete allArtifacts[name];
            $.write(allArtifacts, ARTIFACTS_KEY);
            res.status(500).json({
                status: "failed",
                message: `无法删除远程配置：${name}, 原因：${err}`
            });
        }
    }

    function getAllArtifacts(req, res) {
        const allArtifacts = $.read(ARTIFACTS_KEY);
        res.json({
            status: "success",
            data: allArtifacts
        });
    }

    async function syncArtifact({filename, content}) {
        const {gistToken} = $.read(SETTINGS_KEY);
        if (!gistToken) {
            return Promise.reject("未设置Gist Token！");
        }
        const manager = new Gist({
            token: gistToken,
            key: ARTIFACT_REPOSITORY_KEY
        });
        return manager.upload({filename, content});
    }

    // util API
    async function IP_API(req, res) {
        const server = decodeURIComponent(req.params.server);
        const result = await $.http
            .get(`http://ip-api.com/json/${server}?lang=zh-CN`)
            .then((resp) => JSON.parse(resp.body));
        res.json(result);
    }

    async function refreshCache(req, res) {
        const {url} = req.body;
        $.info(`Refreshing cache for URL: ${url}`);
        try {
            const raw = await getResource(url, false);
            $.write(raw, `#${Base64.safeEncode(url)}`);
            res.json({
                status: "success",
            });
        } catch (err) {
            res.status(500).json({
                status: "failed",
                message: `无法刷新资源 ${url}： ${err}`
            });
        }
    }

    function getEnv(req, res) {
        const {isNode, isQX, isLoon, isSurge} = ENV();
        let backend = "Node";
        if (isNode) backend = "Node";
        if (isQX) backend = "QX";
        if (isLoon) backend = "Loon";
        if (isSurge) backend = "Surge";
        res.json({
            backend
        });
    }

    async function gistBackup(req, res) {
        const {action} = req.query;
        // read token
        const {gistToken} = $.read(SETTINGS_KEY);
        if (!gistToken) {
            res.status(500).json({
                status: "failed",
                message: "未找到Gist备份Token!"
            });
        } else {
            const gist = new Gist({
                token: gistToken,
                key: GIST_BACKUP_KEY
            });
            try {
                let content;
                switch (action) {
                    case "upload":
                        // update syncTime.
                        const settings = $.read(SETTINGS_KEY);
                        settings.syncTime = new Date().getTime();
                        $.write(settings, SETTINGS_KEY);

                        content = $.read("#sub-store");
                        $.info(`上传备份中...`);
                        await gist.upload({filename: GIST_BACKUP_FILE_NAME, content});
                        break;
                    case "download":
                        $.info(`还原备份中...`);
                        content = await gist.download(GIST_BACKUP_FILE_NAME);
                        // restore settings
                        $.write(content, "#sub-store");
                        break;
                }
                res.json({
                    status: "success",
                });
            } catch (err) {
                const msg = `${action === "upload" ? "上传" : "下载"}备份失败！${err}`;
                $.error(msg);
                res.status(500).json({
                    status: "failed",
                    message: msg
                });
            }
        }
    }

    // get target platform from user agent
    function getPlatformFromHeaders(headers) {
        const keys = Object.keys(headers);
        let UA = "";
        for (let k of keys) {
            if (/USER-AGENT/i.test(k)) {
                UA = headers[k];
                break;
            }
        }
        if (UA.indexOf("Quantumult%20X") !== -1) {
            return "QX";
        } else if (UA.indexOf("Surge") !== -1) {
            return "Surge";
        } else if (UA.indexOf("Decar") !== -1 || UA.indexOf("Loon") !== -1) {
            return "Loon";
        } else {
            return null;
        }
    }

    // get resource, with cache ability to speedup response time
    async function getResource(url, useCache = true) {
        // use QX agent to get flow headers
        const $http = HTTP({
            headers: {
                "User-Agent": "Quantumult%20X",
            }
        });
        const key = "#" + Base64.safeEncode(url);
        const resource = $.read(key);

        const timeKey = `#TIME-${Base64.safeEncode(url)}`;
        const ONE_HOUR = 60 * 60 * 1000;
        const outdated = new Date().getTime() - $.read(timeKey) > ONE_HOUR;

        if (useCache && resource && !outdated) {
            $.log(`Use cached for resource: ${url}`);
            return resource;
        }

        let body = "";
        try {
            const resp = await $http.get(url);
            body = resp.body;
        } catch (err) {
            throw new Error(err);
        } finally {
            $.write(body, key);
            $.write(new Date().getTime(), timeKey);
        }
        if (body.replace(/\s/g, "").length === 0) {
            throw new Error("订阅内容为空！");
        }
        return body;
    }

    async function produceArtifact({type, item, platform, useCache, noProcessor} = {
        platform: "JSON",
        useCache: false,
        noProcessor: false
    }) {
        if (type === 'subscription') {
            const sub = item;
            const raw = await getResource(sub.url, useCache);
            // parse proxies
            let proxies = ProxyUtils.parse(raw);
            if (!noProcessor) {
                // apply processors
                proxies = await ProxyUtils.process(proxies, sub.process || []);
            }
            // produce
            return ProxyUtils.produce(proxies, platform);
        } else if (type === 'collection') {
            const allSubs = $.read(SUBS_KEY);
            const collection = item;
            const subs = collection['subscriptions'];
            let proxies = [];
            for (let i = 0; i < subs.length; i++) {
                const sub = allSubs[subs[i]];
                $.info(`正在处理子订阅：${sub.name}，进度--${100 * ((i + 1) / subs.length).toFixed(1)}% `);
                try {
                    const raw = await getResource(sub.url, useCache);
                    // parse proxies
                    let currentProxies = ProxyUtils.parse(raw)
                    if (!noProcessor) {
                        // apply processors
                        currentProxies = await ProxyUtils.process(currentProxies, sub.process || []);
                    }
                    // merge
                    proxies = proxies.concat(currentProxies);
                } catch (err) {
                    $.error(`处理组合订阅中的子订阅: ${sub.name}时出现错误：${err}! 该订阅已被跳过。`);
                }
            }
            if (!noProcessor) {
                // apply own processors
                proxies = await ProxyUtils.process(proxies, collection.process || []);
            }
            if (proxies.length === 0) {
                throw new Error(`组合订阅中不含有效节点！`);
            }
            return ProxyUtils.produce(proxies, platform);
        } else if (type === 'rule') {
            const rule = item;
            let rules = [];
            for (let i = 0; i < rule.urls.length; i++) {
                const url = rule.urls[i];
                $.info(`正在处理URL：${url}，进度--${100 * ((i + 1) / rule.urls.length).toFixed(1)}% `);
                try {
                    const {body} = await $.http.get(url);
                    const currentRules = RuleUtils.parse(body);
                    rules = rules.concat(currentRules);
                } catch (err) {
                    $.error(`处理分流订阅中的URL: ${url}时出现错误：${err}! 该订阅已被跳过。`);
                }
            }
            // remove duplicates
            rules = await RuleUtils.process(rules, [{type: "Remove Duplicate Filter"}]);
            // produce output
            return RuleUtils.produce(rules, platform);
        }
    }
}

/****************************************** Proxy Utils **********************************************************/
var ProxyUtils = (function () {
    const PROXY_PREPROCESSORS = (function () {
        function HTML() {
            const name = "HTML";
            const test = raw => /^<!DOCTYPE html>/.test(raw);
            // simply discard HTML
            const parse = _ => "";
            return {name, test, parse};
        }

        function Base64Encoded() {
            const name = "Base64 Pre-processor";

            const keys = ["dm1lc3M", "c3NyOi8v", "dHJvamFu", "c3M6Ly", "c3NkOi8v",
                "c2hhZG93", "aHR0c"
            ];

            const test = function (raw) {
                return keys.some(k => raw.indexOf(k) !== -1);
            }
            const parse = function (raw) {
                raw = Base64.safeDecode(raw);
                return raw;
            }
            return {name, test, parse};
        }

        function Clash() {
            const name = "Clash Pre-processor";
            const test = function (raw) {
                return /proxies/.test(raw);
            }
            const parse = function (raw) {
                // Clash YAML format
                // codes are modified from @KOP-XIAO
                // https://github.com/KOP-XIAO/QuantumultX
                if (raw.indexOf("{") !== -1) {
                    raw = raw
                        .replace(/    - /g, "  - ")
                        .replace(/:(?!\s)/g, ": ")
                        .replace(/\,\"/g, ', "')
                        .replace(/: {/g, ": {,     ")
                        .replace(/, (\"?host|path|tls|mux|skip\"?)/g, ",     $1")
                        .replace(/{name: /g, '{name: "')
                        .replace(/, server:/g, '", server:')
                        .replace(/{|}/g, "")
                        .replace(/,/g, "\n   ");
                }
                raw = raw.replace(/  -\n.*name/g, "  - name")
                    .replace(/\$|\`/g, "")
                    .split("proxy-providers:")[0]
                    .split("proxy-groups:")[0]
                    .replace(/\"([\w-]+)\"\s*:/g, "$1:")
                raw = raw.indexOf("proxies:") === -1 ? "proxies:\n" + raw : "proxies:" + raw.split("proxies:")[1]
                const proxies = YAML.eval(raw).proxies;
                return proxies.map(p => JSON.stringify(p)).join("\n");
            }
            return {name, test, parse};
        }

        function SSD() {
            const name = "SSD Pre-processor";
            const test = function (raw) {
                return raw.indexOf("ssd://") === 0;
            };
            const parse = function (raw) {
                // preprocessing for SSD subscription format
                const output = [];
                let ssdinfo = JSON.parse(Base64.safeDecode(raw.split("ssd://")[1]));
                // options (traffic_used, traffic_total, expiry, url)
                const traffic_used = ssdinfo.traffic_used; // GB
                const traffic_total = ssdinfo.traffic_total; // GB, -1 means unlimited
                const expiry = ssdinfo.expiry; // YYYY-MM-DD HH:mm:ss
                // default setting
                let name = ssdinfo.airport; // name of the airport
                let port = ssdinfo.port;
                let method = ssdinfo.encryption;
                let password = ssdinfo.password;
                // servers config
                let servers = ssdinfo.servers;
                for (let i = 0; i < servers.length; i++) {
                    let server = servers[i];
                    method = server.encryption ? server.encryption : method;
                    password = server.password ? server.password : password;
                    let userinfo = Base64.safeEncode(method + ":" + password);
                    let hostname = server.server;
                    port = server.port ? server.port : port;
                    let tag = server.remarks ? server.remarks : i;
                    let plugin = server.plugin_options
                        ? "/?plugin=" +
                        encodeURIComponent(server.plugin + ";" + server.plugin_options)
                        : "";
                    output[i] =
                        "ss://" + userinfo + "@" + hostname + ":" + port + plugin + "#" + tag;
                }
                return output.join("\n");
            };
            return {name, test, parse};
        }

        return [
            HTML(), Base64Encoded(), Clash(), SSD()
        ];
    })();
    const PROXY_PARSERS = (function () {
        // Parse SS URI format (only supports new SIP002, legacy format is depreciated).
        // reference: https://shadowsocks.org/en/spec/SIP002-URI-Scheme.html
        function URI_SS() {
            const name = "URI SS Parser";
            const test = (line) => {
                return /^ss:\/\//.test(line);
            };
            const parse = (line) => {
                const supported = {};
                // parse url
                let content = line.split("ss://")[1];

                const proxy = {
                    name: decodeURIComponent(line.split("#")[1]),
                    type: "ss",
                    supported,
                };
                content = content.split("#")[0]; // strip proxy name
                // handle IPV4 and IPV6
                const serverAndPort = content.match(/@([^\/]*)(\/|$)/)[1];
                const portIdx = serverAndPort.lastIndexOf(":");
                proxy.server = serverAndPort.substring(0, portIdx);
                proxy.port = serverAndPort.substring(portIdx + 1);

                const userInfo = Base64.safeDecode(content.split("@")[0]).split(":");
                proxy.cipher = userInfo[0];
                proxy.password = userInfo[1];

                // handle obfs
                const idx = content.indexOf("?plugin=");
                if (idx !== -1) {
                    const pluginInfo = (
                        "plugin=" +
                        decodeURIComponent(content.split("?plugin=")[1].split("&")[0])
                    ).split(";");
                    const params = {};
                    for (const item of pluginInfo) {
                        const [key, val] = item.split("=");
                        if (key) params[key] = val || true; // some options like "tls" will not have value
                    }
                    switch (params.plugin) {
                        case "obfs-local":
                        case "simple-obfs":
                            proxy.plugin = "obfs";
                            proxy["plugin-opts"] = {
                                mode: params.obfs,
                                host: params["obfs-host"],
                            };
                            break;
                        case "v2ray-plugin":
                            proxy.supported = {
                                ...supported,
                                Loon: false,
                                Surge: false,
                            };
                            proxy.obfs = "v2ray-plugin";
                            proxy["plugin-opts"] = {
                                mode: "websocket",
                                host: params["obfs-host"],
                                path: params.path || "",
                                tls: params.tls || false,
                            };
                            break;
                        default:
                            throw new Error(`Unsupported plugin option: ${params.plugin}`);
                    }
                }
                return proxy;
            };
            return {name, test, parse};
        }

        // Parse URI SSR format, such as ssr://xxx
        function URI_SSR() {
            const name = "URI SSR Parser";
            const test = (line) => {
                return /^ssr:\/\//.test(line);
            };
            const supported = {
                Surge: false,
            };

            const parse = (line) => {
                line = Base64.safeDecode(line.split("ssr://")[1]);

                // handle IPV6 & IPV4 format
                let splitIdx = line.indexOf(":origin");
                if (splitIdx === -1) {
                    splitIdx = line.indexOf(":auth_");
                }
                const serverAndPort = line.substring(0, splitIdx);
                const server = serverAndPort.substring(0, serverAndPort.lastIndexOf(":"));
                const port = serverAndPort.substring(serverAndPort.lastIndexOf(":") + 1);

                let params = line
                    .substring(splitIdx + 1)
                    .split("/?")[0]
                    .split(":");
                let proxy = {
                    type: "ssr",
                    server,
                    port,
                    protocol: params[0],
                    cipher: params[1],
                    obfs: params[2],
                    password: Base64.safeDecode(params[3]),
                    supported,
                };
                // get other params
                const other_params = {};
                line = line.split("/?")[1].split("&");
                if (line.length > 1) {
                    for (const item of line) {
                        const [key, val] = item.split("=");
                        other_params[key] = val.trim();
                    }
                }
                proxy = {
                    ...proxy,
                    name: other_params.remarks ? Base64.safeDecode(other_params.remarks) : proxy.server,
                    "protocol-param":
                        Base64.safeDecode(other_params.protoparam || "").replace(/\s/g, ""),
                    "obfs-param":
                        Base64.safeDecode(other_params.obfsparam || "").replace(/\s/g, ""),
                };
                return proxy;
            };

            return {name, test, parse};
        }

        // V2rayN URI VMess format
        // reference: https://github.com/2dust/v2rayN/wiki/%E5%88%86%E4%BA%AB%E9%93%BE%E6%8E%A5%E6%A0%BC%E5%BC%8F%E8%AF%B4%E6%98%8E(ver-2)

        // Quantumult VMess format
        function URI_VMess() {
            const name = "URI VMess Parser";
            const test = (line) => {
                return /^vmess:\/\//.test(line);
            };
            const parse = (line) => {
                const supported = {};
                line = line.split("vmess://")[1];
                const content = Base64.safeDecode(line);
                if (/=\s*vmess/.test(content)) {
                    // Quantumult VMess URI format
                    const partitions = content.split(",").map((p) => p.trim());
                    // get keyword params
                    const params = {};
                    for (const part of partitions) {
                        if (part.indexOf("=") !== -1) {
                            const [key, val] = part.split("=");
                            params[key.trim()] = val.trim();
                        }
                    }

                    const proxy = {
                        name: partitions[0].split("=")[0].trim(),
                        type: "vmess",
                        server: partitions[1],
                        port: partitions[2],
                        cipher: partitions[3],
                        uuid: partitions[4].match(/^"(.*)"$/)[1],
                        tls: params.obfs === "over-tls" || params.obfs === "wss",
                    };

                    if (typeof params['udp-relay'] !== "undefined") proxy.udp = JSON.parse(params["udp-relay"]);
                    if (typeof params['fast-open'] !== "undefined") proxy.udp = JSON.parse(params["fast-open"]);

                    // handle ws headers
                    if (params.obfs === "ws" || params.obfs === "wss") {
                        proxy.network = "ws";
                        proxy["ws-path"] = (params["obfs-path"] || '"/"').match(/^"(.*)"$/)[1];
                        let obfs_host = params["obfs-header"];
                        if (obfs_host && obfs_host.indexOf("Host") !== -1) {
                            obfs_host = obfs_host.match(/Host:\s*([a-zA-Z0-9-.]*)/)[1];
                        }
                        proxy["ws-headers"] = {
                            Host: obfs_host || proxy.server, // if no host provided, use the same as server
                        };
                    }

                    // handle scert
                    if (proxy.tls && params['"tls-verification"'] === "false") {
                        proxy['skip-cert-verify'] = true;
                    }

                    // handle sni
                    if (proxy.tls && params["obfs-host"]) {
                        proxy.sni = params["obfs-host"];
                    }

                    return proxy;
                } else {
                    // V2rayN URI format
                    const params = JSON.parse(content);
                    const proxy = {
                        name: params.ps,
                        type: "vmess",
                        server: params.add,
                        port: params.port,
                        cipher: "auto", // V2rayN has no default cipher! use aes-128-gcm as default.
                        uuid: params.id,
                        alterId: params.aid || 0,
                        tls: params.tls === "tls" || params.tls === true,
                        supported,
                    };
                    // handle obfs
                    if (params.net === "ws") {
                        proxy.network = "ws";
                        proxy["ws-path"] = params.path;
                        proxy["ws-headers"] = {
                            Host: params.host || params.add,
                        };
                        if (proxy.tls && params.host) {
                            proxy.sni = params.host;
                        }
                    }
                    // handle scert
                    if (params.verify_cert === false) {
                        proxy['skip-cert-verify'] = true;
                    }
                    return proxy;
                }
            };
            return {name, test, parse};
        }

        // Trojan URI format
        function URI_Trojan() {
            const name = "URI Trojan Parser";
            const test = (line) => {
                return /^trojan:\/\//.test(line);
            };

            const parse = (line) => {
                const supported = {};
                line = line.split("trojan://")[1];
                const [server, port] = line.split("@")[1].split("?")[0].split(":");
                const name = decodeURIComponent(line.split("#")[1].trim());

                return {
                    name: name || `[Trojan] ${server}`, // trojan uri may have no server tag!
                    type: "trojan",
                    server,
                    port,
                    password: line.split("@")[0],
                    supported,
                };
            };
            return {name, test, parse};
        }

        function Clash_All() {
            const name = "Clash Parser";
            const test = (line) => {
                try {
                    JSON.parse(line);
                } catch (e) {
                    return false;
                }
                return true;
            };
            const parse = (line) => JSON.parse(line);
            return {name, test, parse};
        }

        function QX_SS() {
            const name = "QX SS Parser";
            const test = (line) => {
                return (
                    /^shadowsocks\s*=/.test(line.split(",")[0].trim()) &&
                    line.indexOf("ssr-protocol") === -1
                );
            };
            const parse = (line) => {
                const supported = {};
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
                    supported,
                };
                // handle obfs options
                if (params.obfs) {
                    proxy["plugin-opts"] = {
                        host: params["obfs-host"] || proxy.server,
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
                                path: params["obfs-uri"] || "/",
                                tls: params.obfs === "wss",
                            };
                            if (proxy["plugin-opts"].tls && typeof params['tls-verification'] !== "undefined") {
                                proxy["plugin-opts"]['skip-cert-verify'] = params['tls-verification'];
                            }
                            proxy.plugin = "v2ray-plugin";
                            // Surge and Loon lack support for v2ray-plugin obfs
                            proxy.supported.Surge = false;
                            proxy.supported.Loon = false;
                            break;
                    }
                }
                return proxy;
            };
            return {name, test, parse};
        }

        function QX_SSR() {
            const name = "QX SSR Parser";
            const test = (line) => {
                return (
                    /^shadowsocks\s*=/.test(line.split(",")[0].trim()) &&
                    line.indexOf("ssr-protocol") !== -1
                );
            };

            const parse = (line) => {
                const supported = {
                    Surge: false,
                };
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
                    "protocol-param": params["ssr-protocol-param"],
                    udp: JSON.parse(params["udp-relay"] || "false"),
                    tfo: JSON.parse(params["fast-open"] || "false"),
                    supported,
                };
                // handle obfs options
                if (params.obfs) {
                    proxy.obfs = params.obfs;
                    proxy["obfs-param"] = params["obfs-host"];
                }
                return proxy;
            };
            return {name, test, parse};
        }

        function QX_VMess() {
            const name = "QX VMess Parser";
            const test = (line) => {
                return /^vmess\s*=/.test(line.split(",")[0].trim());
            };
            const parse = (line) => {
                const params = getQXParams(line);
                const proxy = {
                    type: "vmess",
                    name: params.tag,
                    server: params.server,
                    port: params.port,
                    cipher: params.method || "none",
                    uuid: params.password,
                    alterId: 0,
                    tls: params.obfs === "over-tls" || params.obfs === "wss",
                    udp: JSON.parse(params["udp-relay"] || "false"),
                    tfo: JSON.parse(params["fast-open"] || "false"),
                };
                if (proxy.tls) {
                    proxy.sni = params["obfs-host"] || params.server;
                    proxy['skip-cert-verify'] = !JSON.parse(params["tls-verification"] || "true");
                }
                // handle ws headers
                if (params.obfs === "ws" || params.obfs === "wss") {
                    proxy.network = "ws";
                    proxy["ws-path"] = params["obfs-uri"];
                    proxy["ws-headers"] = {
                        Host: params["obfs-host"] || params.server, // if no host provided, use the same as server
                    };
                }
                return proxy;
            };

            return {name, test, parse};
        }

        function QX_Trojan() {
            const name = "QX Trojan Parser";
            const test = (line) => {
                return /^trojan\s*=/.test(line.split(",")[0].trim());
            };
            const parse = (line) => {
                const params = getQXParams(line);
                const proxy = {
                    type: "trojan",
                    name: params.tag,
                    server: params.server,
                    port: params.port,
                    password: params.password,
                    sni: params["tls-host"] || params.server,
                    udp: JSON.parse(params["udp-relay"] || "false"),
                    tfo: JSON.parse(params["fast-open"] || "false"),
                };
                proxy['skip-cert-verify'] = !JSON.parse(params["tls-verification"] || "true");
                return proxy;
            };
            return {name, test, parse};
        }

        function QX_Http() {
            const name = "QX HTTP Parser";
            const test = (line) => {
                return /^http\s*=/.test(line.split(",")[0].trim());
            };
            const parse = (line) => {
                const params = getQXParams(line);
                const proxy = {
                    type: "http",
                    name: params.tag,
                    server: params.server,
                    port: params.port,
                    tls: JSON.parse(params["over-tls"] || "false"),
                    udp: JSON.parse(params["udp-relay"] || "false"),
                    tfo: JSON.parse(params["fast-open"] || "false"),
                };
                if (params.username && params.username !== 'none') proxy.username = params.username;
                if (params.password && params.password !== 'none') proxy.password = params.password;
                if (proxy.tls) {
                    proxy.sni = params["tls-host"] || proxy.server;
                    proxy['skip-cert-verify'] = !JSON.parse(params["tls-verification"] || "true");
                }
                return proxy;
            };

            return {name, test, parse};
        }

        function getQXParams(line) {
            const groups = line.split(",");
            const params = {};
            const protocols = ["shadowsocks", "vmess", "http", "trojan"];
            groups.forEach((g) => {
                let [key, value] = g.split("=");
                key = key.trim();
                value = value.trim();
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

        function Loon_SS() {
            const name = "Loon SS Parser";
            const test = (line) => {
                return (
                    line.split(",")[0].split("=")[1].trim().toLowerCase() === "shadowsocks"
                );
            };
            const parse = (line) => {
                const params = line.split("=")[1].split(",");
                const proxy = {
                    name: line.split("=")[0].trim(),
                    type: "ss",
                    server: params[1],
                    port: params[2],
                    cipher: params[3],
                    password: params[4].replace(/"/g, ""),
                };
                // handle obfs
                if (params.length > 5) {
                    proxy.plugin = "obfs";
                    proxy["plugin-opts"] = {
                        mode: params[5],
                        host: params[6],
                    };
                }
                return proxy;
            };
            return {name, test, parse};
        }

        function Loon_SSR() {
            const name = "Loon SSR Parser";
            const test = (line) => {
                return (
                    line.split(",")[0].split("=")[1].trim().toLowerCase() === "shadowsocksr"
                );
            };
            const parse = (line) => {
                const params = line.split("=")[1].split(",");
                const supported = {
                    Surge: false,
                };
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
                    "obfs-param": params[8].match(/{(.*)}/)[1],
                };
            };
            return {name, test, parse};
        }

        function Loon_VMess() {
            const name = "Loon VMess Parser";
            const test = (line) => {
                // distinguish between surge vmess
                return (
                    /^.*=\s*vmess/i.test(line.split(",")[0]) &&
                    line.indexOf("username") === -1
                );
            };
            const parse = (line) => {
                let params = line.split("=")[1].split(",");
                const proxy = {
                    name: line.split("=")[0].trim(),
                    type: "vmess",
                    server: params[1],
                    port: params[2],
                    cipher: params[3] || "none",
                    uuid: params[4].replace(/"/g, ""),
                    alterId: 0,
                };
                // get transport options
                params = params.splice(5);
                for (const item of params) {
                    const [key, val] = item.split(":");
                    params[key] = val;
                }
                proxy.tls = JSON.parse(params["over-tls"] || "false");
                if (proxy.tls) {
                    proxy.sni = params["tls-name"] || proxy.server;
                    proxy['skip-cert-verify'] = JSON.parse(params["skip-cert-verify"] || "false");
                }
                switch (params.transport) {
                    case "tcp":
                        break;
                    case "ws":
                        proxy.network = params.transport;
                        proxy["ws-path"] = params.path;
                        proxy["ws-headers"] = {
                            Host: params.host,
                        };
                }
                if (proxy.tls) {
                    proxy['skip-cert-verify'] = JSON.parse(params["skip-cert-verify"] || "false");
                }
                return proxy;
            };
            return {name, test, parse};
        }

        function Loon_Trojan() {
            const name = "Loon Trojan Parser";
            const test = (line) => {
                return (
                    /^.*=\s*trojan/i.test(line.split(",")[0]) &&
                    line.indexOf("password") === -1
                );
            };

            const parse = (line) => {
                const params = line.split("=")[1].split(",");
                const proxy = {
                    name: line.split("=")[0].trim(),
                    type: "trojan",
                    server: params[1],
                    port: params[2],
                    password: params[3].replace(/"/g, ""),
                    sni: params[1], // default sni is the server itself
                    "skip-cert-verify": JSON.parse(params["skip-cert-verify"] || "false"),
                };
                // trojan sni
                if (params.length > 4) {
                    const [key, val] = params[4].split(":");
                    if (key === "tls-name") proxy.sni = val;
                    else throw new Error(`Unknown option ${key} for line: \n${line}`);
                }
                return proxy;
            };

            return {name, test, parse};
        }

        function Loon_Http() {
            const name = "Loon HTTP Parser";
            const test = (line) => {
                return (
                    /^.*=\s*http/i.test(line.split(",")[0]) &&
                    line.split(",").length === 5 &&
                    line.indexOf("username") === -1 &&
                    line.indexOf("password") === -1
                );
            };

            const parse = (line) => {
                const params = line.split("=")[1].split(",");
                const proxy = {
                    name: line.split("=")[0].trim(),
                    type: "http",
                    server: params[1],
                    port: params[2],
                    tls: params[2] === "443", // port 443 is considered as https type
                };
                if (params[3]) proxy.username = params[3];
                if (params[4]) proxy.password = params[4];

                if (proxy.tls) {
                    proxy.sni = params["tls-name"] || proxy.server;
                    proxy['skip-cert-verify'] = JSON.parse(params["skip-cert-verify"] || "false");
                }

                return proxy;
            };
            return {name, test, parse};
        }

        function Surge_SS() {
            const name = "Surge SS Parser";
            const test = (line) => {
                return /^.*=\s*ss/.test(line.split(",")[0]);
            };
            const parse = (line) => {
                const params = getSurgeParams(line);
                const proxy = {
                    name: params.name,
                    type: "ss",
                    server: params.server,
                    port: params.port,
                    cipher: params["encrypt-method"],
                    password: params.password,
                    tfo: JSON.parse(params.tfo || "false"),
                    udp: JSON.parse(params["udp-relay"] || "false"),
                };
                // handle obfs
                if (params.obfs) {
                    proxy.plugin = "obfs";
                    proxy["plugin-opts"] = {
                        mode: params.obfs,
                        host: params["obfs-host"],
                    };
                }
                return proxy;
            };
            return {name, test, parse};
        }

        function Surge_VMess() {
            const name = "Surge VMess Parser";
            const test = (line) => {
                return (
                    /^.*=\s*vmess/.test(line.split(",")[0]) && line.indexOf("username") !== -1
                );
            };
            const parse = (line) => {
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
                };
                if (proxy.tls) {
                    if (typeof params["skip-cert-verify"] !== "undefined") {
                        proxy['skip-cert-verify'] = params["skip-cert-verify"] === true || params["skip-cert-verify"] === "1";
                    }
                    proxy.sni = params["sni"] || params.server;
                }
                // use websocket
                if (JSON.parse(params.ws || "false")) {
                    proxy.network = "ws";
                    proxy["ws-path"] = params["ws-path"];
                    const res = params["ws-headers"].match(/(,|^|\s)*HOST:\s*(.*?)(,|$)/);
                    const host = res ? res[2] : proxy.server;
                    proxy["ws-headers"] = {
                        Host: host || params.server,
                    };
                }
                return proxy;
            };
            return {name, test, parse};
        }

        function Surge_Trojan() {
            const name = "Surge Trojan Parser";
            const test = (line) => {
                return (
                    /^.*=\s*trojan/.test(line.split(",")[0]) && line.indexOf("sni") !== -1
                );
            };
            const parse = (line) => {
                const params = getSurgeParams(line);
                const proxy = {
                    name: params.name,
                    type: "trojan",
                    server: params.server,
                    port: params.port,
                    password: params.password,
                    sni: params.sni || params.server,
                    tfo: JSON.parse(params.tfo || "false"),
                };
                if (typeof params["skip-cert-verify"] !== "undefined") {
                    proxy['skip-cert-verify'] = params["skip-cert-verify"] === true || params["skip-cert-verify"] === "1";
                }
                return proxy;
            };

            return {name, test, parse};
        }

        function Surge_Http() {
            const name = "Surge HTTP Parser";
            const test = (line) => {
                return (
                    /^.*=\s*http/.test(line.split(",")[0]) && !Loon_Http().test(line)
                );
            };
            const parse = (line) => {
                const params = getSurgeParams(line);
                const proxy = {
                    name: params.name,
                    type: "http",
                    server: params.server,
                    port: params.port,
                    tls: JSON.parse(params.tls || "false"),
                    tfo: JSON.parse(params.tfo || "false"),
                };
                if (proxy.tls) {
                    if (typeof params["skip-cert-verify"] !== "undefined") {
                        proxy['skip-cert-verify'] = params["skip-cert-verify"] === true || params["skip-cert-verify"] === "1";
                    }
                    proxy.sni = params.sni || params.server;
                }
                if (params.username && params.username !== "none") proxy.username = params.username;
                if (params.password && params.password !== "none") proxy.password = params.password;
                return proxy;
            };
            return {name, test, parse};
        }

        function getSurgeParams(line) {
            const params = {};
            params.name = line.split("=")[0].trim();
            const segments = line.split(",");
            params.server = segments[1].trim();
            params.port = segments[2].trim();
            for (let i = 3; i < segments.length; i++) {
                const item = segments[i];
                if (item.indexOf("=") !== -1) {
                    const [key, value] = item.split("=");
                    params[key.trim()] = value.trim();
                }
            }
            return params;
        }

        return [
            URI_SS(), URI_SSR(), URI_VMess(), URI_Trojan(),
            Clash_All(),
            Surge_SS(), Surge_VMess(), Surge_Trojan(), Surge_Http(),
            Loon_SS(), Loon_SSR(), Loon_VMess(), Loon_Trojan(), Loon_Http(),
            QX_SS(), QX_SSR(), QX_VMess(), QX_Trojan(), QX_Http()
        ];
    })();
    const PROXY_PROCESSORS = (function () {
        // force to set some properties (e.g., skip-cert-verify, udp, tfo, etc.)
        function SetPropertyOperator({key, value}) {
            return {
                name: "Set Property Operator",
                func: (proxies) => {
                    return proxies.map((p) => {
                        p[key] = value;
                        return p;
                    });
                },
            };
        }

        // add or remove flag for proxies
        function FlagOperator(add = true) {
            return {
                name: "Flag Operator",
                func: (proxies) => {
                    return proxies.map((proxy) => {
                        if (!add) {
                            // no flag
                            proxy.name = removeFlag(proxy.name);
                        } else {
                            // get flag
                            const newFlag = getFlag(proxy.name);
                            // remove old flag
                            proxy.name = removeFlag(proxy.name);
                            proxy.name = newFlag + " " + proxy.name;
                            proxy.name = proxy.name.replace(/🇹🇼/g, "🇨🇳");
                        }
                        return proxy;
                    });
                },
            };
        }

        // sort proxies according to their names
        function SortOperator(order = "asc") {
            return {
                name: "Sort Operator",
                func: (proxies) => {
                    switch (order) {
                        case "asc":
                        case "desc":
                            return proxies.sort((a, b) => {
                                let res = a.name > b.name ? 1 : -1;
                                res *= order === "desc" ? -1 : 1;
                                return res;
                            });
                        case "random":
                            return shuffle(proxies);
                        default:
                            throw new Error("Unknown sort option: " + order);
                    }
                },
            };
        }

        // sort by regex
        function RegexSortOperator(expressions) {
            return {
                name: "Regex Sort Operator",
                func: (proxies) => {
                    expressions = expressions.map(expr => buildRegex(expr));
                    return proxies.sort((a, b) => {
                        const oA = getRegexOrder(expressions, a.name);
                        const oB = getRegexOrder(expressions, b.name);
                        if (oA && !oB) return -1;
                        if (oB && !oA) return 1;
                        if (oA && oB) return oA < oB ? -1 : 1;
                        if ((!oA && !oB) || (oA && oB && oA === oB))
                            return a.name < b.name ? -1 : 1; // fallback to normal sort
                    })
                }

            };
        }

        function getRegexOrder(expressions, str) {
            let order = null;
            for (let i = 0; i < expressions.length; i++) {
                if (expressions[i].test(str)) {
                    order = i + 1; // plus 1 is important! 0 will be treated as false!!!
                    break;
                }
            }
            return order;
        }

        // rename by regex
        // keywords: [{expr: "string format regex", now: "now"}]
        function RegexRenameOperator(regex) {
            return {
                name: "Regex Rename Operator",
                func: (proxies) => {
                    return proxies.map((proxy) => {
                        for (const {expr, now} of regex) {
                            proxy.name = proxy.name.replace(buildRegex(expr, "g"), now).trim();
                        }
                        return proxy;
                    });
                },
            };
        }

        // delete regex operator
        // regex: ['a', 'b', 'c']
        function RegexDeleteOperator(regex) {
            const regex_ = regex.map((r) => {
                return {
                    expr: r,
                    now: "",
                };
            });
            return {
                name: "Regex Delete Operator",
                func: RegexRenameOperator(regex_).func,
            };
        }

        // use base64 encoded script to rename
        /** Example script
         function operator(proxies) {
            // do something
            return proxies;
         }

         WARNING:
         1. This function name should be `operator`!
         2. Always declare variables before using them!
         */
        function ScriptOperator(script) {
            return {
                name: "Script Operator",
                func: (proxies) => {
                    let output = proxies;
                    (function () {
                        // interface to get internal operators
                        const $get = (name, args) => {
                            const item = PROXY_PROCESSORS[name];
                            return item(args);
                        };
                        const $process = ApplyProcessor;
                        eval(script);
                        output = operator(proxies);
                    })();
                    return output;
                },
            };
        }

        /**************************** Filters ***************************************/
        // filter useless proxies
        function UselessFilter() {
            const KEYWORDS = [
                "网址",
                "流量",
                "时间",
                "应急",
                "过期",
                "Bandwidth",
                "expire",
            ];
            return {
                name: "Useless Filter",
                func: RegexFilter({
                    regex: KEYWORDS,
                    keep: false,
                }).func,
            };
        }

        // filter by regions
        function RegionFilter(regions) {
            const REGION_MAP = {
                HK: "🇭🇰",
                TW: "🇹🇼",
                US: "🇺🇸",
                SG: "🇸🇬",
                JP: "🇯🇵",
                UK: "🇬🇧",
            };
            return {
                name: "Region Filter",
                func: (proxies) => {
                    // this would be high memory usage
                    return proxies.map((proxy) => {
                        const flag = getFlag(proxy.name);
                        return regions.some((r) => REGION_MAP[r] === flag);
                    });
                },
            };
        }

        // filter by regex
        function RegexFilter({regex = [], keep = true}) {
            return {
                name: "Regex Filter",
                func: (proxies) => {
                    return proxies.map((proxy) => {
                        const selected = regex.some((r) => {
                            return buildRegex(r).test(proxy.name);
                        });
                        return keep ? selected : !selected;
                    });
                },
            };
        }

        // filter by proxy types
        function TypeFilter(types) {
            return {
                name: "Type Filter",
                func: (proxies) => {
                    return proxies.map((proxy) => types.some((t) => proxy.type === t));
                },
            };
        }

        // use base64 encoded script to filter proxies
        /**
         Script Example
         function func(proxies) {
            const selected = FULL(proxies.length, true);
            // do something
            return selected;
         }
         WARNING:
         1. This function name should be `func`!
         2. Always declare variables before using them!
         */
        function ScriptFilter(script) {
            return {
                name: "Script Filter",
                func: (proxies) => {
                    let output = FULL(proxies.length, true);
                    !(function () {
                        eval(script);
                        output = filter(proxies);
                    })();
                    return output;
                },
            };
        }

        /******************************** Utility Functions *********************************************/
        // get proxy flag according to its name
        function getFlag(name) {
            // flags from @KOP-XIAO: https://github.com/KOP-XIAO/QuantumultX/blob/master/Scripts/resource-parser.js
            const flags = {
                "🇦🇨": ["AC"],
                "🇦🇹": ["奥地利", "维也纳"],
                "🇦🇺": ["AU", "Australia", "Sydney", "澳大利亚", "澳洲", "墨尔本", "悉尼"],
                "🇧🇪": ["BE", "比利时"],
                "🇧🇬": ["保加利亚", "Bulgaria"],
                "🇧🇷": ["BR", "Brazil", "巴西", "圣保罗"],
                "🇨🇦": [
                    "CA",
                    "Canada",
                    "Waterloo",
                    "加拿大",
                    "蒙特利尔",
                    "温哥华",
                    "楓葉",
                    "枫叶",
                    "滑铁卢",
                    "多伦多",
                ],
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
                "🇭🇰": [
                    "HK",
                    "Hongkong",
                    "Hong Kong",
                    "香港",
                    "深港",
                    "沪港",
                    "呼港",
                    "HKT",
                    "HKBN",
                    "HGC",
                    "WTT",
                    "CMI",
                    "穗港",
                    "京港",
                    "港",
                ],
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
                "🇷🇺": [
                    "RU",
                    "Russia",
                    "俄罗斯",
                    "俄羅斯",
                    "伯力",
                    "莫斯科",
                    "圣彼得堡",
                    "西伯利亚",
                    "新西伯利亚",
                    "京俄",
                    "杭俄",
                ],
                "🇸🇦": ["沙特", "迪拜"],
                "🇸🇪": ["SE", "Sweden"],
                "🇸🇬": [
                    "SG",
                    "Singapore",
                    "新加坡",
                    "狮城",
                    "沪新",
                    "京新",
                    "泉新",
                    "穗新",
                    "深新",
                    "杭新",
                    "广新",
                ],
                "🇹🇭": ["TH", "Thailand", "泰国", "泰國", "曼谷"],
                "🇹🇷": ["TR", "Turkey", "土耳其", "伊斯坦布尔"],
                "🇹🇼": [
                    "TW",
                    "Taiwan",
                    "台湾",
                    "台北",
                    "台中",
                    "新北",
                    "彰化",
                    "CHT",
                    "台",
                    "HINET",
                ],
                "🇺🇸": [
                    "US",
                    "USA",
                    "America",
                    "United States",
                    "美国",
                    "美",
                    "京美",
                    "波特兰",
                    "达拉斯",
                    "俄勒冈",
                    "凤凰城",
                    "费利蒙",
                    "硅谷",
                    "矽谷",
                    "拉斯维加斯",
                    "洛杉矶",
                    "圣何塞",
                    "圣克拉拉",
                    "西雅图",
                    "芝加哥",
                    "沪美",
                    "哥伦布",
                    "纽约",
                ],
                "🇻🇳": ["VN", "越南", "胡志明市"],
                "🇮🇹": ["Italy", "IT", "Nachash", "意大利", "米兰", "義大利"],
                "🇿🇦": ["South Africa", "南非"],
                "🇦🇪": ["United Arab Emirates", "阿联酋"],
                "🇯🇵": [
                    "JP",
                    "Japan",
                    "日",
                    "日本",
                    "东京",
                    "大阪",
                    "埼玉",
                    "沪日",
                    "穗日",
                    "川日",
                    "中日",
                    "泉日",
                    "杭日",
                    "深日",
                    "辽日",
                    "广日",
                ],
                "🇦🇷": ["AR", "阿根廷"],
                "🇳🇴": ["Norway", "挪威", "NO"],
                "🇨🇳": [
                    "CN",
                    "China",
                    "回国",
                    "中国",
                    "江苏",
                    "北京",
                    "上海",
                    "广州",
                    "深圳",
                    "杭州",
                    "徐州",
                    "青岛",
                    "宁波",
                    "镇江",
                    "back",
                ],
                "🏳️‍🌈": ["流量", "时间", "应急", "过期", "Bandwidth", "expire"],
            };
            for (let k of Object.keys(flags)) {
                if (flags[k].some((item) => name.indexOf(item) !== -1)) {
                    return k;
                }
            }
            // no flag found
            const oldFlag = (name.match(
                /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/
            ) || [])[0];
            return oldFlag || "🏴‍☠️";
        }

        // remove flag
        function removeFlag(str) {
            return str
                .replace(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g, "")
                .trim();
        }

        // shuffle array
        function shuffle(array) {
            let currentIndex = array.length,
                temporaryValue,
                randomIndex;

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

        return {
            "Useless Filter": UselessFilter,
            "Region Filter": RegionFilter,
            "Regex Filter": RegexFilter,
            "Type Filter": TypeFilter,
            "Script Filter": ScriptFilter,

            "Set Property Operator": SetPropertyOperator,
            "Flag Operator": FlagOperator,
            "Sort Operator": SortOperator,
            "Regex Sort Operator": RegexSortOperator,
            "Regex Rename Operator": RegexRenameOperator,
            "Regex Delete Operator": RegexDeleteOperator,
            "Script Operator": ScriptOperator,
        };
    })();
    const PROXY_PRODUCERS = (function () {
        function QX_Producer() {
            const targetPlatform = "QX";
            const produce = (proxy) => {
                let obfs_opts;
                let tls_opts;
                switch (proxy.type) {
                    case "ss":
                        obfs_opts = "";
                        if (proxy.plugin === "obfs") {
                            const {host, mode} = proxy['plugin-opts'];
                            obfs_opts = `,obfs=${mode}${
                                host ? ",obfs-host=" + host : ""
                            }`;
                        }
                        if (proxy.plugin === "v2ray-plugin") {
                            const {tls, host, path} = proxy["plugin-opts"];
                            obfs_opts = `,obfs=${tls ? "wss" : "ws"}${
                                host ? ",obfs-host=" + host : ""
                            }${
                                path ? ",obfs-uri=" + path : ""
                            }`;
                        }
                        return `shadowsocks=${proxy.server}:${proxy.port},method=${
                            proxy.cipher
                        },password=${proxy.password}${obfs_opts}${
                            proxy.tfo ? ",fast-open=true" : ",fast-open=false"
                        }${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"},tag=${
                            proxy.name
                        }`;
                    case "ssr":
                        return `shadowsocks=${proxy.server}:${proxy.port},method=${
                            proxy.cipher
                        },password=${proxy.password},ssr-protocol=${proxy.protocol}${
                            proxy["protocol-param"]
                                ? ",ssr-protocol-param=" + proxy["protocol-param"]
                                : ""
                        }${proxy.obfs ? ",obfs=" + proxy.obfs : ""}${
                            proxy["obfs-param"] ? ",obfs-host=" + proxy["obfs-param"] : ""
                        }${proxy.tfo ? ",fast-open=true" : ",fast-open=false"}${
                            proxy.udp ? ",udp-relay=true" : ",udp-relay=false"
                        },tag=${proxy.name}`;
                    case "vmess":
                        obfs_opts = "";
                        if (proxy.network === "ws") {
                            // websocket
                            if (proxy.tls) {
                                // ws-tls
                                obfs_opts = `,obfs=wss${
                                    proxy.sni ? ",obfs-host=" + proxy.sni : ""
                                }${
                                    proxy["ws-path"] ? ",obfs-uri=" + proxy["ws-path"] : ""
                                },tls-verification=${proxy['skip-cert-verify'] ? "false" : "true"}`;
                            } else {
                                // ws
                                obfs_opts = `,obfs=ws${
                                    proxy["ws-headers"].Host ? ",obfs-host=" + proxy["ws-headers"].Host : ""
                                }${
                                    proxy["ws-path"] ? ",obfs-uri=" + proxy["ws-path"] : ""
                                }`;
                            }
                        } else {
                            // tcp
                            if (proxy.tls) {
                                obfs_opts = `,obfs=over-tls${
                                    proxy.sni ? ",obfs-host=" + proxy.sni : ""
                                },tls-verification=${proxy['skip-cert-verify'] ? "false" : "true"}`;
                            }
                        }
                        return `vmess=${proxy.server}:${proxy.port},method=${
                            proxy.cipher === "auto" ? "none" : proxy.cipher
                        },password=${proxy.uuid}${obfs_opts}${
                            proxy.tfo ? ",fast-open=true" : ",fast-open=false"
                        }${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"},tag=${
                            proxy.name
                        }`;
                    case "trojan":
                        return `trojan=${proxy.server}:${proxy.port},password=${
                            proxy.password
                        }${proxy.sni ? ",tls-host=" + proxy.sni : ""},over-tls=true,tls-verification=${
                            proxy['skip-cert-verify'] ? "false" : "true"
                        }${proxy.tfo ? ",fast-open=true" : ",fast-open=false"}${
                            proxy.udp ? ",udp-relay=true" : ",udp-relay=false"
                        },tag=${proxy.name}`;
                    case "http":
                        tls_opts = "";
                        if (proxy.tls) {
                            tls_opts = `,over-tls=true,tls-verification=${
                                proxy['skip-cert-verify'] ? "false" : "true"
                            }${
                                proxy.sni ? ",tls-host=" + proxy.sni : ""
                            }`;
                        }
                        return `http=${proxy.server}:${proxy.port},username=${
                            proxy.username
                        },password=${proxy.password}${tls_opts}${
                            proxy.tfo ? ",fast-open=true" : ",fast-open=false"
                        },tag=${proxy.name}`;
                }
                throw new Error(
                    `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`
                );
            };
            return {produce};
        }

        function Loon_Producer() {
            const targetPlatform = "Loon";
            const produce = (proxy) => {
                let obfs_opts, tls_opts;
                switch (proxy.type) {
                    case "ss":
                        obfs_opts = ",,";
                        if (proxy.plugin) {
                            if (proxy.plugin === "obfs") {
                                const {mode, host} = proxy["plugin-opts"];
                                obfs_opts = `,${mode},${host || ""}`;
                            } else {
                                throw new Error(
                                    `Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`
                                );
                            }
                        }

                        return `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"${obfs_opts}`;
                    case "ssr":
                        return `${proxy.name}=shadowsocksr,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}",${proxy.protocol},{${proxy["protocol-param"] || ""}},${proxy.obfs},{${proxy["obfs-param"] || ""}}`;
                    case "vmess":
                        obfs_opts = "";
                        if (proxy.network === "ws") {
                            const host = proxy["ws-headers"].Host || proxy.server;
                            obfs_opts = `,transport:ws,host:${host},path:${
                                proxy["ws-path"] || "/"
                            }`;
                        } else {
                            obfs_opts = `,transport:tcp`;
                        }
                        if (proxy.tls) {
                            obfs_opts += `${
                                proxy.sni ? ",tls-name:" + proxy.sni : ""
                            },skip-cert-verify:${proxy['skip-cert-verify'] || "false"}`;
                        }
                        return `${proxy.name}=vmess,${proxy.server},${proxy.port},${
                            proxy.cipher === "auto" ? "none" : proxy.cipher
                        },"${proxy.uuid}",over-tls:${proxy.tls || "false"}${obfs_opts}`;
                    case "trojan":
                        return `${proxy.name}=trojan,${proxy.server},${proxy.port},"${
                            proxy.password
                        }"${
                            proxy.sni ? ",tls-name:" + proxy.sni : ""
                        },skip-cert-verify:${
                            proxy['skip-cert-verify'] || "false"
                        }`;
                    case "http":
                        tls_opts = "";
                        const base = `${proxy.name}=${proxy.tls ? "http" : "https"},${
                            proxy.server
                        },${proxy.port},${proxy.username || ""},${proxy.password || ""}`;
                        if (proxy.tls) {
                            // https
                            tls_opts = `${
                                proxy.sni ? ",tls-name:" + proxy.sni : ""
                            },skip-cert-verify:${proxy['skip-cert-verify']}`;
                            return base + tls_opts;
                        } else return base;
                }
                throw new Error(
                    `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`
                );
            };
            return {produce};
        }

        function Surge_Producer() {
            const targetPlatform = "Surge";
            const produce = (proxy) => {
                let obfs_opts, tls_opts;
                switch (proxy.type) {
                    case "ss":
                        obfs_opts = "";
                        if (proxy.plugin) {
                            const {host, mode} = proxy['plugin-opts'];
                            if (proxy.plugin === "obfs") {
                                obfs_opts = `,obfs=${mode}${
                                    host ? ",obfs-host=" + host : ""
                                }`;
                            } else {
                                throw new Error(
                                    `Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`
                                );
                            }
                        }
                        return `${proxy.name}=ss,${proxy.server}, ${proxy.port},encrypt-method=${
                            proxy.cipher
                        },password=${proxy.password}${obfs_opts},tfo=${
                            proxy.tfo || "false"
                        },udp-relay=${proxy.udp || "false"}`;
                    case "vmess":
                        tls_opts = "";
                        let config = `${proxy.name}=vmess,${proxy.server},${
                            proxy.port
                        },username=${proxy.uuid},tls=${proxy.tls || "false"},tfo=${proxy.tfo || "false"}`;
                        if (proxy.network === "ws") {
                            const path = proxy["ws-path"] || "/";
                            const host = proxy["ws-headers"].Host;
                            config += `,ws=true${path ? ",ws-path=" + path : ""}${
                                host ? ",ws-headers=HOST:" + host : ""
                            }`;
                        }
                        if (proxy.tls) {
                            config += `${
                                typeof proxy['skip-cert-verify'] !== "undefined"
                                    ? ",skip-cert-verify=" + proxy['skip-cert-verify']
                                    : ""
                            }`;
                            config += proxy.sni ? `,sni=${proxy.sni}` : "";
                        }
                        return config;
                    case "trojan":
                        return `${proxy.name}=trojan,${proxy.server},${proxy.port},password=${
                            proxy.password
                        }${
                            typeof proxy['skip-cert-verify'] !== "undefined"
                                ? ",skip-cert-verify=" + proxy['skip-cert-verify']
                                : ""
                        }${proxy.sni ? ",sni=" + proxy.sni : ""},tfo=${proxy.tfo || "false"}`;
                    case "http":
                        tls_opts = ", tls=false";
                        if (proxy.tls) {
                            tls_opts = `,tls=true,skip-cert-verify=${proxy['skip-cert-verify']},sni=${proxy.sni}`;
                        }
                        return `${proxy.name}=http, ${proxy.server}, ${proxy.port}${
                            proxy.username ? ",username=" + proxy.username : ""
                        }${
                            proxy.password ? ",password=" + proxy.password : ""
                        }${tls_opts},tfo=${proxy.tfo || "false"}`;
                }
                throw new Error(
                    `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`
                );
            };
            return {produce};
        }

        function Clash_Producer() {
            const type = "ALL";
            const produce = (proxies) => {
                return "proxies:\n" + proxies.map(proxy => {
                    delete proxy.supported;
                    return "  - " + JSON.stringify(proxy) + "\n";
                }).join("");
            };
            return {type, produce};
        }

        function URI_Producer() {
            const type = "SINGLE";
            const produce = (proxy) => {
                let result = "";
                switch (proxy.type) {
                    case "ss":
                        const userinfo = `${proxy.cipher}:${proxy.password}`;
                        result = `ss://${Base64.safeEncode(userinfo)}@${proxy.server}:${
                            proxy.port
                        }/`;
                        if (proxy.plugin) {
                            result += "?plugin=";
                            const opts = proxy["plugin-opts"];
                            switch (proxy.plugin) {
                                case "obfs":
                                    result += encodeURIComponent(
                                        `simple-obfs;obfs=${opts.mode}${
                                            opts.host ? ";obfs-host=" + opts.host : ""
                                        }`
                                    );
                                    break;
                                case "v2ray-plugin":
                                    result += encodeURIComponent(
                                        `v2ray-plugin;obfs=${opts.mode}${
                                            opts.host ? ";obfs-host" + opts.host : ""
                                        }${opts.tls ? ";tls" : ""}`
                                    );
                                    break;
                                default:
                                    throw new Error(`Unsupported plugin option: ${proxy.plugin}`);
                            }
                        }
                        result += `#${encodeURIComponent(proxy.name)}`;
                        break;
                    case "ssr":
                        result = `${proxy.server}:${proxy.port}:${proxy.protocol}:${
                            proxy.cipher
                        }:${proxy.obfs}:${Base64.safeEncode(proxy.password)}/`;
                        result += `?remarks=${Base64.safeEncode(proxy.name)}${
                            proxy["obfs-param"]
                                ? "&obfsparam=" + Base64.safeEncode(proxy["obfs-param"])
                                : ""
                        }${
                            proxy["protocol-param"]
                                ? "&protocolparam=" + Base64.safeEncode(proxy["protocol-param"])
                                : ""
                        }`;
                        result = "ssr://" + Base64.safeEncode(result);
                        break;
                    case "vmess":
                        // V2RayN URI format
                        result = {
                            ps: proxy.name,
                            add: proxy.server,
                            port: proxy.port,
                            id: proxy.uuid,
                            type: "",
                            aid: 0,
                            net: proxy.network || "tcp",
                            tls: proxy.tls ? "tls" : "",
                        };
                        // obfs
                        if (proxy.network === "ws") {
                            result.path = proxy["ws-path"] || "/";
                            result.host = proxy["ws-headers"].Host || proxy.server;
                        }
                        result = "vmess://" + Base64.safeEncode(JSON.stringify(result));
                        break;
                    case "trojan":
                        result = `trojan://${proxy.password}@${proxy.server}:${proxy.port}#${encodeURIComponent(proxy.name)}`;
                        break;
                    default:
                        throw new Error(`Cannot handle proxy type: ${proxy.type}`);
                }
                return result;
            }
            return {type, produce};
        }

        function JSON_Producer() {
            const type = "ALL";
            const produce = proxies => JSON.stringify(proxies, null, 2);
            return {type, produce};
        }


        return {
            "QX": QX_Producer(),
            "Surge": Surge_Producer(),
            "Loon": Loon_Producer(),
            "Clash": Clash_Producer(),
            "URI": URI_Producer(),
            "JSON": JSON_Producer()
        }
    })();

    function preprocess(raw) {
        for (const processor of PROXY_PREPROCESSORS) {
            try {
                if (processor.test(raw)) {
                    $.info(`Pre-processor [${processor.name}] activated`);
                    return processor.parse(raw);
                }
            } catch (e) {
                $.error(`Parser [${processor.name}] failed\n Reason: ${e}`);
            }
        }
        return raw;
    }

    function safeMatch(p, line) {
        let patternMatched;
        try {
            patternMatched = p.test(line);
        } catch (err) {
            patternMatched = false;
        }
        return patternMatched;
    }

    function parse(raw) {
        raw = preprocess(raw);
        // parse
        const lines = raw.split("\n");
        const proxies = [];
        let lastParser;

        for (let line of lines) {
            line = line.trim();
            if (line.length === 0) continue; // skip empty line
            let matched = lastParser && safeMatch(lastParser, line);
            if (!matched) {
                for (const parser of PROXY_PARSERS) {
                    if (safeMatch(parser, line)) {
                        lastParser = parser;
                        matched = true;
                        $.info(`Proxy parser: ${parser.name} is activated`);
                        break;
                    }
                }
            }
            if (!matched) {
                $.error(`Failed to find a rule to parse line: \n${line}\n`);
            } else {
                try {
                    const proxy = lastParser.parse(line);
                    if (!proxy) {
                        $.error(`Parser ${lastParser.name} return nothing for \n${line}\n`);
                    }
                    proxies.push(proxy);
                } catch (err) {
                    $.error(
                        `Failed to parse line: \n ${line}\n Reason: ${err.stack}`
                    );
                }
            }
        }

        return proxies;
    }

    async function process(proxies, operators = []) {
        for (const item of operators) {
            // process script
            let script;
            if (item.type.indexOf("Script") !== -1) {
                const {mode, content} = item.args;
                if (mode === "link") {
                    // if this is remote script, download it
                    try {
                        script = await $.http
                            .get(content)
                            .then((resp) => resp.body);
                    } catch (err) {
                        $.error(
                            `Error when downloading remote script: ${item.args.content}.\n Reason: ${err}`
                        );
                        // skip the script if download failed.
                        continue;
                    }

                } else {
                    script = content;
                }
            }

            if (!PROXY_PROCESSORS[item.type]) {
                $.error(`Unknown operator: "${item.type}"`);
                continue;
            }

            $.info(
                `Applying "${item.type}" with arguments:\n >>> ${
                    JSON.stringify(item.args, null, 2) || "None"
                }`
            );
            let processor;
            if (item.type.indexOf('Script') !== -1) {
                processor = PROXY_PROCESSORS[item.type](script);
            } else {
                processor = PROXY_PROCESSORS[item.type](item.args);
            }
            proxies = ApplyProcessor(processor, proxies);
        }
        return proxies;
    }

    function produce(proxies, targetPlatform) {
        const producer = PROXY_PRODUCERS[targetPlatform];
        if (!producer) {
            throw new Error(`Target platform: ${targetPlatform} is not supported!`);
        }

        // filter unsupported proxies
        proxies = proxies.filter(proxy => !(proxy.supported && proxy.supported[targetPlatform] === false));

        $.info(`Producing proxies for target: ${targetPlatform}`);
        if (typeof producer.type === "undefined" || producer.type === 'SINGLE') {
            return proxies
                .map(proxy => {
                    try {
                        return producer.produce(proxy);
                    } catch (err) {
                        $.error(
                            `Cannot produce proxy: ${JSON.stringify(
                                proxy, null, 2
                            )}\nReason: ${err}`
                        );
                        return "";
                    }
                })
                .filter(line => line.length > 0)
                .join("\n");
        } else if (producer.type === "ALL") {
            return producer.produce(proxies);
        }
    }

    return {
        parse, process, produce
    }
})();

/****************************************** Rule Utils **********************************************************/
var RuleUtils = (function () {
    const RULE_TYPES_MAPPING = [
        [/^(DOMAIN|host|HOST)$/, "DOMAIN"],
        [/^(DOMAIN-KEYWORD|host-keyword|HOST-KEYWORD)$/, "DOMAIN-KEYWORD"],
        [/^(DOMAIN-SUFFIX|host-suffix|HOST-SUFFIX)$/, "DOMAIN-SUFFIX"],
        [/^USER-AGENT$/i, "USER-AGENT"],
        [/^PROCESS-NAME$/, "PROCESS-NAME"],
        [/^(DEST-PORT|DST-PORT)$/, "DST-PORT"],
        [/^SRC-IP(-CIDR)?$/, "SRC-IP"],
        [/^(IN|SRC)-PORT$/, "IN-PORT"],
        [/^PROTOCOL$/, "PROTOCOL"],
        [/^IP-CIDR$/i, "IP-CIDR"],
        [/^(IP-CIDR6|ip6-cidr|IP6-CIDR)$/]
    ];

    const RULE_PREPROCESSORS = (function () {
        function HTML() {
            const name = "HTML";
            const test = raw => /^<!DOCTYPE html>/.test(raw);
            // simply discard HTML
            const parse = _ => "";
            return {name, test, parse};
        }

        function ClashProvider() {
            const name = "Clash Provider";
            const test = raw => raw.indexOf("payload:") === 0
            const parse = raw => {
                return raw
                    .replace("payload:", "")
                    .replace(/^\s*-\s*/gm, "");
            }
            return {name, test, parse}
        }

        return [HTML(), ClashProvider()];
    })();
    const RULE_PARSERS = (function () {
        function AllRuleParser() {
            const name = "Universal Rule Parser";
            const test = () => true;
            const parse = (raw) => {
                const lines = raw.split("\n");
                const result = [];
                for (let line of lines) {
                    line = line.trim();
                    // skip empty line
                    if (line.length === 0) continue;
                    // skip comments
                    if (/\s*#/.test(line)) continue;
                    try {
                        const params = line.split(",").map(w => w.trim());
                        let rawType = params[0];
                        let matched = false;
                        for (const item of RULE_TYPES_MAPPING) {
                            const regex = item[0];
                            if (regex.test(rawType)) {
                                matched = true;
                                const rule = {
                                    type: item[1],
                                    content: params[1],
                                };
                                if (rule.type === "IP-CIDR" || rule.type === "IP-CIDR6") {
                                    rule.options = params.slice(2)
                                }
                                result.push(rule);
                            }
                        }
                        if (!matched) throw new Error("Invalid rule type: " + rawType);
                    } catch (e) {
                        console.error(`Failed to parse line: ${line}\n Reason: ${e}`);
                    }
                }
                return result;
            }
            return {name, test, parse};
        }

        return [AllRuleParser()];
    })();
    const RULE_PROCESSORS = (function () {
        function RegexFilter({regex = [], keep = true}) {
            return {
                name: "Regex Filter",
                func: (rules) => {
                    return rules.map((rule) => {
                        const selected = regex.some((r) => {
                            r = new RegExp(r);
                            return r.test(rule);
                        });
                        return keep ? selected : !selected;
                    });
                },
            };
        }

        function TypeFilter(types) {
            return {
                name: "Type Filter",
                func: (rules) => {
                    return rules.map((rule) => types.some((t) => rule.type === t));
                },
            };
        }

        function RemoveDuplicateFilter() {
            return {
                name: "Remove Duplicate Filter",
                func: rules => {
                    const seen = new Set();
                    const result = [];
                    rules.forEach(rule => {
                        const options = rule.options || [];
                        options.sort();
                        const key = `${rule.type},${rule.content},${JSON.stringify(options)}`;
                        if (!seen.has(key)) {
                            result.push(rule)
                            seen.add(key);
                        }
                    });
                    return result;
                }
            }
        }

        // regex: [{expr: "string format regex", now: "now"}]
        function RegexReplaceOperator(regex) {
            return {
                name: "Regex Rename Operator",
                func: (rules) => {
                    return rules.map((rule) => {
                        for (const {expr, now} of regex) {
                            rule.content = rule.content.replace(new RegExp(expr, "g"), now).trim();
                        }
                        return rule;
                    });
                },
            };
        }

        return {
            "Regex Filter": RegexFilter,
            "Remove Duplicate Filter": RemoveDuplicateFilter,
            "Type Filter": TypeFilter,

            "Regex Replace Operator": RegexReplaceOperator
        };
    })();
    const RULE_PRODUCERS = (function () {
        function QXFilter() {
            const type = "SINGLE";
            const func = (rule) => {
                // skip unsupported rules
                const UNSUPPORTED = [
                    "URL-REGEX", "DEST-PORT", "SRC-IP", "IN-PORT", "PROTOCOL"
                ];
                if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;

                const TRANSFORM = {
                    "DOMAIN-KEYWORD": "HOST-KEYWORD",
                    "DOMAIN-SUFFIX": "HOST-SUFFIX",
                    "DOMAIN": "HOST",
                    "IP-CIDR6": "IP6-CIDR"
                };

                // QX does not support the no-resolve option
                return `${TRANSFORM[rule.type] || rule.type},${rule.content},SUB-STORE`;
            }
            return {type, func};
        }

        function SurgeRuleSet() {
            const type = "SINGLE";
            const func = (rule) => {
                let output = `${rule.type},${rule.content}`;
                if (rule.type === "IP-CIDR" || rule.type === "IP-CIDR6") {
                    output += rule.options ? `,${rule.options[0]}` : "";
                }
                return output;
            }
            return {type, func};
        }

        function LoonRules() {
            const type = "SINGLE";
            const func = (rule) => {
                // skip unsupported rules
                const UNSUPPORTED = [
                    "DEST-PORT", "SRC-IP", "IN-PORT", "PROTOCOL"
                ];
                if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;
                return SurgeRuleSet().func(rule);
            }
            return {type, func};
        }

        function ClashRuleProvider() {
            const type = "ALL";
            const func = (rules) => {
                const TRANSFORM = {
                    "DEST-PORT": "DST-PORT",
                    "SRC-IP": "SRC-IP-CIDR",
                    "IN-PORT": "SRC-PORT"
                };
                const conf = {
                    payload: rules.map(rule => {
                        let output = `${TRANSFORM[rule.type] || rule.type},${rule.content}`;
                        if (rule.type === "IP-CIDR" || rule.type === "IP-CIDR6") {
                            output += rule.options ? `,${rule.options[0]}` : "";
                        }
                        return output;
                    })
                }
                return YAML.stringify(conf);
            }
            return {type, func};
        }

        return {
            "QX": QXFilter(),
            "Surge": SurgeRuleSet(),
            "Loon": LoonRules(),
            "Clash": ClashRuleProvider()
        };
    })();

    function preprocess(raw) {
        for (const processor of RULE_PREPROCESSORS) {
            try {
                if (processor.test(raw)) {
                    $.info(`Pre-processor [${processor.name}] activated`);
                    return processor.parse(raw);
                }
            } catch (e) {
                $.error(`Parser [${processor.name}] failed\n Reason: ${e}`);
            }
        }
        return raw;
    }

    function parse(raw) {
        raw = preprocess(raw);
        for (const parser of RULE_PARSERS) {
            let matched;
            try {
                matched = parser.test(raw);
            } catch (err) {
                matched = false;
            }
            if (matched) {
                $.info(`Rule parser [${parser.name}] is activated!`);
                return parser.parse(raw);
            }
        }
    }

    async function process(rules, operators) {
        for (const item of operators) {
            if (!RULE_PROCESSORS[item.type]) {
                console.error(`Unknown operator: ${item.type}!`);
                continue;
            }
            const processor = RULE_PROCESSORS[item.type](item.args);
            $.info(
                `Applying "${item.type}" with arguments: \n >>> ${
                    JSON.stringify(item.args) || "None"
                }`
            );
            rules = ApplyProcessor(processor, rules);
        }
        return rules;
    }

    function produce(rules, targetPlatform) {
        const producer = RULE_PRODUCERS[targetPlatform];
        if (!producer) {
            throw new Error(`Target platform: ${targetPlatform} is not supported!`);
        }
        if (typeof producer.type === "undefined" || producer.type === 'SINGLE') {
            return rules
                .map(rule => {
                    try {
                        return producer.func(rule);
                    } catch (err) {
                        console.log(
                            `ERROR: cannot produce rule: ${JSON.stringify(
                                rule
                            )}\nReason: ${err}`
                        );
                        return "";
                    }
                })
                .filter(line => line.length > 0)
                .join("\n");
        } else if (producer.type === "ALL") {
            return producer.func(rules);
        }
    }

    return {parse, process, produce};
})();

function getBuiltInRules() {
    return {
        "AD": {
            "name": "AD",
            "description": "",
            "urls": [
                "https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/anti-ad-surge.txt",
                "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanAD.yaml",
            ]
        },
        "Global": {
            "name": "Global",
            "description": "",
            "urls": [
                "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ProxyGFWlist.yaml",
                "https://raw.githubusercontent.com/DivineEngine/Profiles/master/Quantumult/Filter/Global.list"
            ]
        },
        "CN": {
            "name": "CN",
            "description": "",
            "urls": [
                "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ChinaDomain.yaml",
                "https://raw.githubusercontent.com/DivineEngine/Profiles/master/Quantumult/Filter/China.list"
            ]
        }
    };
}

/****************************************** Supporting Functions ********************************************** */
function ApplyProcessor(process, objs) {
    function ApplyFilter(filter, objs) {
        // select proxies
        let selected = FULL(objs.length, true);
        try {
            selected = AND(selected, filter.func(objs));
        } catch (err) {
            // print log and skip this filter
            console.log(`Cannot apply filter ${filter.name}\n Reason: ${err}`);
        }
        return objs.filter((_, i) => selected[i]);
    }

    function ApplyOperator(operator, objs) {
        let output = clone(objs);
        try {
            const output_ = operator.func(output);
            if (output_) output = output_;
        } catch (err) {
            // print log and skip this operator
            console.log(`Cannot apply operator ${operator.name}! Reason: ${err}`);
        }
        return output;
    }

    if (process.name.indexOf("Filter") !== -1) {
        return ApplyFilter(process, objs);
    } else if (process.name.indexOf("Operator") !== -1) {
        return ApplyOperator(process, objs);
    }

}

// some logical functions
function AND(...args) {
    return args.reduce((a, b) => a.map((c, i) => b[i] && c));
}

function OR(...args) {
    return args.reduce((a, b) => a.map((c, i) => b[i] || c));
}

function NOT(array) {
    return array.map((c) => !c);
}

function FULL(length, bool) {
    return [...Array(length).keys()].map(() => bool);
}

// utils functions
function clone(object) {
    return JSON.parse(JSON.stringify(object));
}

function buildRegex(str, ...options) {
    options = options.join("");
    if (str.startsWith("(?i)")) {
        str = str.substr(4);
        return new RegExp(str, 'i' + options);
    } else {
        return new RegExp(str, options);
    }
}

/****************************************** Own Libraries *******************************************************/


/**
 * OpenAPI
 * https://github.com/Peng-YM/QuanX/blob/master/Tools/OpenAPI/README.md
 */
function ENV() {
    const isQX = typeof $task !== "undefined";
    const isLoon = typeof $loon !== "undefined";
    const isSurge = typeof $httpClient !== "undefined" && !isLoon;
    const isJSBox = typeof require == "function" && typeof $jsbox != "undefined";
    const isNode = typeof require == "function" && !isJSBox;
    const isRequest = typeof $request !== "undefined";
    const isScriptable = typeof importModule !== "undefined";
    return {isQX, isLoon, isSurge, isNode, isJSBox, isRequest, isScriptable};
}

function HTTP(defaultOptions = {baseURL: ""}) {
    const {isQX, isLoon, isSurge, isScriptable, isNode} = ENV();
    const methods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"];
    const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/

    function send(method, options) {
        options = typeof options === "string" ? {url: options} : options;
        const baseURL = defaultOptions.baseURL;
        if (baseURL && !URL_REGEX.test(options.url || "")) {
            options.url = baseURL ? baseURL + options.url : options.url;
        }
        options = {...defaultOptions, ...options};
        const timeout = options.timeout;
        const events = {
            ...{
                onRequest: () => {
                },
                onResponse: (resp) => resp,
                onTimeout: () => {
                },
            },
            ...options.events,
        };

        events.onRequest(method, options);

        let worker;
        if (isQX) {
            worker = $task.fetch({method, url: options.url, headers: options.headers, body: options.body});
        } else if (isLoon || isSurge || isNode) {
            worker = new Promise((resolve, reject) => {
                const request = isNode ? require("request") : $httpClient;
                request[method.toLowerCase()](options, (err, response, body) => {
                    if (err) reject(err);
                    else
                        resolve({
                            statusCode: response.status || response.statusCode,
                            headers: response.headers,
                            body,
                        });
                });
            });
        } else if (isScriptable) {
            const request = new Request(options.url);
            request.method = method;
            request.headers = options.headers;
            request.body = options.body;
            worker = new Promise((resolve, reject) => {
                request
                    .loadString()
                    .then((body) => {
                        resolve({
                            statusCode: request.response.statusCode,
                            headers: request.response.headers,
                            body,
                        });
                    })
                    .catch((err) => reject(err));
            });
        }

        let timeoutid;
        const timer = timeout
            ? new Promise((_, reject) => {
                timeoutid = setTimeout(() => {
                    events.onTimeout();
                    return reject(
                        `${method} URL: ${options.url} exceeds the timeout ${timeout} ms`
                    );
                }, timeout);
            })
            : null;

        return (timer
                ? Promise.race([timer, worker]).then((res) => {
                    clearTimeout(timeoutid);
                    return res;
                })
                : worker
        ).then((resp) => events.onResponse(resp));
    }

    const http = {};
    methods.forEach(
        (method) =>
            (http[method.toLowerCase()] = (options) => send(method, options))
    );
    return http;
}

function API(name = "untitled", debug = false) {
    const {isQX, isLoon, isSurge, isNode, isJSBox, isScriptable} = ENV();
    return new (class {
        constructor(name, debug) {
            this.name = name;
            this.debug = debug;

            this.http = HTTP();
            this.env = ENV();

            this.node = (() => {
                if (isNode) {
                    const fs = require("fs");

                    return {
                        fs,
                    };
                } else {
                    return null;
                }
            })();
            this.initCache();

            const delay = (t, v) =>
                new Promise(function (resolve) {
                    setTimeout(resolve.bind(null, v), t);
                });

            Promise.prototype.delay = function (t) {
                return this.then(function (v) {
                    return delay(t, v);
                });
            };
        }

        // persistence
        // initialize cache
        initCache() {
            if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}");
            if (isLoon || isSurge)
                this.cache = JSON.parse($persistentStore.read(this.name) || "{}");

            if (isNode) {
                // create a json for root cache
                let fpath = "root.json";
                if (!this.node.fs.existsSync(fpath)) {
                    this.node.fs.writeFileSync(
                        fpath,
                        JSON.stringify({}),
                        {flag: "wx"},
                        (err) => console.log(err)
                    );
                }
                this.root = {};

                // create a json file with the given name if not exists
                fpath = `${this.name}.json`;
                if (!this.node.fs.existsSync(fpath)) {
                    this.node.fs.writeFileSync(
                        fpath,
                        JSON.stringify({}),
                        {flag: "wx"},
                        (err) => console.log(err)
                    );
                    this.cache = {};
                } else {
                    this.cache = JSON.parse(
                        this.node.fs.readFileSync(`${this.name}.json`)
                    );
                }
            }
        }

        // store cache
        persistCache() {
            const data = JSON.stringify(this.cache, null, 2);
            if (isQX) $prefs.setValueForKey(data, this.name);
            if (isLoon || isSurge) $persistentStore.write(data, this.name);
            if (isNode) {
                this.node.fs.writeFileSync(
                    `${this.name}.json`,
                    data,
                    {flag: "w"},
                    (err) => console.log(err)
                );
                this.node.fs.writeFileSync(
                    "root.json",
                    JSON.stringify(this.root, null, 2),
                    {flag: "w"},
                    (err) => console.log(err)
                );
            }
        }

        write(data, key) {
            this.log(`SET ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isSurge || isLoon) {
                    return $persistentStore.write(data, key);
                }
                if (isQX) {
                    return $prefs.setValueForKey(data, key);
                }
                if (isNode) {
                    this.root[key] = data;
                }
            } else {
                this.cache[key] = data;
            }
            this.persistCache();
        }

        read(key) {
            this.log(`READ ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isSurge || isLoon) {
                    return $persistentStore.read(key);
                }
                if (isQX) {
                    return $prefs.valueForKey(key);
                }
                if (isNode) {
                    return this.root[key];
                }
            } else {
                return this.cache[key];
            }
        }

        delete(key) {
            this.log(`DELETE ${key}`);
            if (key.indexOf("#") !== -1) {
                key = key.substr(1);
                if (isSurge || isLoon) {
                    return $persistentStore.write(null, key);
                }
                if (isQX) {
                    return $prefs.removeValueForKey(key);
                }
                if (isNode) {
                    delete this.root[key];
                }
            } else {
                delete this.cache[key];
            }
            this.persistCache();
        }

        // notification
        notify(title, subtitle = "", content = "", options = {}) {
            const openURL = options["open-url"];
            const mediaURL = options["media-url"];

            if (isQX) $notify(title, subtitle, content, options);
            if (isSurge) {
                $notification.post(
                    title,
                    subtitle,
                    content + `${mediaURL ? "\n多媒体:" + mediaURL : ""}`,
                    {
                        url: openURL,
                    }
                );
            }
            if (isLoon) {
                let opts = {};
                if (openURL) opts["openUrl"] = openURL;
                if (mediaURL) opts["mediaUrl"] = mediaURL;
                if (JSON.stringify(opts) === "{}") {
                    $notification.post(title, subtitle, content);
                } else {
                    $notification.post(title, subtitle, content, opts);
                }
            }
            if (isNode || isScriptable) {
                const content_ =
                    content +
                    (openURL ? `\n点击跳转: ${openURL}` : "") +
                    (mediaURL ? `\n多媒体: ${mediaURL}` : "");
                if (isJSBox) {
                    const push = require("push");
                    push.schedule({
                        title: title,
                        body: (subtitle ? subtitle + "\n" : "") + content_,
                    });
                } else {
                    console.log(`${title}\n${subtitle}\n${content_}\n\n`);
                }
            }
        }

        // other helper functions
        log(msg) {
            if (this.debug) console.log(`[${this.name}] LOG: ${msg}`);
        }

        info(msg) {
            console.log(`[${this.name}] INFO: ${msg}`);
        }

        error(msg) {
            console.log(`[${this.name}] ERROR: ${msg}`);
        }

        wait(millisec) {
            return new Promise((resolve) => setTimeout(resolve, millisec));
        }

        done(value = {}) {
            if (isQX || isLoon || isSurge) {
                $done(value);
            } else if (isNode && !isJSBox) {
                if (typeof $context !== "undefined") {
                    $context.headers = value.headers;
                    $context.statusCode = value.statusCode;
                    $context.body = value.body;
                }
            }
        }
    })(name, debug);
}

/**
 * Gist backup
 */
function Gist({token, key}) {
    const http = HTTP({
        baseURL: "https://api.github.com",
        headers: {
            Authorization: `token ${token}`,
            "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36",
        },
        events: {
            onResponse: (resp) => {
                if (/^[45]/.test(String(resp.statusCode))) {
                    return Promise.reject(`ERROR: ${JSON.parse(resp.body).message}`);
                } else {
                    return resp;
                }
            },
        },
    });

    async function locate() {
        return http.get("/gists").then((response) => {
            const gists = JSON.parse(response.body);
            for (let g of gists) {
                if (g.description === key) {
                    return g.id;
                }
            }
            return -1;
        });
    }

    this.upload = async function ({filename, content}) {
        const id = await locate();
        const files = {
            [filename]: {content}
        };

        if (id === -1) {
            // create a new gist for backup
            return http.post({
                url: "/gists",
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
                body: JSON.stringify({files})
            });
        }
    };

    this.download = async function (filename) {
        const id = await locate();
        if (id === -1) {
            return Promise.reject("未找到Gist备份！");
        } else {
            try {
                const {files} = await http
                    .get(`/gists/${id}`)
                    .then(resp => JSON.parse(resp.body));
                const url = files[filename].raw_url;
                return await http.get(url).then(resp => resp.body);
            } catch (err) {
                return Promise.reject(err);
            }
        }
    };
}

/**
 * Mini Express Framework
 * https://github.com/Peng-YM/QuanX/blob/master/Tools/OpenAPI/Express.js
 */
function express({port} = {port: 3000}) {
    const {isNode} = ENV();
    const DEFAULT_HEADERS = {
        "Content-Type": "text/plain;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS,PATCH,PUT,DELETE",
        "Access-Control-Allow-Headers":
            "Origin, X-Requested-With, Content-Type, Accept",
    };

    // node support
    if (isNode) {
        const express_ = require("express");
        const bodyParser = require("body-parser");
        const app = express_();
        app.use(bodyParser.json({verify: rawBodySaver}));
        app.use(bodyParser.urlencoded({verify: rawBodySaver, extended: true}));
        app.use(bodyParser.raw({verify: rawBodySaver, type: "*/*"}));
        app.use((req, res, next) => {
            res.set(DEFAULT_HEADERS);
            next();
        });

        // adapter
        app.start = () => {
            app.listen(port, () => {
                $.log(`Express started on port: ${port}`);
            });
        };
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
        if (/json/i.test(headers["Content-Type"])) {
            body = JSON.parse(body);
        }

        method = method.toUpperCase();
        const {path, query} = extractURL(url);

        // pattern match
        let handler = null;
        let i;
        let longestMatchedPattern = 0;
        for (i = start; i < handlers.length; i++) {
            if (handlers[i].method === "ALL" || method === handlers[i].method) {
                const {pattern} = handlers[i];
                if (patternMatched(pattern, path)) {
                    if (pattern.split("/").length > longestMatchedPattern) {
                        handler = handlers[i];
                        longestMatchedPattern = pattern.split("/").length;
                    }
                }
            }
        }
        if (handler) {
            // dispatch to next handler
            const next = () => {
                dispatch(method, url, i);
            };
            const req = {
                method,
                url,
                path,
                query,
                params: extractPathParams(handler.pattern, path),
                headers,
                body,
            };
            const res = Response();
            const cb = handler.callback;

            const errFunc = err => {
                res.status(500).json({
                    status: "failed",
                    message: `Internal Server Error: ${err}`,
                });
            }

            if (cb.constructor.name === 'AsyncFunction') {
                cb(req, res, next).catch(errFunc);
            } else {
                try {
                    cb(req, res, next);
                } catch (err) {
                    errFunc(err);
                }
            }
        } else {
            // no route, return 404
            const res = Response();
            res.status(404).json({
                status: "failed",
                message: "ERROR: 404 not found",
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
            req.rawBody = buf.toString(encoding || "utf8");
        }
    }

    function Response() {
        let statusCode = 200;
        const {isQX, isLoon, isSurge} = ENV();
        const headers = DEFAULT_HEADERS;
        const STATUS_CODE_MAP = {
            200: "HTTP/1.1 200 OK",
            201: "HTTP/1.1 201 Created",
            302: "HTTP/1.1 302 Found",
            307: "HTTP/1.1 307 Temporary Redirect",
            308: "HTTP/1.1 308 Permanent Redirect",
            404: "HTTP/1.1 404 Not Found",
            500: "HTTP/1.1 500 Internal Server Error",
        };
        return new (class {
            status(code) {
                statusCode = code;
                return this;
            }

            send(body = "") {
                const response = {
                    status: isQX ? STATUS_CODE_MAP[statusCode] : statusCode,
                    body,
                    headers,
                };
                if (isQX) {
                    $done(response);
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

/****************************************** Third Party Libraries **********************************************/

/**
 * Base64 Coding Library
 * https://github.com/dankogai/js-base64#readme
 */
function Base64Code() {
    // constants
    const b64chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const b64tab = (function (bin) {
        const t = {};
        let i = 0;
        const l = bin.length;
        for (; i < l; i++) t[bin.charAt(i)] = i;
        return t;
    })(b64chars);
    const fromCharCode = String.fromCharCode;
    // encoder stuff
    const cb_utob = function (c) {
        let cc;
        if (c.length < 2) {
            cc = c.charCodeAt(0);
            return cc < 0x80
                ? c
                : cc < 0x800
                    ? fromCharCode(0xc0 | (cc >>> 6)) + fromCharCode(0x80 | (cc & 0x3f))
                    : fromCharCode(0xe0 | ((cc >>> 12) & 0x0f)) +
                    fromCharCode(0x80 | ((cc >>> 6) & 0x3f)) +
                    fromCharCode(0x80 | (cc & 0x3f));
        } else {
            cc =
                0x10000 +
                (c.charCodeAt(0) - 0xd800) * 0x400 +
                (c.charCodeAt(1) - 0xdc00);
            return (
                fromCharCode(0xf0 | ((cc >>> 18) & 0x07)) +
                fromCharCode(0x80 | ((cc >>> 12) & 0x3f)) +
                fromCharCode(0x80 | ((cc >>> 6) & 0x3f)) +
                fromCharCode(0x80 | (cc & 0x3f))
            );
        }
    };
    const re_utob = /[\uD800-\uDBFF][\uDC00-\uDFFFF]|[^\x00-\x7F]/g;
    const utob = function (u) {
        return u.replace(re_utob, cb_utob);
    };
    const cb_encode = function (ccc) {
        const padlen = [0, 2, 1][ccc.length % 3],
            ord =
                (ccc.charCodeAt(0) << 16) |
                ((ccc.length > 1 ? ccc.charCodeAt(1) : 0) << 8) |
                (ccc.length > 2 ? ccc.charCodeAt(2) : 0),
            chars = [
                b64chars.charAt(ord >>> 18),
                b64chars.charAt((ord >>> 12) & 63),
                padlen >= 2 ? "=" : b64chars.charAt((ord >>> 6) & 63),
                padlen >= 1 ? "=" : b64chars.charAt(ord & 63),
            ];
        return chars.join("");
    };
    const btoa = function (b) {
        return b.replace(/[\s\S]{1,3}/g, cb_encode);
    };
    this.encode = function (u) {
        const isUint8Array =
            Object.prototype.toString.call(u) === "[object Uint8Array]";
        return isUint8Array ? u.toString("base64") : btoa(utob(String(u)));
    };
    const uriencode = function (u, urisafe) {
        return !urisafe
            ? _encode(u)
            : _encode(String(u))
                .replace(/[+\/]/g, function (m0) {
                    return m0 === "+" ? "-" : "_";
                })
                .replace(/=/g, "");
    };
    const encodeURI = function (u) {
        return uriencode(u, true);
    };
    // decoder stuff
    const re_btou = /[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}|[\xF0-\xF7][\x80-\xBF]{3}/g;
    const cb_btou = function (cccc) {
        switch (cccc.length) {
            case 4:
                const cp =
                    ((0x07 & cccc.charCodeAt(0)) << 18) |
                    ((0x3f & cccc.charCodeAt(1)) << 12) |
                    ((0x3f & cccc.charCodeAt(2)) << 6) |
                    (0x3f & cccc.charCodeAt(3)),
                    offset = cp - 0x10000;
                return (
                    fromCharCode((offset >>> 10) + 0xd800) +
                    fromCharCode((offset & 0x3ff) + 0xdc00)
                );
            case 3:
                return fromCharCode(
                    ((0x0f & cccc.charCodeAt(0)) << 12) |
                    ((0x3f & cccc.charCodeAt(1)) << 6) |
                    (0x3f & cccc.charCodeAt(2))
                );
            default:
                return fromCharCode(
                    ((0x1f & cccc.charCodeAt(0)) << 6) | (0x3f & cccc.charCodeAt(1))
                );
        }
    };
    const btou = function (b) {
        return b.replace(re_btou, cb_btou);
    };
    const cb_decode = function (cccc) {
        const len = cccc.length,
            padlen = len % 4,
            n =
                (len > 0 ? b64tab[cccc.charAt(0)] << 18 : 0) |
                (len > 1 ? b64tab[cccc.charAt(1)] << 12 : 0) |
                (len > 2 ? b64tab[cccc.charAt(2)] << 6 : 0) |
                (len > 3 ? b64tab[cccc.charAt(3)] : 0),
            chars = [
                fromCharCode(n >>> 16),
                fromCharCode((n >>> 8) & 0xff),
                fromCharCode(n & 0xff),
            ];
        chars.length -= [0, 0, 2, 1][padlen];
        return chars.join("");
    };
    const _atob = function (a) {
        return a.replace(/\S{1,4}/g, cb_decode);
    };
    const atob = function (a) {
        return _atob(String(a).replace(/[^A-Za-z0-9\+\/]/g, ""));
    };
    const _decode = function (u) {
        return btou(_atob(u));
    };
    this.decode = function (a) {
        return _decode(
            String(a)
                .replace(/[-_]/g, function (m0) {
                    return m0 === "-" ? "+" : "/";
                })
                .replace(/[^A-Za-z0-9\+\/]/g, "")
        )
            .replace(/&gt;/g, ">")
            .replace(/&lt;/g, "<");
    };
    this.safeEncode = function (a) {
        return this.encode(a.replace(/\+/g, "-").replace(/\//g, "_"));
    };
    this.safeDecode = function (a) {
        return this.decode(a.replace(/-/g, "+").replace(/_/g, "/"));
    };
}

/**
 * YAML parser for Javascript
 * Author: Diogo Costa
 */
var YAML = (function () {
    var errors = [],
        reference_blocks = [],
        processing_time = 0,
        regex = {
            regLevel: new RegExp("^([\\s\\-]+)"),
            invalidLine: new RegExp("^\\-\\-\\-|^\\.\\.\\.|^\\s*#.*|^\\s*$"),
            dashesString: new RegExp('^\\s*\\"([^\\"]*)\\"\\s*$'),
            quotesString: new RegExp("^\\s*\\'([^\\']*)\\'\\s*$"),
            float: new RegExp("^[+-]?[0-9]+\\.[0-9]+(e[+-]?[0-9]+(\\.[0-9]+)?)?$"),
            integer: new RegExp("^[+-]?[0-9]+$"),
            array: new RegExp("\\[\\s*(.*)\\s*\\]"),
            map: new RegExp("\\{\\s*(.*)\\s*\\}"),
            key_value: new RegExp("([a-z0-9_-][ a-z0-9_-]*):( .+)", "i"),
            single_key_value: new RegExp("^([a-z0-9_-][ a-z0-9_-]*):( .+?)$", "i"),
            key: new RegExp("([a-z0-9_-][ a-z0-9_-]*):( .+)?", "i"),
            item: new RegExp("^-\\s+"),
            trim: new RegExp("^\\s+|\\s+$"),
            comment: new RegExp(
                "([^\\'\\\"#]+([\\'\\\"][^\\'\\\"]*[\\'\\\"])*)*(#.*)?"
            ),
        };

    /**
     * @class A block of lines of a given level.
     * @param {int} lvl The block's level.
     * @private
     */
    function Block(lvl) {
        return {
            /* The block's parent */
            parent: null,
            /* Number of children */
            length: 0,
            /* Block's level */
            level: lvl,
            /* Lines of code to process */
            lines: [],
            /* Blocks with greater level */
            children: [],
            /* Add a block to the children collection */
            addChild: function (obj) {
                this.children.push(obj);
                obj.parent = this;
                ++this.length;
            },
        };
    }

    function parser(str) {
        var regLevel = regex["regLevel"];
        var invalidLine = regex["invalidLine"];
        var lines = str.split("\n");
        var m;
        var level = 0,
            curLevel = 0;

        var blocks = [];

        var result = new Block(-1);
        var currentBlock = new Block(0);
        result.addChild(currentBlock);
        var levels = [];
        var line = "";

        blocks.push(currentBlock);
        levels.push(level);

        for (var i = 0, len = lines.length; i < len; ++i) {
            line = lines[i];

            if (line.match(invalidLine)) {
                continue;
            }

            if ((m = regLevel.exec(line))) {
                level = m[1].length;
            } else level = 0;

            if (level > curLevel) {
                var oldBlock = currentBlock;
                currentBlock = new Block(level);
                oldBlock.addChild(currentBlock);
                blocks.push(currentBlock);
                levels.push(level);
            } else if (level < curLevel) {
                var added = false;

                var k = levels.length - 1;
                for (; k >= 0; --k) {
                    if (levels[k] == level) {
                        currentBlock = new Block(level);
                        blocks.push(currentBlock);
                        levels.push(level);
                        if (blocks[k].parent != null)
                            blocks[k].parent.addChild(currentBlock);
                        added = true;
                        break;
                    }
                }

                if (!added) {
                    errors.push("Error: Invalid indentation at line " + i + ": " + line);
                    return;
                }
            }

            currentBlock.lines.push(line.replace(regex["trim"], ""));
            curLevel = level;
        }

        return result;
    }

    function processValue(val) {
        val = val.replace(regex["trim"], "");
        var m = null;

        if (val == "true") {
            return true;
        } else if (val == "false") {
            return false;
        } else if (val == ".NaN") {
            return Number.NaN;
        } else if (val == "null") {
            return null;
        } else if (val == ".inf") {
            return Number.POSITIVE_INFINITY;
        } else if (val == "-.inf") {
            return Number.NEGATIVE_INFINITY;
        } else if ((m = val.match(regex["dashesString"]))) {
            return m[1];
        } else if ((m = val.match(regex["quotesString"]))) {
            return m[1];
        } else if ((m = val.match(regex["float"]))) {
            return parseFloat(m[0]);
        } else if ((m = val.match(regex["integer"]))) {
            return parseInt(m[0]);
        } else if (!isNaN((m = Date.parse(val)))) {
            return new Date(m);
        } else if ((m = val.match(regex["single_key_value"]))) {
            var res = {};
            res[m[1]] = processValue(m[2]);
            return res;
        } else if ((m = val.match(regex["array"]))) {
            var count = 0,
                c = " ";
            var res = [];
            var content = "";
            var str = false;
            for (var j = 0, lenJ = m[1].length; j < lenJ; ++j) {
                c = m[1][j];
                if (c == "'" || c == '"') {
                    if (str === false) {
                        str = c;
                        content += c;
                        continue;
                    } else if ((c == "'" && str == "'") || (c == '"' && str == '"')) {
                        str = false;
                        content += c;
                        continue;
                    }
                } else if (str === false && (c == "[" || c == "{")) {
                    ++count;
                } else if (str === false && (c == "]" || c == "}")) {
                    --count;
                } else if (str === false && count == 0 && c == ",") {
                    res.push(processValue(content));
                    content = "";
                    continue;
                }

                content += c;
            }

            if (content.length > 0) res.push(processValue(content));
            return res;
        } else if ((m = val.match(regex["map"]))) {
            var count = 0,
                c = " ";
            var res = [];
            var content = "";
            var str = false;
            for (var j = 0, lenJ = m[1].length; j < lenJ; ++j) {
                c = m[1][j];
                if (c == "'" || c == '"') {
                    if (str === false) {
                        str = c;
                        content += c;
                        continue;
                    } else if ((c == "'" && str == "'") || (c == '"' && str == '"')) {
                        str = false;
                        content += c;
                        continue;
                    }
                } else if (str === false && (c == "[" || c == "{")) {
                    ++count;
                } else if (str === false && (c == "]" || c == "}")) {
                    --count;
                } else if (str === false && count == 0 && c == ",") {
                    res.push(content);
                    content = "";
                    continue;
                }

                content += c;
            }

            if (content.length > 0) res.push(content);

            var newRes = {};
            for (var j = 0, lenJ = res.length; j < lenJ; ++j) {
                if ((m = res[j].match(regex["key_value"]))) {
                    newRes[m[1]] = processValue(m[2]);
                }
            }

            return newRes;
        } else return val;
    }

    function processFoldedBlock(block) {
        var lines = block.lines;
        var children = block.children;
        var str = lines.join(" ");
        var chunks = [str];
        for (var i = 0, len = children.length; i < len; ++i) {
            chunks.push(processFoldedBlock(children[i]));
        }
        return chunks.join("\n");
    }

    function processLiteralBlock(block) {
        var lines = block.lines;
        var children = block.children;
        var str = lines.join("\n");
        for (var i = 0, len = children.length; i < len; ++i) {
            str += processLiteralBlock(children[i]);
        }
        return str;
    }

    function processBlock(blocks) {
        var m = null;
        var res = {};
        var lines = null;
        var children = null;
        var currentObj = null;

        var level = -1;

        var processedBlocks = [];

        var isMap = true;

        for (var j = 0, lenJ = blocks.length; j < lenJ; ++j) {
            if (level != -1 && level != blocks[j].level) continue;

            processedBlocks.push(j);

            level = blocks[j].level;
            lines = blocks[j].lines;
            children = blocks[j].children;
            currentObj = null;

            for (var i = 0, len = lines.length; i < len; ++i) {
                var line = lines[i];

                if ((m = line.match(regex["key"]))) {
                    var key = m[1];

                    if (key[0] == "-") {
                        key = key.replace(regex["item"], "");
                        if (isMap) {
                            isMap = false;
                            if (typeof res.length === "undefined") {
                                res = [];
                            }
                        }
                        if (currentObj != null) res.push(currentObj);
                        currentObj = {};
                        isMap = true;
                    }

                    if (typeof m[2] != "undefined") {
                        var value = m[2].replace(regex["trim"], "");
                        if (value[0] == "&") {
                            var nb = processBlock(children);
                            if (currentObj != null) currentObj[key] = nb;
                            else res[key] = nb;
                            reference_blocks[value.substr(1)] = nb;
                        } else if (value[0] == "|") {
                            if (currentObj != null)
                                currentObj[key] = processLiteralBlock(children.shift());
                            else res[key] = processLiteralBlock(children.shift());
                        } else if (value[0] == "*") {
                            var v = value.substr(1);
                            var no = {};

                            if (typeof reference_blocks[v] == "undefined") {
                                errors.push("Reference '" + v + "' not found!");
                            } else {
                                for (var k in reference_blocks[v]) {
                                    no[k] = reference_blocks[v][k];
                                }

                                if (currentObj != null) currentObj[key] = no;
                                else res[key] = no;
                            }
                        } else if (value[0] == ">") {
                            if (currentObj != null)
                                currentObj[key] = processFoldedBlock(children.shift());
                            else res[key] = processFoldedBlock(children.shift());
                        } else {
                            if (currentObj != null) currentObj[key] = processValue(value);
                            else res[key] = processValue(value);
                        }
                    } else {
                        if (currentObj != null) currentObj[key] = processBlock(children);
                        else res[key] = processBlock(children);
                    }
                } else if (line.match(/^-\s*$/)) {
                    if (isMap) {
                        isMap = false;
                        if (typeof res.length === "undefined") {
                            res = [];
                        }
                    }
                    if (currentObj != null) res.push(currentObj);
                    currentObj = {};
                    isMap = true;
                } else if ((m = line.match(/^-\s*(.*)/))) {
                    if (currentObj != null) currentObj.push(processValue(m[1]));
                    else {
                        if (isMap) {
                            isMap = false;
                            if (typeof res.length === "undefined") {
                                res = [];
                            }
                        }
                        res.push(processValue(m[1]));
                    }
                }
            }

            if (currentObj != null) {
                if (isMap) {
                    isMap = false;
                    if (typeof res.length === "undefined") {
                        res = [];
                    }
                }
                res.push(currentObj);
            }
        }

        for (var j = processedBlocks.length - 1; j >= 0; --j) {
            blocks.splice.call(blocks, processedBlocks[j], 1);
        }

        return res;
    }

    function semanticAnalysis(blocks) {
        var res = processBlock(blocks.children);
        return res;
    }

    function preProcess(src) {
        var m;
        var lines = src.split("\n");

        var r = regex["comment"];

        for (var i in lines) {
            if ((m = typeof lines[i] === "string" && lines[i].match(r))) {
                /*                var cmt = "";
                                            if(typeof m[3] != "undefined")
                                                lines[i] = m[1];
                                            else if(typeof m[3] != "undefined")
                                                lines[i] = m[3];
                                            else
                                                lines[i] = "";
                                                */
                if (typeof m[3] !== "undefined") {
                    lines[i] = m[0].substr(0, m[0].length - m[3].length);
                }
            }
        }

        return lines.join("\n");
    }

    function eval(str) {
        errors = [];
        reference_blocks = [];
        processing_time = new Date().getTime();
        var pre = preProcess(str);
        var doc = parser(pre);
        var res = semanticAnalysis(doc);
        processing_time = new Date().getTime() - processing_time;

        return res;
    }

    return {
        /**
         * Parse a YAML file from a string.
         * @param {String} str String with the YAML file contents.
         * @function
         */
        eval: eval,

        /**
         * Get errors found when parsing the last file.
         * @function
         * @returns Errors found when parsing the last file.
         */
        getErrors: function () {
            return errors;
        },

        /**
         * Get the time it took to parse the last file.
         * @function
         * @returns Time in milliseconds.
         */
        getProcessingTime: function () {
            return processing_time;
        },
    };
})();