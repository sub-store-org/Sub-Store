FROM node:16.16-alpine AS web-builder
WORKDIR /app

COPY web/pnpm-lock.yaml ./
RUN wget -qO- https://get.pnpm.io/v6.16.js | node - add --global pnpm && \
  pnpm fetch
COPY web/ ./
RUN pnpm install -r --offline && \
  pnpm build

FROM alpine:latest
WORKDIR /release
RUN sed -i "s/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g" /etc/apk/repositories && \
  apk update && \ 
  apk add --no-cache nginx nodejs npm supervisor curl tzdata && \
  cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
  apk del tzdata && \
  wget -qO- https://get.pnpm.io/v6.16.js | node - add --global pnpm

COPY --from=web-builder /app/dist /usr/share/nginx/html

COPY backend/pnpm-lock.yaml ./
RUN pnpm fetch --prod
COPY backend/sub-store.min.js ./
COPY backend/package.json ./
RUN pnpm install -r --offline --prod

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]