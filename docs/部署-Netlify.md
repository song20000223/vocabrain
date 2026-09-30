# VocabRain 部署指南：Netlify（前端）+ Render（后端）

目标架构：前端静态部署到 Netlify，后端（AI 判词/查词）独立部署到 Render，
两端通过 `VITE_API_URL` 环境变量连接。不配后端也能跑（纯前端模式，AI 功能降级）。

本地开发不受影响：`pnpm install` 后 `pnpm dev` 起 Vite，内置 Hono 开发服务器，无需任何配置。
（项目包管理器为 pnpm，Node 20+ 用 `corepack enable` 即可；npm 命令亦可用，但锁定文件以 pnpm-lock.yaml 为准。）

---

## 第一部分：后端部署（Render）

### 0. 前置条件

- 一个 GitHub 账号，本仓库已推送上去（`git remote add origin <你的仓库地址> && git push -u origin main`）；
- 一个 DeepSeek API Key（platform.deepseek.com → API Keys → 创建，充值几块钱够用很久）。

### 1. 注册 Render

render.com → 用 GitHub 账号登录（授权后 Render 能直接看到你的仓库列表）。

### 2. 创建 Web Service

1. Dashboard → **New** → **Web Service**；
2. 选你的 VocabRain 仓库（没看到就点 Configure account 授权）；
3. Render 自动识别根目录的 `Dockerfile`，Runtime 显示 **Docker**——构建命令、启动命令都不用填；
4. **Region** 选 Singapore（离国内最近，冷启动和延迟都最低）；
5. **Instance Type** 选 **Free**（750 小时/月，个人用够；注意免费档 15 分钟无请求会休眠，第一次请求冷启动 30–60 秒，之后正常）。

### 3. 配环境变量

创建页面滚到 **Environment Variables**，逐条添加：

| Key | Value | 必需 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 你的 DeepSeek key（sk- 开头） | ✅ |
| `ALLOWED_ORIGINS` | `https://<你的站点>.netlify.app`（拿到 Netlify 域名后再回来填也行） | ✅ |
| `DEEPSEEK_MODEL` | `deepseek-chat`（默认值，可不配） | 可选 |

注意：
- `ALLOWED_ORIGINS` 支持逗号分隔多个域名；结尾多写了 `/` 也能识别（代码会归一化）；
- 将来加自定义域名，往这里追加一个即可，保存后 Render 自动重启生效；
- **key 只配在 Render 面板，绝不写进仓库任何文件**。`.gitignore` 已排除 `.env*`，双保险。

### 4. 健康检查

- 服务设置里 **Health Check Path** 填 `/api/health`；
- 部署成功后浏览器打开 `https://<服务名>.onrender.com/api/health`，
  返回 `{"ok":true,...}` 即成功；
- 这个路径不走 CORS 白名单，Render 的探测请求不会被拦。

### 5. 拿到后端地址

服务页顶部显示 `https://<服务名>.onrender.com` —— 复制下来，前端要用。

---

## 第二部分：Netlify 一体化部署（前端 + Functions，推荐）

前后端同域名，无 CORS，零成本。`netlify.toml` 已内置全部配置。

### 1. 导入仓库

netlify.com → 用 GitHub 登录 → **Add new site** → **Import an existing project** → 选仓库。
Build command 和 publish 目录由 `netlify.toml` 指定（`pnpm run build:vercel` / `dist/public`），不用手填。

### 2. 配环境变量

**Site configuration → Environment variables → Add a variable**：

| Key | Value | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | sk- 开头的 key | AI 判词/查词必需 |

**不要配 `VITE_PURE=1`**（会强制前端走纯前端降级模式，AI 被跳过）。
之前纯前端部署时如果加过这个变量，删掉并重新部署。

### 3. 函数超时调优（重要）

DeepSeek 判分响应 5–6 秒，Netlify 免费档函数默认 10 秒超时可能压线：
**Site configuration → Functions → 把超时调到最大（26 秒）**。
前端另有 8 秒超时兜底——超时自动降级本地判分并提示一次，不会傻等。

### 4. 部署后验证

- `https://<站点>.netlify.app/api/health` → `{"ok":true,...}`
- `https://<站点>.netlify.app/api/trpc/ping?batch=1&input={"0":{"json":null}}` → 返回 ok 的 JSON
- 首页正常加载；直接刷新 `/words` 不 404
- 加一个词 → 测试页做一次判分 → 评语是 AI 生成的自然语言（不是「本地严格匹配」字样），即 Functions 链路通

---

## 第二部分（备选）：Netlify 纯前端 + Render 独立后端

仅当不想用 Netlify Functions 时参考：前端部署 Netlify（配 `VITE_PURE=1` 为纯前端，或配 `VITE_API_URL` 指向 Render 后端），后端按第一部分部署 Render 并回填 `ALLOWED_ORIGINS`。**VITE_API_URL 不带尾斜杠**；改环境变量后必须 Trigger deploy 重新构建。

---

## 手机访问验证清单

### 沙盒已验证（本次交付内完成）

- [x] 390×844 视口下五个页面无横向溢出；
- [x] 纯前端模式：查词显示「AI 查词未启用」、测验本地判分、反向题干缺释义时可跳过；
- [x] 后端请求失败时自动降级本地判分 + 一次性提示；
- [x] speak() 的 voiceschanged 监听 + 空列表重试逻辑（5×500ms）。

### 需真机验证（沙盒做不到）

- [ ] 手机浏览器点 🔊 能发声（iOS Safari / Android Chrome 语音包不同，
      没 en-GB 时会提示「已用默认语音代替」，无语音包时提示检查系统语音）；
- [ ] 首次点 🔊 稍等 1–2 秒再点一次（首次语音列表可能未就绪，重试机制在后台拉取）；
- [ ] 词书弹窗、导出弹窗在小屏上可完整滚动；
- [ ] 冷启动：后端休眠后第一次测验判分会等 30–60 秒，之后正常。

---

## 常见故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| 浏览器控制台报 CORS 错误（blocked by CORS policy） | `ALLOWED_ORIGINS` 没配 / 域名不匹配 | 回 Render 检查白名单，注意 `https://` 前缀和域名完全一致（结尾斜杠无所谓） |
| 首次判分转圈 30–60 秒 | Render 免费档休眠后冷启动 | 正常现象；介意可升级付费档（$7/月不休眠） |
| 判词/查词一直失败，评语显示「已切换本地严格匹配」 | 后端挂了或 key 失效 | 开 `https://<服务名>.onrender.com/api/health` 看后端是否活着；活着则查 DeepSeek 余额/key 有效性 |
| 判词返回「DeepSeek 账户余额不足」 | key 没钱了 | platform.deepseek.com 充值 |
| 改了 Netlify 环境变量但没生效 | 没有重新构建 | Deploys → Trigger deploy |
| 手机上点 🔊 没声音 | 语音包未就绪 / 系统无英文语音 | 等 1–2 秒再点；仍不行则检查系统 TTS 语音包设置 |
| 部署后刷新子路由 404 | redirects 未生效 | 确认 `netlify.toml` 在仓库根目录且已提交 |
