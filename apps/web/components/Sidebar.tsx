"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  BookmarkIcon,
  HomeIcon,
  FolderIcon,
  ClockIcon,
  BotIcon,
  Trash2Icon,
  PlugIcon,
  SettingsIcon,
  LogOutIcon,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

const navItems = [
  { label: "Home", icon: HomeIcon, href: "/dashboard" },
  { label: "All bookmarks", icon: BookmarkIcon, href: "/dashboard/bookmarks" },
  { label: "Folders", icon: FolderIcon, href: "/dashboard/folders" },
  { label: "Recently added", icon: ClockIcon, href: "/dashboard/recent" },
  { label: "Bot-added", icon: BotIcon, href: "/dashboard/bot-added" },
  { label: "Deleted", icon: Trash2Icon, href: "/dashboard/deleted" },
];

const bottomNavItems = [
  { label: "Connections", icon: PlugIcon, href: "/dashboard/connections" },
  { label: "Settings", icon: SettingsIcon, href: "/dashboard/settings" },
];

interface SidebarProps {
  user: User;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="flex flex-col h-full flex-shrink-0"
      style={{
        width: "280px",
        background: "var(--bk-surface)",
        borderRight: "1px solid var(--bk-border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: "1px solid var(--bk-border)" }}
      >
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--bk-accent), #4FB8C4)",
          }}
        >
          <BookmarkIcon className="w-4 h-4 text-[#20242B]" />
        </div>
        <div>
          <span
            className="font-semibold text-sm"
            style={{ color: "var(--bk-text-primary)" }}
          >
            Bookar
          </span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-[2px]">
        {navItems.map(({ label, icon: Icon, href }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-[8px] text-sm transition-bk group"
              style={{
                background: active ? "var(--bk-selection)" : "transparent",
                color: active ? "var(--bk-accent)" : "var(--bk-text-muted)",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              <Icon
                className="w-4 h-4 flex-shrink-0"
                style={{ color: active ? "var(--bk-accent)" : "var(--bk-text-muted)" }}
              />
              <span
                style={{
                  color: active ? "var(--bk-accent)" : "var(--bk-text-primary)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--bk-border)" }} />

      {/* Bottom nav */}
      <nav className="px-3 py-3 space-y-[2px]">
        {bottomNavItems.map(({ label, icon: Icon, href }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-[8px] text-sm transition-bk"
              style={{
                background: active ? "var(--bk-selection)" : "transparent",
                color: active ? "var(--bk-accent)" : "var(--bk-text-muted)",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span style={{ fontWeight: active ? 500 : 400 }}>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div
        className="px-4 py-4"
        style={{ borderTop: "1px solid var(--bk-border)" }}
      >
        <div className="flex items-center gap-3">
          {user.user_metadata?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.user_metadata.avatar_url}
              alt="Avatar"
              className="w-7 h-7 rounded-full flex-shrink-0"
            />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
              style={{ background: "var(--bk-selection)", color: "var(--bk-accent)" }}
            >
              {(user.email?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-medium truncate"
              style={{ color: "var(--bk-text-primary)" }}
            >
              {user.user_metadata?.full_name ?? user.email}
            </p>
            <p className="text-[11px] truncate" style={{ color: "var(--bk-text-muted)" }}>
              {user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-[6px] transition-bk flex-shrink-0"
            style={{ color: "var(--bk-text-muted)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.06)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            title="Sign out"
          >
            <LogOutIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
