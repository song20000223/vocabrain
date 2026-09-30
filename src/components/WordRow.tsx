import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, CircleCheck, Volume2, StickyNote, Plus, X } from "lucide-react";
import { speak } from "@/lib/speak";
import { addMemo, getMemosForWord, type MemoItem } from "@/lib/memo";
import { getFamilyMembers, formatMeanings, type WordItem } from "@/lib/store";

/** 单词行（词库弹窗、搜索结果、错题本卡片共用）：
 * 常驻 ☐ 勾选 · 序号 · 单击单词开编辑弹窗 · 🔊 · 🔗词族 · 📝笔记 · 释义。
 * 🔗/📝 固定槽位：有值彩色、无值灰显占位；点击弹浮层（portal 到 body，移动端底部抽屉）。
 * compact：紧凑模式（错题本卡片用），去掉勾选/序号/编辑单击，只保留单词+释义+🔗/📝。
 */
export default function WordRow({
  it,
  onChanged,
  checked,
  onToggle,
  onEdit,
  compact = false,
}: {
  it: WordItem;
  onChanged: () => void;
  checked?: boolean;
  onToggle?: (id: string) => void;
  onEdit?: (w: WordItem) => void;
  compact?: boolean;
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
    if (compact) return; // 紧凑模式（错题本详情）不提供编辑入口，单词单击不动作
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
        {/* 常驻勾选框：只勾选，不触发其他（compact 模式不渲染） */}
        {!compact && (
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
        )}

        {/* 序号 + 单词（单击开编辑弹窗；移动端长按也可以）+ 徽章 */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          {!compact && (
            <span className="font-mono text-sm tracking-wide text-white/40">#{it.orderInBook}</span>
          )}
          <button
            onClick={openEdit}
            onTouchStart={compact ? undefined : touchStart}
            onTouchEnd={compact ? undefined : touchEnd}
            onTouchMove={compact ? undefined : touchEnd}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={compact ? undefined : `编辑 ${it.word}`}
            aria-readonly={compact || undefined}
            className={`select-none font-mono text-base tracking-wide text-white transition-colors ${compact ? "cursor-default" : "hover:text-blue-200"}`}
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
          {!compact && it.testedRounds > 0 && (
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

      {/* 🔗 词族浮层 / 📝 笔记浮层：portal 到 body + fixed 定位，脱离行内 overflow/backdrop-blur 裁剪；
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
