import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { TabBar, TabBarItem } from "tdesign-mobile-react";
import {
  CalendarCheck,
  CalendarDays,
  Home,
  Settings,
  Weight,
} from "lucide-react";
import { TAB_ROUTES, type Tab } from "./routes";

const nav = [
  ["today", Home, "今日"],
  ["plan", CalendarDays, "计划"],
  ["calendar", CalendarCheck, "日历"],
  ["body", Weight, "身体"],
  ["settings", Settings, "设置"],
] as const;

export function AppShell({
  ready,
  ftp,
  tab,
  children,
}: {
  ready: boolean;
  ftp: number;
  tab: Tab;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>骑行训练</h1>
        </div>
        <div className="ftp-pill">FTP {ftp}W</div>
      </header>

      {!ready ? (
        <section className="panel">正在加载本地数据...</section>
      ) : (
        children
      )}

      <TabBar
        className="bottom-nav"
        value={tab}
        fixed
        safeAreaInsetBottom
        onChange={(value) => navigate(TAB_ROUTES[value as Tab])}
      >
        {nav.map(([id, Icon, label]) => (
          <TabBarItem
            key={id}
            value={id}
            icon={<Icon size={23} strokeWidth={2.25} />}
          >
            {label}
          </TabBarItem>
        ))}
      </TabBar>
    </main>
  );
}
