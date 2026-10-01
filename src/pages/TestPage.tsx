import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useEscapeClose } from "@/lib/useEscapeClose";
import {
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  BookOpen,
  CornerDownRight,
  Volume2,
  X,
} from "lucide-react";
import QuizSession, {
  celebrateRain,
  type QuizJudgeResult,
  type QuizWord,
} from "@/components/QuizSession";
import DictationSession from "@/components/DictationSession";
import ExportDialog from "@/components/ExportDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import CountWheel from "@/components/CountWheel";
import SessionReview, { type ReviewItem } from "@/components/SessionReview";
import {
  getWords,
  getBooks,
  getChapters,
  getWrongBook,
  isChapter,
  addToWrongBook,
  markTestedInRound,
  bumpWrongStreak,
  roundStats,
  resetProgress,
  selectWords,
  getWordsByIds,
  formatMeanings,
  type WordItem,
  type BookItem,
  type Direction,
  type EntryType,
  type SelectionCriteria,
} from "@/lib/store";

const SKIP_PREVIEW_KEY = "vocab_skip_preview";
const OPTIONS_KEY = "vocab_test_options";

interface SavedOptions {
  excludeTested: boolean;
  excludeMastered: boolean;
  preferWrong: boolean;
  familyMode: boolean;
  ordered: boolean;
  typeFilter: EntryType | "all";
  bookId: string;
  count: number;
}

function loadOptions(): SavedOptions | null {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    return raw ? (JSON.parse(raw) as SavedOptions) : null;
  } catch {
    return null;
  }
}

export default function TestPage() {
  const [words, setWords] = useState<WordItem[]>([]);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [stats, setStats] = useState(() => roundStats("en2zh"));
  // 轮次庆功浮层
  const [roundFlash, setRoundFlash] = useState<number | null>(null);

  // ---------- 条件面板 ----------
  const [direction, setDirection] = useState<Direction>("en2zh");
  const saved = useMemo(loadOptions, []);
  const [bookId, setBookId] = useState<string>(saved?.bookId ?? "all");
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">(saved?.typeFilter ?? "all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [count, setCount] = useState(Math.max(5, saved?.count ?? 10));
  const [ordered, setOrdered] = useState(saved?.ordered ?? true);
  const [excludeTested, setExcludeTested] = useState(saved?.excludeTested ?? true);
  const [excludeMastered, setExcludeMastered] = useState(saved?.excludeMastered ?? false);
  const [preferWrong, setPreferWrong] = useState(saved?.preferWrong ?? false);
  const [familyMode, setFamilyMode] = useState(saved?.familyMode ?? false);

  // 条件选项持久化（词书/类型/顺序/排除项）
  useEffect(() => {
    const o: SavedOptions = { excludeTested, excludeMastered, preferWrong, familyMode, ordered, typeFilter, bookId, count };
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  }, [excludeTested, excludeMastered, preferWrong, familyMode, ordered, typeFilter, bookId, count]);
  // 预览：跳过预览的选择持久化
  const [skipPreview, setSkipPreview] = useState(
    () => localStorage.getItem(SKIP_PREVIEW_KEY) === "1",
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  // 章节弹层：当前为哪本词书选章节
  const [chapterPickerFor, setChapterPickerFor] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  // 发音设置弹层
  const [voiceOpen, setVoiceOpen] = useState(false);
  useEscapeClose(!!chapterPickerFor, () => setChapterPickerFor(null));
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{
    matched: number;
    rangeIgnored: boolean;
    expanded?: number;
  } | null>(null);

  // 从单词页手动勾选 / 错题本带过来的快照：?ids=a,b,c → 直接开考；mode=dictation → 听写；source=wrong → 错题队列
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"quiz" | "dictation">(
    searchParams.get("mode") === "dictation" ? "dictation" : "quiz",
  );
  const [dictQueue, setDictQueue] = useState<QuizWord[] | null>(null);
  // 最近一次完成会话的 id 快照（测试结果导出用）
  const [lastSessionIds, setLastSessionIds] = useState<string[] | null>(null);
  const [lastReview, setLastReview] = useState<ReviewItem[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  useEffect(() => {
    const isDict = searchParams.get("mode") === "dictation";
    if (searchParams.get("source") === "wrong") {
      const items = getWrongBook();
      if (items.length > 0) {
        const q = items.map((it) => ({ id: it.id, word: it.word, meanings: it.meanings }));
        if (isDict) setDictQueue(q);
        else setQueue(q);
      }
      return;
    }
    const ids = searchParams.get("ids");
    if (!ids) return;
    const list = ids.split(",").filter(Boolean);
    const picked = getWordsByIds(list);
    if (picked.length > 0) {
      if (isDict) setDictQueue(picked);
      else setQueue(picked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 测试进行状态
  const [queue, setQueue] = useState<QuizWord[] | null>(null);

  /** 「只重测错题」：从回顾里抽出答错项，直接开新一轮（不改错题本） */
  const retryWrongFromReview = () => {
    if (!lastReview) return;
    const wrongIds = lastReview.filter((i) => !i.correct && i.id).map((i) => i.id!);
    if (wrongIds.length === 0) return;
    startWithIds(wrongIds); // 新一轮结束后 onReview 会重新填充回顾区
  };

  const refresh = () => {
    setWords(getWords());
    setBooks(getBooks());
    setStats(roundStats(direction));
  };
  useEffect(() => {
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const testableCount = useMemo(() => words.filter((w) => !w.excluded).length, [words]);

  // 选中的词书节点信息
  const selectedBook = books.find((b) => b.id === bookId) ?? null;
  const isParentSelected = !!selectedBook && !isChapter(selectedBook);
  // 词书层（顶层）列表，用于树形选择器
  const rootBooks = books.filter((b) => b.parentId === null);

  const buildCriteria = (): SelectionCriteria => ({
    bookId,
    type: typeFilter,
    rangeStart: rangeStart.trim() ? parseInt(rangeStart, 10) : undefined,
    rangeEnd: rangeEnd.trim() ? parseInt(rangeEnd, 10) : undefined,
    excludeTested,
    excludeMastered,
    preferWrong,
    familyMode: familyMode ? "expand" : "off",
    count,
    order: ordered ? "sequential" : "random",
  });

  // ---------- 抽选 + 预览 ----------

  const doSelect = () => {
    const r = selectWords(buildCriteria());
    return r;
  };

  const startWithIds = (ids: string[]) => {
    const picked = getWordsByIds(ids);
    if (picked.length === 0) return;
    if (mode === "dictation") setDictQueue(picked);
    else setQueue(picked);
    setPreviewIds(null);
    setPreviewOpen(false);
  };

  /** 听写判分：更新错词连错计数；答错进错题本（source="dictation"），不计入测验轮次进度 */
  const handleDictJudged = (word: QuizWord, answer: string, correct: boolean) => {
    bumpWrongStreak(word.id, correct);
    if (correct) return;
    const full = words.find((w) => w.id === word.id);
    addToWrongBook(
      full ?? {
        ...word,
        type: "word" as const,
        bookId: "default",
        orderInBook: 0,
        mastered: false,
        testedRounds: 0,
        lastTestedAt: null,
        excluded: false,
        wrongStreak: 0,
      },
      answer,
      "听写错误",
      "dictation",
    );
  };

  const handleStart = () => {
    const r = doSelect();
    // matchedCount = 0：显示空态预览，不允许开始
    setPreviewIds(r.entryIds);
    setPreviewMeta({ matched: r.matchedCount, rangeIgnored: r.rangeIgnored, expanded: r.expandedCount });
    setPreviewOpen(r.matchedCount > 0 && r.entryIds.length <= 30 ? false : false);
    if (r.entryIds.length === 0) return;
    if (skipPreview) {
      startWithIds(r.entryIds);
      return;
    }
  };

  // ---------- 范围校验 ----------
  const rangeError = useMemo(() => {
    if (isParentSelected && bookId !== "all") return null; // 置灰时另有提示
    const rawS = rangeStart.trim();
    const rawE = rangeEnd.trim();
    if ((rawS && !/^\d+$/.test(rawS)) || (rawE && !/^\d+$/.test(rawE)))
      return "范围请输入正整数序号";
    const s = rawS ? parseInt(rawS, 10) : null;
    const e = rawE ? parseInt(rawE, 10) : null;
    if (s !== null && e !== null && s > e) return "起始序号不能大于结束序号";
    // 超出该书最大序号时提示（仅叶子/单书时校验）
    if (bookId !== "all" && !isParentSelected) {
      const max = words.reduce((m, w) => (w.bookId === bookId ? Math.max(m, w.orderInBook) : m), 0);
      if (s !== null && s > max) return `该章节共 ${max} 个，起始序号超出范围`;
    }
    return null;
  }, [rangeStart, rangeEnd, bookId, isParentSelected, words]);

  const toggleSkipPreview = () => {
    setSkipPreview((v) => {
      localStorage.setItem(SKIP_PREVIEW_KEY, v ? "0" : "1");
      return !v;
    });
  };

  // ---------- 判分回调 ----------

  const handleJudged = (word: QuizWord, answer: string, result: QuizJudgeResult) => {
    if (result.undecidable) return; // 无法判定：不计轮次、不进错题本
    markTestedInRound(word.id, direction);
    bumpWrongStreak(word.id, result.correct);
    if (!result.correct) {
      const full = words.find((w) => w.id === word.id);
      addToWrongBook(
        full ?? {
          ...word,
          type: "word" as const,
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
    }
  };

  // ---------- 摘要文案 ----------

  const criteriaSummary = () => {
    const parts: string[] = [];
    parts.push(bookId === "all" ? "全部词书" : (selectedBook?.name ?? "全部词书"));
    if (isParentSelected) parts.push("含全部章节");
    if (!isParentSelected && (rangeStart.trim() || rangeEnd.trim())) {
      parts.push(`范围 ${rangeStart.trim() || 1}–${rangeEnd.trim() || "∞"}`);
    }
    if (typeFilter !== "all") parts.push(typeFilter === "word" ? "仅单词" : "仅词组");
    parts.push(ordered ? "顺序" : "随机");
    parts.push(`${count} 个`);
    return parts.join(" · ");
  };

  // ---------- 测试进行 ----------

  if (dictQueue) {
    return (
      <DictationSession
        queue={dictQueue}
        onJudged={handleDictJudged}
        onRetryWrong={(ws) => setDictQueue(ws)}
        exitText="退出听写"
        onExit={() => setDictQueue(null)}
        onFinish={() => {
          setLastSessionIds(dictQueue.map((w) => w.id));
          setDictQueue(null);
        }}
      />
    );
  }

  if (queue) {
    return (
      <QuizSession
        queue={queue}
        direction={direction}
        progressText={`第 ${stats.round} 轮 · 已测 ${stats.tested} / ${stats.total}`}
        exitText="退出测试"
        onExit={() => setQueue(null)}
        onJudged={handleJudged}
        onReview={setLastReview}
        onFinish={() => {
          celebrateRain();
          setLastSessionIds(queue.map((w) => w.id));
          const s = roundStats(direction);
          if (s.total > 0 && s.tested >= s.total) {
            setRoundFlash(s.round);
            window.setTimeout(() => setRoundFlash(null), 2200);
          }
          setStats(roundStats(direction));
          setQueue(null);
        }}
      />
    );
  }

  // ---------- 空词库 ----------

  if (testableCount === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-6 pt-10 text-center">
        <h1 className="hero-title text-4xl">词库是空的</h1>
        <p className="text-sm tracking-wide text-white/40">先去添加一些单词，再回来测试。</p>
        <Link to="/words" className="glow-btn min-h-[44px] rounded-full px-8 text-sm tracking-wide">
          去单词管理
        </Link>
      </div>
    );
  }

  // ---------- 设置面板 ----------

  const previewWords = previewIds ? getWordsByIds(previewIds) : [];
  const bookNameOf = (id: string) => books.find((b) => b.id === id)?.name ?? "?";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* 上次会话结果导出：次级提示条，不抢主流程 */}
      {lastSessionIds && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 px-4 py-2">
          <p className="text-xs tracking-wide text-white/30">
            上次会话共 {lastSessionIds.length} 个
          </p>
          <button
            onClick={() => setExportOpen(true)}
            className="shrink-0 text-xs tracking-wide text-white/35 underline-offset-4 hover:text-blue-200 hover:underline"
          >
            导出本次结果
          </button>
        </div>
      )}
      {lastReview && lastReview.length > 0 && !queue && !dictQueue && (
        <div className="glass-card flex flex-col items-center gap-3 rounded-2xl px-5 py-4">
          <p className="text-xs tracking-[0.2em] text-white/35">本轮回顾</p>
          <SessionReview items={lastReview} />
          <div className="flex items-center gap-4">
            {lastReview.some((i) => !i.correct) && (
              <button
                onClick={retryWrongFromReview}
                className="ghost-btn min-h-[40px] px-5 text-xs tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
              >
                只重测错题（{lastReview.filter((i) => !i.correct).length} 个）
              </button>
            )}
            <button
              onClick={() => setLastReview(null)}
              className="text-xs tracking-wide text-white/30 hover:text-white/60"
            >
              收起回顾
            </button>
          </div>
        </div>
      )}
      {exportOpen && lastSessionIds && (
        <ExportDialog
          scopeLabel={`测试结果（${lastSessionIds.length} 个）`}
          scopeName="测试结果"
          pool={getWordsByIds(lastSessionIds)}
          withTime
          onClose={() => setExportOpen(false)}
        />
      )}
      <div className="text-center">
        <p className="eyebrow">Test Setup</p>
        <h1 className="hero-title mt-3 text-4xl sm:text-5xl">单词测试</h1>
      </div>

      {/* 轮次庆功浮层 */}
      {roundFlash !== null && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="round-flash text-center">
            <p className="eyebrow !text-blue-200/70">Round Complete</p>
            <p
              className="hero-title mt-4 text-7xl sm:text-8xl"
              style={{ textShadow: "0 0 40px rgba(147,197,253,0.4)" }}
            >
              第 {roundFlash} 轮
            </p>
            <p className="mt-4 font-mono text-sm tracking-[0.25em] text-white/50">完成 · COMPLETE</p>
          </div>
        </div>
      )}

      {/* 本轮进度 */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="tracking-wide text-white/45">
            <span className="mr-2 rounded-full border border-blue-300/30 px-2 py-0.5 text-[10px] text-blue-200/80">
              {direction === "en2zh" ? "英→中" : "中→英"}
            </span>
            第 {stats.round} 轮 · 已测 <span className="text-blue-200">{stats.tested}</span> /{" "}
            {stats.total}
          </span>
          <button
            onClick={() => setResetConfirm(true)}
            className="flex min-h-[36px] items-center gap-1 text-xs tracking-wide text-white/30 transition-colors hover:text-white/70"
          >
            <RotateCcw className="h-3 w-3" /> 重置进度
          </button>
        </div>
        <div className="relative mt-3 h-1.5 overflow-visible rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400/60 to-blue-300 transition-all duration-500"
            style={{ width: stats.total ? `${(stats.tested / stats.total) * 100}%` : "0%" }}
          />
          {[25, 50, 75, 100].map((m) => {
            const reached = stats.total > 0 && stats.tested / stats.total >= m / 100;
            return (
              <span
                key={m}
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all duration-500"
                style={{
                  left: `${m}%`,
                  borderColor: reached ? "rgba(147,197,253,0.8)" : "rgba(255,255,255,0.15)",
                  background: reached ? "rgba(96,165,250,0.5)" : "#0c1016",
                  boxShadow: reached ? "0 0 8px rgba(96,165,250,0.5)" : "none",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* 条件面板 */}
      <div className="glass-card rounded-2xl p-6">
        {/* 模式选择：测验 / 听写 */}
        <div className="mb-5 flex rounded-full border border-white/10 p-1">
          {(
            [
              { v: "quiz", label: "测验" },
              { v: "dictation", label: "听写" },
            ] as const
          ).map((m) => (
            <button
              key={m.v}
              onClick={() => setMode(m.v)}
              className={`min-h-[36px] flex-1 rounded-full text-xs tracking-wide transition-all duration-300 ${
                mode === m.v
                  ? "bg-blue-400/20 text-blue-100 shadow-[0_0_12px_rgba(96,165,250,0.25)]"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* 方向选择（听写固定 听音→写中文，不显示） */}
        {mode === "quiz" && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          {(
            [
              { v: "en2zh", label: "英 → 中", desc: "看英文写中文释义" },
              { v: "zh2en", label: "中 → 英", desc: "看中文写英文单词" },
            ] as const
          ).map((d) => (
            <button
              key={d.v}
              onClick={() => setDirection(d.v)}
              className={`min-h-[56px] rounded-xl border px-3 text-sm tracking-wide transition-all duration-300 ${
                direction === d.v
                  ? "border-blue-300/50 bg-blue-300/10 text-blue-100 shadow-[0_0_18px_rgba(96,165,250,0.15)]"
                  : "border-white/10 text-white/45 hover:border-white/25 hover:text-white"
              }`}
            >
              <span className="block">{d.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-white/35">{d.desc}</span>
            </button>
          ))}
        </div>
        )}

        {/* 词书选择器（树形：词书 → 章节） */}
        <div className="mb-5">
          <label className="text-sm tracking-wide text-white/45">词书范围</label>
          <div className="mt-2 flex flex-col gap-1.5">
            <button
              onClick={() => setBookId("all")}
              className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-left text-sm tracking-wide transition-all duration-300 ${
                bookId === "all"
                  ? "border-blue-300/50 bg-blue-300/10 text-blue-100"
                  : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"
              }`}
            >
              <BookOpen className="h-4 w-4 shrink-0 text-white/40" />
              全部词书
            </button>
            {rootBooks.map((b) => {
              const chapters = getChapters(b.id);
              const chapterSel = chapters.find((c) => c.id === bookId);
              const active = bookId === b.id || !!chapterSel;
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    // 有章节 → 弹层选章节；无章节 → 直接选中
                    if (chapters.length > 0) setChapterPickerFor(b.id);
                    else setBookId(b.id);
                  }}
                  className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-left text-sm tracking-wide transition-all duration-300 ${
                    active
                      ? "border-blue-300/50 bg-blue-300/10 text-blue-100"
                      : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"
                  }`}
                >
                  <BookOpen className="h-4 w-4 shrink-0 text-white/40" />
                  <span className="flex-1 truncate">
                    {b.name}
                    {chapterSel && (
                      <span className="ml-1.5 font-mono text-[11px] text-blue-200/70">
                        · {chapterSel.name}
                      </span>
                    )}
                  </span>
                  {chapters.length > 0 && (
                    <span className="font-mono text-[10px] text-white/30">
                      {chapters.length} 章节 ›
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 书内序号范围 */}
        <div className="mb-5">
          <label className="text-sm tracking-wide text-white/45">书内序号范围</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value.replace(/[^\d]/g, ""))}
              disabled={isParentSelected}
              placeholder="从"
              className="glass-input min-h-[44px] w-full rounded-xl px-4 font-mono text-sm tracking-wide disabled:opacity-35"
            />
            <span className="text-white/25">–</span>
            <input
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value.replace(/[^\d]/g, ""))}
              disabled={isParentSelected}
              placeholder="到"
              className="glass-input min-h-[44px] w-full rounded-xl px-4 font-mono text-sm tracking-wide disabled:opacity-35"
            />
          </div>
          {isParentSelected && bookId !== "all" && (
            <p className="mt-2 text-xs tracking-wide text-amber-200/60">
              父节点按子章节细化，请选具体章节使用范围
            </p>
          )}
          {rangeError && (
            <p className="mt-2 text-xs tracking-wide text-red-300/80">{rangeError}</p>
          )}
        </div>

        {/* 类型筛选 */}
        <div className="mb-5">
          <label className="text-sm tracking-wide text-white/45">内容类型</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                { v: "all", label: "全部" },
                { v: "word", label: "仅单词" },
                { v: "phrase", label: "仅词组" },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                onClick={() => setTypeFilter(t.v)}
                className={`min-h-[40px] rounded-xl border text-sm tracking-wide transition-all duration-300 ${
                  typeFilter === t.v
                    ? "border-blue-300/50 bg-blue-300/10 text-blue-100"
                    : "border-white/10 text-white/45 hover:border-white/25 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 排除项 */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(
            [
              { v: excludeTested, set: setExcludeTested, label: "排除已测" },
              { v: excludeMastered, set: setExcludeMastered, label: "排除已掌握" },
              { v: preferWrong, set: setPreferWrong, label: "优先错词" },
              { v: familyMode, set: setFamilyMode, label: "按词族整族抽" },
            ] as const
          ).map((o) => (
            <button
              key={o.label}
              onClick={() => o.set(!o.v)}
              className={`min-h-[36px] rounded-full border px-4 text-xs tracking-wide transition-all duration-300 ${
                o.v
                  ? "border-blue-300/50 bg-blue-300/10 text-blue-100"
                  : "border-white/10 text-white/40 hover:border-white/25 hover:text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* 数量 + 顺序 */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          {(
            [
              { v: true, label: "按顺序", desc: "按书内序号出题" },
              { v: false, label: "乱序", desc: "随机打乱后出题" },
            ] as const
          ).map((o) => (
            <button
              key={String(o.v)}
              onClick={() => setOrdered(o.v)}
              className={`min-h-[48px] rounded-xl border px-3 text-sm tracking-wide transition-all duration-300 ${
                ordered === o.v
                  ? "border-blue-300/50 bg-blue-300/10 text-blue-100 shadow-[0_0_18px_rgba(96,165,250,0.15)]"
                  : "border-white/10 text-white/45 hover:border-white/25 hover:text-white"
              }`}
            >
              <span className="block">{o.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-white/35">{o.desc}</span>
            </button>
          ))}
        </div>

        <div>
          <label className="text-sm tracking-wide text-white/45">
            抽取数量 <span className="text-white/25">（转动选择，5 – {Math.max(testableCount, 100)} 个，可手输任意值）</span>
          </label>
          <div className="mt-2">
            <CountWheel
              min={5}
              max={Math.max(testableCount, 100)}
              value={count}
              onChange={setCount}
              unit="个"
              step={5}
            />
          </div>
        </div>

        {/* 结果预览（默认折叠成摘要；0 命中显示空态） */}
        {previewIds && previewMeta && (
          <div className="mt-5 rounded-xl border border-blue-300/20 bg-blue-400/5 p-4">
            {previewMeta.matched === 0 ? (
              <p className="text-sm tracking-wide text-white/45">
                无匹配单词，请调整条件（如取消排除项、放宽范围）
              </p>
            ) : (
              <>
                <button
                  onClick={() => setPreviewOpen(!previewOpen)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm tracking-wide text-blue-100">
                    {previewMeta.rangeIgnored
                      ? `命中 ${previewMeta.matched} 个（含全部章节），将抽 ${Math.min(count, previewMeta.matched)} 个`
                      : `范围命中 ${previewMeta.matched} 个，将抽 ${Math.min(count, previewMeta.matched)} 个`}
                    {familyMode &&
                      previewMeta.expanded != null &&
                      previewMeta.expanded > 0 &&
                      `，整族扩展后 ${previewMeta.expanded} 个（含 ${previewWords.filter((w) => w.type === "phrase").length} 个词组）`}
                  </span>
                  {previewOpen ? (
                    <ChevronUp className="h-4 w-4 text-blue-200/60" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-blue-200/60" />
                  )}
                </button>
                {previewOpen && (
                  <ul className="mt-3 max-h-64 divide-y divide-white/5 overflow-y-auto">
                    {previewWords.map((w) => (
                      <li key={w.id} className="flex items-baseline gap-2 py-2 text-sm">
                        <span className="shrink-0 font-mono text-[10px] text-white/30">
                          {bookNameOf(w.bookId)} #{w.orderInBook}
                        </span>
                        <span className="shrink-0 font-mono text-white">{w.word}</span>
                        <span className="min-w-0 truncate text-white/45">
                          {formatMeanings(w.meanings).join("　") || "（无释义）"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <button
          onClick={() => (previewIds && previewIds.length > 0 ? startWithIds(previewIds) : handleStart())}
          disabled={!!rangeError || (previewMeta !== null && previewMeta.matched === 0)}
          className="glow-btn mt-6 min-h-[52px] w-full rounded-full text-sm font-medium tracking-[0.08em] disabled:opacity-35"
        >
          <Play className="h-4 w-4" /> {mode === "dictation" ? "开始听写" : "开始测试"}
        </button>

        <button
          onClick={toggleSkipPreview}
          className="mt-3 flex w-full items-center justify-center gap-2 text-xs tracking-wide text-white/35 transition-colors hover:text-white/60"
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
              skipPreview ? "border-blue-300/60 bg-blue-400/20 text-blue-200" : "border-white/20 text-transparent"
            }`}
          >
            ✓
          </span>
          跳过预览直接开始（记住选择）
        </button>
      </div>

      {/* 重置进度确认 */}
      {resetConfirm && (
        <ConfirmDialog
          title="重置全部测试进度？"
          desc="两个方向的轮次记录都会清零。"
          confirmText="重置"
          danger
          onConfirm={() => {
            resetProgress();
            refresh();
            setResetConfirm(false);
          }}
          onCancel={() => setResetConfirm(false)}
        />
      )}

      {/* 章节选择弹层 */}
      {chapterPickerFor &&
        (() => {
          const pb = books.find((b) => b.id === chapterPickerFor);
          if (!pb) return null;
          const chapters = getChapters(pb.id);
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onClick={() => setChapterPickerFor(null)}
            >
              <div
                className="glass-card relative flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setChapterPickerFor(null)}
                  aria-label="关闭"
                  className="absolute right-3 top-3 flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full text-white/40 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
                <h3 className="font-semibold tracking-wide text-white">{pb.name} · 选择章节</h3>
                <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
                  <button
                    onClick={() => {
                      setBookId(pb.id); // 整本：选中词书本体，includeDescendants 默认 true
                      setChapterPickerFor(null);
                    }}
                    className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-left text-sm tracking-wide transition-colors ${
                      bookId === pb.id
                        ? "border-blue-300/50 bg-blue-300/10 text-blue-100"
                        : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    <BookOpen className="h-4 w-4 shrink-0 text-white/40" />
                    整本（含全部章节）
                  </button>
                  {chapters.map((c) => {
                    const n = words.filter((w) => w.bookId === c.id && !w.excluded).length;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setBookId(c.id);
                          setChapterPickerFor(null);
                        }}
                        className={`flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-left text-sm tracking-wide transition-colors ${
                          bookId === c.id
                            ? "border-blue-300/50 bg-blue-300/10 text-blue-100"
                            : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"
                        }`}
                      >
                        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-white/25" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="font-mono text-[10px] text-white/30">{n} 词</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setChapterPickerFor(null)}
                  className="mt-4 min-h-[36px] text-xs tracking-wide text-white/35 hover:text-white/60"
                >
                  取消
                </button>
              </div>
            </div>
          );
        })()}

      {voiceOpen && <VoiceSettings onClose={() => setVoiceOpen(false)} />}

      {/* 发音设置入口 */}
      <button
        onClick={() => setVoiceOpen(true)}
        className="mx-auto flex items-center gap-1.5 text-xs tracking-wide text-white/35 transition-colors hover:text-white/60"
      >
        <Volume2 className="h-3.5 w-3.5" /> 发音设置
      </button>

      {/* 当前条件摘要 */}
      <p className="text-center font-mono text-[11px] tracking-wide text-white/25">
        {criteriaSummary()}
      </p>
    </div>
  );
}
