import { useEffect, useRef, useState } from "react";
import { X, Plus, ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import {
  getWords,
  getBooks,
  updateMeanings,
  setFamilyKey,
  getFamilyMembers,
  allFamilyKeys,
  formatMeanings,
  type WordItem,
} from "@/lib/store";
import { speak } from "@/lib/speak";
import { addMemo, getMemosForWord, type MemoItem } from "@/lib/memo";
import { useEscapeClose } from "@/lib/useEscapeClose";

interface EditGroup {
  pos: string;
  text: string;
}

const POS_OPTIONS = ["n.", "v.", "vt.", "vi.", "adj.", "adv.", "prep.", "conj.", "pron.", "num.", "int.", "其他"];

/**
 * 单词编辑弹窗：单击词库列表的单词文本触发。
 * 主区：单词 / 类型 / 归属词书 / 词族 / 词性+义项 / 关联笔记。
 * 底部「同族词条」折叠区：点某条 → 弹窗内切换编辑对象（不关窗），
 * 切换前自动保存当前未保存改动。
 */
export default function WordEditModal({
  wordId,
  onClose,
  onChanged,
  onJumpToWord,
}: {
  wordId: string;
  onClose: () => void;
  onChanged: () => void;
  /** 词族浮层等场景跳转词（打开所在词书弹窗）；编辑弹窗内切同族不需要 */
  onJumpToWord?: (w: WordItem) => void;
}) {
  const [currentId, setCurrentId] = useState(wordId);
  const it = getWords().find((w) => w.id === currentId) ?? null;

  const [groups, setGroups] = useState<EditGroup[]>([]);
  const [family, setFamily] = useState("");
  const [familyOpen, setFamilyOpen] = useState(false); // 同族折叠区
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ title: string; content: string } | null>(null);

  // 切词条（含首次）时装载表单
  useEffect(() => {
    const w = getWords().find((x) => x.id === currentId);
    if (!w) return;
    setGroups(
      w.meanings.length > 0
        ? w.meanings.map((m) => ({ pos: m.pos, text: m.definitions.join("；") }))
        : [{ pos: "", text: "" }],
    );
    setFamily(w.familyKey ?? "");
    setFamilyOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  if (!it) return null;

  const books = getBooks();
  const bookName = (id: string) => books.find((b) => b.id === id)?.name ?? "?";
  const familyMembers = it.familyKey ? getFamilyMembers(it.familyKey) : [];
  const relatedMemos = getMemosForWord(it.id);
  const familyCandidates = allFamilyKeys();

  /** 保存当前表单（切同族词条/关闭前都走这里，方案 1：自动保存） */
  const save = (targetId?: string) => {
    const id = targetId ?? it.id;
    const meanings = groups
      .map((g) => ({
        pos: g.pos.trim(),
        definitions: g.text
          .split(/[;；/]/)
          .map((d) => d.trim())
          .filter(Boolean),
      }))
      .filter((g) => g.pos || g.definitions.length > 0);
    updateMeanings(id, meanings);
    const fk = family.trim();
    const cur = getWords().find((x) => x.id === id);
    if (cur && (fk || undefined) !== cur.familyKey) setFamilyKey(id, fk || undefined);
    onChanged();
  };

  /** 弹窗内切换到同族词条：先自动保存当前改动 */
  const switchTo = (id: string) => {
    save(currentId); // 保存当前词条（用 currentId，避免 it 闭包过期）
    setCurrentId(id);
  };

  const close = () => {
    save(currentId);
    onClose();
  };
  useEscapeClose(true, close);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div
        className="glass-card flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-mono text-lg tracking-wide text-white">{it.word}</h3>
            <button
              onClick={() => speak(it.word)}
              aria-label={`朗读 ${it.word}`}
              className="shrink-0 text-blue-200/70 transition-colors hover:text-blue-200"
            >
              <Volume2 className="h-4 w-4" />
            </button>
            {it.type === "phrase" && (
              <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] tracking-wide text-white/40">
                词组
              </span>
            )}
          </div>
          <button onClick={close} aria-label="关闭" className="shrink-0 text-white/35 hover:text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* 归属词书（只读展示，挪书走词库页操作） */}
          <p className="text-xs tracking-wide text-white/40">
            归属：{bookName(it.bookId)} · #{it.orderInBook}
          </p>

          {/* 词族 */}
          <div>
            <label className="text-xs tracking-wide text-white/45">词族（同族词一起聚合；清空 = 移出词族）</label>
            <input
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              list="family-candidates"
              placeholder="如 crack；留空 = 不属于任何词族"
              className="glass-input mt-1.5 min-h-[40px] w-full rounded-xl px-3 font-mono text-sm tracking-wide"
            />
            <datalist id="family-candidates">
              {familyCandidates.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>

          {/* 词性 + 义项 */}
          <div className="space-y-2">
            <label className="text-xs tracking-wide text-white/45">释义（词性 + 义项，义项用 ；或 / 分隔）</label>
            {groups.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={g.pos}
                  onChange={(e) =>
                    setGroups(groups.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)))
                  }
                  className="glass-input min-h-[36px] w-24 rounded-lg px-2 text-xs"
                >
                  {POS_OPTIONS.map((p) => (
                    <option key={p} value={p === "其他" ? "" : p} className="bg-[#0a0d12]">
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
            <button
              onClick={() => setGroups([...groups, { pos: "", text: "" }])}
              className="ghost-btn min-h-[32px] px-3 text-xs"
            >
              <Plus className="h-3 w-3" /> 加词性
            </button>
          </div>

          {/* 同族词条折叠区（无词族不显示） */}
          {it.familyKey && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02]">
              <button
                onClick={() => setFamilyOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left"
              >
                <span className="text-xs tracking-wide text-blue-200/80">
                  同族词条（{familyMembers.length}）· {it.familyKey}
                </span>
                {familyOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-white/35" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-white/35" />
                )}
              </button>
              {familyOpen && (
                <ul className="border-t border-white/5 px-2 py-1">
                  {familyMembers.map((m) => (
                    <li key={m.id}>
                      <button
                        onClick={() => m.id !== it.id && switchTo(m.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                          m.id === it.id ? "text-blue-200" : "text-white/65 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span className={`font-mono ${m.deleted ? "line-through opacity-50" : ""}`}>
                          {m.word}
                        </span>
                        <span className="text-[10px] text-white/30">
                          {m.type === "phrase" ? "词组" : "单词"} · #{m.orderInBook}
                        </span>
                        {m.id === it.id && (
                          <span className="ml-auto text-[10px] text-blue-200/60">当前</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 关联笔记 */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
            <button
              onClick={() => setNotesOpen((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <span className="text-xs tracking-wide text-amber-200/70">
                关联笔记（{relatedMemos.length}）
              </span>
              {notesOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-white/35" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-white/35" />
              )}
            </button>
            {notesOpen && (
              <div className="mt-2">
                {relatedMemos.length > 0 && (
                  <ul className="mb-2 flex flex-col gap-1.5">
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
                    <Plus className="h-3 w-3" /> 新建关联笔记
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-white/5 pt-4">
          <button onClick={close} className="glow-btn min-h-[40px] rounded-full px-6 text-sm tracking-wide">
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
