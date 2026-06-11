# Sub-Store 配置指南

## 查看更新说明:

Sub-Store Releases: [`https://github.com/sub-store-org/Sub-Store/releases`](https://github.com/sub-store-org/Sub-Store/releases)

Telegram 频道: [`https://t.me/cool_scripts` ](https://t.me/cool_scripts)

## 服务器/云平台/Docker/Android 版

https://xream.notion.site/Sub-Store-abe6a96944724dc6a36833d5c9ab7c87

## App 版

### CORS 允许来源

Sub-Store 后端会根据请求的 `Origin` 判断浏览器跨域访问是否允许。允许值是 origin, 需要包含协议、域名和端口, 不包含路径。例如 `https://sub-store.vercel.app` 或 `http://127.0.0.1:8888`。

Node/服务器/Docker/Android 版可以通过环境变量 `SUB_STORE_CORS_ALLOWED_ORIGINS` 设置, 默认值为 `*`, 以保持旧行为。多个 origin 用 `,` 分隔, 例如:

```bash
SUB_STORE_CORS_ALLOWED_ORIGINS=https://sub-store.vercel.app,http://127.0.0.1:8888
```

支持参数配置的 App 模块使用 `cors` 参数设置, 默认值为 `https://sub-store.vercel.app,http://substore.stash,https://substore.stash`。如果需要使用本地前端 `http://127.0.0.1:8888?api=http://127.0.0.1:3001/123` 测试代理 App 后端, 需要把模块里的 `cors` 改成 `https://sub-store.vercel.app,http://substore.stash,https://substore.stash,http://127.0.0.1:8888`。设为 `*` 可恢复旧的任意来源访问行为, 但任意网站都可能通过浏览器 CORS 读取本机 Sub-Store 后端响应, 不建议长期使用。

### 1. Loon

安装使用 插件 [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Loon.plugin`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Loon.plugin) 即可。

新版 Loon 3.5.0(969)及以上版本 使用资源解析器插件 [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Loon-parser.plugin`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Loon-parser.plugin)
旧版 Loon 在资源解析器中使用 [https://github.com/sub-store-org/Sub-Store/releases/latest/download/sub-store-parser.loon.min.js](https://github.com/sub-store-org/Sub-Store/releases/latest/download/sub-store-parser.loon.min.js)

详见 [Loon 资源解析器说明](https://github.com/sub-store-org/Sub-Store/wiki/Loon-%E8%B5%84%E6%BA%90%E8%A7%A3%E6%9E%90%E5%99%A8%E8%AF%B4%E6%98%8E)

### 2. Surge

#### 关于 Surge 的格外说明

Surge Mac 版如何支持 SSR, 如何去除 HTTP 传输层以支持 类似 VMess HTTP 节点等 请查看 [链接参数说明](https://github.com/sub-store-org/Sub-Store/wiki/%E9%93%BE%E6%8E%A5%E5%8F%82%E6%95%B0%E8%AF%B4%E6%98%8E)

定时处理订阅 功能, 避免 App 内拉取超时, 请查看 [定时处理订阅](https://t.me/zhetengsha/1449)

0. 最新 Surge iOS TestFlight 版本 可使用 Beta 版(支持最新 Surge iOS TestFlight 版本的特性): [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-Beta.sgmodule`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-Beta.sgmodule)

1. 官方默认版模块(支持 App 内使用编辑参数): [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge.sgmodule`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge.sgmodule)

> 最新版 Surge 已删除 `ability: http-client-policy` 参数, 模块暂不做修改, 对测落地功能无影响

2. 经典版, 不支持编辑参数, 固定带 ability 参数版本, 使用 jsc 引擎时, 可能会爆内存, 如果需要使用指定节点功能 例如[加旗帜脚本或者 cname 脚本] 请使用此带 ability 参数版本: [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-ability.sgmodule`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-ability.sgmodule)

3. 经典版, 不支持编辑参数, 固定不带 ability 参数版本： [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-Noability.sgmodule`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-Noability.sgmodule)

### 3. QX

订阅 重写 [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/QX.snippet`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/QX.snippet) 即可。

定时任务: [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/QX-Task.json`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/QX-Task.json)

### 4. Stash

安装使用 覆写 [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Stash.stoverride`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Stash.stoverride) 即可。

### 5. Shadowrocket

安装使用 模块 [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-Noability.sgmodule`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Surge-Noability.sgmodule) 即可。

### 6. Egern

安装使用 模块 [`https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Egern.yaml`](https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/config/Egern.yaml) 即可。

## 使用 Sub-Store

1. 使用 Safari 打开这个 https://sub.store 如网页正常打开并且未弹出任何错误提示，说明 Sub-Store 已经配置成功。
2. 可以把 Sub-Store 添加到主屏幕，即可获得类似于 APP 的使用体验。
3. 更详细的使用指南请参考[文档](https://www.notion.so/Sub-Store-6259586994d34c11a4ced5c406264b46)。

## 链接参数说明

https://github.com/sub-store-org/Sub-Store/wiki/%E9%93%BE%E6%8E%A5%E5%8F%82%E6%95%B0%E8%AF%B4%E6%98%8E

## 脚本使用说明

https://github.com/sub-store-org/Sub-Store/wiki/%E8%84%9A%E6%9C%AC%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E
