/**
 * 词族（word family）识别：添加/导入时找可归入的已有词族。
 *
 * 候选核心词 = 待添加文本的第一个词（小写）。
 * 匹配规则（任一命中即视为找到相关词族）：
 *   1. word 等于候选（crack → crack）
 *   2. familyKey 等于候选（crack → 已有族 crack）
 *   3. word 以「候选 + 空格」开头（crack → crack down on）
 *
 * 短词保护：候选核心词长度 < 3（in / at / on / a…）不自动识别，
 * 只能手动填 familyKey——否则 in fact / in time 会全被归到 in 族。
 */

import type { WordItem } from "./store";

export interface FamilyCandidate {
  /** 词族 key（归入时写入 familyKey 的值） */
  key: string;
  /** 已有成员（用于确认框展示「含 crack down on 等 N 条」） */
  members: WordItem[];
}

/** 提取候选核心词：第一个词小写 */
export function candidateCore(text: string): string {
  return text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/**
 * 查找可归入的词族。找不到返回 null。
 * @param excludeId 编辑场景排除自身
 * @param excludeIds 批量导入场景：排除本次正在导入的整批词条（防止匹配到自己）
 */
export function findFamilyCandidate(
  text: string,
  words: WordItem[],
  excludeId?: string,
  excludeIds?: Set<string>,
): FamilyCandidate | null {
  const core = candidateCore(text);
  if (core.length < 3) return null; // 短核心词不自动识别
  const pool = words.filter(
    (w) => !w.deleted && w.id !== excludeId && !(excludeIds && excludeIds.has(w.id)),
  );
  const keyOf = (w: WordItem) => w.familyKey?.toLowerCase();
  const members = pool.filter(
    (w) =>
      w.word.toLowerCase() === core ||
      keyOf(w) === core ||
      w.word.toLowerCase().startsWith(core + " "),
  );
  if (members.length === 0) return null;
  // key 取已有成员的 familyKey（保证同族同 key）；成员都没有 familyKey 时用候选词开新族
  const key = members.find((m) => m.familyKey)?.familyKey?.toLowerCase() ?? core;
  return { key, members };
}
