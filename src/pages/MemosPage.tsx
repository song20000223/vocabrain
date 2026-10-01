import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Trash2, Pencil, X, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import {
  addMemo,
  allMemoTags,
  getRelatedWords,
  removeMemo,
  searchMemos,
  updateMemo,
  type MemoItem,
} from "@/lib/memo";
import { getBooks } from "@/lib/store";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useEscapeClose } from "@/lib/useEscapeClose";

/** 备忘录：搜索 + 标签筛选 + 列表（展开/编辑/删除），与单词双向关联 */
export default function MemosPage() {
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 新建/编辑
  const [editing, setEditing] = useState<MemoItem | null>(null); // null=新建草稿未开
  const [draftOpen, setDraftOpen] = useState(false);
  const [deletingMemo, setDeletingMemo] = useState<{ id: string; title: string } | null>(null);
  useEscapeClose(draftOpen, () => setDraftOpen(false));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");

  const navigate = useNavigate();
  const refresh = () => setMemos(searchMemos(query, tag || undefined));

  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener("vocab-store-change", h);
    return () => window.removeEventListener("vocab-store-change", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tag]);

  const tags = useMemo(() => allMemoTags(), [memos]);
  const books = getBooks();
  const bookName = (id?: string | null) =>
    id ? (books.find((b) => b.id === id)?.name ?? "") : "";

  const openDraft = (m?: MemoItem) => {
    setEditing(m ?? null);
    setTitle(m?.title ?? "");
    setContent(m?.content ?? "");
    setTagsText((m?.tags ?? []).join(" "));
    setDraftOpen(true);
  };

  const saveDraft = () => {
    if (!title.trim() && !content.trim()) return;
    const tags = tagsText.split(/[\s,，、]+/).filter(Boolean);
    if (editing) updateMemo(editing.id, { title: title.trim(), content, tags });
    else addMemo(title.trim(), content, { tags });
    setDraftOpen(false);
    refresh();
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">Memos</p>
          <h1 className="hero-title mt-3 text-4xl">备忘录</h1>
        </div>
        <button
          onClick={() => openDraft()}
          className="glow-btn min-h-[44px] rounded-full px-6 text-sm tracking-wide"
        >
          <Plus className="h-4 w-4" /> 新建笔记
        </button>
      </div>

      {/* 搜索 + 标签 */}
      <div className="glass-card flex flex-col gap-3 rounded-2xl p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题、正文、标签…"
            className="glass-input min-h-[44px] w-full rounded-xl pl-11 pr-4 tracking-wide"
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTag("")}
              className={`min-h-[30px] rounded-full border px-3 text-xs tracking-wide transition-colors ${
                !tag ? "border-blue-300/50 text-blue-100" : "border-white/10 text-white/40 hover:text-white/70"
              }`}
            >
              全部
            </button>
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? "" : t)}
                className={`min-h-[30px] rounded-full border px-3 text-xs tracking-wide transition-colors ${
                  tag === t
                    ? "border-blue-300/50 text-blue-100"
                    : "border-white/10 text-white/40 hover:text-white/70"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 列表 */}
      {memos.length === 0 ? (
        <p className="glass-card rounded-2xl p-10 text-center text-sm tracking-wide text-white/35">
          还没有笔记。点「新建笔记」，或在单词行的笔记按钮上给某个词记一条。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {memos.map((m) => {
            const related = getRelatedWords(m);
            const open = expandedId === m.id;
            return (
              <li key={m.id} className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedId(open ? null : m.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {open ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-white/30" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-white/30" />
                    )}
                    <span className="truncate font-medium tracking-wide text-white">
                      {m.title || "（无标题）"}
                    </span>
                    {m.tags?.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] tracking-wide text-white/40"
                      >
                        {t}
                      </span>
                    ))}
                  </button>
                  {related.length > 0 && (
                    <span className="font-mono text-[10px] tracking-wide text-blue-200/60">
                      <Link2 className="mr-0.5 inline h-3 w-3" />
                      {related.length}
                    </span>
                  )}
                  <button
                    onClick={() => openDraft(m)}
                    aria-label={`编辑笔记 ${m.title}`}
                    className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full text-white/25 hover:text-blue-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingMemo({ id: m.id, title: m.title || "无标题" })}
                    aria-label={`删除笔记 ${m.title}`}
                    className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full text-white/25 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {open && (
                  <div className="mt-3 border-t border-white/8 pt-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed tracking-wide text-white/65">
                      {m.content || "（无正文）"}
                    </p>
                    {related.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-white/30">
                          关联单词
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {related.map(({ word, deleted }) => (
                            <button
                              key={word.id}
                              disabled={deleted}
                              onClick={() => navigate(`/words?focus=${word.id}`)}
                              title={deleted ? "该单词已删除（恢复后自动复原关联）" : "跳到词库查看"}
                              className={`min-h-[30px] rounded-full border px-3 font-mono text-xs tracking-wide transition-colors ${
                                deleted
                                  ? "cursor-not-allowed border-white/8 text-white/25 line-through"
                                  : "border-blue-300/25 text-blue-200/80 hover:border-blue-300/50 hover:text-blue-200"
                              }`}
                            >
                              {word.word}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="mt-3 font-mono text-[10px] tracking-wide text-white/25">
                      {m.bookId ? `${bookName(m.bookId)} · ` : ""}更新于{" "}
                      {new Date(m.updatedAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 删除确认 */}
      {deletingMemo && (
        <ConfirmDialog
          title={`删除笔记「${deletingMemo.title}」？`}
          desc="不影响关联的单词。"
          confirmText="删除"
          danger
          onConfirm={() => {
            removeMemo(deletingMemo.id);
            setDeletingMemo(null);
          }}
          onCancel={() => setDeletingMemo(null)}
        />
      )}

      {/* 新建/编辑弹窗 */}
      {draftOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDraftOpen(false)}
        >
          <div
            className="glass-card flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-wide text-white">
                {editing ? "编辑笔记" : "新建笔记"}
              </h3>
              <button
                onClick={() => setDraftOpen(false)}
                aria-label="关闭"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-white/40 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题，如 增益小词"
              className="glass-input min-h-[44px] rounded-xl px-4 tracking-wide"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="定义、说明、例句…"
              rows={6}
              className="glass-input w-full resize-y rounded-xl p-4 tracking-wide"
            />
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="标签（空格分隔，可空），如 语法 词性"
              className="glass-input min-h-[40px] rounded-xl px-4 text-sm tracking-wide"
            />
            {editing?.relatedWordIds?.length ? (
              <p className="text-xs tracking-wide text-white/35">
                已关联 {editing.relatedWordIds.length} 个单词（关联关系在单词侧管理）
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDraftOpen(false)}
                className="ghost-btn min-h-[40px] px-5 text-sm tracking-wide"
              >
                取消
              </button>
              <button
                onClick={saveDraft}
                disabled={!title.trim() && !content.trim()}
                className="glow-btn min-h-[40px] rounded-full px-6 text-sm tracking-wide disabled:opacity-35"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
