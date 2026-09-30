import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";

/** CORS 白名单：仅在配了 ALLOWED_ORIGINS 时启用（前后端分离部署场景）。
 *  同域名部署（Vercel）不配置即不启用，天然无跨域问题。 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
if (env.isProduction && allowedOrigins.length === 0) {
  console.warn("[CORS] ALLOWED_ORIGINS 未设置，跨域请求将被拒（同源部署不受影响）");
}

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// 健康检查：平台探测用，不走 CORS
app.get("/api/health", (c) => c.json({ ok: true, ts: Date.now() }));

// CORS 只挂 tRPC 路径，且仅在配置了白名单时启用
if (allowedOrigins.length > 0) {
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
}

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
