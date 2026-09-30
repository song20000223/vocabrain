/**
 * 传统 Node 服务器入口（Railway/Docker/本地生产模式）。
 * Vercel 部署不走这里——Vercel 入口是 api/[...route].ts。
 */
import app from "./app";
import { env } from "./lib/env";

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
