# Sub-Store 配置指南

Sub-Store 依赖于代理 App 的 MITM、重写以及 JavaScript 脚本等功能，**在开始使用前请确保 MITM 证书已经正确配置并信任，MITM、重写、脚本等开关处于开启状态**。

## 一、脚本配置：

### 1. **Loon**
安装使用[插件](https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/config/Loon.plugin)即可。
### 2. **Surge**
安装使用[模块](https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/config/Surge.sgmodule)即可。

### 3. **Quantumult X**
(1) 订阅[重写](https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/config/QX.snippet)

(2) 编辑配置文件，在 [task_local] 一节下添加：
```
0 0 1 1 * https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/backend/dist/cron-sync-artifacts.min.js, tag=Sub-Store Sync, enabled=true
```

### 4. **Stash**
安装使用[ Stash 覆写](https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/config/Stash.stoverride)

### 5. **Shadowrocket**
安装使用[模块](https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/config/Surge.sgmodule)即可。

## 二、使用 Sub-Store

(1) 使用 Safari 打开这个 https://sub.store 如网页正常打开并且未弹出任何错误提示，说明 Sub-Store 已经配置成功。

(2) 把 Sub-Store 添加到主屏幕，即可获得类似于 APP 的使用体验。

(3) 更详细的使用指南请参考[文档](https://www.notion.so/Sub-Store-6259586994d34c11a4ced5c406264b46)。
