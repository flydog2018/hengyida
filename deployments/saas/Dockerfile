# 恒易搭统一应用镜像（SaaS / 私有化共用，仅环境变量不同）
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
# tsc 需要根 tsconfig.base.json（paths / esModuleInterop），缺失会导致 TS5083/TS1259
COPY package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
# 使用国内镜像并配合 lockfile 缓存，避免默认源在容器内解析缓慢
RUN npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
# 先编译 shared（供 server 解析类型与运行时），再编译 server。
# 显式用根 tsc：npm workspace 运行子包脚本时会把 PATH 指向子包 node_modules/.bin，
# 而 lockfile 将 typescript 提升到根，导致 'tsc' 在子包脚本中找不到（MODULE_NOT_FOUND）。
RUN ./node_modules/.bin/tsc -p packages/shared/tsconfig.json \
 && ./node_modules/.bin/tsc -p packages/server/tsconfig.build.json

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/server/dist ./packages/server/dist
EXPOSE 3000
WORKDIR /app/packages/server
CMD ["node", "dist/main.js"]
