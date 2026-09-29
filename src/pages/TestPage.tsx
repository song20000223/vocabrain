import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Play, CheckSquare, Square, RotateCcw } from "lucide-react";
import QuizSession, { celebrateRain, type QuizJudgeResult, type QuizWord } from "@/components/QuizSession";
import CountWheel from "@/components/CountWheel";
import {
  getWords,
  addToWrongBook,
  pickNextWord,
  markTestedInRound,
  roundStats,
  resetProgress,
  type WordItem,
  type Direction,
} from "@/lib/store";

type Mode = "all" | "pick";

export default function TestPage() {
  const [words, setWords] = useState<WordItem[]>([]);
  const [stats, setStats] = useState(() => roundStats("en2zh"));

  // 设置面板状态
  const [mode, setMode] = useState<Mode>("all");
  const [direction, setDirection] = useState<Direction>("en2zh");
  const [count, setCount] = useState(10);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rangeText, setRangeText] = useState("");

  // 测试进行状态
  const [queue, setQueue] = useState<QuizWord[] | null>(null);

  const refresh = () => {
    setWords(getWords());
    setStats(roundStats(direction));
  };
  useEffect(() => {
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const testable = useMemo(() => words.filter((w) => !w.excluded), [words]);

  // ---------- 开始测试 ----------

  const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  const startAll = () => {
    // 全库模式：按进度队列连续抽 N 个（优先未测）
    const picked: QuizWord[] = [];
    let lastId: string | undefined;
    for (let i = 0; i < count; i++) {
      const w = pickNextWord(lastId, direction);
      if (!w) break;
      picked.push(w);
      lastId = w.id;
    }
    if (picked.length === 0) return;
    setQueue(picked);
  };

  const startPicked = () => {
    const pool = testable.filter((w) => selected.has(w.id));
    if (pool.length === 0) return;
    setQueue(shuffle(pool));
    setPickerOpen(false);
  };

  // ---------- 判分回调 ----------

  const handleJudged = (word: QuizWord, answer: string, result: QuizJudgeResult) => {
    markTestedInRound(word.id, direction); // 指定模式也计入当前方向的全库进度
    if (!result.correct) {
      const full = words.find((w) => w.id === word.id);
      addToWrongBook(full ?? { ...word, testedRounds: 0, lastTestedAt: null, excluded: false }, answer, result.comment);
    }
  };

  // ---------- 快捷选择 ----------

  const selectAll = () => setSelected(new Set(testable.map((w) => w.id)));
  const selectNone = () => setSelected(new Set());
  const applyRange = () => {
    const m = rangeText.match(/^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/);
    if (!m) return;
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
    const next = new Set(selected);
    testable.forEach((w, i) => {
      const seq = i + 1;
      if (seq >= lo && seq <= hi) next.add(w.id);
    });
    setSelected(next);
  };

  // ---------- 测试中 ----------

  if (queue) {
    return (
      <QuizSession
        queue={queue}
        direction={direction}
        progressText={`本轮第 ${stats.round} 轮 · 已测 ${stats.tested} / ${stats.total}`}
        exitText="退出测试"
        onExit={() => setQueue(null)}
        onJudged={handleJudged}
        onFinish={() => {
          celebrateRain();
          setQueue(null);
        }}
      />
    );
  }

  // ---------- 空词库 ----------

  if (testable.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 pt-24 text-center">
        <p className="tracking-wide text-white/45">
          {words.length === 0 ? "词库是空的，先去添加一些单词吧。" : "所有单词都被标记为「不再测」了。"}
        </p>
        <Link to="/words" className="glow-btn min-h-[44px] rounded-full px-8 text-sm tracking-wide">
          去单词管理
        </Link>
      </div>
    );
  }

  // ---------- 设置面板 ----------

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="text-center">
        <p className="eyebrow">Test Setup</p>
        <h1 className="hero-title mt-3 text-4xl sm:text-5xl">单词测试</h1>
      </div>

      {/* 本轮进度 */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="tracking-wide text-white/45">
            <span className="mr-2 rounded-full border border-blue-300/30 px-2 py-0.5 text-[10px] text-blue-200/80">
              {direction === "en2zh" ? "英→中" : "中→英"}
            </span>
            第 {stats.round} 轮 · 已测 <span className="text-blue-200">{stats.tested}</span> / {stats.total}
          </span>
          <button
            onClick={() => {
              if (window.confirm("重置全部测试进度，从第 1 轮重新开始？")) resetProgress();
            }}
            className="flex min-h-[36px] items-center gap-1.5 text-xs tracking-wide text-white/35 transition-colors hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" /> 重置进度
          </button>
        </div>
        <div className="relative mt-3 h-1.5 overflow-visible rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-400/60 to-blue-300 transition-all duration-500"
            style={{ width: stats.total ? `${(stats.tested / stats.total) * 100}%` : "0%" }}
          />
          {/* 里程碑刻度：25% / 50% / 75% / 100% */}
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

      {/* 模式选择 */}
      <div className="glass-card rounded-2xl p-6">
        {/* 方向选择：英→中 / 中→英 */}
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

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("all")}
            className={`min-h-[56px] rounded-xl border text-sm tracking-wide transition-all duration-300 ${
              mode === "all"
                ? "border-blue-300/50 bg-blue-300/10 text-blue-100 shadow-[0_0_18px_rgba(96,165,250,0.15)]"
                : "border-white/10 text-white/45 hover:border-white/25 hover:text-white"
            }`}
          >
            全库测试
          </button>
          <button
            onClick={() => setMode("pick")}
            className={`min-h-[56px] rounded-xl border text-sm tracking-wide transition-all duration-300 ${
              mode === "pick"
                ? "border-blue-300/50 bg-blue-300/10 text-blue-100 shadow-[0_0_18px_rgba(96,165,250,0.15)]"
                : "border-white/10 text-white/45 hover:border-white/25 hover:text-white"
            }`}
          >
            指定单词测试
          </button>
        </div>

        {mode === "all" ? (
          <div className="mt-5">
            <label className="text-sm tracking-wide text-white/45">
              本次测试数量 <span className="text-white/25">（转动选择，1 – {Math.max(testable.length, 100)} 题）</span>
            </label>
            <div className="mt-2">
              <CountWheel
                min={1}
                max={Math.max(testable.length, 100)}
                value={count}
                onChange={setCount}
                unit="题"
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed tracking-wide text-white/30">
              优先抽本轮没测过的单词；全部测过一遍后自动开启新一轮。数量超过词库总量时会循环抽词。
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <button
              onClick={() => setPickerOpen(true)}
              className="glass-input flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 text-sm tracking-wide"
            >
              <span className={selected.size ? "text-white" : "text-white/35"}>
                {selected.size ? `已选 ${selected.size} 个单词` : "点击选择单词…"}
              </span>
              <CheckSquare className="h-4 w-4 text-blue-300/60" />
            </button>
          </div>
        )}

        <button
          onClick={mode === "all" ? startAll : startPicked}
          disabled={mode === "pick" && selected.size === 0}
          className="glow-btn mt-6 min-h-[52px] w-full rounded-full text-sm font-medium tracking-[0.08em]"
        >
          <Play className="h-4 w-4" /> 开始测试
        </button>
      </div>

      {/* 指定单词多选面板（弹层） */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setPickerOpen(false)}>
          <div
            className="glass-nav flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-3xl p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold tracking-wide text-white">选择单词（{selected.size} / {testable.length}）</h2>
              <button onClick={() => setPickerOpen(false)} className="min-h-[36px] px-3 text-sm text-white/45 hover:text-white">
                完成
              </button>
            </div>

            {/* 快捷选择 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button onClick={selectAll} className="ghost-btn min-h-[36px] px-4 text-xs tracking-wide">全选</button>
              <button onClick={selectNone} className="ghost-btn min-h-[36px] px-4 text-xs tracking-wide">全不选</button>
              <div className="flex items-center gap-2">
                <input
                  value={rangeText}
                  onChange={(e) => setRangeText(e.target.value)}
                  placeholder="如 1-100"
                  className="glass-input min-h-[36px] w-24 rounded-lg px-3 font-mono text-xs"
                />
                <button onClick={applyRange} className="ghost-btn min-h-[36px] px-4 text-xs tracking-wide">
                  按序号选
                </button>
              </div>
            </div>

            {/* 单词清单 */}
            <ul className="mt-4 flex-1 divide-y divide-white/5 overflow-y-auto">
              {testable.map((w, i) => {
                const checked = selected.has(w.id);
                return (
                  <li key={w.id}>
                    <button
                      onClick={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(w.id);
                        else next.add(w.id);
                        setSelected(next);
                      }}
                      className="flex min-h-[48px] w-full items-center gap-3 px-1 text-left"
                    >
                      {checked ? (
                        <CheckSquare className="h-4 w-4 shrink-0 text-blue-300" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0 text-white/25" />
                      )}
                      <span className="w-8 shrink-0 font-mono text-xs text-white/30">{i + 1}</span>
                      <span className="font-mono text-sm text-white">{w.word}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={startPicked}
              disabled={selected.size === 0}
              className="glow-btn mt-4 min-h-[48px] w-full rounded-full text-sm tracking-[0.06em]"
            >
              开始测试（{selected.size} 个）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
