import type { PageId } from "../../types/navigation";
import { colors } from "../../styles/theme";
import {
  AnalyzeIcon,
  CloseIcon,
  HistoryIcon,
  HomeIcon,
  PlayersIcon,
  SettingsIcon,
  TeamIcon,
} from "./Icons";

type NavItem = {
  id: PageId;
  label: string;
  icon: (props: { size?: number; style?: React.CSSProperties }) => React.ReactElement;
};

const navItems: NavItem[] = [
  { id: "home", label: "ホーム", icon: HomeIcon },
  { id: "analyze", label: "解析", icon: AnalyzeIcon },
  { id: "history", label: "履歴", icon: HistoryIcon },
  { id: "players", label: "選手", icon: PlayersIcon },
  { id: "team", label: "チーム", icon: TeamIcon },
  { id: "settings", label: "設定", icon: SettingsIcon },
];

// "result" と "compare" はサイドバーに項目を持たず、ホーム/履歴からの遷移で表示される。
const activeGroup: Partial<Record<PageId, PageId>> = {
  result: "analyze",
  compare: "history",
};

type Props = {
  page: PageId;
  onNavigate: (page: PageId) => void;
  userName: string;
  userRole: string;
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ page, onNavigate, userName, userRole, isOpen, onClose }: Props) {
  const activePage = activeGroup[page] ?? page;

  const handleNavigate = (id: PageId) => {
    onNavigate(id);
    onClose();
  };

  return (
    <aside
      className={`app-sidebar${isOpen ? " app-sidebar--open" : ""}`}
      aria-label="メインナビゲーション"
      style={{
        width: 232,
        flexShrink: 0,
        background: colors.sidebarBg,
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "6px 10px 22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: colors.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 16,
            }}
          >
            🏐
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>
              JUMP
            </div>
            <div style={{ color: colors.sidebarText, fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>
              ANALYZER
            </div>
          </div>
        </div>

        <button
          type="button"
          className="app-sidebar-close-btn"
          onClick={onClose}
          aria-label="メニューを閉じる"
          style={{
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 10,
            border: "none",
            background: "rgba(255,255,255,0.08)",
            color: "#fff",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        {navItems.map((item) => {
          const isActive = item.id === activePage;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 12px",
                minHeight: 44,
                borderRadius: 12,
                border: "none",
                background: isActive ? colors.accent : "transparent",
                color: isActive ? colors.sidebarActiveText : colors.sidebarText,
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 10px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          marginTop: 12,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {userName.slice(0, 1)}
        </div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div
            style={{
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userName}
          </div>
          <div style={{ color: colors.sidebarText, fontSize: 11 }}>{userRole}</div>
        </div>
      </div>
    </aside>
  );
}
