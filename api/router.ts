import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { judgeAnswer } from "./ai/judge";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  // 单词释义 AI 判分
  judge: publicQuery
    .input(
      z.object({
        word: z.string().min(1).max(100),
        answer: z.string().min(1).max(500),
      }),
    )
    .mutation(({ input }) => judgeAnswer(input.word.trim(), input.answer.trim())),
});

export type AppRouter = typeof appRouter;
