/** 词族识别 + 整族抽单测 */
import { beforeEach, describe, expect, it } from "vitest";
import { candidateCore, findFamilyCandidate } from "./family";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
(globalThis as unknown as { window: { dispatchEvent: () => boolean } }).window = {
  dispatchEvent: () => true,
};

const { addWord, setFamilyKey, selectWords, getWords, getFamilyMembers, removeWord, addBook } = await import("./store");

beforeEach(() => localStorage.clear());

describe("candidateCore", () => {
  it("取第一个词小写", () => {
    expect(candidateCore("crack a code")).toBe("crack");
    expect(candidateCore("Crack")).toBe("crack");
  });
});

describe("findFamilyCandidate 三条匹配规则", () => {
  it("word 等于候选", () => {
    localStorage.clear();
    addWord("crack", "n.", ["裂缝"]);
    const c = findFamilyCandidate("crack the case", getWords());
    expect(c?.key).toBe("crack");
  });
  it("word 以候选+空格开头", () => {
    localStorage.clear();
    addWord("crack down on", "", [], "default", "phrase");
    const c = findFamilyCandidate("crack a code", getWords());
    expect(c?.key).toBe("crack");
    expect(c?.members.map((m) => m.word)).toContain("crack down on");
  });
  it("familyKey 等于候选", () => {
    localStorage.clear();
    const a = addWord("interesting", "adj.", ["有趣的"])!;
    setFamilyKey(a.id, "interest");
    const c = findFamilyCandidate("interest rate", getWords());
    expect(c?.key).toBe("interest");
  });
  it("短核心词（<3）不自动识别", () => {
    localStorage.clear();
    addWord("in fact", "", [], "default", "phrase");
    addWord("in time", "", [], "default", "phrase");
    expect(findFamilyCandidate("in general", getWords())).toBeNull();
  });
  it("无匹配返回 null", () => {
    localStorage.clear();
    addWord("apple", "n.", ["苹果"]);
    expect(findFamilyCandidate("banana split", getWords())).toBeNull();
  });
});

describe("setFamilyKey / getFamilyMembers", () => {
  it("设置后聚合；清空即移出", () => {
    localStorage.clear();
    const a = addWord("interesting", "adj.", ["有趣的"])!;
    const b = addWord("interested", "adj.", ["感兴趣的"])!;
    setFamilyKey(a.id, "interest");
    setFamilyKey(b.id, "interest");
    expect(getFamilyMembers("interest")).toHaveLength(2);
    setFamilyKey(a.id, undefined);
    expect(getFamilyMembers("interest")).toHaveLength(1);
    expect(getWords().find((w) => w.id === a.id)!.familyKey).toBeUndefined();
  });
});

describe("selectWords 整族抽", () => {
  function seedFamily(): string {
    localStorage.clear();
    const book = addBook("测试词书")!;
    const a = addWord("crack", "n.", ["裂缝"], book.id)!;
    const b = addWord("crack down on", "", ["打击"], book.id, "phrase")!;
    const c = addWord("crack a code", "", ["破解密码"], book.id, "phrase")!;
    for (const w of [a, b, c]) setFamilyKey(w.id, "crack");
    return book.id;
  }
  it("expand：命中 crack 整族 3 条", () => {
    const bookId = seedFamily();
    const r = selectWords({ bookId, type: "all", count: 100, order: "sequential", familyMode: "expand" });
    expect(r.entryIds).toHaveLength(3);
    expect(r.expandedCount).toBe(3);
  });
  it("off：只抽命中条", () => {
    const bookId = seedFamily();
    const r = selectWords({ bookId, type: "word", count: 100, order: "sequential" });
    expect(r.entryIds).toHaveLength(1);
    expect(r.expandedCount).toBeUndefined();
  });
  it("软删成员不进扩展队列", () => {
    const bookId = seedFamily();
    const crackDown = getWords().find((w) => w.word === "crack down on")!;
    removeWord(crackDown.id);
    const r = selectWords({ bookId, type: "all", count: 100, order: "sequential", familyMode: "expand" });
    expect(r.entryIds).toHaveLength(2);
  });
});
