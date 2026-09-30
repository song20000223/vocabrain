/**
 * 单词导出：CSV（默认，带 BOM 兼容 Excel/WPS）/ TXT（一行一个词）。
 * 字段固定：单词, 类型, 词书, 书内序号, 释义, 已背, 已掌握, 测试次数, 上次测试时间
 */
import { getBooks, formatMeanings, type WordItem } from "./store";

export interface ExportFilters {
  tested: boolean; // 已背 testedRounds > 0
  untested: boolean; // 未背 testedRounds === 0
  mastered: boolean; // 已掌握
  excluded: boolean; // 不再测
  word: boolean; // 单词
  phrase: boolean; // 词组
}

export const DEFAULT_EXPORT_FILTERS: ExportFilters = {
  tested: true,
  untested: true,
  mastered: false,
  excluded: false,
  word: true,
  phrase: false,
};

/** 按状态/类型筛选；「已背/未背」「已掌握」「不再测」各为一组，组内都不勾 = 该组不限制 */
export function filterForExport(words: WordItem[], f: ExportFilters): WordItem[] {
  return words.filter((w) => {
    // 类型组
    if (!f.word && w.type === "word") return false;
    if (!f.phrase && w.type === "phrase") return false;
    // 背记组
    if (f.tested || f.untested) {
      const ok = (f.tested && w.testedRounds > 0) || (f.untested && w.testedRounds === 0);
      if (!ok) return false;
    }
    // 掌握组：勾了 = 仅已掌握
    if (f.mastered && !w.mastered) return false;
    // 不再测组：勾了 = 仅不再测；默认不勾时也不含不再测？——不勾即不限制
    if (f.excluded && !w.excluded) return false;
    return true;
  });
}

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function buildCsv(words: WordItem[]): string {
  const books = getBooks();
  const bookName = (id: string) => books.find((b) => b.id === id)?.name ?? "默认词书";
  const header = "单词,类型,词书,书内序号,释义,已背,已掌握,测试次数,上次测试时间";
  const rows = words.map((w) =>
    [
      csvCell(w.word),
      w.type === "phrase" ? "词组" : "单词",
      csvCell(bookName(w.bookId)),
      String(w.orderInBook),
      csvCell(formatMeanings(w.meanings).join(" / ")),
      w.testedRounds > 0 ? "是" : "否",
      w.mastered ? "是" : "否",
      String(w.testedRounds),
      w.lastTestedAt ? new Date(w.lastTestedAt).toLocaleString("zh-CN") : "",
    ].join(","),
  );
  return "﻿" + [header, ...rows].join("\r\n");
}

export function buildTxt(words: WordItem[]): string {
  return words.map((w) => w.word).join("\n");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 文件名：{范围}_{状态}_{YYYYMMDD}.csv / 测试结果_YYYYMMDD_HHmm.csv */
export function exportFileName(
  scopeName: string,
  f: ExportFilters,
  ext: "csv" | "txt",
  withTime = false,
): string {
  const d = new Date();
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = withTime ? `_${pad(d.getHours())}${pad(d.getMinutes())}` : "";
  const states: string[] = [];
  if (f.tested && !f.untested) states.push("已背");
  if (f.untested && !f.tested) states.push("未背");
  if (f.mastered) states.push("已掌握");
  if (f.excluded) states.push("不再测");
  if (!f.word && f.phrase) states.push("词组");
  const statePart = states.length > 0 ? `_${states.join("+")}` : "";
  return `${scopeName}${statePart}_${date}${time}.${ext}`;
}

/** 触发浏览器下载 */
export function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
