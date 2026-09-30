# 多阶段构建：阶段 1 构建前端+后端，阶段 2 只留运行时
# dist 是构建产物且被 .gitignore 排除，必须在镜像内构建

# 阶段 1：构建
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 阶段 2：运行（只装生产依赖 + 拷构建产物）
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/boot.js"]
