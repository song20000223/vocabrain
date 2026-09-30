/**
 * 备忘录数据层：独立存储键，不动 WordItem / BookItem。
 * 边界：删单词只从 relatedWordIds 移除 id；删笔记不影响单词；
 * 单词软删不断链（relatedWordIds 原样保留），恢复即自动复原。
 */
import { readAllWords, type WordItem } from "./store";

export interface MemoItem {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  relatedWordIds?: string[];
  bookId?: string | null;
  createdAt: number;
  updatedAt: number;
}

const MEMOS_KEY = "vocab_memos";

const uid = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function notify() {
  window.dispatchEvent(new Event("vocab-store-change"));
}

export function getMemos(): MemoItem[] {
  try {
    const raw = localStorage.getItem(MEMOS_KEY);
    const list: MemoItem[] = raw ? JSON.parse(raw) : [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveMemos(memos: MemoItem[]) {
  localStorage.setItem(MEMOS_KEY, JSON.stringify(memos));
  notify();
}

export function addMemo(
  title: string,
  content: string,
  extra?: { tags?: string[]; relatedWordIds?: string[]; bookId?: string | null },
): MemoItem {
  const now = Date.now();
  const memo: MemoItem = {
    id: uid(),
    title: title.trim(),
    content,
    tags: extra?.tags?.map((t) => t.trim()).filter(Boolean),
    relatedWordIds: extra?.relatedWordIds,
    bookId: extra?.bookId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  saveMemos([memo, ...getMemos()]);
  return memo;
}

export function updateMemo(id: string, patch: Partial<Omit<MemoItem, "id" | "createdAt">>): void {
  const memos = getMemos();
  const m = memos.find((it) => it.id === id);
  if (!m) return;
  Object.assign(m, patch, { updatedAt: Date.now() });
  saveMemos(memos);
}

export function removeMemo(id: string): void {
  saveMemos(getMemos().filter((m) => m.id !== id));
}

/** 某单词（含软删）关联的笔记 */
export function getMemosForWord(wordId: string): MemoItem[] {
  return getMemos().filter((m) => m.relatedWordIds?.includes(wordId));
}

/** 单词删除时调用：只摘 id，不删笔记 */
export function detachWordFromMemos(wordId: string): void {
  const memos = getMemos();
  let changed = false;
  for (const m of memos) {
    if (m.relatedWordIds?.includes(wordId)) {
      m.relatedWordIds = m.relatedWordIds.filter((id) => id !== wordId);
      m.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) saveMemos(memos);
}

/** 取关联单词对象：含软删（删除的显示「已删除」标记，不断链） */
export function getRelatedWords(memo: MemoItem): { word: WordItem; deleted: boolean }[] {
  if (!memo.relatedWordIds?.length) return [];
  const all = readAllWords();
  const out: { word: WordItem; deleted: boolean }[] = [];
  for (const id of memo.relatedWordIds) {
    const w = all.find((it) => it.id === id);
    if (w) out.push({ word: w, deleted: !!w.deleted });
  }
  return out;
}

/** 搜索：标题 + 正文 + 标签 */
export function searchMemos(query: string, tag?: string): MemoItem[] {
  let list = getMemos();
  if (tag) list = list.filter((m) => m.tags?.includes(tag));
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      m.tags?.some((t) => t.toLowerCase().includes(q)),
  );
}

/** 全部标签（去重，按出现顺序） */
export function allMemoTags(): string[] {
  const tags: string[] = [];
  for (const m of getMemos()) {
    for (const t of m.tags ?? []) if (!tags.includes(t)) tags.push(t);
  }
  return tags;
}

/** 有笔记的单词 id 集合（行图标高亮用） */
export function wordIdsWithMemos(): Set<string> {
  const ids = new Set<string>();
  for (const m of getMemos()) for (const id of m.relatedWordIds ?? []) ids.add(id);
  return ids;
}
