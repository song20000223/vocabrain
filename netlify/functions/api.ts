/**
 * Netlify Function 入口：/api/* 由 netlify.toml 重写到 /.netlify/functions/api/*，
 * 这里把路径前缀还原回 /api/* 再交给 Hono 路由。
 *
 * 不直接透传 Request：new Request(url, req) 在部分运行时会丢 body，
 * 显式复制 method/headers/body。GET/HEAD 无 body，跳过。
 */
import app from "../../api/app";

export default async (req: Request) => {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/\.netlify\/functions\/api/, "/api");
  const init: RequestInit = { method: req.method, headers: req.headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    // @ts-expect-error Node undici 需要 duplex 才能流式转发 body
    init.duplex = "half";
  }
  return app.fetch(new Request(url, init));
};

export const config = {
  path: "/api/*",
};
