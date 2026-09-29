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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl text-white">错题本</h1>
          <p className="mt-1 text-sm text-[#9a9a9a]">
            共 {items.length} 个答错的单词（保存在本浏览器 localStorage）
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
            className="flex min-h-[44px] items-center gap-2 rounded-full border border-red-400/30 px-4 text-sm text-red-300 transition-colors hover:bg-red-400/10"
          >
            <Eraser className="h-4 w-4" /> 清空
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-10 text-center text-[#9a9a9a]">
          暂无错题，去测试页练练手吧。
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-serif text-xl text-white">{it.word}</span>
                  <span className="ml-3 text-sm text-amber-200/90">{it.meaning || "—"}</span>
                </div>
                <button
                  onClick={() => {
                    removeFromWrongBook(it.id);
                    refresh();
                  }}
                  aria-label="移出错题本"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[#666] transition-colors hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <p className="text-[#9a9a9a]">
                  你的答案：<span className="text-red-300/90">{it.yourAnswer}</span>
                </p>
                <p className="text-[#9a9a9a]">
                  AI 评语：<span className="text-[#dadada]">{it.comment}</span>
                </p>
                <p className="font-mono text-xs text-[#666]">
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
