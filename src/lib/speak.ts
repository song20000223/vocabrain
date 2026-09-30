/**
 * 发音封装：浏览器 SpeechSynthesis，只用英文语音（en-*）。
 * DeepSeek 官方没有 TTS 接口；将来可接云 TTS（见文件末尾 CLOUD_TTS 预留）。
 *
 * voice 解析优先级：
 *   1. 用户手动选的 voice（localStorage: vocab_voice_pref，存 voiceURI）
 *   2. en-GB 精确匹配（Mac 上 Daniel / Serena / Arthur / Martha）
 *   3. en-US 精确匹配
 *   4. 任意 en-* voice
 *   5. 找不到英文 voice → 静默不发声，绝不降级到非 en-* voice
 *     （macOS 系统默认可能是 Ting-Ting 等中文 voice，会用中文规则读英文）
 *
 * 移动端适配：
 *  - Android Chrome / iOS Safari 的 getVoices() 首次常返回空，
 *    语音列表异步就绪——挂 voiceschanged + 最多 5 次 × 500ms 重试拉取；
 *  - speak() 只在用户点击时触发，天然满足移动端"用户交互后才可发声"的限制。
 */

export type VoiceQuality = "preferred" | "en-GB" | "en-US" | "en" | "none";

export interface SpeakResult {
  ok: boolean;
  voice: VoiceQuality;
  /** voice === "none" 时的原因：no-support = 环境无 TTS；no-english-voice = 没有任何 en-* voice */
  reason?: "no-support" | "no-english-voice";
}

export const VOICE_PREF_KEY = "vocab_voice_pref";

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

/** 系统当前所有 en-* voice（发音设置弹层列表用） */
export function englishVoices(): SpeechSynthesisVoice[] {
  ensureVoices();
  return cachedVoices.filter((v) => v.lang.toLowerCase().startsWith("en"));
}

/** 环境是否有任何英文 voice（听写模式常驻提示用） */
export function hasEnglishVoice(): boolean {
  return englishVoices().length > 0;
}

export function getVoicePref(): string | null {
  try {
    return localStorage.getItem(VOICE_PREF_KEY);
  } catch {
    return null;
  }
}

export function setVoicePref(voiceURI: string | null): void {
  try {
    if (voiceURI) localStorage.setItem(VOICE_PREF_KEY, voiceURI);
    else localStorage.removeItem(VOICE_PREF_KEY);
  } catch {
    /* localStorage 不可用时静默 */
  }
}

/** 按优先级解析出要用的 voice；找不到英文 voice 返回 null */
function resolveVoice(): { voice: SpeechSynthesisVoice | null; quality: VoiceQuality } {
  ensureVoices();
  const pref = getVoicePref();
  if (pref) {
    const v = cachedVoices.find((it) => it.voiceURI === pref);
    if (v && v.lang.toLowerCase().startsWith("en")) return { voice: v, quality: "preferred" };
  }
  const gb = cachedVoices.find((v) => v.lang === "en-GB");
  if (gb) return { voice: gb, quality: "en-GB" };
  const us = cachedVoices.find((v) => v.lang === "en-US");
  if (us) return { voice: us, quality: "en-US" };
  const any = cachedVoices.find((v) => v.lang.toLowerCase().startsWith("en"));
  if (any) return { voice: any, quality: "en" };
  return { voice: null, quality: "none" };
}

/**
 * @param text 要朗读的文本
 * @param lang 目标语音标记（默认 en-GB；仅用于 utter.lang，voice 选择始终走 resolveVoice）
 * @param opts.rate 语速（默认 0.92；慢速重播传 0.6）
 * @param opts.onEnd 播放结束/被打断时回调（声波动画停止用）
 */
export function speak(
  text: string,
  lang = "en-GB",
  opts: { rate?: number; onEnd?: () => void } = {},
): SpeakResult {
  if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
    return { ok: false, voice: "none", reason: "no-support" };
  }
  const t = text.trim();
  if (!t) return { ok: false, voice: "none", reason: "no-support" };

  const { voice, quality } = resolveVoice();
  if (!voice) {
    // 无英文 voice：静默不发声，绝不用中文 voice 读英文
    return { ok: false, voice: "none", reason: "no-english-voice" };
  }

  speechSynthesis.cancel(); // 重复点击时打断上一次，立即重播

  const utter = new SpeechSynthesisUtterance(t);
  utter.lang = lang;
  utter.rate = opts.rate ?? 0.92;
  utter.voice = voice;
  if (opts.onEnd) {
    utter.onend = opts.onEnd;
    utter.onerror = opts.onEnd;
  }

  speechSynthesis.speak(utter);
  return { ok: true, voice: quality };
}

/* ==================== 云 TTS 预留（当前不实现） ====================
 * 开关：CLOUD_TTS_ENABLED。将来接 Google Cloud TTS en-GB-Wavenet 系列：
 *   1. 后端加 POST /api/tts（key 只存服务端 env，如 GOOGLE_TTS_API_KEY，
 *      前端绝不暴露）；入参 { text, voice: "en-GB-Wavenet-B" }，出参音频流/mp3；
 *   2. 这里 speak() 开头判断开关：开启时改调 speakCloud() 播返回的音频；
 *   3. speakCloud 失败回落本地 resolveVoice 链路；
 *   4. 发音设置弹层加「云端高清语音」分组。
 */
// const CLOUD_TTS_ENABLED = false;
// async function speakCloud(text: string, opts: { rate?: number; onEnd?: () => void }): Promise<SpeakResult> {
//   throw new Error("cloud TTS not implemented");
// }
