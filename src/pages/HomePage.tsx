import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PenLine, BookmarkX, ListPlus, ArrowRight } from "lucide-react";
import { getWords, getWrongBook } from "@/lib/store";

export default function HomePage() {
  const [wordCount, setWordCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setWordCount(getWords().length);
      setWrongCount(getWrongBook().length);
    };
    refresh();
    window.addEventListener("vocab-store-change", refresh);
    return () => window.removeEventListener("vocab-store-change", refresh);
  }, []);

  const cards = [
    {
      to: "/test",
      icon: PenLine,
      title: "开始测试",
      desc: "随机抽一个单词，手写中文释义，AI 宽松判分",
    },
    {
      to: "/wrong-book",
      icon: BookmarkX,
      title: "错题本",
      desc: "答错的单词自动收录，随时回顾与清空",
    },
    {
      to: "/words",
      icon: ListPlus,
      title: "单词管理",
      desc: "手动添加单词，或整段粘贴批量导入",
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="pt-6 text-center sm:pt-12">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber-200/70">
          Vocabulary Practice
        </p>
        <h1 className="mt-4 font-serif text-4xl text-white sm:text-5xl">
          像雨落进水面一样
          <br />
          把单词记进脑子里
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#9a9a9a]">
          手写中文释义，AI 按「核心意思对就算对」的宽松规则判分；
          答错的单词自动进入错题本，数据保存在你自己的浏览器里。
        </p>
        <div className="mt-6 flex items-center justify-center gap-6 font-mono text-sm">
          <span>
            <span className="text-2xl text-amber-200">{wordCount}</span>
            <span className="ml-2 text-[#9a9a9a]">词库单词</span>
          </span>
          <span className="h-4 w-px bg-white/15" />
          <span>
            <span className="text-2xl text-amber-200">{wrongCount}</span>
            <span className="ml-2 text-[#9a9a9a]">待复习错题</span>
          </span>
        </div>
        <Link
          to="/test"
          className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-full border border-amber-200/40 bg-amber-200/10 px-8 font-mono text-sm text-amber-100 transition-colors hover:bg-amber-200/20"
        >
          开始测试 <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* 功能入口 */}
      <section className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-amber-200/40"
          >
            <Icon className="h-6 w-6 text-amber-200/80" />
            <h2 className="mt-3 font-serif text-lg text-white group-hover:text-amber-200">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#9a9a9a]">{desc}</p>
          </Link>
        ))}
      </section>

      <p className="text-center text-xs text-[#666]">
        提示：词库和错题本保存在浏览器 localStorage，仅当前浏览器可见，清除浏览器数据会丢失。
      </p>
    </div>
  );
}
