import { Link, NavLink, Outlet } from "react-router-dom";
import { BookOpen, PenLine, BookmarkX, ListPlus } from "lucide-react";
import RainBackground from "./RainBackground";

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: BookOpen, end: true },
  { to: "/test", label: "测试", icon: PenLine },
  { to: "/wrong-book", label: "错题本", icon: BookmarkX },
  { to: "/words", label: "词库", icon: ListPlus },
];

export default function Layout() {
  return (
    <div className="relative min-h-screen text-white">
      <RainBackground />

      {/* 悬浮透明导航 */}
      <header className="fixed left-0 right-0 top-4 z-50 flex justify-center px-4">
        <div className="glass-nav flex h-12 w-full max-w-3xl items-center justify-between rounded-full pl-5 pr-2">
          <Link to="/" className="font-mono text-sm tracking-[0.2em] text-white">
            VOCAB<span className="text-cyan-300">RAIN</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center rounded-full px-4 text-[13px] tracking-wider transition-colors duration-300 ${
                    isActive
                      ? "bg-white/10 text-cyan-200"
                      : "text-white/50 hover:text-white"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <Link
            to="/test"
            className="glow-btn hidden min-h-[36px] items-center rounded-full px-5 text-[13px] font-medium tracking-wider sm:flex"
          >
            开始测试
          </Link>
        </div>
      </header>

      {/* 页面内容 */}
      <main className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-32 pt-28 sm:pb-24">
        <Outlet />
      </main>

      {/* 移动端底部导航（玻璃拟态） */}
      <nav className="glass-nav fixed bottom-3 left-3 right-3 z-50 flex rounded-2xl pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] tracking-wider transition-colors duration-300 ${
                isActive ? "text-cyan-200" : "text-white/45"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
