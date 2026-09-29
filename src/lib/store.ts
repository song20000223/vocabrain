/**
 * 单词学习数据层 —— 全部存储在浏览器 localStorage（仅当前浏览器可用）。
 *
 * 包含三块数据：
 *  1. vocab_words      词库（词性分组的多义项结构）
 *  2. vocab_wrong_book 错题本
 *  3. vocab_progress   全库测试进度（轮次队列）
 *
 * 旧版数据（{ word, meaning: string }）在首次读取时自动迁移，不会丢。
 */

// ---------- 类型 ----------

export interface MeaningGroup {
  pos: string; // 词性，如 "n." "v."，旧数据迁移来的为空字符串 ""
  definitions: string[]; // 该词性下的多个义项
}

export interface WordItem {
  id: string;
  word: string;
  meanings: MeaningGroup[];
  testedRounds: number; // 累计被测次数
  lastTestedAt: number | null;
  excluded: boolean; // 标记“不再测”
}

export interface WrongItem {
  id: string;
  word: string;
  meanings: MeaningGroup[];
  yourAnswer: string;
  comment: string;
  wrongAt: number;
  wrongCount: number; // 累计答错次数
  corrected: boolean; // 复习时已订正（答对但选择保留）
}

export interface Progress {
  currentRound: number;
  testedInRound: string[]; // 本轮已测单词 id
}

// ---------- 存储键 ----------

const WORDS_KEY = "vocab_words";
const WRONG_KEY = "vocab_wrong_book";
const PROGRESS_KEY = "vocab_progress";

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function notify() {
  window.dispatchEvent(new Event("vocab-store-change"));
}

// ---------- 旧数据兼容 ----------

interface LegacyWord {
  id?: string;
  word: string;
  meaning?: string; // 旧字段
  meanings?: MeaningGroup[];
  testedRounds?: number;
  lastTestedAt?: number | null;
  excluded?: boolean;
}

function migrateWord(raw: LegacyWord): WordItem {
  let meanings: MeaningGroup[];
  if (Array.isArray(raw.meanings) && raw.meanings.length > 0) {
    meanings = raw.meanings;
  } else {
    // 旧格式：单一 meaning 字符串 → 一个无词性的义项组
    meanings = raw.meaning?.trim() ? [{ pos: "", definitions: [raw.meaning.trim()] }] : [];
  }
  return {
    id: raw.id ?? uid(),
    word: raw.word,
    meanings,
    testedRounds: raw.testedRounds ?? 0,
    lastTestedAt: raw.lastTestedAt ?? null,
    excluded: raw.excluded ?? false,
  };
}

// ---------- 内置示例单词 ----------

const SEED: Array<[string, string, string[]]> = [
  ["plateau", "n.", ["高原", "平稳期"]],
  ["plateau", "v.", ["达到平稳状态"]],
  ["journey", "n.", ["旅行", "旅程"]],
  ["serendipity", "n.", ["意外发现美好事物的运气"]],
  ["ambitious", "adj.", ["有雄心的", "有抱负的"]],
  ["fragile", "adj.", ["易碎的", "脆弱的"]],
  ["generous", "adj.", ["慷慨的", "大方的"]],
  ["inevitable", "adj.", ["不可避免的"]],
  ["procrastinate", "v.", ["拖延", "耽搁"]],
  ["resilient", "adj.", ["有韧性的", "能迅速恢复的"]],
  ["meticulous", "adj.", ["一丝不苟的", "细心的"]],
  ["dilemma", "n.", ["两难困境"]],
  ["eloquent", "adj.", ["雄辩的", "有口才的"]],
  ["nostalgia", "n.", ["怀旧", "乡愁"]],
  ["versatile", "adj.", ["多才多艺的", "多用途的"]],
  ["ephemeral", "adj.", ["短暂的", "转瞬即逝的"]],
];

// ---------- 词库 ----------

export function getWords(): WordItem[] {
  const raw = localStorage.getItem(WORDS_KEY);
  if (raw === null) {
    // 首次打开：写入内置示例
    const seeded: WordItem[] = [];
    for (const [word, pos, defs] of SEED) {
      const existing = seeded.find((w) => w.word === word);
      if (existing) existing.meanings.push({ pos, definitions: defs });
      else
        seeded.push({
          id: uid(),
          word,
          meanings: [{ pos, definitions: defs }],
          testedRounds: 0,
          lastTestedAt: null,
          excluded: false,
        });
    }
    localStorage.setItem(WORDS_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    return (JSON.parse(raw) as LegacyWord[]).map(migrateWord);
  } catch {
    return [];
  }
}

function saveWords(words: WordItem[]) {
  localStorage.setItem(WORDS_KEY, JSON.stringify(words));
  notify();
}

/** 添加单词（可带一个初始义项组）。已存在则合并义项。 */
export function addWord(word: string, pos = "", definitions: string[] = []): WordItem | null {
  const w = word.trim();
  if (!w) return null;
  const words = getWords();
  const defs = definitions.map((d) => d.trim()).filter(Boolean);
  const existing = words.find((it) => it.word.toLowerCase() === w.toLowerCase());
  if (existing) {
    // 合并：同词性追加义项，否则新增义项组
    const group = existing.meanings.find((m) => m.pos === pos);
    if (group) {
      for (const d of defs) if (!group.definitions.includes(d)) group.definitions.push(d);
    } else if (pos || defs.length) {
      existing.meanings.push({ pos, definitions: defs });
    }
    saveWords(words);
    return existing;
  }
  const item: WordItem = {
    id: uid(),
    word: w,
    meanings: pos || defs.length ? [{ pos, definitions: defs }] : [],
    testedRounds: 0,
    lastTestedAt: null,
    excluded: false,
  };
  saveWords([item, ...words]);
  return item;
}

/**
 * 批量导入。每行格式（支持中英文逗号、中文分号）：
 *   plateau,n.,高原；平稳期
 *   plateau,v.,达到平稳状态
 * 同一个单词多行会自动合并成多词性。也兼容旧格式「单词,释义」。返回新增/合并的单词数。
 */
export function importWords(text: string): number {
  let touched = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[,，]/).map((p) => p.trim());
    let word = "";
    let pos = "";
    let defs: string[] = [];
    if (parts.length >= 3) {
      // 新格式：单词,词性,义项1；义项2
      [word, pos] = parts;
      defs = parts.slice(2).join("，").split(/[;；]/).map((d) => d.trim()).filter(Boolean);
    } else if (parts.length === 2) {
      // 旧格式：单词,释义
      [word] = parts;
      defs = parts[1].split(/[;；]/).map((d) => d.trim()).filter(Boolean);
    } else {
      word = trimmed;
    }
    if (word && addWord(word, pos, defs)) touched += 1;
  }
  return touched;
}

export function removeWord(id: string): void {
  saveWords(getWords().filter((it) => it.id !== id));
}

/** 切换“不再测”标记 */
export function toggleExcluded(id: string): void {
  const words = getWords();
  const w = words.find((it) => it.id === id);
  if (w) {
    w.excluded = !w.excluded;
    saveWords(words);
  }
}

/** 记录一次测试（累加 testedRounds、更新 lastTestedAt） */
export function markWordTested(id: string): void {
  const words = getWords();
  const w = words.find((it) => it.id === id);
  if (w) {
    w.testedRounds += 1;
    w.lastTestedAt = Date.now();
    saveWords(words);
  }
}

// ---------- 全库测试进度 ----------

export function getProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    /* 忽略 */
  }
  return { currentRound: 1, testedInRound: [] };
}

function saveProgress(p: Progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  notify();
}

/** 一键重置全部进度 */
export function resetProgress(): void {
  saveProgress({ currentRound: 1, testedInRound: [] });
}

/** 可参与测试的单词池（排除“不再测”的） */
function testableWords(): WordItem[] {
  return getWords().filter((w) => !w.excluded);
}

/** 本轮进度：{ tested, total, round } */
export function roundStats(): { round: number; tested: number; total: number } {
  const pool = testableWords();
  const p = getProgress();
  const ids = new Set(pool.map((w) => w.id));
  const tested = p.testedInRound.filter((id) => ids.has(id)).length;
  return { round: p.currentRound, tested, total: pool.length };
}

/**
 * 抽取下一个单词（全库模式）：
 * 优先本轮未测的；全部测过一遍后自动开启新一轮。
 */
export function pickNextWord(excludeId?: string): WordItem | null {
  let pool = testableWords();
  if (pool.length === 0) return null;

  let p = getProgress();
  const poolIds = new Set(pool.map((w) => w.id));
  p.testedInRound = p.testedInRound.filter((id) => poolIds.has(id));

  if (p.testedInRound.length >= pool.length) {
    // 本轮完成 → 自动重置，开启新一轮
    p = { currentRound: p.currentRound + 1, testedInRound: [] };
  }
  saveProgress(p);

  const untested = pool.filter((w) => !p.testedInRound.includes(w.id) && w.id !== excludeId);
  const candidates = untested.length > 0 ? untested : pool.filter((w) => w.id !== excludeId);
  const finalPool = candidates.length > 0 ? candidates : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

/** 把单词记入本轮已测（指定模式和错题复习也要调用，计入全库进度） */
export function markTestedInRound(id: string): void {
  const p = getProgress();
  if (!p.testedInRound.includes(id)) {
    p.testedInRound.push(id);
    saveProgress(p);
  }
  markWordTested(id);
}

// ---------- 错题本 ----------

interface LegacyWrong extends Partial<WrongItem> {
  meaning?: string;
  word: string;
  yourAnswer: string;
  comment: string;
  wrongAt: number;
}

export function getWrongBook(): WrongItem[] {
  try {
    const raw = localStorage.getItem(WRONG_KEY);
    if (!raw) return [];
    const list = (JSON.parse(raw) as LegacyWrong[]).map((it) => ({
      id: it.id ?? uid(),
      word: it.word,
      meanings:
        it.meanings && it.meanings.length > 0
          ? it.meanings
          : it.meaning?.trim()
            ? [{ pos: "", definitions: [it.meaning.trim()] }]
            : [],
      yourAnswer: it.yourAnswer,
      comment: it.comment,
      wrongAt: it.wrongAt,
      wrongCount: it.wrongCount ?? 1,
      corrected: it.corrected ?? false,
    }));
    return list.sort((a, b) => b.wrongAt - a.wrongAt);
  } catch {
    return [];
  }
}

function saveWrongBook(book: WrongItem[]) {
  localStorage.setItem(WRONG_KEY, JSON.stringify(book));
  notify();
}

/** 答错收录：同一单词再次答错 → 累加 wrongCount 并更新答案/评语 */
export function addToWrongBook(word: WordItem, yourAnswer: string, comment: string): void {
  const book = getWrongBook();
  const existing = book.find((it) => it.word.toLowerCase() === word.word.toLowerCase());
  if (existing) {
    existing.yourAnswer = yourAnswer;
    existing.comment = comment;
    existing.wrongAt = Date.now();
    existing.wrongCount += 1;
    existing.corrected = false;
    existing.meanings = word.meanings;
    saveWrongBook(book);
    return;
  }
  saveWrongBook([
    {
      id: uid(),
      word: word.word,
      meanings: word.meanings,
      yourAnswer,
      comment,
      wrongAt: Date.now(),
      wrongCount: 1,
      corrected: false,
    },
    ...book,
  ]);
}

export function removeFromWrongBook(id: string): void {
  saveWrongBook(getWrongBook().filter((it) => it.id !== id));
}

/** 复习答对但选择保留：标记“已订正” */
export function markCorrected(id: string): void {
  const book = getWrongBook();
  const it = book.find((w) => w.id === id);
  if (it) {
    it.corrected = true;
    saveWrongBook(book);
  }
}

export function clearWrongBook(): void {
  saveWrongBook([]);
}

// ---------- 显示辅助 ----------

/** 把义项组格式化成多行文本："n. 高原；平稳期" */
export function formatMeanings(meanings: MeaningGroup[]): string[] {
  return meanings.map((m) => `${m.pos ? m.pos + " " : ""}${m.definitions.join("；")}`);
}
