import { X } from "lucide-react";
import { useEscapeClose } from "@/lib/useEscapeClose";

interface Props {
  title: string;
  /** 说明文案（可多行） */
  desc?: string;
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string;
  /** 危险操作：确认按钮红色警示 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 统一确认弹窗：× / ESC / 点外部 = 取消；danger 时确认按钮红色警示 */
export default function ConfirmDialog({
  title,
  desc,
  confirmText = "确定",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  useEscapeClose(true, onCancel);
  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-label={title}
        className="glass-card relative w-full max-w-sm rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          aria-label="关闭"
          className="absolute right-3 top-3 flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full text-white/40 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="font-semibold tracking-wide text-white">{title}</h3>
        {desc && (
          <p className="mt-2 text-sm leading-relaxed tracking-wide text-white/45">{desc}</p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onConfirm}
            autoFocus
            className={`min-h-[44px] flex-1 rounded-full text-sm tracking-wide transition-all duration-300 ${
              danger
                ? "border border-red-400/40 bg-red-400/10 text-red-200 hover:border-red-300/60 hover:bg-red-400/20 hover:shadow-[0_0_18px_rgba(248,113,113,0.25)]"
                : "glow-btn"
            }`}
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            className="ghost-btn min-h-[44px] flex-1 text-sm tracking-wide"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
