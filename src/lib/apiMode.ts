/**
 * 前端/全栈模式判定。
 *
 * - 配了 VITE_API_URL（构建期注入）→ 全栈模式，AI 判词/查词走独立部署的后端；
 * - 未配 → 纯前端模式：测验判分降级到本地 quickLocalJudge，AI 查词不启用。
 *
 * 本地开发不配 VITE_API_URL，走 Vite 代理到本地后端，行为同全栈模式。
 */
const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
/** 后端地址（无尾斜杠）；空串 = 纯前端模式或本地代理 */
export const API_URL = raw.replace(/\/+$/, "");
/** 是否可用远端 AI 后端（本地开发经 Vite 代理时也算可用） */
export const hasBackend =
  API_URL.length > 0 || import.meta.env.DEV;
