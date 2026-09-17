// components/Navbar.tsx
// Top navigation bar replacing the sidebar with a modern centered header layout.

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookmarkIcon,
  FolderIcon,
  PlugIcon,
  SettingsIcon,
  LogOutIcon,
  PlusIcon,
  ChevronDownIcon,
  BookOpenIcon,
  FileTextIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import { SettingsModal } from "@/components/SettingsModal";
import { AddBookmarkDialog } from "@/components/AddBookmarkDialog";

interface NavbarProps {
  user: User;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const navLinks = [
    { label: "Bookmarks", href: "/dashboard", icon: BookmarkIcon },
    { label: "Folders", href: "/dashboard/folders", icon: FolderIcon },
    { label: "Connections & AI", href: "/dashboard/connections", icon: PlugIcon },
  ];

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full backdrop-blur-md transition-bk"
        style={{
          background: "rgba(11, 17, 27, 0.92)",
          borderBottom: "1px solid var(--bk-border)",
        }}
      >
        <div className="max-w-[1440px] w-full mx-auto min-h-[55px] px-3 py-2 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Logo.png"
              alt="Bookar"
              className="w-8 h-8 rounded-[9px] object-cover transition-bk group-hover:scale-105"
            />
            <span
              className="font-bold text-base tracking-tight"
              style={{ color: "var(--bk-text-primary)" }}
            >
              Bookar
            </span>
          </Link>

          {/* Centered Nav Links */}
          <nav className="order-3 flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-[10px] p-1 md:order-none md:w-auto md:max-w-none" style={{ background: "rgba(23,30,42,0.82)", border: "1px solid var(--bk-border)" }}>
            {navLinks.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-xs font-medium transition-bk"
                  style={{
                    background: active ? "var(--bk-selection)" : "transparent",
                    color: active ? "var(--bk-accent)" : "var(--bk-text-muted)",
                    border: active ? "1px solid var(--bk-border)" : "1px solid transparent",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Quick Add Button */}
            <button
              onClick={() => setAddDialogOpen(true)}
              className="hidden sm:flex h-10 items-center gap-1.5 px-3.5 rounded-[8px] text-xs font-semibold transition-bk"
              style={{
                background: "var(--bk-accent)",
                color: "#09090b",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bk-accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bk-accent)")}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Bookmark
            </button>

            {/* Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-10 items-center gap-2 px-2 rounded-[8px] transition-bk cursor-pointer outline-none"
                style={{ background: "transparent", border: "1px solid var(--bk-border)" }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = "transparent")
                }
              >
                {user.user_metadata?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.user_metadata.avatar_url}
                    alt=""
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "var(--bk-selection)", color: "var(--bk-text-primary)" }}
                  >
                    {(user.email?.[0] ?? "U").toUpperCase()}
                  </div>
                )}
                <ChevronDownIcon className="w-3 h-3" style={{ color: "var(--bk-text-muted)" }} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-56 p-1.5">
                <div className="px-3 py-2 border-b mb-1" style={{ borderColor: "var(--bk-border)" }}>
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--bk-text-primary)" }}>
                    {user.user_metadata?.full_name || user.email?.split("@")[0] || "User"}
                  </p>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--bk-text-muted)" }}>
                    {user.email}
                  </p>
                </div>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <SettingsIcon className="w-3.5 h-3.5 mr-2" />
                  Settings & Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/docs")}>
                  <BookOpenIcon className="w-3.5 h-3.5 mr-2" />
                  Docs & Guide
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/terms")}>
                  <FileTextIcon className="w-3.5 h-3.5 mr-2" />
                  Terms & Conditions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/dashboard/connections")}>
                  <PlugIcon className="w-3.5 h-3.5 mr-2" />
                  Connections & AI
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-400 focus:text-red-400 mt-1 border-t"
                  style={{ borderColor: "var(--bk-border)" }}
                  onClick={handleSignOut}
                >
                  <LogOutIcon className="w-3.5 h-3.5 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        user={user}
      />

      {/* Add Bookmark Dialog */}
      <AddBookmarkDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        userId={user.id}
        deviceId=""
        onAdded={() => router.refresh()}
      />
    </>
  );
}
