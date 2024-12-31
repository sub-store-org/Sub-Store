function operator(proxies = [], targetPlatform, context) {
  // 支持快捷操作 不一定要写一个 function
  // 可参考 https://t.me/zhetengsha/970
  // https://t.me/zhetengsha/1009

  // proxies 为传入的内部节点数组
  // 可在预览界面点击节点查看 JSON 结构 或查看 `target=JSON` 的通用订阅
  // 0. 结构大致参考了 Clash.Meta(mihomo), 可参考 mihomo 的文档, 例如 `xudp`, `smux` 都可以自己设置. 但是有私货, 下面是我能想起来的一些私货
  // 1. `_no-resolve` 为不解析域名
  // 2. 域名解析后 会多一个 `_resolved` 字段, 表示是否解析成功
  // 3. 域名解析后会有`_IPv4`, `_IPv6`, `_IP`(若有多个步骤, 只取第一次成功的 v4 或 v6 数据), `_IP4P`(若解析类型为 IPv6 且符合 IP4P 类型, 将自动转换), `_domain` 字段, `_resolved_ips` 为解析出的所有 IP
  // 4. 节点字段 `exec` 为 `ssr-local` 路径, 默认 `/usr/local/bin/ssr-local`; 端口从 10000 开始递增(暂不支持配置)
  // 5. `_subName` 为单条订阅名, `_subDisplayName` 为单条订阅显示名
  // 6. `_collectionName` 为组合订阅名, `_collectionDisplayName` 为组合订阅显示名
  // 7. `tls-fingerprint` 为 tls 指纹
  // 8. `underlying-proxy` 为前置代理
  // 9. `trojan`, `tuic`, `hysteria`, `hysteria2`, `juicity` 会在解析时设置 `tls`: true (会使用 tls 类协议的通用逻辑),  输出时删除
  // 10. `sni` 在某些协议里会自动与 `servername` 转换
  // 11. 读取节点的 ca-str 和 _ca (后端文件路径) 字段, 自动计算 fingerprint (参考 https://t.me/zhetengsha/1512)
  // 12. 以 Surge 为例, 最新的参数一般我都会跟进, 以 Surge 文档为例, 一些常用的: TUIC/Hysteria 2 的 `ecn`, Snell 的 `reuse` 连接复用, QUIC 策略 block-quic`, Hysteria 2 下载带宽 `down`
  // 13. `test-url` 为测延迟链接, `test-timeout` 为测延迟超时
  // 14. `ports` 为端口跳跃, `hop-interval` 变换端口号的时间间隔
  // 15. `ip-version` 设置节点使用 IP 版本，可选：dual，ipv4，ipv6，ipv4-prefer，ipv6-prefer. 会进行内部转换, 若无法匹配则使用原始值
  // 16. `sing-box` 支持使用 `_network` 来设置 `network`, 例如 `tcp`, `udp`

  // require 为 Node.js 的 require, 在 Node.js 运行环境下 可以用来引入模块

  // $arguments 为传入的脚本参数

  // $options 为通过链接传入的参数
  // 例如: { arg1: 'a', arg2: 'b' }
  // 可这样传:
  // 先这样处理 encodeURIComponent(JSON.stringify({ arg1: 'a', arg2: 'b' }))
  // /api/file/foo?$options=%7B%22arg1%22%3A%22a%22%2C%22arg2%22%3A%22b%22%7D
  // 或这样传:
  // 先这样处理 encodeURIComponent('arg1=a&arg2=b')
  // /api/file/foo?$options=arg1%3Da%26arg2%3Db

  // console.log($options)

  // targetPlatform 为输出的目标平台

  // lodash

  // $substore 为 OpenAPI
  // 参考 https://github.com/Peng-YM/QuanX/blob/master/Tools/OpenAPI/README.md

  // scriptResourceCache 缓存
  // 可参考 https://t.me/zhetengsha/1003
  // const cache = scriptResourceCache
  // cache.set(id, data)
  // cache.get(id)

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
  //     MMDB, // Node.js 环境 可用于模拟 Surge/Loon 的 $utils.ipasn, $utils.ipaso, $utils.geoip. 具体见 https://t.me/zhetengsha/1269
  // }

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

  // { $content, $files, $options } will be passed to the next operator
  // $content is the final content of the file

  // flowUtils 为机场订阅流量信息处理工具
  // 可参考:
  // 1. https://t.me/zhetengsha/948

  // context 为传入的上下文
  // 其中 source 为 订阅和组合订阅的数据, 有三种情况, 按需判断 (若只需要取订阅/组合订阅名称 直接用 `_subName` `_subDisplayName` `_collectionName` `_collectionDisplayName` 即可)

  // 若存在 `source._collection` 且 `source._collection.subscriptions` 中的 key 在 `source` 上也存在, 说明输出结果为组合订阅, 但是脚本设置在单条订阅上

  // 若存在 `source._collection` 但 `source._collection.subscriptions` 中的 key 在 `source` 上不存在, 说明输出结果为组合订阅, 脚本设置在组合订阅上

  // 若不存在 `source._collection`, 说明输出结果为单条订阅, 脚本设置在此单条订阅上

  // 这个历史遗留原因, 是有点复杂. 提供一个例子, 用来取当前脚本所在的组合订阅或单条订阅名称

  // let name = ''
  // for (const [key, value] of Object.entries(env.source)) {
  //   if (!key.startsWith('_')) {
  //     name = value.displayName || value.name
  //     break
  //   }
  // }
  // if (!name) {
  //   const collection = env.source._collection
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

  // 参数说明
  // 可参考 https://github.com/sub-store-org/Sub-Store/wiki/%E9%93%BE%E6%8E%A5%E5%8F%82%E6%95%B0%E8%AF%B4%E6%98%8E

  console.log(JSON.stringify(context, null, 2));

  return proxies;
}
