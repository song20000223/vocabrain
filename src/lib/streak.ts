/**
 * 连续学习记录（streak）：记录每日首次判分的日期。
 * 今天已有记录 → 不变；昨天有记录 → +1；断档 → 重置为 1。
 */

const STREAK_KEY = "vocab_streak";

export interface Streak {
  days: number;
  lastDate: string; // YYYY-MM-DD（本地时区）
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function getStreak(): Streak {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { days: 0, lastDate: "" };
    const s = JSON.parse(raw) as Streak;
    return { days: s.days ?? 0, lastDate: s.lastDate ?? "" };
  } catch {
    return { days: 0, lastDate: "" };
  }
}

/** 每次判分调用：今日首次判分才更新 streak */
export function touchStreak(): void {
  const today = todayStr();
  const s = getStreak();
  if (s.lastDate === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  const yStr = `${yesterday.getFullYear()}-${p(yesterday.getMonth() + 1)}-${p(yesterday.getDate())}`;
  const days = s.lastDate === yStr ? s.days + 1 : 1;
  localStorage.setItem(STREAK_KEY, JSON.stringify({ days, lastDate: today }));
}
