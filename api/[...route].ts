/**
 * Vercel Serverless Function 入口：catch-all 接住 /api/* 全部路径。
 * 本地开发（vite dev）和传统部署（Railway/Docker）不经过这里。
 */
import { handle } from "@hono/node-server/vercel";
import app from "./app";

export const config = {
  runtime: "nodejs",
  maxDuration: 30, // AI 判词经 DeepSeek，最长响应预留 30s
};

export default handle(app);
