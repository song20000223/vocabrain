/**
 * 单词列表与错题本 —— 存储在浏览器 localStorage（仅当前浏览器可用）。
 */

export interface WordItem {
  id: string;
  word: string;
  meaning: string;
}

export interface WrongItem extends WordItem {
  yourAnswer: string;
  comment: string;
  wrongAt: number;
}

const WORDS_KEY = "vocab_words";
const WRONG_KEY = "vocab_wrong_book";

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** 首次打开时的内置单词，方便立刻体验 */
const SEED_WORDS: Array<[string, string]> = [
  ["apple", "苹果"],
  ["journey", "旅行；旅程"],
  ["serendipity", "意外发现美好事物的运气"],
  ["ambitious", "有雄心的；有抱负的"],
  ["fragile", "易碎的；脆弱的"],
  ["generous", "慷慨的；大方的"],
  ["inevitable", "不可避免的"],
  ["procrastinate", "拖延；耽搁"],
  ["resilient", "有韧性的；能迅速恢复的"],
  ["meticulous", "一丝不苟的；细心的"],
  ["dilemma", "两难困境"],
  ["eloquent", "雄辩的；有口才的"],
  ["nostalgia", "怀旧；乡愁"],
  ["versatile", "多才多艺的；多用途的"],
  ["ephemeral", "短暂的；转瞬即逝的"],
];

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("vocab-store-change"));
}

// ---------- 单词列表 ----------

export function getWords(): WordItem[] {
  const words = read<WordItem>(WORDS_KEY);
  if (words.length === 0 && localStorage.getItem(WORDS_KEY) === null) {
    const seeded = SEED_WORDS.map(([word, meaning]) => ({ id: uid(), word, meaning }));
    write(WORDS_KEY, seeded);
    return seeded;
  }
  return words;
}

export function addWord(word: string, meaning: string): WordItem | null {
  const w = word.trim();
  if (!w) return null;
  const words = getWords();
  if (words.some((it) => it.word.toLowerCase() === w.toLowerCase())) return null;
  const item: WordItem = { id: uid(), word: w, meaning: meaning.trim() };
  write(WORDS_KEY, [item, ...words]);
  return item;
}

/** 批量导入，每行格式：单词,释义（也支持中文逗号、Tab、空格分隔）。返回新增数量 */
export function importWords(text: string): number {
  let added = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([A-Za-z][A-Za-z' -]*)\s*[,，\t]\s*(.+)$/);
    const word = m ? m[1] : trimmed.split(/\s+/)[0];
    const meaning = m ? m[2] : trimmed.slice(word.length).trim();
    if (word && addWord(word, meaning || "")) added += 1;
  }
  return added;
}

export function removeWord(id: string): void {
  write(WORDS_KEY, getWords().filter((it) => it.id !== id));
}

// ---------- 错题本 ----------

export function getWrongBook(): WrongItem[] {
  return read<WrongItem>(WRONG_KEY).sort((a, b) => b.wrongAt - a.wrongAt);
}

export function addToWrongBook(word: WordItem, yourAnswer: string, comment: string): void {
  const book = read<WrongItem>(WRONG_KEY).filter((it) => it.word.toLowerCase() !== word.word.toLowerCase());
  write(WRONG_KEY, [{ ...word, yourAnswer, comment, wrongAt: Date.now() }, ...book]);
}

export function removeFromWrongBook(id: string): void {
  write(WRONG_KEY, read<WrongItem>(WRONG_KEY).filter((it) => it.id !== id));
}

export function clearWrongBook(): void {
  write(WRONG_KEY, []);
}
