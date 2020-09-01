# 配置说明

## 脚本配置：

## 1. Loon

1. 推荐直接使用[插件](https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/config/Loon.plugin)。

2. 商店用户可以配置本地脚本和MTIM
```
[MITM]
hostname=sub.store

[Script]
http-request https?:\/\/sub\.store script-path=https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/backend/sub-store.js, requires-body=true, timeout=120, tag=Sub-Store
```

## 2. Surge

目前iOS商店版本的bug未修复，暂时无法使用。TF用户直接使用[模块](https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/config/Surge.sgmodule)。


## 3. QX

QX暂时需要通过backend方式使用，添加如下配置。注意，HTTP backend开关需要打开！

```
[http_backend]
https://raw.githubusercontent.com/Peng-YM/Sub-Store/master/backend/sub-store.js, tag=Sub-Store, path=/, enabled=true
```

## 界面配置：

### 1. Loon & Surge
Loon和Surge用户，打开这个[页面](https://sub-store.vercel.app/)即可。

### 2. QX
QX用户需要曲线救国，使用[JSBox版本]()。