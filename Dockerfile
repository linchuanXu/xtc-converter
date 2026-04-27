# 阶段 1：用 Terser 压缩/混淆，仅产出 dist/
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY web/ ./web/
COPY scripts/ ./scripts/
RUN npm run build

# 阶段 2：只部署 dist/，不包含源码
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/ /usr/share/nginx/html/
EXPOSE 8000

