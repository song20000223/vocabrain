/**
 * 发音封装：浏览器 SpeechSynthesis，优先 en-GB 语音。
 * DeepSeek 官方没有 TTS 接口，故不做云端代理；全程本地，无任何 API key。
 *
 * 移动端适配：
 *  - Android Chrome / iOS Safari 的 getVoices() 首次常返回空，
 *    语音列表异步就绪——这里挂 voiceschanged + 最多 5 次 × 500ms 重试拉取；
 *  - speak() 只在用户点击（🔊）时触发，天然满足移动端"用户交互后才可发声"的限制；
 *  - 语音列表暂为空时，speak() 先发起重试并照样发声（utter.lang 兜底，
 *    浏览器会尽力选音），不报 none。
 *
 * 返回值 voice 字段标识实际使用的语音：
 *  - "en-GB"   命中英式语音
 *  - "fallback" 没有 en-GB，降级到系统默认英文语音
 *  - "none"    环境不支持 TTS（未发声）
 * UI 层在首次 voice === "fallback" / "none" 时轻提示一次即可。
 */

export interface SpeakResult {
  ok: boolean;
  voice: "en-GB" | "fallback" | "none";
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let listening = false;
let retryTimer: number | null = null;
let retries = 0;
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 500;

function pullVoices(): boolean {
  if (typeof speechSynthesis === "undefined") return false;
  cachedVoices = speechSynthesis.getVoices();
  return cachedVoices.length > 0;
}

/** 语音列表为空时启动延迟重试（500ms × 最多 5 次），拿到即止 */
function scheduleRetry() {
  if (retryTimer !== null || retries >= MAX_RETRIES) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    retries += 1;
    if (!pullVoices()) scheduleRetry();
  }, RETRY_INTERVAL);
}

function ensureVoices() {
  if (typeof speechSynthesis === "undefined") return;
  if (!listening) {
    listening = true;
    speechSynthesis.addEventListener("voiceschanged", () => {
      pullVoices();
    });
  }
  if (!pullVoices()) scheduleRetry();
}

/**
 * @param text 要朗读的文本
 * @param lang 目标语音（默认 en-GB）
 * @param opts.rate 语速（默认 0.92；慢速重播传 0.6）
 * @param opts.onEnd 播放结束/被打断时回调（声波动画停止用）
 */
export function speak(
  text: string,
  lang = "en-GB",
  opts: { rate?: number; onEnd?: () => void } = {},
): SpeakResult {
  if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
    return { ok: false, voice: "none" };
  }
  const t = text.trim();
  if (!t) return { ok: false, voice: "none" };

  ensureVoices();
  speechSynthesis.cancel(); // 重复点击时打断上一次，立即重播

  const utter = new SpeechSynthesisUtterance(t);
  utter.lang = lang;
  utter.rate = opts.rate ?? 0.92;
  if (opts.onEnd) {
    utter.onend = opts.onEnd;
    utter.onerror = opts.onEnd;
  }

  const exact = cachedVoices.find((v) => v.lang === lang);
  const loose = cachedVoices.find((v) => v.lang.startsWith(lang.split("-")[0]));
  const voice = exact ?? loose ?? null;
  if (voice) utter.voice = voice;

  speechSynthesis.speak(utter);
  return { ok: true, voice: exact ? "en-GB" : "fallback" };
}
