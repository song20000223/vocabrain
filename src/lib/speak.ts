/**
 * 发音封装：浏览器 SpeechSynthesis，优先 en-GB 语音。
 * DeepSeek 官方没有 TTS 接口，故不做云端代理；全程本地，无任何 API key。
 *
 * 返回值 voice 字段标识实际使用的语音：
 *  - "en-GB"   命中英式语音
 *  - "fallback" 没有 en-GB，降级到系统默认英文语音
 *  - "none"    环境不支持 TTS（未发声）
 * UI 层在首次 voice === "fallback" 时轻提示一次即可。
 */

export interface SpeakResult {
  ok: boolean;
  voice: "en-GB" | "fallback" | "none";
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let listening = false;

function ensureVoices() {
  if (typeof speechSynthesis === "undefined") return;
  cachedVoices = speechSynthesis.getVoices();
  if (!listening) {
    listening = true;
    speechSynthesis.addEventListener("voiceschanged", () => {
      cachedVoices = speechSynthesis.getVoices();
    });
  }
}

export function speak(text: string, lang = "en-GB"): SpeakResult {
  if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
    return { ok: false, voice: "none" };
  }
  const t = text.trim();
  if (!t) return { ok: false, voice: "none" };

  ensureVoices();
  speechSynthesis.cancel(); // 重复点击时打断上一次，立即重播

  const utter = new SpeechSynthesisUtterance(t);
  utter.lang = lang;
  utter.rate = 0.92;

  const exact = cachedVoices.find((v) => v.lang === lang);
  const loose = cachedVoices.find((v) => v.lang.startsWith(lang.split("-")[0]));
  const voice = exact ?? loose ?? null;
  if (voice) utter.voice = voice;

  speechSynthesis.speak(utter);
  return { ok: true, voice: exact ? "en-GB" : "fallback" };
}
