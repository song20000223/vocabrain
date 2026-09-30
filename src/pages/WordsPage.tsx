import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Trash2,
  Upload,
  Download,
  Ban,
  Link2,
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
import { hasBackend } from "@/lib/apiMode";
import {
  addMemo,
  getMemosForWord,
  type MemoItem,
} from "@/lib/memo";
import ExportDialog from "@/components/ExportDialog";
import WordEditModal from "@/components/WordEditModal";
import { exportBackup, validateBackup, applyBackup, type BackupFile } from "@/lib/backup";
import { findFamilyCandidate, type FamilyCandidate } from "@/lib/family";
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
  setFamilyKey,
  getFamilyMembers,
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

/** 单词行（弹窗和搜索结果共用）：
 * 常驻 ☐ 勾选 · 序号 · 单击单词开编辑弹窗 · 🔊 · 🔗词族 · 📝笔记 · 释义。
 * 🔗/📝 固定槽位：有值彩色、无值灰显占位；点击弹浮层（移动端底部抽屉）。
 */
function WordRow({
  it,
  onChanged,
  checked,
  onToggle,
  onEdit,
}: {
  it: WordItem;
  onChanged: () => void;
  checked?: boolean;
  onToggle?: (id: string) => void;
  onEdit?: (w: WordItem) => void;
}) {
  const [noneTip, setNoneTip] = useState(false);
  // 浮层：family = 词族列表；notes = 关联笔记
  const [popover, setPopover] = useState<"family" | "notes" | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ title: string; content: string } | null>(null);
  const memoCount = getMemosForWord(it.id).length;
  const familyMembers = it.familyKey ? getFamilyMembers(it.familyKey) : [];
  const relatedMemos = popover === "notes" ? getMemosForWord(it.id) : [];
  const rowRef = useRef<HTMLLIElement>(null);
  // 浮层 fixed 定位的锚点（桌面端贴在行下方；移动端走 CSS 底部抽屉，不需要坐标）
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // 单击编辑的 300ms 节流（防双击/快速点击弹两次）
  const lastEditTap = useRef(0);
  // 长按进编辑（移动端），需 preventDefault 阻止 iOS 系统菜单
  const longPressTimer = useRef<number | null>(null);

  const openEdit = () => {
    const now = Date.now();
    if (now - lastEditTap.current < 300) return;
    lastEditTap.current = now;
    onEdit?.(it);
  };

  const handleSpeak = () => {
    const r = speak(it.word);
    if (r.reason === "no-english-voice" && !sessionStorage.getItem("vocab_tts_none_tip")) {
      sessionStorage.setItem("vocab_tts_none_tip", "1");
      setNoneTip(true);
      window.setTimeout(() => setNoneTip(false), 3500);
    }
  };

  // 点击行外关闭浮层
  useEffect(() => {
    if (!popover) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      const inRow = rowRef.current?.contains(t);
      const inPop = popRef.current?.contains(t);
      if (!inRow && !inPop) setPopover(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [popover]);

  // 浮层打开时：桌面端计算 fixed 锚点（脱离 overflow/backdrop-blur 裁剪），
  // 滚动/缩放时跟随行位置
  useEffect(() => {
    if (!popover) {
      setPopoverPos(null);
      return;
    }
    const update = () => {
      const r = rowRef.current?.getBoundingClientRect();
      if (!r) return;
      const NAV = 88; // 顶栏高度 + 安全距离
      const below = r.bottom + 6;
      // 行下方被固定导航遮住时，浮层翻到行上方（上限不越过导航）
      const top = below < NAV ? Math.max(r.top - 6 - 180, NAV) : below;
      // 向上偏移半行宽，避开与浮层同高处的兄弟区块
      setPopoverPos({ left: r.left + r.width * 0.22, top, width: r.width * 0.78 });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [popover]);

  // 长按：preventDefault 阻止 iOS Safari 选择/复制/词典系统菜单
  const touchStart = (e: React.TouchEvent) => {
    longPressTimer.current = window.setTimeout(() => {
      e.preventDefault();
      openEdit();
    }, 500);
  };
  const touchEnd = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <li
      ref={rowRef}
      className={`glass-card relative rounded-lg px-3 py-1.5 transition-all duration-300 ${
        it.excluded ? "opacity-45" : ""
      } ${checked ? "!border-blue-300/40" : ""}`}
    >
      <div className="flex items-center gap-2.5">
        {/* 常驻勾选框：只勾选，不触发其他 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(it.id);
          }}
          aria-label={`勾选 ${it.word}`}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${
            checked ? "border-blue-300 bg-blue-400/30 text-blue-100" : "border-white/25 text-transparent"
          }`}
        >
          <CircleCheck className="h-3.5 w-3.5" />
        </button>

        {/* 序号 + 单词（单击开编辑弹窗；移动端长按也可以）+ 徽章 */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-sm tracking-wide text-white/40">#{it.orderInBook}</span>
          <button
            onClick={openEdit}
            onTouchStart={touchStart}
            onTouchEnd={touchEnd}
            onTouchMove={touchEnd}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={`编辑 ${it.word}`}
            className="select-none font-mono text-base tracking-wide text-white transition-colors hover:text-blue-200"
          >
            {it.word}
          </button>
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

        {/* 右：释义（右对齐） */}
        <div className="hidden max-w-[40%] shrink-0 text-right text-sm tracking-wide text-white/55 sm:block">
          {formatMeanings(it.meanings).length > 0 ? (
            <p className="truncate" title={formatMeanings(it.meanings).join(" / ")}>
              {formatMeanings(it.meanings).join(" · ")}
            </p>
          ) : (
            <p className="text-white/25">（暂无释义）</p>
          )}
        </div>

        {/* 🔊 操作按钮（蓝色，永远可点）+ 🔗/📝 状态槽位（有值彩色无值灰显占位） */}
        <div className="flex shrink-0 items-center -mr-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSpeak();
            }}
            aria-label={`朗读 ${it.word}`}
            title="发音"
            className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full text-blue-300/80 transition-colors hover:text-blue-200"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPopover((v) => (v === "family" ? null : "family"));
            }}
            disabled={!it.familyKey}
            aria-label={`${it.word} 的词族`}
            title={it.familyKey ? `所属词族：${it.familyKey}（共 ${familyMembers.length} 个）` : "不属于任何词族"}
            className={`flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full transition-colors ${
              it.familyKey
                ? "text-blue-300/80 hover:text-blue-200"
                : "cursor-default text-white/12"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPopover((v) => (v === "notes" ? null : "notes"));
            }}
            aria-label={`${it.word} 的关联笔记`}
            title={memoCount > 0 ? `关联笔记：${memoCount} 条` : "记笔记"}
            className={`flex min-h-[28px] min-w-[28px] items-center justify-center rounded-full transition-colors ${
              memoCount > 0 ? "text-amber-200/80 hover:text-amber-200" : "text-white/12 hover:text-blue-200"
            }`}
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 窄屏补一行释义 */}
      <p className="mt-0.5 truncate pl-7 text-xs tracking-wide text-white/45 sm:hidden">
        {formatMeanings(it.meanings).join(" · ") || "（暂无释义）"}
      </p>

      {noneTip && (
        <p className="mt-1 text-[11px] tracking-wide text-amber-200/60">
          当前系统无英文语音，请到系统设置安装英语语音包
        </p>
      )}

      {/* 🔗 词族浮层 / 📝 笔记浮层：fixed 定位脱离行内 overflow/backdrop-blur 裁剪；
          桌面端贴在行下方（JS 锚点），移动端底部抽屉 */}
      {popover && popoverPos && createPortal(
        <div
          ref={popRef}
          style={{ left: popoverPos.left, top: popoverPos.top, width: popoverPos.width }}
          className="fixed z-[200] rounded-xl border border-white/10 bg-[#12161d] p-3 shadow-xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:left-auto max-sm:top-auto max-sm:w-auto max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:p-4"
          onClick={(e) => e.stopPropagation()}
        >
          {popover === "family" && (
            <>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-white/30">
                词族「{it.familyKey}」（{familyMembers.length}）
              </p>
              <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {familyMembers.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        setPopover(null);
                        if (m.id !== it.id) onEdit?.(m);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <span className={`font-mono ${m.deleted ? "line-through opacity-50" : ""}`}>
                        {m.word}
                      </span>
                      <span className="text-[10px] text-white/30">
                        {m.type === "phrase" ? "词组" : "单词"} · #{m.orderInBook}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {popover === "notes" && (
            <>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-white/30">
                关联笔记（{relatedMemos.length}）
              </p>
              {relatedMemos.length > 0 && (
                <ul className="mb-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                  {relatedMemos.map((m: MemoItem) => (
                    <li key={m.id} className="rounded-lg bg-white/[0.03] px-3 py-2">
                      <p className="text-sm font-medium tracking-wide text-white/85">
                        {m.title || "（无标题）"}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed tracking-wide text-white/55">
                        {m.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {noteDraft ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={noteDraft.title}
                    onChange={(e) => setNoteDraft({ ...noteDraft, title: e.target.value })}
                    placeholder="笔记标题"
                    className="glass-input min-h-[36px] rounded-lg px-3 text-sm tracking-wide"
                  />
                  <textarea
                    value={noteDraft.content}
                    onChange={(e) => setNoteDraft({ ...noteDraft, content: e.target.value })}
                    placeholder="内容…"
                    rows={3}
                    className="glass-input w-full resize-y rounded-lg p-3 text-sm tracking-wide"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setNoteDraft(null)}
                      className="min-h-[32px] rounded-full px-3 text-xs text-white/40 hover:text-white"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        if (!noteDraft.title.trim() && !noteDraft.content.trim()) return;
                        addMemo(noteDraft.title.trim(), noteDraft.content, {
                          relatedWordIds: [it.id],
                          bookId: it.bookId,
                        });
                        setNoteDraft(null);
                        onChanged();
                      }}
                      className="glow-btn min-h-[32px] rounded-full px-4 text-xs"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNoteDraft({ title: "", content: "" })}
                  className="ghost-btn min-h-[32px] px-3 text-xs"
                >
                  <Plus className="h-3 w-3" /> 新建
                </button>
              )}
            </>
          )}
        </div>,
        document.body,
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
  // 数据备份导入
  const backupFileRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
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
  // 批量选择（常驻 ☐，无多选模式）
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  // 单词编辑弹窗（单击单词文本触发）
  const [editWordId, setEditWordId] = useState<string | null>(null);
  // 词族归入确认（手动添加命中时）
  const [familyConfirm, setFamilyConfirm] = useState<{
    text: string;
    candidate: FamilyCandidate;
    proceed: (familyKey?: string) => void;
  } | null>(null);
  // 批量导入后的词族汇总（只列前 20 条）
  const [familyBatch, setFamilyBatch] = useState<{
    hits: { id: string; text: string; key: string }[];
  } | null>(null);
  // 分页（词书弹窗内列表）
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 15 | 20>(15);
  const [jumpText, setJumpText] = useState("");
  // 章节管理块展开状态（记忆）
  const [chapterPanelOpen, setChapterPanelOpen] = useState(
    () => localStorage.getItem("vocab_chapter_panel") === "1",
  );
  // 导出弹窗
  const [exportScope, setExportScope] = useState<{
    scopeLabel: string;
    scopeName: string;
    pool: WordItem[];
    withTime?: boolean;
  } | null>(null);

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
    clearChecked();
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

  // 笔记 → 单词跳转：/words?focus=wordId → 打开所在词书弹窗
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (!focus) return;
    const w = getWords().find((it) => it.id === focus);
    if (w) {
      const b = getBooks().find((it) => it.id === w.bookId);
      if (b) openBookModal(b.id, b.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showTip = (msg: string) => {
    setTip(msg);
    window.setTimeout(() => setTip(""), 3500);
  };

  // 数据备份导入：选文件 → 校验 → 弹覆盖/合并选择
  const handleBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!file) return;
    const v = validateBackup(await file.text());
    if (!v.ok) {
      showTip(`导入失败：${v.reason}`);
      return;
    }
    setPendingBackup(v.backup);
  };

  const confirmBackupImport = (mode: "overwrite" | "merge") => {
    if (!pendingBackup) return;
    applyBackup(pendingBackup, mode);
    setPendingBackup(null);
    window.alert(mode === "overwrite" ? "已覆盖导入，即将刷新页面" : "已合并导入，即将刷新页面");
    window.location.reload();
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
    // 词族自动识别：命中已有词族且本会话未拒过 → 先弹确认
    const cand = findFamilyCandidate(word, words);
    if (
      cand &&
      !sessionStorage.getItem(`vocab_family_declined_${cand.key}`)
    ) {
      const w = word, p = pos, d = defs, t = addType, bk = targetBook;
      setFamilyConfirm({
        text: w,
        candidate: cand,
        proceed: (fk) => {
          setFamilyConfirm(null);
          // 归入时把命中但尚无 familyKey 的已有成员（如核心词本身）一并入族
          if (fk) for (const m of cand.members) if (!m.familyKey) setFamilyKey(m.id, fk);
          doAdd(w, p, d, t, bk, fk);
        },
      });
      return;
    }
    doAdd(word, pos, defs, addType, targetBook);
  };

  const doAdd = (
    wordText: string,
    posVal: string,
    defsText: string,
    type: "word" | "phrase",
    book: string,
    familyKey?: string,
  ) => {
    // 词组固定进「我的词组」，单词进所选词书
    const toBook = type === "phrase" ? PHRASE_BOOK_ID : book;
    // 重复检查（同词 + 同类型才算重复，单词和词组互不干扰）
    const dup = words.find(
      (w) => w.word.toLowerCase() === wordText.trim().toLowerCase() && w.type === type,
    );
    const definitions = defsText.split(/[;；]/).map((d) => d.trim()).filter(Boolean);
    if (addWord(wordText, type === "phrase" ? "" : posVal, definitions, toBook, type, familyKey)) {
      setWord("");
      setDefs("");
      showTip(
        dup
          ? dup.bookId !== toBook
            ? `「${dup.word}」已存在于「${bookName(dup.bookId)}」，义项已合并到该书，未加入「${bookName(toBook)}」`
            : `「${dup.word}」已存在，义项已合并进去`
          : type === "phrase"
            ? `词组已加入「我的词组」`
            : "添加成功",
      );
      refresh();
    }
  };

  const handleImport = () => {
    if (!batchText.trim()) return;
    // 导入前收集可归族条目（导入后 words 变了，先算好）
    const lines = batchText.split("\n").map((l) => l.trim()).filter(Boolean);
    const { added, skipped } = importWords(batchText, targetBook);
    setBatchText("");
    showTip(
      skipped > 0
        ? `成功导入/合并 ${added} 条；${skipped} 行无法识别，已跳过`
        : `成功导入/合并 ${added} 条`,
    );
    refresh();
    // 汇总词族命中：导入后新状态里找（同词文本匹配 id），不逐条弹
    const fresh = getWords();
    const hits: { id: string; text: string; key: string }[] = [];
    for (const line of lines) {
      const text = line.split(/[\t,，]/)[0]?.trim() ?? "";
      if (!text) continue;
      const cand = findFamilyCandidate(text, fresh);
      if (!cand || sessionStorage.getItem(`vocab_family_declined_${cand.key}`)) continue;
      const w = fresh.find(
        (x) => x.word.toLowerCase() === text.toLowerCase() && !x.familyKey,
      );
      if (w) hits.push({ id: w.id, text, key: cand.key });
    }
    if (hits.length > 0) setFamilyBatch({ hits });
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
    // 纯前端模式：不发起 AI 请求（UI 层显示「AI 查词未启用」）
    if (!hasBackend) {
      setAiLoading(false);
      return;
    }
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
    const dup = words.find((it) => it.word.toLowerCase() === w.toLowerCase());
    if (addWord(w, pos, definitions, targetBook)) {
      showTip(
        dup
          ? dup.bookId !== targetBook
            ? `「${w}」已存在于「${bookName(dup.bookId)}」，义项已合并到该书，未加入「${bookName(targetBook)}」`
            : `「${w}」已在词库中，义项已合并`
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
  const clearChecked = () => setCheckedIds(new Set());
  const allChecked =
    openBookWords.length > 0 && openBookWords.every((w) => checkedIds.has(w.id));

  const batchDelete = () => {
    if (checkedIds.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${checkedIds.size} 个单词？此操作不可恢复。`)) return;
    for (const id of checkedIds) removeWord(id);
    showTip(`已删除 ${checkedIds.size} 个单词`);
    clearChecked();
    refresh();
  };
  const batchExclude = (exclude: boolean) => {
    if (checkedIds.size === 0) return;
    for (const id of checkedIds) {
      const w = words.find((it) => it.id === id);
      if (w && w.excluded !== exclude) toggleExcluded(id);
    }
    showTip(exclude ? `已将 ${checkedIds.size} 个单词设为不再测` : `已恢复 ${checkedIds.size} 个单词`);
    clearChecked();
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
                      <WordRow
                        it={it}
                        onChanged={refresh}
                        checked={checkedIds.has(it.id)}
                        onToggle={toggleCheck}
                        onEdit={(w) => setEditWordId(w.id)}
                      />
                    </div>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* AI 翻译：输入英文给释义，输入中文给候选英文词，一键加入词书；纯前端模式提示未启用 */}
        {query.trim().length >= 2 && !hasBackend && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs tracking-wide text-white/35">
              纯前端模式：AI 查词未启用（未配置后端 VITE_API_URL）
            </p>
          </div>
        )}
        {query.trim().length >= 2 && hasBackend && (aiLoading || aiResult || aiError) && (
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

      {/* 数据备份（全量导出/导入，含单词/词书/备忘录/错题本/设置） */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold tracking-wide text-white">数据备份</h2>
        <p className="mt-2 text-sm leading-relaxed tracking-wide text-white/40">
          全部数据只存在本浏览器 localStorage，清除浏览器数据会丢失。建议定期导出备份。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => setTip(`已导出 ${exportBackup()}`)}
            className="ghost-btn min-h-[44px] px-7 text-sm tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
          >
            <Download className="h-4 w-4" /> 导出备份
          </button>
          <button
            onClick={() => backupFileRef.current?.click()}
            className="ghost-btn min-h-[44px] px-7 text-sm tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
          >
            <Upload className="h-4 w-4" /> 导入备份
          </button>
          <input
            ref={backupFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="选择备份文件"
            onChange={handleBackupFile}
          />
        </div>
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
                          ? `${count + chapterWords} 个单词 · ${chapters.length} 个章节`
                          : `${count} 个单词`}
                      </span>
                    </span>
                    <span className="text-xs tracking-wide text-white/20 transition-colors group-hover:text-blue-200/70">
                      点开 →
                    </span>
                  </button>
                  {b.id !== DEFAULT_BOOK_ID && b.id !== PHRASE_BOOK_ID && (
                    <button
                      onClick={() => {
                        openBookModal(b.id, b.name);
                        setChapterPanelOpen(true);
                        localStorage.setItem("vocab_chapter_panel", "1");
                      }}
                      className="ml-1 text-xs tracking-wide text-white/25 transition-colors hover:text-blue-200"
                    >
                      + 新建章节
                    </button>
                  )}
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
            clearChecked();
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
                  onClick={() => {
                    const ids = openBookWords.map((w) => w.id);
                    if (ids.length > 0)
                      navigate(`/test?mode=dictation&ids=${ids.join(",")}`);
                  }}
                  title="一键听写当前页"
                  className="ghost-btn min-h-[40px] shrink-0 px-4 text-xs tracking-wide hover:!border-blue-300/40 hover:!text-blue-200"
                >
                  <Volume2 className="mr-1 inline h-3.5 w-3.5" /> 听写本页
                </button>
              )}
              {true && (
                <button
                  onClick={() => {
                    // 范围跟当前节点走：词书含章节，章节仅自身
                    const ids = openBookIsChapter
                      ? [openBook.id]
                      : [openBook.id, ...openBookChapters.map((c) => c.id)];
                    const pool = words.filter((w) => ids.includes(w.bookId));
                    const chapterWords = openBookChapters.reduce(
                      (s, c) => s + bookWordCount(c.id),
                      0,
                    );
                    setExportScope({
                      scopeLabel: openBookIsChapter
                        ? `${openBook.name}（共 ${pool.length} 个）`
                        : openBookChapters.length > 0
                          ? `${openBook.name}（含 ${openBookChapters.length} 章节，共 ${openBookTotal + chapterWords} 个）`
                          : `${openBook.name}（共 ${pool.length} 个）`,
                      scopeName: openBook.name,
                      pool,
                    });
                  }}
                  disabled={openBookTotal === 0 && openBookChapters.length === 0}
                  title="导出当前范围单词"
                  className="ghost-btn min-h-[40px] shrink-0 px-4 text-xs tracking-wide hover:!border-blue-300/40 hover:!text-blue-200 disabled:opacity-30"
                >
                  导出
                </button>
              )}
              <button
                onClick={() => {
                  setOpenBookId(null);
                  clearChecked();
                }}
                aria-label="关闭"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-white/40 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 批量操作工具栏（常驻；勾选框每行常驻） */}
            {openBookTotal > 0 && (
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
                {checkedIds.size > 0 && (
                  <button
                    onClick={() => setCheckedIds(new Set())}
                    className="min-h-[36px] rounded-full border border-white/15 px-4 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200"
                  >
                    清空选择
                  </button>
                )}
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
                  onClick={() => {
                    const pool = words.filter((w) => checkedIds.has(w.id));
                    if (pool.length > 0)
                      setExportScope({
                        scopeLabel: `选中的 ${pool.length} 个单词`,
                        scopeName: "选中单词",
                        pool,
                      });
                  }}
                  disabled={checkedIds.size === 0}
                  className="min-h-[36px] rounded-full border border-white/15 px-4 text-xs tracking-wide text-white/70 transition-colors hover:border-blue-300/40 hover:text-blue-200 disabled:opacity-30"
                >
                  导出选中
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
                      checked={checkedIds.has(it.id)}
                      onToggle={toggleCheck}
                      onEdit={(w) => setEditWordId(w.id)}
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

            {/* 章节管理：仅词书（非章节）显示；默认收起，把高度让给单词列表；展开状态记忆 */}
            {!openBookIsChapter && (
              <details
                className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5"
                open={chapterPanelOpen}
                onToggle={(e) => {
                  const open = (e.target as HTMLDetailsElement).open;
                  setChapterPanelOpen(open);
                  localStorage.setItem("vocab_chapter_panel", open ? "1" : "0");
                }}
              >                <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-widest text-white/30 hover:text-white/50">
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
      {/* 词族归入确认（手动添加命中） */}
      {familyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-card w-full max-w-sm rounded-2xl p-6">
            <h3 className="font-semibold tracking-wide text-white">归入已有词族？</h3>
            <p className="mt-2 text-sm leading-relaxed tracking-wide text-white/45">
              检测到已有相关词族「{familyConfirm.candidate.key}」（含{" "}
              {familyConfirm.candidate.members
                .slice(0, 3)
                .map((m) => m.word)
                .join("、")}
              {familyConfirm.candidate.members.length > 3 &&
                ` 等 ${familyConfirm.candidate.members.length} 条`}
              ），「{familyConfirm.text}」是否归入？
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => familyConfirm.proceed(familyConfirm.candidate.key)}
                className="glow-btn min-h-[44px] flex-1 rounded-full text-sm tracking-wide"
              >
                归入
              </button>
              <button
                onClick={() => {
                  // 本会话记住拒绝，同族不再反复弹
                  sessionStorage.setItem(
                    `vocab_family_declined_${familyConfirm.candidate.key}`,
                    "1",
                  );
                  familyConfirm.proceed(undefined);
                }}
                className="ghost-btn min-h-[44px] flex-1 text-sm tracking-wide"
              >
                不归入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量导入词族汇总（只列前 20 条，逐条归入/跳过） */}
      {familyBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-card flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl p-6">
            <h3 className="font-semibold tracking-wide text-white">
              有 {familyBatch.hits.length} 条可归入已有词族
            </h3>
            <p className="mt-1 text-xs tracking-wide text-white/40">
              逐条处理；全部处理完或点「完成」关闭。
            </p>
            <ul className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
              {familyBatch.hits.slice(0, 20).map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-2 rounded-xl border border-white/8 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-white">
                    {h.text}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-blue-200/60">
                    → {h.key}
                  </span>
                  <button
                    onClick={() => {
                      setFamilyKey(h.id, h.key);
                      // 命中但尚无 familyKey 的已有成员（如核心词本身）一并入族
                      const cand = findFamilyCandidate(h.text, getWords(), h.id);
                      if (cand) for (const m of cand.members) if (!m.familyKey) setFamilyKey(m.id, h.key);
                      setFamilyBatch((b) =>
                        b ? { hits: b.hits.filter((x) => x.id !== h.id) } : b,
                      );
                      refresh();
                    }}
                    className="min-h-[32px] shrink-0 rounded-full border border-blue-300/25 px-3 text-xs text-blue-200/80 hover:border-blue-300/50"
                  >
                    归入
                  </button>
                  <button
                    onClick={() =>
                      setFamilyBatch((b) =>
                        b ? { hits: b.hits.filter((x) => x.id !== h.id) } : b,
                      )
                    }
                    className="min-h-[32px] shrink-0 rounded-full px-2 text-xs text-white/35 hover:text-white/60"
                  >
                    跳过
                  </button>
                </li>
              ))}
            </ul>
            {familyBatch.hits.length > 20 && (
              <p className="mt-2 text-center font-mono text-[11px] text-white/30">
                仅显示前 20 条，处理完自动续上
              </p>
            )}
            <button
              onClick={() => setFamilyBatch(null)}
              className="glow-btn mt-4 min-h-[40px] rounded-full text-sm tracking-wide"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* 单词编辑弹窗（单击单词触发；内含同族词条折叠区 + 关联笔记） */}
      {editWordId && (
        <WordEditModal
          wordId={editWordId}
          onClose={() => setEditWordId(null)}
          onChanged={refresh}
        />
      )}

      {/* 备份导入方式选择 */}
      {pendingBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-card w-full max-w-sm rounded-2xl p-6">
            <h3 className="font-semibold tracking-wide text-white">选择导入方式</h3>
            <p className="mt-2 text-sm leading-relaxed tracking-wide text-white/45">
              备份导出于{" "}
              {new Date(pendingBackup.exportedAt).toLocaleString("zh-CN")}。
              合并会保留本地现有数据（冲突以备份为准）；覆盖会清空后恢复为备份内容。
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => confirmBackupImport("merge")}
                className="glow-btn min-h-[44px] rounded-full text-sm tracking-wide"
              >
                合并导入（保留现有数据）
              </button>
              <button
                onClick={() => confirmBackupImport("overwrite")}
                className="ghost-btn min-h-[44px] text-sm tracking-wide hover:!border-red-300/40 hover:!text-red-200"
              >
                覆盖导入（清空现有数据）
              </button>
              <button
                onClick={() => setPendingBackup(null)}
                className="min-h-[36px] text-xs tracking-wide text-white/35 hover:text-white/60"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 导出弹窗 */}
      {exportScope && (
        <ExportDialog
          scopeLabel={exportScope.scopeLabel}
          scopeName={exportScope.scopeName}
          pool={exportScope.pool}
          withTime={exportScope.withTime}
          onClose={() => setExportScope(null)}
        />
      )}
    </div>
  );
}
