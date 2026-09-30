/**
 * 前端/全栈模式判定。
 *
 * 四种部署场景：
 *  ┌─────────────────────────────┬────────────────┬────────────┐
 *  │ 场景                        │ 关键变量        │ hasBackend │
 *  ├─────────────────────────────┼────────────────┼────────────┤
 *  │ 本地开发（Vite 代理到 Hono）  │ DEV=true        │ true       │
 *  │ Vercel 部署（同域名 functions）│ 无需配置        │ true       │
 *  │ Railway/Docker（同容器静态托管）│ 无需配置        │ true       │
 *  │ 纯静态部署（Netlify 等）      │ VITE_PURE=1     │ false      │
 *  └─────────────────────────────┴────────────────┴────────────┘
 *
 * 前后端分离部署（后端在别的域名）时配 VITE_API_URL，tRPC 走该地址。
 */

/** 后端地址（无尾斜杠）；空串 = 相对路径（同域名/本地代理） */
const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
export const API_URL = raw.replace(/\/+$/, "");

/** 是否可用 AI 后端。默认 true；仅纯静态部署时显式 VITE_PURE=1 关闭。 */
export const hasBackend = import.meta.env.VITE_PURE !== "1";
