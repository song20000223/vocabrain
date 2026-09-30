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

export type EntryType = "word" | "phrase";

export interface WordItem {
  id: string; // 全局 id，仅内部使用，不展示给用户
  word: string; // 单词或词组文本
  type: EntryType; // 旧数据默认 "word"
  meanings: MeaningGroup[];
  bookId: string; // 所属词书
  orderInBook: number; // 书内序号：每本词书独立，从 1 开始；删除不回填
  mastered: boolean; // 已掌握（手动开关，供筛选排除）
  deleted?: boolean; // 软删除标记：真删单词用；查询/列表/抽选一律过滤。旧数据为 undefined = 未删
  testedRounds: number; // 累计被测次数
  lastTestedAt: number | null;
  excluded: boolean; // 标记“不再测”
  /** 连续答错次数：答对 -1（最低 0），答错 +1。旧数据缺省补 0。供「优先抽错词」使用 */
  wrongStreak: number;
}

export interface BookItem {
  id: string;
  name: string;
  parentId: string | null; // null = 词书层；词书id = 章节层。固定两层，不做第三层
  createdAt: number;
}

/** 该词书是否为章节（有父级） */
export function isChapter(book: BookItem): boolean {
  return book.parentId !== null;
}

/** 取某词书的章节列表（按创建顺序） */
export function getChapters(bookId: string): BookItem[] {
  return getBooks().filter((b) => b.parentId === bookId);
}

/** 取某节点自身 + 全部后代章节 id（两层结构，后代即子章节） */
export function getBookWithDescendants(bookId: string): string[] {
  return [bookId, ...getChapters(bookId).map((c) => c.id)];
}

/** 删除前的确认信息：空章节直接删；非空需提示单词去向 */
export function getBookRemovalInfo(id: string): {
  isChapter: boolean;
  name: string;
  parentName: string | null;
  wordCount: number; // 该节点自身的单词数
  chapterCount: number; // 词书层：子章节数；章节恒为 0
  totalWords: number; // 词书层：自身+全部章节单词；章节 = wordCount
  moveToName: string; // 单词去向（父词书 / 默认词书）
} | null {
  const books = getBooks();
  const target = books.find((b) => b.id === id);
  if (!target || id === DEFAULT_BOOK_ID || id === PHRASE_BOOK_ID) return null;
  const isChapter = target.parentId !== null;
  const words = getWords();
  const wordCount = words.filter((w) => w.bookId === id).length;
  if (isChapter) {
    const parent = books.find((b) => b.id === target.parentId);
    return {
      isChapter: true,
      name: target.name,
      parentName: parent?.name ?? null,
      wordCount,
      chapterCount: 0,
      totalWords: wordCount,
      moveToName: parent?.name ?? "默认词书",
    };
  }
  const chapters = getChapters(id);
  const ids = new Set([id, ...chapters.map((c) => c.id)]);
  const totalWords = words.filter((w) => ids.has(w.bookId)).length;
  return {
    isChapter: false,
    name: target.name,
    parentName: null,
    wordCount,
    chapterCount: chapters.length,
    totalWords,
    moveToName: "默认词书",
  };
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
  source: "quiz" | "dictation"; // 来源：测试 / 听写（旧数据迁移为 quiz）
  entryType: EntryType; // 单词 / 词组（旧数据迁移为 word）
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
const WORDS_BACKUP_KEY = "vocab_words_backup_v1";
export const DEFAULT_BOOK_ID = "default";
export const PHRASE_BOOK_ID = "__phrase_book__"; // 内置词组词书，不可删除

// ---------- 词书（文件夹） ----------

export function getBooks(): BookItem[] {
  const phraseBook: BookItem = {
    id: PHRASE_BOOK_ID,
    name: "我的词组",
    parentId: null,
    createdAt: Date.now(),
  };
  const defaultBook: BookItem = {
    id: DEFAULT_BOOK_ID,
    name: "默认词书",
    parentId: null,
    createdAt: Date.now(),
  };
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    if (!raw) {
      const def: BookItem[] = [defaultBook, phraseBook];
      localStorage.setItem(BOOKS_KEY, JSON.stringify(def));
      return def;
    }
    const books = (JSON.parse(raw) as Array<Omit<BookItem, "parentId"> & { parentId?: string | null }>).map(
      // 旧词书迁移：补 parentId = null（词书层），不动单词和序号
      (b) => ({ ...b, parentId: b.parentId ?? null }),
    );
    let changed = false;
    if (!books.some((b) => b.id === DEFAULT_BOOK_ID)) {
      books.unshift(defaultBook);
      changed = true;
    }
    if (!books.some((b) => b.id === PHRASE_BOOK_ID)) {
      books.push(phraseBook);
      changed = true;
    }
    if (changed) localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
    return books;
  } catch {
    return [defaultBook, phraseBook];
  }
}

function saveBooks(books: BookItem[]) {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
  notify();
}

/**
 * 新建词书/章节。
 * parentId 为空 → 词书层；传词书 id → 在其下建章节（固定两层：章节下不再建子章节）。
 */
export function addBook(name: string, parentId: string | null = null): BookItem | null {
  const n = name.trim();
  if (!n) return null;
  const books = getBooks();
  if (books.some((b) => b.name === n && b.parentId === parentId)) return null;
  // 固定两层：parent 必须是词书层（parentId === null）
  if (parentId !== null) {
    const parent = books.find((b) => b.id === parentId);
    if (!parent || parent.parentId !== null) return null;
  }
  const book: BookItem = { id: uid(), name: n, parentId, createdAt: Date.now() };
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

/**
 * 删除词书/章节（容器操作，单词一律搬走不真删）：
 *  - 删章节（parentId != null）：章节内单词移入父词书，序号追加到父词书末尾；
 *  - 删词书（parentId == null）：子章节一并删除，全部单词移入「默认词书」，序号追加到其末尾。
 * 内置词书「默认词书」「我的词组」不可删除。
 */
export function removeBook(id: string): void {
  if (id === DEFAULT_BOOK_ID || id === PHRASE_BOOK_ID) return;
  const books = getBooks();
  const target = books.find((b) => b.id === id);
  if (!target) return;

  // 章节 → 单词搬去父词书；词书 → 自身+章节全删，单词搬去默认词书
  const doomedBookIds = target.parentId !== null ? new Set([id]) : new Set(getBookWithDescendants(id));
  const moveTo = target.parentId !== null ? target.parentId : DEFAULT_BOOK_ID;

  saveBooks(books.filter((b) => !doomedBookIds.has(b.id)));
  const words = readAllWords(); // 用全量（含软删除）保证序号最大值算得准
  let changed = false;
  let maxOrder = words.reduce(
    (m, it) => (it.bookId === moveTo ? Math.max(m, it.orderInBook) : m),
    0,
  );
  for (const w of words) {
    if (doomedBookIds.has(w.bookId)) {
      w.bookId = moveTo;
      w.orderInBook = ++maxOrder;
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
  type?: EntryType;
  meaning?: string; // 旧字段
  meanings?: MeaningGroup[];
  bookId?: string;
  orderInBook?: number;
  mastered?: boolean;
  deleted?: boolean;
  testedRounds?: number;
  lastTestedAt?: number | null;
  wrongStreak?: number;
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
    type: raw.type === "phrase" ? "phrase" : "word",
    meanings,
    bookId: raw.bookId ?? DEFAULT_BOOK_ID,
    orderInBook: raw.orderInBook ?? 0, // 0 = 待回填，由 migrateOrder 统一分配
    mastered: raw.mastered ?? false,
    deleted: raw.deleted ?? false,
    testedRounds: raw.testedRounds ?? 0,
    lastTestedAt: raw.lastTestedAt ?? null,
    excluded: raw.excluded ?? false,
    wrongStreak: raw.wrongStreak ?? 0,
  };
}

/**
 * 回填书内序号：每本词书按现有数组顺序从 1 开始分配（已有序号的保留，跳过占用值）。
 * 迁移前把原始数据快照备份到 vocab_words_backup_v1，并打印每本书首尾序号。
 */
function migrateOrder(words: WordItem[], rawJson: string): { words: WordItem[]; migrated: boolean } {
  const need = words.some((w) => !w.orderInBook || w.orderInBook < 1);
  if (!need) return { words, migrated: false };

  // 备份（只备一次，不覆盖）
  if (!localStorage.getItem(WORDS_BACKUP_KEY)) {
    localStorage.setItem(WORDS_BACKUP_KEY, rawJson);
  }

  const byBook = new Map<string, WordItem[]>();
  for (const w of words) {
    const list = byBook.get(w.bookId) ?? [];
    list.push(w);
    byBook.set(w.bookId, list);
  }
  for (const [bookId, list] of byBook) {
    const used = new Set(list.filter((w) => w.orderInBook >= 1).map((w) => w.orderInBook));
    let next = 1;
    for (const w of list) {
      if (w.orderInBook >= 1) continue;
      while (used.has(next)) next += 1;
      w.orderInBook = next;
      used.add(next);
    }
    const sorted = [...list].sort((a, b) => a.orderInBook - b.orderInBook);
    console.info(
      `[vocab] 迁移完成 · 词书 ${bookId}：共 ${list.length} 条，序号 ${sorted[0]?.orderInBook} → ${sorted[sorted.length - 1]?.orderInBook}（排序依据：原数据数组顺序，即添加顺序）`,
    );
  }
  return { words, migrated: true };
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

/** 读取全部单词（含软删除），仅供内部写操作使用 */
export function readAllWords(): WordItem[] {
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
          type: "word",
          meanings: [{ pos, definitions: defs }],
          bookId: DEFAULT_BOOK_ID,
          orderInBook: seeded.length + 1,
          mastered: false,
          testedRounds: 0,
          lastTestedAt: null,
          excluded: false,
          wrongStreak: 0,
        });
    }
    localStorage.setItem(WORDS_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = (JSON.parse(raw) as LegacyWord[]).map(migrateWord);
    const { words, migrated } = migrateOrder(parsed, raw);
    if (migrated) localStorage.setItem(WORDS_KEY, JSON.stringify(words));
    return words;
  } catch {
    return [];
  }
}

/** 对外查询：一律过滤软删除（deleted=true）的单词 */
export function getWords(): WordItem[] {
  return readAllWords().filter((w) => !w.deleted);
}

function saveWords(words: WordItem[]) {
  localStorage.setItem(WORDS_KEY, JSON.stringify(words));
  notify();
}

/** 添加单词/词组（可带一个初始义项组，可指定词书）。已存在则合并义项。 */
export function addWord(
  word: string,
  pos = "",
  definitions: string[] = [],
  bookId: string = DEFAULT_BOOK_ID,
  type: EntryType = "word",
): WordItem | null {
  const w = word.trim();
  if (!w) return null;
  // 词组默认进“我的词组”
  if (type === "phrase" && bookId === DEFAULT_BOOK_ID) bookId = PHRASE_BOOK_ID;
  const words = getWords();
  const defs = definitions.map((d) => d.trim()).filter(Boolean);
  const existing = words.find(
    (it) => it.word.toLowerCase() === w.toLowerCase() && it.type === type,
  );
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
  const maxOrder = words.reduce((m, it) => (it.bookId === bookId ? Math.max(m, it.orderInBook) : m), 0);
  const item: WordItem = {
    id: uid(),
    word: w,
    type,
    meanings: pos || defs.length ? [{ pos, definitions: defs }] : [],
    bookId,
    orderInBook: maxOrder + 1,
    mastered: false,
    testedRounds: 0,
    lastTestedAt: null,
    excluded: false,
    wrongStreak: 0,
  };
  saveWords([item, ...words]);
  return item;
}

// 词性前缀，如 "n." "v." "vt." "adj." 等，可连续出现（如 "vt. & vi."）
const POS_TOKEN = "(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|int|interj|art|abbr|aux|det|phr)\\.";

/** 中英文各半的粗略判断：检索框输入的是中文还是英文 */
export function looksChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

/** 把 "n. 高原；平稳期" 这样的 AI 释义解析成 pos + definitions，供 addWord 使用 */
export function parseAiDefinition(def: string): { pos: string; definitions: string[] } {
  const m = def.trim().match(/^\s*((?:n|v|vt|vi|adj|adv|prep|conj|pron|num|int|interj|art|abbr)\.)\s*(.*)$/i);
  const pos = m ? m[1] : "";
  const body = m ? m[2] : def.trim();
  const definitions = body
    .split(/[;；、]/)
    .map((d) => d.trim().replace(/[。.]+$/, "").trim())
    .filter(Boolean);
  return { pos, definitions };
}
const POS_PREFIX_RE = new RegExp(`^\\s*(${POS_TOKEN}(?:\\s*[&/]?\\s*${POS_TOKEN})*)\\s*`, "i");
// 纯英文单词（允许连字符、撇号）
const WORD_RE = /^[A-Za-z][A-Za-z\-']*$/;

/** 解析"词性 释义"部分：去掉词性前缀，义项按 ；; 、,， 切分，去掉句末句号 */
export function parsePosAndDefs(rest: string): { pos: string; defs: string[] } {
  let pos = "";
  let body = rest;
  const m = body.match(POS_PREFIX_RE);
  if (m) {
    pos = m[1].trim();
    body = body.slice(m[0].length);
  }
  const defs = body
    .split(/[;；、]/)
    .flatMap((d) =>
      // 逗号也作义项分隔，但前提是切完两侧都不含拉丁字符（避免拆坏英文释义/例句）
      d.split(/[,，]/).map((x) => x.trim()).filter((_x, _i, arr) => {
        if (arr.length === 1) return true;
        return arr.every((y) => !/[A-Za-z]/.test(y));
      }),
    )
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

/**
 * 软删除单词：标记 deleted=true，数据保留（将来可加回收站/撤销）。
 * 列表/抽选/听写一律不再出现；错题本等历史记录保留引用，不做级联删除。
 */
export function removeWord(id: string): void {
  const words = readAllWords();
  const w = words.find((it) => it.id === id);
  if (w) {
    w.deleted = true;
    saveWords(words);
  }
}

/** 恢复软删除的单词（数据层留的“回去的路”，暂无 UI） */
export function restoreWord(id: string): void {
  const words = readAllWords();
  const w = words.find((it) => it.id === id);
  if (w) {
    w.deleted = false;
    saveWords(words);
  }
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

/** 切换“已掌握”标记（手动开关，供抽选排除） */
export function toggleMastered(id: string): void {
  const words = getWords();
  const w = words.find((it) => it.id === id);
  if (w) {
    w.mastered = !w.mastered;
    saveWords(words);
  }
}

/** 编辑释义（原地更新 meanings，保存即持久化；判分直接使用新释义） */
export function updateMeanings(id: string, meanings: MeaningGroup[]): void {
  const words = getWords();
  const w = words.find((it) => it.id === id);
  if (!w) return;
  w.meanings = meanings
    .map((m) => ({
      pos: m.pos.trim(),
      definitions: m.definitions.map((d) => d.trim()).filter(Boolean),
    }))
    .filter((m) => m.pos || m.definitions.length > 0);
  saveWords(words);
}

// ---------- 抽选 ----------

export interface SelectionCriteria {
  bookId: string | "all";
  type: EntryType | "all";
  rangeStart?: number; // 书内序号范围（命中实际存在的 orderInBook，跳号不影响）
  rangeEnd?: number;
  includeDescendants?: boolean; // 默认 true：选词书层时含其全部章节；章节无后代，不受影响
  excludeTested?: boolean; // testedRounds > 0（历史累计）
  excludeMastered?: boolean; // mastered 或 excluded
  preferWrong?: boolean; // 优先抽 wrongStreak > 0 的词（默认关）
  count: number;
  order: "sequential" | "random";
}

export interface SelectResult {
  entryIds: string[]; // 抽选结果快照：分页/背诵/听写都基于它，不重新计算
  matchedCount: number; // 条件命中总数（用于“范围命中 N 个，将抽 min(count,N) 个”）
  rangeIgnored: boolean; // 选了词书层（含后代）时 range 参数被忽略，UI 据此提示
}

/** 唯一抽选入口：按条件对象筛选并返回 id 快照 */
export function selectWords(criteria: SelectionCriteria): SelectResult {
  let pool = getWords().filter((w) => !w.excluded); // “不再测”始终排除

  // 词书范围：词书层默认含后代章节；章节（叶子）只含自身
  let rangeIgnored = false;
  if (criteria.bookId !== "all") {
    const book = getBooks().find((b) => b.id === criteria.bookId);
    const isParent = !!book && book.parentId === null;
    const includeDesc = criteria.includeDescendants ?? true;
    if (isParent && includeDesc) {
      const ids = new Set(getBookWithDescendants(criteria.bookId));
      pool = pool.filter((w) => ids.has(w.bookId));
      if (criteria.rangeStart != null || criteria.rangeEnd != null) rangeIgnored = true;
    } else {
      pool = pool.filter((w) => w.bookId === criteria.bookId);
      if (criteria.rangeStart != null || criteria.rangeEnd != null) {
        const lo = criteria.rangeStart ?? 1;
        const hi = criteria.rangeEnd ?? Number.MAX_SAFE_INTEGER;
        pool = pool.filter((w) => w.orderInBook >= lo && w.orderInBook <= hi);
      }
    }
  } else if (criteria.rangeStart != null || criteria.rangeEnd != null) {
    const lo = criteria.rangeStart ?? 1;
    const hi = criteria.rangeEnd ?? Number.MAX_SAFE_INTEGER;
    pool = pool.filter((w) => w.orderInBook >= lo && w.orderInBook <= hi);
  }

  if (criteria.type !== "all") pool = pool.filter((w) => w.type === criteria.type);
  if (criteria.excludeTested) pool = pool.filter((w) => w.testedRounds === 0);
  if (criteria.excludeMastered) pool = pool.filter((w) => !w.mastered);

  // 稳定的书内序号排序
  pool = [...pool].sort((a, b) =>
    a.bookId === b.bookId ? a.orderInBook - b.orderInBook : a.bookId.localeCompare(b.bookId),
  );
  const matchedCount = pool.length;
  const count = Math.max(0, criteria.count);

  const shuffle = (arr: WordItem[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  let picked: WordItem[];
  if (criteria.preferWrong) {
    // 优先抽错词：wrongStreak > 0 的先入选（内部乱序），不足再用普通池按原顺序/乱序补足
    const wrong = shuffle(pool.filter((w) => (w.wrongStreak ?? 0) > 0));
    const rest = pool.filter((w) => (w.wrongStreak ?? 0) === 0);
    const restOrdered = criteria.order === "random" ? shuffle(rest) : rest;
    picked = [...wrong, ...restOrdered].slice(0, count);
  } else if (criteria.order === "random") {
    picked = shuffle(pool).slice(0, count);
  } else {
    picked = pool.slice(0, count);
  }
  return { entryIds: picked.map((w) => w.id), matchedCount, rangeIgnored };
}

/** 按 id 数组取回单词（保持数组顺序），供 selectedEntryIds 快照还原 */
export function getWordsByIds(ids: string[]): WordItem[] {
  const map = new Map(getWords().map((w) => [w.id, w]));
  return ids.map((id) => map.get(id)).filter((w): w is WordItem => !!w);
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

/**
 * 更新连续答错计数：答对 -1（最低 0），答错 +1。
 * 所有判分场景（普通测试、听写、错题本复习）都应调用。
 */
export function bumpWrongStreak(id: string, correct: boolean): void {
  const words = readAllWords();
  const w = words.find((it) => it.id === id);
  if (!w) return;
  w.wrongStreak = Math.max(0, (w.wrongStreak ?? 0) + (correct ? -1 : 1));
  saveWords(words);
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
      source: it.source ?? "quiz",
      entryType: it.entryType ?? "word",
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
export function addToWrongBook(
  word: WordItem,
  yourAnswer: string,
  comment: string,
  source: "quiz" | "dictation" = "quiz",
): void {
  const book = getWrongBook();
  const existing = book.find(
    (it) => it.word.toLowerCase() === word.word.toLowerCase() && it.source === source,
  );
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
      source,
      entryType: word.type,
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
