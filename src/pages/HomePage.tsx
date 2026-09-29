import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PenLine, BookmarkX, ListPlus, ArrowRight } from "lucide-react";
import { getWords, getWrongBook } from "@/lib/store";

const SLOGANS = ["Every drop counts.", "Rain falls. Words stay.", "一词一雨，积水成渊。"];

export default function HomePage() {
  const [wordCount, setWordCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [typed, setTyped] = useState("");

  // 打字机循环
  useEffect(() => {
    let sloganIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timer: number;
    const tick = () => {
      const s = SLOGANS[sloganIdx];
      if (!deleting) {
        charIdx += 1;
        setTyped(s.slice(0, charIdx));
        if (charIdx >= s.length) {
          deleting = true;
          timer = window.setTimeout(tick, 2200);
          return;
        }
        timer = window.setTimeout(tick, 110);
      } else {
        charIdx -= 1;
        setTyped(s.slice(0, charIdx));
        if (charIdx <= 0) {
          deleting = false;
          sloganIdx = (sloganIdx + 1) % SLOGANS.length;
          timer = window.setTimeout(tick, 500);
          return;
        }
        timer = window.setTimeout(tick, 45);
      }
    };
    timer = window.setTimeout(tick, 800);
    return () => window.clearTimeout(timer);
  }, []);

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
      title: "单词测试",
      desc: "随机抽词，手写中文释义，AI 按雅思标准宽松判分",
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
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="pt-6 text-center sm:pt-14">
        <p className="eyebrow">Vocabulary · AI Judged</p>
        <h1 className="hero-title mx-auto mt-6 max-w-3xl text-5xl sm:text-7xl">
          像雨落进水面
          <br />
          把单词记进脑子
        </h1>
        {/* 打字机 slogan */}
        <p className="mt-5 h-6 font-mono text-sm tracking-[0.25em] text-blue-200/70">
          {typed}
          <span className="typewriter-caret ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] bg-blue-300" />
        </p>


        {/* 数据 */}
        <div className="mt-10 flex items-center justify-center gap-10 font-mono">
          <div className="text-center">
            <div className="text-4xl font-light text-white">{wordCount}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/35">
              词库
            </div>
          </div>
          <span className="h-10 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-4xl font-light text-blue-200">{wrongCount}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/35">
              待复习错题
            </div>
          </div>
        </div>

        <Link
          to="/test"
          className="glow-btn mt-12 min-h-[52px] rounded-full px-10 text-sm tracking-[0.2em]"
        >
          开始测试 <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* 功能入口：玻璃拟态卡片 */}
      <section className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="glass-card group rounded-2xl p-6 transition-all duration-500 hover:-translate-y-1 hover:border-blue-300/30 hover:shadow-[0_0_35px_rgba(96,165,250,0.12)]"
          >
            <Icon className="h-5 w-5 text-blue-300/70 transition-colors duration-500 group-hover:text-blue-200" />
            <h2 className="mt-4 text-lg font-semibold tracking-wide text-white transition-colors duration-500 group-hover:text-blue-100">
              {title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed tracking-wider text-white/40">
              {desc}
            </p>
          </Link>
        ))}
      </section>

      <p className="text-center font-mono text-[11px] tracking-[0.2em] text-white/25">
        词库与错题本保存在浏览器 localStorage · 仅当前浏览器可见 · 清除浏览器数据会丢失
      </p>
    </div>
  );
}
