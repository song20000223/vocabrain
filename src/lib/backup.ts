/**
 * 数据备份：导出 / 导入全部应用数据（JSON 文件）。
 *
 * - 导出范围：所有 vocab_* 业务键 + dataVersion，排除 vocabrain_backup_* 内部迁移备份。
 * - 文件名：vocabrain-backup-YYYYMMDD.json
 * - 导入校验：结构、版本（高于当前应用版本拒绝；低于则提示迁移框架会接管——当前 v1 即只接受 v1）。
 * - 导入模式：覆盖（清空后写入）/ 合并（并集：本地有而文件没有的保留，同键冲突以文件为准）。
 */

import { CURRENT_DATA_VERSION, DATA_VERSION_KEY, INTERNAL_BACKUP_PREFIX, appDataKeys } from "./migrate";

export interface BackupFile {
  app: "vocabrain";
  dataVersion: number;
  exportedAt: number;
  data: Record<string, string>;
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 触发浏览器下载备份文件 */
export function exportBackup(): string {
  const data: Record<string, string> = {};
  for (const k of appDataKeys()) {
    if (k === DATA_VERSION_KEY) continue;
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  const payload: BackupFile = {
    app: "vocabrain",
    dataVersion: CURRENT_DATA_VERSION,
    exportedAt: Date.now(),
    data,
  };
  const filename = `vocabrain-backup-${todayStamp()}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export type ImportValidation =
  | { ok: true; backup: BackupFile }
  | { ok: false; reason: string };

/** 解析并校验备份文件 */
export function validateBackup(text: string): ImportValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "文件不是合法的 JSON" };
  }
  const b = parsed as Partial<BackupFile>;
  if (!b || typeof b !== "object" || b.app !== "vocabrain") {
    return { ok: false, reason: "不是 VocabRain 的备份文件" };
  }
  if (typeof b.dataVersion !== "number") {
    return { ok: false, reason: "备份文件缺少版本号" };
  }
  if (b.dataVersion > CURRENT_DATA_VERSION) {
    return { ok: false, reason: "备份来自更新版本的应用，请升级后再导入" };
  }
  if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) {
    return { ok: false, reason: "备份文件数据区损坏" };
  }
  for (const [k, v] of Object.entries(b.data)) {
    if (typeof v !== "string" || k.startsWith(INTERNAL_BACKUP_PREFIX)) {
      return { ok: false, reason: `备份文件包含非法键：${k}` };
    }
  }
  return { ok: true, backup: b as BackupFile };
}

/**
 * 应用备份。
 * - overwrite：清空现有应用数据后写入；
 * - merge：并集——本地有而文件没有的键保留，同键以文件为准。
 */
export function applyBackup(backup: BackupFile, mode: "overwrite" | "merge"): void {
  if (mode === "overwrite") {
    for (const k of appDataKeys()) localStorage.removeItem(k);
  }
  for (const [k, v] of Object.entries(backup.data)) {
    localStorage.setItem(k, v);
  }
  // 版本号对齐（备份版本 ≤ 当前版本；迁移框架下次启动时会接管低版本数据）
  localStorage.setItem(DATA_VERSION_KEY, String(backup.dataVersion));
}
