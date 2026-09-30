/**
 * 数据版本迁移框架。
 *
 * 当前版本 1。S7 及以后升级数据结构时：
 *   1. CURRENT_DATA_VERSION +1；
 *   2. 在 migrations 里加一条 `N: (data) => data'`（N = 升级到的版本号）；
 *   3. ensureDataVersion() 启动时自动逐级迁移，迁移前全量备份到 vocabrain_backup_vN。
 *
 * 只迁移本地存储键值（字符串 JSON），不理解业务结构——各版本迁移函数自己解析。
 */

export const CURRENT_DATA_VERSION = 1;

export const DATA_VERSION_KEY = "vocabrain_data_version";

/** 迁移函数表：key = 目标版本号。当前为空，纯框架。 */
const migrations: Record<number, (data: Record<string, string>) => Record<string, string>> = {
  // 2: migrateV1toV2,  // S7 词族改造时填充
};

/** 备份键前缀（迁移前自动备份用，导出时排除） */
export const INTERNAL_BACKUP_PREFIX = "vocabrain_backup_";

/** 属于应用数据的 localStorage 键（vocab_* 业务键 + 版本键），不含内部备份 */
export function appDataKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(INTERNAL_BACKUP_PREFIX)) continue;
    if (k.startsWith("vocab_") || k === DATA_VERSION_KEY) keys.push(k);
  }
  return keys;
}

/** 快照当前全部应用数据 */
export function snapshotData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const k of appDataKeys()) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  return data;
}

/**
 * 启动时调用一次。
 * - 有数据但无版本号（v1 之前的老数据）：备份到 vocabrain_backup_v1，写入版本号 1。
 * - 版本落后：先备份到 vocabrain_backup_v{当前}，再逐级跑 migrations 升级。
 * - 版本超前：不动（导入场景由 backup.ts 拒绝；本地出现超前版本理论上不可能）。
 */
export function ensureDataVersion(): void {
  const raw = localStorage.getItem(DATA_VERSION_KEY);
  const hasData = appDataKeys().some((k) => k !== DATA_VERSION_KEY);

  if (raw === null) {
    if (hasData) {
      // 老数据无版本号：视为 v1 之前的形态，先备份再标记为 1
      localStorage.setItem(
        `${INTERNAL_BACKUP_PREFIX}v1`,
        JSON.stringify({ backedUpAt: Date.now(), data: snapshotData() }),
      );
    }
    localStorage.setItem(DATA_VERSION_KEY, String(CURRENT_DATA_VERSION));
    return;
  }

  let version = parseInt(raw, 10);
  if (Number.isNaN(version) || version >= CURRENT_DATA_VERSION) return;

  // 逐级迁移，迁移前备份当前版本
  localStorage.setItem(
    `${INTERNAL_BACKUP_PREFIX}v${version}`,
    JSON.stringify({ backedUpAt: Date.now(), data: snapshotData() }),
  );
  while (version < CURRENT_DATA_VERSION) {
    const next = version + 1;
    const migrate = migrations[next];
    if (migrate) {
      const data = migrate(snapshotData());
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    }
    version = next;
    localStorage.setItem(DATA_VERSION_KEY, String(version));
  }
}
