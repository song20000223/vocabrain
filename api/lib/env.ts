import "dotenv/config";

/** 本项目无数据库、无 OAuth，仅保留生产判定。 */
export const env = {
  isProduction: process.env.NODE_ENV === "production",
};
