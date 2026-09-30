import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface ReviewItem {
  word: string;
  answer: string;
  correct: boolean;
  standardMeaning: string;
}

/**
 * 本轮回顾：测试/听写结束页共用的逐题列表。
 * 纯展示，不改判分、不改错题本。答错行可点击跳到错题本。
 */
export default function SessionReview({ items }: { items: ReviewItem[] }) {
  const [filter, setFilter] = useState<"all" | "correct" | "wrong">("all");
  const navigate = useNavigate();

  const correctCount = items.filter((r) => r.correct).length;
  const wrongCount = items.length - correctCount;
  const shown =
    filter === "all" ? items : items.filter((r) => (filter === "correct" ? r.correct : !r.correct));

  const tabs = [
    { key: "all" as const, label: `全部 ${items.length}` },
    { key: "correct" as const, label: `正确 ${correctCount}` },
    { key: "wrong" as const, label: `错误 ${wrongCount}` },
  ];

  return (
    <div className="w-full">
      <div className="mb-3 flex justify-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-4 py-1.5 text-xs tracking-wide transition-colors ${
              filter === t.key
                ? "border border-blue-300/40 bg-blue-400/10 text-blue-200"
                : "border border-white/10 text-white/40 hover:text-white/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ul className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {shown.map((r, i) => (
          <li key={i}>
            <button
              onClick={() => !r.correct && navigate("/wrong-book")}
              disabled={r.correct}
              title={r.correct ? undefined : "跳到错题本"}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                r.correct
                  ? "border-white/5 text-white/60"
                  : "border-red-300/20 bg-red-400/[0.06] hover:border-red-300/40"
              }`}
            >
              <span className="mr-2 inline-flex align-middle">
                {r.correct ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-300" />
                )}
              </span>
              <span className="font-mono text-white/90">{r.word}</span>
              <span className="mx-2 text-white/25">·</span>
              <span className="text-white/50">你写的：{r.answer || "（空）"}</span>
              {!r.correct && (
                <>
                  <span className="mx-2 text-white/25">·</span>
                  <span className="text-white/75">正确：{r.standardMeaning}</span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
