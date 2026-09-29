import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Upload,
  Ban,
  CircleCheck,
  Search,
  BookOpen,
  FolderPlus,
  X,
  Pencil,
  Loader2,
  Languages,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  getWords,
  getBooks,
  addBook,
  renameBook,
  removeBook,
  addWord,
  importWords,
  removeWord,
  toggleExcluded,
  formatMeanings,
  looksChinese,
  parseAiDefinition,
  DEFAULT_BOOK_ID,
  type WordItem,
  type BookItem,
} from "@/lib/store";

const POS_OPTIONS = ["n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "num.", "其他"];

/** 单词行（弹窗和搜索结果共用）；selecting 时显示勾选框 */
function WordRow({
  it,
  onChanged,
  selecting,
  checked,
  onToggle,
}: {
  it: WordItem;
  onChanged: () => void;
  selecting?: boolean;
  checked?: boolean;
  onToggle?: (id: string) => void;
}) {
  return (
    <li
      className={`glass-card rounded-2xl p-5 transition-all duration-300 ${
        it.excluded ? "opacity-45" : ""
      } ${checked ? "!border-blue-300/40" : ""} ${selecting ? "cursor-pointer" : ""}`}
      onClick={selecting ? () => onToggle?.(it.id) : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {selecting && (
            <span
              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${
                checked ? "border-blue-300 bg-blue-400/30 text-blue-100" : "border-white/25 text-transparent"
              }`}
            >
              <CircleCheck className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg tracking-wide text-white">{it.word}</span>
            {it.excluded && (
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] tracking-wide text-white/40">
                不再测
              </span>
            )}
            {it.testedRounds > 0 && (
              <span className="font-mono text-[10px] tracking-wide text-white/25">
                已测 {it.testedRounds} 次
              </span>
            )}
          </div>
          <div className="mt-2 space-y-0.5 text-sm tracking-wide text-white/55">
            {formatMeanings(it.meanings).length > 0 ? (
              formatMeanings(it.meanings).map((line, i) => <p key={i}>{line}</p>)
            ) : (
              <p className="text-white/25">（暂无释义，判分时由 AI 判断）</p>
            )}
          </div>
          </div>
        </div>
        {!selecting && (
          <div className="flex shrink-0 items-center">
            <button
              onClick={() => {
                toggleExcluded(it.id);
                onChanged();
              }}
            aria-label={it.excluded ? "恢复测试" : "不再测"}
            title={it.excluded ? "恢复测试" : "不再测"}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors duration-300 ${
              it.excluded ? "text-blue-300" : "text-white/25 hover:text-blue-200"
            }`}
          >
              {it.excluded ? <CircleCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            </button>
            <button
              onClick={() => {
                removeWord(it.id);
                onChanged();
              }}
              aria-label={`删除 ${it.word}`}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white/25 transition-colors duration-300 hover:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function WordsPage() {
  const [words, setWords] = useState<WordItem[]>([]);
  const [books, setBooks] = useState<BookItem[]>([]);
  // 手动添加
  const [word, setWord] = useState("");
  const [pos, setPos] = useState("n.");
  const [defs, setDefs] = useState("");
  const [batchText, setBatchText] = useState("");
  const [tip, setTip] = useState("");
  // 检索
  const [query, setQuery] = useState("");
  // AI 翻译结果：英文输入 → 释义；中文输入 → 候选英文词（词 → 释义）
  const [aiResult, setAiResult] = useState<{
    source: string;
    kind: "define" | "reverse";
    /** define：单个释义；reverse：词 → 释义 列表 */
    items: { word: string; definition: string }[];
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  // 目标词书（添加/导入共用）
  const [targetBook, setTargetBook] = useState<string>(DEFAULT_BOOK_ID);
  const [newBookName, setNewBookName] = useState("");
  // 词书弹窗
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  // 批量操作
  const [selecting, setSelecting] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const refresh = () => {
    setWords(getWords());
    setBooks(getBooks());
  };

  useEffect(() => {
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
  }, []);

  const showTip = (msg: string) => {
    setTip(msg);
    window.setTimeout(() => setTip(""), 3500);
  };

  const handleCreateBook = () => {
    const b = addBook(newBookName);
    if (b) {
      setTargetBook(b.id);
      setNewBookName("");
      showTip(`已创建词书「${b.name}」，新单词将加入其中`);
      refresh();
    } else if (newBookName.trim()) {
      showTip("词书已存在或名称为空");
    }
  };

  const handleAdd = () => {
    if (!word.trim()) return;
    // 重复检查
    const dup = words.find((w) => w.word.toLowerCase() === word.trim().toLowerCase());
    const definitions = defs.split(/[;；]/).map((d) => d.trim()).filter(Boolean);
    if (addWord(word, pos, definitions, targetBook)) {
      setWord("");
      setDefs("");
      showTip(dup ? `「${dup.word}」已存在，义项已合并进去` : "添加成功");
      refresh();
    }
  };

  const handleImport = () => {
    if (!batchText.trim()) return;
    const { added, skipped } = importWords(batchText, targetBook);
    setBatchText("");
    showTip(
      skipped > 0
        ? `成功导入/合并 ${added} 条；${skipped} 行无法识别，已跳过`
        : `成功导入/合并 ${added} 条`,
    );
    refresh();
  };

  // 检索结果（搜单词或释义）
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(q) ||
        w.meanings.some((m) => m.definitions.some((d) => d.toLowerCase().includes(q))),
    );
  }, [query, words]);

  // ---------- AI 翻译（600ms 防抖） ----------
  const client = trpc.useUtils().client;

  useEffect(() => {
    const q = query.trim();
    setAiResult(null);
    setAiError("");
    // 太短、或词库已有精确匹配时没必要问 AI
    if (q.length < 2 || (searchResults?.some((w) => w.word.toLowerCase() === q.toLowerCase()) ?? false)) {
      setAiLoading(false);
      return;
    }
    const isCn = looksChinese(q);
    // 英文输入要求像个单词（避免句子和乱码触发请求）
    if (!isCn && !/^[A-Za-z][A-Za-z\-']+$/.test(q)) {
      setAiLoading(false);
      return;
    }
    setAiLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        if (isCn) {
          const r = await client.reverse.mutate({ text: q });
          // 每个候选词再取释义（并行）
          const items = await Promise.all(
            r.words.slice(0, 4).map(async (w) => {
              try {
                const d = await client.define.mutate({ word: w });
                return { word: w, definition: d.definition };
              } catch {
                return { word: w, definition: "" };
              }
            }),
          );
          setAiResult({ source: q, kind: "reverse", items });
        } else {
          const d = await client.define.mutate({ word: q });
          setAiResult({ source: q, kind: "define", items: [{ word: q, definition: d.definition }] });
        }
      } catch (e) {
        setAiError(e instanceof Error ? e.message : "翻译失败，请稍后重试");
      } finally {
        setAiLoading(false);
      }
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /** 一键把 AI 结果加入词书 */
  const quickAdd = (w: string, def: string) => {
    const { pos, definitions } = parseAiDefinition(def);
    const dup = words.some((it) => it.word.toLowerCase() === w.toLowerCase());
    if (addWord(w, pos, definitions, targetBook)) {
      showTip(
        dup
          ? `「${w}」已在词库中，义项已合并`
          : `已把「${w}」加入「${bookName(targetBook)}」`,
      );
      refresh();
    }
  };

  const bookWordCount = (id: string) => words.filter((w) => w.bookId === id).length;
  const openBook = books.find((b) => b.id === openBookId) ?? null;
  const openBookWords = openBookId ? words.filter((w) => w.bookId === openBookId) : [];

  // ---------- 批量操作 ----------
  const toggleCheck = (id: string) => {
    setCheckedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const exitSelecting = () => {
    setSelecting(false);
    setCheckedIds(new Set());
  };
  const allChecked =
    openBookWords.length > 0 && openBookWords.every((w) => checkedIds.has(w.id));

  const batchDelete = () => {
    if (checkedIds.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${checkedIds.size} 个单词？此操作不可恢复。`)) return;
    for (const id of checkedIds) removeWord(id);
    showTip(`已删除 ${checkedIds.size} 个单词`);
    exitSelecting();
    refresh();
  };
  const batchExclude = (exclude: boolean) => {
    if (checkedIds.size === 0) return;
    for (const id of checkedIds) {
      const w = words.find((it) => it.id === id);
      if (w && w.excluded !== exclude) toggleExcluded(id);
    }
    showTip(exclude ? `已将 ${checkedIds.size} 个单词设为不再测` : `已恢复 ${checkedIds.size} 个单词`);
    exitSelecting();
    refresh();
  };

  const bookName = (id: string) => books.find((b) => b.id === id)?.name ?? "默认词书";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Library</p>
        <h1 className="hero-title mt-3 text-4xl sm:text-5xl">单词管理</h1>
        <p className="mt-3 text-sm tracking-wide text-white/40">
          共 {books.length} 本词书 · {words.length} 个单词
        </p>
      </div>

      {tip && (
        <div
          className="glass-card rounded-xl px-4 py-2.5 text-sm tracking-wide text-blue-100"
          style={{ borderColor: "rgba(147,197,253,0.3)" }}
        >
          {tip}
        </div>
      )}

      {/* 检索 */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold tracking-wide text-white">检索单词</h2>
        <p className="mt-1 text-xs tracking-wide text-white/35">
          输入英文或中文释义，检查是否已添加过、快速查意思
        </p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索单词或释义…"
            className="glass-input min-h-[44px] w-full rounded-xl pl-11 pr-10 tracking-wide"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="清空"
              className="absolute right-2 top-1/2 flex min-h-[36px] min-w-[36px] -translate-y-1/2 items-center justify-center rounded-full text-white/30 hover:text-white/70"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {searchResults && (
          <div className="mt-4">
            {searchResults.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm tracking-wide text-white/35">
                词库里没有「{query.trim()}」——看下面的 AI 翻译，一键就能加进来。
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs tracking-wide text-white/40">
                  找到 {searchResults.length} 个匹配
                </p>
                <ul className="flex flex-col gap-3">
                  {searchResults.map((it) => (
                    <div key={it.id}>
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-blue-200/50">
                        {bookName(it.bookId)}
                      </p>
                      <WordRow it={it} onChanged={refresh} />
                    </div>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* AI 翻译：输入英文给释义，输入中文给候选英文词，一键加入词书 */}
        {query.trim().length >= 2 && (aiLoading || aiResult || aiError) && (
          <div className="mt-4 rounded-xl border border-blue-300/15 bg-blue-400/5 p-4">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-blue-200/60">
              <Languages className="h-3.5 w-3.5" /> AI 翻译
            </p>
            {aiLoading && (
              <p className="flex items-center gap-2 text-sm tracking-wide text-white/45">
                <Loader2 className="h-4 w-4 animate-spin" /> 正在翻译…
              </p>
            )}
            {aiError && <p className="text-sm tracking-wide text-red-200/80">{aiError}</p>}
            {aiResult && !aiLoading && (
              <ul className="flex flex-col gap-2">
                {aiResult.items.map((it) => {
                  const dup = words.some((w) => w.word.toLowerCase() === it.word.toLowerCase());
                  return (
                    <li
                      key={it.word}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5"
                    >
                      <span className="font-mono text-base tracking-wide text-white">
                        {it.word}
                      </span>
                      <span className="min-w-0 flex-1 text-sm tracking-wide text-white/60">
                        {it.definition || "（释义获取失败）"}
                      </span>
                      {dup ? (
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] tracking-wide text-white/30">
                          已在词库
                        </span>
                      ) : (
                        <button
                          onClick={() => quickAdd(it.word, it.definition)}
                          disabled={!it.definition}
                          className="glow-btn min-h-[36px] rounded-full px-4 text-xs tracking-wide"
                        >
                          <Plus className="h-3.5 w-3.5" /> 加入「{bookName(targetBook)}」
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 目标词书选择（添加/导入共用） */}
      <section className="glass-card flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <span className="text-sm tracking-wide text-white/50">新单词加入：</span>
        <select
          value={targetBook}
          onChange={(e) => setTargetBook(e.target.value)}
          className="glass-input min-h-[40px] rounded-full px-4 text-sm tracking-wide"
        >
          {books.map((b) => (
            <option key={b.id} value={b.id} className="bg-[#0a0d12]">
              {b.name}
            </option>
          ))}
        </select>
      </section>

      {/* 手动添加 */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold tracking-wide text-white">手动添加</h2>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="英文单词，如 plateau"
              className="glass-input min-h-[44px] flex-1 rounded-xl px-4 tracking-wide"
            />
            <select
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              className="glass-input min-h-[44px] rounded-xl px-4 tracking-wide"
            >
              {POS_OPTIONS.map((p) => (
                <option key={p} value={p === "其他" ? "" : p} className="bg-[#0a0d12]">
                  {p === "" ? "无词性" : p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={defs}
              onChange={(e) => setDefs(e.target.value)}
              placeholder="中文义项，多个用分号隔开，如 高原；平稳期"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="glass-input min-h-[44px] flex-1 rounded-xl px-4 tracking-wide"
            />
            <button
              onClick={handleAdd}
              disabled={!word.trim()}
              className="glow-btn min-h-[44px] rounded-full px-7 text-sm tracking-wide"
            >
              <Plus className="h-4 w-4" /> 添加
            </button>
          </div>
          <p className="text-xs tracking-wide text-white/30">
            同一个单词分多次添加不同词性会自动合并；已存在的单词会提示合并而不是重复添加。
          </p>
        </div>
      </section>

      {/* 批量导入 */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold tracking-wide text-white">批量导入</h2>
        <p className="mt-2 text-sm leading-relaxed tracking-wide text-white/40">
          每行一条，以下写法都认识：
          <code className="font-mono text-blue-200/80">chamber⇥n. 腔, 室; 议院</code>（Tab
          分隔）、
          <code className="font-mono text-blue-200/80">chamber n. 腔, 室; 议院</code>（空格分隔）、
          <code className="font-mono text-blue-200/80">plateau,n.,高原；平稳期</code>（逗号格式）
        </p>
        <textarea
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          rows={6}
          placeholder={"chamber\tn. 腔, 室; 议院\nplateau n. 高原；平稳期\nserendipity,n.,意外发现美好事物的运气"}
          className="glass-input mt-4 w-full resize-y rounded-xl p-4 font-mono text-sm"
        />
        <button
          onClick={handleImport}
          disabled={!batchText.trim()}
          className="ghost-btn mt-4 min-h-[44px] px-7 text-sm tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
        >
          <Upload className="h-4 w-4" /> 导入
        </button>
      </section>

      {/* 词书列表 */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold tracking-wide text-white">我的词书</h2>
          <div className="flex items-center gap-2">
            <input
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateBook()}
              placeholder="新词书名称，如 雅思核心"
              className="glass-input min-h-[40px] w-44 rounded-full px-4 text-sm tracking-wide"
            />
            <button
              onClick={handleCreateBook}
              disabled={!newBookName.trim()}
              className="ghost-btn min-h-[40px] px-4 text-xs tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
            >
              <FolderPlus className="h-4 w-4" /> 新建
            </button>
          </div>
        </div>

        {books.length === 0 ? (
          <p className="glass-card mt-4 rounded-2xl p-10 text-center text-sm tracking-wide text-white/40">
            还没有词书，先新建一本吧。
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {books.map((b) => {
              const count = bookWordCount(b.id);
              return (
                <li key={b.id}>
                  <button
                    onClick={() => {
                      setOpenBookId(b.id);
                      setRenaming(false);
                      setRenameText(b.name);
                      exitSelecting();
                    }}
                    className="glass-card group flex w-full items-center gap-4 rounded-2xl p-5 text-left transition-all duration-300 hover:border-blue-300/25"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-200">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium tracking-wide text-white">
                        {b.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs tracking-wide text-white/35">
                        {count} 个单词
                      </span>
                    </span>
                    <span className="text-xs tracking-wide text-white/20 transition-colors group-hover:text-blue-200/70">
                      点开 →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 词书弹窗 */}
      {openBook && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => {
            setOpenBookId(null);
            exitSelecting();
          }}
        >
          <div
            className="glass-card flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-3xl p-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renameBook(openBook.id, renameText);
                          setRenaming(false);
                          refresh();
                        }
                      }}
                      autoFocus
                      className="glass-input min-h-[40px] flex-1 rounded-xl px-3 tracking-wide"
                    />
                    <button
                      onClick={() => {
                        renameBook(openBook.id, renameText);
                        setRenaming(false);
                        refresh();
                      }}
                      className="glow-btn min-h-[40px] rounded-full px-5 text-xs tracking-wide"
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-xl font-semibold tracking-wide text-white">
                      {openBook.name}
                    </h3>
                    {openBook.id !== DEFAULT_BOOK_ID && (
                      <button
                        onClick={() => setRenaming(true)}
                        aria-label="重命名词书"
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-white/30 hover:text-blue-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <p className="mt-1 font-mono text-xs tracking-wide text-white/35">
                  {openBookWords.length} 个单词
                </p>
              </div>
              {openBookWords.length > 0 && (
                <button
                  onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
                  className={`ghost-btn min-h-[40px] shrink-0 px-4 text-xs tracking-wide ${
                    selecting ? "!border-blue-300/40 !text-blue-200" : ""
                  }`}
                >
                  {selecting ? "取消多选" : "多选"}
                </button>
              )}
              <button
                onClick={() => {
                  setOpenBookId(null);
                  exitSelecting();
                }}
                aria-label="关闭"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-white/40 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 批量操作工具条 */}
            {selecting && openBookWords.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-400/5 px-4 py-2.5">
                <button
                  onClick={() =>
                    allChecked
                      ? setCheckedIds(new Set())
                      : setCheckedIds(new Set(openBookWords.map((w) => w.id)))
                  }
                  className="min-h-[36px] rounded-full border border-white/15 px-4 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200"
                >
                  {allChecked ? "取消全选" : "全选"}
                </button>
                <span className="font-mono text-xs tracking-wide text-white/40">
                  已选 {checkedIds.size} 个
                </span>
                <span className="flex-1" />
                <button
                  onClick={() => batchExclude(true)}
                  disabled={checkedIds.size === 0}
                  className="min-h-[36px] rounded-full border border-white/15 px-4 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200 disabled:opacity-30"
                >
                  不再测
                </button>
                <button
                  onClick={() => batchExclude(false)}
                  disabled={checkedIds.size === 0}
                  className="min-h-[36px] rounded-full border border-white/15 px-4 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200 disabled:opacity-30"
                >
                  恢复测试
                </button>
                <button
                  onClick={batchDelete}
                  disabled={checkedIds.size === 0}
                  className="min-h-[36px] rounded-full border border-red-300/25 px-4 text-xs tracking-wide text-red-200/80 transition-colors hover:border-red-300/50 hover:text-red-200 disabled:opacity-30"
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" /> 删除
                </button>
              </div>
            )}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {openBookWords.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm tracking-wide text-white/35">
                  这本词书还是空的。在「手动添加 / 批量导入」里选择它，把单词加进来。
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {openBookWords.map((it) => (
                    <WordRow
                      key={it.id}
                      it={it}
                      onChanged={refresh}
                      selecting={selecting}
                      checked={checkedIds.has(it.id)}
                      onToggle={toggleCheck}
                    />
                  ))}
                </ul>
              )}
            </div>

            {openBook.id !== DEFAULT_BOOK_ID && (
              <button
                onClick={() => {
                  if (window.confirm(`删除词书「${openBook.name}」？里面的单词会移到默认词书，不会被删除。`)) {
                    removeBook(openBook.id);
                    setOpenBookId(null);
                    refresh();
                  }
                }}
                className="mt-4 self-start text-xs tracking-wide text-white/25 transition-colors hover:text-red-300"
              >
                删除这本词书（单词保留到默认词书）
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
