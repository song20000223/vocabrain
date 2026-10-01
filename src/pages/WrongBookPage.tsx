import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Eraser, Play, Volume2, Search, Link2, StickyNote, X } from "lucide-react";
import QuizSession, { celebrateRain, type QuizJudgeResult, type QuizWord } from "@/components/QuizSession";
import WordRow from "@/components/WordRow";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useEscapeClose } from "@/lib/useEscapeClose";
import { useSlashFocus } from "@/lib/useSlashFocus";
import {
  getWrongBook,
  getWords,
  removeFromWrongBook,
  clearWrongBook,
  addToWrongBook,
  markCorrected,
  markTestedInRound,
  bumpWrongStreak,
  formatMeanings,
  type WrongItem,
} from "@/lib/store";
import { getMemosForWord } from "@/lib/memo";

interface ReviewSummary {
  corrected: number;
  stillWrong: number;
}

/** 把错题本的 WrongItem 补成 WordItem 形状（WordRow/详情弹窗的 🔗📝 需要完整字段） */
function toWordItem(it: WrongItem) {
  const full = getWords().find((w) => w.id === it.id);
  return (
    full ?? {
      id: it.id,
      word: it.word,
      meanings: it.meanings,
      type: it.entryType,
      bookId: "default",
      orderInBook: 0,
      mastered: false,
      testedRounds: 0,
      lastTestedAt: null,
      excluded: false,
      wrongStreak: 0,
    }
  );
}

export default function WrongBookPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WrongItem[]>([]);
  // 复习状态
  const [reviewQueue, setReviewQueue] = useState<QuizWord[] | null>(null);
  const [autoRemove, setAutoRemove] = useState(true); // 答对后自动移出
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  // 搜索 + 详情弹窗
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  // 轻提示（重测找不到词等）
  const [tip, setTip] = useState("");
  const showTip = (msg: string) => {
    setTip(msg);
    window.setTimeout(() => setTip(""), 3500);
  };
  const [clearConfirm, setClearConfirm] = useState(false);
  // 加载更多：首屏 30 条
  const [wrongLimit, setWrongLimit] = useState(30);
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);
  useEscapeClose(!!detailId, () => setDetailId(null));

  const refresh = () => setItems(getWrongBook());

  useEffect(() => {
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
  }, []);

  // 搜索实时过滤（单词 + 释义）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.word.toLowerCase().includes(q) ||
        it.meanings.some((m) => m.definitions.some((d) => d.toLowerCase().includes(q))),
    );
  }, [items, query]);

  const detail = detailId ? items.find((it) => it.id === detailId) ?? null : null;

  // ---------- 复习流程 ----------

  const startReview = () => {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    setReviewQueue(shuffled.map((it) => ({ id: it.id, word: it.word, meanings: it.meanings })));
    setSummary(null);
    setReviewedCount(0);
  };

  /** 复习答错时累加错误次数、更新全库进度 */
  const handleJudged = (word: QuizWord, answer: string, result: QuizJudgeResult) => {
    if (result.undecidable) return; // 无法判定：不计复习统计、不进错题本
    setReviewedCount((n) => n + 1);
    // 计入全库进度：错题对应词库里的单词（按单词文本匹配）
    const libWord = getWords().find((w) => w.word.toLowerCase() === word.word.toLowerCase());
    if (libWord) {
      markTestedInRound(libWord.id);
      bumpWrongStreak(libWord.id, result.correct);
    }

    if (!result.correct) {
      addToWrongBook(
        {
          id: word.id,
          word: word.word,
          type: "word" as const,
          meanings: word.meanings,
          bookId: "default",
          orderInBook: 0,
          mastered: false,
          testedRounds: 0,
          lastTestedAt: null,
          excluded: false,
          wrongStreak: 0,
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

  // ---------- 列表页 ----------

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Review</p>
          <h1 className="hero-title mt-3 text-4xl sm:text-5xl">错题本</h1>
          <p className="mt-3 text-sm tracking-wide text-white/40">
            共 {items.length} 个答错的单词 · 保存在本浏览器 localStorage
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setClearConfirm(true)}
            className="ghost-btn min-h-[44px] shrink-0 px-5 text-sm tracking-wide hover:!border-red-400/40 hover:!text-red-300"
          >
            <Eraser className="h-4 w-4" /> 清空
          </button>
        )}
      </div>

      {/* 复习完成总结 */}
      {summary && (
        <div className="glass-card rounded-2xl p-6" style={{ borderColor: "rgba(147,197,253,0.3)" }}>
          <p className="font-medium tracking-wide text-blue-100">本轮复习完成</p>
          <p className="mt-2 text-sm tracking-wide text-white/55">
            订正 <span className="text-emerald-300">{summary.corrected}</span> 题 ·
            仍未掌握 <span className="text-red-300">{summary.stillWrong}</span> 题
          </p>
          <button
            onClick={() => setSummary(null)}
            className="ghost-btn mt-4 min-h-[40px] px-5 text-xs tracking-wide"
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
              <h2 className="font-semibold tracking-wide text-white">复习错题</h2>
              <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm tracking-wide text-white/45">
                <input
                  type="checkbox"
                  checked={autoRemove}
                  onChange={(e) => setAutoRemove(e.target.checked)}
                  className="h-4 w-4 accent-blue-300"
                />
                答对后自动移出错题本（不勾选则保留并标记「已订正」）
              </label>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <button
                onClick={startReview}
                className="glow-btn min-h-[48px] rounded-full px-8 text-sm tracking-[0.06em]"
              >
                <Play className="h-4 w-4" /> 开始复习错题
              </button>
              <button
                onClick={() => navigate("/test?mode=dictation&source=wrong")}
                className="ghost-btn min-h-[48px] rounded-full px-6 text-sm tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
              >
                <Volume2 className="h-4 w-4" /> 听写错题
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 搜索框 */}
      {items.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索单词或释义…（按 / 快速聚焦）"
            aria-label="搜索错题"
            className="glass-input min-h-[44px] w-full rounded-full pl-11 pr-10 text-sm tracking-wide transition-shadow focus:shadow-[0_0_0_3px_rgba(147,197,253,0.15)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              className="absolute right-2 top-1/2 flex min-h-[36px] min-w-[36px] -translate-y-1/2 items-center justify-center rounded-full text-white/30 hover:text-white/70"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* 错题网格 */}
      {items.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center tracking-wide">
          <p className="text-white/40">暂无错题，去测试吧。</p>
          <p className="mt-2 text-xs text-white/25">雨落无痕，全对的日子也值得记住。</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center tracking-wide text-white/40">
          没有匹配「{query}」的错题。
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.slice(0, wrongLimit).map((it) => {
            const word = toWordItem(it);
            const memoCount = getMemosForWord(it.id).length;
            return (
              <li key={it.id}>
                <button
                  onClick={() => setDetailId(it.id)}
                  className="glass-card relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-2xl p-4 text-left transition-colors duration-300 hover:border-red-300/30"
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
                  <div className="flex items-center gap-2 pl-1.5">
                    {/* 状态点：红=未订正，绿=已订正 */}
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        it.corrected ? "bg-emerald-300" : "bg-red-400"
                      }`}
                      title={it.corrected ? "已订正" : "未订正"}
                    />
                    <span className="truncate font-mono text-base tracking-wide text-white">
                      {it.word}
                    </span>
                  </div>
                  <p className="truncate pl-4 text-xs tracking-wide text-white/50">
                    {formatMeanings(it.meanings).join(" · ") || "（暂无释义）"}
                  </p>
                  {/* 🔗/📝 槽位预览（点开卡片详情里可交互） */}
                  <div className="mt-auto flex items-center gap-1 pl-2.5 pt-1">
                    <Link2
                      className={`h-3.5 w-3.5 ${word.familyKey ? "text-blue-300/80" : "text-white/12"}`}
                    />
                    <StickyNote
                      className={`h-3.5 w-3.5 ${memoCount > 0 ? "text-amber-200/80" : "text-white/12"}`}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > wrongLimit && (
        <button
          onClick={() => setWrongLimit((n) => n + 30)}
          className="ghost-btn mx-auto mt-2 flex min-h-[40px] px-6 text-xs tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
        >
          加载更多（还有 {filtered.length - wrongLimit} 条）
        </button>
      )}

      {/* 轻提示 */}
      {tip && (
        <div className="fixed bottom-6 left-1/2 z-[230] -translate-x-1/2 rounded-full border border-white/12 bg-[#12161d] px-5 py-3 text-sm tracking-wide text-white/70 shadow-xl">
          {tip}
        </div>
      )}

      {/* 清空确认 */}
      {clearConfirm && (
        <ConfirmDialog
          title="清空错题本？"
          desc={`共 ${items.length} 条错题记录将全部删除，不影响词库里的单词。`}
          confirmText="清空"
          danger
          onConfirm={() => {
            clearWrongBook();
            refresh();
            setClearConfirm(false);
          }}
          onCancel={() => setClearConfirm(false)}
        />
      )}

      {/* 详情弹窗 */}
      {detail && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDetailId(null)}
        >
          <div
            className="glass-card flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-2xl tracking-wide text-white">{detail.word}</span>
                  <span className="rounded-full border border-red-400/25 px-2 py-0.5 text-[10px] tracking-wide text-red-300/80">
                    已错 {detail.wrongCount} 次
                  </span>
                  {detail.corrected && (
                    <span className="rounded-full border border-emerald-400/25 px-2 py-0.5 text-[10px] tracking-wide text-emerald-300/80">
                      已订正
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-0.5 text-sm tracking-wide text-blue-200/80">
                  {formatMeanings(detail.meanings).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setDetailId(null)}
                aria-label="关闭"
                className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-full text-white/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-1.5 overflow-y-auto text-sm tracking-wide">
              <p className="text-white/35">
                你的答案　<span className="text-red-300/85">{detail.yourAnswer}</span>
              </p>
              <p className="text-white/35">
                {detail.source === "dictation" ? "听写评语" : "AI 评语"}　
                <span className="text-white/70">{detail.comment}</span>
              </p>
              <p className="font-mono text-[11px] text-white/25">
                {new Date(detail.wrongAt).toLocaleString("zh-CN")}
              </p>
            </div>

            {/* 🔗/📝 复用 WordRow 紧凑模式（单词+释义+词族/笔记槽位可交互） */}
            <div className="mt-4">
              <WordRow
                it={toWordItem(detail)}
                onChanged={refresh}
                compact
                onEdit={() => setDetailId(null)}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  // 错题 id 与词库 id 是两套体系（旧数据错题 id 为独立 uid），
                  // 按 word 文本查词库（多词性组取第一个匹配），查不到说明词已彻底删除
                  const target = getWords().find(
                    (w) => w.word.toLowerCase() === detail.word.toLowerCase(),
                  );
                  if (!target) {
                    showTip("该词已不在词库");
                    return;
                  }
                  navigate(`/test?ids=${encodeURIComponent(target.id)}`);
                }}
                aria-label={`重测 ${detail.word}`}
                className="glow-btn flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full text-sm tracking-wide"
              >
                <Play className="h-4 w-4" /> 重测此词
              </button>
              <button
                onClick={() => {
                  removeFromWrongBook(detail.id);
                  setDetailId(null);
                  refresh();
                }}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border border-red-300/25 text-sm tracking-wide text-red-200/80 transition-colors hover:border-red-300/50 hover:text-red-200"
              >
                <Trash2 className="h-4 w-4" /> 删除此错题
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
