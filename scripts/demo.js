function operator(proxies = [], targetPlatform, context) {
  // 支持快捷操作 不一定要写一个 function
  // 可参考 https://t.me/zhetengsha/970
  // https://t.me/zhetengsha/1009

  // proxies 为传入的内部节点数组
  // 可在预览界面点击节点查看 JSON 结构 或查看 `target=JSON` 的通用订阅
  // 1. 结构大致参考了 Clash.Meta(mihomo), 可参考 mihomo 的文档, 例如 `xudp`, `smux` 都可以自己设置. 但是有私货, 下面是我能想起来的一些私货. 顺便说一下, 关于 mihomo 不支持的协议, 其实也可以用 JSON/JSON5/YAML 格式来输入, 写法可参考使用 includeUnsupportedProxy 参数或开启 包含官方/商店版不支持的协议 开关时的 mihomo 输出内容, 例如 NaiveProxy 输入写法 (https://t.me/zhetengsha/4308)
  // 2. `_no-resolve` 为不解析域名
  // 3. 域名解析后 会多一个 `_resolved` 字段, 表示是否解析成功
  // 4. 域名解析后会有`_IPv4`, `_IPv6`, `_IP`(若有多个步骤, 只取第一次成功的 v4 或 v6 数据), `_IP4P`(若解析类型为 IPv6 且符合 IP4P 类型, 将自动转换), `_domain` 字段, `_resolved_ips` 为解析出的所有 IP
  // 5. `_subName` 为单条订阅名, `_subDisplayName` 为单条订阅显示名
  // 6. `_collectionName` 为组合订阅名, `_collectionDisplayName` 为组合订阅显示名
  // 7. `tls-fingerprint` 为 tls 指纹
  // 8. `underlying-proxy` 为前置代理, 不同平台会自动转换
  //    例如 $server['underlying-proxy'] = '名称'
  //    只给 mihomo 输出的话, `dialer-proxy` 也行
  //    只给 sing-box 输出的话, `detour` 也行
  //    只给 Egern 输出的话, `prev_hop` 也行
  //    只给 Shadowrocket 输出的话, `chain` 也行
  //    输出到 Clash/Stash 时, 会过滤掉配置了前置代理的节点, 并提示使用对应的功能.
  // 9. `trojan`, `tuic`, `hysteria`, `hysteria2`, `juicity` 会在解析时设置 `tls`: true (会使用 tls 类协议的通用逻辑),  输出时删除
  // 10. `sni` 在某些协议里会自动与 `servername` 转换
  // 11. 读取节点的 ca-str 和 _ca (后端文件路径) 字段, 自动计算 fingerprint (参考 https://t.me/zhetengsha/1512)
  // 12. 以 Surge 为例, 最新的参数一般我都会跟进, 以 Surge 文档为例, 一些常用的: TUIC/Hysteria 2 的 `ecn`, Snell 的 `reuse` 连接复用, QUIC 策略 block-quic`, Hysteria 2 下载带宽 `down`
  //     Surge 的 `private-key`/`client-cert` 对应内部字段 `keystore-private-key`/`keystore-client-cert`, 值都是 Surge `[Keystore]` 里的密钥库条目名, 不是证书/密钥内容或本地路径
  //     例如: $server['keystore-private-key'] = 'ssh-key-name' 输出 Surge SSH 时会生成 private-key="ssh-key-name"
  //     例如: $server['keystore-client-cert'] = 'client-cert-name' 输出 Surge TLS 代理时会生成 client-cert="client-cert-name"
  // 13. `test-url` 为测延迟链接, `test-timeout` 为测延迟超时
  // 14. `ports` 为端口跳跃, `hop-interval` 变换端口号的时间间隔
  // 15. `ip-version` 设置节点使用 IP 版本，兼容各家的值. 会进行内部转换. sing-box 以外: 若无法匹配则使用原始值. sing-box: 需有匹配且节点上设置 `_dns_server` 字段, 将自动设置 `domain_resolver.server`. 同时, `sing-box` 支持使用 `_domain_resolver` 设置 `domain_resolver`: 字符串会作为 `server`, 对象会合并到 `domain_resolver`
  // 16. `sing-box` 支持使用 `_network` 来设置 `network`, 例如 `tcp`, `udp`
  //    仅对 sing-box 源码里有 `network` 字段的协议生效: `ss`, `ssr`, `socks5`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `tuic`, `snell`.
  //    注意: mihomo 风格的 `udp: true` 表示节点支持 UDP, 不会转换成 sing-box 的 `network: "udp"`; sing-box 默认就是 TCP+UDP. `udp: false` 会转换成 `network: "tcp"`. `_network` 是显式覆盖, 优先级高于 `udp`.
  // 17. `block-quic` 支持 `auto`, `on`, `off`. 不同的平台不一定都支持, 会自动转换
  // 18. `sing-box` 支持 `_fragment`, `_fragment_fallback_delay`, `_record_fragment` 设置 `tls` 的 `fragment`, `fragment_fallback_delay`, `record_fragment`
  // 19. `sing-box` 支持 `_certificate`, `_certificate_path`, `_certificate_public_key_sha256`, `_client_certificate`, `_client_certificate_path`, `_client_key`, `_client_key_path` 设置 `tls` 的 `certificate`, `certificate_path`, `certificate_public_key_sha256`, `client_certificate`, `client_certificate_path`, `client_key`, `client_key_path`
  // 20. `sing-box` 支持使用完整的 `_ech` 结构设置 `tls` 的 `ech`. 避免冲突, URI 里的原始 `ech` 参数会保存在 `_echConfigList`
  // 21. 2.21.59 开始, `sing-box` 支持使用 `ech-opts` 结构设置 `tls` 的 `ech`. 参考 https://github.com/sub-store-org/Sub-Store/pull/563/changes 基本沿用 mihomo 风格, mihomo 部分字段自动转换. URI `ech` 与 mihomo `ech-opts` 会互转: base64 ECHConfigList 使用 `ech-opts.config`; Xray 的 DNS server 写法(如 `https://1.1.1.1/dns-query` 或 `example.com+https://1.1.1.1/dns-query`)会把 DNS server 放到 `ech-opts._dns`, 显式查询域名放到 `ech-opts.query-server-name`. mihomo 不支持在 ech-opts 中配置 ECH DNS. 如需跟节点 ECH 配置一致, 请在 mihomo 配置文件里设置, 可参考: `dns["nameserver-policy"]["cloudflare-ech.com"] = ["https://dns.alidns.com/dns-query"]` . 反向输出 URI 时, 可设置 `ech-opts._dns` 来拼回 `ech`; 如果只设置 `query-server-name` 且未设置 `_dns`, 默认使用 `https://dns.alidns.com/dns-query` 并输出 warn 日志, 自定义 root DNS 请设置 `ech-opts._dns`. XHTTP `download-settings` 里嵌套的 TLS ECH 同样支持, 其中 `echForceQuery`/`echSockopt` 分别对应 `ech-opts._force-query`/`ech-opts._sockopt`, 嵌套 DNS 可设置 `xhttp-opts.download-settings.ech-opts._dns`
  // 22. `sing-box` 支持使用完整的 `_curve_preferences` 结构设置 `tls` 的 `curve_preferences`
  // 23. `interface-name` 指定流量出站接口 只给 Surge 用的话, `interface` 也可以
  // 24. Surge for macOS 可手动指定链接参数 target=SurgeMac 或在 同步配置 中指定 SurgeMac 来启用 mihomo 支援 Surge 本身不支持的协议, 详见 https://t.me/zhetengsha/1735 . 设置节点字段 `_mihomoExternal` 为 `true` 可强制指定使用 mihomo External Proxy Program 输出该节点. 节点字段 _exec 为 mihomo 路径, 默认 /usr/local/bin/mihomo; 节点字段 _localPort 端口为初始端口号, 逐个递减, 默认为 65535. _merge 为开启仅一个 mihomo 进程+多个 listeners 的模式, 此时仅有一个 mihomo External Proxy Program, 节点会转成 SOCKS5, _mergeName 可设置这个 mihomo 节点的名字(默认为 mihomo merged); _config 对象可覆盖默认配置, _defaultNameserver(默认为 [ '180.76.76.76', '52.80.52.52', '119.28.28.28', '223.6.6.6' ]) 和 _nameserver (默认为 [ 'https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query', 'https://doh-pure.onedns.net/dns-query' ]) 为数组 用于自定义 mihomo 的 default-nameserver 和 nameserver
  // 25. VLESS xhttp URI 的 extra 默认会拆成两部分处理: mihomo 已支持的字段会解析到节点的结构化字段并在输出 URI 时重新组装; extra 里 mihomo 还不支持的字段只会保存在 `_extra_unsupported` 对象里. 输出 URI 时会用“当前结构化字段 + _extra_unsupported”一起构造 extra, 这样既不会让旧 raw extra 覆盖后来修改过的 mihomo 字段, 也能避免 VLESS URI -> VLESS URI 的流程里把暂不支持的 extra 字段丢掉. 但如果节点上显式设置了 `_extra`, 且它是字符串或普通对象, 那么输出 URI 时 extra 会直接使用 `_extra` (对象会自动转成 JSON 字符串), 不再重组结构化字段. 这是为了方便手动自定义 extra, 不用再一个个同步那些本来会影响 extra 的其它字段
  // 修改/设置 extra 举例:
  // 如果是你写的全是 mihomo 已经支持的格式 就直接按 mihomo 的设置
  // 比如
  // `$server['xhttp-opts']['download-settings'] = {}`
  // 如果有 mihomo 不支持的字段可以手动设到 `_extra_unsupported` 字段里, 会自动重组
  // 如果你是 xray -> xray 用, 可以直接设置 `$server._extra = { }` 或 `$server._extra = ""`
  // 26. `_qx_obfs_http` 为 QX 的 http obfs 原始值, 例如 `http`, `vmess-http`, `vemss-http`, `shadowsocks-http`, 用于 QX 输入输出时保留原始写法. `vemss-http` 应该是 huaqian 的 typo, 没测过, 反正也支持, 报错就自己改成 `vmess-http` 吧
  // 27. WireGuard 支持 `ip-cidr`(IPv4 前缀长度) 和 `ipv6-cidr`(IPv6 前缀长度) 字段: 内部会保存前缀长度, 若未设置则默认分别为 `32` 和 `128`. 输出到 `mihomo`/`Shadowrocket`/`sing-box`/`URI` 时会带上该后缀
  // 28. sing-box 1.14.0 起才有 `control_http_client` , 暂时可使用 `control-http-client` 字段设置 sing-box 的 `control_http_client`
  //     若 `control-http-client` 非空, 输出 sing-box Tailscale endpoint 时会跳过旧版拨号字段映射, 避免和 `detour`/`dialer-proxy` 等 legacy dialer options 冲突. 需要给控制面设置前置代理时, 请写到 `control-http-client.detour`(1.14.0-alpha.26 又改回去了...)
  // 29. sing-box 支持使用 `ssh-server` 给 tailscale 设置 `ssh_server`, 直接设为 `true` 或 `{ "enabled": true, "disable-pty": true, "disable-sftp": true, "disable-forwarding": true }`
  // 30. Loon 支持使用 `_loon_tls_profile` 设置 `tls-profile` 字段('default', 'chrome', 'ios18', 'ios26'), 否则则使用 client-fingerprint 自动转换部分对应的值
  // 31. `shadow-tls-password`/`shadow-tls-sni`/`shadow-tls-version` 这套旧字段已废弃. 请使用 `plugin: 'shadow-tls'` 和 `plugin-opts: { password, host, version }`
  // 32. mihomo 中 Snell shadow-tls 字段与 ss shadow-tls 字段不同, 使用的是 obfs-opts 而不是 plugin+plugin-opts, 不能与 obfs http/tls 共存. Sub-Store 内部有字段转换, 建议直接使用单行 Surge 格式 `1=snell,a.com,443,version=4,psk="1",obfs=http,obfs-host=a.com,shadow-tls-password="1",shadow-tls-sni=a.com,shadow-tls-version=3,alpn="http/1.1,h2",reuse=true` . 若想使用 JSON/JSON5/YAML 单行格式输入, 可使用 `{ "name": "1", "server": "a.com", "port": 443, "psk": "1", "version": 4, "reuse": true, "type": "snell", "obfs-opts": { "mode": "http", "host": "a.com" }, "plugin": "shadow-tls", "plugin-opts": { "host": "a.com", "password": "1", "version": 3, "alpn": [ "http/1.1", "h2" ] } }`
  // 33. sing-box Snell 出站默认允许 version 4/5/6, 其中 version 5 会按 sing-box 行为输出成 version 4. 开启“含不支持的协议”时保留 version 1/2/3/4/5/6. 节点上的 `_userkey` 会输出为 sing-box 的 `userkey`
  // 34. VLESS/Trojan URI 的 `vcn` 对应 mihomo 的 `name-cert-verify`. Xray-core 支持用逗号分隔多个 name, mihomo 只支持一个, 因此输入时取第一个有效值, 同时用 `_vcn` 数组保留全部有效值; 输出 URI 时优先用 `_vcn` 还原为 `vcn`, 没有 `_vcn` 时才使用 `name-cert-verify`. 若想设置为其他值, 可使用脚本操作设置, 例如 `$server["name-cert-verify"] = $server._vcn?.[1] || $server._vcn?.[0]`

  // require 为 Node.js 的 require, 在 Node.js 运行环境下 可以用来引入模块
  // 例如在 Node.js 环境下, 将文件内容写入 /tmp/1.txt 文件
  // const fs = eval(`require("fs")`)
  // // const path = eval(`require("path")`)
  // fs.writeFileSync('/tmp/1.txt', $content, "utf8");

  // $arguments 为传入的脚本参数

  // $options 为通过链接传入的参数
  // 例如: { arg1: 'a', arg2: 'b' }
  // 可这样传:
  // 先这样处理 encodeURIComponent(JSON.stringify({ arg1: 'a', arg2: 'b' }))
  // /api/file/foo?$options=%7B%22arg1%22%3A%22a%22%2C%22arg2%22%3A%22b%22%7D
  // 或这样传:
  // 先这样处理 encodeURIComponent('arg1=a&arg2=b')
  // /api/file/foo?$options=arg1%3Da%26arg2%3Db

  // 注意, 编辑页面左下角那个即可预览只是获取数据 并不是一个真实的请求, 故此时无法使用 $options
  // 默认会带上 _req 字段, 结构为
  // {
  //     method,
  //     url,
  //     path,
  //     query,
  //     params,
  //     headers,
  //     body,
  //     scoket: {
  //         remoteAddress
  //     }
  // }
  // console.log($options)

  // 若设置 $options._res.headers
  // 则会在输出时设置响应头, 例如:
  // if ($options) {
  //   $options._res = {
  //     headers: {
  //       'X-Custom': '1'
  //     }
  //   }
  // }

  // 若设置 $options._res.status
  // 则会在输出时设置响应状态码, 例如:
  // if ($options) {
  //   $options._res = {
  //     status: 404
  //   }
  // }

  // 一个示例: 请求来自分享且 ua 不符合时, 返回自定义状态码和响应内容

  // const { headers, url, path } = $options?._req || {}
  // const ua = headers?.['user-agent'] || headers?.['User-Agent']

  // if ($options && /^\/share\//.test(url) && !/surge/i.test(ua)) {
  //   $options._res = {
  //     status: 418
  //   }
  //   $content = `I'm a teapot`
  // }

  // targetPlatform 为输出的目标平台

  // lodash

  // $substore 为 OpenAPI
  // 源码 https://raw.githubusercontent.com/sub-store-org/Sub-Store/refs/heads/master/backend/src/vendor/open-api.js
  // 一个发请求的例子
  // const $ = $substore
  // const { body, statusCode } = await $.http.post({
  //   url: 'https://httpbingo.org/anything',
  //   headers: {
  //     'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
  //     'content-type': 'application/json; charset=utf-8',
  //   },
  //   timeout: 5000,
  //   body: JSON.stringify({
  //     a: 1
  //   }),
  // })
  // $.info(statusCode)
  // $.info(body)
  // const obj = JSON.parse(body)

  // scriptResourceCache 缓存
  // 可参考 https://t.me/zhetengsha/1003
  // const cache = scriptResourceCache
  // 写入
  // 第三个参数为自定义过期时间(单位: 毫秒)
  // cache.set('a:1', 1, 1000)
  // cache.set('a:2', 2)
  // 获取
  // cache.get('a:1')
  // 获取到期时间
  // cache.gettime('a:1')
  // 支持第二个参数: 自定义过期时间(单位: 毫秒)
  // 支持第三个参数: 是否删除过期项
  // 下面的例子意思是原来是看 a:2 现在有没有到期的, 加了自定义过期时间后是看 +1000ms 会不会过期, 如果过期就删除
  // cache.get('a:2', 1000, true)

  // 清理
  // 本来是内部的 反正也能用...先这么用吧...
  // 清理所有过期的
  // cache._cleanup()
  // 支持第一个参数: 匹配前缀的项
  // 支持第二个参数: 自定义过期时间(单位: 毫秒)
  // 只清理 a: 开头的过期项
  // cache._cleanup('a:')
  // 如果想删除所有的 a: 开头的过期项, 目前先传一个大的过期时间吧...
  // cache._cleanup(undefined, 48 * 3600 * 1000)
  // 下面的例子意思是原来是看现在有没有到期的, 加了自定义过期时间后是看 +1000ms 会不会过期, 如果过期就删除
  // cache._cleanup(undefined, 1000)

  // 关于缓存时长

  // 拉取 Sub-Store 订阅时, 会自动拉取远程订阅

  // 通过链接下载资源时, 缓存的唯一 key 为 url+ user agent. 可通过前端的刷新按钮刷新缓存. 或使用参数 noCache 来禁用缓存. 例: 内部配置订阅链接时使用 http://a.com#noCache, 外部使用 sub-store 链接时使用 https://sub.store/download/1?noCache=true

  // 前端(>= 2.16.0) 后端(>= 2.21.0) 支持自定义各种缓存的 TTL 配置

  // 持久化缓存数据在 JSON 里

  // 当配合脚本使用时, 可以在脚本的前面添加一个脚本操作, 实现保留 1 小时的缓存. 这样比较灵活

  // async function operator() {
  //     scriptResourceCache._cleanup(undefined, 1 * 3600 * 1000);
  // }

  // DOMAIN_RESOLVERS 为内置域名解析, 详见 backend/src/core/proxy-utils/processors/index.js

  // ProxyUtils 为节点处理工具
  // 可参考 https://t.me/zhetengsha/1066
  // const ProxyUtils = {
  //     parse, // 订阅解析
  //     process, // 节点操作/文件操作
  //     produce, // 输出订阅
  //     getRandomPort, // 获取随机端口(参考 ports 端口跳跃的格式 443,8443,5000-6000)
  //     ipAddress, // https://github.com/beaugunderson/ip-address
  //     isIPv4,
  //     isIPv6,
  //     isIP,
  //     yaml, // yaml 解析和生成
  //     getFlag, // 获取 emoji 旗帜
  //     removeFlag, // 移除 emoji 旗帜
  //     getISO, // 获取 ISO 3166-1 alpha-2 代码
  //     Gist, // Gist 类
  //     download, // 内部的下载方法, 见 backend/src/utils/download.js
  //     downloadFile, // 下载二进制文件, 见 backend/src/utils/download.js
  //     age: {
  //         encrypt, // age 加密, 返回 armored 文本
  //         decrypt, // age 解密, 非 armored 文本会原样返回
  //     },
  //     MMDB, // Node.js 环境 可用于模拟 Surge/Loon 的 $utils.ipasn, $utils.ipaso, $utils.geoip. 具体见 https://t.me/zhetengsha/1269
  //     isValidUUID, // 辅助判断是否为有效的 UUID
  //     doh, // DNS over HTTPS 解析, 源码见 backend/src/utils/dns.js, 使用参考本项目里调用方式 backend/src/core/proxy-utils/processors/index.js
  //     Buffer, // https://github.com/feross/buffer
  //     Base64, // https://github.com/dankogai/js-base64
  //     JSON5, // https://github.com/json5/json5
  //     hex_md5, // backend/src/vendor/md5.js
  // }
  //  为兼容 https://github.com/xishang0128/sparkle 的 JavaScript 覆写, 也可以直接使用 `b64d`(Base64 解码), `b64e`(Base64 编码), `Buffer`, `yaml`(简单兼容了下 `yaml.parse` 和 `yaml.stringify`)

  // 如果只是为了快速修改或者筛选 可以参考 脚本操作支持节点快捷脚本 https://t.me/zhetengsha/970 和 脚本筛选支持节点快捷脚本 https://t.me/zhetengsha/1009
  // ⚠️ 注意: 函数式(即本文件这样的 function operator() {}) 和快捷操作(下面使用 $server) 只能二选一
  // 示例: 给节点名添加前缀
  // $server.name = `[${ProxyUtils.getISO($server.name)}] ${$server.name}`
  // 示例: 给节点名添加旗帜
  // $server.name = `[${ProxyUtils.getFlag($server.name).replace(/🇹🇼/g, '🇼🇸')}] ${ProxyUtils.removeFlag($server.name)}`

  // 示例: 从 sni 文件中读取内容并进行节点操作
  // const sni = await produceArtifact({
  //     type: 'file',
  //     name: 'sni' // 文件名
  // });
  // $server.sni = sni

  // 示例: 从 config 文件中读取配置项并进行节点操作
  // config 的本地内容为
  // {
  //   "reuse": false
  // }
  // 脚本操作为
  // const config = (ProxyUtils.JSON5 || JSON).parse(await produceArtifact({
  //     type: 'file',
  //     name: 'config' // 文件名
  // }))
  // $server.reuse = config.reuse

  // 示例: 使用 ProxyUtils.age.encrypt 加密文本
  // const armored = await ProxyUtils.age.encrypt(
  //     'hello age',
  //     'age1...'
  // )
  // console.log(armored)

  // 示例: 使用 ProxyUtils.age.decrypt 解密 armored 文本
  // const plaintext = await ProxyUtils.age.decrypt(
  //     armored,
  //     'AGE-SECRET-KEY-1...'
  // )
  // console.log(plaintext)

  // 1. Surge 输出 WireGuard 完整配置

  // let proxies = await produceArtifact({
  //   type: 'subscription',
  //   name: 'sub',
  //   platform: 'Surge',
  //   produceOpts: {
  //     'include-unsupported-proxy': true,
  //   }
  // })
  // $content = proxies

  // 2. sing-box

  // 但是一般不需要这样用, 可参考
  // 1. https://t.me/zhetengsha/1111
  // 2. https://t.me/zhetengsha/1070
  // 3. https://t.me/zhetengsha/1241

  // let singboxProxies = await produceArtifact({
  //     type: 'subscription', // type: 'subscription' 或 'collection'
  //     name: 'sub', // subscription name
  //     platform: 'sing-box', // target platform
  //     produceType: 'internal' // 'internal' produces an Array, otherwise produces a String( JSON.parse('JSON String') )
  // })

  // // JSON
  // $content = JSON.stringify({}, null, 2)

  // 3. clash.meta

  // 但是一般不需要这样用, 可参考
  // 1. https://t.me/zhetengsha/1111
  // 2. https://t.me/zhetengsha/1070
  // 3. https://t.me/zhetengsha/1234

  // let clashMetaProxies = await produceArtifact({
  //     type: 'subscription',
  //     name: 'sub',
  //     platform: 'ClashMeta',
  //     produceOpts: {
  //         prettyYaml: true // 输出更易读的块状 YAML, 默认仍是单行 JSON 风格
  //     },
  //     produceType: 'internal' // 'internal' produces an Array, otherwise produces a String( ProxyUtils.yaml.safeLoad('YAML String').proxies )
  // })

  // 4. 一个比较折腾的方案: 在脚本操作中, 把内容同步到另一个 gist
  // 见 https://t.me/zhetengsha/1428
  //
  // const content = ProxyUtils.produce([...proxies], platform)

  // // YAML
  // ProxyUtils.yaml.load('YAML String')
  // ProxyUtils.yaml.safeLoad('YAML String')
  // $content = ProxyUtils.yaml.safeDump({})
  // $content = ProxyUtils.yaml.dump({})

  // 一个往文件里插入本地节点的例子:
  // const yaml = ProxyUtils.yaml.safeLoad($content ?? $files[0])
  // let clashMetaProxies = await produceArtifact({
  //     type: 'collection',
  //     name: '机场',
  //     platform: 'ClashMeta',
  //     produceType: 'internal'
  // })
  // yaml.proxies.unshift(...clashMetaProxies)
  // $content = ProxyUtils.yaml.dump(yaml)

  // 一个 Base64 编码的例子:
  // $content = ProxyUtils.Base64.encode($content ?? $files[0])

  // { $content, $files, $options } will be passed to the next operator
  // $content is the final content of the file

  // flowUtils 为机场订阅流量信息处理工具
  // 可参考:
  // 1. https://t.me/zhetengsha/948

  // context 为传入的上下文, 可在多个脚本中共享使用
  // 其中 env 为 环境信息, 包含运行版本和其他后端信息
  // 可通过 context.process 动态控制本次处理中后续 action 是否执行
  // 只按 customName 匹配, 只影响当前脚本之后的 action
  // type 为 disable 时, 跳过 customNames 中的后续 action
  // type 为 enable 时, 只执行 customNames 中的后续 action
  // 示例: 准备 A/B/C 三个脚本操作, A 根据请求 UA 决定后续使用 B 还是 C
  // if ($options?._req) {
  //   const { headers, url, path } = $options?._req || {};
  //   // 获取 user-agent
  //   const ua = headers?.["user-agent"] || headers?.["User-Agent"];
  //   console.log(`User-Agent: ${ua}`);
  //   context.process = /Surge/i.test(ua)
  //     ? { type: 'enable', customNames: ['branch-b'] }
  //     : { type: 'enable', customNames: ['branch-c'] };
  // }
  // 脚本操作和修改响应(Response Transformer)各自有独立的 context.process 控制, 两者不互相跨
  // 脚本操作只控制后续非修改响应操作
  // 修改响应中设置 context.process 只控制后续修改响应操作

  // context.raw 为原始订阅内容, 用于在脚本里读取处理前的输入
  // 1. 单条订阅里的脚本: context.raw 一定是数组, 例如 ['原始订阅内容']
  //    如果单条订阅配置了多个远程 URL, 或合并了本地内容, 会按实际来源顺序放进同一个数组
  // 2. 组合订阅里的单条订阅脚本: context.raw 仍然是当前单条订阅自己的 raw 数组
  // 3. 组合订阅自己的脚本: context.raw 是对象, key 为单条订阅 name, value 为该单条订阅的 raw 数组
  //    例如 { 'sub-a': ['sub-a raw'], 'sub-b': ['sub-b raw 1', 'sub-b raw 2'] }
  //    如果某个子订阅处理失败并启用失败静默/失败通知, 会保留该 key, value 为 undefined
  //    如果启用静默兜底/通知兜底, 会保留该 key, value 为 []

  // 其中 source 为 订阅和组合订阅的数据, 有三种情况, 按需判断 (若只需要取订阅/组合订阅名称 直接用 `_subName` `_subDisplayName` `_collectionName` `_collectionDisplayName` 即可)

  // 若存在 `source._collection` 且 `source._collection.subscriptions` 中的 key 在 `source` 上也存在, 说明输出结果为组合订阅, 但是脚本设置在单条订阅上

  // 若存在 `source._collection` 但 `source._collection.subscriptions` 中的 key 在 `source` 上不存在, 说明输出结果为组合订阅, 脚本设置在组合订阅上

  // 若不存在 `source._collection`, 说明输出结果为单条订阅, 脚本设置在此单条订阅上

  // 这个历史遗留原因, 是有点复杂. 提供一个例子, 用来取当前脚本所在的组合订阅或单条订阅名称

  // let name = ''
  // for (const [key, value] of Object.entries(context.source)) {
  //   if (!key.startsWith('_')) {
  //     name = value.displayName || value.name
  //     break
  //   }
  // }
  // if (!name) {
  //   const collection = context.source._collection
  //   name = collection.displayName || collection.name
  // }

  // 1. 输出单条订阅 sub-1 时, 该单条订阅中的脚本上下文为:
  // {
  //   "source": {
  //     "sub-1": {
  //       "name": "sub-1",
  //       "displayName": "",
  //       "mergeSources": "",
  //       "ignoreFailedRemoteSub": true,
  //       "process": [],
  //       "icon": "",
  //       "source": "local",
  //       "url": "",
  //       "content": "",
  //       "ua": "",
  //       "display-name": "",
  //       "useCacheForFailedRemoteSub": false
  //     }
  //   },
  //   "backend": "Node",
  //   "version": "2.14.198"
  // }
  // 2. 输出组合订阅 collection-1 时, 该组合订阅中的脚本上下文为:
  // {
  //   "source": {
  //     "_collection": {
  //       "name": "collection-1",
  //       "displayName": "",
  //       "mergeSources": "",
  //       "ignoreFailedRemoteSub": false,
  //       "icon": "",
  //       "process": [],
  //       "subscriptions": [
  //         "sub-1"
  //       ],
  //       "display-name": ""
  //     }
  //   },
  //   "backend": "Node",
  //   "version": "2.14.198"
  // }
  // 3. 输出组合订阅 collection-1 时, 该组合订阅中的单条订阅 sub-1 中的某个脚本上下文为:
  // {
  //   "source": {
  //     "sub-1": {
  //       "name": "sub-1",
  //       "displayName": "",
  //       "mergeSources": "",
  //       "ignoreFailedRemoteSub": true,
  //       "icon": "",
  //       "process": [],
  //       "source": "local",
  //       "url": "",
  //       "content": "",
  //       "ua": "",
  //       "display-name": "",
  //       "useCacheForFailedRemoteSub": false
  //     },
  //     "_collection": {
  //       "name": "collection-1",
  //       "displayName": "",
  //       "mergeSources": "",
  //       "ignoreFailedRemoteSub": false,
  //       "icon": "",
  //       "process": [],
  //       "subscriptions": [
  //         "sub-1"
  //       ],
  //       "display-name": ""
  //     }
  //   },
  //   "backend": "Node",
  //   "version": "2.14.198"
  // }

  // 脚本中使用日志 可以参考这个格式 能在前端日志查看里区分识别
  // console.log(`[SCOPE] LOG: 信息`)
  // console.log(`[SCOPE] INFO: 信息`)
  // console.log(`[SCOPE] WARN: 警告`)
  // console.log(`[SCOPE] ERROR: 错误`)

  // 参数说明
  // 可参考 https://github.com/sub-store-org/Sub-Store/wiki/%E9%93%BE%E6%8E%A5%E5%8F%82%E6%95%B0%E8%AF%B4%E6%98%8E

  console.log(JSON.stringify(context, null, 2));

  return proxies;
}
