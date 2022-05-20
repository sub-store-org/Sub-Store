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
const $downloader = new ResourceDownloader();

service();

/****************************************** Service **********************************************************/

function service() {
    console.log(
        `
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
            𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 © 𝑷𝒆𝒏𝒈-𝒀𝑴
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅
`
    );
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

    $.write(
        {
            rules: getBuiltInRules(),
        },
        BUILT_IN_KEY
    );

    // download
    $app.get("/download/collection/:name", downloadCollection);
    $app.get("/download/:name", downloadSubscription);

    // subscription API
    $app
        .route("/api/sub/:name")
        .get(getSubscription)
        .patch(updateSubscription)
        .delete(deleteSubscription);

    $app.route("/api/subs").get(getAllSubscriptions).post(createSubscription);

    $app.get("/api/sub/statistics/:name");

    // collection API
    $app
        .route("/api/collection/:name")
        .get(getCollection)
        .patch(updateCollection)
        .delete(deleteCollection);

    $app.route("/api/collections").get(getAllCollections).post(createCollection);

    // rules API
    $app.get("/download/rule/:name", downloadRule);
    $app.route("/api/rules").post(createRule).get(getAllRules);
    $app
        .route("/api/rule/:name")
        .patch(updateRule)
        .delete(deleteRule)
        .get(getRule);

    // Storage management
    $app
        .route("/api/storage")
        .get((req, res) => {
            res.json($.read("#sub-store"));
        })
        .post((req, res) => {
            const data = req.body;
            $.write(JSON.stringify(data), "#sub-store");
            res.end();
        });

    // Settings
    $app.route("/api/settings").get(getSettings).patch(updateSettings);

    // Artifacts
    $app.route("/api/artifacts").get(getAllArtifacts).post(createArtifact);

    $app
        .route("/api/artifact/:name")
        .get(getArtifact)
        .patch(updateArtifact)
        .delete(deleteArtifact);

    // utils
    $app.get("/api/utils/IP_API/:server", IP_API); // IP-API reverse proxy
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
        const platform =
            req.query.target || getPlatformFromHeaders(req.headers) || "JSON";

        $.info(`正在下载订阅：${name}`);

        const allSubs = $.read(SUBS_KEY);
        const sub = allSubs[name];
        if (sub) {
            try {
                const output = await produceArtifact({
                    type: "subscription",
                    item: sub,
                    platform,
                    noProcessor: raw,
                });

                // forward flow headers
                const flowInfo = await getFlowHeaders(sub.url);
                if (flowInfo) {
                    res.set("subscription-userinfo", flowInfo);
                }

                if (platform === "JSON") {
                    res
                        .set("Content-Type", "application/json;charset=utf-8")
                        .send(output);
                } else {
                    res.send(output);
                }
            } catch (err) {
                $.notify(
                    `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`,
                    `❌ 无法下载订阅：${name}！`,
                    `🤔 原因：${JSON.stringify(err)}`
                );
                $.error(JSON.stringify(err));
                res.status(500).json({
                    status: "failed",
                    message: err,
                });
            }
        } else {
            $.notify(`🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`, `❌ 未找到订阅：${name}！`);
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
        const {raw} = req.query || "false";
        const platform =
            req.query.target || getPlatformFromHeaders(req.headers) || "JSON";

        const allCollections = $.read(COLLECTIONS_KEY);
        const collection = allCollections[name];

        $.info(`正在下载组合订阅：${name}`);

        // forward flow header from the first subscription in this collection
        const allSubs = $.read(SUBS_KEY);
        const subs = collection["subscriptions"];
        if (subs.length > 0) {
            const sub = allSubs[subs[0]];
            const flowInfo = await getFlowHeaders(sub.url);
            if (flowInfo) {
                res.set("subscription-userinfo", flowInfo);
            }
        }

        if (collection) {
            try {
                const output = await produceArtifact({
                    type: "collection",
                    item: collection,
                    platform,
                    noProcessor: raw,
                });
                if (platform === "JSON") {
                    res
                        .set("Content-Type", "application/json;charset=utf-8")
                        .send(output);
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
                `❌ 未找到组合订阅：${name}！`
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
        const platform =
            req.query.target || getPlatformFromHeaders(req.headers) || "Surge";

        $.info(`正在下载${builtin ? "内置" : ""}分流订阅：${name}...`);

        let rule;
        if (builtin) {
            rule = $.read(BUILT_IN_KEY)["rules"][name];
        }
        if (rule) {
            const output = await produceArtifact({
                type: "rule",
                item: rule,
                platform,
            });
            res.send(output);
        } else {
            // rule not found
            $.notify(
                `🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载分流订阅失败`,
                `❌ 未找到分流订阅：${name}！`
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
        $.write(
            {
                ...settings,
                ...data,
            },
            SETTINGS_KEY
        );
        res.json({
            status: "success",
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
                    case "subscription":
                        item = $.read(SUBS_KEY)[artifact.source];
                        break;
                    case "collection":
                        item = $.read(COLLECTIONS_KEY)[artifact.source];
                        break;
                    case "rule":
                        item = $.read(RULES_KEY)[artifact.source];
                        break;
                }
                const output = await produceArtifact({
                    type: artifact.type,
                    item,
                    platform: artifact.platform,
                });
                if (action === "preview") {
                    res.send(output);
                } else if (action === "sync") {
                    $.info(`正在上传配置：${artifact.name}\n>>>`);
                    console.log(JSON.stringify(artifact, null, 2));
                    try {
                        const resp = await syncArtifact({
                            [artifact.name]: {content: output},
                        });
                        artifact.updated = new Date().getTime();
                        const body = JSON.parse(resp.body);
                        artifact.url = body.files[artifact.name].raw_url.replace(
                            /\/raw\/[^\/]*\/(.*)/,
                            "/raw/$1"
                        );
                        $.write(allArtifacts, ARTIFACTS_KEY);
                        res.json({
                            status: "success",
                        });
                    } catch (err) {
                        res.status(500).json({
                            status: "failed",
                            message: err,
                        });
                    }
                }
            } else {
                res.json({
                    status: "success",
                    data: artifact,
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
                    data: artifact,
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
            if (
                typeof newArtifact.name !== "undefined" &&
                !/^[\w-_.]*$/.test(newArtifact.name)
            ) {
                res.status(500).json({
                    status: "failed",
                    message: `远程配置名称 ${newArtifact.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`,
                });
            } else {
                const merged = {
                    ...artifact,
                    ...newArtifact,
                };
                allArtifacts[merged.name] = merged;
                if (merged.name !== oldName) delete allArtifacts[oldName];
                $.write(allArtifacts, ARTIFACTS_KEY);
                res.json({
                    status: "success",
                    data: merged,
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
        const files = {};

        try {
            await Promise.all(Object.values(allArtifacts).map(async artifact => {
                if (artifact.sync) {
                    $.info(`正在同步云配置：${artifact.name}...`);
                    let item;
                    switch (artifact.type) {
                        case "subscription":
                            item = $.read(SUBS_KEY)[artifact.source];
                            break;
                        case "collection":
                            item = $.read(COLLECTIONS_KEY)[artifact.source];
                            break;
                        case "rule":
                            item = $.read(RULES_KEY)[artifact.source];
                            break;
                    }
                    const output = await produceArtifact({
                        type: artifact.type,
                        item,
                        platform: artifact.platform
                    });

                    files[artifact.name] = {
                        content: output
                    };
                }
            }));

            const resp = await syncArtifact(files);
            const body = JSON.parse(resp.body);

            for (const artifact of Object.values(allArtifacts)) {
                artifact.updated = new Date().getTime();
                // extract real url from gist
                artifact.url = body.files[artifact.name].raw_url.replace(
                    /\/raw\/[^\/]*\/(.*)/,
                    "/raw/$1"
                );
            }

            $.write(allArtifacts, ARTIFACTS_KEY);
            $.info("全部订阅同步成功！")
            res.status(200).end();
        } catch (err) {
            res.status(500).json({
                error: err
            });
            $.info(`同步订阅失败，原因：${err}`);
        }
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
                    content: "",
                });
            }
            // delete local cache
            delete allArtifacts[name];
            $.write(allArtifacts, ARTIFACTS_KEY);
            res.json({
                status: "success",
            });
        } catch (err) {
            // delete local cache
            delete allArtifacts[name];
            $.write(allArtifacts, ARTIFACTS_KEY);
            res.status(500).json({
                status: "failed",
                message: `无法删除远程配置：${name}, 原因：${err}`,
            });
        }
    }

    function getAllArtifacts(req, res) {
        const allArtifacts = $.read(ARTIFACTS_KEY);
        res.json({
            status: "success",
            data: allArtifacts,
        });
    }

    async function syncArtifact(files) {
        const {gistToken} = $.read(SETTINGS_KEY);
        if (!gistToken) {
            return Promise.reject("未设置Gist Token！");
        }
        const manager = new Gist({
            token: gistToken,
            key: ARTIFACT_REPOSITORY_KEY,
        });
        return manager.upload(files);
    }

    // util API
    async function IP_API(req, res) {
        const server = decodeURIComponent(req.params.server);
        const result = await $.http
            .get(`http://ip-api.com/json/${server}?lang=zh-CN`)
            .then((resp) => JSON.parse(resp.body));
        res.json(result);
    }

    async function getFlowHeaders(url) {
        const {headers} = await $.http.get({
            url,
            headers: {
                "User-Agent": "Quantumult/1.0.13 (iPhone10,3; iOS 14.0)",
            },
        });
        const subkey = Object.keys(headers).filter((k) =>
            /SUBSCRIPTION-USERINFO/i.test(k)
        )[0];
        return headers[subkey];
    }

    function getEnv(req, res) {
        const {isNode, isQX, isLoon, isSurge} = ENV();
        let backend = "Node";
        if (isNode) backend = "Node";
        if (isQX) backend = "QX";
        if (isLoon) backend = "Loon";
        if (isSurge) backend = "Surge";
        res.json({
            backend,
        });
    }

    async function gistBackup(req, res) {
        const {action} = req.query;
        // read token
        const {gistToken} = $.read(SETTINGS_KEY);
        if (!gistToken) {
            res.status(500).json({
                status: "failed",
                message: "未找到Gist备份Token!",
            });
        } else {
            const gist = new Gist({
                token: gistToken,
                key: GIST_BACKUP_KEY,
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
                        if ($.env.isNode) content = JSON.stringify($.cache, null, `  `)
                        $.info(`上传备份中...`);
                        await gist.upload({[GIST_BACKUP_FILE_NAME]: { content }});
                        break;
                    case "download":
                        $.info(`还原备份中...`);
                        content = await gist.download(GIST_BACKUP_FILE_NAME);
                        // restore settings
                        $.write(content, "#sub-store");
                        if ($.env.isNode) {
                            content = JSON.parse(content)
                            Object.keys(content).forEach(key => {
                                $.write(content[key], key)
                            })
                        }
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
                    message: msg,
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
        } else if (UA.indexOf("Stash") !== -1 || UA.indexOf("Shadowrocket") !== -1) {
            return "Clash";
        } else {
            return null;
        }
    }

    async function produceArtifact(
        {type, item, platform, noProcessor} = {
            platform: "JSON",
            noProcessor: false,
        }
    ) {
        if (type === "subscription") {
            const sub = item;
            const raw = await $downloader.download(sub.url, sub.ua);
            // parse proxies
            let proxies = ProxyUtils.parse(raw);
            if (!noProcessor) {
                // apply processors
                proxies = await ProxyUtils.process(proxies, sub.process || [], platform);
            }
            // check duplicate
            const count = {};
            proxies.forEach(p => {
                if (count[p.name]) {
                    $.notify("🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』", "⚠️ 订阅包含重复节点！", "请仔细检测配置！", {
                        "media-url": "https://cdn3.iconfinder.com/data/icons/seo-outline-1/512/25_code_program_programming_develop_bug_search_developer-512.png"
                    });
                }
            });
            // produce
            return ProxyUtils.produce(proxies, platform);
        } else if (type === "collection") {
            const allSubs = $.read(SUBS_KEY);
            const collection = item;
            const subs = collection["subscriptions"];
            let proxies = [];

            let processed = 0;

            await Promise.all(subs.map(async name => {
                const sub = allSubs[name];
                try {
                    $.info(`正在处理子订阅：${sub.name}...`);
                    const raw = await $downloader.download(sub.url, sub.ua);
                    // parse proxies
                    let currentProxies = ProxyUtils.parse(raw);
                    if (!noProcessor) {
                        // apply processors
                        currentProxies = await ProxyUtils.process(
                            currentProxies,
                            sub.process || [],
                            platform
                        );
                    }
                    // merge
                    proxies = proxies.concat(currentProxies);
                    processed++;
                    $.info(
                        `✅ 子订阅：${sub.name}加载成功，进度--${100 * (processed / subs.length).toFixed(1)}% `
                    );
                } catch (err) {
                    processed++;
                    $.error(
                        `❌ 处理组合订阅中的子订阅: ${sub.name}时出现错误：${err}，该订阅已被跳过！进度--${100 * (processed / subs.length).toFixed(1)}%`
                    );
                }
            }));
            if (!noProcessor) {
                // apply own processors
                proxies = await ProxyUtils.process(proxies, collection.process || [], platform);
            }
            if (proxies.length === 0) {
                throw new Error(`组合订阅中不含有效节点！`);
            }
            // check duplicate
            const count = {};
            proxies.forEach(p => {
                if (count[p.name]) {
                    $.notify("🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』", "⚠️ 订阅包含重复节点！", "请仔细检测配置！", {
                        "media-url": "https://cdn3.iconfinder.com/data/icons/seo-outline-1/512/25_code_program_programming_develop_bug_search_developer-512.png"
                    });
                }
            });
            return ProxyUtils.produce(proxies, platform);
        } else if (type === "rule") {
            const rule = item;
            let rules = [];
            for (let i = 0; i < rule.urls.length; i++) {
                const url = rule.urls[i];
                $.info(
                    `正在处理URL：${url}，进度--${100 * ((i + 1) / rule.urls.length).toFixed(1)
                    }% `
                );
                try {
                    const {body} = await $downloader.download(url);
                    const currentRules = RuleUtils.parse(body);
                    rules = rules.concat(currentRules);
                } catch (err) {
                    $.error(
                        `处理分流订阅中的URL: ${url}时出现错误：${err}! 该订阅已被跳过。`
                    );
                }
            }
            // remove duplicates
            rules = await RuleUtils.process(rules, [
                {type: "Remove Duplicate Filter"},
            ]);
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
            const test = (raw) => /^<!DOCTYPE html>/.test(raw);
            // simply discard HTML
            const parse = (_) => "";
            return {name, test, parse};
        }

        function Base64Encoded() {
            const name = "Base64 Pre-processor";

            const keys = [
                "dm1lc3M",
                "c3NyOi8v",
                "dHJvamFu",
                "c3M6Ly",
                "c3NkOi8v",
                "c2hhZG93",
                "aHR0c",
            ];

            const test = function (raw) {
                return keys.some((k) => raw.indexOf(k) !== -1);
            };
            const parse = function (raw) {
                raw = Base64.safeDecode(raw);
                return raw;
            };
            return {name, test, parse};
        }

        function Clash() {
            const name = "Clash Pre-processor";
            const test = function (raw) {
                return /proxies/.test(raw);
            };
            const parse = function (raw) {
                // Clash YAML format
                const proxies = YAML.load(raw).proxies;
                return proxies.map((p) => JSON.stringify(p)).join("\n");
            };
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
                        "ss://" +
                        userinfo +
                        "@" +
                        hostname +
                        ":" +
                        port +
                        plugin +
                        "#" +
                        tag;
                }
                return output.join("\n");
            };
            return {name, test, parse};
        }

        return [HTML(), Base64Encoded(), Clash(), SSD()];
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
                const server = serverAndPort.substring(
                    0,
                    serverAndPort.lastIndexOf(":")
                );
                const port = serverAndPort.substring(
                    serverAndPort.lastIndexOf(":") + 1
                );

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
                    name: other_params.remarks
                        ? Base64.safeDecode(other_params.remarks)
                        : proxy.server,
                    "protocol-param": Base64.safeDecode(
                        other_params.protoparam || ""
                    ).replace(/\s/g, ""),
                    "obfs-param": Base64.safeDecode(other_params.obfsparam || "").replace(
                        /\s/g,
                        ""
                    ),
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

                    if (typeof params["udp-relay"] !== "undefined")
                        proxy.udp = JSON.parse(params["udp-relay"]);
                    if (typeof params["fast-open"] !== "undefined")
                        proxy.udp = JSON.parse(params["fast-open"]);

                    // handle ws headers
                    if (params.obfs === "ws" || params.obfs === "wss") {
                        proxy.network = "ws";
                        proxy["ws-opts"].path = (params["obfs-path"] || '"/"').match(
                            /^"(.*)"$/
                        )[1];
                        let obfs_host = params["obfs-header"];
                        if (obfs_host && obfs_host.indexOf("Host") !== -1) {
                            obfs_host = obfs_host.match(/Host:\s*([a-zA-Z0-9-.]*)/)[1];
                        }
                        proxy["ws-opts"].headers = {
                            Host: obfs_host || proxy.server, // if no host provided, use the same as server
                        };
                    }

                    // handle scert
                    if (proxy.tls && params['"tls-verification"'] === "false") {
                        proxy["skip-cert-verify"] = true;
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
                        proxy["ws-opts"] = {
                            path: params.path,
                            headers: {Host: params.host || params.add}
                        }
                        if (proxy.tls && params.host) {
                            proxy.sni = params.host;
                        }
                    }
                    // handle scert
                    if (params.verify_cert === false) {
                        proxy["skip-cert-verify"] = true;
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
                let paramArr = line.split("?")
                let sni = null;
                if (paramArr.length > 1) {
                    paramArr = paramArr[1].split("#")[0].split("&")
                    const params = new Map(paramArr.map((item) => {
                        return item.split("=")
                    }))
                    sni = params.get("sni")
                }

                return {
                    name: name || `[Trojan] ${server}`, // trojan uri may have no server tag!
                    type: "trojan",
                    server,
                    port,
                    password: line.split("@")[0],
                    sni,
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
                            if (
                                proxy["plugin-opts"].tls &&
                                typeof params["tls-verification"] !== "undefined"
                            ) {
                                proxy["plugin-opts"]["skip-cert-verify"] =
                                    params["tls-verification"];
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
                    proxy["skip-cert-verify"] = !JSON.parse(
                        params["tls-verification"] || "true"
                    );
                }
                // handle ws headers
                if (params.obfs === "ws" || params.obfs === "wss") {
                    proxy.network = "ws";
                    proxy["ws-opts"] = {
                        path: params["obfs-uri"],
                        headers: {
                            Host: params["obfs-host"] || params.server, // if no host provided, use the same as server
                        }
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
                proxy["skip-cert-verify"] = !JSON.parse(
                    params["tls-verification"] || "true"
                );
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
                if (params.username && params.username !== "none")
                    proxy.username = params.username;
                if (params.password && params.password !== "none")
                    proxy.password = params.password;
                if (proxy.tls) {
                    proxy.sni = params["tls-host"] || proxy.server;
                    proxy["skip-cert-verify"] = !JSON.parse(
                        params["tls-verification"] || "true"
                    );
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
                    line.split(",")[0].split("=")[1].trim().toLowerCase() ===
                    "shadowsocks"
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
                    line.split(",")[0].split("=")[1].trim().toLowerCase() ===
                    "shadowsocksr"
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
                    proxy["skip-cert-verify"] = JSON.parse(
                        params["skip-cert-verify"] || "false"
                    );
                }
                switch (params.transport) {
                    case "tcp":
                        break;
                    case "ws":
                        proxy.network = params.transport;
                        proxy["ws-opts"] = {
                            path: params.path,
                            headers: {
                                Host: params.host,
                            }
                        };
                }
                if (proxy.tls) {
                    proxy["skip-cert-verify"] = JSON.parse(
                        params["skip-cert-verify"] || "false"
                    );
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
                    proxy["skip-cert-verify"] = JSON.parse(
                        params["skip-cert-verify"] || "false"
                    );
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
                    /^.*=\s*vmess/.test(line.split(",")[0]) &&
                    line.indexOf("username") !== -1
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
                        proxy["skip-cert-verify"] =
                            params["skip-cert-verify"] === true ||
                            params["skip-cert-verify"] === "1";
                    }
                    proxy.sni = params["sni"] || params.server;
                }
                // use websocket
                if (JSON.parse(params.ws || "false")) {
                    proxy.network = "ws";
                    proxy["ws-opts"] = {
                        path: params["ws-path"]
                    };

                    const res = params["ws-headers"].match(/(,|^|\s)*HOST:\s*(.*?)(,|$)/);
                    const host = res ? res[2] : proxy.server;
                    proxy["ws-opts"].headers = {
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
                    proxy["skip-cert-verify"] =
                        params["skip-cert-verify"] === true ||
                        params["skip-cert-verify"] === "1";
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
                        proxy["skip-cert-verify"] =
                            params["skip-cert-verify"] === true ||
                            params["skip-cert-verify"] === "1";
                    }
                    proxy.sni = params.sni || params.server;
                }
                if (params.username && params.username !== "none")
                    proxy.username = params.username;
                if (params.password && params.password !== "none")
                    proxy.password = params.password;
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
            URI_SS(),
            URI_SSR(),
            URI_VMess(),
            URI_Trojan(),
            Clash_All(),
            Surge_SS(),
            Surge_VMess(),
            Surge_Trojan(),
            Surge_Http(),
            Loon_SS(),
            Loon_SSR(),
            Loon_VMess(),
            Loon_Trojan(),
            Loon_Http(),
            QX_SS(),
            QX_SSR(),
            QX_VMess(),
            QX_Trojan(),
            QX_Http(),
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

        // duplicate handler
        function HandleDuplicateOperator(arg) {
            const {action, template, link, position} = {
                ...{
                    action: "rename",
                    template: "0 1 2 3 4 5 6 7 8 9",
                    link: "-",
                    position: "back",
                },
                ...arg,
            };
            return {
                name: "Handle Duplicate Operator",
                func: (proxies) => {
                    if (action === "delete") {
                        const chosen = {};
                        return proxies.filter((p) => {
                            if (chosen[p.name]) {
                                return false;
                            }
                            chosen[p.name] = true;
                            return true;
                        });
                    } else if (action === "rename") {
                        const numbers = template.split(" ");
                        // count occurrences of each name
                        const counter = {};
                        let maxLen = 0;
                        proxies.forEach((p) => {
                            if (typeof counter[p.name] === "undefined") counter[p.name] = 1;
                            else counter[p.name]++;
                            maxLen = Math.max(counter[p.name].toString().length, maxLen);
                        });
                        const increment = {};
                        return proxies.map((p) => {
                            if (counter[p.name] > 1) {
                                if (typeof increment[p.name] == "undefined")
                                    increment[p.name] = 1;
                                let num = "";
                                let cnt = increment[p.name]++;
                                let numDigits = 0;
                                while (cnt > 0) {
                                    num = numbers[cnt % 10] + num;
                                    cnt = parseInt(cnt / 10);
                                    numDigits++;
                                }
                                // padding
                                while (numDigits++ < maxLen) {
                                    num = numbers[0] + num;
                                }
                                if (position === "front") {
                                    p.name = num + link + p.name;
                                } else if (position === "back") {
                                    p.name = p.name + link + num;
                                }
                            }
                            return p;
                        });
                    }
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
                    expressions = expressions.map((expr) => buildRegex(expr));
                    return proxies.sort((a, b) => {
                        const oA = getRegexOrder(expressions, a.name);
                        const oB = getRegexOrder(expressions, b.name);
                        if (oA && !oB) return -1;
                        if (oB && !oA) return 1;
                        if (oA && oB) return oA < oB ? -1 : 1;
                        if ((!oA && !oB) || (oA && oB && oA === oB))
                            return a.name < b.name ? -1 : 1; // fallback to normal sort
                    });
                },
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
                            proxy.name = proxy.name
                                .replace(buildRegex(expr, "g"), now)
                                .trim();
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
        function ScriptOperator(script, targetPlatform, $arguments) {
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
                        output = operator(proxies, targetPlatform);
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
        function ScriptFilter(script, targetPlatform, $arguments) {
            return {
                name: "Script Filter",
                func: (proxies) => {
                    let output = FULL(proxies.length, true);
                    !(function () {
                        eval(script);
                        output = filter(proxies, targetPlatform);
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
                "🇦🇿": ["阿塞拜疆"],
                "🇦🇹": ["奥地利", "奧地利", "Austria", "维也纳"],
                "🇦🇺": ["AU", "Australia", "Sydney", "澳大利亚", "澳洲", "墨尔本", "悉尼", "土澳", "京澳", "廣澳", "滬澳", "沪澳", "广澳"],
                "🇧🇪": ["BE", "比利時", "比利时"],
                "🇧🇬": ["保加利亚", "保加利亞", "Bulgaria"],
                "🇧🇭": ["BH", "巴林"],
                "🇧🇩": ["BD", "孟加拉"],
                "🇵🇰": ["巴基斯坦"],
                "🇰🇭": ["柬埔寨"],
                "🇺🇦": ["烏克蘭", "乌克兰"],
                "🇭🇷": ["克罗地亚", "HR", "克羅地亞"],
                "🇨🇦": ["Canada", "CANADA", "CAN", "Waterloo", "加拿大", "蒙特利尔", "温哥华", "楓葉", "枫叶", "滑铁卢", "多伦多", "CA"],
                "🇨🇭": ["瑞士", "苏黎世", "Switzerland", "Zurich"],
                "🇳🇬": ["尼日利亚", "NG", "尼日利亞"],
                "🇨🇿": ["Czechia", "捷克"],
                "🇸🇰": ["斯洛伐克", "SK"],
                "🇷🇸": ["RS", "塞尔维亚"],
                "🇲🇩": ["摩爾多瓦", "MD", "摩尔多瓦"],
                "🇩🇪": ["DE", "German", "GERMAN", "德国", "德國", "法兰克福", "京德", "滬德", "廣德", "沪德", "广德", "Frankfurt"],
                "🇩🇰": ["DK", "DNK", "丹麦", "丹麥"],
                "🇪🇸": ["ES", "西班牙", "Spain"],
                "🇪🇺": ["EU", "欧盟", "欧罗巴"],
                "🇫🇮": ["Finland", "芬兰", "芬蘭", "赫尔辛基"],
                "🇫🇷": ["FR", "France", "法国", "法國", "巴黎"],
                "🇬🇧": ["UK", "GB", "England", "United Kingdom", "英国", "伦敦", "英", "London"],
                "🇲🇴": ["MO", "Macao", "澳门", "澳門", "CTM"],
                "🇰🇿": ["哈萨克斯坦", "哈萨克"],
                "🇭🇺": ["匈牙利", "Hungary"],
                "🇭🇰": ["HK", "Hongkong", "Hong Kong", "HongKong", "HONG KONG", "香港", "深港", "沪港", "呼港", "HKT", "HKBN", "HGC", "WTT", "CMI", "穗港", "京港", "港"],
                "🇮🇩": ["Indonesia", "印尼", "印度尼西亚", "雅加达"],
                "🇮🇪": ["Ireland", "IRELAND", "爱尔兰", "愛爾蘭", "都柏林"],
                "🇮🇱": ["Israel", "以色列"],
                "🇮🇳": ["India", "IND", "INDIA", "印度", "孟买", "MFumbai"],
                "🇮🇸": ["IS", "ISL", "冰岛", "冰島"],
                "🇰🇵": ["KP", "朝鲜"],
                "🇰🇷": ["KR", "Korea", "KOR", "韩国", "首尔", "韩", "韓", "春川", "Chuncheon", "Seoul"],
                "🇱🇺": ["卢森堡"],
                "🇱🇻": ["Latvia", "Latvija", "拉脱维亚"],
                "🇲🇽": ["MEX", "MX", "墨西哥"],
                "🇲🇾": ["MY", "Malaysia", "MALAYSIA", "马来西亚", "大馬", "馬來西亞", "吉隆坡"],
                "🇳🇱": ["NL", "Netherlands", "荷兰", "荷蘭", "尼德蘭", "阿姆斯特丹"],
                "🇳🇵": ["尼泊尔"],
                "🇵🇭": ["PH", "Philippines", "菲律宾", "菲律賓"],
                "🇵🇷": ["PR", "波多黎各"],
                "🇷🇴": ["RO", "罗马尼亚"],
                "🇷🇺": ["RU", "Russia", "俄罗斯", "俄国", "俄羅斯", "伯力", "莫斯科", "圣彼得堡", "西伯利亚", "新西伯利亚", "京俄", "杭俄", "廣俄", "滬俄", "广俄", "沪俄", "Moscow"],
                "🇸🇦": ["沙特"],
                "🇸🇪": ["SE", "Sweden", "瑞典"],
                "🇲🇹": ["马耳他"],
                "🇲🇦": ["MA", "摩洛哥"],
                "🇸🇬": ["SG", "Singapore", "SINGAPORE", "新加坡", "狮城", "沪新", "京新", "泉新", "穗新", "深新", "杭新", "广新", "廣新", "滬新"],
                "🇹🇭": ["TH", "Thailand", "泰国", "泰國", "曼谷"],
                "🇹🇷": ["TR", "Turkey", "土耳其", "伊斯坦布尔"],
                "🇹🇼": ["TW", "Taiwan", "TAIWAN", "台湾", "台北", "台中", "新北", "彰化", "CHT", "台", "HINET", "Taipei"],
                "🇺🇸": ["US", "USA", "America", "United States", "美国", "美", "京美", "波特兰", "达拉斯", "俄勒冈", "凤凰城", "费利蒙", "硅谷", "矽谷", "拉斯维加斯", "洛杉矶", "圣何塞", "圣克拉拉", "西雅图", "芝加哥", "沪美", "哥伦布", "纽约", "Los Angeles", "San Jose", "Sillicon Valley", "Michigan"],
                "🇻🇳": ["VN", "越南", "胡志明市"],
                "🇻🇪": ["VE", "委内瑞拉"],
                "🇮🇹": ["Italy", "IT", "Nachash", "意大利", "米兰", "義大利"],
                "🇿🇦": ["South Africa", "南非"],
                "🇦🇪": ["United Arab Emirates", "阿联酋", "迪拜", "AE"],
                "🇧🇷": ["BR", "Brazil", "巴西", "圣保罗"],
                "🇯🇵": ["JP", "Japan", "JAPAN", "日本", "东京", "大阪", "埼玉", "沪日", "穗日", "川日", "中日", "泉日", "杭日", "深日", "辽日", "广日", "大坂", "Osaka", "Tokyo"],
                "🇦🇷": ["AR", "阿根廷"],
                "🇳🇴": ["Norway", "挪威", "NO"],
                "🇨🇳": ["CN", "China", "回国", "中国", "中國", "江苏", "北京", "上海", "广州", "深圳", "杭州", "徐州", "青岛", "宁波", "镇江", "back"],
                "🇵🇱": ["PL", "POL", "波兰", "波蘭"],
                "🇨🇱": ["智利"],
                "🇳🇿": ["新西蘭", "新西兰"],
                "🇬🇷": ["希腊", "希臘"],
                "🇪🇬": ["埃及"],
                "🇨🇾": ["CY", "塞浦路斯"],
                "🇨🇷": ["CR", "哥斯达黎加"],
                "🇸🇮": ["SI", "斯洛文尼亚"],
                "🇱🇹": ["LT", "立陶宛"],
                "🇵🇦": ["PA", "巴拿马"],
                "🇹🇳": ["TN", "突尼斯"],
                "🇮🇲": ["马恩岛", "馬恩島"],
                "🇧🇾": ["BY", "白俄", "白俄罗斯"],
                "🇵🇹": ["葡萄牙"],
                "🇰🇪": ["KE", "肯尼亚"],
                "🇰🇬": ["KG", "吉尔吉斯坦"],
                "🇯🇴": ["JO", "约旦"],
                "🇺🇾": ["UY", "乌拉圭"],
                "🇲🇳": ["蒙古"],
                "🇮🇷": ["IR", "伊朗"],
                "🇵🇪": ["秘鲁", "祕魯"],
                "🇨🇴": ["哥伦比亚"],
                "🇪🇪": ["爱沙尼亚"],
                "🇪🇨": ["EC", "厄瓜多尔"],
                "🇲🇰": ["马其顿", "馬其頓"],
                "🇧🇦": ["波黑共和国", "波黑"],
                "🇬🇪": ["格魯吉亞", "格鲁吉亚"],
                "🇦🇱": ["阿爾巴尼亞", "阿尔巴尼亚"],
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
            "Handle Duplicate Operator": HandleDuplicateOperator,
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
                            const {host, mode} = proxy["plugin-opts"];
                            obfs_opts = `,obfs=${mode}${host ? ",obfs-host=" + host : ""}`;
                        }
                        if (proxy.plugin === "v2ray-plugin") {
                            const {tls, host, path} = proxy["plugin-opts"];
                            obfs_opts = `,obfs=${tls ? "wss" : "ws"}${host ? ",obfs-host=" + host : ""
                            }${path ? ",obfs-uri=" + path : ""}`;
                        }
                        return `shadowsocks=${proxy.server}:${proxy.port},method=${proxy.cipher
                        },password=${proxy.password}${obfs_opts}${proxy.tfo ? ",fast-open=true" : ",fast-open=false"
                        }${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"},tag=${proxy.name
                        }`;
                    case "ssr":
                        return `shadowsocks=${proxy.server}:${proxy.port},method=${proxy.cipher
                        },password=${proxy.password},ssr-protocol=${proxy.protocol}${proxy["protocol-param"]
                            ? ",ssr-protocol-param=" + proxy["protocol-param"]
                            : ""
                        }${proxy.obfs ? ",obfs=" + proxy.obfs : ""}${proxy["obfs-param"] ? ",obfs-host=" + proxy["obfs-param"] : ""
                        },fast-open=${proxy.tfo || false}${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"
                        },tag=${proxy.name}`;
                    case "vmess":
                        obfs_opts = "";
                        if (proxy.network === "ws") {
                            // websocket
                            if (proxy.tls) {
                                // ws-tls
                                obfs_opts = `,obfs=wss${proxy.sni ? ",obfs-host=" + proxy.sni : ""
                                }${proxy["ws-opts"].path ? ",obfs-uri=" + proxy["ws-opts"].path : ""
                                },tls-verification=${proxy["skip-cert-verify"] ? "false" : "true"
                                }`;
                            } else {
                                // ws
                                obfs_opts = `,obfs=ws${proxy["ws-opts"].headers.Host
                                    ? ",obfs-host=" + proxy["ws-opts"].headers.Host
                                    : ""
                                }${proxy["ws-opts"].path ? ",obfs-uri=" + proxy["ws-opts"].path : ""}`;
                            }
                        } else {
                            // tcp
                            if (proxy.tls) {
                                obfs_opts = `,obfs=over-tls${proxy.sni ? ",obfs-host=" + proxy.sni : ""
                                },tls-verification=${proxy["skip-cert-verify"] ? "false" : "true"
                                }`;
                            }
                        }
                        let result = `vmess=${proxy.server}:${proxy.port},method=${proxy.cipher === "auto" ? "none" : proxy.cipher
                        },password=${proxy.uuid}${obfs_opts},fast-open=${proxy.tfo || false}${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"}`;
                        if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                        if (typeof proxy['vmess-aead'] !== "undefined") {
                            result += `,aead=${proxy['vmess-aead']}`;
                        }
                        result += `,tag=${proxy.name}`;
                        return result;
                    case "trojan":
                        return `trojan=${proxy.server}:${proxy.port},password=${proxy.password
                        }${proxy.sni ? ",tls-host=" + proxy.sni : ""
                        },over-tls=true,tls-verification=${proxy["skip-cert-verify"] ? "false" : "true"
                        },fast-open=${proxy.tfo || false}${proxy.udp ? ",udp-relay=true" : ",udp-relay=false"
                        },tag=${proxy.name}`;
                    case "http":
                        tls_opts = "";
                        if (proxy.tls) {
                            tls_opts = `,over-tls=true,tls-verification=${proxy["skip-cert-verify"] ? "false" : "true"
                            }${proxy.sni ? ",tls-host=" + proxy.sni : ""}`;
                        }
                        return `http=${proxy.server}:${proxy.port},username=${proxy.username
                        },password=${proxy.password}${tls_opts},fast-open=${proxy.tfo || false},tag=${proxy.name}`;
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
                let obfs_opts = "", tls_opts = "", udp_opts = "", tfo_opts = "";
                if (typeof proxy.udp !== "undefined") {
                    udp_opts = proxy.udp ? ",udp=true" : ",udp=false";
                }
                tfo_opts = `,fast-open=${proxy.tfo || false}`;

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
                        return `${proxy.name}=shadowsocks,${proxy.server},${proxy.port},${proxy.cipher},"${proxy.password}"${obfs_opts}${udp_opts}${tfo_opts}`;
                    case "ssr":
                        return `${proxy.name}=shadowsocksr,${proxy.server},${proxy.port},${proxy.cipher
                        },"${proxy.password}",${proxy.protocol},{${proxy["protocol-param"] || ""
                        }},${proxy.obfs},{${proxy["obfs-param"] || ""
                        }}${udp_opts}${tfo_opts}`;
                    case "vmess":
                        obfs_opts = "";
                        if (proxy.network === "ws") {
                            const host = proxy["ws-opts"].headers.Host || proxy.server;
                            obfs_opts = `,transport:ws,host:${host},path:${proxy["ws-opts"].path || "/"
                            }`;
                        } else {
                            obfs_opts = `,transport:tcp`;
                        }
                        if (proxy.tls) {
                            obfs_opts += `${proxy.sni ? ",tls-name:" + proxy.sni : ""
                            },skip-cert-verify:${proxy["skip-cert-verify"] || "false"}`;
                        }
                        let result = `${proxy.name}=vmess,${proxy.server},${proxy.port},${proxy.cipher === "auto" ? "none" : proxy.cipher
                        },"${proxy.uuid}",over-tls:${proxy.tls || "false"}${obfs_opts}`;
                        if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                        if (typeof proxy['vmess-aead'] !== "undefined") {
                            result += `,vmess-aead=${proxy['vmess-aead']}`;
                        }
                        return result;
                    case "trojan":
                        return `${proxy.name}=trojan,${proxy.server},${proxy.port},"${proxy.password
                        }"${proxy.sni ? ",tls-name:" + proxy.sni : ""},skip-cert-verify:${proxy["skip-cert-verify"] || "false"
                        }${udp_opts}`;
                    case "http":
                        tls_opts = "";
                        const base = `${proxy.name}=${proxy.tls ? "http" : "https"},${proxy.server
                        },${proxy.port},${proxy.username || ""},${proxy.password || ""}`;
                        if (proxy.tls) {
                            // https
                            tls_opts = `${proxy.sni ? ",tls-name:" + proxy.sni : ""
                            },skip-cert-verify:${proxy["skip-cert-verify"]}`;
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
                let result = "";
                let obfs_opts, tls_opts;
                switch (proxy.type) {
                    case "ss":
                        obfs_opts = "";
                        if (proxy.plugin) {
                            const {host, mode} = proxy["plugin-opts"];
                            if (proxy.plugin === "obfs") {
                                obfs_opts = `,obfs=${mode}${host ? ",obfs-host=" + host : ""}`;
                            } else {
                                throw new Error(
                                    `Platform ${targetPlatform} does not support obfs option: ${proxy.obfs}`
                                );
                            }
                        }
                        result = `${proxy.name}=ss,${proxy.server}, ${proxy.port
                        },encrypt-method=${proxy.cipher},password=${proxy.password
                        }${obfs_opts},tfo=${proxy.tfo || "false"},udp-relay=${proxy.udp || "false"
                        }`;
                        break;
                    case "vmess":
                        tls_opts = "";
                        result = `${proxy.name}=vmess,${proxy.server},${proxy.port
                        },username=${proxy.uuid},tls=${proxy.tls || "false"},tfo=${proxy.tfo || "false"}`;

                        if (proxy.alterId === 0) proxy['vmess-aead'] = true;
                        if (typeof proxy['vmess-aead'] !== "undefined") {
                            result += `,vmess-aead=${proxy['vmess-aead']}`;
                        }
                        if (proxy.network === "ws") {
                            const path = proxy["ws-opts"].path || "/";
                            const wsHeaders = Object.entries(proxy["ws-opts"].headers).map(
                                ([key, value]) => (`${key}:"${value}"`))
                                .join('|');
                            result += `,ws=true${path ? ",ws-path=" + path : ""}${wsHeaders ? ",ws-headers=" + wsHeaders : ""}`;
                        }
                        if (proxy.tls) {
                            result += `${typeof proxy["skip-cert-verify"] !== "undefined"
                                ? ",skip-cert-verify=" + proxy["skip-cert-verify"]
                                : ""
                            }`;
                            result += proxy.sni ? `,sni=${proxy.sni}` : "";
                        }
                        break;
                    case "trojan":
                        result = `${proxy.name}=trojan,${proxy.server},${proxy.port
                        },password=${proxy.password}${typeof proxy["skip-cert-verify"] !== "undefined"
                            ? ",skip-cert-verify=" + proxy["skip-cert-verify"]
                            : ""
                        }${proxy.sni ? ",sni=" + proxy.sni : ""},tfo=${proxy.tfo || "false"
                        },udp-relay=${proxy.udp || "false"}`;
                        break;
                    case "http":
                        tls_opts = ", tls=false";
                        if (proxy.tls) {
                            tls_opts = `,tls=true,skip-cert-verify=${proxy["skip-cert-verify"]},sni=${proxy.sni}`;
                        }
                        result = `${proxy.name}=http, ${proxy.server}, ${proxy.port}${proxy.username ? ",username=" + proxy.username : ""
                        }${proxy.password ? ",password=" + proxy.password : ""
                        }${tls_opts},tfo=${proxy.tfo || "false"}`;
                        break;
                    default:
                        throw new Error(
                            `Platform ${targetPlatform} does not support proxy type: ${proxy.type}`
                        );
                }

                // handle surge hybrid param
                result += proxy["surge-hybrid"] !== undefined ? `,hybrid=${proxy["surge-hybrid"]}` : "";
                return result;
            };
            return {produce};
        }

        function Clash_Producer() {
            const type = "ALL";
            const produce = (proxies) => {
                return (
                    "proxies:\n" +
                    proxies
                        .map((proxy) => {
                            delete proxy.supported;
                            return "  - " + JSON.stringify(proxy) + "\n";
                        })
                        .join("")
                );
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
                        result = `ss://${Base64.safeEncode(userinfo)}@${proxy.server}:${proxy.port
                        }/`;
                        if (proxy.plugin) {
                            result += "?plugin=";
                            const opts = proxy["plugin-opts"];
                            switch (proxy.plugin) {
                                case "obfs":
                                    result += encodeURIComponent(
                                        `simple-obfs;obfs=${opts.mode}${opts.host ? ";obfs-host=" + opts.host : ""
                                        }`
                                    );
                                    break;
                                case "v2ray-plugin":
                                    result += encodeURIComponent(
                                        `v2ray-plugin;obfs=${opts.mode}${opts.host ? ";obfs-host" + opts.host : ""
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
                        result = `${proxy.server}:${proxy.port}:${proxy.protocol}:${proxy.cipher
                        }:${proxy.obfs}:${Base64.safeEncode(proxy.password)}/`;
                        result += `?remarks=${Base64.safeEncode(proxy.name)}${proxy["obfs-param"]
                            ? "&obfsparam=" + Base64.safeEncode(proxy["obfs-param"])
                            : ""
                        }${proxy["protocol-param"]
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
                            result.path = proxy["ws-opts"].path || "/";
                            result.host = proxy["ws-opts"].headers.Host || proxy.server;
                        }
                        result = "vmess://" + Base64.safeEncode(JSON.stringify(result));
                        break;
                    case "trojan":
                        result = `trojan://${proxy.password}@${proxy.server}:${proxy.port
                        }#${encodeURIComponent(proxy.name)}`;
                        break;
                    default:
                        throw new Error(`Cannot handle proxy type: ${proxy.type}`);
                }
                return result;
            };
            return {type, produce};
        }

        function JSON_Producer() {
            const type = "ALL";
            const produce = (proxies) => JSON.stringify(proxies, null, 2);
            return {type, produce};
        }

        return {
            QX: QX_Producer(),
            Surge: Surge_Producer(),
            Loon: Loon_Producer(),
            Clash: Clash_Producer(),
            URI: URI_Producer(),
            JSON: JSON_Producer(),
        };
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
                    $.error(`Failed to parse line: \n ${line}\n Reason: ${err.stack}`);
                }
            }
        }

        return proxies;
    }

    async function process(proxies, operators = [], targetPlatform) {
        for (const item of operators) {
            // process script
            let script;
            const $arguments = {};
            if (item.type.indexOf("Script") !== -1) {
                const {mode, content} = item.args;
                if (mode === "link") {
                    const url = content;
                    // extract link arguments
                    const rawArgs = url.split('#');
                    if (rawArgs.length > 1) {
                        for (const pair of rawArgs[1].split("&")) {
                            const key = pair.split('=')[0];
                            const value = (pair.split('=')[1] || true);
                            $arguments[key] = value;
                        }
                    }

                    // if this is remote script, download it
                    try {
                        script = await $downloader.download(url.split("#")[0]);
                        $.info(`Script loaded: >>>\n ${script}`);
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
                `Applying "${item.type}" with arguments:\n >>> ${JSON.stringify(item.args, null, 2) || "None"
                }`
            );
            let processor;
            if (item.type.indexOf("Script") !== -1) {
                processor = PROXY_PROCESSORS[item.type](script, targetPlatform, $arguments);
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
        proxies = proxies.filter(
            (proxy) => !(proxy.supported && proxy.supported[targetPlatform] === false)
        );

        $.info(`Producing proxies for target: ${targetPlatform}`);
        if (typeof producer.type === "undefined" || producer.type === "SINGLE") {
            return proxies
                .map((proxy) => {
                    try {
                        return producer.produce(proxy);
                    } catch (err) {
                        $.error(
                            `Cannot produce proxy: ${JSON.stringify(
                                proxy,
                                null,
                                2
                            )}\nReason: ${err}`
                        );
                        return "";
                    }
                })
                .filter((line) => line.length > 0)
                .join("\n");
        } else if (producer.type === "ALL") {
            return producer.produce(proxies);
        }
    }

    return {
        parse,
        process,
        produce,
    };
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
        [/^(IP-CIDR6|ip6-cidr|IP6-CIDR)$/],
    ];

    const RULE_PREPROCESSORS = (function () {
        function HTML() {
            const name = "HTML";
            const test = (raw) => /^<!DOCTYPE html>/.test(raw);
            // simply discard HTML
            const parse = (_) => "";
            return {name, test, parse};
        }

        function ClashProvider() {
            const name = "Clash Provider";
            const test = (raw) => raw.indexOf("payload:") === 0;
            const parse = (raw) => {
                return raw.replace("payload:", "").replace(/^\s*-\s*/gm, "");
            };
            return {name, test, parse};
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
                        const params = line.split(",").map((w) => w.trim());
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
                                    rule.options = params.slice(2);
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
            };
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
                func: (rules) => {
                    const seen = new Set();
                    const result = [];
                    rules.forEach((rule) => {
                        const options = rule.options || [];
                        options.sort();
                        const key = `${rule.type},${rule.content},${JSON.stringify(
                            options
                        )}`;
                        if (!seen.has(key)) {
                            result.push(rule);
                            seen.add(key);
                        }
                    });
                    return result;
                },
            };
        }

        // regex: [{expr: "string format regex", now: "now"}]
        function RegexReplaceOperator(regex) {
            return {
                name: "Regex Rename Operator",
                func: (rules) => {
                    return rules.map((rule) => {
                        for (const {expr, now} of regex) {
                            rule.content = rule.content
                                .replace(new RegExp(expr, "g"), now)
                                .trim();
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

            "Regex Replace Operator": RegexReplaceOperator,
        };
    })();
    const RULE_PRODUCERS = (function () {
        function QXFilter() {
            const type = "SINGLE";
            const func = (rule) => {
                // skip unsupported rules
                const UNSUPPORTED = [
                    "URL-REGEX",
                    "DEST-PORT",
                    "SRC-IP",
                    "IN-PORT",
                    "PROTOCOL",
                ];
                if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;

                const TRANSFORM = {
                    "DOMAIN-KEYWORD": "HOST-KEYWORD",
                    "DOMAIN-SUFFIX": "HOST-SUFFIX",
                    DOMAIN: "HOST",
                    "IP-CIDR6": "IP6-CIDR",
                };

                // QX does not support the no-resolve option
                return `${TRANSFORM[rule.type] || rule.type},${rule.content},SUB-STORE`;
            };
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
            };
            return {type, func};
        }

        function LoonRules() {
            const type = "SINGLE";
            const func = (rule) => {
                // skip unsupported rules
                const UNSUPPORTED = ["DEST-PORT", "SRC-IP", "IN-PORT", "PROTOCOL"];
                if (UNSUPPORTED.indexOf(rule.type) !== -1) return null;
                return SurgeRuleSet().func(rule);
            };
            return {type, func};
        }

        function ClashRuleProvider() {
            const type = "ALL";
            const func = (rules) => {
                const TRANSFORM = {
                    "DEST-PORT": "DST-PORT",
                    "SRC-IP": "SRC-IP-CIDR",
                    "IN-PORT": "SRC-PORT",
                };
                const conf = {
                    payload: rules.map((rule) => {
                        let output = `${TRANSFORM[rule.type] || rule.type},${rule.content}`;
                        if (rule.type === "IP-CIDR" || rule.type === "IP-CIDR6") {
                            output += rule.options ? `,${rule.options[0]}` : "";
                        }
                        return output;
                    }),
                };
                return YAML.stringify(conf);
            };
            return {type, func};
        }

        return {
            QX: QXFilter(),
            Surge: SurgeRuleSet(),
            Loon: LoonRules(),
            Clash: ClashRuleProvider(),
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
                `Applying "${item.type}" with arguments: \n >>> ${JSON.stringify(item.args) || "None"
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
        if (typeof producer.type === "undefined" || producer.type === "SINGLE") {
            return rules
                .map((rule) => {
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
                .filter((line) => line.length > 0)
                .join("\n");
        } else if (producer.type === "ALL") {
            return producer.func(rules);
        }
    }

    return {parse, process, produce};
})();

function getBuiltInRules() {
    return {
        AD: {
            name: "AD",
            description: "",
            urls: [
                "https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/anti-ad-surge.txt",
                "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/BanAD.yaml",
            ],
        },
        Global: {
            name: "Global",
            description: "",
            urls: [
                "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ProxyGFWlist.yaml",
                "https://raw.githubusercontent.com/DivineEngine/Profiles/master/Quantumult/Filter/Global.list",
            ],
        },
        CN: {
            name: "CN",
            description: "",
            urls: [
                "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Providers/ChinaDomain.yaml",
                "https://raw.githubusercontent.com/DivineEngine/Profiles/master/Quantumult/Filter/China.list",
            ],
        },
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
        return new RegExp(str, "i" + options);
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
    const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;

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
            worker = $task.fetch({
                method,
                url: options.url,
                headers: options.headers,
                body: options.body,
            });
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

    this.upload = async function (files) {
        const id = await locate();

        if (id === -1) {
            // create a new gist for backup
            return http.post({
                url: "/gists",
                body: JSON.stringify({
                    description: key,
                    public: false,
                    files,
                }),
            });
        } else {
            // update an existing gist
            return http.patch({
                url: `/gists/${id}`,
                body: JSON.stringify({files}),
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
                    .then((resp) => JSON.parse(resp.body));
                const url = files[filename].raw_url;
                return await http.get(url).then((resp) => resp.body);
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

            const errFunc = (err) => {
                res.status(500).json({
                    status: "failed",
                    message: `Internal Server Error: ${err}`,
                });
            };

            if (cb.constructor.name === "AsyncFunction") {
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
 * https://github.com/nodeca/js-yaml
 */
var YAML = function () {
    function isNothing(subject) {
        return (typeof subject === 'undefined') || (subject === null);
    }


    function isObject(subject) {
        return (typeof subject === 'object') && (subject !== null);
    }


    function toArray(sequence) {
        if (Array.isArray(sequence)) return sequence;
        else if (isNothing(sequence)) return [];

        return [sequence];
    }


    function extend(target, source) {
        var index, length, key, sourceKeys;

        if (source) {
            sourceKeys = Object.keys(source);

            for (index = 0, length = sourceKeys.length; index < length; index += 1) {
                key = sourceKeys[index];
                target[key] = source[key];
            }
        }

        return target;
    }


    function repeat(string, count) {
        var result = '', cycle;

        for (cycle = 0; cycle < count; cycle += 1) {
            result += string;
        }

        return result;
    }


    function isNegativeZero(number) {
        return (number === 0) && (Number.NEGATIVE_INFINITY === 1 / number);
    }


    var isNothing_1 = isNothing;
    var isObject_1 = isObject;
    var toArray_1 = toArray;
    var repeat_1 = repeat;
    var isNegativeZero_1 = isNegativeZero;
    var extend_1 = extend;

    var common = {
        isNothing: isNothing_1,
        isObject: isObject_1,
        toArray: toArray_1,
        repeat: repeat_1,
        isNegativeZero: isNegativeZero_1,
        extend: extend_1
    };

// YAML error class. http://stackoverflow.com/questions/8458984


    function formatError(exception, compact) {
        var where = '', message = exception.reason || '(unknown reason)';

        if (!exception.mark) return message;

        if (exception.mark.name) {
            where += 'in "' + exception.mark.name + '" ';
        }

        where += '(' + (exception.mark.line + 1) + ':' + (exception.mark.column + 1) + ')';

        if (!compact && exception.mark.snippet) {
            where += '\n\n' + exception.mark.snippet;
        }

        return message + ' ' + where;
    }


    function YAMLException$1(reason, mark) {
        // Super constructor
        Error.call(this);

        this.name = 'YAMLException';
        this.reason = reason;
        this.mark = mark;
        this.message = formatError(this, false);

        // Include stack trace in error object
        if (Error.captureStackTrace) {
            // Chrome and NodeJS
            Error.captureStackTrace(this, this.constructor);
        } else {
            // FF, IE 10+ and Safari 6+. Fallback for others
            this.stack = (new Error()).stack || '';
        }
    }


// Inherit from Error
    YAMLException$1.prototype = Object.create(Error.prototype);
    YAMLException$1.prototype.constructor = YAMLException$1;


    YAMLException$1.prototype.toString = function toString(compact) {
        return this.name + ': ' + formatError(this, compact);
    };


    var exception = YAMLException$1;

// get snippet for a single line, respecting maxLength
    function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
        var head = '';
        var tail = '';
        var maxHalfLength = Math.floor(maxLineLength / 2) - 1;

        if (position - lineStart > maxHalfLength) {
            head = ' ... ';
            lineStart = position - maxHalfLength + head.length;
        }

        if (lineEnd - position > maxHalfLength) {
            tail = ' ...';
            lineEnd = position + maxHalfLength - tail.length;
        }

        return {
            str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, '→') + tail,
            pos: position - lineStart + head.length // relative position
        };
    }


    function padStart(string, max) {
        return common.repeat(' ', max - string.length) + string;
    }


    function makeSnippet(mark, options) {
        options = Object.create(options || null);

        if (!mark.buffer) return null;

        if (!options.maxLength) options.maxLength = 79;
        if (typeof options.indent !== 'number') options.indent = 1;
        if (typeof options.linesBefore !== 'number') options.linesBefore = 3;
        if (typeof options.linesAfter !== 'number') options.linesAfter = 2;

        var re = /\r?\n|\r|\0/g;
        var lineStarts = [0];
        var lineEnds = [];
        var match;
        var foundLineNo = -1;

        while ((match = re.exec(mark.buffer))) {
            lineEnds.push(match.index);
            lineStarts.push(match.index + match[0].length);

            if (mark.position <= match.index && foundLineNo < 0) {
                foundLineNo = lineStarts.length - 2;
            }
        }

        if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;

        var result = '', i, line;
        var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
        var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);

        for (i = 1; i <= options.linesBefore; i++) {
            if (foundLineNo - i < 0) break;
            line = getLine(
                mark.buffer,
                lineStarts[foundLineNo - i],
                lineEnds[foundLineNo - i],
                mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
                maxLineLength
            );
            result = common.repeat(' ', options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) +
                ' | ' + line.str + '\n' + result;
        }

        line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
        result += common.repeat(' ', options.indent) + padStart((mark.line + 1).toString(), lineNoLength) +
            ' | ' + line.str + '\n';
        result += common.repeat('-', options.indent + lineNoLength + 3 + line.pos) + '^' + '\n';

        for (i = 1; i <= options.linesAfter; i++) {
            if (foundLineNo + i >= lineEnds.length) break;
            line = getLine(
                mark.buffer,
                lineStarts[foundLineNo + i],
                lineEnds[foundLineNo + i],
                mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
                maxLineLength
            );
            result += common.repeat(' ', options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) +
                ' | ' + line.str + '\n';
        }

        return result.replace(/\n$/, '');
    }


    var snippet = makeSnippet;

    var TYPE_CONSTRUCTOR_OPTIONS = [
        'kind',
        'multi',
        'resolve',
        'construct',
        'instanceOf',
        'predicate',
        'represent',
        'representName',
        'defaultStyle',
        'styleAliases'
    ];

    var YAML_NODE_KINDS = [
        'scalar',
        'sequence',
        'mapping'
    ];

    function compileStyleAliases(map) {
        var result = {};

        if (map !== null) {
            Object.keys(map).forEach(function (style) {
                map[style].forEach(function (alias) {
                    result[String(alias)] = style;
                });
            });
        }

        return result;
    }

    function Type$1(tag, options) {
        options = options || {};

        Object.keys(options).forEach(function (name) {
            if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
                throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
            }
        });

        // TODO: Add tag format check.
        this.options = options; // keep original options in case user wants to extend this type later
        this.tag = tag;
        this.kind = options['kind'] || null;
        this.resolve = options['resolve'] || function () {
            return true;
        };
        this.construct = options['construct'] || function (data) {
            return data;
        };
        this.instanceOf = options['instanceOf'] || null;
        this.predicate = options['predicate'] || null;
        this.represent = options['represent'] || null;
        this.representName = options['representName'] || null;
        this.defaultStyle = options['defaultStyle'] || null;
        this.multi = options['multi'] || false;
        this.styleAliases = compileStyleAliases(options['styleAliases'] || null);

        if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
            throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
        }
    }

    var type = Type$1;

    /*eslint-disable max-len*/


    function compileList(schema, name) {
        var result = [];

        schema[name].forEach(function (currentType) {
            var newIndex = result.length;

            result.forEach(function (previousType, previousIndex) {
                if (previousType.tag === currentType.tag &&
                    previousType.kind === currentType.kind &&
                    previousType.multi === currentType.multi) {

                    newIndex = previousIndex;
                }
            });

            result[newIndex] = currentType;
        });

        return result;
    }


    function compileMap(/* lists... */) {
        var result = {
            scalar: {},
            sequence: {},
            mapping: {},
            fallback: {},
            multi: {
                scalar: [],
                sequence: [],
                mapping: [],
                fallback: []
            }
        }, index, length;

        function collectType(type) {
            if (type.multi) {
                result.multi[type.kind].push(type);
                result.multi['fallback'].push(type);
            } else {
                result[type.kind][type.tag] = result['fallback'][type.tag] = type;
            }
        }

        for (index = 0, length = arguments.length; index < length; index += 1) {
            arguments[index].forEach(collectType);
        }
        return result;
    }


    function Schema$1(definition) {
        return this.extend(definition);
    }


    Schema$1.prototype.extend = function extend(definition) {
        var implicit = [];
        var explicit = [];

        if (definition instanceof type) {
            // Schema.extend(type)
            explicit.push(definition);

        } else if (Array.isArray(definition)) {
            // Schema.extend([ type1, type2, ... ])
            explicit = explicit.concat(definition);

        } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
            // Schema.extend({ explicit: [ type1, type2, ... ], implicit: [ type1, type2, ... ] })
            if (definition.implicit) implicit = implicit.concat(definition.implicit);
            if (definition.explicit) explicit = explicit.concat(definition.explicit);

        } else {
            throw new exception('Schema.extend argument should be a Type, [ Type ], ' +
                'or a schema definition ({ implicit: [...], explicit: [...] })');
        }

        implicit.forEach(function (type$1) {
            if (!(type$1 instanceof type)) {
                throw new exception('Specified list of YAML types (or a single Type object) contains a non-Type object.');
            }

            if (type$1.loadKind && type$1.loadKind !== 'scalar') {
                throw new exception('There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.');
            }

            if (type$1.multi) {
                throw new exception('There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.');
            }
        });

        explicit.forEach(function (type$1) {
            if (!(type$1 instanceof type)) {
                throw new exception('Specified list of YAML types (or a single Type object) contains a non-Type object.');
            }
        });

        var result = Object.create(Schema$1.prototype);

        result.implicit = (this.implicit || []).concat(implicit);
        result.explicit = (this.explicit || []).concat(explicit);

        result.compiledImplicit = compileList(result, 'implicit');
        result.compiledExplicit = compileList(result, 'explicit');
        result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);

        return result;
    };


    var schema = Schema$1;

    var str = new type('tag:yaml.org,2002:str', {
        kind: 'scalar',
        construct: function (data) {
            return data !== null ? data : '';
        }
    });

    var seq = new type('tag:yaml.org,2002:seq', {
        kind: 'sequence',
        construct: function (data) {
            return data !== null ? data : [];
        }
    });

    var map = new type('tag:yaml.org,2002:map', {
        kind: 'mapping',
        construct: function (data) {
            return data !== null ? data : {};
        }
    });

    var failsafe = new schema({
        explicit: [
            str,
            seq,
            map
        ]
    });

    function resolveYamlNull(data) {
        if (data === null) return true;

        var max = data.length;

        return (max === 1 && data === '~') ||
            (max === 4 && (data === 'null' || data === 'Null' || data === 'NULL'));
    }

    function constructYamlNull() {
        return null;
    }

    function isNull(object) {
        return object === null;
    }

    var _null = new type('tag:yaml.org,2002:null', {
        kind: 'scalar',
        resolve: resolveYamlNull,
        construct: constructYamlNull,
        predicate: isNull,
        represent: {
            canonical: function () {
                return '~';
            },
            lowercase: function () {
                return 'null';
            },
            uppercase: function () {
                return 'NULL';
            },
            camelcase: function () {
                return 'Null';
            },
            empty: function () {
                return '';
            }
        },
        defaultStyle: 'lowercase'
    });

    function resolveYamlBoolean(data) {
        if (data === null) return false;

        var max = data.length;

        return (max === 4 && (data === 'true' || data === 'True' || data === 'TRUE')) ||
            (max === 5 && (data === 'false' || data === 'False' || data === 'FALSE'));
    }

    function constructYamlBoolean(data) {
        return data === 'true' ||
            data === 'True' ||
            data === 'TRUE';
    }

    function isBoolean(object) {
        return Object.prototype.toString.call(object) === '[object Boolean]';
    }

    var bool = new type('tag:yaml.org,2002:bool', {
        kind: 'scalar',
        resolve: resolveYamlBoolean,
        construct: constructYamlBoolean,
        predicate: isBoolean,
        represent: {
            lowercase: function (object) {
                return object ? 'true' : 'false';
            },
            uppercase: function (object) {
                return object ? 'TRUE' : 'FALSE';
            },
            camelcase: function (object) {
                return object ? 'True' : 'False';
            }
        },
        defaultStyle: 'lowercase'
    });

    function isHexCode(c) {
        return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) ||
            ((0x41/* A */ <= c) && (c <= 0x46/* F */)) ||
            ((0x61/* a */ <= c) && (c <= 0x66/* f */));
    }

    function isOctCode(c) {
        return ((0x30/* 0 */ <= c) && (c <= 0x37/* 7 */));
    }

    function isDecCode(c) {
        return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */));
    }

    function resolveYamlInteger(data) {
        if (data === null) return false;

        var max = data.length,
            index = 0,
            hasDigits = false,
            ch;

        if (!max) return false;

        ch = data[index];

        // sign
        if (ch === '-' || ch === '+') {
            ch = data[++index];
        }

        if (ch === '0') {
            // 0
            if (index + 1 === max) return true;
            ch = data[++index];

            // base 2, base 8, base 16

            if (ch === 'b') {
                // base 2
                index++;

                for (; index < max; index++) {
                    ch = data[index];
                    if (ch === '_') continue;
                    if (ch !== '0' && ch !== '1') return false;
                    hasDigits = true;
                }
                return hasDigits && ch !== '_';
            }


            if (ch === 'x') {
                // base 16
                index++;

                for (; index < max; index++) {
                    ch = data[index];
                    if (ch === '_') continue;
                    if (!isHexCode(data.charCodeAt(index))) return false;
                    hasDigits = true;
                }
                return hasDigits && ch !== '_';
            }


            if (ch === 'o') {
                // base 8
                index++;

                for (; index < max; index++) {
                    ch = data[index];
                    if (ch === '_') continue;
                    if (!isOctCode(data.charCodeAt(index))) return false;
                    hasDigits = true;
                }
                return hasDigits && ch !== '_';
            }
        }

        // base 10 (except 0)

        // value should not start with `_`;
        if (ch === '_') return false;

        for (; index < max; index++) {
            ch = data[index];
            if (ch === '_') continue;
            if (!isDecCode(data.charCodeAt(index))) {
                return false;
            }
            hasDigits = true;
        }

        // Should have digits and should not end with `_`
        if (!hasDigits || ch === '_') return false;

        return true;
    }

    function constructYamlInteger(data) {
        var value = data, sign = 1, ch;

        if (value.indexOf('_') !== -1) {
            value = value.replace(/_/g, '');
        }

        ch = value[0];

        if (ch === '-' || ch === '+') {
            if (ch === '-') sign = -1;
            value = value.slice(1);
            ch = value[0];
        }

        if (value === '0') return 0;

        if (ch === '0') {
            if (value[1] === 'b') return sign * parseInt(value.slice(2), 2);
            if (value[1] === 'x') return sign * parseInt(value.slice(2), 16);
            if (value[1] === 'o') return sign * parseInt(value.slice(2), 8);
        }

        return sign * parseInt(value, 10);
    }

    function isInteger(object) {
        return (Object.prototype.toString.call(object)) === '[object Number]' &&
            (object % 1 === 0 && !common.isNegativeZero(object));
    }

    var int = new type('tag:yaml.org,2002:int', {
        kind: 'scalar',
        resolve: resolveYamlInteger,
        construct: constructYamlInteger,
        predicate: isInteger,
        represent: {
            binary: function (obj) {
                return obj >= 0 ? '0b' + obj.toString(2) : '-0b' + obj.toString(2).slice(1);
            },
            octal: function (obj) {
                return obj >= 0 ? '0o' + obj.toString(8) : '-0o' + obj.toString(8).slice(1);
            },
            decimal: function (obj) {
                return obj.toString(10);
            },
            /* eslint-disable max-len */
            hexadecimal: function (obj) {
                return obj >= 0 ? '0x' + obj.toString(16).toUpperCase() : '-0x' + obj.toString(16).toUpperCase().slice(1);
            }
        },
        defaultStyle: 'decimal',
        styleAliases: {
            binary: [2, 'bin'],
            octal: [8, 'oct'],
            decimal: [10, 'dec'],
            hexadecimal: [16, 'hex']
        }
    });

    var YAML_FLOAT_PATTERN = new RegExp(
        // 2.5e4, 2.5 and integers
        '^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?' +
        // .2e4, .2
        // special case, seems not from spec
        '|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?' +
        // .inf
        '|[-+]?\\.(?:inf|Inf|INF)' +
        // .nan
        '|\\.(?:nan|NaN|NAN))$');

    function resolveYamlFloat(data) {
        if (data === null) return false;

        if (!YAML_FLOAT_PATTERN.test(data) ||
            // Quick hack to not allow integers end with `_`
            // Probably should update regexp & check speed
            data[data.length - 1] === '_') {
            return false;
        }

        return true;
    }

    function constructYamlFloat(data) {
        var value, sign;

        value = data.replace(/_/g, '').toLowerCase();
        sign = value[0] === '-' ? -1 : 1;

        if ('+-'.indexOf(value[0]) >= 0) {
            value = value.slice(1);
        }

        if (value === '.inf') {
            return (sign === 1) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

        } else if (value === '.nan') {
            return NaN;
        }
        return sign * parseFloat(value, 10);
    }


    var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;

    function representYamlFloat(object, style) {
        var res;

        if (isNaN(object)) {
            switch (style) {
                case 'lowercase':
                    return '.nan';
                case 'uppercase':
                    return '.NAN';
                case 'camelcase':
                    return '.NaN';
            }
        } else if (Number.POSITIVE_INFINITY === object) {
            switch (style) {
                case 'lowercase':
                    return '.inf';
                case 'uppercase':
                    return '.INF';
                case 'camelcase':
                    return '.Inf';
            }
        } else if (Number.NEGATIVE_INFINITY === object) {
            switch (style) {
                case 'lowercase':
                    return '-.inf';
                case 'uppercase':
                    return '-.INF';
                case 'camelcase':
                    return '-.Inf';
            }
        } else if (common.isNegativeZero(object)) {
            return '-0.0';
        }

        res = object.toString(10);

        // JS stringifier can build scientific format without dots: 5e-100,
        // while YAML requres dot: 5.e-100. Fix it with simple hack

        return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace('e', '.e') : res;
    }

    function isFloat(object) {
        return (Object.prototype.toString.call(object) === '[object Number]') &&
            (object % 1 !== 0 || common.isNegativeZero(object));
    }

    var float = new type('tag:yaml.org,2002:float', {
        kind: 'scalar',
        resolve: resolveYamlFloat,
        construct: constructYamlFloat,
        predicate: isFloat,
        represent: representYamlFloat,
        defaultStyle: 'lowercase'
    });

    var json = failsafe.extend({
        implicit: [
            _null,
            bool,
            int,
            float
        ]
    });

    var core = json;

    var YAML_DATE_REGEXP = new RegExp(
        '^([0-9][0-9][0-9][0-9])' + // [1] year
        '-([0-9][0-9])' + // [2] month
        '-([0-9][0-9])$');                   // [3] day

    var YAML_TIMESTAMP_REGEXP = new RegExp(
        '^([0-9][0-9][0-9][0-9])' + // [1] year
        '-([0-9][0-9]?)' + // [2] month
        '-([0-9][0-9]?)' + // [3] day
        '(?:[Tt]|[ \\t]+)' + // ...
        '([0-9][0-9]?)' + // [4] hour
        ':([0-9][0-9])' + // [5] minute
        ':([0-9][0-9])' + // [6] second
        '(?:\\.([0-9]*))?' + // [7] fraction
        '(?:[ \\t]*(Z|([-+])([0-9][0-9]?)' + // [8] tz [9] tz_sign [10] tz_hour
        '(?::([0-9][0-9]))?))?$');           // [11] tz_minute

    function resolveYamlTimestamp(data) {
        if (data === null) return false;
        if (YAML_DATE_REGEXP.exec(data) !== null) return true;
        if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
        return false;
    }

    function constructYamlTimestamp(data) {
        var match, year, month, day, hour, minute, second, fraction = 0,
            delta = null, tz_hour, tz_minute, date;

        match = YAML_DATE_REGEXP.exec(data);
        if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);

        if (match === null) throw new Error('Date resolve error');

        // match: [1] year [2] month [3] day

        year = +(match[1]);
        month = +(match[2]) - 1; // JS month starts with 0
        day = +(match[3]);

        if (!match[4]) { // no hour
            return new Date(Date.UTC(year, month, day));
        }

        // match: [4] hour [5] minute [6] second [7] fraction

        hour = +(match[4]);
        minute = +(match[5]);
        second = +(match[6]);

        if (match[7]) {
            fraction = match[7].slice(0, 3);
            while (fraction.length < 3) { // milli-seconds
                fraction += '0';
            }
            fraction = +fraction;
        }

        // match: [8] tz [9] tz_sign [10] tz_hour [11] tz_minute

        if (match[9]) {
            tz_hour = +(match[10]);
            tz_minute = +(match[11] || 0);
            delta = (tz_hour * 60 + tz_minute) * 60000; // delta in mili-seconds
            if (match[9] === '-') delta = -delta;
        }

        date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));

        if (delta) date.setTime(date.getTime() - delta);

        return date;
    }

    function representYamlTimestamp(object /*, style*/) {
        return object.toISOString();
    }

    var timestamp = new type('tag:yaml.org,2002:timestamp', {
        kind: 'scalar',
        resolve: resolveYamlTimestamp,
        construct: constructYamlTimestamp,
        instanceOf: Date,
        represent: representYamlTimestamp
    });

    function resolveYamlMerge(data) {
        return data === '<<' || data === null;
    }

    var merge = new type('tag:yaml.org,2002:merge', {
        kind: 'scalar',
        resolve: resolveYamlMerge
    });

    /*eslint-disable no-bitwise*/


// [ 64, 65, 66 ] -> [ padding, CR, LF ]
    var BASE64_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r';


    function resolveYamlBinary(data) {
        if (data === null) return false;

        var code, idx, bitlen = 0, max = data.length, map = BASE64_MAP;

        // Convert one by one.
        for (idx = 0; idx < max; idx++) {
            code = map.indexOf(data.charAt(idx));

            // Skip CR/LF
            if (code > 64) continue;

            // Fail on illegal characters
            if (code < 0) return false;

            bitlen += 6;
        }

        // If there are any bits left, source was corrupted
        return (bitlen % 8) === 0;
    }

    function constructYamlBinary(data) {
        var idx, tailbits,
            input = data.replace(/[\r\n=]/g, ''), // remove CR/LF & padding to simplify scan
            max = input.length,
            map = BASE64_MAP,
            bits = 0,
            result = [];

        // Collect by 6*4 bits (3 bytes)

        for (idx = 0; idx < max; idx++) {
            if ((idx % 4 === 0) && idx) {
                result.push((bits >> 16) & 0xFF);
                result.push((bits >> 8) & 0xFF);
                result.push(bits & 0xFF);
            }

            bits = (bits << 6) | map.indexOf(input.charAt(idx));
        }

        // Dump tail

        tailbits = (max % 4) * 6;

        if (tailbits === 0) {
            result.push((bits >> 16) & 0xFF);
            result.push((bits >> 8) & 0xFF);
            result.push(bits & 0xFF);
        } else if (tailbits === 18) {
            result.push((bits >> 10) & 0xFF);
            result.push((bits >> 2) & 0xFF);
        } else if (tailbits === 12) {
            result.push((bits >> 4) & 0xFF);
        }

        return new Uint8Array(result);
    }

    function representYamlBinary(object /*, style*/) {
        var result = '', bits = 0, idx, tail,
            max = object.length,
            map = BASE64_MAP;

        // Convert every three bytes to 4 ASCII characters.

        for (idx = 0; idx < max; idx++) {
            if ((idx % 3 === 0) && idx) {
                result += map[(bits >> 18) & 0x3F];
                result += map[(bits >> 12) & 0x3F];
                result += map[(bits >> 6) & 0x3F];
                result += map[bits & 0x3F];
            }

            bits = (bits << 8) + object[idx];
        }

        // Dump tail

        tail = max % 3;

        if (tail === 0) {
            result += map[(bits >> 18) & 0x3F];
            result += map[(bits >> 12) & 0x3F];
            result += map[(bits >> 6) & 0x3F];
            result += map[bits & 0x3F];
        } else if (tail === 2) {
            result += map[(bits >> 10) & 0x3F];
            result += map[(bits >> 4) & 0x3F];
            result += map[(bits << 2) & 0x3F];
            result += map[64];
        } else if (tail === 1) {
            result += map[(bits >> 2) & 0x3F];
            result += map[(bits << 4) & 0x3F];
            result += map[64];
            result += map[64];
        }

        return result;
    }

    function isBinary(obj) {
        return Object.prototype.toString.call(obj) === '[object Uint8Array]';
    }

    var binary = new type('tag:yaml.org,2002:binary', {
        kind: 'scalar',
        resolve: resolveYamlBinary,
        construct: constructYamlBinary,
        predicate: isBinary,
        represent: representYamlBinary
    });

    var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
    var _toString$2 = Object.prototype.toString;

    function resolveYamlOmap(data) {
        if (data === null) return true;

        var objectKeys = [], index, length, pair, pairKey, pairHasKey,
            object = data;

        for (index = 0, length = object.length; index < length; index += 1) {
            pair = object[index];
            pairHasKey = false;

            if (_toString$2.call(pair) !== '[object Object]') return false;

            for (pairKey in pair) {
                if (_hasOwnProperty$3.call(pair, pairKey)) {
                    if (!pairHasKey) pairHasKey = true;
                    else return false;
                }
            }

            if (!pairHasKey) return false;

            if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
            else return false;
        }

        return true;
    }

    function constructYamlOmap(data) {
        return data !== null ? data : [];
    }

    var omap = new type('tag:yaml.org,2002:omap', {
        kind: 'sequence',
        resolve: resolveYamlOmap,
        construct: constructYamlOmap
    });

    var _toString$1 = Object.prototype.toString;

    function resolveYamlPairs(data) {
        if (data === null) return true;

        var index, length, pair, keys, result,
            object = data;

        result = new Array(object.length);

        for (index = 0, length = object.length; index < length; index += 1) {
            pair = object[index];

            if (_toString$1.call(pair) !== '[object Object]') return false;

            keys = Object.keys(pair);

            if (keys.length !== 1) return false;

            result[index] = [keys[0], pair[keys[0]]];
        }

        return true;
    }

    function constructYamlPairs(data) {
        if (data === null) return [];

        var index, length, pair, keys, result,
            object = data;

        result = new Array(object.length);

        for (index = 0, length = object.length; index < length; index += 1) {
            pair = object[index];

            keys = Object.keys(pair);

            result[index] = [keys[0], pair[keys[0]]];
        }

        return result;
    }

    var pairs = new type('tag:yaml.org,2002:pairs', {
        kind: 'sequence',
        resolve: resolveYamlPairs,
        construct: constructYamlPairs
    });

    var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;

    function resolveYamlSet(data) {
        if (data === null) return true;

        var key, object = data;

        for (key in object) {
            if (_hasOwnProperty$2.call(object, key)) {
                if (object[key] !== null) return false;
            }
        }

        return true;
    }

    function constructYamlSet(data) {
        return data !== null ? data : {};
    }

    var set = new type('tag:yaml.org,2002:set', {
        kind: 'mapping',
        resolve: resolveYamlSet,
        construct: constructYamlSet
    });

    var _default = core.extend({
        implicit: [
            timestamp,
            merge
        ],
        explicit: [
            binary,
            omap,
            pairs,
            set
        ]
    });

    /*eslint-disable max-len,no-use-before-define*/


    var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;


    var CONTEXT_FLOW_IN = 1;
    var CONTEXT_FLOW_OUT = 2;
    var CONTEXT_BLOCK_IN = 3;
    var CONTEXT_BLOCK_OUT = 4;


    var CHOMPING_CLIP = 1;
    var CHOMPING_STRIP = 2;
    var CHOMPING_KEEP = 3;


    var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
    var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
    var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
    var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
    var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;


    function _class(obj) {
        return Object.prototype.toString.call(obj);
    }

    function is_EOL(c) {
        return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
    }

    function is_WHITE_SPACE(c) {
        return (c === 0x09/* Tab */) || (c === 0x20/* Space */);
    }

    function is_WS_OR_EOL(c) {
        return (c === 0x09/* Tab */) ||
            (c === 0x20/* Space */) ||
            (c === 0x0A/* LF */) ||
            (c === 0x0D/* CR */);
    }

    function is_FLOW_INDICATOR(c) {
        return c === 0x2C/* , */ ||
            c === 0x5B/* [ */ ||
            c === 0x5D/* ] */ ||
            c === 0x7B/* { */ ||
            c === 0x7D/* } */;
    }

    function fromHexCode(c) {
        var lc;

        if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
            return c - 0x30;
        }

        /*eslint-disable no-bitwise*/
        lc = c | 0x20;

        if ((0x61/* a */ <= lc) && (lc <= 0x66/* f */)) {
            return lc - 0x61 + 10;
        }

        return -1;
    }

    function escapedHexLen(c) {
        if (c === 0x78/* x */) {
            return 2;
        }
        if (c === 0x75/* u */) {
            return 4;
        }
        if (c === 0x55/* U */) {
            return 8;
        }
        return 0;
    }

    function fromDecimalCode(c) {
        if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
            return c - 0x30;
        }

        return -1;
    }

    function simpleEscapeSequence(c) {
        /* eslint-disable indent */
        return (c === 0x30/* 0 */) ? '\x00' :
            (c === 0x61/* a */) ? '\x07' :
                (c === 0x62/* b */) ? '\x08' :
                    (c === 0x74/* t */) ? '\x09' :
                        (c === 0x09/* Tab */) ? '\x09' :
                            (c === 0x6E/* n */) ? '\x0A' :
                                (c === 0x76/* v */) ? '\x0B' :
                                    (c === 0x66/* f */) ? '\x0C' :
                                        (c === 0x72/* r */) ? '\x0D' :
                                            (c === 0x65/* e */) ? '\x1B' :
                                                (c === 0x20/* Space */) ? ' ' :
                                                    (c === 0x22/* " */) ? '\x22' :
                                                        (c === 0x2F/* / */) ? '/' :
                                                            (c === 0x5C/* \ */) ? '\x5C' :
                                                                (c === 0x4E/* N */) ? '\x85' :
                                                                    (c === 0x5F/* _ */) ? '\xA0' :
                                                                        (c === 0x4C/* L */) ? '\u2028' :
                                                                            (c === 0x50/* P */) ? '\u2029' : '';
    }

    function charFromCodepoint(c) {
        if (c <= 0xFFFF) {
            return String.fromCharCode(c);
        }
        // Encode UTF-16 surrogate pair
        // https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF
        return String.fromCharCode(
            ((c - 0x010000) >> 10) + 0xD800,
            ((c - 0x010000) & 0x03FF) + 0xDC00
        );
    }

    var simpleEscapeCheck = new Array(256); // integer, for fast access
    var simpleEscapeMap = new Array(256);
    for (var i = 0; i < 256; i++) {
        simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
        simpleEscapeMap[i] = simpleEscapeSequence(i);
    }


    function State$1(input, options) {
        this.input = input;

        this.filename = options['filename'] || null;
        this.schema = options['schema'] || _default;
        this.onWarning = options['onWarning'] || null;
        // (Hidden) Remove? makes the loader to expect YAML 1.1 documents
        // if such documents have no explicit %YAML directive
        this.legacy = options['legacy'] || false;

        this.json = options['json'] || false;
        this.listener = options['listener'] || null;

        this.implicitTypes = this.schema.compiledImplicit;
        this.typeMap = this.schema.compiledTypeMap;

        this.length = input.length;
        this.position = 0;
        this.line = 0;
        this.lineStart = 0;
        this.lineIndent = 0;

        // position of first leading tab in the current line,
        // used to make sure there are no tabs in the indentation
        this.firstTabInLine = -1;

        this.documents = [];

        /*
        this.version;
        this.checkLineBreaks;
        this.tagMap;
        this.anchorMap;
        this.tag;
        this.anchor;
        this.kind;
        this.result;*/

    }


    function generateError(state, message) {
        var mark = {
            name: state.filename,
            buffer: state.input.slice(0, -1), // omit trailing \0
            position: state.position,
            line: state.line,
            column: state.position - state.lineStart
        };

        mark.snippet = snippet(mark);

        return new exception(message, mark);
    }

    function throwError(state, message) {
        throw generateError(state, message);
    }

    function throwWarning(state, message) {
        if (state.onWarning) {
            state.onWarning.call(null, generateError(state, message));
        }
    }


    var directiveHandlers = {

        YAML: function handleYamlDirective(state, name, args) {

            var match, major, minor;

            if (state.version !== null) {
                throwError(state, 'duplication of %YAML directive');
            }

            if (args.length !== 1) {
                throwError(state, 'YAML directive accepts exactly one argument');
            }

            match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);

            if (match === null) {
                throwError(state, 'ill-formed argument of the YAML directive');
            }

            major = parseInt(match[1], 10);
            minor = parseInt(match[2], 10);

            if (major !== 1) {
                throwError(state, 'unacceptable YAML version of the document');
            }

            state.version = args[0];
            state.checkLineBreaks = (minor < 2);

            if (minor !== 1 && minor !== 2) {
                throwWarning(state, 'unsupported YAML version of the document');
            }
        },

        TAG: function handleTagDirective(state, name, args) {

            var handle, prefix;

            if (args.length !== 2) {
                throwError(state, 'TAG directive accepts exactly two arguments');
            }

            handle = args[0];
            prefix = args[1];

            if (!PATTERN_TAG_HANDLE.test(handle)) {
                throwError(state, 'ill-formed tag handle (first argument) of the TAG directive');
            }

            if (_hasOwnProperty$1.call(state.tagMap, handle)) {
                throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
            }

            if (!PATTERN_TAG_URI.test(prefix)) {
                throwError(state, 'ill-formed tag prefix (second argument) of the TAG directive');
            }

            try {
                prefix = decodeURIComponent(prefix);
            } catch (err) {
                throwError(state, 'tag prefix is malformed: ' + prefix);
            }

            state.tagMap[handle] = prefix;
        }
    };


    function captureSegment(state, start, end, checkJson) {
        var _position, _length, _character, _result;

        if (start < end) {
            _result = state.input.slice(start, end);

            if (checkJson) {
                for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
                    _character = _result.charCodeAt(_position);
                    if (!(_character === 0x09 ||
                        (0x20 <= _character && _character <= 0x10FFFF))) {
                        throwError(state, 'expected valid JSON character');
                    }
                }
            } else if (PATTERN_NON_PRINTABLE.test(_result)) {
                throwError(state, 'the stream contains non-printable characters');
            }

            state.result += _result;
        }
    }

    function mergeMappings(state, destination, source, overridableKeys) {
        var sourceKeys, key, index, quantity;

        if (!common.isObject(source)) {
            throwError(state, 'cannot merge mappings; the provided source object is unacceptable');
        }

        sourceKeys = Object.keys(source);

        for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
            key = sourceKeys[index];

            if (!_hasOwnProperty$1.call(destination, key)) {
                destination[key] = source[key];
                overridableKeys[key] = true;
            }
        }
    }

    function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode,
                              startLine, startLineStart, startPos) {

        var index, quantity;

        // The output is a plain object here, so keys can only be strings.
        // We need to convert keyNode to a string, but doing so can hang the process
        // (deeply nested arrays that explode exponentially using aliases).
        if (Array.isArray(keyNode)) {
            keyNode = Array.prototype.slice.call(keyNode);

            for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
                if (Array.isArray(keyNode[index])) {
                    throwError(state, 'nested arrays are not supported inside keys');
                }

                if (typeof keyNode === 'object' && _class(keyNode[index]) === '[object Object]') {
                    keyNode[index] = '[object Object]';
                }
            }
        }

        // Avoid code execution in load() via toString property
        // (still use its own toString for arrays, timestamps,
        // and whatever user schema extensions happen to have @@toStringTag)
        if (typeof keyNode === 'object' && _class(keyNode) === '[object Object]') {
            keyNode = '[object Object]';
        }


        keyNode = String(keyNode);

        if (_result === null) {
            _result = {};
        }

        if (keyTag === 'tag:yaml.org,2002:merge') {
            if (Array.isArray(valueNode)) {
                for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
                    mergeMappings(state, _result, valueNode[index], overridableKeys);
                }
            } else {
                mergeMappings(state, _result, valueNode, overridableKeys);
            }
        } else {
            if (!state.json &&
                !_hasOwnProperty$1.call(overridableKeys, keyNode) &&
                _hasOwnProperty$1.call(_result, keyNode)) {
                state.line = startLine || state.line;
                state.lineStart = startLineStart || state.lineStart;
                state.position = startPos || state.position;
                throwError(state, 'duplicated mapping key');
            }

            // used for this specific key only because Object.defineProperty is slow
            if (keyNode === '__proto__') {
                Object.defineProperty(_result, keyNode, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: valueNode
                });
            } else {
                _result[keyNode] = valueNode;
            }
            delete overridableKeys[keyNode];
        }

        return _result;
    }

    function readLineBreak(state) {
        var ch;

        ch = state.input.charCodeAt(state.position);

        if (ch === 0x0A/* LF */) {
            state.position++;
        } else if (ch === 0x0D/* CR */) {
            state.position++;
            if (state.input.charCodeAt(state.position) === 0x0A/* LF */) {
                state.position++;
            }
        } else {
            throwError(state, 'a line break is expected');
        }

        state.line += 1;
        state.lineStart = state.position;
        state.firstTabInLine = -1;
    }

    function skipSeparationSpace(state, allowComments, checkIndent) {
        var lineBreaks = 0,
            ch = state.input.charCodeAt(state.position);

        while (ch !== 0) {
            while (is_WHITE_SPACE(ch)) {
                if (ch === 0x09/* Tab */ && state.firstTabInLine === -1) {
                    state.firstTabInLine = state.position;
                }
                ch = state.input.charCodeAt(++state.position);
            }

            if (allowComments && ch === 0x23/* # */) {
                do {
                    ch = state.input.charCodeAt(++state.position);
                } while (ch !== 0x0A/* LF */ && ch !== 0x0D/* CR */ && ch !== 0);
            }

            if (is_EOL(ch)) {
                readLineBreak(state);

                ch = state.input.charCodeAt(state.position);
                lineBreaks++;
                state.lineIndent = 0;

                while (ch === 0x20/* Space */) {
                    state.lineIndent++;
                    ch = state.input.charCodeAt(++state.position);
                }
            } else {
                break;
            }
        }

        if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
            throwWarning(state, 'deficient indentation');
        }

        return lineBreaks;
    }

    function testDocumentSeparator(state) {
        var _position = state.position,
            ch;

        ch = state.input.charCodeAt(_position);

        // Condition state.position === state.lineStart is tested
        // in parent on each call, for efficiency. No needs to test here again.
        if ((ch === 0x2D/* - */ || ch === 0x2E/* . */) &&
            ch === state.input.charCodeAt(_position + 1) &&
            ch === state.input.charCodeAt(_position + 2)) {

            _position += 3;

            ch = state.input.charCodeAt(_position);

            if (ch === 0 || is_WS_OR_EOL(ch)) {
                return true;
            }
        }

        return false;
    }

    function writeFoldedLines(state, count) {
        if (count === 1) {
            state.result += ' ';
        } else if (count > 1) {
            state.result += common.repeat('\n', count - 1);
        }
    }


    function readPlainScalar(state, nodeIndent, withinFlowCollection) {
        var preceding,
            following,
            captureStart,
            captureEnd,
            hasPendingContent,
            _line,
            _lineStart,
            _lineIndent,
            _kind = state.kind,
            _result = state.result,
            ch;

        ch = state.input.charCodeAt(state.position);

        if (is_WS_OR_EOL(ch) ||
            is_FLOW_INDICATOR(ch) ||
            ch === 0x23/* # */ ||
            ch === 0x26/* & */ ||
            ch === 0x2A/* * */ ||
            ch === 0x21/* ! */ ||
            ch === 0x7C/* | */ ||
            ch === 0x3E/* > */ ||
            ch === 0x27/* ' */ ||
            ch === 0x22/* " */ ||
            ch === 0x25/* % */ ||
            ch === 0x40/* @ */ ||
            ch === 0x60/* ` */) {
            return false;
        }

        if (ch === 0x3F/* ? */ || ch === 0x2D/* - */) {
            following = state.input.charCodeAt(state.position + 1);

            if (is_WS_OR_EOL(following) ||
                withinFlowCollection && is_FLOW_INDICATOR(following)) {
                return false;
            }
        }

        state.kind = 'scalar';
        state.result = '';
        captureStart = captureEnd = state.position;
        hasPendingContent = false;

        while (ch !== 0) {
            if (ch === 0x3A/* : */) {
                following = state.input.charCodeAt(state.position + 1);

                if (is_WS_OR_EOL(following) ||
                    withinFlowCollection && is_FLOW_INDICATOR(following)) {
                    break;
                }

            } else if (ch === 0x23/* # */) {
                preceding = state.input.charCodeAt(state.position - 1);

                if (is_WS_OR_EOL(preceding)) {
                    break;
                }

            } else if ((state.position === state.lineStart && testDocumentSeparator(state)) ||
                withinFlowCollection && is_FLOW_INDICATOR(ch)) {
                break;

            } else if (is_EOL(ch)) {
                _line = state.line;
                _lineStart = state.lineStart;
                _lineIndent = state.lineIndent;
                skipSeparationSpace(state, false, -1);

                if (state.lineIndent >= nodeIndent) {
                    hasPendingContent = true;
                    ch = state.input.charCodeAt(state.position);
                    continue;
                } else {
                    state.position = captureEnd;
                    state.line = _line;
                    state.lineStart = _lineStart;
                    state.lineIndent = _lineIndent;
                    break;
                }
            }

            if (hasPendingContent) {
                captureSegment(state, captureStart, captureEnd, false);
                writeFoldedLines(state, state.line - _line);
                captureStart = captureEnd = state.position;
                hasPendingContent = false;
            }

            if (!is_WHITE_SPACE(ch)) {
                captureEnd = state.position + 1;
            }

            ch = state.input.charCodeAt(++state.position);
        }

        captureSegment(state, captureStart, captureEnd, false);

        if (state.result) {
            return true;
        }

        state.kind = _kind;
        state.result = _result;
        return false;
    }

    function readSingleQuotedScalar(state, nodeIndent) {
        var ch,
            captureStart, captureEnd;

        ch = state.input.charCodeAt(state.position);

        if (ch !== 0x27/* ' */) {
            return false;
        }

        state.kind = 'scalar';
        state.result = '';
        state.position++;
        captureStart = captureEnd = state.position;

        while ((ch = state.input.charCodeAt(state.position)) !== 0) {
            if (ch === 0x27/* ' */) {
                captureSegment(state, captureStart, state.position, true);
                ch = state.input.charCodeAt(++state.position);

                if (ch === 0x27/* ' */) {
                    captureStart = state.position;
                    state.position++;
                    captureEnd = state.position;
                } else {
                    return true;
                }

            } else if (is_EOL(ch)) {
                captureSegment(state, captureStart, captureEnd, true);
                writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
                captureStart = captureEnd = state.position;

            } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
                throwError(state, 'unexpected end of the document within a single quoted scalar');

            } else {
                state.position++;
                captureEnd = state.position;
            }
        }

        throwError(state, 'unexpected end of the stream within a single quoted scalar');
    }

    function readDoubleQuotedScalar(state, nodeIndent) {
        var captureStart,
            captureEnd,
            hexLength,
            hexResult,
            tmp,
            ch;

        ch = state.input.charCodeAt(state.position);

        if (ch !== 0x22/* " */) {
            return false;
        }

        state.kind = 'scalar';
        state.result = '';
        state.position++;
        captureStart = captureEnd = state.position;

        while ((ch = state.input.charCodeAt(state.position)) !== 0) {
            if (ch === 0x22/* " */) {
                captureSegment(state, captureStart, state.position, true);
                state.position++;
                return true;

            } else if (ch === 0x5C/* \ */) {
                captureSegment(state, captureStart, state.position, true);
                ch = state.input.charCodeAt(++state.position);

                if (is_EOL(ch)) {
                    skipSeparationSpace(state, false, nodeIndent);

                    // TODO: rework to inline fn with no type cast?
                } else if (ch < 256 && simpleEscapeCheck[ch]) {
                    state.result += simpleEscapeMap[ch];
                    state.position++;

                } else if ((tmp = escapedHexLen(ch)) > 0) {
                    hexLength = tmp;
                    hexResult = 0;

                    for (; hexLength > 0; hexLength--) {
                        ch = state.input.charCodeAt(++state.position);

                        if ((tmp = fromHexCode(ch)) >= 0) {
                            hexResult = (hexResult << 4) + tmp;

                        } else {
                            throwError(state, 'expected hexadecimal character');
                        }
                    }

                    state.result += charFromCodepoint(hexResult);

                    state.position++;

                } else {
                    throwError(state, 'unknown escape sequence');
                }

                captureStart = captureEnd = state.position;

            } else if (is_EOL(ch)) {
                captureSegment(state, captureStart, captureEnd, true);
                writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
                captureStart = captureEnd = state.position;

            } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
                throwError(state, 'unexpected end of the document within a double quoted scalar');

            } else {
                state.position++;
                captureEnd = state.position;
            }
        }

        throwError(state, 'unexpected end of the stream within a double quoted scalar');
    }

    function readFlowCollection(state, nodeIndent) {
        var readNext = true,
            _line,
            _lineStart,
            _pos,
            _tag = state.tag,
            _result,
            _anchor = state.anchor,
            following,
            terminator,
            isPair,
            isExplicitPair,
            isMapping,
            overridableKeys = Object.create(null),
            keyNode,
            keyTag,
            valueNode,
            ch;

        ch = state.input.charCodeAt(state.position);

        if (ch === 0x5B/* [ */) {
            terminator = 0x5D;/* ] */
            isMapping = false;
            _result = [];
        } else if (ch === 0x7B/* { */) {
            terminator = 0x7D;/* } */
            isMapping = true;
            _result = {};
        } else {
            return false;
        }

        if (state.anchor !== null) {
            state.anchorMap[state.anchor] = _result;
        }

        ch = state.input.charCodeAt(++state.position);

        while (ch !== 0) {
            skipSeparationSpace(state, true, nodeIndent);

            ch = state.input.charCodeAt(state.position);

            if (ch === terminator) {
                state.position++;
                state.tag = _tag;
                state.anchor = _anchor;
                state.kind = isMapping ? 'mapping' : 'sequence';
                state.result = _result;
                return true;
            } else if (!readNext) {
                throwError(state, 'missed comma between flow collection entries');
            } else if (ch === 0x2C/* , */) {
                // "flow collection entries can never be completely empty", as per YAML 1.2, section 7.4
                throwError(state, "expected the node content, but found ','");
            }

            keyTag = keyNode = valueNode = null;
            isPair = isExplicitPair = false;

            if (ch === 0x3F/* ? */) {
                following = state.input.charCodeAt(state.position + 1);

                if (is_WS_OR_EOL(following)) {
                    isPair = isExplicitPair = true;
                    state.position++;
                    skipSeparationSpace(state, true, nodeIndent);
                }
            }

            _line = state.line; // Save the current line.
            _lineStart = state.lineStart;
            _pos = state.position;
            composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
            keyTag = state.tag;
            keyNode = state.result;
            skipSeparationSpace(state, true, nodeIndent);

            ch = state.input.charCodeAt(state.position);

            if ((isExplicitPair || state.line === _line) && ch === 0x3A/* : */) {
                isPair = true;
                ch = state.input.charCodeAt(++state.position);
                skipSeparationSpace(state, true, nodeIndent);
                composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
                valueNode = state.result;
            }

            if (isMapping) {
                storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
            } else if (isPair) {
                _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
            } else {
                _result.push(keyNode);
            }

            skipSeparationSpace(state, true, nodeIndent);

            ch = state.input.charCodeAt(state.position);

            if (ch === 0x2C/* , */) {
                readNext = true;
                ch = state.input.charCodeAt(++state.position);
            } else {
                readNext = false;
            }
        }

        throwError(state, 'unexpected end of the stream within a flow collection');
    }

    function readBlockScalar(state, nodeIndent) {
        var captureStart,
            folding,
            chomping = CHOMPING_CLIP,
            didReadContent = false,
            detectedIndent = false,
            textIndent = nodeIndent,
            emptyLines = 0,
            atMoreIndented = false,
            tmp,
            ch;

        ch = state.input.charCodeAt(state.position);

        if (ch === 0x7C/* | */) {
            folding = false;
        } else if (ch === 0x3E/* > */) {
            folding = true;
        } else {
            return false;
        }

        state.kind = 'scalar';
        state.result = '';

        while (ch !== 0) {
            ch = state.input.charCodeAt(++state.position);

            if (ch === 0x2B/* + */ || ch === 0x2D/* - */) {
                if (CHOMPING_CLIP === chomping) {
                    chomping = (ch === 0x2B/* + */) ? CHOMPING_KEEP : CHOMPING_STRIP;
                } else {
                    throwError(state, 'repeat of a chomping mode identifier');
                }

            } else if ((tmp = fromDecimalCode(ch)) >= 0) {
                if (tmp === 0) {
                    throwError(state, 'bad explicit indentation width of a block scalar; it cannot be less than one');
                } else if (!detectedIndent) {
                    textIndent = nodeIndent + tmp - 1;
                    detectedIndent = true;
                } else {
                    throwError(state, 'repeat of an indentation width identifier');
                }

            } else {
                break;
            }
        }

        if (is_WHITE_SPACE(ch)) {
            do {
                ch = state.input.charCodeAt(++state.position);
            }
            while (is_WHITE_SPACE(ch));

            if (ch === 0x23/* # */) {
                do {
                    ch = state.input.charCodeAt(++state.position);
                }
                while (!is_EOL(ch) && (ch !== 0));
            }
        }

        while (ch !== 0) {
            readLineBreak(state);
            state.lineIndent = 0;

            ch = state.input.charCodeAt(state.position);

            while ((!detectedIndent || state.lineIndent < textIndent) &&
            (ch === 0x20/* Space */)) {
                state.lineIndent++;
                ch = state.input.charCodeAt(++state.position);
            }

            if (!detectedIndent && state.lineIndent > textIndent) {
                textIndent = state.lineIndent;
            }

            if (is_EOL(ch)) {
                emptyLines++;
                continue;
            }

            // End of the scalar.
            if (state.lineIndent < textIndent) {

                // Perform the chomping.
                if (chomping === CHOMPING_KEEP) {
                    state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
                } else if (chomping === CHOMPING_CLIP) {
                    if (didReadContent) { // i.e. only if the scalar is not empty.
                        state.result += '\n';
                    }
                }

                // Break this `while` cycle and go to the funciton's epilogue.
                break;
            }

            // Folded style: use fancy rules to handle line breaks.
            if (folding) {

                // Lines starting with white space characters (more-indented lines) are not folded.
                if (is_WHITE_SPACE(ch)) {
                    atMoreIndented = true;
                    // except for the first content line (cf. Example 8.1)
                    state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);

                    // End of more-indented block.
                } else if (atMoreIndented) {
                    atMoreIndented = false;
                    state.result += common.repeat('\n', emptyLines + 1);

                    // Just one line break - perceive as the same line.
                } else if (emptyLines === 0) {
                    if (didReadContent) { // i.e. only if we have already read some scalar content.
                        state.result += ' ';
                    }

                    // Several line breaks - perceive as different lines.
                } else {
                    state.result += common.repeat('\n', emptyLines);
                }

                // Literal style: just add exact number of line breaks between content lines.
            } else {
                // Keep all line breaks except the header line break.
                state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
            }

            didReadContent = true;
            detectedIndent = true;
            emptyLines = 0;
            captureStart = state.position;

            while (!is_EOL(ch) && (ch !== 0)) {
                ch = state.input.charCodeAt(++state.position);
            }

            captureSegment(state, captureStart, state.position, false);
        }

        return true;
    }

    function readBlockSequence(state, nodeIndent) {
        var _line,
            _tag = state.tag,
            _anchor = state.anchor,
            _result = [],
            following,
            detected = false,
            ch;

        // there is a leading tab before this token, so it can't be a block sequence/mapping;
        // it can still be flow sequence/mapping or a scalar
        if (state.firstTabInLine !== -1) return false;

        if (state.anchor !== null) {
            state.anchorMap[state.anchor] = _result;
        }

        ch = state.input.charCodeAt(state.position);

        while (ch !== 0) {
            if (state.firstTabInLine !== -1) {
                state.position = state.firstTabInLine;
                throwError(state, 'tab characters must not be used in indentation');
            }

            if (ch !== 0x2D/* - */) {
                break;
            }

            following = state.input.charCodeAt(state.position + 1);

            if (!is_WS_OR_EOL(following)) {
                break;
            }

            detected = true;
            state.position++;

            if (skipSeparationSpace(state, true, -1)) {
                if (state.lineIndent <= nodeIndent) {
                    _result.push(null);
                    ch = state.input.charCodeAt(state.position);
                    continue;
                }
            }

            _line = state.line;
            composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
            _result.push(state.result);
            skipSeparationSpace(state, true, -1);

            ch = state.input.charCodeAt(state.position);

            if ((state.line === _line || state.lineIndent > nodeIndent) && (ch !== 0)) {
                throwError(state, 'bad indentation of a sequence entry');
            } else if (state.lineIndent < nodeIndent) {
                break;
            }
        }

        if (detected) {
            state.tag = _tag;
            state.anchor = _anchor;
            state.kind = 'sequence';
            state.result = _result;
            return true;
        }
        return false;
    }

    function readBlockMapping(state, nodeIndent, flowIndent) {
        var following,
            allowCompact,
            _line,
            _keyLine,
            _keyLineStart,
            _keyPos,
            _tag = state.tag,
            _anchor = state.anchor,
            _result = {},
            overridableKeys = Object.create(null),
            keyTag = null,
            keyNode = null,
            valueNode = null,
            atExplicitKey = false,
            detected = false,
            ch;

        // there is a leading tab before this token, so it can't be a block sequence/mapping;
        // it can still be flow sequence/mapping or a scalar
        if (state.firstTabInLine !== -1) return false;

        if (state.anchor !== null) {
            state.anchorMap[state.anchor] = _result;
        }

        ch = state.input.charCodeAt(state.position);

        while (ch !== 0) {
            if (!atExplicitKey && state.firstTabInLine !== -1) {
                state.position = state.firstTabInLine;
                throwError(state, 'tab characters must not be used in indentation');
            }

            following = state.input.charCodeAt(state.position + 1);
            _line = state.line; // Save the current line.

            //
            // Explicit notation case. There are two separate blocks:
            // first for the key (denoted by "?") and second for the value (denoted by ":")
            //
            if ((ch === 0x3F/* ? */ || ch === 0x3A/* : */) && is_WS_OR_EOL(following)) {

                if (ch === 0x3F/* ? */) {
                    if (atExplicitKey) {
                        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
                        keyTag = keyNode = valueNode = null;
                    }

                    detected = true;
                    atExplicitKey = true;
                    allowCompact = true;

                } else if (atExplicitKey) {
                    // i.e. 0x3A/* : */ === character after the explicit key.
                    atExplicitKey = false;
                    allowCompact = true;

                } else {
                    throwError(state, 'incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line');
                }

                state.position += 1;
                ch = following;

                //
                // Implicit notation case. Flow-style node as the key first, then ":", and the value.
                //
            } else {
                _keyLine = state.line;
                _keyLineStart = state.lineStart;
                _keyPos = state.position;

                if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
                    // Neither implicit nor explicit notation.
                    // Reading is done. Go to the epilogue.
                    break;
                }

                if (state.line === _line) {
                    ch = state.input.charCodeAt(state.position);

                    while (is_WHITE_SPACE(ch)) {
                        ch = state.input.charCodeAt(++state.position);
                    }

                    if (ch === 0x3A/* : */) {
                        ch = state.input.charCodeAt(++state.position);

                        if (!is_WS_OR_EOL(ch)) {
                            throwError(state, 'a whitespace character is expected after the key-value separator within a block mapping');
                        }

                        if (atExplicitKey) {
                            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
                            keyTag = keyNode = valueNode = null;
                        }

                        detected = true;
                        atExplicitKey = false;
                        allowCompact = false;
                        keyTag = state.tag;
                        keyNode = state.result;

                    } else if (detected) {
                        throwError(state, 'can not read an implicit mapping pair; a colon is missed');

                    } else {
                        state.tag = _tag;
                        state.anchor = _anchor;
                        return true; // Keep the result of `composeNode`.
                    }

                } else if (detected) {
                    throwError(state, 'can not read a block mapping entry; a multiline key may not be an implicit key');

                } else {
                    state.tag = _tag;
                    state.anchor = _anchor;
                    return true; // Keep the result of `composeNode`.
                }
            }

            //
            // Common reading code for both explicit and implicit notations.
            //
            if (state.line === _line || state.lineIndent > nodeIndent) {
                if (atExplicitKey) {
                    _keyLine = state.line;
                    _keyLineStart = state.lineStart;
                    _keyPos = state.position;
                }

                if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
                    if (atExplicitKey) {
                        keyNode = state.result;
                    } else {
                        valueNode = state.result;
                    }
                }

                if (!atExplicitKey) {
                    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
                    keyTag = keyNode = valueNode = null;
                }

                skipSeparationSpace(state, true, -1);
                ch = state.input.charCodeAt(state.position);
            }

            if ((state.line === _line || state.lineIndent > nodeIndent) && (ch !== 0)) {
                throwError(state, 'bad indentation of a mapping entry');
            } else if (state.lineIndent < nodeIndent) {
                break;
            }
        }

        //
        // Epilogue.
        //

        // Special case: last mapping's node contains only the key in explicit notation.
        if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
        }

        // Expose the resulting mapping.
        if (detected) {
            state.tag = _tag;
            state.anchor = _anchor;
            state.kind = 'mapping';
            state.result = _result;
        }

        return detected;
    }

    function readTagProperty(state) {
        var _position,
            isVerbatim = false,
            isNamed = false,
            tagHandle,
            tagName,
            ch;

        ch = state.input.charCodeAt(state.position);

        if (ch !== 0x21/* ! */) return false;

        if (state.tag !== null) {
            throwError(state, 'duplication of a tag property');
        }

        ch = state.input.charCodeAt(++state.position);

        if (ch === 0x3C/* < */) {
            isVerbatim = true;
            ch = state.input.charCodeAt(++state.position);

        } else if (ch === 0x21/* ! */) {
            isNamed = true;
            tagHandle = '!!';
            ch = state.input.charCodeAt(++state.position);

        } else {
            tagHandle = '!';
        }

        _position = state.position;

        if (isVerbatim) {
            do {
                ch = state.input.charCodeAt(++state.position);
            }
            while (ch !== 0 && ch !== 0x3E/* > */);

            if (state.position < state.length) {
                tagName = state.input.slice(_position, state.position);
                ch = state.input.charCodeAt(++state.position);
            } else {
                throwError(state, 'unexpected end of the stream within a verbatim tag');
            }
        } else {
            while (ch !== 0 && !is_WS_OR_EOL(ch)) {

                if (ch === 0x21/* ! */) {
                    if (!isNamed) {
                        tagHandle = state.input.slice(_position - 1, state.position + 1);

                        if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
                            throwError(state, 'named tag handle cannot contain such characters');
                        }

                        isNamed = true;
                        _position = state.position + 1;
                    } else {
                        throwError(state, 'tag suffix cannot contain exclamation marks');
                    }
                }

                ch = state.input.charCodeAt(++state.position);
            }

            tagName = state.input.slice(_position, state.position);

            if (PATTERN_FLOW_INDICATORS.test(tagName)) {
                throwError(state, 'tag suffix cannot contain flow indicator characters');
            }
        }

        if (tagName && !PATTERN_TAG_URI.test(tagName)) {
            throwError(state, 'tag name cannot contain such characters: ' + tagName);
        }

        try {
            tagName = decodeURIComponent(tagName);
        } catch (err) {
            throwError(state, 'tag name is malformed: ' + tagName);
        }

        if (isVerbatim) {
            state.tag = tagName;

        } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
            state.tag = state.tagMap[tagHandle] + tagName;

        } else if (tagHandle === '!') {
            state.tag = '!' + tagName;

        } else if (tagHandle === '!!') {
            state.tag = 'tag:yaml.org,2002:' + tagName;

        } else {
            throwError(state, 'undeclared tag handle "' + tagHandle + '"');
        }

        return true;
    }

    function readAnchorProperty(state) {
        var _position,
            ch;

        ch = state.input.charCodeAt(state.position);

        if (ch !== 0x26/* & */) return false;

        if (state.anchor !== null) {
            throwError(state, 'duplication of an anchor property');
        }

        ch = state.input.charCodeAt(++state.position);
        _position = state.position;

        while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
            ch = state.input.charCodeAt(++state.position);
        }

        if (state.position === _position) {
            throwError(state, 'name of an anchor node must contain at least one character');
        }

        state.anchor = state.input.slice(_position, state.position);
        return true;
    }

    function readAlias(state) {
        var _position, alias,
            ch;

        ch = state.input.charCodeAt(state.position);

        if (ch !== 0x2A/* * */) return false;

        ch = state.input.charCodeAt(++state.position);
        _position = state.position;

        while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
            ch = state.input.charCodeAt(++state.position);
        }

        if (state.position === _position) {
            throwError(state, 'name of an alias node must contain at least one character');
        }

        alias = state.input.slice(_position, state.position);

        if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
            throwError(state, 'unidentified alias "' + alias + '"');
        }

        state.result = state.anchorMap[alias];
        skipSeparationSpace(state, true, -1);
        return true;
    }

    function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
        var allowBlockStyles,
            allowBlockScalars,
            allowBlockCollections,
            indentStatus = 1, // 1: this>parent, 0: this=parent, -1: this<parent
            atNewLine = false,
            hasContent = false,
            typeIndex,
            typeQuantity,
            typeList,
            type,
            flowIndent,
            blockIndent;

        if (state.listener !== null) {
            state.listener('open', state);
        }

        state.tag = null;
        state.anchor = null;
        state.kind = null;
        state.result = null;

        allowBlockStyles = allowBlockScalars = allowBlockCollections =
            CONTEXT_BLOCK_OUT === nodeContext ||
            CONTEXT_BLOCK_IN === nodeContext;

        if (allowToSeek) {
            if (skipSeparationSpace(state, true, -1)) {
                atNewLine = true;

                if (state.lineIndent > parentIndent) {
                    indentStatus = 1;
                } else if (state.lineIndent === parentIndent) {
                    indentStatus = 0;
                } else if (state.lineIndent < parentIndent) {
                    indentStatus = -1;
                }
            }
        }

        if (indentStatus === 1) {
            while (readTagProperty(state) || readAnchorProperty(state)) {
                if (skipSeparationSpace(state, true, -1)) {
                    atNewLine = true;
                    allowBlockCollections = allowBlockStyles;

                    if (state.lineIndent > parentIndent) {
                        indentStatus = 1;
                    } else if (state.lineIndent === parentIndent) {
                        indentStatus = 0;
                    } else if (state.lineIndent < parentIndent) {
                        indentStatus = -1;
                    }
                } else {
                    allowBlockCollections = false;
                }
            }
        }

        if (allowBlockCollections) {
            allowBlockCollections = atNewLine || allowCompact;
        }

        if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
            if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
                flowIndent = parentIndent;
            } else {
                flowIndent = parentIndent + 1;
            }

            blockIndent = state.position - state.lineStart;

            if (indentStatus === 1) {
                if (allowBlockCollections &&
                    (readBlockSequence(state, blockIndent) ||
                        readBlockMapping(state, blockIndent, flowIndent)) ||
                    readFlowCollection(state, flowIndent)) {
                    hasContent = true;
                } else {
                    if ((allowBlockScalars && readBlockScalar(state, flowIndent)) ||
                        readSingleQuotedScalar(state, flowIndent) ||
                        readDoubleQuotedScalar(state, flowIndent)) {
                        hasContent = true;

                    } else if (readAlias(state)) {
                        hasContent = true;

                        if (state.tag !== null || state.anchor !== null) {
                            throwError(state, 'alias node should not have any properties');
                        }

                    } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
                        hasContent = true;

                        if (state.tag === null) {
                            state.tag = '?';
                        }
                    }

                    if (state.anchor !== null) {
                        state.anchorMap[state.anchor] = state.result;
                    }
                }
            } else if (indentStatus === 0) {
                // Special case: block sequences are allowed to have same indentation level as the parent.
                // http://www.yaml.org/spec/1.2/spec.html#id2799784
                hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
            }
        }

        if (state.tag === null) {
            if (state.anchor !== null) {
                state.anchorMap[state.anchor] = state.result;
            }

        } else if (state.tag === '?') {
            // Implicit resolving is not allowed for non-scalar types, and '?'
            // non-specific tag is only automatically assigned to plain scalars.
            //
            // We only need to check kind conformity in case user explicitly assigns '?'
            // tag, for example like this: "!<?> [0]"
            //
            if (state.result !== null && state.kind !== 'scalar') {
                throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
            }

            for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
                type = state.implicitTypes[typeIndex];

                if (type.resolve(state.result)) { // `state.result` updated in resolver if matched
                    state.result = type.construct(state.result);
                    state.tag = type.tag;
                    if (state.anchor !== null) {
                        state.anchorMap[state.anchor] = state.result;
                    }
                    break;
                }
            }
        } else if (state.tag !== '!') {
            if (_hasOwnProperty$1.call(state.typeMap[state.kind || 'fallback'], state.tag)) {
                type = state.typeMap[state.kind || 'fallback'][state.tag];
            } else {
                // looking for multi type
                type = null;
                typeList = state.typeMap.multi[state.kind || 'fallback'];

                for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
                    if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
                        type = typeList[typeIndex];
                        break;
                    }
                }
            }

            if (!type) {
                throwError(state, 'unknown tag !<' + state.tag + '>');
            }

            if (state.result !== null && type.kind !== state.kind) {
                throwError(state, 'unacceptable node kind for !<' + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
            }

            if (!type.resolve(state.result, state.tag)) { // `state.result` updated in resolver if matched
                throwError(state, 'cannot resolve a node with !<' + state.tag + '> explicit tag');
            } else {
                state.result = type.construct(state.result, state.tag);
                if (state.anchor !== null) {
                    state.anchorMap[state.anchor] = state.result;
                }
            }
        }

        if (state.listener !== null) {
            state.listener('close', state);
        }
        return state.tag !== null || state.anchor !== null || hasContent;
    }

    function readDocument(state) {
        var documentStart = state.position,
            _position,
            directiveName,
            directiveArgs,
            hasDirectives = false,
            ch;

        state.version = null;
        state.checkLineBreaks = state.legacy;
        state.tagMap = Object.create(null);
        state.anchorMap = Object.create(null);

        while ((ch = state.input.charCodeAt(state.position)) !== 0) {
            skipSeparationSpace(state, true, -1);

            ch = state.input.charCodeAt(state.position);

            if (state.lineIndent > 0 || ch !== 0x25/* % */) {
                break;
            }

            hasDirectives = true;
            ch = state.input.charCodeAt(++state.position);
            _position = state.position;

            while (ch !== 0 && !is_WS_OR_EOL(ch)) {
                ch = state.input.charCodeAt(++state.position);
            }

            directiveName = state.input.slice(_position, state.position);
            directiveArgs = [];

            if (directiveName.length < 1) {
                throwError(state, 'directive name must not be less than one character in length');
            }

            while (ch !== 0) {
                while (is_WHITE_SPACE(ch)) {
                    ch = state.input.charCodeAt(++state.position);
                }

                if (ch === 0x23/* # */) {
                    do {
                        ch = state.input.charCodeAt(++state.position);
                    }
                    while (ch !== 0 && !is_EOL(ch));
                    break;
                }

                if (is_EOL(ch)) break;

                _position = state.position;

                while (ch !== 0 && !is_WS_OR_EOL(ch)) {
                    ch = state.input.charCodeAt(++state.position);
                }

                directiveArgs.push(state.input.slice(_position, state.position));
            }

            if (ch !== 0) readLineBreak(state);

            if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
                directiveHandlers[directiveName](state, directiveName, directiveArgs);
            } else {
                throwWarning(state, 'unknown document directive "' + directiveName + '"');
            }
        }

        skipSeparationSpace(state, true, -1);

        if (state.lineIndent === 0 &&
            state.input.charCodeAt(state.position) === 0x2D/* - */ &&
            state.input.charCodeAt(state.position + 1) === 0x2D/* - */ &&
            state.input.charCodeAt(state.position + 2) === 0x2D/* - */) {
            state.position += 3;
            skipSeparationSpace(state, true, -1);

        } else if (hasDirectives) {
            throwError(state, 'directives end mark is expected');
        }

        composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
        skipSeparationSpace(state, true, -1);

        if (state.checkLineBreaks &&
            PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
            throwWarning(state, 'non-ASCII line breaks are interpreted as content');
        }

        state.documents.push(state.result);

        if (state.position === state.lineStart && testDocumentSeparator(state)) {

            if (state.input.charCodeAt(state.position) === 0x2E/* . */) {
                state.position += 3;
                skipSeparationSpace(state, true, -1);
            }
            return;
        }

        if (state.position < (state.length - 1)) {
            throwError(state, 'end of the stream or a document separator is expected');
        } else {

        }
    }


    function loadDocuments(input, options) {
        input = String(input);
        options = options || {};

        if (input.length !== 0) {

            // Add tailing `\n` if not exists
            if (input.charCodeAt(input.length - 1) !== 0x0A/* LF */ &&
                input.charCodeAt(input.length - 1) !== 0x0D/* CR */) {
                input += '\n';
            }

            // Strip BOM
            if (input.charCodeAt(0) === 0xFEFF) {
                input = input.slice(1);
            }
        }

        var state = new State$1(input, options);

        var nullpos = input.indexOf('\0');

        if (nullpos !== -1) {
            state.position = nullpos;
            throwError(state, 'null byte is not allowed in input');
        }

        // Use 0 as string terminator. That significantly simplifies bounds check.
        state.input += '\0';

        while (state.input.charCodeAt(state.position) === 0x20/* Space */) {
            state.lineIndent += 1;
            state.position += 1;
        }

        while (state.position < (state.length - 1)) {
            readDocument(state);
        }

        return state.documents;
    }


    function loadAll$1(input, iterator, options) {
        if (iterator !== null && typeof iterator === 'object' && typeof options === 'undefined') {
            options = iterator;
            iterator = null;
        }

        var documents = loadDocuments(input, options);

        if (typeof iterator !== 'function') {
            return documents;
        }

        for (var index = 0, length = documents.length; index < length; index += 1) {
            iterator(documents[index]);
        }
    }


    function load$1(input, options) {
        var documents = loadDocuments(input, options);

        if (documents.length === 0) {
            /*eslint-disable no-undefined*/
            return undefined;
        } else if (documents.length === 1) {
            return documents[0];
        }
        throw new exception('expected a single document in the stream, but found more');
    }


    var loadAll_1 = loadAll$1;
    var load_1 = load$1;

    var loader = {
        loadAll: loadAll_1,
        load: load_1
    };

    /*eslint-disable no-use-before-define*/


    var _toString = Object.prototype.toString;
    var _hasOwnProperty = Object.prototype.hasOwnProperty;

    var CHAR_BOM = 0xFEFF;
    var CHAR_TAB = 0x09; /* Tab */
    var CHAR_LINE_FEED = 0x0A; /* LF */
    var CHAR_CARRIAGE_RETURN = 0x0D; /* CR */
    var CHAR_SPACE = 0x20; /* Space */
    var CHAR_EXCLAMATION = 0x21; /* ! */
    var CHAR_DOUBLE_QUOTE = 0x22; /* " */
    var CHAR_SHARP = 0x23; /* # */
    var CHAR_PERCENT = 0x25; /* % */
    var CHAR_AMPERSAND = 0x26; /* & */
    var CHAR_SINGLE_QUOTE = 0x27; /* ' */
    var CHAR_ASTERISK = 0x2A; /* * */
    var CHAR_COMMA = 0x2C; /* , */
    var CHAR_MINUS = 0x2D; /* - */
    var CHAR_COLON = 0x3A; /* : */
    var CHAR_EQUALS = 0x3D; /* = */
    var CHAR_GREATER_THAN = 0x3E; /* > */
    var CHAR_QUESTION = 0x3F; /* ? */
    var CHAR_COMMERCIAL_AT = 0x40; /* @ */
    var CHAR_LEFT_SQUARE_BRACKET = 0x5B; /* [ */
    var CHAR_RIGHT_SQUARE_BRACKET = 0x5D; /* ] */
    var CHAR_GRAVE_ACCENT = 0x60; /* ` */
    var CHAR_LEFT_CURLY_BRACKET = 0x7B; /* { */
    var CHAR_VERTICAL_LINE = 0x7C; /* | */
    var CHAR_RIGHT_CURLY_BRACKET = 0x7D; /* } */

    var ESCAPE_SEQUENCES = {};

    ESCAPE_SEQUENCES[0x00] = '\\0';
    ESCAPE_SEQUENCES[0x07] = '\\a';
    ESCAPE_SEQUENCES[0x08] = '\\b';
    ESCAPE_SEQUENCES[0x09] = '\\t';
    ESCAPE_SEQUENCES[0x0A] = '\\n';
    ESCAPE_SEQUENCES[0x0B] = '\\v';
    ESCAPE_SEQUENCES[0x0C] = '\\f';
    ESCAPE_SEQUENCES[0x0D] = '\\r';
    ESCAPE_SEQUENCES[0x1B] = '\\e';
    ESCAPE_SEQUENCES[0x22] = '\\"';
    ESCAPE_SEQUENCES[0x5C] = '\\\\';
    ESCAPE_SEQUENCES[0x85] = '\\N';
    ESCAPE_SEQUENCES[0xA0] = '\\_';
    ESCAPE_SEQUENCES[0x2028] = '\\L';
    ESCAPE_SEQUENCES[0x2029] = '\\P';

    var DEPRECATED_BOOLEANS_SYNTAX = [
        'y', 'Y', 'yes', 'Yes', 'YES', 'on', 'On', 'ON',
        'n', 'N', 'no', 'No', 'NO', 'off', 'Off', 'OFF'
    ];

    var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;

    function compileStyleMap(schema, map) {
        var result, keys, index, length, tag, style, type;

        if (map === null) return {};

        result = {};
        keys = Object.keys(map);

        for (index = 0, length = keys.length; index < length; index += 1) {
            tag = keys[index];
            style = String(map[tag]);

            if (tag.slice(0, 2) === '!!') {
                tag = 'tag:yaml.org,2002:' + tag.slice(2);
            }
            type = schema.compiledTypeMap['fallback'][tag];

            if (type && _hasOwnProperty.call(type.styleAliases, style)) {
                style = type.styleAliases[style];
            }

            result[tag] = style;
        }

        return result;
    }

    function encodeHex(character) {
        var string, handle, length;

        string = character.toString(16).toUpperCase();

        if (character <= 0xFF) {
            handle = 'x';
            length = 2;
        } else if (character <= 0xFFFF) {
            handle = 'u';
            length = 4;
        } else if (character <= 0xFFFFFFFF) {
            handle = 'U';
            length = 8;
        } else {
            throw new exception('code point within a string may not be greater than 0xFFFFFFFF');
        }

        return '\\' + handle + common.repeat('0', length - string.length) + string;
    }


    var QUOTING_TYPE_SINGLE = 1,
        QUOTING_TYPE_DOUBLE = 2;

    function State(options) {
        this.schema = options['schema'] || _default;
        this.indent = Math.max(1, (options['indent'] || 2));
        this.noArrayIndent = options['noArrayIndent'] || false;
        this.skipInvalid = options['skipInvalid'] || false;
        this.flowLevel = (common.isNothing(options['flowLevel']) ? -1 : options['flowLevel']);
        this.styleMap = compileStyleMap(this.schema, options['styles'] || null);
        this.sortKeys = options['sortKeys'] || false;
        this.lineWidth = options['lineWidth'] || 80;
        this.noRefs = options['noRefs'] || false;
        this.noCompatMode = options['noCompatMode'] || false;
        this.condenseFlow = options['condenseFlow'] || false;
        this.quotingType = options['quotingType'] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
        this.forceQuotes = options['forceQuotes'] || false;
        this.replacer = typeof options['replacer'] === 'function' ? options['replacer'] : null;

        this.implicitTypes = this.schema.compiledImplicit;
        this.explicitTypes = this.schema.compiledExplicit;

        this.tag = null;
        this.result = '';

        this.duplicates = [];
        this.usedDuplicates = null;
    }

// Indents every line in a string. Empty lines (\n only) are not indented.
    function indentString(string, spaces) {
        var ind = common.repeat(' ', spaces),
            position = 0,
            next = -1,
            result = '',
            line,
            length = string.length;

        while (position < length) {
            next = string.indexOf('\n', position);
            if (next === -1) {
                line = string.slice(position);
                position = length;
            } else {
                line = string.slice(position, next + 1);
                position = next + 1;
            }

            if (line.length && line !== '\n') result += ind;

            result += line;
        }

        return result;
    }

    function generateNextLine(state, level) {
        return '\n' + common.repeat(' ', state.indent * level);
    }

    function testImplicitResolving(state, str) {
        var index, length, type;

        for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
            type = state.implicitTypes[index];

            if (type.resolve(str)) {
                return true;
            }
        }

        return false;
    }

// [33] s-white ::= s-space | s-tab
    function isWhitespace(c) {
        return c === CHAR_SPACE || c === CHAR_TAB;
    }

// Returns true if the character can be printed without escaping.
// From YAML 1.2: "any allowed characters known to be non-printable
// should also be escaped. [However,] This isn’t mandatory"
// Derived from nb-char - \t - #x85 - #xA0 - #x2028 - #x2029.
    function isPrintable(c) {
        return (0x00020 <= c && c <= 0x00007E)
            || ((0x000A1 <= c && c <= 0x00D7FF) && c !== 0x2028 && c !== 0x2029)
            || ((0x0E000 <= c && c <= 0x00FFFD) && c !== CHAR_BOM)
            || (0x10000 <= c && c <= 0x10FFFF);
    }

// [34] ns-char ::= nb-char - s-white
// [27] nb-char ::= c-printable - b-char - c-byte-order-mark
// [26] b-char  ::= b-line-feed | b-carriage-return
// Including s-white (for some reason, examples doesn't match specs in this aspect)
// ns-char ::= c-printable - b-line-feed - b-carriage-return - c-byte-order-mark
    function isNsCharOrWhitespace(c) {
        return isPrintable(c)
            && c !== CHAR_BOM
            // - b-char
            && c !== CHAR_CARRIAGE_RETURN
            && c !== CHAR_LINE_FEED;
    }

// [127]  ns-plain-safe(c) ::= c = flow-out  ⇒ ns-plain-safe-out
//                             c = flow-in   ⇒ ns-plain-safe-in
//                             c = block-key ⇒ ns-plain-safe-out
//                             c = flow-key  ⇒ ns-plain-safe-in
// [128] ns-plain-safe-out ::= ns-char
// [129]  ns-plain-safe-in ::= ns-char - c-flow-indicator
// [130]  ns-plain-char(c) ::=  ( ns-plain-safe(c) - “:” - “#” )
//                            | ( /* An ns-char preceding */ “#” )
//                            | ( “:” /* Followed by an ns-plain-safe(c) */ )
    function isPlainSafe(c, prev, inblock) {
        var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
        var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
        return (
                // ns-plain-safe
                inblock ? // c = flow-in
                    cIsNsCharOrWhitespace
                    : cIsNsCharOrWhitespace
                    // - c-flow-indicator
                    && c !== CHAR_COMMA
                    && c !== CHAR_LEFT_SQUARE_BRACKET
                    && c !== CHAR_RIGHT_SQUARE_BRACKET
                    && c !== CHAR_LEFT_CURLY_BRACKET
                    && c !== CHAR_RIGHT_CURLY_BRACKET
            )
            // ns-plain-char
            && c !== CHAR_SHARP // false on '#'
            && !(prev === CHAR_COLON && !cIsNsChar) // false on ': '
            || (isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP) // change to true on '[^ ]#'
            || (prev === CHAR_COLON && cIsNsChar); // change to true on ':[^ ]'
    }

// Simplified test for values allowed as the first character in plain style.
    function isPlainSafeFirst(c) {
        // Uses a subset of ns-char - c-indicator
        // where ns-char = nb-char - s-white.
        // No support of ( ( “?” | “:” | “-” ) /* Followed by an ns-plain-safe(c)) */ ) part
        return isPrintable(c) && c !== CHAR_BOM
            && !isWhitespace(c) // - s-white
            // - (c-indicator ::=
            // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
            && c !== CHAR_MINUS
            && c !== CHAR_QUESTION
            && c !== CHAR_COLON
            && c !== CHAR_COMMA
            && c !== CHAR_LEFT_SQUARE_BRACKET
            && c !== CHAR_RIGHT_SQUARE_BRACKET
            && c !== CHAR_LEFT_CURLY_BRACKET
            && c !== CHAR_RIGHT_CURLY_BRACKET
            // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
            && c !== CHAR_SHARP
            && c !== CHAR_AMPERSAND
            && c !== CHAR_ASTERISK
            && c !== CHAR_EXCLAMATION
            && c !== CHAR_VERTICAL_LINE
            && c !== CHAR_EQUALS
            && c !== CHAR_GREATER_THAN
            && c !== CHAR_SINGLE_QUOTE
            && c !== CHAR_DOUBLE_QUOTE
            // | “%” | “@” | “`”)
            && c !== CHAR_PERCENT
            && c !== CHAR_COMMERCIAL_AT
            && c !== CHAR_GRAVE_ACCENT;
    }

// Simplified test for values allowed as the last character in plain style.
    function isPlainSafeLast(c) {
        // just not whitespace or colon, it will be checked to be plain character later
        return !isWhitespace(c) && c !== CHAR_COLON;
    }

// Same as 'string'.codePointAt(pos), but works in older browsers.
    function codePointAt(string, pos) {
        var first = string.charCodeAt(pos), second;
        if (first >= 0xD800 && first <= 0xDBFF && pos + 1 < string.length) {
            second = string.charCodeAt(pos + 1);
            if (second >= 0xDC00 && second <= 0xDFFF) {
                // https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
                return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
            }
        }
        return first;
    }

// Determines whether block indentation indicator is required.
    function needIndentIndicator(string) {
        var leadingSpaceRe = /^\n* /;
        return leadingSpaceRe.test(string);
    }

    var STYLE_PLAIN = 1,
        STYLE_SINGLE = 2,
        STYLE_LITERAL = 3,
        STYLE_FOLDED = 4,
        STYLE_DOUBLE = 5;

// Determines which scalar styles are possible and returns the preferred style.
// lineWidth = -1 => no limit.
// Pre-conditions: str.length > 0.
// Post-conditions:
//    STYLE_PLAIN or STYLE_SINGLE => no \n are in the string.
//    STYLE_LITERAL => no lines are suitable for folding (or lineWidth is -1).
//    STYLE_FOLDED => a line > lineWidth and can be folded (and lineWidth != -1).
    function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth,
                               testAmbiguousType, quotingType, forceQuotes, inblock) {

        var i;
        var char = 0;
        var prevChar = null;
        var hasLineBreak = false;
        var hasFoldableLine = false; // only checked if shouldTrackWidth
        var shouldTrackWidth = lineWidth !== -1;
        var previousLineBreak = -1; // count the first line correctly
        var plain = isPlainSafeFirst(codePointAt(string, 0))
            && isPlainSafeLast(codePointAt(string, string.length - 1));

        if (singleLineOnly || forceQuotes) {
            // Case: no block styles.
            // Check for disallowed characters to rule out plain and single.
            for (i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
                char = codePointAt(string, i);
                if (!isPrintable(char)) {
                    return STYLE_DOUBLE;
                }
                plain = plain && isPlainSafe(char, prevChar, inblock);
                prevChar = char;
            }
        } else {
            // Case: block styles permitted.
            for (i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
                char = codePointAt(string, i);
                if (char === CHAR_LINE_FEED) {
                    hasLineBreak = true;
                    // Check if any line can be folded.
                    if (shouldTrackWidth) {
                        hasFoldableLine = hasFoldableLine ||
                            // Foldable line = too long, and not more-indented.
                            (i - previousLineBreak - 1 > lineWidth &&
                                string[previousLineBreak + 1] !== ' ');
                        previousLineBreak = i;
                    }
                } else if (!isPrintable(char)) {
                    return STYLE_DOUBLE;
                }
                plain = plain && isPlainSafe(char, prevChar, inblock);
                prevChar = char;
            }
            // in case the end is missing a \n
            hasFoldableLine = hasFoldableLine || (shouldTrackWidth &&
                (i - previousLineBreak - 1 > lineWidth &&
                    string[previousLineBreak + 1] !== ' '));
        }
        // Although every style can represent \n without escaping, prefer block styles
        // for multiline, since they're more readable and they don't add empty lines.
        // Also prefer folding a super-long line.
        if (!hasLineBreak && !hasFoldableLine) {
            // Strings interpretable as another type have to be quoted;
            // e.g. the string 'true' vs. the boolean true.
            if (plain && !forceQuotes && !testAmbiguousType(string)) {
                return STYLE_PLAIN;
            }
            return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
        }
        // Edge case: block indentation indicator can only have one digit.
        if (indentPerLevel > 9 && needIndentIndicator(string)) {
            return STYLE_DOUBLE;
        }
        // At this point we know block styles are valid.
        // Prefer literal style unless we want to fold.
        if (!forceQuotes) {
            return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
        }
        return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }

// Note: line breaking/folding is implemented for only the folded style.
// NB. We drop the last trailing newline (if any) of a returned block scalar
//  since the dumper adds its own newline. This always works:
//    • No ending newline => unaffected; already using strip "-" chomping.
//    • Ending newline    => removed then restored.
//  Importantly, this keeps the "+" chomp indicator from gaining an extra line.
    function writeScalar(state, string, level, iskey, inblock) {
        state.dump = (function () {
            if (string.length === 0) {
                return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
            }
            if (!state.noCompatMode) {
                if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
                    return state.quotingType === QUOTING_TYPE_DOUBLE ? ('"' + string + '"') : ("'" + string + "'");
                }
            }

            var indent = state.indent * Math.max(1, level); // no 0-indent scalars
            // As indentation gets deeper, let the width decrease monotonically
            // to the lower bound min(state.lineWidth, 40).
            // Note that this implies
            //  state.lineWidth ≤ 40 + state.indent: width is fixed at the lower bound.
            //  state.lineWidth > 40 + state.indent: width decreases until the lower bound.
            // This behaves better than a constant minimum width which disallows narrower options,
            // or an indent threshold which causes the width to suddenly increase.
            var lineWidth = state.lineWidth === -1
                ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);

            // Without knowing if keys are implicit/explicit, assume implicit for safety.
            var singleLineOnly = iskey
                // No block styles in flow mode.
                || (state.flowLevel > -1 && level >= state.flowLevel);

            function testAmbiguity(string) {
                return testImplicitResolving(state, string);
            }

            switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth,
                testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {

                case STYLE_PLAIN:
                    return string;
                case STYLE_SINGLE:
                    return "'" + string.replace(/'/g, "''") + "'";
                case STYLE_LITERAL:
                    return '|' + blockHeader(string, state.indent)
                        + dropEndingNewline(indentString(string, indent));
                case STYLE_FOLDED:
                    return '>' + blockHeader(string, state.indent)
                        + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
                case STYLE_DOUBLE:
                    return '"' + escapeString(string) + '"';
                default:
                    throw new exception('impossible error: invalid scalar style');
            }
        }());
    }

// Pre-conditions: string is valid for a block scalar, 1 <= indentPerLevel <= 9.
    function blockHeader(string, indentPerLevel) {
        var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : '';

        // note the special case: the string '\n' counts as a "trailing" empty line.
        var clip = string[string.length - 1] === '\n';
        var keep = clip && (string[string.length - 2] === '\n' || string === '\n');
        var chomp = keep ? '+' : (clip ? '' : '-');

        return indentIndicator + chomp + '\n';
    }

// (See the note for writeScalar.)
    function dropEndingNewline(string) {
        return string[string.length - 1] === '\n' ? string.slice(0, -1) : string;
    }

// Note: a long line without a suitable break point will exceed the width limit.
// Pre-conditions: every char in str isPrintable, str.length > 0, width > 0.
    function foldString(string, width) {
        // In folded style, $k$ consecutive newlines output as $k+1$ newlines—
        // unless they're before or after a more-indented line, or at the very
        // beginning or end, in which case $k$ maps to $k$.
        // Therefore, parse each chunk as newline(s) followed by a content line.
        var lineRe = /(\n+)([^\n]*)/g;

        // first line (possibly an empty line)
        var result = (function () {
            var nextLF = string.indexOf('\n');
            nextLF = nextLF !== -1 ? nextLF : string.length;
            lineRe.lastIndex = nextLF;
            return foldLine(string.slice(0, nextLF), width);
        }());
        // If we haven't reached the first content line yet, don't add an extra \n.
        var prevMoreIndented = string[0] === '\n' || string[0] === ' ';
        var moreIndented;

        // rest of the lines
        var match;
        while ((match = lineRe.exec(string))) {
            var prefix = match[1], line = match[2];
            moreIndented = (line[0] === ' ');
            result += prefix
                + (!prevMoreIndented && !moreIndented && line !== ''
                    ? '\n' : '')
                + foldLine(line, width);
            prevMoreIndented = moreIndented;
        }

        return result;
    }

// Greedy line breaking.
// Picks the longest line under the limit each time,
// otherwise settles for the shortest line over the limit.
// NB. More-indented lines *cannot* be folded, as that would add an extra \n.
    function foldLine(line, width) {
        if (line === '' || line[0] === ' ') return line;

        // Since a more-indented line adds a \n, breaks can't be followed by a space.
        var breakRe = / [^ ]/g; // note: the match index will always be <= length-2.
        var match;
        // start is an inclusive index. end, curr, and next are exclusive.
        var start = 0, end, curr = 0, next = 0;
        var result = '';

        // Invariants: 0 <= start <= length-1.
        //   0 <= curr <= next <= max(0, length-2). curr - start <= width.
        // Inside the loop:
        //   A match implies length >= 2, so curr and next are <= length-2.
        while ((match = breakRe.exec(line))) {
            next = match.index;
            // maintain invariant: curr - start <= width
            if (next - start > width) {
                end = (curr > start) ? curr : next; // derive end <= length-2
                result += '\n' + line.slice(start, end);
                // skip the space that was output as \n
                start = end + 1;                    // derive start <= length-1
            }
            curr = next;
        }

        // By the invariants, start <= length-1, so there is something left over.
        // It is either the whole string or a part starting from non-whitespace.
        result += '\n';
        // Insert a break if the remainder is too long and there is a break available.
        if (line.length - start > width && curr > start) {
            result += line.slice(start, curr) + '\n' + line.slice(curr + 1);
        } else {
            result += line.slice(start);
        }

        return result.slice(1); // drop extra \n joiner
    }

// Escapes a double-quoted string.
    function escapeString(string) {
        var result = '';
        var char = 0;
        var escapeSeq;

        for (var i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
            char = codePointAt(string, i);
            escapeSeq = ESCAPE_SEQUENCES[char];

            if (!escapeSeq && isPrintable(char)) {
                result += string[i];
                if (char >= 0x10000) result += string[i + 1];
            } else {
                result += escapeSeq || encodeHex(char);
            }
        }

        return result;
    }

    function writeFlowSequence(state, level, object) {
        var _result = '',
            _tag = state.tag,
            index,
            length,
            value;

        for (index = 0, length = object.length; index < length; index += 1) {
            value = object[index];

            if (state.replacer) {
                value = state.replacer.call(object, String(index), value);
            }

            // Write only valid elements, put null instead of invalid elements.
            if (writeNode(state, level, value, false, false) ||
                (typeof value === 'undefined' &&
                    writeNode(state, level, null, false, false))) {

                if (_result !== '') _result += ',' + (!state.condenseFlow ? ' ' : '');
                _result += state.dump;
            }
        }

        state.tag = _tag;
        state.dump = '[' + _result + ']';
    }

    function writeBlockSequence(state, level, object, compact) {
        var _result = '',
            _tag = state.tag,
            index,
            length,
            value;

        for (index = 0, length = object.length; index < length; index += 1) {
            value = object[index];

            if (state.replacer) {
                value = state.replacer.call(object, String(index), value);
            }

            // Write only valid elements, put null instead of invalid elements.
            if (writeNode(state, level + 1, value, true, true, false, true) ||
                (typeof value === 'undefined' &&
                    writeNode(state, level + 1, null, true, true, false, true))) {

                if (!compact || _result !== '') {
                    _result += generateNextLine(state, level);
                }

                if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
                    _result += '-';
                } else {
                    _result += '- ';
                }

                _result += state.dump;
            }
        }

        state.tag = _tag;
        state.dump = _result || '[]'; // Empty sequence if no valid values.
    }

    function writeFlowMapping(state, level, object) {
        var _result = '',
            _tag = state.tag,
            objectKeyList = Object.keys(object),
            index,
            length,
            objectKey,
            objectValue,
            pairBuffer;

        for (index = 0, length = objectKeyList.length; index < length; index += 1) {

            pairBuffer = '';
            if (_result !== '') pairBuffer += ', ';

            if (state.condenseFlow) pairBuffer += '"';

            objectKey = objectKeyList[index];
            objectValue = object[objectKey];

            if (state.replacer) {
                objectValue = state.replacer.call(object, objectKey, objectValue);
            }

            if (!writeNode(state, level, objectKey, false, false)) {
                continue; // Skip this pair because of invalid key;
            }

            if (state.dump.length > 1024) pairBuffer += '? ';

            pairBuffer += state.dump + (state.condenseFlow ? '"' : '') + ':' + (state.condenseFlow ? '' : ' ');

            if (!writeNode(state, level, objectValue, false, false)) {
                continue; // Skip this pair because of invalid value.
            }

            pairBuffer += state.dump;

            // Both key and value are valid.
            _result += pairBuffer;
        }

        state.tag = _tag;
        state.dump = '{' + _result + '}';
    }

    function writeBlockMapping(state, level, object, compact) {
        var _result = '',
            _tag = state.tag,
            objectKeyList = Object.keys(object),
            index,
            length,
            objectKey,
            objectValue,
            explicitPair,
            pairBuffer;

        // Allow sorting keys so that the output file is deterministic
        if (state.sortKeys === true) {
            // Default sorting
            objectKeyList.sort();
        } else if (typeof state.sortKeys === 'function') {
            // Custom sort function
            objectKeyList.sort(state.sortKeys);
        } else if (state.sortKeys) {
            // Something is wrong
            throw new exception('sortKeys must be a boolean or a function');
        }

        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
            pairBuffer = '';

            if (!compact || _result !== '') {
                pairBuffer += generateNextLine(state, level);
            }

            objectKey = objectKeyList[index];
            objectValue = object[objectKey];

            if (state.replacer) {
                objectValue = state.replacer.call(object, objectKey, objectValue);
            }

            if (!writeNode(state, level + 1, objectKey, true, true, true)) {
                continue; // Skip this pair because of invalid key.
            }

            explicitPair = (state.tag !== null && state.tag !== '?') ||
                (state.dump && state.dump.length > 1024);

            if (explicitPair) {
                if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
                    pairBuffer += '?';
                } else {
                    pairBuffer += '? ';
                }
            }

            pairBuffer += state.dump;

            if (explicitPair) {
                pairBuffer += generateNextLine(state, level);
            }

            if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
                continue; // Skip this pair because of invalid value.
            }

            if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
                pairBuffer += ':';
            } else {
                pairBuffer += ': ';
            }

            pairBuffer += state.dump;

            // Both key and value are valid.
            _result += pairBuffer;
        }

        state.tag = _tag;
        state.dump = _result || '{}'; // Empty mapping if no valid pairs.
    }

    function detectType(state, object, explicit) {
        var _result, typeList, index, length, type, style;

        typeList = explicit ? state.explicitTypes : state.implicitTypes;

        for (index = 0, length = typeList.length; index < length; index += 1) {
            type = typeList[index];

            if ((type.instanceOf || type.predicate) &&
                (!type.instanceOf || ((typeof object === 'object') && (object instanceof type.instanceOf))) &&
                (!type.predicate || type.predicate(object))) {

                if (explicit) {
                    if (type.multi && type.representName) {
                        state.tag = type.representName(object);
                    } else {
                        state.tag = type.tag;
                    }
                } else {
                    state.tag = '?';
                }

                if (type.represent) {
                    style = state.styleMap[type.tag] || type.defaultStyle;

                    if (_toString.call(type.represent) === '[object Function]') {
                        _result = type.represent(object, style);
                    } else if (_hasOwnProperty.call(type.represent, style)) {
                        _result = type.represent[style](object, style);
                    } else {
                        throw new exception('!<' + type.tag + '> tag resolver accepts not "' + style + '" style');
                    }

                    state.dump = _result;
                }

                return true;
            }
        }

        return false;
    }

// Serializes `object` and writes it to global `result`.
// Returns true on success, or false on invalid object.
//
    function writeNode(state, level, object, block, compact, iskey, isblockseq) {
        state.tag = null;
        state.dump = object;

        if (!detectType(state, object, false)) {
            detectType(state, object, true);
        }

        var type = _toString.call(state.dump);
        var inblock = block;
        var tagStr;

        if (block) {
            block = (state.flowLevel < 0 || state.flowLevel > level);
        }

        var objectOrArray = type === '[object Object]' || type === '[object Array]',
            duplicateIndex,
            duplicate;

        if (objectOrArray) {
            duplicateIndex = state.duplicates.indexOf(object);
            duplicate = duplicateIndex !== -1;
        }

        if ((state.tag !== null && state.tag !== '?') || duplicate || (state.indent !== 2 && level > 0)) {
            compact = false;
        }

        if (duplicate && state.usedDuplicates[duplicateIndex]) {
            state.dump = '*ref_' + duplicateIndex;
        } else {
            if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
                state.usedDuplicates[duplicateIndex] = true;
            }
            if (type === '[object Object]') {
                if (block && (Object.keys(state.dump).length !== 0)) {
                    writeBlockMapping(state, level, state.dump, compact);
                    if (duplicate) {
                        state.dump = '&ref_' + duplicateIndex + state.dump;
                    }
                } else {
                    writeFlowMapping(state, level, state.dump);
                    if (duplicate) {
                        state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
                    }
                }
            } else if (type === '[object Array]') {
                if (block && (state.dump.length !== 0)) {
                    if (state.noArrayIndent && !isblockseq && level > 0) {
                        writeBlockSequence(state, level - 1, state.dump, compact);
                    } else {
                        writeBlockSequence(state, level, state.dump, compact);
                    }
                    if (duplicate) {
                        state.dump = '&ref_' + duplicateIndex + state.dump;
                    }
                } else {
                    writeFlowSequence(state, level, state.dump);
                    if (duplicate) {
                        state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
                    }
                }
            } else if (type === '[object String]') {
                if (state.tag !== '?') {
                    writeScalar(state, state.dump, level, iskey, inblock);
                }
            } else if (type === '[object Undefined]') {
                return false;
            } else {
                if (state.skipInvalid) return false;
                throw new exception('unacceptable kind of an object to dump ' + type);
            }

            if (state.tag !== null && state.tag !== '?') {
                // Need to encode all characters except those allowed by the spec:
                //
                // [35] ns-dec-digit    ::=  [#x30-#x39] /* 0-9 */
                // [36] ns-hex-digit    ::=  ns-dec-digit
                //                         | [#x41-#x46] /* A-F */ | [#x61-#x66] /* a-f */
                // [37] ns-ascii-letter ::=  [#x41-#x5A] /* A-Z */ | [#x61-#x7A] /* a-z */
                // [38] ns-word-char    ::=  ns-dec-digit | ns-ascii-letter | “-”
                // [39] ns-uri-char     ::=  “%” ns-hex-digit ns-hex-digit | ns-word-char | “#”
                //                         | “;” | “/” | “?” | “:” | “@” | “&” | “=” | “+” | “$” | “,”
                //                         | “_” | “.” | “!” | “~” | “*” | “'” | “(” | “)” | “[” | “]”
                //
                // Also need to encode '!' because it has special meaning (end of tag prefix).
                //
                tagStr = encodeURI(
                    state.tag[0] === '!' ? state.tag.slice(1) : state.tag
                ).replace(/!/g, '%21');

                if (state.tag[0] === '!') {
                    tagStr = '!' + tagStr;
                } else if (tagStr.slice(0, 18) === 'tag:yaml.org,2002:') {
                    tagStr = '!!' + tagStr.slice(18);
                } else {
                    tagStr = '!<' + tagStr + '>';
                }

                state.dump = tagStr + ' ' + state.dump;
            }
        }

        return true;
    }

    function getDuplicateReferences(object, state) {
        var objects = [],
            duplicatesIndexes = [],
            index,
            length;

        inspectNode(object, objects, duplicatesIndexes);

        for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
            state.duplicates.push(objects[duplicatesIndexes[index]]);
        }
        state.usedDuplicates = new Array(length);
    }

    function inspectNode(object, objects, duplicatesIndexes) {
        var objectKeyList,
            index,
            length;

        if (object !== null && typeof object === 'object') {
            index = objects.indexOf(object);
            if (index !== -1) {
                if (duplicatesIndexes.indexOf(index) === -1) {
                    duplicatesIndexes.push(index);
                }
            } else {
                objects.push(object);

                if (Array.isArray(object)) {
                    for (index = 0, length = object.length; index < length; index += 1) {
                        inspectNode(object[index], objects, duplicatesIndexes);
                    }
                } else {
                    objectKeyList = Object.keys(object);

                    for (index = 0, length = objectKeyList.length; index < length; index += 1) {
                        inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
                    }
                }
            }
        }
    }

    function dump$1(input, options) {
        options = options || {};

        var state = new State(options);

        if (!state.noRefs) getDuplicateReferences(input, state);

        var value = input;

        if (state.replacer) {
            value = state.replacer.call({'': value}, '', value);
        }

        if (writeNode(state, 0, value, true, true)) return state.dump + '\n';

        return '';
    }

    var dump_1 = dump$1;

    var dumper = {
        dump: dump_1
    };

    function renamed(from, to) {
        return function () {
            throw new Error('Function yaml.' + from + ' is removed in js-yaml 4. ' +
                'Use yaml.' + to + ' instead, which is now safe by default.');
        };
    }


    var Type = type;
    var Schema = schema;
    var FAILSAFE_SCHEMA = failsafe;
    var JSON_SCHEMA = json;
    var CORE_SCHEMA = core;
    var DEFAULT_SCHEMA = _default;
    var load = loader.load;
    var loadAll = loader.loadAll;
    var dump = dumper.dump;
    var YAMLException = exception;

// Re-export all types in case user wants to create custom schema
    var types = {
        binary: binary,
        float: float,
        map: map,
        null: _null,
        pairs: pairs,
        set: set,
        timestamp: timestamp,
        bool: bool,
        int: int,
        merge: merge,
        omap: omap,
        seq: seq,
        str: str
    };

// Removed functions from JS-YAML 3.0.x
    var safeLoad = renamed('safeLoad', 'load');
    var safeLoadAll = renamed('safeLoadAll', 'loadAll');
    var safeDump = renamed('safeDump', 'dump');

    return {
        Type: Type,
        Schema: Schema,
        FAILSAFE_SCHEMA: FAILSAFE_SCHEMA,
        JSON_SCHEMA: JSON_SCHEMA,
        CORE_SCHEMA: CORE_SCHEMA,
        DEFAULT_SCHEMA: DEFAULT_SCHEMA,
        load: load,
        loadAll: loadAll,
        dump: dump,
        YAMLException: YAMLException,
        types: types,
        safeLoad: safeLoad,
        safeLoadAll: safeLoadAll,
        safeDump: safeDump
    };
}();

/****  MD5 (Message-Digest Algorithm)*  http://www.webtoolkit.info/***/
function MD5(string) {
    function RotateLeft(lValue, iShiftBits) {
        return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }

    function AddUnsigned(lX, lY) {
        var lX4, lY4, lX8, lY8, lResult;
        lX8 = (lX & 0x80000000);
        lY8 = (lY & 0x80000000);
        lX4 = (lX & 0x40000000);
        lY4 = (lY & 0x40000000);
        lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
        if (lX4 & lY4) {
            return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
        }
        if (lX4 | lY4) {
            if (lResult & 0x40000000) {
                return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
            } else {
                return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
            }
        } else {
            return (lResult ^ lX8 ^ lY8);
        }
    }

    function F(x, y, z) {
        return (x & y) | ((~x) & z);
    }

    function G(x, y, z) {
        return (x & z) | (y & (~z));
    }

    function H(x, y, z) {
        return (x ^ y ^ z);
    }

    function I(x, y, z) {
        return (y ^ (x | (~z)));
    }

    function FF(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }

    function GG(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }

    function HH(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }

    function II(a, b, c, d, x, s, ac) {
        a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
        return AddUnsigned(RotateLeft(a, s), b);
    }

    function ConvertToWordArray(string) {
        var lWordCount;
        var lMessageLength = string.length;
        var lNumberOfWords_temp1 = lMessageLength + 8;
        var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
        var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
        var lWordArray = Array(lNumberOfWords - 1);
        var lBytePosition = 0;
        var lByteCount = 0;
        while (lByteCount < lMessageLength) {
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
            lByteCount++;
        }
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
    }

    function WordToHex(lValue) {
        var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            WordToHexValue_temp = "0" + lByte.toString(16);
            WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
        }
        return WordToHexValue;
    }

    function Utf8Encode(string) {
        string = string.replace(/\r\n/g, "\n");
        var utftext = "";
        for (var n = 0; n < string.length; n++) {
            var c = string.charCodeAt(n);
            if (c < 128) {
                utftext += String.fromCharCode(c);
            } else if ((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
            } else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
            }
        }
        return utftext;
    }

    var x = Array();
    var k, AA, BB, CC, DD, a, b, c, d;
    var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    string = Utf8Encode(string);
    x = ConvertToWordArray(string);
    a = 0x67452301;
    b = 0xEFCDAB89;
    c = 0x98BADCFE;
    d = 0x10325476;
    for (k = 0; k < x.length; k += 16) {
        AA = a;
        BB = b;
        CC = c;
        DD = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
        d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
        c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
        b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
        a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
        d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
        c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
        b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
        d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
        c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
        b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
        a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
        d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
        c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
        b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
        a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
        d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
        c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
        b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
        a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
        d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
        c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
        b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
        a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
        d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
        c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
        b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
        a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
        d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
        c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
        b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
        a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
        d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
        c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
        b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
        a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
        d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
        c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
        b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
        a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
        d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
        c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
        b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
        a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
        d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
        c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
        b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
        a = II(a, b, c, d, x[k + 0], S41, 0xF4292244);
        d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
        c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
        b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
        a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
        d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
        c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
        b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
        a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
        d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
        c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
        b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
        a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
        d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
        c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
        b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
        a = AddUnsigned(a, AA);
        b = AddUnsigned(b, BB);
        c = AddUnsigned(c, CC);
        d = AddUnsigned(d, DD);
    }
    var temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);
    return temp.toLowerCase();
}

function ResourceDownloader() {
    const cache = {};

    async function download(url, userAgent = "Quantumult%20X") {
        const id = userAgent + url;

        if (cache[id]) {
            $.log("Cache hit for: " + url);
            return cache[id];
        }

        const $http = HTTP({
            headers: {
                "User-Agent": userAgent,
            },
        });

        const result = new Promise((resolve, reject) => {
            $http.get(url).then(resp => {
                const body = resp.body;
                if (body.replace(/\s/g, "").length === 0)
                    reject(new Error("订阅内容为空！"));
                else
                    resolve(body);
            });
        });

        cache[id] = result;
        return result;
    }

    return {
        download
    }
}
