import { useEffect, useState } from "react";
import { Plus, Trash2, Upload, Ban, CircleCheck } from "lucide-react";
import {
  getWords,
  addWord,
  importWords,
  removeWord,
  toggleExcluded,
  formatMeanings,
  type WordItem,
} from "@/lib/store";

const POS_OPTIONS = ["n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "num.", "其他"];

export default function WordsPage() {
  const [words, setWords] = useState<WordItem[]>([]);
  // 手动添加：单词 + 词性 + 义项（分号分隔多个义项）
  const [word, setWord] = useState("");
  const [pos, setPos] = useState("n.");
  const [defs, setDefs] = useState("");
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
    const definitions = defs.split(/[;；]/).map((d) => d.trim()).filter(Boolean);
    if (addWord(word, pos, definitions)) {
      setWord("");
      setDefs("");
      showTip("添加成功（同名单词会自动合并义项）");
      refresh();
    }
  };

  const handleImport = () => {
    if (!batchText.trim()) return;
    const n = importWords(batchText);
    setBatchText("");
    showTip(n > 0 ? `成功导入/合并 ${n} 条` : "没有可导入的内容");
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
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="英文单词，如 plateau"
              className="glass-input min-h-[44px] flex-1 rounded-xl px-4 tracking-wider"
            />
            <select
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              className="glass-input min-h-[44px] rounded-xl px-4 tracking-wider"
            >
              {POS_OPTIONS.map((p) => (
                <option key={p} value={p === "其他" ? "" : p} className="bg-[#0a0d12]">
                  {p === "" ? "无词性" : p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={defs}
              onChange={(e) => setDefs(e.target.value)}
              placeholder="中文义项，多个用分号隔开，如 高原；平稳期"
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
          <p className="text-xs tracking-wider text-white/30">
            同一个单词可以分多次添加不同词性，会自动合并到一起。
          </p>
        </div>
      </section>

      {/* 批量导入 */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="font-semibold tracking-wider text-white">批量导入</h2>
        <p className="mt-2 text-sm tracking-wider text-white/40">
          每行一条，格式：<code className="font-mono text-cyan-200/80">单词,词性,义项1；义项2</code>
          ，同一个单词写多行会自动合并
        </p>
        <textarea
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          rows={6}
          placeholder={"plateau,n.,高原；平稳期\nplateau,v.,达到平稳状态\njourney,n.,旅行；旅程"}
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

      {/* 单词列表（按词性分组显示义项） */}
      <section>
        <h2 className="font-semibold tracking-wider text-white">单词列表</h2>
        {words.length === 0 ? (
          <p className="glass-card mt-4 rounded-2xl p-10 text-center text-sm tracking-wider text-white/40">
            还没有单词，用上面的方式添加吧。
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {words.map((it) => (
              <li
                key={it.id}
                className={`glass-card rounded-2xl p-5 transition-opacity duration-300 ${
                  it.excluded ? "opacity-45" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg tracking-wide text-white">{it.word}</span>
                      {it.excluded && (
                        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] tracking-wider text-white/40">
                          不再测
                        </span>
                      )}
                      {it.testedRounds > 0 && (
                        <span className="font-mono text-[10px] tracking-wider text-white/25">
                          已测 {it.testedRounds} 次
                        </span>
                      )}
                    </div>
                    {/* 义项按词性分组 */}
                    <div className="mt-2 space-y-0.5 text-sm tracking-wider text-white/55">
                      {formatMeanings(it.meanings).length > 0 ? (
                        formatMeanings(it.meanings).map((line, i) => <p key={i}>{line}</p>)
                      ) : (
                        <p className="text-white/25">（暂无释义，判分时由 AI 判断）</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      onClick={() => toggleExcluded(it.id)}
                      aria-label={it.excluded ? "恢复测试" : "不再测"}
                      title={it.excluded ? "恢复测试" : "不再测"}
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors duration-300 ${
                        it.excluded ? "text-cyan-300" : "text-white/25 hover:text-cyan-200"
                      }`}
                    >
                      {it.excluded ? <CircleCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        removeWord(it.id);
                        refresh();
                      }}
                      aria-label={`删除 ${it.word}`}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white/25 transition-colors duration-300 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
