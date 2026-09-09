import { Icon } from "../ui/Icon";
import { useRef } from "react";
import { NavigationIndicator } from "../ui/NavigationIndicator";

const primaryItems = [
  ["课表", "calendar"],
  ["今天", "today"],
  ["选课", "search"],
  ["成绩", "chart"],
] as const;

const secondaryItems = [
  ["插件", "plugin"],
  ["设置", "settings"],
] as const;

interface SidebarProps {
  active: string;
  schoolName?: string;
  onNavigate: (item: string) => void;
}

export function Sidebar({ active, schoolName = "尚未连接学校", onNavigate }: SidebarProps) {
  const navigationRef = useRef<HTMLElement>(null);
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="课织">
        <span className="brand-mark"><i/><i/><i/></span>
        <span className="brand-copy"><strong>课织</strong><small>KEZHI</small></span>
      </div>

      <nav ref={navigationRef} className="nav-list primary-navigation" aria-label="主导航">
        <NavigationIndicator active={active} container={navigationRef} />
        {primaryItems.map(([label, icon]) => (
          <button
            className={`nav-item ${active === label ? "active" : ""}`}
            key={label}
            aria-current={active === label ? "page" : undefined}
            onClick={() => onNavigate(label)}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className={`nav-item mobile-nav-item ${active === "设置" ? "active" : ""}`}
          aria-current={active === "设置" ? "page" : undefined}
          onClick={() => onNavigate("设置")}
        >
          <Icon name="settings" />
          <span>设置</span>
        </button>
      </nav>

      <div className="sidebar-spacer" />
      <nav className="nav-list secondary" aria-label="辅助导航">
        {secondaryItems.map(([label, icon]) => (
          <button className="nav-item" key={label} onClick={() => onNavigate(label)}>
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <button className="account-card" onClick={() => onNavigate("账号")}>
        <span className="avatar">学</span>
        <span className="account-copy">
          <strong>学生账号</strong>
          <small>{schoolName}</small>
        </span>
        <Icon name="more" />
      </button>
    </aside>
  );
}
