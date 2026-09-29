import { useEffect, useState } from "react";
import { Trash2, Eraser } from "lucide-react";
import {
  getWrongBook,
  removeFromWrongBook,
  clearWrongBook,
  type WrongItem,
} from "@/lib/store";

export default function WrongBookPage() {
  const [items, setItems] = useState<WrongItem[]>([]);

  const refresh = () => setItems(getWrongBook());

  useEffect(() => {
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">Review</p>
          <h1 className="hero-title mt-3 text-4xl sm:text-5xl">错题本</h1>
          <p className="mt-3 text-sm tracking-wider text-white/40">
            共 {items.length} 个答错的单词 · 保存在本浏览器 localStorage
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm("确定清空错题本吗？")) {
                clearWrongBook();
                refresh();
              }
            }}
            className="ghost-btn min-h-[44px] px-5 text-sm tracking-wider hover:!border-red-400/40 hover:!text-red-300"
          >
            <Eraser className="h-4 w-4" /> 清空
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center tracking-wider text-white/40">
          暂无错题，去测试页练练手吧。
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((it) => (
            <li key={it.id} className="glass-card rounded-2xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-xl tracking-wide text-white">
                    {it.word}
                  </span>
                  <span className="ml-3 text-sm tracking-wider text-cyan-200/80">
                    {it.meaning || "—"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    removeFromWrongBook(it.id);
                    refresh();
                  }}
                  aria-label="移出错题本"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white/30 transition-colors duration-300 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 space-y-1.5 text-sm tracking-wider">
                <p className="text-white/35">
                  你的答案　<span className="text-red-300/85">{it.yourAnswer}</span>
                </p>
                <p className="text-white/35">
                  AI 评语　<span className="text-white/70">{it.comment}</span>
                </p>
                <p className="font-mono text-[11px] text-white/25">
                  {new Date(it.wrongAt).toLocaleString("zh-CN")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
