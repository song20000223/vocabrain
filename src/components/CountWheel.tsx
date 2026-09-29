import { useEffect, useRef, useState } from "react";

interface Props {
  min?: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  /** 单位文案，如 "题" */
  unit?: string;
}

const ITEM_H = 44; // 每格高度
const VISIBLE = 5; // 可见格数（奇数，中央为选中格）

/**
 * 转轴数字选择器：滚筒滚动 + scroll-snap 吸附 + 中央高亮带 + 上下渐隐遮罩。
 * 支持触摸滑动、鼠标滚轮、点击某格直接跳转。
 */
export default function CountWheel({ min = 1, max, value, onChange, unit = "题" }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const [active, setActive] = useState(value);
  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  // 滚动到指定值（初始化 & 外部变化时）
  const scrollTo = (v: number, smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: (v - min) * ITEM_H, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    scrollTo(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value !== active) {
      setActive(value);
      scrollTo(value, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    // 滚动停止 120ms 后吸附到最近的一格
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_H);
      const v = Math.min(max, Math.max(min, min + idx));
      el.scrollTo({ top: (v - min) * ITEM_H, behavior: "smooth" });
      if (v !== active) {
        setActive(v);
        onChange(v);
        // 轻微触感反馈（支持的设备上）
        navigator.vibrate?.(8);
      }
    }, 120);
    // 滚动过程中实时更新高亮
    const idx = Math.round(el.scrollTop / ITEM_H);
    const v = Math.min(max, Math.max(min, min + idx));
    if (v !== active) setActive(v);
  };

  return (
    <div className="relative select-none" style={{ height: ITEM_H * VISIBLE }}>
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
        {items.map((n) => {
          const isActive = n === active;
          const dist = Math.abs(n - active);
          return (
            <li key={n} className="snap-center">
              <button
                type="button"
                onClick={() => scrollTo(n, true)}
                className="flex w-full items-center justify-center gap-1 font-mono transition-all duration-200"
                style={{
                  height: ITEM_H,
                  fontSize: isActive ? 22 : 14,
                  color: isActive ? "#bfdbfe" : dist === 1 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)",
                  fontWeight: isActive ? 600 : 400,
                  textShadow: isActive ? "0 0 14px rgba(96,165,250,0.5)" : "none",
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
  );
}
