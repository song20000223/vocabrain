/**
 * 预取判分：测试开始时对整个队列并行预判，答题时结果已就绪，提交即出。
 *
 * 两级策略：
 *  1. 本地判定（毫秒级，零消耗）：词库有自定义释义时，答案若包含/被包含于任一义项，
 *     或命中义项的同义片段，直接判对——无需等 AI。
 *  2. 后台 AI 预取：本地判不了的，测试一开始就在后台并行请求，答到该题时多数已完成。
 */
import type { MeaningGroup } from "./store";

export interface PrefetchedResult {
  correct: boolean;
  standardMeaning: string;
  comment: string;
}

interface JudgeRequest {
  word: string;
  answer: string;
  meanings?: MeaningGroup[];
}

/**
 * 反向模式（中→英）拼写比对：忽略大小写与多余空格。
 */
export function checkSpelling(answer: string, correctWord: string): boolean {
  return answer.trim().toLowerCase().replace(/\s+/g, " ") === correctWord.trim().toLowerCase();
}

/**
 * 本地快速判定：返回答案确定的结果，无法确定则返回 null（交给 AI）。
 * 只在词库有自定义释义时启用；规则：答案命中任一义项的核心片段即算对。
 */
export function quickLocalJudge(
  answer: string,
  meanings: MeaningGroup[],
): PrefetchedResult | null {
  const a = answer.trim().toLowerCase();
  if (!a || meanings.length === 0) return null;

  const allDefs = meanings.flatMap((m) => m.definitions);
  for (const def of allDefs) {
    // 义项按标点拆成片段，逐个比对
    const parts = def.split(/[;；,，、\s/（）()]+/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      if (p.length < 2) continue;
      // 答案包含义项片段，或义项片段包含答案（如答案"高原"，义项"高原地区"）
      if (a.includes(p.toLowerCase()) || p.toLowerCase().includes(a)) {
        return {
          correct: true,
          standardMeaning: meanings
            .map((m) => `${m.pos ? m.pos + " " : ""}${m.definitions.join("；")}`)
            .join("\n"),
          comment: "回答正确，继续保持！",
        };
      }
    }
  }
  return null;
}

/** 后台预取一个答案的 AI 判分结果（失败时静默，提交时再走正常流程） */
export function prefetchJudge(
  req: JudgeRequest,
  call: (r: JudgeRequest) => Promise<PrefetchedResult>,
): Promise<PrefetchedResult> {
  return call(req).catch(() => {
    // 预取失败不影响主流程，返回一个永不被消费的 rejected 状态由调用方兜底
    throw new Error("prefetch failed");
  });
}
