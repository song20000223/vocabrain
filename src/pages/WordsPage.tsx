import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Volume2,
  StickyNote,
  Play,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { speak } from "@/lib/speak";
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
  updateMeanings,
  formatMeanings,
  looksChinese,
  parseAiDefinition,
  getChapters,
  getBookRemovalInfo,
  DEFAULT_BOOK_ID,
  PHRASE_BOOK_ID,
  type WordItem,
  type BookItem,
} from "@/lib/store";

const POS_OPTIONS = ["n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "num.", "其他"];

/** 编辑态：词性 + 义项文本（义项用 ；/ 分隔） */
interface EditGroup {
  pos: string;
  text: string;
}

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
  const [editing, setEditing] = useState(false);
  const [groups, setGroups] = useState<EditGroup[]>([]);
  const [fallbackTip, setFallbackTip] = useState(false);

  const startEdit = () => {
    setGroups(
      it.meanings.length > 0
        ? it.meanings.map((m) => ({ pos: m.pos, text: m.definitions.join("；") }))
        : [{ pos: "", text: "" }],
    );
    setEditing(true);
  };

  const saveEdit = () => {
    const meanings = groups
      .map((g) => ({
        pos: g.pos.trim(),
        definitions: g.text
          .split(/[;；/]/)
          .map((d) => d.trim())
          .filter(Boolean),
      }))
      .filter((g) => g.pos || g.definitions.length > 0);
    updateMeanings(it.id, meanings);
    setEditing(false);
    onChanged();
  };

  const handleSpeak = () => {
    const r = speak(it.word);
    if (r.voice === "fallback" && !sessionStorage.getItem("vocab_tts_tip")) {
      sessionStorage.setItem("vocab_tts_tip", "1");
      setFallbackTip(true);
      window.setTimeout(() => setFallbackTip(false), 3500);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`确定删除单词 ${it.word}？可从数据层恢复，暂无撤销入口。`)) {
      removeWord(it.id);
      onChanged();
    }
  };

  return (
    <li
      className={`glass-card rounded-lg px-3 py-1.5 transition-all duration-300 ${
        it.excluded ? "opacity-45" : ""
      } ${checked ? "!border-blue-300/40" : ""} ${selecting ? "cursor-pointer" : ""}`}
      onClick={selecting ? () => onToggle?.(it.id) : undefined}
    >
      {/* 主行：单词左对齐，释义右对齐，同一行 */}
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {selecting && (
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${
                checked ? "border-blue-300 bg-blue-400/30 text-blue-100" : "border-white/25 text-transparent"
              }`}
            >
              <CircleCheck className="h-3.5 w-3.5" />
            </span>
          )}
          {/* 左：序号 + 单词 + 徽章 */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-sm tracking-wide text-white/40">#{it.orderInBook}</span>
            <span className="font-mono text-base tracking-wide text-white">{it.word}</span>
            {it.type === "phrase" && (
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] tracking-wide text-white/40">
                词组
              </span>
            )}
            {it.mastered && (
              <span className="rounded-full border border-emerald-300/25 px-2 py-0.5 text-[10px] tracking-wide text-emerald-200/70">
                已掌握
              </span>
            )}
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
          {/* 右：释义（右对齐，与单词同一行） */}
          {!editing && (
            <div className="hidden max-w-[50%] shrink-0 text-right text-sm tracking-wide text-white/55 sm:block">
              {formatMeanings(it.meanings).length > 0 ? (
                <p className="truncate" title={formatMeanings(it.meanings).join(" / ")}>
                  {formatMeanings(it.meanings).join(" · ")}
                </p>
              ) : (
                <p className="text-white/25">（暂无释义）</p>
              )}
            </div>
          )}
        </div>

        {/* 行操作：编辑 / 发音 / 不再测 / 记笔记(占位) / 删除（紧凑尺寸） */}
        {!selecting && !editing && (
          <div className="flex shrink-0 items-center -mr-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                startEdit();
              }}
              aria-label={`编辑 ${it.word} 的释义`}
              title="编辑释义"
              className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full text-white/25 transition-colors hover:text-blue-200"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSpeak();
              }}
              aria-label={`朗读 ${it.word}`}
              title="发音"
              className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full text-white/25 transition-colors hover:text-blue-200"
            >
              <Volume2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExcluded(it.id);
                onChanged();
              }}
              aria-label={it.excluded ? "恢复测试" : "不再测"}
              title={it.excluded ? "恢复测试" : "不再测"}
              className={`flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full transition-colors duration-300 ${
                it.excluded ? "text-blue-300" : "text-white/25 hover:text-blue-200"
              }`}
            >
              {it.excluded ? <CircleCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            </button>
            {/* 记笔记：S6 接入，先占位 */}
            <button
              disabled
              aria-label="记笔记（即将上线）"
              title="记笔记（S6 上线）"
              className="flex min-h-[28px] min-w-[28px] cursor-not-allowed items-center justify-center rounded-full text-white/12"
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              aria-label={`删除 ${it.word}`}
              title="删除"
              className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full text-white/25 transition-colors duration-300 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 窄屏补一行释义（sm 以下右侧放不下时） */}
      {!editing && (
        <p className="mt-0.5 truncate text-xs tracking-wide text-white/45 sm:hidden">
          {formatMeanings(it.meanings).join(" · ") || "（暂无释义）"}
        </p>
      )}

      {/* 编辑态：占整宽，位于主行下方 */}
      {editing && (
        <div className="mt-2 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          {groups.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={g.pos}
                onChange={(e) =>
                  setGroups(groups.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)))
                }
                className="glass-input min-h-[36px] w-24 rounded-lg px-2 text-xs"
              >
                {["", ...POS_OPTIONS.filter((p) => p !== "其他")].map((p) => (
                  <option key={p} value={p} className="bg-[#0a0d12]">
                    {p === "" ? "无词性" : p}
                  </option>
                ))}
              </select>
              <input
                value={g.text}
                onChange={(e) =>
                  setGroups(groups.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                }
                placeholder="多个义项用 ；或 / 分隔"
                className="glass-input min-h-[36px] flex-1 rounded-lg px-3 text-sm"
              />
              <button
                onClick={() => setGroups(groups.filter((_, j) => j !== i))}
                aria-label="删除该行义项"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-white/25 hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGroups([...groups, { pos: "", text: "" }])}
              className="ghost-btn min-h-[32px] px-3 text-xs"
            >
              <Plus className="h-3 w-3" /> 加词性
            </button>
            <span className="flex-1" />
            <button
              onClick={() => setEditing(false)}
              className="min-h-[32px] rounded-full px-3 text-xs text-white/40 hover:text-white"
            >
              取消
            </button>
            <button onClick={saveEdit} className="glow-btn min-h-[32px] rounded-full px-4 text-xs">
              保存
            </button>
          </div>
        </div>
      )}
      {fallbackTip && (
        <p className="mt-1 text-[11px] tracking-wide text-amber-200/60">
          当前环境无英式语音，已用系统默认语音播放
        </p>
      )}
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
  // 添加类型：单词 / 词组
  const [addType, setAddType] = useState<"word" | "phrase">("word");
  // 词书弹窗
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  // 新建章节
  const [newChapterName, setNewChapterName] = useState("");
  // 批量操作
  const [selecting, setSelecting] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  // 分页（词书弹窗内列表）
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 15 | 20>(15);
  const [jumpText, setJumpText] = useState("");

  const navigate = useNavigate();

  /** 弹窗内当前页单词：按 orderInBook 排序后切片，不做全局序号换算 */
  const openBookWords = useMemo(() => {
    if (!openBookId) return [] as WordItem[];
    const sorted = words
      .filter((w) => w.bookId === openBookId)
      .slice()
      .sort((a, b) => a.orderInBook - b.orderInBook);
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [words, openBookId, page, pageSize]);
  /** 弹窗内全部单词数（分页分母） */
  const openBookTotal = useMemo(
    () => (openBookId ? words.filter((w) => w.bookId === openBookId).length : 0),
    [words, openBookId],
  );
  const pageCount = Math.max(1, Math.ceil(openBookTotal / pageSize));

  const openBookModal = (id: string, name: string) => {
    setOpenBookId(id);
    setRenaming(false);
    setRenameText(name);
    setPage(1);
    setJumpText("");
    exitSelecting();
  };

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

  const handleCreateChapter = (parentId: string) => {
    const c = addBook(newChapterName, parentId);
    if (c) {
      setNewChapterName("");
      showTip(`已创建章节「${c.name}」`);
      refresh();
    } else if (newChapterName.trim()) {
      showTip("章节已存在或名称为空");
    }
  };

  /** 删除词书/章节：用 getBookRemovalInfo 生成区分场景的确认文案 */
  const handleRemoveBook = (id: string) => {
    const info = getBookRemovalInfo(id);
    if (!info) return; // 内置词书不可删
    const msg = info.isChapter
      ? info.wordCount > 0
        ? `删除章节「${info.name}」？里面的 ${info.wordCount} 个单词会移到词书「${info.moveToName}」末尾，不会被删除。`
        : `删除空章节「${info.name}」？`
      : info.totalWords > 0 || info.chapterCount > 0
        ? `删除词书「${info.name}」？${info.chapterCount > 0 ? `其 ${info.chapterCount} 个章节会一并删除，` : ""}共 ${info.totalWords} 个单词会移到「${info.moveToName}」末尾，不会被删除。`
        : `删除空词书「${info.name}」？`;
    if (window.confirm(msg)) {
      removeBook(id);
      setOpenBookId(null);
      refresh();
    }
  };

  /** 手动勾选 → 用选中单词开始测试（快照经 /test?ids= 传递） */
  const startTestWithChecked = () => {
    if (checkedIds.size === 0) return;
    navigate(`/test?ids=${[...checkedIds].join(",")}`);
  };

  const handleAdd = () => {
    if (!word.trim()) return;
    // 词组固定进「我的词组」，单词进所选词书
    const toBook = addType === "phrase" ? PHRASE_BOOK_ID : targetBook;
    // 重复检查（同词 + 同类型才算重复，单词和词组互不干扰）
    const dup = words.find(
      (w) => w.word.toLowerCase() === word.trim().toLowerCase() && w.type === addType,
    );
    const definitions = defs.split(/[;；]/).map((d) => d.trim()).filter(Boolean);
    if (addWord(word, addType === "phrase" ? "" : pos, definitions, toBook, addType)) {
      setWord("");
      setDefs("");
      showTip(
        dup
          ? `「${dup.word}」已存在，义项已合并进去`
          : addType === "phrase"
            ? `词组已加入「我的词组」`
            : "添加成功",
      );
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
  const rootBooks = books.filter((b) => b.parentId === null);
  const openBook = books.find((b) => b.id === openBookId) ?? null;
  const openBookIsChapter = openBook?.parentId != null;
  const openBookChapters = openBook && !openBookIsChapter ? getChapters(openBook.id) : [];

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
          {rootBooks.map((b) => (
            <optgroup key={b.id} label={b.name} className="bg-[#0a0d12]">
              <option value={b.id} className="bg-[#0a0d12]">
                {b.name}（直接加入词书）
              </option>
              {getChapters(b.id).map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0a0d12]">
                  ↳ {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </section>

      {/* 手动添加 */}
      <section className="glass-card rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold tracking-wide text-white">手动添加</h2>
          {/* 单词 / 词组 分开的添加入口；词组固定进「我的词组」 */}
          <div className="flex rounded-full border border-white/10 p-1">
            {(["word", "phrase"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAddType(t)}
                className={`min-h-[32px] rounded-full px-4 text-xs tracking-wide transition-all duration-300 ${
                  addType === t
                    ? "bg-blue-400/20 text-blue-100 shadow-[0_0_12px_rgba(96,165,250,0.25)]"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {t === "word" ? "添加单词" : "添加词组"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={addType === "phrase" ? "英文词组，如 take into account" : "英文单词，如 plateau"}
              className="glass-input min-h-[44px] flex-1 rounded-xl px-4 tracking-wide"
            />
            {addType === "word" && (
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
            )}
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
            {addType === "phrase"
              ? "词组会加入「我的词组」，与单词分开统计；测试时可用类型筛选单独抽词组。"
              : "同一个单词分多次添加不同词性会自动合并；已存在的单词会提示合并而不是重复添加。"}
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
            {rootBooks.map((b) => {
              const chapters = getChapters(b.id);
              const count = bookWordCount(b.id);
              const chapterWords = chapters.reduce((s, c) => s + bookWordCount(c.id), 0);
              return (
                <li key={b.id} className="flex flex-col gap-2">
                  <button
                    onClick={() => openBookModal(b.id, b.name)}
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
                        {chapters.length > 0
                          ? `自身 ${count} 个 · 章节共 ${chapterWords} 个`
                          : `${count} 个单词`}
                      </span>
                    </span>
                    <span className="text-xs tracking-wide text-white/20 transition-colors group-hover:text-blue-200/70">
                      点开 →
                    </span>
                  </button>
                  {chapters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openBookModal(c.id, c.name)}
                      className="glass-card group ml-6 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-300 hover:border-blue-300/25"
                    >
                      <span className="font-mono text-xs text-white/25">↳</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm tracking-wide text-white/85">
                          {c.name}
                        </span>
                      </span>
                      <span className="font-mono text-xs tracking-wide text-white/30">
                        {bookWordCount(c.id)} 个
                      </span>
                    </button>
                  ))}
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
            className="glass-card flex h-[92vh] max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl p-5 pb-3 sm:rounded-3xl"
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
                  {openBookTotal} 个单词
                  {!openBookIsChapter && openBookChapters.length > 0 &&
                    ` · 章节共 ${openBookChapters.reduce((s, c) => s + bookWordCount(c.id), 0)} 个`}
                </p>
              </div>
              {openBookTotal > 0 && (
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
            {selecting && openBookTotal > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-400/5 px-4 py-2.5">
                <button
                  onClick={() =>
                    allChecked
                      ? setCheckedIds(new Set())
                      : setCheckedIds(new Set(openBookWords.map((w) => w.id)))
                  }
                  className="min-h-[36px] rounded-full border border-white/15 px-4 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200"
                >
                  {allChecked ? "取消全选" : "全选本页"}
                </button>
                <span className="font-mono text-xs tracking-wide text-white/40">
                  已选 {checkedIds.size} 个
                </span>
                <span className="flex-1" />
                <button
                  onClick={startTestWithChecked}
                  disabled={checkedIds.size === 0}
                  className="glow-btn min-h-[36px] rounded-full px-4 text-xs tracking-wide disabled:opacity-30"
                >
                  <Play className="mr-1 inline h-3.5 w-3.5" /> 用选中单词开始测试
                </button>
                <button
                  onClick={() => {
                    if (checkedIds.size === 0) return;
                    navigate(`/test?mode=dictation&ids=${[...checkedIds].join(",")}`);
                  }}
                  disabled={checkedIds.size === 0}
                  className="min-h-[36px] rounded-full border border-blue-300/25 px-4 text-xs tracking-wide text-blue-200/80 transition-colors hover:border-blue-300/50 hover:text-blue-200 disabled:opacity-30"
                >
                  <Volume2 className="mr-1 inline h-3.5 w-3.5" /> 听写选中
                </button>
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
                <ul className="flex flex-col gap-1.5">
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

            {/* 分页条：上一页 / 页码 / 下一页 / 跳转 / 每页数量 / 范围文案 */}
            {openBookTotal > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="min-h-[32px] rounded-full border border-white/15 px-3 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200 disabled:opacity-30"
                >
                  上一页
                </button>
                <span className="font-mono text-xs tracking-wide text-white/50">
                  {page} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                  className="min-h-[32px] rounded-full border border-white/15 px-3 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200 disabled:opacity-30"
                >
                  下一页
                </button>
                <input
                  value={jumpText}
                  onChange={(e) => setJumpText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const n = parseInt(jumpText, 10);
                    if (!Number.isNaN(n)) setPage(Math.min(pageCount, Math.max(1, n)));
                    setJumpText("");
                  }}
                  placeholder="跳页"
                  aria-label="跳转到页码"
                  className="glass-input min-h-[32px] w-16 rounded-full px-3 text-center text-xs"
                />
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) as 10 | 15 | 20);
                    setPage(1);
                  }}
                  aria-label="每页数量"
                  className="glass-input min-h-[32px] rounded-full px-2 text-xs"
                >
                  {[10, 15, 20].map((n) => (
                    <option key={n} value={n} className="bg-[#0a0d12]">
                      {n} / 页
                    </option>
                  ))}
                </select>
                <span className="flex-1" />
                <span className="font-mono text-xs tracking-wide text-white/40">
                  第 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, openBookTotal)} / 共 {openBookTotal} 个
                </span>
              </div>
            )}

            {/* 章节管理：仅词书（非章节）显示；默认收起，把高度让给单词列表 */}
            {!openBookIsChapter && (
              <details className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5">
                <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/50">
                  章节管理（共 {openBookChapters.length} 个）▾
                </summary>
                <div className="pt-3">
                {openBookChapters.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-1.5">
                    {openBookChapters.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <button
                          onClick={() => openBookModal(c.id, c.name)}
                          className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm tracking-wide text-white/70 transition-colors hover:bg-white/5 hover:text-blue-200"
                        >
                          ↳ {c.name}
                        </button>
                        <span className="font-mono text-xs tracking-wide text-white/30">
                          {bookWordCount(c.id)} 个
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={newChapterName}
                    onChange={(e) => setNewChapterName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateChapter(openBook.id)}
                    placeholder="新章节名称，如 Unit 1"
                    className="glass-input min-h-[36px] flex-1 rounded-full px-4 text-xs tracking-wide"
                  />
                  <button
                    onClick={() => handleCreateChapter(openBook.id)}
                    disabled={!newChapterName.trim()}
                    className="ghost-btn min-h-[36px] px-4 text-xs tracking-wide hover:!border-blue-300/40 hover:!text-blue-200 disabled:opacity-30"
                  >
                    <FolderPlus className="h-3.5 w-3.5" /> 新建章节
                  </button>
                </div>
                </div>
              </details>
            )}

            {openBook.id !== DEFAULT_BOOK_ID && openBook.id !== PHRASE_BOOK_ID && (
              <button
                onClick={() => handleRemoveBook(openBook.id)}
                className="mt-4 self-start text-xs tracking-wide text-white/25 transition-colors hover:text-red-300"
              >
                {openBookIsChapter
                  ? "删除这个章节（单词移回所属词书）"
                  : "删除这本词书（章节一并删除，单词保留到默认词书）"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
