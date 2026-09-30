# 多阶段构建：阶段 1 构建前端+后端，阶段 2 只留运行时
# 包管理器 pnpm（corepack 启用）：规避 npm ci "Exit handler never called!" bug，内存占用更低

# 阶段 1：构建
FROM node:20-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# 阶段 2：运行（只装生产依赖 + 拷构建产物）
FROM node:20-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/boot.js"]
