"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookmarkIcon,
  ClockIcon,
  BotIcon,
  SearchIcon,
  CheckSquareIcon,
  SquareIcon,
  Trash2Icon,
  Share2Icon,
  FolderIcon,
  FolderPlusIcon,
  ChevronUpIcon,
  XIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { BookmarkRow, BookmarkWithDevice } from "@/components/BookmarkRow";
import { SkeletonRows } from "@/components/SkeletonRows";
import { LinkingCodeCard, NoBookmarksState } from "@/components/EmptyState";
import { AddBookmarkDialog } from "@/components/AddBookmarkDialog";
import { BookmarkDetailDialog } from "@/components/BookmarkDetailDialog";

type FilterTab = "all" | "recent" | "bot";

interface Device {
  id: string;
  device_name: string;
  browser: string;
  last_synced_at: string | null;
  api_key_hash: string | null;
}

interface DashboardClientProps {
  userId: string;
  hasLinkedDevice: boolean;
  devices: Device[];
}

export function DashboardClient({
  userId,
  hasLinkedDevice: initialHasLinked,
  devices,
}: DashboardClientProps) {
  const [hasLinkedDevice, setHasLinkedDevice] = useState(initialHasLinked);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [bookmarks, setBookmarks] = useState<BookmarkWithDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareCopied, setShareCopied] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailBookmark, setDetailBookmark] = useState<BookmarkWithDevice | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const supabase = createSupabaseBrowserClient();

  const fetchBookmarks = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabase
      .from("bookmarks")
      .select("*, devices(device_name, browser)")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.warn("Primary bookmark join query notice, attempting fallback select:", error.message);
      const fallback = await supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      data = fallback.data;
      error = fallback.error;
    }

    if (!error && data) {
      const groupMap = new Map<string, any>();

      data.forEach((bm: any) => {
        const normUrl = (bm.url || "").trim().toLowerCase().replace(/\/$/, "");
        const devName =
          bm.devices?.browser && bm.devices.browser !== "Unknown"
            ? bm.devices.browser
            : bm.devices?.device_name && bm.devices.device_name !== "Pending Device"
            ? bm.devices.device_name
            : "Browser";

        if (!groupMap.has(normUrl)) {
          groupMap.set(normUrl, {
            ...bm,
            device_name: devName,
            browser: bm.devices?.browser,
          });
        } else {
          const existing = groupMap.get(normUrl)!;
          if (devName && existing.device_name && !existing.device_name.includes(devName)) {
            existing.device_name = `${existing.device_name}, ${devName}`;
          }
        }
      });

      setBookmarks(Array.from(groupMap.values()));
    } else if (error) {
      console.error("Failed to load bookmarks:", error);
    }
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    if (!hasLinkedDevice) {
      setLoading(false);
      return;
    }

    const load = async () => {
      await fetchBookmarks();
    };

    void load();
  }, [hasLinkedDevice, fetchBookmarks]);

  // Realtime subscription for live updates from DB
  useEffect(() => {
    if (!hasLinkedDevice) return;
    const channel = supabase
      .channel("bookmarks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookmarks", filter: `user_id=eq.${userId}` },
        () => fetchBookmarks(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, userId, hasLinkedDevice, fetchBookmarks]);

  const handleDelete = async (id: string) => {
    await supabase
      .from("bookmarks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleRegenerate = async (bookmark: BookmarkWithDevice) => {
    setBookmarks((prev) => prev.map((item) =>
      item.id === bookmark.id ? { ...item, description_pending: true } : item,
    ));

    try {
      const response = await fetch("/api/recreate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmark_id: bookmark.id }),
      });
      if (!response.ok) throw new Error("Failed to regenerate bookmark summary");
      await fetchBookmarks();
    } catch (error) {
      console.error("Failed to regenerate bookmark summary", error);
      setBookmarks((prev) => prev.map((item) =>
        item.id === bookmark.id ? { ...item, description_pending: false } : item,
      ));
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await supabase
      .from("bookmarks")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    setBookmarks((prev) => prev.filter((b) => !selectedIds.has(b.id)));
    setSelectedIds(new Set());
  };

  const handleBulkMove = async (targetFolder: string) => {
    if (!targetFolder.trim()) return;
    const ids = Array.from(selectedIds);
    await supabase
      .from("bookmarks")
      .update({ folder_path: targetFolder.trim(), updated_at: new Date().toISOString() })
      .in("id", ids);

    setBookmarks((prev) =>
      prev.map((b) => (selectedIds.has(b.id) ? { ...b, folder_path: targetFolder.trim() } : b)),
    );
    setSelectedIds(new Set());
    setNewFolderName("");
  };

  const handleShare = async () => {
    const selectedList = bookmarks.filter((b) => selectedIds.has(b.id));
    if (selectedList.length === 0) return;

    const formattedText = selectedList
      .map((bm, idx) => {
        let text = `${idx + 1}. ${bm.title || bm.url}\n   ${bm.url}`;
        if (bm.description) {
          text += `\n   ${bm.description}`;
        }
        return text;
      })
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(formattedText);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy bookmarks", err);
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Extract list of unique existing folder paths
  const existingFolders = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((b) => {
      if (b.folder_path) set.add(b.folder_path);
    });
    return Array.from(set).sort();
  }, [bookmarks]);

  // ── Instant real-time client search and filtering ─────────────────────────
  const displayedBookmarks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    let list = bookmarks.filter((bm) => {
      if (activeTab === "bot") {
        const src = bm.source as string | undefined;
        const isBotSource =
          src === "bot" ||
          src === "mcp" ||
          src === "api" ||
          (src && src !== "browser" && src !== "dashboard");
        if (!isBotSource) return false;
      }

      if (!q) return true;

      const titleMatch = bm.title?.toLowerCase().includes(q);
      const urlMatch = bm.url?.toLowerCase().includes(q);
      const descMatch = bm.description?.toLowerCase().includes(q);
      const folderMatch = bm.folder_path?.toLowerCase().includes(q);
      const tagMatch = bm.tags?.some((t) => t.toLowerCase().includes(q));

      return titleMatch || urlMatch || descMatch || folderMatch || tagMatch;
    });

    if (activeTab === "recent") {
      list = [...list]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30);
    }

    return list;
  }, [bookmarks, activeTab, searchQuery]);

  const allDisplayedSelected =
    displayedBookmarks.length > 0 &&
    displayedBookmarks.every((b) => selectedIds.has(b.id));

  const toggleSelectAll = () => {
    if (allDisplayedSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      displayedBookmarks.forEach((b) => next.add(b.id));
      setSelectedIds(next);
    }
  };

  const tabs: { id: FilterTab; label: string; icon: React.ReactNode }[] = [
    { id: "all", label: "View all", icon: <BookmarkIcon className="w-3.5 h-3.5" /> },
    { id: "recent", label: "Recently added", icon: <ClockIcon className="w-3.5 h-3.5" /> },
    { id: "bot", label: "Bot-added", icon: <BotIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col space-y-6">

      {/* ── No device linked → show linking code ─────────────────────── */}
      {!hasLinkedDevice && (
        <LinkingCodeCard
          userId={userId}
          onLinked={() => {
            setHasLinkedDevice(true);
            fetchBookmarks();
          }}
        />
      )}

      {/* ── Device linked → Search & List Controls ─────────────────────── */}
      {hasLinkedDevice && (
        <div
          className="bk-card p-3 sm:p-4 space-y-3 relative"
          style={{ border: "1px solid var(--bk-border)" }}
        >
          {/* Sticky Header Controls Bar */}
          <div
            className="sticky top-[68px] z-20 py-3 px-3 sm:px-4 -mx-3 sm:-mx-4 -mt-3 sm:-mt-4 mb-1 backdrop-blur-md rounded-t-[14px] transition-bk"
            style={{
              background: "rgba(23, 30, 42, 0.96)",
              borderBottom: "1px solid var(--bk-border)",
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Search Input & Counter */}
              <div className="flex items-center gap-3 flex-1 max-w-xl">
                <div className="relative flex-1">
                  <SearchIcon
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--bk-text-muted)" }}
                  />
                  <input
                    type="text"
                    placeholder="Search titles, URLs, tags, folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 text-xs rounded-[10px] outline-none transition-bk"
                    style={{
                      background: "#0f1622",
                      border: "1px solid var(--bk-border)",
                      color: "var(--bk-text-primary)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--bk-accent)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--bk-border)")}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/10"
                      style={{ color: "var(--bk-text-muted)" }}
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Bookmark Search Counter UX Badge */}
                <span
                  className="text-xs px-2.5 py-1.5 rounded-[8px] font-medium whitespace-nowrap hidden md:inline-block transition-bk"
                  style={{
                    background: "var(--bk-bg)",
                    border: "1px solid var(--bk-border)",
                    color: "var(--bk-text-muted)",
                  }}
                >
                  Showing <strong style={{ color: "var(--bk-text-primary)" }}>{displayedBookmarks.length}</strong> of {bookmarks.length}
                </span>
              </div>

              {/* Filter Tabs */}
              <div
                className="inline-flex gap-1 p-1 rounded-[10px] self-start sm:self-auto"
                style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-xs font-medium transition-bk"
                    style={{
                      background: activeTab === tab.id ? "var(--bk-selection)" : "transparent",
                      color: activeTab === tab.id ? "var(--bk-accent)" : "var(--bk-text-muted)",
                      border: activeTab === tab.id ? "1px solid var(--bk-border)" : "1px solid transparent",
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bookmark list */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pt-1">
            {loading ? (
              <SkeletonRows count={6} />
            ) : displayedBookmarks.length === 0 ? (
              searchQuery ? (
                <div className="text-center py-12">
                  <p className="text-sm font-medium" style={{ color: "var(--bk-text-primary)" }}>
                    No bookmarks match &quot;{searchQuery}&quot;
                  </p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-xs mt-2 transition-bk underline"
                    style={{ color: "var(--bk-text-primary)" }}
                  >
                    Clear search query
                  </button>
                </div>
              ) : (
                <NoBookmarksState onAddBookmark={() => setAddDialogOpen(true)} />
              )
            ) : (
              displayedBookmarks.map((bm, i) => (
                <div
                  key={bm.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <BookmarkRow
                    bookmark={bm}
                    checked={selectedIds.has(bm.id)}
                    isSelectMode={selectedIds.size > 0}
                    onCheckedChange={toggleSelect}
                    onDelete={handleDelete}
                    onRegenerate={handleRegenerate}
                    onSelect={(b) => setDetailBookmark(b)}
                    index={i}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bulk action bar (slides up when items selected) */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-[16px] shadow-2xl animate-slide-up max-w-xl w-full mx-auto"
          style={{
            background: "var(--bk-surface)",
            border: "1px solid var(--bk-border)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
          }}
        >
          {/* Select All Toggle */}
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-xs font-medium transition-bk"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "var(--bk-text-primary)",
              border: "1px solid var(--bk-border)",
            }}
          >
            {allDisplayedSelected ? (
              <CheckSquareIcon className="w-3.5 h-3.5" style={{ color: "var(--bk-accent)" }} />
            ) : (
              <SquareIcon className="w-3.5 h-3.5" style={{ color: "var(--bk-text-muted)" }} />
            )}
            {allDisplayedSelected ? "Deselect All" : "Select All"}
          </button>

          <span className="text-xs font-semibold" style={{ color: "var(--bk-text-primary)" }}>
            {selectedIds.size} selected
          </span>

          <div className="flex items-center gap-2 ml-auto">
            {/* Share Selected Bookmarks */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk"
              style={{
                background: shareCopied ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
                color: "var(--bk-text-primary)",
                border: "1px solid var(--bk-border)",
              }}
            >
              <Share2Icon className="w-3.5 h-3.5" />
              {shareCopied ? "Copied!" : "Share"}
            </button>

            {/* Move to Folder Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk outline-none cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "var(--bk-text-primary)",
                  border: "1px solid var(--bk-border)",
                }}
              >
                <FolderIcon className="w-3.5 h-3.5" />
                Move to folder
                <ChevronUpIcon className="w-3 h-3 ml-0.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-2">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bk-text-muted)" }}>
                  Select existing folder
                </div>
                {existingFolders.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs" style={{ color: "var(--bk-text-muted)" }}>
                    No existing folders yet
                  </div>
                ) : (
                  existingFolders.map((folder) => (
                    <DropdownMenuItem key={folder} onClick={() => handleBulkMove(folder)}>
                      <FolderIcon className="w-3.5 h-3.5 mr-2" style={{ color: "var(--bk-accent)" }} />
                      <span className="truncate">{folder}</span>
                    </DropdownMenuItem>
                  ))
                )}
                <div className="border-t my-1 pt-1.5" style={{ borderColor: "var(--bk-border)" }}>
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bk-text-muted)" }}>
                    Create new folder
                  </div>
                  <div className="flex gap-1 px-1">
                    <input
                      type="text"
                      placeholder="Folder name..."
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="flex-1 px-2 py-1 text-xs rounded-[6px] outline-none"
                      style={{
                        background: "var(--bk-bg)",
                        border: "1px solid var(--bk-border)",
                        color: "var(--bk-text-primary)",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleBulkMove(newFolderName);
                      }}
                    />
                    <button
                      onClick={() => handleBulkMove(newFolderName)}
                      className="px-2 py-1 text-xs rounded-[6px] font-medium"
                      style={{ background: "var(--bk-accent)", color: "#09090b" }}
                    >
                      <FolderPlusIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk Delete */}
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-[8px] font-medium transition-bk"
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#fc8181",
              }}
            >
              <Trash2Icon className="w-3.5 h-3.5" />
              Delete ({selectedIds.size})
            </button>

            {/* Cancel */}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1.5 text-xs rounded-[8px] transition-bk"
              style={{
                color: "var(--bk-text-muted)",
                border: "1px solid var(--bk-border)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Add Bookmark Dialog */}
      <AddBookmarkDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        userId={userId}
        deviceId={devices[0]?.id ?? ""}
        devices={devices}
        onAdded={fetchBookmarks}
      />

      {/* Bookmark Detail Modal */}
      <BookmarkDetailDialog
        bookmark={detailBookmark}
        open={!!detailBookmark}
        onOpenChange={(open) => !open && setDetailBookmark(null)}
        onDelete={handleDelete}
      />
    </div>
  );
}
