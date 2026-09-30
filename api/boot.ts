import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

/** CORS 白名单：ALLOWED_ORIGINS 逗号分隔，逐项 trim + 去尾斜杠后精确匹配。
 *  未配置 → 拒绝一切跨域（同源/无 Origin 请求不受影响），启动时打警告。 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
if (env.isProduction && allowedOrigins.length === 0) {
  console.warn("[CORS] ALLOWED_ORIGINS 未设置，跨域请求将被拒（同源与本地代理不受影响）");
}

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// 健康检查：给 Render 等平台探测用，不走 CORS（探测请求无 Origin）
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

// CORS 只挂在 tRPC 路径上（浏览器唯一会跨域调用的入口）
app.use(
  "/api/trpc/*",
  cors({
    origin: (origin) => {
      const normalized = origin.replace(/\/+$/, "");
      return allowedOrigins.includes(normalized) ? origin : "";
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
