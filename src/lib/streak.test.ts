import { beforeEach, describe, expect, it } from "vitest";

// node 环境没有 localStorage，mock 一个（与 speak.test.ts 同法）
(globalThis as unknown as { localStorage: Storage }).localStorage = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
  } as Storage;
})();

// store.notify 依赖 window.dispatchEvent，node 环境 mock
(globalThis as unknown as { window: unknown }).window = {
  dispatchEvent: () => true,
};

const { getStreak, touchStreak } = await import("./streak");
const { addWord, markTestedInRound } = await import("./store");

describe("streak 连续学习记录", () => {
  beforeEach(() => localStorage.clear());

  it("首次判分 days=1，同日重复不叠加", () => {
    touchStreak();
    touchStreak();
    const s = getStreak();
    expect(s.days).toBe(1);
    expect(s.lastDate).not.toBe("");
  });

  it("昨天有记录 → 今天 +1", () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const p = (n: number) => String(n).padStart(2, "0");
    const yStr = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`;
    localStorage.setItem("vocab_streak", JSON.stringify({ days: 3, lastDate: yStr }));
    touchStreak();
    expect(getStreak().days).toBe(4);
  });

  it("断档 → 重置为 1", () => {
    localStorage.setItem("vocab_streak", JSON.stringify({ days: 9, lastDate: "2020-01-01" }));
    touchStreak();
    expect(getStreak().days).toBe(1);
  });

  it("判分（markTestedInRound）自动打 streak 点", () => {
    const w = addWord("streaktest", "n.", ["测试"]);
    expect(w).not.toBeNull();
    markTestedInRound(w!.id);
    expect(getStreak().days).toBe(1);
  });
});
