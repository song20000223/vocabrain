import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Zap } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatMeanings, type MeaningGroup } from "@/lib/store";
import { quickLocalJudge, type PrefetchedResult } from "@/lib/quickJudge";

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

interface Props {
  queue: QuizWord[];
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
  void el.offsetWidth; // 重置动画
  el.classList.add("rain-celebrate");
}

/**
 * 通用答题流程：显示单词 → 手写释义 → 判分 → 结果 → 下一题。
 *
 * 速度优化：
 *  - 词库有自定义释义的，提交瞬间本地判定（毫秒级，不调 AI）；
 *  - 判不了的，从你打开这题起就在后台预取 AI 判分，提交时多数已就绪。
 */
export default function QuizSession({
  queue,
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

  const judgedRef = useRef(onJudged);
  judgedRef.current = onJudged;
  const correctRef = useRef(onCorrect);
  correctRef.current = onCorrect;

  // 预取缓存：key = `${word}::${answer}` → Promise<结果>
  const cache = useRef(new Map<string, Promise<PrefetchedResult>>());
  const client = trpc.useUtils().client;

  const current: QuizWord | undefined = queue[index];
  const customMeanings = useMemo(
    () => (current ? formatMeanings(current.meanings) : []),
    [current],
  );

  const callJudge = useCallback(
    (word: string, ans: string, meanings: MeaningGroup[]) =>
      client.judge.mutate({
        word,
        answer: ans,
        meanings: meanings.length > 0 ? meanings : undefined,
      }),
    [client],
  );

  /** 后台预取：本地能判就不发请求；否则缓存一个 Promise */
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
        cache.current.delete(key); // 预取失败则移除，提交时重试
        throw e;
      });
      cache.current.set(key, p);
      p.catch(() => {}); // 避免未处理的 rejection
    },
    [callJudge],
  );

  const submit = useCallback(async () => {
    if (!current || !answer.trim() || judge.isPending) return;
    setError("");
    const ans = answer.trim();
    const key = `${current.word}::${ans.toLowerCase()}`;
    try {
      let res: QuizJudgeResult;
      const cached = cache.current.get(key);
      if (cached) {
        res = await cached; // 命中预取（本地或后台 AI），几乎即时
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
  }, [current, answer, judge.isPending, callJudge]);

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

  // 答案输入变化时（停顿 400ms 后）后台预取
  useEffect(() => {
    if (!current || result) return;
    const t = window.setTimeout(() => prefetch(current, answer), 400);
    return () => window.clearTimeout(t);
  }, [answer, current, result, prefetch]);

  // 进入新一题时，对本地可判的词不做任何事；队列变化防御
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
            className="text-xs tracking-wider text-white/35 transition-colors hover:text-white"
          >
            {exitText ?? "结束"}
          </button>
        )}
      </div>

      {/* 单词卡片（翻牌进入） */}
      <div
        key={current.id + index}
        className="glass-card flip-in relative overflow-hidden rounded-3xl px-6 py-14 text-center"
      >
        <div
          className="pointer-events-none absolute -top-20 left-1/2 h-40 w-80 -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(96,165,250,0.18), transparent)" }}
        />
        <span className="hero-title relative text-5xl tracking-tight sm:text-6xl">
          {current.word}
        </span>
        {current.meanings.length > 0 && (
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
        placeholder="在这里手写中文释义……（回车提交）"
        rows={3}
        disabled={!!result}
        className="glass-input w-full resize-none rounded-2xl p-4 tracking-wider disabled:opacity-60"
        autoFocus
      />

      {error && (
        <div className="glass-card result-in rounded-2xl border-red-400/25 p-4 text-sm tracking-wider text-red-200">
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
              className={`font-medium tracking-wider ${
                result.correct ? "text-emerald-200" : "text-red-200"
              }`}
            >
              {result.correct ? "回答正确" : "回答错误"}
            </span>
          </div>

          <div className="mt-4 text-sm leading-relaxed text-white/75">
            <span className="tracking-[0.2em] text-white/35">标准释义　</span>
            {customMeanings.length > 0 ? (
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
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            <span className="tracking-[0.2em] text-white/35">评语　　</span>
            {result.comment}
          </p>
        </div>
      )}

      {/* 按钮 */}
      {!result ? (
        <button
          onClick={submit}
          disabled={!answer.trim() || judge.isPending}
          className="glow-btn min-h-[52px] w-full rounded-full text-sm font-medium tracking-[0.2em]"
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
          className="glow-btn min-h-[52px] w-full rounded-full text-sm font-medium tracking-[0.2em]"
        >
          <RefreshCw className="h-4 w-4" />
          {index + 1 >= queue.length ? "查看结果" : "下一个单词"}
        </button>
      )}
    </div>
  );
}
