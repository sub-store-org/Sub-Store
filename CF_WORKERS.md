# Sub-Store Cloudflare Workers 部署与使用指南

本文档介绍如何在 **Cloudflare Workers + D1** 上部署和运维 Sub-Store（`cf-workers` 分支）。默认仅部署后端，设置构建期环境变量 `SUB_STORE_CF_FRONTEND=true` 后即可同时将官方前端托管在 `/` 路径下，并详细说明当前版本**已实现的功能**以及**已知缺陷与平台限制**。

> **架构简介**：CF Workers 版本通过 `backend/bundle-cf.js` 将后端打包为无 Node.js 运行时依赖的单文件 ESM Worker（`backend/dist/cf-worker.mjs`），使用 **Cloudflare D1** 持久化全部配置与拆分缓存，并通过 **`sval`** 纯 JS 沙箱在禁止 `eval` / `new Function` 的 Workers 环境中支持脚本操作与脚本过滤；开启 `SUB_STORE_CF_FRONTEND=true` 时，`backend/fetch-frontend.js` 会在构建期自动拉取官方 `Sub-Store-Front-End` 构建产物至 `backend/dist/frontend` 并通过 **Cloudflare Workers Static Assets** 托管在 `/` 路径下。

---

## 一、部署方式

提供两种部署方式：**Cloudflare Dashboard Git 自动部署（推荐）** 和 **本地 Wrangler CLI 部署**。

### 方式一：Cloudflare Dashboard Git 自动部署（推荐）

无需在本地安装 Node.js 或 Wrangler，推送代码即可自动构建部署。

1. **Fork 本仓库**（或直接使用当前仓库的 `cf-workers` 分支）。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Workers** → **Import a repository**，关联你的 GitHub 仓库。
3. 按以下参数填写构建配置：
   - **Branch（分支）**：`cf-workers`
   - **Root directory（根目录）**：`backend`（**必填**，`wrangler.toml` 与 `package.json` 均位于 `backend/` 目录）
   - **Build command（构建命令）**：`pnpm install --frozen-lockfile && pnpm run bundle:cf`
   - **Deploy command（部署命令）**：`npx wrangler deploy`
   - **（可选）同时部署前端到 `/`**：在 **Build variables（构建变量）** 中添加 `SUB_STORE_CF_FRONTEND = true`（不设置时默认仅部署后端）。
4. **D1 数据库自动创建与建表**：
   - `backend/wrangler.toml` 已配置 `[[d1_databases]]`（`binding = "SUB_STORE_DB"`，`database_name = "sub-store"`），且未硬编码 `database_id`。
   - 首次部署时，Cloudflare **Automatic Provisioning** 会自动创建名为 `sub-store` 的 D1 数据库并绑定到当前 Worker，后续 Git 部署会自动保持关联。
   - **无需手动导入 SQL**：Worker 首次收到请求时会自动执行 `CREATE TABLE IF NOT EXISTS kv_store (...)` 完成建表。
5. **配置私密路径与环境变量**：
   - 进入 Worker → **Settings** → **Variables and Secrets**。
   - 添加至少一个 **Secret**：`SUB_STORE_FRONTEND_BACKEND_PATH`，值为高强度随机路径（例如 `/a8f3c9d1e2b4`）。
   - `backend/wrangler.toml` 已启用 `keep_vars = true`，在 Dashboard 中配置的环境变量与 Secret 不会在后续 Git 自动部署时被覆盖。

---

### 方式二：本地 Wrangler CLI 部署

#### 前置要求

- Node.js（推荐 20+，仓库 `.node-version` 为 `24.22.1`）
- `pnpm`（`backend/package.json` 强制要求使用 `pnpm`）
- Cloudflare 账号与 Wrangler CLI（可通过 `npx wrangler` 直接调用）

#### 操作步骤

1. 克隆仓库并安装依赖：

   ```bash
   git clone -b cf-workers https://github.com/ai-is-fun/Sub-Store.git
   cd Sub-Store/backend
   pnpm install
   ```

2. 登录 Cloudflare：

   ```bash
   npx wrangler login
   ```

3. （可选）绑定已有 D1 数据库：
   - 如果希望由 Cloudflare 自动创建 D1，直接跳过本步。
   - 如果希望手动创建或复用已有 D1：
     ```bash
     npx wrangler d1 create sub-store
     ```
     将返回的 `database_id` 写入 `backend/wrangler.toml` 的 `[[d1_databases]]` 段落中。
   - 如需提前手动建表（可选，不执行也会在首次请求时自动建表）：
     ```bash
     npx wrangler d1 execute sub-store --remote --file=./schema.sql
     ```

4. 构建并部署：

   - **默认仅部署后端**：
     ```bash
     pnpm run bundle:cf
     npx wrangler deploy
     ```
   - **同时部署前端到 `/` 路径**：
     ```bash
     SUB_STORE_CF_FRONTEND=true pnpm run bundle:cf
     SUB_STORE_CF_FRONTEND=true npx wrangler deploy
     ```

   > `backend/wrangler.toml` 中已配置 `[build] command = "pnpm run bundle:cf"`，直接运行 `npx wrangler deploy`（或 `SUB_STORE_CF_FRONTEND=true npx wrangler deploy`）也会自动触发对应模式的构建。

5. 配置私密路径前缀（强烈推荐）：

   ```bash
   npx wrangler secret put SUB_STORE_FRONTEND_BACKEND_PATH
   # 按提示输入随机路径，例如：/my-secret-path-9x8k2m
   ```

6. （可选）本地开发调试：

   ```bash
   npx wrangler dev
   # 如需同时调试内置前端：
   SUB_STORE_CF_FRONTEND=true npx wrangler dev
   ```

---

## 二、环境变量与绑定配置

所有敏感配置建议在 Cloudflare Dashboard 的 **Settings → Variables and Secrets** 中作为 **Secret** 添加，避免提交到 Git 仓库。

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `SUB_STORE_DB` | D1 Binding | **是** | `sub-store` | D1 数据库绑定名称（代码也兼容回退读取 `DB`）。 |
| `SUB_STORE_FRONTEND_BACKEND_PATH` | Secret / Text | **强烈推荐** | `/` | 私密 API 路径前缀，如 `/my-secret-path`（未以 `/` 开头会自动补全，末尾 `/` 会自动去除）。配置后未命中前缀且非合法 `/share/` 的请求在开启内置前端时会优先回退前端 SPA（非 `/api`/`/download`/`/share` 的 GET/HEAD），否则直接返回 `404`，均不消耗 D1 读取。 |
| `SUB_STORE_TOKEN` | Secret / Text | 否 | 无 | `SUB_STORE_FRONTEND_BACKEND_PATH` 的简化别名（仅在前者未配置时生效），可直接填不带 `/` 的随机字符串。 |
| `SUB_STORE_CORS_ALLOWED_ORIGINS` | Text | 否 | 见右侧 | 允许跨域访问的前端 Origin 列表（英文逗号分隔），或 `*`。默认允许：`https://sub-store.vercel.app,http://substore.stash,https://substore.stash,https://sub.xream.eu.org`。**内置 `/` 前端属于同源请求，已自动放行，无需配置此项**；仅外部独立域名自建前端时需添加。 |
| `SUB_STORE_BACKEND_CUSTOM_NAME` | Text | 否 | 无 | 设置后在默认 CORS 策略下额外放行 `localhost` / `127.0.0.1` 的本地 HTTP 前端 Origin。 |
| `SUB_STORE_X_POWERED_BY` | Text | 否 | `Sub-Store` | 自定义响应头 `X-Powered-By` 的值。 |
| `SUB_STORE_PUSH_SERVICE` | Secret | 否 | 无 | 通知推送 Webhook URL 模板，仅支持 `http://` / `https://`，支持 `[推送标题]` 与 `[推送内容]` 占位符。 |
| `SUB_STORE_CF_CRON_TASKS` | Text | 否 | `sync` | Cron Triggers 触发时执行的任务列表，逗号或空格分隔，可选值：`sync`、`upload`、`download`。 |

### 构建期前端配置变量（可选）

`pnpm run bundle:cf` 默认**仅构建后端**（清空 `backend/dist/frontend`，不上传任何前端资源）。在 Cloudflare Dashboard 的 **Settings → Build → Variables and secrets（构建变量）** 或本地构建命令中设置 `SUB_STORE_CF_FRONTEND=true` 后，才会拉取并部署前端到 `/` 路径（本地如需强制刷新缓存前端可运行 `pnpm run fetch:frontend`）：

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `SUB_STORE_CF_FRONTEND` | `false`（未开启） | 设为 `true` / `1` 时启用前后端合一构建，自动准备 `backend/dist/frontend` 并托管在 `/` 路径下；未设置时仅部署后端。 |
| `SUB_STORE_FRONTEND_VERSION` | 最新版本（`latest`） | 仅在开启 `SUB_STORE_CF_FRONTEND` 时生效，指定官方 `Sub-Store-Front-End` Release 版本号（如 `2.34.5`）。 |
| `SUB_STORE_FRONTEND_URL` | 官方最新 `dist.zip` | 仅在开启 `SUB_STORE_CF_FRONTEND` 时生效，自定义前端 `dist.zip` 下载地址（优先级高于 `SUB_STORE_FRONTEND_VERSION`）。 |
| `SUB_STORE_FRONTEND_DIR` | 无 | 仅在开启 `SUB_STORE_CF_FRONTEND` 时生效，指定本地已构建好的前端静态文件目录（需包含 `index.html`），构建时直接复制到 `backend/dist/frontend`。 |

---

## 三、配置定时任务（Cron Triggers）

如需定时同步 Artifacts 或定时执行 Gist 备份，可通过两种方式开启 Cron Triggers：

- **方式 A（推荐，Dashboard 配置）**：进入 Worker → **Settings** → **Trigger Events** → **Cron Triggers** → 添加表达式（例如 `0 */6 * * *` 表示每 6 小时执行一次）。
- **方式 B（`wrangler.toml` 配置）**：取消 `backend/wrangler.toml` 底部注释并重新部署：
  ```toml
  [triggers]
  crons = ["0 */6 * * *"]
  ```

通过环境变量 `SUB_STORE_CF_CRON_TASKS` 指定定时执行的动作（支持组合，按顺序执行）：

- `sync`：执行全部同步配置（Artifacts）同步（默认）
- `upload`：将当前配置备份上传到 GitHub Gist / GitLab Snippet
- `download`：从 GitHub Gist / GitLab Snippet 拉取并恢复配置

例如同时同步 Artifacts 并上传备份：

```text
SUB_STORE_CF_CRON_TASKS = sync,upload
```

---

## 四、访问前端与验证部署

1. **推荐绑定自定义域名**：默认 `*.workers.dev` 域名在部分网络环境下可能无法直连，建议在 Worker → **Settings** → **Domains & Routes** 中绑定自有域名。
2. **验证后端是否就绪**：
   在浏览器或终端访问：
   ```text
   https://<你的域名>/<私密路径>/api/utils/env
   ```
   若返回 JSON 且包含 `"backend": "Cloudflare Workers"`，说明后端与 D1 均已正常工作。
3. **开启内置前端（构建变量 `SUB_STORE_CF_FRONTEND=true`）时**：
   - 前端已自动部署在 Worker 的 `/` 根路径下。
   - **已配置 `SUB_STORE_FRONTEND_BACKEND_PATH`（推荐）**：首次访问打开一键配置链接即可自动绑定同源后端（浏览器会持久化保存，后续直接访问 `https://<你的域名>/` 即可）：
     ```text
     https://<你的域名>/?api=https://<你的域名>/<私密路径>
     ```
   - **未配置私密路径（仅限测试）**：直接访问 `https://<你的域名>/` 即可。
   - 内置前端与后端同源，**无需**配置 `SUB_STORE_CORS_ALLOWED_ORIGINS`。
4. **仅部署后端（默认）或使用外部前端时**：
   - 使用官方托管前端（`https://sub.xream.eu.org`）时，直接打开一键配置链接：
     ```text
     https://sub.xream.eu.org?api=https://<你的域名>/<私密路径>
     ```
   - 若使用其他独立域名自建前端，请将前端完整 Origin（如 `https://sub.example.com`）添加到 `SUB_STORE_CORS_ALLOWED_ORIGINS`。

> **安全提醒**：公网部署时**务必**设置 `SUB_STORE_FRONTEND_BACKEND_PATH`（或 `SUB_STORE_TOKEN`）。如果留空，任何知道你 Worker 域名的人都能直接读写你的订阅与配置。

---

## 五、已实现的功能

以下功能已在 Cloudflare Workers 版本中完整实现并通过集成测试验证：

1. **可选前后端合一静态托管（`/` 路径）**
   - 默认仅部署后端；在构建期设置环境变量 `SUB_STORE_CF_FRONTEND=true` 后，构建时会自动拉取官方 `Sub-Store-Front-End` 发布包并随 Worker 一起部署至 **Cloudflare Workers Static Assets**，直接托管在 `/` 路径下，自动配置 `_headers` 静态缓存策略并剔除冗余 `.gz` 副本。
   - 静态文件（HTML / JS / CSS / 图片 / PWA 资源）由 Cloudflare 边缘节点直接响应，**零 Worker 调用、零 D1 读取**；Vue Router History 模式路径（如 `/subs`、`/files`、`/edit/...`）由 Worker 自动回退到 `/index.html`，同样**零 D1 读取**。
   - 同源请求自动放行 CORS，开箱即用；未携带私密前缀的 `/api/*`、`/download/*`、`/share/*` 请求保持 `404` 隔离，不会泄露或误返回前端页面。
2. **核心订阅管理与格式转换**
   - 单条订阅（Subscriptions）、组合订阅（Collections）、文件（Files）、同步配置（Artifacts）、归档（Archives）、模块（Modules）的完整增删改查与排序。
   - 全量输入/输出格式解析与生成：mihomo（Clash.Meta）、Surge、SurgeMac、Loon、Quantumult X、Stash、Egern、Shadowrocket、Surfboard、sing-box、V2Ray / URI、Plain JSON 等。
   - 订阅下载（`/download/...`）、节点预览（`/api/preview/...`）、节点解析（`/api/parser`）、节点信息查询（`/api/utils/node-info`）、订阅流量信息读取（`subscription-userinfo`）。
3. **节点过滤与操作器**
   - 全部内置过滤器与操作器：正则过滤、丢弃过滤、地区过滤、类型过滤、无效节点过滤、属性设置、国旗操作、排序、正则重命名/删除等。
   - **脚本操作（Script Operator）、脚本过滤（Script Filter）与响应修改**：基于 `sval` 纯 JS 沙箱解释器执行用户脚本，支持 `async/await` 及标准 Web/ECMAScript 全局对象（`fetch`、`URL`、`crypto`、`TextEncoder`、`Map`/`Set` 等）。
   - **域名解析操作（Resolve Domain Operator）**：支持 **DoH（DNS over HTTPS）**。
   - **TLS 证书指纹计算**：纯 JS 实现的 SHA-256 PEM 指纹生成，与 Node 版 `jsrsasign` 字节级一致。
4. **D1 持久化与缓存优化**
   - 全部配置持久化至 D1 `kv_store` 表，自动建表并自动执行数据迁移（`migrate()`）。
   - 远程订阅缓存、响应头缓存、脚本缓存按条目拆分存储（`rc:resource` / `rc:headers` / `rc:script`），避免单行体积过大；加载时自动清理过期条目，并兼容从旧版单行缓存自动迁移。
   - 脏数据增量批量提交（`db.batch`）：配置写入同步落库确保强一致，纯缓存/辅助数据通过 `ctx.waitUntil` 异步刷盘降低响应延迟。
   - CORS 预检（`OPTIONS`）、前端资源/SPA 回退与未命中私密前缀的非法请求直接短路，**零 D1 读取开销**。
5. **安全、分享与加密**
   - 私密路径前缀保护（`SUB_STORE_FRONTEND_BACKEND_PATH` / `SUB_STORE_TOKEN`）。
   - 公开分享链接（`/share/...?token=...`）：支持有效期与访问次数限制，配置私密前缀后分享链接仍可从根路径正常访问，支持无效分享返回假节点（`invalidShareFakeNode`）。
   - CORS Origin 白名单校验、同源自动放行与预检响应。
   - Age 加密接口（`/api/age`）。
6. **备份、同步与运维**
   - JSON 备份导出与导入恢复（`/api/storage`）。
   - GitHub Gist / GitLab Snippet 备份上传/下载与 Artifact 同步（`/api/sync`）。
   - Cloudflare Cron Triggers 定时执行 `sync` / `upload` / `download`。
   - `/api/utils/env`、`/api/utils/refresh`（清除全部缓存）、`/api/logs`（查看/清空日志）。

---

## 六、已知缺陷与平台限制

由于 Cloudflare Workers 属于无状态 Serverless 边缘运行时（无本地文件系统、无原生 TCP/UDP Socket、禁止 `eval`/`new Function`、存在 CPU 与子请求配额），相较于 Node.js 自建版本存在以下限制：

### 1. 脚本执行（`sval` 沙箱）限制
- **不支持 `require(...)`**：无法加载 Node.js 内置模块（`fs`、`path`、`net`、`crypto` Node API 等）或第三方 npm 包，依赖 `require` 的复杂脚本无法运行。
- **不支持 `process.env` 等 Node 全局变量**：脚本中仅可访问标准 JS 与 Web API 全局对象（见 `backend/src/cf/dynamic-function.js`）。
- **CPU 时间限制**：`sval` 为纯 JS AST 解释执行，性能低于 V8 原生 JIT。在 Workers 免费版（单次请求 CPU 上限 10ms，付费版最高 30s）下，超大订阅配合重型脚本可能触发 **Error 1102（CPU time limit exceeded）**。
- 极少数最新或非标准 ECMAScript 语法可能受限于 `sval` 的语法支持范围。

### 2. 网络与协议限制
- **域名解析仅支持 DoH**：不支持 UDP DNS、TCP DNS 和 DoT（DNS over TLS），选择非 DoH 协议会直接报错。
- **不支持出站代理（HTTP / SOCKS 代理）**：设置中的 `defaultProxy`、单条订阅代理以及 `SUB_STORE_BACKEND_DEFAULT_PROXY` 均**不会生效**，所有远程请求均由 Cloudflare 边缘节点直接发起 `fetch`。
- **不支持跳过 TLS 证书校验（`insecure`）**：Workers 标准 `fetch` 无法忽略自签名或过期证书，拉取证书异常的订阅源会失败。
- **源站风控与 CF 防回环**：部分机场会屏蔽 Cloudflare 数据中心 IP，或触发 Cloudflare 质检拦截；Worker 请求同账户/特定 CF 代理域名时也可能受限。
- **子请求数量上限**：Workers 免费版单次请求最多发起 50 个子请求（付费版 1,000 个）。包含大量远程订阅的组合订阅，或对大量节点执行 DoH 解析时，容易触及上限。

### 3. 无本地文件系统与 Node 专属功能缺失
- **不支持本地 GeoIP / ASN MMDB 数据库**：`SUB_STORE_MMDB_COUNTRY_PATH` / `SUB_STORE_MMDB_ASN_PATH` 不可用，依赖本地 MMDB 的脚本功能无法获取本地数据库数据。
- **不支持读取本地 CA 证书文件**：节点配置中的 `_ca` 本地路径字段不可用（内联 `ca-str` / `ca_str` 及证书指纹计算不受影响）。
- **推送通知不支持 Shoutrrr 协议**：`SUB_STORE_PUSH_SERVICE` 仅支持 `http://` / `https://` URL 模板，**不支持** Node 版内置的 `shoutrrr-ts`（如 `telegram://`、`bark://`、`discord://`、`ntfy://` 等）。

### 4. 定时任务粒度限制
- **不支持单个 Artifact 的独立 `cron` 表达式**：由于没有常驻进程，每个 Artifact 上单独填写的 `cron` 不会独立调度。
- 仅支持通过 Cloudflare Cron Triggers 全局触发，统一执行 `SUB_STORE_CF_CRON_TASKS`（`sync` 会一次性同步所有 Artifacts）。

### 5. 存储、并发与日志特性
- **每次有效请求全量读取 D1 `kv_store`**：请求命中私密前缀后，Worker 会加载 `kv_store` 全部行到内存。如果存放大量大体积文件或缓存过多，会增加响应耗时、内存占用与 D1 行读取配额消耗（建议控制文件体积与缓存 TTL）。
- **多边缘节点并发写入为最后写入胜出（Last-Write-Wins）**：`withStoreLock` 仅在单个 Worker Isolate 内串行化并发请求；若同一时刻多个写请求命中不同边缘实例，后完成者可能覆盖前者（个人日常使用一般无影响）。
- **日志持久化与 D1 写入权衡**：Sub-Store 日志默认关闭（`logsMaxCount = 0`）。若在前端设置中调大日志保留条数，每次产生日志都会异步写回 D1 的 `sub-store-logs` 行，可能显著增加 D1 写入量。日常排错建议保持默认关闭，直接使用 Cloudflare Dashboard 的 **Real-time Logs** 或本地运行 `npx wrangler tail` 查看实时日志。

---

## 七、常见问题排查

- **访问 `/` 根路径没有显示前端（返回 `404` 或 JSON）**：默认构建仅部署后端；如需同时部署前端，请确认是在 Cloudflare Dashboard 的 **Build → Variables and secrets（构建变量）** 中设置 `SUB_STORE_CF_FRONTEND = true`（注意不是运行时的 Variables and Secrets），并重新触发一次构建部署。
- **访问接口一直返回 `404`**：检查是否配置了 `SUB_STORE_FRONTEND_BACKEND_PATH` / `SUB_STORE_TOKEN`，请求 URL 必须包含该前缀（例如 `https://<域名>/<前缀>/api/utils/env`）。
- **外部前端提示跨域错误（HTTP `403 CORS origin not allowed`）**：内置 `/` 前端同源已自动放行；若使用其他独立域名自建前端，请将其所在域名（含协议，不含末尾 `/`）加入 `SUB_STORE_CORS_ALLOWED_ORIGINS`。
- **提示 `Cloudflare D1 binding not found`**：检查 Worker 的 D1 绑定变量名是否为 `SUB_STORE_DB`（或 `DB`）。
- **出现 `Error 1102`（Worker exceeded resource limits）**：通常是免费版 10ms CPU 上限被脚本操作或超大订阅触发；可尝试精简脚本、减少单次转换节点数、开启远程缓存，或升级 Workers Paid 计划。
- **订阅拉取超时或被拦截**：确认订阅源未屏蔽 Cloudflare IP、未使用自签名 HTTPS 证书，且未依赖出站代理。
