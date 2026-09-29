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
      <div className="flex flex-col items-center gap-4 pt-20 text-center">
        <p className="text-[#9a9a9a]">词库是空的，先去添加一些单词吧。</p>
        <Link
          to="/words"
          className="min-h-[44px] rounded-full border border-amber-200/40 bg-amber-200/10 px-6 py-2.5 font-mono text-sm text-amber-100"
        >
          去添加单词
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 pt-4 sm:pt-10">
      <p className="text-center font-mono text-xs uppercase tracking-[0.3em] text-amber-200/70">
        写出这个单词的中文释义
      </p>

      {/* 单词卡片 */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
        <span className="font-serif text-4xl text-white sm:text-5xl">{current?.word}</span>
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
        className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white placeholder:text-[#666] focus:border-amber-200/50 focus:outline-none disabled:opacity-60"
      />

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* 判定结果 */}
      {result && (
        <div
          className={`rounded-xl border p-5 ${
            result.correct
              ? "border-emerald-400/30 bg-emerald-400/10"
              : "border-red-400/30 bg-red-400/10"
          }`}
        >
          <div className="flex items-center gap-2">
            {result.correct ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            ) : (
              <XCircle className="h-5 w-5 text-red-300" />
            )}
            <span className={`font-medium ${result.correct ? "text-emerald-200" : "text-red-200"}`}>
              {result.correct ? "回答正确" : "回答错误（已加入错题本）"}
            </span>
          </div>
          <p className="mt-3 text-sm text-[#dadada]">
            <span className="text-[#9a9a9a]">标准释义：</span>
            {result.standardMeaning}
          </p>
          <p className="mt-1 text-sm text-[#dadada]">
            <span className="text-[#9a9a9a]">评语：</span>
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
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-amber-200/90 font-mono text-sm font-medium text-black transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
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
              className="flex min-h-[48px] items-center gap-2 rounded-full border border-white/15 px-6 font-mono text-sm text-[#9a9a9a] transition-colors hover:text-white"
            >
              <SkipForward className="h-4 w-4" /> 换一个
            </button>
          </>
        ) : (
          <button
            onClick={nextWord}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-amber-200/90 font-mono text-sm font-medium text-black transition-colors hover:bg-amber-100"
          >
            <RefreshCw className="h-4 w-4" /> 下一个单词
          </button>
        )}
      </div>
    </div>
  );
}
