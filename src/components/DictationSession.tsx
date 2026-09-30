import { useCallback, useEffect, useState } from "react";
import { Volume2, Turtle, CheckCircle2, XCircle, Flag } from "lucide-react";
import { formatMeanings } from "@/lib/store";
import { speak } from "@/lib/speak";
import { matchDictation } from "@/lib/quickJudge";
import SessionReview, { type ReviewItem } from "./SessionReview";
import { celebrateRain, type QuizWord } from "./QuizSession";

interface Props {
  queue: QuizWord[];
  /** 每题判分回调（对/错都会调；答错由父级负责进错题本） */
  onJudged: (word: QuizWord, answer: string, correct: boolean) => void;
  onFinish?: () => void;
  /** 「只重测错题」：把本轮答错的词重新组一轮 */
  onRetryWrong?: (wrongWords: QuizWord[]) => void;
  exitText?: string;
  onExit?: () => void;
}

/**
 * 听写模式：播放英文发音 → 手写中文义项。
 * 判定走 matchDictation（本地，忽略大小写/空格/标点，任一义项命中即过），不调 AI。
 */
export default function DictationSession({ queue, onJudged, onFinish, onRetryWrong, exitText, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"answer" | "result">("answer");
  const [lastCorrect, setLastCorrect] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  const current = queue[index];
  const total = queue.length;

  const play = useCallback(() => {
    if (current) speak(current.word);
  }, [current]);

  const playSlow = useCallback(() => {
    if (current) speak(current.word, "en-GB", { rate: 0.6 });
  }, [current]);

  // 每题自动播放一遍
  useEffect(() => {
    const t = window.setTimeout(play, 350);
    return () => window.clearTimeout(t);
  }, [play]);

  if (!current) {
    const correctCount = results.filter(Boolean).length;
    const acc = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="glass-card mx-auto flex max-w-xl flex-col items-center gap-5 rounded-3xl p-10 text-center">
        <p className="eyebrow">Dictation Complete</p>
        <h2 className="hero-title text-3xl">听写完成</h2>
        <p className="font-mono text-5xl tracking-wide text-blue-200">{acc}%</p>
        <p className="text-sm tracking-wide text-white/50">
          共 {total} 个 · 对 {correctCount} 个 · 错 {total - correctCount} 个（已进错题本）
        </p>
        {reviewItems.length > 0 && <SessionReview items={reviewItems} />}
        {onRetryWrong && results.some((r) => !r) && (
          <button
            onClick={() => onRetryWrong(queue.filter((_, i) => results[i] === false))}
            className="ghost-btn min-h-[44px] px-6 text-sm tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
          >
            只重测错题（{results.filter((r) => !r).length} 个）
          </button>
        )}
        <div className="flex gap-3">
          {onExit && (
            <button onClick={onExit} className="ghost-btn min-h-[44px] px-6 text-sm tracking-wide">
              返回
            </button>
          )}
          {onFinish && (
            <button onClick={onFinish} className="glow-btn min-h-[44px] rounded-full px-6 text-sm tracking-wide">
              完成
            </button>
          )}
        </div>
      </div>
    );
  }

  const submit = () => {
    if (!answer.trim()) return;
    const ok = matchDictation(answer, current.meanings);
    setLastCorrect(ok);
    setResults((r) => [...r, ok]);
    setReviewItems((arr) => [
      ...arr,
      {
        id: current.id,
        word: current.word,
        answer: answer.trim(),
        correct: ok,
        standardMeaning: current.meanings.flatMap((m) => m.definitions).join("；") || current.word,
      },
    ]);
    onJudged(current, answer.trim(), ok);
    setPhase("result");
  };

  const next = () => {
    if (index + 1 >= total) celebrateRain();
    setIndex(index + 1);
    setAnswer("");
    setPhase("answer");
  };

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-6"
      tabIndex={-1}
      ref={(el) => { if (phase === "result") el?.focus(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && phase === "result") {
          e.preventDefault();
          next();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs tracking-widest text-white/40">
          听写 {Math.min(index + 1, total)} / {total}
        </p>
        {onExit && (
          <button
            onClick={onExit}
            className="text-xs tracking-wide text-white/40 transition-colors hover:text-white"
          >
            {exitText ?? "退出听写"}
          </button>
        )}
      </div>

      {/* 播放区：不显示单词本身 */}
      <div className="glass-card flex flex-col items-center gap-4 rounded-3xl p-10">
        <div className="flex items-center gap-4">
          <button
            onClick={play}
            aria-label="重听发音"
            className="glow-btn flex h-16 w-16 items-center justify-center !rounded-full"
          >
            <Volume2 className="h-7 w-7" />
          </button>
          <button
            onClick={playSlow}
            aria-label="慢速重听"
            className="ghost-btn flex h-11 w-11 items-center justify-center !rounded-full text-white/60 hover:!border-blue-300/40 hover:!text-blue-200"
            title="慢速重听（0.6x）"
          >
            <Turtle className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs tracking-wide text-white/35">听发音，写出中文义项（任一义项命中即算对）</p>
      </div>

      {phase === "answer" ? (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submit())}
            placeholder="在这里写中文释义……（回车提交）"
            autoFocus
            rows={2}
            className="glass-input w-full resize-none rounded-2xl p-4 tracking-wide"
          />
          <button
            onClick={submit}
            disabled={!answer.trim()}
            className="glow-btn min-h-[48px] rounded-full text-sm tracking-wide"
          >
            提交答案
          </button>
        </>
      ) : (
        <div className="glass-card flex flex-col gap-4 rounded-2xl p-6">
          <p className="flex items-center gap-2 text-sm tracking-wide">
            {lastCorrect ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                <span className="text-emerald-200">正确</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-300" />
                <span className="text-red-200">不对，正确答案：</span>
              </>
            )}
          </p>
          <p className="font-mono text-xl tracking-wide text-white">{current.word}</p>
          <div className="space-y-0.5 text-sm tracking-wide text-white/60">
            {formatMeanings(current.meanings).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          {!lastCorrect && (
            <p className="text-xs tracking-wide text-white/35">
              你的答案：{answer}（已记入错题本 · 来源：听写）
            </p>
          )}
          <button onClick={next} className="glow-btn mt-2 min-h-[44px] rounded-full text-sm tracking-wide">
            <Flag className="h-4 w-4" /> {index + 1 >= total ? "查看结果" : "下一个"}
          </button>
        </div>
      )}
    </div>
  );
}
