import { Link, NavLink, Outlet } from "react-router-dom";
import { BookOpen, PenLine, BookmarkX, ListPlus } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: BookOpen, end: true },
  { to: "/test", label: "单词测试", icon: PenLine },
  { to: "/wrong-book", label: "错题本", icon: BookmarkX },
  { to: "/words", label: "单词管理", icon: ListPlus },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#dadada] flex flex-col">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="font-mono text-lg tracking-wide text-white">
            Vocab<span className="text-amber-200/90">Rain</span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center rounded-md px-4 text-sm transition-colors ${
                    isActive
                      ? "bg-amber-200/10 text-amber-200"
                      : "text-[#9a9a9a] hover:text-white"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* 页面内容 */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-24 sm:pb-8">
        <Outlet />
      </main>

      {/* 移动端底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/10 bg-[#0a0a0a]/90 backdrop-blur-md sm:hidden pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-xs ${
                isActive ? "text-amber-200" : "text-[#9a9a9a]"
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
