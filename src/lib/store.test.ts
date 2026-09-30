/**
 * 回归单测：导入释义解析 + 听写判分。
 * 这两个纯函数是 S6 E2E 暴露过 bug / 改过规则的地方，最容易回归。
 */
import { describe, expect, it } from "vitest";
import { parsePosAndDefs } from "./store";
import { matchDictation } from "./quickJudge";

describe("parsePosAndDefs 导入释义解析", () => {
  it("逗号分隔的中文义项拆开：腔, 室; 议院", () => {
    expect(parsePosAndDefs("n. 腔, 室; 议院").defs).toEqual(["腔", "室", "议院"]);
  });

  it("纯中文同义义项按逗号拆：感激, 感谢", () => {
    expect(parsePosAndDefs("v. 感激, 感谢").defs).toEqual(["感激", "感谢"]);
  });

  it("中英混合：中文拆、英文段整段保留", () => {
    expect(parsePosAndDefs("v. 混合, 混合物; mix together").defs).toEqual([
      "混合",
      "混合物",
      "mix together",
    ]);
  });

  it("无逗号时按分号拆，行为同旧版：高原; 平稳状态", () => {
    expect(parsePosAndDefs("n. 高原; 平稳状态").defs).toEqual(["高原", "平稳状态"]);
  });

  it("英文释义不被逗号拆坏（拉丁守卫）", () => {
    const { defs } = parsePosAndDefs(
      "n. a raised flat area; a period of little progress",
    );
    expect(defs).toEqual(["a raised flat area", "a period of little progress"]);
  });

  it("词性前缀正确剥离", () => {
    expect(parsePosAndDefs("adj. 平稳的").pos).toBe("adj.");
  });
});

describe("matchDictation 听写判分", () => {
  // 对应释义 "n. 腔, 室; 议院" 的 candidates: [腔, 室, 议院, 腔室, 腔议院, ...]
  const defs = [{ pos: "n.", definitions: ["腔", "室", "议院"] }];

  it("单字精确命中：腔 / 室", () => {
    expect(matchDictation("腔", defs)).toBe(true);
    expect(matchDictation("室", defs)).toBe(true);
  });

  it("单字排列拼接算对：腔室 / 室腔", () => {
    expect(matchDictation("腔室", defs)).toBe(true);
    expect(matchDictation("室腔", defs)).toBe(true);
  });

  it("非义项组合判错：胸腔", () => {
    expect(matchDictation("胸腔", defs)).toBe(false);
  });

  it("忽略大小写/标点/空白", () => {
    expect(matchDictation("腔！", defs)).toBe(true);
    expect(matchDictation("腔 室", defs)).toBe(true);
  });

  it("长义项互相包含算对（≥2 字）", () => {
    const d2 = [{ pos: "n.", definitions: ["高原", "平稳状态"] }];
    expect(matchDictation("高原地区", d2)).toBe(true); // 包含"高原"
    expect(matchDictation("平稳", d2)).toBe(true); // 被"平稳状态"包含
  });

  it("完全无关答案判错", () => {
    expect(matchDictation("香蕉", defs)).toBe(false);
  });
});

// ---------- wrongStreak / preferWrong（需要 localStorage，挂内存 mock） ----------
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
// node 环境无 window：store 的 notify 会 dispatchEvent，这里给个空 stub
(globalThis as unknown as { window: { dispatchEvent: () => boolean } }).window = {
  dispatchEvent: () => true,
};

const { selectWords, bumpWrongStreak, readAllWords, addWord } = await import("./store");

function seedThree(): { a: string; b: string; c: string } {
  localStorage.clear();
  const a = addWord("apple", "n.", ["苹果"])!.id;
  const b = addWord("banana", "n.", ["香蕉"])!.id;
  const c = addWord("cherry", "n.", ["樱桃"])!.id;
  return { a, b, c };
}

describe("bumpWrongStreak 连续答错计数", () => {
  it("答错 +1，答对 -1，最低 0", () => {
    const { a } = seedThree();
    bumpWrongStreak(a, true); // 0 - 1 → 0
    expect(readAllWords().find((w) => w.id === a)!.wrongStreak).toBe(0);
    bumpWrongStreak(a, false);
    bumpWrongStreak(a, false);
    expect(readAllWords().find((w) => w.id === a)!.wrongStreak).toBe(2);
    bumpWrongStreak(a, true);
    expect(readAllWords().find((w) => w.id === a)!.wrongStreak).toBe(1);
  });
});

describe("selectWords preferWrong 优先抽错词", () => {
  it("关闭时按顺序抽，不区分错词", () => {
    const { c } = seedThree();
    bumpWrongStreak(c, false);
    const r = selectWords({ bookId: "all", type: "all", count: 2, order: "sequential" });
    expect(r.entryIds).toHaveLength(2);
    expect(r.entryIds).not.toContain(c); // 顺序抽前两个，错词 c 在第三
  });

  it("开启时错词优先入选", () => {
    const { c } = seedThree();
    bumpWrongStreak(c, false);
    const r = selectWords({
      bookId: "all",
      type: "all",
      count: 2,
      order: "sequential",
      preferWrong: true,
    });
    expect(r.entryIds).toContain(c);
    expect(r.entryIds).toHaveLength(2);
  });

  it("错词不足时用普通池补足", () => {
    const { c } = seedThree();
    bumpWrongStreak(c, false);
    const r = selectWords({
      bookId: "all",
      type: "all",
      count: 3,
      order: "sequential",
      preferWrong: true,
    });
    expect(r.entryIds).toHaveLength(3);
    expect(r.entryIds[0]).toBe(c);
  });
});
