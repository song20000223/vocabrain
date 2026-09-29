import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Zap } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatMeanings, type MeaningGroup } from "@/lib/store";
import { quickLocalJudge, checkSpelling, type PrefetchedResult } from "@/lib/quickJudge";

export interface QuizWord {
  id: string;
  word: string;
  meanings: MeaningGroup[];
}

export interface QuizJudgeResult {
  correct: boolean;
  standardMeaning: string;
  comment: string;
}

export type QuizDirection = "en2zh" | "zh2en";

interface Props {
  queue: QuizWord[];
  direction?: QuizDirection;
  onJudged: (word: QuizWord, answer: string, result: QuizJudgeResult) => void;
  onCorrect?: (word: QuizWord) => void;
  onFinish?: () => void;
  progressText: string;
  exitText?: string;
  onExit?: () => void;
}

/** 触发数字雨庆祝（一轮完成时） */
export function celebrateRain() {
  const el = document.getElementById("rain-bg");
  if (!el) return;
  el.classList.remove("rain-celebrate");
  void el.offsetWidth;
  el.classList.add("rain-celebrate");
}

/**
 * 通用答题流程。
 *
 * en2zh：显示英文 → 写中文释义 → 本地极速判定 / 后台 AI 预取。
 * zh2en：显示中文题干（词库释义优先，缺了由 AI 生成）→ 写英文单词 → 拼写比对，
 *        评语由后台 AI 异步补上（不阻塞出结果）。
 */
export default function QuizSession({
  queue,
  direction = "en2zh",
  onJudged,
  onCorrect,
  onFinish,
  progressText,
  exitText,
  onExit,
}: Props) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<QuizJudgeResult | null>(null);
  const [error, setError] = useState("");
  const judge = trpc.judge.useMutation();

  // zh2en：AI 生成的题干缓存（word → definition 文本）
  const [aiDefs, setAiDefs] = useState<Record<string, string>>({});
  const [promptLoading, setPromptLoading] = useState(false);

  const judgedRef = useRef(onJudged);
  judgedRef.current = onJudged;
  const correctRef = useRef(onCorrect);
  correctRef.current = onCorrect;

  const cache = useRef(new Map<string, Promise<PrefetchedResult>>());
  const client = trpc.useUtils().client;

  const current: QuizWord | undefined = queue[index];
  const isReverse = direction === "zh2en";

  const customMeanings = useMemo(
    () => (current ? formatMeanings(current.meanings) : []),
    [current],
  );

  /** 反向题的题干文本：词库释义优先，其次 AI 生成的 */
  const promptText = useMemo(() => {
    if (!current) return "";
    if (customMeanings.length > 0) return customMeanings.join("　");
    return aiDefs[current.word] ?? "";
  }, [current, customMeanings, aiDefs]);

  const callJudge = useCallback(
    (word: string, ans: string, meanings: MeaningGroup[]) =>
      client.judge.mutate({
        word,
        answer: ans,
        meanings: meanings.length > 0 ? meanings : undefined,
      }),
    [client],
  );

  // ---------- zh2en：题干缺少释义时向 AI 要 ----------
  useEffect(() => {
    if (!isReverse || !current) return;
    if (current.meanings.length > 0 || aiDefs[current.word] !== undefined) return;
    let cancelled = false;
    setPromptLoading(true);
    client.define
      .mutate({ word: current.word })
      .then((res) => {
        if (!cancelled) setAiDefs((m) => ({ ...m, [current.word]: res.definition }));
      })
      .catch(() => {
        if (!cancelled) setAiDefs((m) => ({ ...m, [current.word]: "（释义生成失败，可退出后重试）" }));
      })
      .finally(() => !cancelled && setPromptLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isReverse, current, aiDefs, client]);

  // ---------- en2zh：输入停顿后后台预取 AI 判分 ----------
  const prefetch = useCallback(
    (word: QuizWord, ans: string) => {
      const key = `${word.word}::${ans.trim().toLowerCase()}`;
      if (!ans.trim() || cache.current.has(key)) return;
      const local = quickLocalJudge(ans, word.meanings);
      if (local) {
        cache.current.set(key, Promise.resolve(local));
        return;
      }
      const p = callJudge(word.word, ans.trim(), word.meanings).catch((e) => {
        cache.current.delete(key);
        throw e;
      });
      cache.current.set(key, p);
      p.catch(() => {});
    },
    [callJudge],
  );

  useEffect(() => {
    if (isReverse || !current || result) return;
    const t = window.setTimeout(() => prefetch(current, answer), 400);
    return () => window.clearTimeout(t);
  }, [answer, current, result, prefetch, isReverse]);

  // ---------- 提交 ----------
  const submit = useCallback(async () => {
    if (!current || !answer.trim() || judge.isPending) return;
    setError("");
    const ans = answer.trim();

    if (isReverse) {
      // 拼写比对，即时出结果
      const correct = checkSpelling(ans, current.word);
      const res: QuizJudgeResult = {
        correct,
        standardMeaning: current.word,
        comment: correct ? "拼写正确！" : `正确拼写：${current.word}`,
      };
      setResult(res);
      judgedRef.current(current, ans, res);
      if (correct) correctRef.current?.(current);
      else {
        // 答错时后台补一条 AI 评语（不阻塞界面，失败也无所谓）
        callJudge(current.word, ans, current.meanings)
          .then((ai) =>
            setResult((r) => (r && !r.correct ? { ...r, comment: ai.comment } : r)),
          )
          .catch(() => {});
      }
      return;
    }

    const key = `${current.word}::${ans.toLowerCase()}`;
    try {
      let res: QuizJudgeResult;
      const cached = cache.current.get(key);
      if (cached) {
        res = await cached;
      } else {
        const local = quickLocalJudge(ans, current.meanings);
        res = local ?? (await callJudge(current.word, ans, current.meanings));
      }
      setResult(res);
      judgedRef.current(current, ans, res);
      if (res.correct) correctRef.current?.(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "判分失败，请稍后重试");
    }
  }, [current, answer, judge.isPending, isReverse, callJudge]);

  const next = useCallback(() => {
    if (index + 1 >= queue.length) {
      onFinish?.();
      return;
    }
    setIndex(index + 1);
    setAnswer("");
    setResult(null);
    setError("");
  }, [index, queue.length, onFinish]);

  useEffect(() => {
    if (index >= queue.length && queue.length > 0) setIndex(0);
  }, [index, queue.length]);

  if (!current) return null;

  const resultStyle = result
    ? result.correct
      ? { borderColor: "rgba(52,211,153,0.3)" }
      : { borderColor: "rgba(248,113,113,0.3)" }
    : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      {/* 顶部进度 */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-[0.2em] text-blue-200/70">
          {progressText}
        </span>
        {onExit && (
          <button
            onClick={onExit}
            className="text-xs tracking-wide text-white/35 transition-colors hover:text-white"
          >
            {exitText ?? "结束"}
          </button>
        )}
      </div>

      {/* 题目卡片（翻牌进入） */}
      <div
        key={current.id + index}
        className="glass-card flip-in relative overflow-hidden rounded-3xl px-6 py-14 text-center"
      >
        <div
          className="pointer-events-none absolute -top-20 left-1/2 h-40 w-80 -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(96,165,250,0.18), transparent)" }}
        />
        {isReverse ? (
          <div className="relative">
            {promptLoading && !promptText ? (
              <span className="flex items-center justify-center gap-2 text-sm tracking-wide text-white/40">
                <Loader2 className="h-4 w-4 animate-spin" /> AI 正在生成中文题干…
              </span>
            ) : (
              <span className="text-3xl font-medium leading-relaxed text-white sm:text-4xl">
                {promptText}
              </span>
            )}
          </div>
        ) : (
          <span className="word-display relative text-5xl sm:text-6xl">{current.word}</span>
        )}
        {!isReverse && current.meanings.length > 0 && (
          <span className="absolute bottom-3 right-4 flex items-center gap-1 font-mono text-[10px] tracking-widest text-blue-200/40">
            <Zap className="h-3 w-3" /> 词库释义·极速判定
          </span>
        )}
      </div>

      {/* 作答区 */}
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (result) next();
            else submit();
          }
        }}
        placeholder={
          isReverse
            ? "写出对应的英文单词……（回车提交，大小写不敏感）"
            : "在这里手写中文释义……（回车提交）"
        }
        rows={isReverse ? 1 : 3}
        disabled={!!result || (isReverse && !promptText)}
        className="glass-input w-full resize-none rounded-2xl p-4 tracking-wide disabled:opacity-60"
        autoFocus
      />

      {error && (
        <div className="glass-card result-in rounded-2xl border-red-400/25 p-4 text-sm tracking-wide text-red-200">
          {error}
        </div>
      )}

      {/* 判定结果（答对涟漪 / 答错抖动） */}
      {result && (
        <div
          className={`glass-card result-in rounded-2xl p-6 ${
            result.correct ? "ripple-correct" : "shake-wrong"
          }`}
          style={resultStyle}
        >
          <div className="flex items-center gap-2">
            {result.correct ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            ) : (
              <XCircle className="h-5 w-5 text-red-300" />
            )}
            <span
              className={`font-medium tracking-wide ${
                result.correct ? "text-emerald-200" : "text-red-200"
              }`}
            >
              {result.correct ? "回答正确" : "回答错误"}
            </span>
          </div>

          <div className="mt-4 text-sm leading-relaxed text-white/75">
            <span className="tracking-[0.06em] text-white/35">
              {isReverse ? "正确单词　" : "标准释义　"}
            </span>
            {isReverse ? (
              <span className="font-mono text-base text-white">{current.word}</span>
            ) : customMeanings.length > 0 ? (
              <span className="mt-1 block space-y-0.5">
                {customMeanings.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </span>
            ) : (
              result.standardMeaning
            )}
          </div>
          {/* 反向题且词库有释义时，顺带展示释义 */}
          {isReverse && customMeanings.length > 0 && (
            <p className="mt-1 text-sm text-white/55">{customMeanings.join("　")}</p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            <span className="tracking-[0.06em] text-white/35">评语　　</span>
            {result.comment}
          </p>
        </div>
      )}

      {/* 按钮 */}
      {!result ? (
        <button
          onClick={submit}
          disabled={!answer.trim() || judge.isPending || (isReverse && !promptText)}
          className="glow-btn min-h-[52px] w-full rounded-full text-sm font-medium tracking-[0.06em]"
        >
          {judge.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> 判分中…
            </>
          ) : (
            "提交答案"
          )}
        </button>
      ) : (
        <button
          onClick={next}
          className="glow-btn min-h-[52px] w-full rounded-full text-sm font-medium tracking-[0.06em]"
        >
          <RefreshCw className="h-4 w-4" />
          {index + 1 >= queue.length ? "查看结果" : "下一个单词"}
        </button>
      )}
    </div>
  );
}
