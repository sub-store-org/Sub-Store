# Sub-Store Docker 部署指南

### 1. Git Clone
```shell
git clone https://github.com/sub-store-org/Sub-Store.git && cd Sub-Store
git clone https://github.com/sub-store-org/Sub-Store-Front-End.git ./web
```

### 2. 修改 `web/.env.production` 文件中的 `VITE_API_URL` 变量
### 3. 创建持久化文件
root.json
```json
{}
```

sub-store.json
```json
{}
```

### 3. 启动
```shell
docker-compose up -d
```