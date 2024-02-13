function operator(proxies = [], targetPlatform, context) {
  // 支持快捷操作 不一定要写一个 function
  // 可参考 https://t.me/zhetengsha/970
  // https://t.me/zhetengsha/1009 


  // proxies 为传入的内部节点数组
  // 结构大致参考了 Clash.Meta(mihomo) 有私货
  // 可在预览界面点击节点查看 JSON 结构 或查看 `target=JSON` 的通用订阅
  // 1. `no-resolve` 为不解析域名
  // 2. 域名解析后 会多一个 `resolved` 字段
  // 3. 节点字段 `exec` 为 `ssr-local` 路径, 默认 `/usr/local/bin/ssr-local`; 端口从 10000 开始递增(暂不支持配置)

  // $arguments 为传入的脚本参数

  // targetPlatform 为输出的目标平台

  // lodash

  // $substore 为 OpenAPI
  // 参考 https://github.com/Peng-YM/QuanX/blob/master/Tools/OpenAPI/README.md
  
  // scriptResourceCache 缓存
  // 可参考 https://t.me/zhetengsha/1003

  // ProxyUtils 为节点处理工具
  // 可参考 https://t.me/zhetengsha/1066
  // const ProxyUtils = {
  //     parse, // 订阅解析
  //     process, // 节点操作/文件操作
  //     produce, // 输出订阅
  //     isIPv4,
  //     isIPv6,
  //     isIP,
  //     yaml, // yaml 解析和生成
  // }

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

  // 但是一般不需要这样用, 可参考 1. https://t.me/zhetengsha/1111 和 2. https://t.me/zhetengsha/1070

  // let singboxProxies = await produceArtifact({
  //     type: 'subscription', // type: 'subscription' 或 'collection'
  //     name: 'sub', // subscription name
  //     platform: 'sing-box', // target platform
  //     produceType: 'internal' // 'internal' produces an Array, otherwise produces a String( JSON.parse('JSON String') )
  // })

  // // JSON
  // $content = JSON.stringify({}, null, 2)

  // 3. clash.meta

  // 但是一般不需要这样用, 可参考 1. https://t.me/zhetengsha/1111 和 2. https://t.me/zhetengsha/1070

  // let clashMetaProxies = await produceArtifact({
  //     type: 'subscription',
  //     name: 'sub',
  //     platform: 'ClashMeta',
  //     produceType: 'internal' // 'internal' produces an Array, otherwise produces a String( ProxyUtils.yaml.safeLoad('YAML String').proxies )
  // }))

  // // YAML
  // $content = ProxyUtils.yaml.safeDump({})


  // { $content, $files } will be passed to the next operator 
  // $content is the final content of the file
  // flowUtils 为机场订阅流量信息处理工具
  // 可参考 https://t.me/zhetengsha/948
  // https://github.com/sub-store-org/Sub-Store/blob/31b6dd0507a9286d6ab834ec94ad3050f6bdc86b/backend/src/utils/download.js#L104

  // context 为传入的上下文
  // 有三种情况, 按需判断

  // 若存在 `source._collection` 且 `source._collection.subscriptions` 中的 key 在 `source` 上也存在, 说明输出结果为组合订阅, 但是脚本设置在单条订阅上

  // 若存在 `source._collection` 但 `source._collection.subscriptions` 中的 key 在 `source` 上不存在, 说明输出结果为组合订阅, 脚本设置在组合订阅上

  // 若不存在 `source._collection`, 说明输出结果为单条订阅, 脚本设置在此单条订阅上

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

  console.log(JSON.stringify(context, null, 2))

  return proxies
}
