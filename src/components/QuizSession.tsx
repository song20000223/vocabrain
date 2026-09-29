import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatMeanings, type MeaningGroup } from "@/lib/store";

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
  /** 本轮要测的单词队列（已打乱/挑选好） */
  queue: QuizWord[];
  /** 每次判分后回调（由调用方决定记录错题/进度等） */
  onJudged: (word: QuizWord, answer: string, result: QuizJudgeResult) => void;
  /** 答对后回调（可选，错题复习用） */
  onCorrect?: (word: QuizWord) => void;
  /** 全部测完 */
  onFinish?: () => void;
  /** 顶部进度文案，如 "本轮进度 3 / 20" */
  progressText: string;
  /** 提前结束按钮文案 */
  exitText?: string;
  onExit?: () => void;
}

/**
 * 通用答题流程：显示单词 → 手写释义 → AI 判分 → 显示结果（优先用户自定义释义）→ 下一题。
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

  const current: QuizWord | undefined = queue[index];

  const submit = useCallback(async () => {
    if (!current || !answer.trim() || judge.isPending) return;
    setError("");
    try {
      const res = await judge.mutateAsync({
        word: current.word,
        answer: answer.trim(),
        meanings: current.meanings.length > 0 ? current.meanings : undefined,
      });
      setResult(res);
      judgedRef.current(current, answer.trim(), res);
      if (res.correct) correctRef.current?.(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "判分失败，请稍后重试");
    }
  }, [current, answer, judge]);

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

  // 队列变化时（如错题被移除）防御性修正
  useEffect(() => {
    if (index >= queue.length && queue.length > 0) setIndex(0);
  }, [index, queue.length]);

  if (!current) return null;

  const customMeanings = formatMeanings(current.meanings);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      {/* 顶部进度 */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-[0.2em] text-cyan-200/70">
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

      {/* 单词卡片 */}
      <div className="glass-card relative overflow-hidden rounded-3xl px-6 py-14 text-center">
        <div
          className="pointer-events-none absolute -top-20 left-1/2 h-40 w-80 -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.18), transparent)" }}
        />
        <span className="hero-title relative text-5xl tracking-tight sm:text-6xl">
          {current.word}
        </span>
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
        <div className="glass-card rounded-2xl border-red-400/25 p-4 text-sm tracking-wider text-red-200">
          {error}
        </div>
      )}

      {/* 判定结果 */}
      {result && (
        <div
          className="glass-card rounded-2xl p-6"
          style={{
            borderColor: result.correct ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)",
            boxShadow: result.correct
              ? "0 0 30px rgba(52,211,153,0.1), inset 0 1px 0 rgba(255,255,255,0.08)"
              : "0 0 30px rgba(248,113,113,0.1), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2">
            {result.correct ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            ) : (
              <XCircle className="h-5 w-5 text-red-300" />
            )}
            <span className={`font-medium tracking-wider ${result.correct ? "text-emerald-200" : "text-red-200"}`}>
              {result.correct ? "回答正确" : "回答错误"}
            </span>
          </div>

          {/* 标准答案：优先显示用户词库里的自定义释义（按词性分组） */}
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
              <Loader2 className="h-4 w-4 animate-spin" /> AI 判分中…
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
