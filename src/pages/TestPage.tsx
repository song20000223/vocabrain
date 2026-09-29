import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, RefreshCw, SkipForward } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { getWords, addToWrongBook, type WordItem } from "@/lib/store";

interface JudgeResult {
  correct: boolean;
  standardMeaning: string;
  comment: string;
}

export default function TestPage() {
  const [current, setCurrent] = useState<WordItem | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);

  const judge = trpc.judge.useMutation();

  const nextWord = useCallback(() => {
    const words = getWords();
    if (words.length === 0) {
      setEmpty(true);
      setCurrent(null);
      return;
    }
    setEmpty(false);
    const pool = words.filter((w) => w.id !== current?.id);
    const list = pool.length > 0 ? pool : words;
    setCurrent(list[Math.floor(Math.random() * list.length)]);
    setAnswer("");
    setResult(null);
    setError("");
  }, [current?.id]);

  useEffect(() => {
    nextWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!current || !answer.trim() || judge.isPending) return;
    setError("");
    try {
      const res = await judge.mutateAsync({ word: current.word, answer: answer.trim() });
      setResult(res);
      if (!res.correct) {
        addToWrongBook(current, answer.trim(), res.comment);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "判分失败，请稍后重试");
    }
  };

  if (empty) {
    return (
      <div className="flex flex-col items-center gap-5 pt-24 text-center">
        <p className="tracking-wider text-white/45">词库是空的，先去添加一些单词吧。</p>
        <Link to="/words" className="glow-btn min-h-[44px] rounded-full px-8 text-sm tracking-wider">
          去添加单词
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <p className="eyebrow text-center">Write the Chinese meaning</p>

      {/* 单词卡片 */}
      <div className="glass-card relative overflow-hidden rounded-3xl px-6 py-16 text-center">
        <div
          className="pointer-events-none absolute -top-20 left-1/2 h-40 w-80 -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(34,211,238,0.18), transparent)" }}
        />
        <span className="hero-title relative text-5xl tracking-tight sm:text-6xl">
          {current?.word}
        </span>
      </div>

      {/* 作答区 */}
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (result) nextWord();
            else submit();
          }
        }}
        placeholder="在这里手写中文释义……（回车提交）"
        rows={3}
        disabled={!!result}
        className="glass-input w-full resize-none rounded-2xl p-4 tracking-wider disabled:opacity-60"
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
            borderColor: result.correct
              ? "rgba(52,211,153,0.3)"
              : "rgba(248,113,113,0.3)",
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
            <span
              className={`font-medium tracking-wider ${
                result.correct ? "text-emerald-200" : "text-red-200"
              }`}
            >
              {result.correct ? "回答正确" : "回答错误（已加入错题本）"}
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/75">
            <span className="tracking-[0.2em] text-white/35">标准释义　</span>
            {result.standardMeaning}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            <span className="tracking-[0.2em] text-white/35">评语　　</span>
            {result.comment}
          </p>
        </div>
      )}

      {/* 按钮 */}
      <div className="flex gap-3">
        {!result ? (
          <>
            <button
              onClick={submit}
              disabled={!answer.trim() || judge.isPending}
              className="glow-btn min-h-[52px] flex-1 rounded-full text-sm font-medium tracking-[0.2em]"
            >
              {judge.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> AI 判分中…
                </>
              ) : (
                "提交答案"
              )}
            </button>
            <button
              onClick={nextWord}
              className="ghost-btn min-h-[52px] px-6 text-sm tracking-wider"
            >
              <SkipForward className="h-4 w-4" /> 换一个
            </button>
          </>
        ) : (
          <button
            onClick={nextWord}
            className="glow-btn min-h-[52px] flex-1 rounded-full text-sm font-medium tracking-[0.2em]"
          >
            <RefreshCw className="h-4 w-4" /> 下一个单词
          </button>
        )}
      </div>
    </div>
  );
}
