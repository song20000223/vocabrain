/**
 * 迁移框架 + 备份导入导出单测（node 环境，内存模拟 localStorage）。
 */
import { beforeEach, describe, expect, it } from "vitest";

// ---- 内存 localStorage mock（必须在被测模块 import 前挂上） ----
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();

const { ensureDataVersion, CURRENT_DATA_VERSION, DATA_VERSION_KEY } = await import("./migrate");
const { validateBackup, applyBackup } = await import("./backup");

beforeEach(() => localStorage.clear());

describe("ensureDataVersion 迁移框架", () => {
  it("全新用户：只写入版本号，不产生备份", () => {
    ensureDataVersion();
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe(String(CURRENT_DATA_VERSION));
    expect(localStorage.getItem("vocabrain_backup_v1")).toBeNull();
  });

  it("老数据无版本号：自动备份到 vocabrain_backup_v1 并写入版本号", () => {
    localStorage.setItem("vocab_words", '[{"id":"w1"}]');
    ensureDataVersion();
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe(String(CURRENT_DATA_VERSION));
    const bak = JSON.parse(localStorage.getItem("vocabrain_backup_v1")!);
    expect(bak.data.vocab_words).toBe('[{"id":"w1"}]');
  });

  it("已是当前版本：不再动", () => {
    localStorage.setItem(DATA_VERSION_KEY, String(CURRENT_DATA_VERSION));
    localStorage.setItem("vocab_words", "[]");
    ensureDataVersion();
    expect(localStorage.getItem("vocabrain_backup_v1")).toBeNull();
    expect(localStorage.getItem("vocab_words")).toBe("[]");
  });
});

describe("validateBackup 导入校验", () => {
  const good = {
    app: "vocabrain",
    dataVersion: CURRENT_DATA_VERSION,
    exportedAt: Date.now(),
    data: { vocab_words: "[]" },
  };
  it("非法 JSON 拒绝", () => {
    expect(validateBackup("{oops").ok).toBe(false);
  });
  it("非本应用备份拒绝", () => {
    expect(validateBackup(JSON.stringify({ app: "other" })).ok).toBe(false);
  });
  it("版本高于当前应用：拒绝并提示升级", () => {
    const r = validateBackup(JSON.stringify({ ...good, dataVersion: CURRENT_DATA_VERSION + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("升级");
  });
  it("含内部备份键拒绝", () => {
    const r = validateBackup(
      JSON.stringify({ ...good, data: { vocabrain_backup_v1: "{}" } }),
    );
    expect(r.ok).toBe(false);
  });
  it("合法备份通过", () => {
    const r = validateBackup(JSON.stringify(good));
    expect(r.ok).toBe(true);
  });
});

describe("applyBackup 覆盖与合并", () => {
  const backup = {
    app: "vocabrain" as const,
    dataVersion: CURRENT_DATA_VERSION,
    exportedAt: Date.now(),
    data: { vocab_words: '[{"id":"fromFile"}]' },
  };
  it("覆盖：清空后写入", () => {
    localStorage.setItem("vocab_words", '[{"id":"local"}]');
    localStorage.setItem("vocab_memos", '[{"id":"m1"}]');
    applyBackup(backup, "overwrite");
    expect(localStorage.getItem("vocab_words")).toBe('[{"id":"fromFile"}]');
    expect(localStorage.getItem("vocab_memos")).toBeNull();
  });
  it("合并：本地独有的保留，同键以文件为准", () => {
    localStorage.setItem("vocab_words", '[{"id":"local"}]');
    localStorage.setItem("vocab_memos", '[{"id":"m1"}]');
    applyBackup(backup, "merge");
    expect(localStorage.getItem("vocab_words")).toBe('[{"id":"fromFile"}]');
    expect(localStorage.getItem("vocab_memos")).toBe('[{"id":"m1"}]');
  });
});
