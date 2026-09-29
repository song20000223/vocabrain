import { useEffect, useMemo, useState } from "react";
import { Trash2, Eraser, Play } from "lucide-react";
import QuizSession, { celebrateRain, type QuizJudgeResult, type QuizWord } from "@/components/QuizSession";
import {
  getWrongBook,
  getWords,
  removeFromWrongBook,
  clearWrongBook,
  addToWrongBook,
  markCorrected,
  markTestedInRound,
  formatMeanings,
  type WrongItem,
} from "@/lib/store";

interface ReviewSummary {
  corrected: number;
  stillWrong: number;
}

export default function WrongBookPage() {
  const [items, setItems] = useState<WrongItem[]>([]);
  // 复习状态
  const [reviewQueue, setReviewQueue] = useState<QuizWord[] | null>(null);
  const [autoRemove, setAutoRemove] = useState(true); // 答对后自动移出
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);

  const refresh = () => setItems(getWrongBook());

  useEffect(() => {
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
  }, []);

  const summaryStats = useMemo(() => summary, [summary]);

  // ---------- 复习流程 ----------

  const startReview = () => {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    setReviewQueue(shuffled.map((it) => ({ id: it.id, word: it.word, meanings: it.meanings })));
    setSummary(null);
    setReviewedCount(0);
  };

  /** 复习答错时累加错误次数、更新全库进度 */
  const handleJudged = (word: QuizWord, answer: string, result: QuizJudgeResult) => {
    setReviewedCount((n) => n + 1);
    // 计入全库进度：错题对应词库里的单词（按单词文本匹配）
    const libWord = getWords().find((w) => w.word.toLowerCase() === word.word.toLowerCase());
    if (libWord) markTestedInRound(libWord.id);

    if (!result.correct) {
      addToWrongBook(
        {
          id: word.id,
          word: word.word,
          meanings: word.meanings,
          testedRounds: 0,
          lastTestedAt: null,
          excluded: false,
        },
        answer,
        result.comment,
      );
      setSummary((s) => ({ corrected: s?.corrected ?? 0, stillWrong: (s?.stillWrong ?? 0) + 1 }));
    }
  };

  /** 复习答对：自动移出 或 标记已订正 */
  const handleCorrect = (word: QuizWord) => {
    if (autoRemove) removeFromWrongBook(word.id);
    else markCorrected(word.id);
    setSummary((s) => ({ corrected: (s?.corrected ?? 0) + 1, stillWrong: s?.stillWrong ?? 0 }));
  };

  // ---------- 复习中 ----------

  if (reviewQueue) {
    return (
      <QuizSession
        queue={reviewQueue}
        progressText={`复习进度 ${Math.min(reviewedCount + 1, reviewQueue.length)} / ${reviewQueue.length}`}
        exitText="结束复习"
        onExit={() => {
          setReviewQueue(null);
          refresh();
        }}
        onJudged={handleJudged}
        onCorrect={handleCorrect}
        onFinish={() => {
          celebrateRain();
          setReviewQueue(null);
          refresh();
        }}
      />
    );
  }

  // ---------- 复习完成总结 ----------

  if (summaryStats && items !== null && reviewedCount > 0 && reviewQueue === null && summary !== null) {
    // 总结展示后由按钮关闭
  }

  // ---------- 列表页 ----------

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Review</p>
          <h1 className="hero-title mt-3 text-4xl sm:text-5xl">错题本</h1>
          <p className="mt-3 text-sm tracking-wider text-white/40">
            共 {items.length} 个答错的单词 · 保存在本浏览器 localStorage
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm("确定清空错题本吗？")) {
                clearWrongBook();
                refresh();
              }
            }}
            className="ghost-btn min-h-[44px] shrink-0 px-5 text-sm tracking-wider hover:!border-red-400/40 hover:!text-red-300"
          >
            <Eraser className="h-4 w-4" /> 清空
          </button>
        )}
      </div>

      {/* 复习完成总结 */}
      {summary && (
        <div className="glass-card rounded-2xl p-6" style={{ borderColor: "rgba(147,197,253,0.3)" }}>
          <p className="font-medium tracking-wider text-blue-100">本轮复习完成</p>
          <p className="mt-2 text-sm tracking-wider text-white/55">
            订正 <span className="text-emerald-300">{summary.corrected}</span> 题 ·
            仍未掌握 <span className="text-red-300">{summary.stillWrong}</span> 题
          </p>
          <button
            onClick={() => setSummary(null)}
            className="ghost-btn mt-4 min-h-[40px] px-5 text-xs tracking-wider"
          >
            知道了
          </button>
        </div>
      )}

      {/* 开始复习 */}
      {items.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold tracking-wider text-white">复习错题</h2>
              <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm tracking-wider text-white/45">
                <input
                  type="checkbox"
                  checked={autoRemove}
                  onChange={(e) => setAutoRemove(e.target.checked)}
                  className="h-4 w-4 accent-blue-300"
                />
                答对后自动移出错题本（不勾选则保留并标记「已订正」）
              </label>
            </div>
            <button
              onClick={startReview}
              className="glow-btn min-h-[48px] shrink-0 rounded-full px-8 text-sm tracking-[0.2em]"
            >
              <Play className="h-4 w-4" /> 开始复习错题
            </button>
          </div>
        </div>
      )}

      {/* 错题列表 */}
      {items.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center tracking-wider text-white/40">
          暂无错题，去测试页练练手吧。
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((it) => (
            <li
              key={it.id}
              className="glass-card relative overflow-hidden rounded-2xl p-5 sm:p-6"
            >
              {/* 错误热度条：错得越多越亮 */}
              {it.wrongCount >= 2 && (
                <span
                  className="absolute left-0 top-0 h-full w-[3px]"
                  style={{
                    background: `linear-gradient(180deg, rgba(248,113,113,${Math.min(0.25 + it.wrongCount * 0.15, 0.9)}), transparent)`,
                    boxShadow: `0 0 ${4 + it.wrongCount * 2}px rgba(248,113,113,${Math.min(0.2 + it.wrongCount * 0.1, 0.6)})`,
                  }}
                />
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xl tracking-wide text-white">{it.word}</span>
                    <span className="rounded-full border border-red-400/25 px-2 py-0.5 text-[10px] tracking-wider text-red-300/80">
                      错 {it.wrongCount} 次
                    </span>
                    {it.corrected && (
                      <span className="rounded-full border border-emerald-400/25 px-2 py-0.5 text-[10px] tracking-wider text-emerald-300/80">
                        已订正
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-0.5 text-sm tracking-wider text-blue-200/80">
                    {formatMeanings(it.meanings).map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    removeFromWrongBook(it.id);
                    refresh();
                  }}
                  aria-label="移出错题本"
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-white/30 transition-colors duration-300 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 space-y-1.5 text-sm tracking-wider">
                <p className="text-white/35">
                  你的答案　<span className="text-red-300/85">{it.yourAnswer}</span>
                </p>
                <p className="text-white/35">
                  AI 评语　<span className="text-white/70">{it.comment}</span>
                </p>
                <p className="font-mono text-[11px] text-white/25">
                  {new Date(it.wrongAt).toLocaleString("zh-CN")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
