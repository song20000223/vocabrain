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
  bookId: string; // 所属词书
  testedRounds: number; // 累计被测次数
  lastTestedAt: number | null;
  excluded: boolean; // 标记“不再测”
}

export interface BookItem {
  id: string;
  name: string;
  createdAt: number;
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
const BOOKS_KEY = "vocab_books";
export const DEFAULT_BOOK_ID = "default";

// ---------- 词书（文件夹） ----------

export function getBooks(): BookItem[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    if (!raw) {
      const def: BookItem[] = [{ id: DEFAULT_BOOK_ID, name: "默认词书", createdAt: Date.now() }];
      localStorage.setItem(BOOKS_KEY, JSON.stringify(def));
      return def;
    }
    const books = JSON.parse(raw) as BookItem[];
    if (!books.some((b) => b.id === DEFAULT_BOOK_ID)) {
      books.unshift({ id: DEFAULT_BOOK_ID, name: "默认词书", createdAt: Date.now() });
    }
    return books;
  } catch {
    return [{ id: DEFAULT_BOOK_ID, name: "默认词书", createdAt: Date.now() }];
  }
}

function saveBooks(books: BookItem[]) {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
  notify();
}

export function addBook(name: string): BookItem | null {
  const n = name.trim();
  if (!n) return null;
  const books = getBooks();
  if (books.some((b) => b.name === n)) return null;
  const book: BookItem = { id: uid(), name: n, createdAt: Date.now() };
  saveBooks([...books, book]);
  return book;
}

export function renameBook(id: string, name: string): void {
  const n = name.trim();
  if (!n) return;
  const books = getBooks();
  const b = books.find((it) => it.id === id);
  if (b) {
    b.name = n;
    saveBooks(books);
  }
}

/** 删除词书：里面的单词移到默认词书，不会被删掉 */
export function removeBook(id: string): void {
  if (id === DEFAULT_BOOK_ID) return;
  saveBooks(getBooks().filter((b) => b.id !== id));
  const words = getWords();
  let changed = false;
  for (const w of words) {
    if (w.bookId === id) {
      w.bookId = DEFAULT_BOOK_ID;
      changed = true;
    }
  }
  if (changed) saveWords(words);
}

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
  bookId?: string;
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
    bookId: raw.bookId ?? DEFAULT_BOOK_ID,
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
          bookId: DEFAULT_BOOK_ID,
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

/** 添加单词（可带一个初始义项组，可指定词书）。已存在则合并义项。 */
export function addWord(
  word: string,
  pos = "",
  definitions: string[] = [],
  bookId: string = DEFAULT_BOOK_ID,
): WordItem | null {
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
    bookId,
    testedRounds: 0,
    lastTestedAt: null,
    excluded: false,
  };
  saveWords([item, ...words]);
  return item;
}

// 词性前缀，如 "n." "v." "vt." "adj." 等，可连续出现（如 "vt. & vi."）
const POS_TOKEN = "(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|int|interj|art|abbr|aux|det|phr)\\.";
const POS_PREFIX_RE = new RegExp(`^\\s*(${POS_TOKEN}(?:\\s*[&/]?\\s*${POS_TOKEN})*)\\s*`, "i");
// 纯英文单词（允许连字符、撇号）
const WORD_RE = /^[A-Za-z][A-Za-z\-']*$/;

/** 解析"词性 释义"部分：去掉词性前缀，义项按 ；; 、 切分，去掉句末句号 */
function parsePosAndDefs(rest: string): { pos: string; defs: string[] } {
  let pos = "";
  let body = rest;
  const m = body.match(POS_PREFIX_RE);
  if (m) {
    pos = m[1].trim();
    body = body.slice(m[0].length);
  }
  const defs = body
    .split(/[;；、]/)
    .map((d) => d.trim().replace(/[。.]+$/, "").trim())
    .filter(Boolean);
  return { pos, defs };
}

/**
 * 解析一行导入文本，支持四种常见写法：
 *   chamber⇥n. 腔, 室; 议院        （制表符 Tab 分隔，词典软件最常见）
 *   chamber n. 腔, 室; 议院        （空格分隔 + 词性开头）
 *   plateau,n.,高原；平稳期        （逗号三段式）
 *   plateau,高原；平稳期           （逗号两段式）
 *   plateau                        （仅单词）
 */
function parseImportLine(line: string): { word: string; pos: string; defs: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1) Tab 分隔
  if (trimmed.includes("\t")) {
    const [w, ...rest] = trimmed.split(/\t+/);
    if (!WORD_RE.test(w.trim())) return null;
    const { pos, defs } = parsePosAndDefs(rest.join(" "));
    return { word: w.trim(), pos, defs };
  }

  // 2) 空格分隔：单词 + 词性开头的释义（如 "chamber n. 腔, 室"）
  const sp = trimmed.match(/^(\S+)\s+(.+)$/);
  if (sp && WORD_RE.test(sp[1]) && POS_PREFIX_RE.test(sp[2])) {
    const { pos, defs } = parsePosAndDefs(sp[2]);
    return { word: sp[1], pos, defs };
  }

  // 3) 逗号格式（第一段必须是纯单词，避免把释义里的逗号当分隔符）
  const parts = trimmed.split(/[,，]/).map((p) => p.trim());
  if (parts.length >= 2 && WORD_RE.test(parts[0])) {
    if (parts.length >= 3 && POS_PREFIX_RE.test(parts[1] + " ")) {
      const pos = parts[1].match(POS_PREFIX_RE)?.[1].trim() ?? "";
      const defs = parts
        .slice(2)
        .join("，")
        .split(/[;；、]/)
        .map((d) => d.trim().replace(/[。.]+$/, ""))
        .filter(Boolean);
      return { word: parts[0], pos, defs };
    }
    const defs = parts
      .slice(1)
      .join("，")
      .split(/[;；、]/)
      .map((d) => d.trim().replace(/[。.]+$/, ""))
      .filter(Boolean);
    return { word: parts[0], pos: "", defs };
  }

  // 4) 仅单词
  if (WORD_RE.test(trimmed)) return { word: trimmed, pos: "", defs: [] };
  return null;
}

/**
 * 批量导入。支持的行格式见 parseImportLine。同一个单词多行自动合并义项。
 * 返回 { added, skipped }：added 为新增/合并条数，skipped 为无法识别的行数。
 */
export function importWords(
  text: string,
  bookId: string = DEFAULT_BOOK_ID,
): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseImportLine(line);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    if (addWord(parsed.word, parsed.pos, parsed.defs, bookId)) added += 1;
  }
  return { added, skipped };
}

/** 全库检索：按单词或中文释义模糊匹配，返回匹配到的单词 */
export function searchWords(query: string): WordItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return getWords().filter(
    (w) =>
      w.word.toLowerCase().includes(q) ||
      w.meanings.some((m) => m.definitions.some((d) => d.toLowerCase().includes(q))),
  );
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

// ---------- 全库测试进度（按方向独立计数） ----------

export type Direction = "en2zh" | "zh2en";

interface DirectionProgress {
  currentRound: number;
  testedInRound: string[];
}

type ProgressStore = Record<Direction, DirectionProgress>;

const EMPTY_DIR: DirectionProgress = { currentRound: 1, testedInRound: [] };

export function getProgress(dir: Direction = "en2zh"): DirectionProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...EMPTY_DIR };
    const parsed = JSON.parse(raw) as Progress | Partial<ProgressStore>;
    // 旧格式迁移：{ currentRound, testedInRound } → 归入 en2zh
    if ("currentRound" in parsed && !("en2zh" in parsed)) {
      return {
        currentRound: (parsed as Progress).currentRound,
        testedInRound: (parsed as Progress).testedInRound,
      };
    }
    return (parsed as Partial<ProgressStore>)[dir] ?? { ...EMPTY_DIR };
  } catch {
    return { ...EMPTY_DIR };
  }
}

function readStore(): ProgressStore {
  return {
    en2zh: getProgress("en2zh"),
    zh2en: getProgress("zh2en"),
  };
}

function saveProgress(dir: Direction, p: DirectionProgress) {
  const store = readStore();
  store[dir] = p;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
  notify();
}

/** 一键重置全部进度（两个方向都重置） */
export function resetProgress(): void {
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({ en2zh: { ...EMPTY_DIR }, zh2en: { ...EMPTY_DIR } }),
  );
  notify();
}

/** 可参与测试的单词池（排除“不再测”的） */
function testableWords(): WordItem[] {
  return getWords().filter((w) => !w.excluded);
}

/** 本轮进度：{ tested, total, round }，按方向独立 */
export function roundStats(dir: Direction = "en2zh"): { round: number; tested: number; total: number } {
  const pool = testableWords();
  const p = getProgress(dir);
  const ids = new Set(pool.map((w) => w.id));
  const tested = p.testedInRound.filter((id) => ids.has(id)).length;
  return { round: p.currentRound, tested, total: pool.length };
}

/**
 * 抽取下一个单词（全库模式）：
 * 优先本轮未测的；全部测过一遍后自动开启新一轮。按方向独立计数。
 */
export function pickNextWord(excludeId?: string, dir: Direction = "en2zh"): WordItem | null {
  let pool = testableWords();
  if (pool.length === 0) return null;

  let p = getProgress(dir);
  const poolIds = new Set(pool.map((w) => w.id));
  p.testedInRound = p.testedInRound.filter((id) => poolIds.has(id));

  if (p.testedInRound.length >= pool.length) {
    p = { currentRound: p.currentRound + 1, testedInRound: [] };
  }
  saveProgress(dir, p);

  const untested = pool.filter((w) => !p.testedInRound.includes(w.id) && w.id !== excludeId);
  const candidates = untested.length > 0 ? untested : pool.filter((w) => w.id !== excludeId);
  const finalPool = candidates.length > 0 ? candidates : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

/** 把单词记入本轮已测（指定模式和错题复习也要调用），按方向独立 */
export function markTestedInRound(id: string, dir: Direction = "en2zh"): void {
  const p = getProgress(dir);
  if (!p.testedInRound.includes(id)) {
    p.testedInRound.push(id);
    saveProgress(dir, p);
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
