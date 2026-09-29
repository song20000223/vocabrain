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
        <p className="eyebrow">Library</p>
        <h1 className="hero-title mt-3 text-4xl sm:text-5xl">单词管理</h1>
        <p className="mt-3 text-sm tracking-wider text-white/40">共 {words.length} 个单词</p>
      </div>

      {tip && (
        <div
          className="glass-card rounded-xl px-4 py-2.5 text-sm tracking-wider text-cyan-100"
          style={{ borderColor: "rgba(103,232,249,0.3)" }}
        >
          {tip}
        </div>
      )}

      {/* 手动添加 */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold tracking-wider text-white">手动添加</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="英文单词，如 apple"
            className="glass-input min-h-[44px] flex-1 rounded-xl px-4 tracking-wider"
          />
          <input
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="中文释义，如 苹果"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="glass-input min-h-[44px] flex-1 rounded-xl px-4 tracking-wider"
          />
          <button
            onClick={handleAdd}
            disabled={!word.trim()}
            className="glow-btn min-h-[44px] rounded-full px-7 text-sm tracking-wider"
          >
            <Plus className="h-4 w-4" /> 添加
          </button>
        </div>
      </section>

      {/* 批量导入 */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold tracking-wider text-white">批量导入</h2>
        <p className="mt-2 text-sm tracking-wider text-white/40">
          每行一个，格式：
          <code className="font-mono text-cyan-200/80">单词,释义</code>
          （中文逗号也可以）
        </p>
        <textarea
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          rows={5}
          placeholder={"apple,苹果\njourney,旅行；旅程\nserendipity，意外的美好发现"}
          className="glass-input mt-4 w-full resize-y rounded-xl p-4 font-mono text-sm"
        />
        <button
          onClick={handleImport}
          disabled={!batchText.trim()}
          className="ghost-btn mt-4 min-h-[44px] px-7 text-sm tracking-wider hover:!border-cyan-300/40 hover:!text-cyan-200"
        >
          <Upload className="h-4 w-4" /> 导入
        </button>
      </section>

      {/* 单词列表 */}
      <section>
        <h2 className="font-semibold tracking-wider text-white">单词列表</h2>
        {words.length === 0 ? (
          <p className="glass-card mt-4 rounded-2xl p-10 text-center text-sm tracking-wider text-white/40">
            还没有单词，用上面的方式添加吧。
          </p>
        ) : (
          <ul className="glass-card mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl">
            {words.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <span className="font-mono tracking-wide text-white">{it.word}</span>
                  <span className="ml-3 break-all text-sm tracking-wider text-white/40">
                    {it.meaning || "—"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    removeWord(it.id);
                    refresh();
                  }}
                  aria-label={`删除 ${it.word}`}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-white/25 transition-colors duration-300 hover:text-red-300"
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
