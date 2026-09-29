/**
 * 单词释义判分（仅服务端调用，API Key 永远不会下发到浏览器）。
 *
 * 两种模式（自动选择）：
 *  1. 项目根目录 .env.local 里配置了 DEEPSEEK_API_KEY → 直连 DeepSeek（model: deepseek-chat）
 *  2. 否则 → 走平台内置的 AI 网关（开箱即用，无需任何配置）
 */
import { generateObject } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { listModels, classifyAiError, AiUnavailable, ContentRejected } from "./ai-client";

const judgeSchema = z.object({
  correct: z.boolean(),
  standardMeaning: z.string(),
  comment: z.string(),
});

export type JudgeResult = z.infer<typeof judgeSchema>;

export interface MeaningInput {
  pos: string;
  definitions: string[];
}

function buildPrompt(word: string, answer: string, meanings?: MeaningInput[]): string {
  const userStandard =
    meanings && meanings.length > 0
      ? `\n学生词库中的自定义释义（这是本次判分的标准答案）：\n${meanings
          .map((m) => `${m.pos ? m.pos + " " : ""}${m.definitions.join("；")}`)
          .join("\n")}

补充规则（自定义释义优先）：
- 以上面学生提供的释义为标准答案，学生写对其中任意一个义项就算正确；
- 即使学生的写法与上面的释义用字不同，只要意思对应上任意一个义项就算对。`
      : "";

  return `你是一位雅思英语老师，正在批改学生的单词默写。

英文单词：${word}
学生手写的中文释义：${answer}${userStandard}

判断规则（宽松）：
- 只要学生的答案包含了单词的核心意思，就算正确；
- 同义词、近义词、口语化表达都算对；
- 不要求一字不差，不要求包含所有义项；
- 只有完全偏离单词意思才算错误。

判断规则补充（雅思标准，词库没有自定义释义时适用）：
1. 请使用雅思考试中常见的中文释义作为标准；
2. 优先采用学术语境下的释义，而不是口语化或冷门释义；
3. 如果单词有多个义项，只判断雅思考试中最常考的那一个；
4. 标准释义请参考《雅思词汇真经》的常见译法。

特别注意：返回的 standardMeaning 字段也必须按上述雅思标准给出，只写最常考的那个义项，不要给冷门释义。

请严格只输出一个 JSON 对象，不要输出任何其他文字，格式：
{"correct": true 或 false, "standardMeaning": "该单词的雅思常用中文释义（简洁）", "comment": "给学生的一句话简短评语（中文，友好鼓励，30 字以内）"}`;
}

interface NodeLikeProcess {
  env?: Record<string, string | undefined>;
  loadEnvFile?: (path?: string) => void;
}

function readEnv(key: string): string | undefined {
  const proc = (globalThis as { process?: NodeLikeProcess }).process;
  const v = proc?.env?.[key];
  if (v) return v;
  // 兜底加载 .env 与 .env.local（已存在的变量不会被覆盖）
  if (typeof proc?.loadEnvFile === "function") {
    for (const f of [".env", ".env.local"]) {
      try {
        proc.loadEnvFile(f);
      } catch {
        /* 文件不存在则忽略 */
      }
    }
  }
  return proc?.env?.[key];
}

/** 模式一：直连 DeepSeek（用户自己的 Key，仅存服务端 .env.local） */
async function judgeWithDeepSeek(word: string, answer: string, apiKey: string, meanings?: MeaningInput[]): Promise<JudgeResult> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: buildPrompt(word, answer, meanings) }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("DeepSeek API Key 无效，请检查 .env.local 中的 DEEPSEEK_API_KEY");
    if (res.status === 402) throw new Error("DeepSeek 账户余额不足，请充值后重试");
    if (res.status === 429) throw new Error("DeepSeek 请求过于频繁，请稍后再试");
    throw new Error(`DeepSeek 请求失败（HTTP ${res.status}）${text.slice(0, 120)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = judgeSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error("AI 返回格式异常，请重试");
  return parsed.data;
}

/** 模式二：平台内置 AI 网关（无需配置 Key） */
async function judgeWithGateway(word: string, answer: string, meanings?: MeaningInput[]): Promise<JudgeResult> {
  const provider = createOpenAICompatible({
    name: "kimi-gw",
    baseURL: readEnv("KIMI_AGENTGW_BASE_URL")!,
    apiKey: readEnv("KIMI_AGENTGW_API_KEY")!,
    supportsStructuredOutputs: true,
  });
  const { defaultModelId } = await listModels();
  const { object } = await generateObject({
    model: provider(defaultModelId),
    schema: judgeSchema,
    prompt: buildPrompt(word, answer, meanings),
  });
  return object;
}

export async function judgeAnswer(word: string, answer: string, meanings?: MeaningInput[]): Promise<JudgeResult> {
  try {
    const deepseekKey = readEnv("DEEPSEEK_API_KEY");
    if (deepseekKey) return await judgeWithDeepSeek(word, answer, deepseekKey, meanings);
    return await judgeWithGateway(word, answer, meanings);
  } catch (err) {
    const classified = classifyAiError(err);
    if (classified instanceof AiUnavailable) {
      throw new Error("AI 额度耗尽，判分功能暂不可用，请管理员在 Kimi 充值");
    }
    if (classified instanceof ContentRejected) {
      throw new Error("内容被安全策略拒绝，请调整输入后重试");
    }
    throw new Error(classified.message || "判分失败，请稍后重试");
  }
}

// ---------- 反向测试：AI 生成中文题干 ----------

const defineSchema = z.object({
  definition: z.string(), // 如 "n. 高原；平稳期"
});

export type DefineResult = z.infer<typeof defineSchema>;

function buildDefinePrompt(word: string): string {
  return `请给出英文单词「${word}」的中文释义，用于词汇测试的题干。

要求：
1. 使用雅思考试中常见的中文释义；
2. 优先学术语境，不要口语化或冷门释义；
3. 有多个词性/义项时，只保留雅思最常考的一到两个；
4. 带上词性缩写（n. v. adj. adv. 等），格式如："n. 高原；平稳期"；
5. 简洁，不超过 30 字。

请严格只输出一个 JSON 对象：{"definition": "词性 释义"}`;
}

/** 直连 DeepSeek 生成释义 */
async function defineWithDeepSeek(word: string, apiKey: string): Promise<DefineResult> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: buildDefinePrompt(word) }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek 请求失败（HTTP ${res.status}）`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = defineSchema.safeParse(JSON.parse(data.choices?.[0]?.message?.content ?? ""));
  if (!parsed.success) throw new Error("AI 返回格式异常，请重试");
  return parsed.data;
}

/** 平台网关生成释义 */
async function defineWithGateway(word: string): Promise<DefineResult> {
  const provider = createOpenAICompatible({
    name: "kimi-gw",
    baseURL: readEnv("KIMI_AGENTGW_BASE_URL")!,
    apiKey: readEnv("KIMI_AGENTGW_API_KEY")!,
    supportsStructuredOutputs: true,
  });
  const { defaultModelId } = await listModels();
  const { object } = await generateObject({
    model: provider(defaultModelId),
    schema: defineSchema,
    prompt: buildDefinePrompt(word),
  });
  return object;
}

/** 为单词生成中文题干（优先 DeepSeek Key，否则平台网关） */
export async function defineWord(word: string): Promise<DefineResult> {
  try {
    const deepseekKey = readEnv("DEEPSEEK_API_KEY");
    if (deepseekKey) return await defineWithDeepSeek(word, deepseekKey);
    return await defineWithGateway(word);
  } catch (err) {
    const classified = classifyAiError(err);
    throw new Error(classified.message || "释义生成失败，请稍后重试");
  }
}

// ---------- 检索翻译：中文 → 英文候选词 ----------

const reverseSchema = z.object({
  words: z.array(z.string().max(60)).max(6), // 如 ["continuous", "continual"]
});

export type ReverseResult = z.infer<typeof reverseSchema>;

function buildReversePrompt(chinese: string): string {
  return `学生输入了中文「${chinese}」，想找出对应的英文单词（用于背单词）。

要求：
1. 给出 1-4 个最常用、雅思/学术语境下最贴切的英文单词；
2. 按贴切程度排序，最贴切的排前面；
3. 只给单词本身（单个词，不要短语、不要词性、不要释义）；
4. 如果输入实在太宽泛没有明确对应词，给出最接近的 1-2 个。

请严格只输出一个 JSON 对象：{"words": ["word1", "word2"]}`;
}

async function reverseWithDeepSeek(chinese: string, apiKey: string): Promise<ReverseResult> {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: buildReversePrompt(chinese) }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek 请求失败（HTTP ${res.status}）`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const parsed = reverseSchema.safeParse(JSON.parse(data.choices?.[0]?.message?.content ?? ""));
  if (!parsed.success) throw new Error("AI 返回格式异常，请重试");
  return parsed.data;
}

async function reverseWithGateway(chinese: string): Promise<ReverseResult> {
  const provider = createOpenAICompatible({
    name: "kimi-gw",
    baseURL: readEnv("KIMI_AGENTGW_BASE_URL")!,
    apiKey: readEnv("KIMI_AGENTGW_API_KEY")!,
    supportsStructuredOutputs: true,
  });
  const { defaultModelId } = await listModels();
  const { object } = await generateObject({
    model: provider(defaultModelId),
    schema: reverseSchema,
    prompt: buildReversePrompt(chinese),
  });
  return object;
}

/** 中文 → 英文候选词（优先 DeepSeek Key，否则平台网关） */
export async function reverseLookup(chinese: string): Promise<ReverseResult> {
  try {
    const deepseekKey = readEnv("DEEPSEEK_API_KEY");
    if (deepseekKey) return await reverseWithDeepSeek(chinese, deepseekKey);
    return await reverseWithGateway(chinese);
  } catch (err) {
    const classified = classifyAiError(err);
    throw new Error(classified.message || "查询失败，请稍后重试");
  }
}
