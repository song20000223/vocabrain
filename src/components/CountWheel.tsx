import { useEffect, useRef, useState } from "react";

interface Props {
  min?: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  /** 单位文案，如 "题" */
  unit?: string;
  /** 滚动步长（默认 1） */
  step?: number;
}

const ITEM_H = 44; // 每格高度
const VISIBLE = 5; // 可见格数（奇数，中央为选中格）

/**
 * 转轴数字选择器：滚筒滚动 + scroll-snap 吸附 + 中央高亮带 + 上下渐隐遮罩。
 * 支持触摸滑动、鼠标滚轮、点击某格直接跳转；右侧配数字输入框，两者双向联动。
 */
export default function CountWheel({ min = 1, max, value, onChange, unit = "题", step = 1 }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const [active, setActive] = useState(value);
  // 输入框文本（允许中间态，如清空重输）；失焦/回车时收敛到合法值
  const [text, setText] = useState(String(value));
  // 转轴候选值：min, min+step, ..., 不超过 max
  const items: number[] = [];
  for (let v = min; v <= max; v += step) items.push(v);
  if (items[items.length - 1] !== max) items.push(max);

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));

  // 滚动到指定值（初始化 & 外部变化时）
  const scrollTo = (v: number, smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    const idx = items.indexOf(v);
    if (idx >= 0) el.scrollTo({ top: idx * ITEM_H, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    scrollTo(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value !== active) {
      setActive(value);
      setText(String(value));
      scrollTo(value, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (v: number) => {
    const c = clamp(v);
    setActive(c);
    setText(String(c));
    scrollTo(c, true);
    onChange(c);
    navigator.vibrate?.(8);
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const idxOf = () => {
      const i = Math.round(el.scrollTop / ITEM_H);
      return items[Math.min(items.length - 1, Math.max(0, i))];
    };
    // 滚动停止 120ms 后吸附到最近的一格
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const v = idxOf();
      const i = items.indexOf(v);
      el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
      // 与外部受控值比较（不是 active——active 滚动中已实时更新，
      // 用它比较会吞掉 onChange，导致"数量设了不生效"）
      setActive(v);
      setText(String(v));
      if (v !== value) {
        onChange(v);
        navigator.vibrate?.(8);
      }
    }, 120);
    // 滚动过程中实时更新高亮
    const v = idxOf();
    if (v !== active) {
      setActive(v);
      setText(String(v));
    }
  };

  const commitText = () => {
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) {
      setText(String(value));
      return;
    }
    commit(n);
  };

  return (
    <div className="flex items-start gap-3">
      <div className="relative flex-1 select-none" style={{ height: ITEM_H * VISIBLE }}>
        {/* 上下渐隐遮罩，营造滚筒纵深 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[70px] bg-gradient-to-b from-[#0c1016]/95 via-[#0c1016]/40 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[70px] bg-gradient-to-t from-[#0c1016]/95 via-[#0c1016]/40 to-transparent" />

        {/* 中央高亮带 */}
        <div
          className="pointer-events-none absolute inset-x-3 z-10 rounded-xl border border-blue-300/30 bg-blue-300/[0.06]"
          style={{ top: ITEM_H * 2, height: ITEM_H, boxShadow: "0 0 20px rgba(96,165,250,0.12), inset 0 1px 0 rgba(255,255,255,0.06)" }}
        />

        {/* 滚筒 */}
        <ul
          ref={listRef}
          onScroll={handleScroll}
          className="h-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2 }}
        >
          {items.map((n, idx) => {
            const isActive = n === active;
            // 只对可视区域（前后各 3 格）算距离渐变，远处直接最暗，避免长列表滚动卡顿
            const dist = Math.abs(idx - items.indexOf(active));
            const near = dist <= 3;
            return (
              <li key={n} className="snap-center">
                <button
                  type="button"
                  onClick={() => commit(n)}
                  className="flex w-full items-center justify-center gap-1 font-mono transition-all duration-200"
                  style={{
                    height: ITEM_H,
                    fontSize: isActive ? 22 : 14,
                    // 选中项放大 1.2 倍 + 蓝色辉光；刻度向选中项渐变亮
                    transform: isActive ? "scale(1.2)" : "scale(1)",
                    color: isActive
                      ? "#bfdbfe"
                      : near
                        ? `rgba(255,255,255,${dist === 1 ? 0.45 : dist === 2 ? 0.3 : 0.22})`
                        : "rgba(255,255,255,0.16)",
                    fontWeight: isActive ? 600 : 400,
                    textShadow: isActive
                      ? "0 0 16px rgba(96,165,250,0.65), 0 0 4px rgba(147,197,253,0.8)"
                      : "none",
                    filter: isActive ? "drop-shadow(0 0 8px rgba(96,165,250,0.35))" : "none",
                  }}
                >
                  {n}
                  {isActive && <span className="ml-1 text-xs font-normal tracking-widest text-blue-200/60">{unit}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 数字输入框：与转轴双向联动，支持任意精确值（不限步长） */}
      <input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="抽取数量"
        className="mt-[88px] w-20 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center font-mono text-sm text-white outline-none focus:border-blue-300/40"
      />
    </div>
  );
}
