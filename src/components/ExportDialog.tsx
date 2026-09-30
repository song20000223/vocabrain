import { useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import type { WordItem } from "@/lib/store";
import {
  DEFAULT_EXPORT_FILTERS,
  buildCsv,
  buildTxt,
  downloadFile,
  exportFileName,
  filterForExport,
  type ExportFilters,
} from "@/lib/export";

interface Props {
  /** 只读范围描述，如「雅思核心（含 3 章节，共 245 个）」 */
  scopeLabel: string;
  /** 文件名用范围名（不含计数） */
  scopeName: string;
  /** 范围内的全部候选词（筛选在弹窗内做） */
  pool: WordItem[];
  /** 文件名是否带时分（测试结果用） */
  withTime?: boolean;
  onClose: () => void;
}

/** 导出弹窗：三处入口共用（词书/章节、测试结果、选中单词） */
export default function ExportDialog({ scopeLabel, scopeName, pool, withTime, onClose }: Props) {
  const [f, setF] = useState<ExportFilters>({ ...DEFAULT_EXPORT_FILTERS });
  const [format, setFormat] = useState<"csv" | "txt">("csv");

  const filtered = useMemo(() => filterForExport(pool, f), [pool, f]);
  // 全不勾 = 不导出（防误操作）：背记组和类型组各需至少勾一项
  const noTestedState = !f.tested && !f.untested;
  const noType = !f.word && !f.phrase;
  const invalid = noTestedState || noType;

  const toggle = (k: keyof ExportFilters) => setF((s) => ({ ...s, [k]: !s[k] }));

  const doExport = () => {
    if (filtered.length === 0) return;
    const name = exportFileName(scopeName, f, format, withTime);
    if (format === "csv") downloadFile(name, buildCsv(filtered), "text/csv;charset=utf-8");
    else downloadFile(name, buildTxt(filtered), "text/plain;charset=utf-8");
    onClose();
  };

  const Check = ({ k, label }: { k: keyof ExportFilters; label: string }) => (
    <label className="flex min-h-[36px] cursor-pointer items-center gap-1.5 text-sm tracking-wide text-white/70">
      <input
        type="checkbox"
        checked={f[k]}
        onChange={() => toggle(k)}
        className="h-4 w-4 accent-blue-300"
      />
      {label}
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-wide text-white">导出单词</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full text-white/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm tracking-wide text-white/45">
          范围：<span className="text-white/75">{scopeLabel}</span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4">
          <span className="text-sm tracking-wide text-white/45">状态：</span>
          <Check k="tested" label="已背" />
          <Check k="untested" label="未背" />
          <Check k="mastered" label="已掌握" />
          <Check k="excluded" label="不再测" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          <span className="text-sm tracking-wide text-white/45">类型：</span>
          <Check k="word" label="单词" />
          <Check k="phrase" label="词组" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          <span className="text-sm tracking-wide text-white/45">格式：</span>
          {(["csv", "txt"] as const).map((v) => (
            <label
              key={v}
              className="flex min-h-[36px] cursor-pointer items-center gap-1.5 text-sm tracking-wide text-white/70"
            >
              <input
                type="radio"
                name="export-format"
                checked={format === v}
                onChange={() => setFormat(v)}
                className="h-4 w-4 accent-blue-300"
              />
              {v.toUpperCase()}
            </label>
          ))}
        </div>

        <p className="mt-3 font-mono text-xs tracking-wide text-white/40">
          {invalid ? (
            <span className="text-amber-200/70">请至少勾一项：已背/未背、单词/词组各选一个</span>
          ) : (
            `符合条件 ${filtered.length} 个`
          )}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="ghost-btn min-h-[40px] px-5 text-sm tracking-wide"
          >
            取消
          </button>
          <button
            onClick={doExport}
            disabled={filtered.length === 0 || invalid}
            className="glow-btn min-h-[40px] rounded-full px-6 text-sm tracking-wide disabled:opacity-35"
          >
            <Download className="h-4 w-4" /> 导出
          </button>
        </div>
      </div>
    </div>
  );
}
