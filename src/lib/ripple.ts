/**
 * 按钮磁吸涟漪：鼠标从哪个位置进入按钮，光晕就从那个点扩散填满。
 * 仅桌面端（fine pointer）生效，触屏无 hover 不启用。
 * 用法：在 App 根部调用一次 useMagneticRipple() 即可，事件委托在 document 上，
 * 对当前和未来渲染的所有 .glow-btn / .ghost-btn 自动生效。
 */
import { useEffect } from "react";

const SELECTOR = ".glow-btn, .ghost-btn";

export function useMagneticRipple() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const onEnter = (e: Event) => {
      const me = e as MouseEvent;
      const el = (me.target as HTMLElement).closest(SELECTOR) as HTMLElement | null;
      if (!el || el.hasAttribute("disabled")) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--ripple-x", `${(((me.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--ripple-y", `${(((me.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      el.classList.add("rippling");
    };
    const onLeave = (e: Event) => {
      const el = (e.target as HTMLElement).closest(SELECTOR) as HTMLElement | null;
      el?.classList.remove("rippling");
    };

    document.addEventListener("mouseover", onEnter, true);
    document.addEventListener("mouseout", onLeave, true);
    return () => {
      document.removeEventListener("mouseover", onEnter, true);
      document.removeEventListener("mouseout", onLeave, true);
    };
  }, []);
}
