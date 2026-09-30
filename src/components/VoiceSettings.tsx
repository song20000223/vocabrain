import { useEffect, useState } from "react";
import { Volume2, X } from "lucide-react";
import { englishVoices, getVoicePref, setVoicePref, speak } from "@/lib/speak";

/**
 * 发音设置：列出系统所有 en-* voice，可试听、单选，偏好存 localStorage。
 * 顶部「跟随系统自动」= 清除偏好，走 en-GB → en-US → en-* 自动链路。
 * 绝不包含非英文 voice。
 */
export default function VoiceSettings({ onClose }: { onClose: () => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [pref, setPref] = useState<string | null>(getVoicePref());

  const refresh = () => setVoices(englishVoices());

  useEffect(() => {
    refresh();
    // 语音列表异步就绪（移动端常见），voiceschanged 后重拉
    const t = window.setInterval(() => {
      if (englishVoices().length !== voices.length) refresh();
    }, 600);
    window.setTimeout(() => window.clearInterval(t), 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (voiceURI: string | null) => {
    setVoicePref(voiceURI);
    setPref(voiceURI);
  };

  const preview = (v: SpeechSynthesisVoice) => {
    setVoicePref(v.voiceURI); // 试听后即视为选中，体验上"点了就是它了"
    setPref(v.voiceURI);
    speak("The rain falls gently on the window.", v.lang);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass-card flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold tracking-wide text-white">发音设置</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-white/35 transition-colors hover:text-white/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed tracking-wide text-white/40">
          只列英文语音；选中的声音会记住，下次发音优先使用。
        </p>

        <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
          {/* 跟随系统自动 */}
          <div
            className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ${
              pref === null
                ? "border-blue-300/50 bg-blue-300/10"
                : "border-white/10 hover:border-white/25"
            }`}
          >
            <button onClick={() => choose(null)} className="flex-1 text-left">
              <span className="text-sm tracking-wide text-white">跟随系统自动</span>
              <span className="block font-mono text-[11px] text-white/35">
                en-GB → en-US → 其他英文
              </span>
            </button>
            {pref === null && (
              <span className="text-xs tracking-wide text-blue-200">使用中</span>
            )}
          </div>

          {voices.length === 0 && (
            <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 px-3 py-3 text-xs leading-relaxed tracking-wide text-amber-200/70">
              未检测到英文语音。请到系统设置安装英语语音包后重启浏览器。
            </p>
          )}

          {voices.map((v) => (
            <div
              key={v.voiceURI}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                pref === v.voiceURI
                  ? "border-blue-300/50 bg-blue-300/10"
                  : "border-white/10 hover:border-white/25"
              }`}
            >
              <button onClick={() => choose(v.voiceURI)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm tracking-wide text-white">{v.name}</span>
                <span className="block font-mono text-[11px] text-white/35">{v.lang}</span>
              </button>
              {pref === v.voiceURI && (
                <span className="shrink-0 text-xs tracking-wide text-blue-200">使用中</span>
              )}
              <button
                onClick={() => preview(v)}
                aria-label={`试听 ${v.name}`}
                className="ghost-btn flex h-9 w-9 shrink-0 items-center justify-center !rounded-full"
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
