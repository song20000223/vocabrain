import { useEffect, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { getWords, addWord, importWords, removeWord, type WordItem } from "@/lib/store";

export default function WordsPage() {
  const [words, setWords] = useState<WordItem[]>([]);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [batchText, setBatchText] = useState("");
  const [tip, setTip] = useState("");

  const refresh = () => setWords(getWords());

  useEffect(() => {
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
  }, []);

  const showTip = (msg: string) => {
    setTip(msg);
    window.setTimeout(() => setTip(""), 3000);
  };

  const handleAdd = () => {
    if (!word.trim()) return;
    if (addWord(word, meaning)) {
      setWord("");
      setMeaning("");
      showTip("添加成功");
      refresh();
    } else {
      showTip("该单词已存在");
    }
  };

  const handleImport = () => {
    if (!batchText.trim()) return;
    const n = importWords(batchText);
    setBatchText("");
    showTip(n > 0 ? `成功导入 ${n} 个单词` : "没有可导入的新单词（可能已存在）");
    refresh();
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl text-white">单词管理</h1>
        <p className="mt-1 text-sm text-[#9a9a9a]">共 {words.length} 个单词</p>
      </div>

      {tip && (
        <div className="rounded-lg border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm text-amber-100">
          {tip}
        </div>
      )}

      {/* 手动添加 */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-medium text-white">手动添加</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="英文单词，如 apple"
            className="min-h-[44px] flex-1 rounded-lg border border-white/10 bg-black/30 px-4 text-white placeholder:text-[#666] focus:border-amber-200/50 focus:outline-none"
          />
          <input
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="中文释义，如 苹果"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="min-h-[44px] flex-1 rounded-lg border border-white/10 bg-black/30 px-4 text-white placeholder:text-[#666] focus:border-amber-200/50 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={!word.trim()}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-200/90 px-6 font-mono text-sm font-medium text-black transition-colors hover:bg-amber-100 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> 添加
          </button>
        </div>
      </section>

      {/* 批量导入 */}
      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="font-medium text-white">批量导入</h2>
        <p className="mt-1 text-sm text-[#9a9a9a]">
          每行一个，格式：<code className="font-mono text-amber-200/90">单词,释义</code>
          （中文逗号也可以）
        </p>
        <textarea
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          rows={5}
          placeholder={"apple,苹果\njourney,旅行；旅程\nserendipity，意外的美好发现"}
          className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/30 p-4 font-mono text-sm text-white placeholder:text-[#555] focus:border-amber-200/50 focus:outline-none"
        />
        <button
          onClick={handleImport}
          disabled={!batchText.trim()}
          className="mt-3 flex min-h-[44px] items-center gap-2 rounded-lg border border-amber-200/40 bg-amber-200/10 px-6 font-mono text-sm text-amber-100 transition-colors hover:bg-amber-200/20 disabled:opacity-40"
        >
          <Upload className="h-4 w-4" /> 导入
        </button>
      </section>

      {/* 单词列表 */}
      <section>
        <h2 className="font-medium text-white">单词列表</h2>
        {words.length === 0 ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-[#9a9a9a]">
            还没有单词，用上面的方式添加吧。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {words.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <span className="font-mono text-white">{it.word}</span>
                  <span className="ml-3 break-all text-sm text-[#9a9a9a]">{it.meaning || "—"}</span>
                </div>
                <button
                  onClick={() => {
                    removeWord(it.id);
                    refresh();
                  }}
                  aria-label={`删除 ${it.word}`}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-[#666] transition-colors hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
