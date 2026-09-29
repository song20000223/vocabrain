import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { judgeAnswer, defineWord } from "./ai/judge";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  // 单词释义 AI 判分
  judge: publicQuery
    .input(
      z.object({
        word: z.string().min(1).max(100),
        answer: z.string().min(1).max(500),
        // 词库自定义释义（可选）：有则作为判分标准答案
        meanings: z
          .array(z.object({ pos: z.string().max(20), definitions: z.array(z.string().max(200)).max(20) }))
          .max(10)
          .optional(),
      }),
    )
    .mutation(({ input }) => judgeAnswer(input.word.trim(), input.answer.trim(), input.meanings)),

  // 反向测试：为单词生成中文题干（词库没有释义时由 AI 兜底）
  define: publicQuery
    .input(z.object({ word: z.string().min(1).max(100) }))
    .mutation(({ input }) => defineWord(input.word.trim())),
});

export type AppRouter = typeof appRouter;
