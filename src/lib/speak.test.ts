/**
 * speak() voice 优先级单测（node 环境 mock speechSynthesis）。
 * 核心保证：绝不降级到非 en-* voice（Mac 中文默认 voice 读英文的怪音来源）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { localStorage: Storage }).localStorage = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
  } as Storage;
})();

const spoken: { text: string; voiceName: string | null }[] = [];
let mockVoices: { name: string; lang: string; voiceURI: string }[] = [];

(globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = {
  getVoices: () => mockVoices,
  addEventListener: () => {},
  cancel: () => {},
  speak: (u: { text: string; voice: { name: string } | null }) => {
    spoken.push({ text: u.text, voiceName: u.voice ? u.voice.name : null });
  },
};
(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
  text: string;
  lang = "";
  rate = 1;
  voice: { name: string } | null = null;
  constructor(t: string) { this.text = t; }
};

const { speak, setVoicePref, hasEnglishVoice } = await import("./speak");

beforeEach(() => {
  localStorage.clear();
  spoken.length = 0;
});

describe("speak voice 优先级", () => {
  it("en-GB 精确匹配优先（Daniel）", () => {
    mockVoices = [
      { name: "Ting-Ting", lang: "zh-CN", voiceURI: "ting" },
      { name: "Daniel", lang: "en-GB", voiceURI: "daniel" },
      { name: "Samantha", lang: "en-US", voiceURI: "sam" },
    ];
    const r = speak("hello");
    expect(r.ok).toBe(true);
    expect(r.voice).toBe("en-GB");
    expect(spoken[0].voiceName).toBe("Daniel");
  });

  it("无 en-GB 时落 en-US", () => {
    mockVoices = [
      { name: "Ting-Ting", lang: "zh-CN", voiceURI: "ting" },
      { name: "Samantha", lang: "en-US", voiceURI: "sam" },
    ];
    expect(speak("hello").voice).toBe("en-US");
    expect(spoken[0].voiceName).toBe("Samantha");
  });

  it("无 GB/US 时用任意 en-*", () => {
    mockVoices = [{ name: "Karen", lang: "en-AU", voiceURI: "karen" }];
    expect(speak("hello").voice).toBe("en");
    expect(spoken[0].voiceName).toBe("Karen");
  });

  it("用户偏好 voice 最高优先", () => {
    mockVoices = [
      { name: "Daniel", lang: "en-GB", voiceURI: "daniel" },
      { name: "Samantha", lang: "en-US", voiceURI: "sam" },
    ];
    setVoicePref("sam");
    expect(speak("hello").voice).toBe("preferred");
    expect(spoken[0].voiceName).toBe("Samantha");
  });

  it("偏好指向非英文 voice：忽略偏好走自动链路", () => {
    mockVoices = [
      { name: "Ting-Ting", lang: "zh-CN", voiceURI: "ting" },
      { name: "Daniel", lang: "en-GB", voiceURI: "daniel" },
    ];
    setVoicePref("ting");
    expect(speak("hello").voice).toBe("en-GB");
  });

  it("只有中文 voice：静默不发声，绝不降级", () => {
    mockVoices = [{ name: "Ting-Ting", lang: "zh-CN", voiceURI: "ting" }];
    const r = speak("hello");
    expect(r.ok).toBe(false);
    expect(r.voice).toBe("none");
    expect(r.reason).toBe("no-english-voice");
    expect(spoken).toHaveLength(0);
    expect(hasEnglishVoice()).toBe(false);
  });

  it("偏好持久化", () => {
    setVoicePref("daniel");
    expect(localStorage.getItem("vocab_voice_pref")).toBe("daniel");
    setVoicePref(null);
    expect(localStorage.getItem("vocab_voice_pref")).toBeNull();
  });
});
