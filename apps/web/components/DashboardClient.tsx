"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  TrendingUpIcon,
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
import { FolderChangeDialog } from "@/components/FolderChangeDialog";

type FilterTab = "all" | "recent" | "bot" | "popular";

const DEFAULT_PAGE_SIZE = 10;

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
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareCopied, setShareCopied] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailBookmark, setDetailBookmark] = useState<BookmarkWithDevice | null>(null);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const regeneratingIdsRef = useRef(new Set<string>());
  const [folderChangePrompt, setFolderChangePrompt] = useState<{
    bookmarkId: string;
    currentFolder: string | null;
    proposedFolder: string;
  } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchBookmarks = useCallback(async (page: number, size: number, queryText: string, tab: FilterTab) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), size: String(size), q: queryText, tab });
    try {
      const response = await fetch(`/api/dashboard/bookmarks?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Bookmark request failed with status ${response.status}`);
      const result: { bookmarks: BookmarkWithDevice[]; total: number } = await response.json();
      setBookmarks(result.bookmarks);
      setTotalRecords(result.total);
    } catch (error) {
      console.error("Failed to load bookmarks:", error);
      setBookmarks([]);
      setTotalRecords(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasLinkedDevice) {
      setLoading(false);
      return;
    }

    const load = async () => {
      await fetchBookmarks(currentPage, pageSize, debouncedSearchQuery, activeTab);
    };

    void load();
  }, [hasLinkedDevice, fetchBookmarks, currentPage, pageSize, debouncedSearchQuery, activeTab]);

  // Realtime subscription for live updates from DB
  useEffect(() => {
    if (!hasLinkedDevice) return;
    const channel = supabase
      .channel("bookmarks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookmarks", filter: `user_id=eq.${userId}` },
        (payload) => {
          const bookmarkId = "id" in payload.new && typeof payload.new.id === "string"
            ? payload.new.id
            : null;
          if (bookmarkId && regeneratingIdsRef.current.has(bookmarkId)) return;
          void fetchBookmarks(currentPage, pageSize, debouncedSearchQuery, activeTab);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, userId, hasLinkedDevice, fetchBookmarks, currentPage, pageSize, debouncedSearchQuery, activeTab]);

  const handleDelete = async (id: string) => {
    await supabase
      .from("bookmarks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    setTotalRecords((count) => Math.max(0, count - 1));
  };

  const handleRegenerate = async (bookmark: BookmarkWithDevice) => {
    let awaitingFolderChoice = false;
    regeneratingIdsRef.current.add(bookmark.id);
    setRegeneratingIds((prev) => new Set(prev).add(bookmark.id));
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
      const result: { proposed_folder?: string | null } = await response.json();

      const { data, error } = await supabase
        .from("bookmarks")
        .select("description, description_pending")
        .eq("id", bookmark.id)
        .single();
      if (error || !data) throw new Error("Summary generated, but the updated bookmark could not be loaded");

      let folderPath = bookmark.folder_path;
      if (result.proposed_folder && result.proposed_folder !== bookmark.folder_path) {
        awaitingFolderChoice = true;
        setFolderChangePrompt({
          bookmarkId: bookmark.id,
          currentFolder: bookmark.folder_path,
          proposedFolder: result.proposed_folder,
        });
      }

      setBookmarks((prev) => prev.map((item) => item.id === bookmark.id
        ? { ...item, description: data.description, description_pending: data.description_pending, folder_path: folderPath }
        : item,
      ));
      setDetailBookmark((current) => current?.id === bookmark.id
        ? { ...current, description: data.description, description_pending: data.description_pending, folder_path: folderPath }
        : current,
      );
    } catch (error) {
      console.error("Failed to regenerate bookmark summary", error);
      setBookmarks((prev) => prev.map((item) =>
        item.id === bookmark.id ? { ...item, description_pending: false } : item,
      ));
    } finally {
      if (!awaitingFolderChoice) regeneratingIdsRef.current.delete(bookmark.id);
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(bookmark.id);
        return next;
      });
    }
  };

  const handleConfirmFolderChange = async () => {
    if (!folderChangePrompt) return;
    const { error } = await supabase
      .from("bookmarks")
      .update({ folder_path: folderChangePrompt.proposedFolder, updated_at: new Date().toISOString() })
      .eq("id", folderChangePrompt.bookmarkId);
    if (error) throw error;

    setBookmarks((prev) => prev.map((item) => item.id === folderChangePrompt.bookmarkId
      ? { ...item, folder_path: folderChangePrompt.proposedFolder }
      : item,
    ));
    setDetailBookmark((current) => current?.id === folderChangePrompt.bookmarkId
      ? { ...current, folder_path: folderChangePrompt.proposedFolder }
      : current,
    );
    regeneratingIdsRef.current.delete(folderChangePrompt.bookmarkId);
    setFolderChangePrompt(null);
  };

  const handleCancelFolderChange = () => {
    if (folderChangePrompt) regeneratingIdsRef.current.delete(folderChangePrompt.bookmarkId);
    setFolderChangePrompt(null);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await supabase
      .from("bookmarks")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    setBookmarks((prev) => prev.filter((b) => !selectedIds.has(b.id)));
    setTotalRecords((count) => Math.max(0, count - selectedIds.size));
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

  // The current page is already filtered and paginated by the database query.
  const displayedBookmarks = bookmarks;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

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
    { id: "popular", label: "Most visited", icon: <TrendingUpIcon className="w-3.5 h-3.5" /> },
    { id: "bot", label: "Bot-added", icon: <BotIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col space-y-4">

      {/* ── No device linked → show linking code ─────────────────────── */}
      {!hasLinkedDevice && (
        <LinkingCodeCard
          userId={userId}
          onLinked={() => {
            setHasLinkedDevice(true);
            void fetchBookmarks(1, pageSize, searchQuery, activeTab);
          }}
        />
      )}

      {/* ── Device linked → Search & List Controls ─────────────────────── */}
      {hasLinkedDevice && (
        <div
          className="bk-card p-3 sm:p-4 space-y-2 relative"
          style={{ border: "1px solid var(--bk-border)" }}
        >
          {/* Sticky Header Controls Bar */}
          <div
            className="sticky top-[96px] z-20 py-2 px-3 sm:px-4 -mx-3 sm:-mx-4 -mt-3 sm:-mt-4 mb-1 backdrop-blur-md rounded-t-[14px] transition-bk md:top-[64px]"
            style={{
              background: "rgba(23, 30, 42, 0.96)",
              borderBottom: "1px solid var(--bk-border)",
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search Input & Counter */}
              <div className="flex w-full items-center gap-3 sm:flex-1 sm:max-w-xl">
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
                    className="w-full pl-10 pr-8 py-2 text-xs rounded-[10px] outline-none transition-bk"
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

              </div>

              {/* Filter Tabs */}
              <div
                className="inline-flex shrink-0 self-start gap-1 p-1 rounded-[10px] sm:self-auto"
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 pt-1">
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
              ) : activeTab === "popular" ? (
                <div className="col-span-full py-12 text-center">
                  <TrendingUpIcon className="mx-auto mb-3 h-6 w-6" style={{ color: "var(--bk-text-muted)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--bk-text-primary)" }}>
                    No bookmark visits tracked yet
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--bk-text-muted)" }}>
                    Reload the Bookar extension, allow history access, and visit saved bookmarks.
                  </p>
                </div>
              ) : (
                <NoBookmarksState onAddBookmark={() => setAddDialogOpen(true)} />
              )
            ) : (
              displayedBookmarks.map((bm, i) => (
                <div
                  key={bm.id}
                  className="h-full animate-fade-in-up"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <BookmarkRow
                    bookmark={bm}
                    checked={selectedIds.has(bm.id)}
                    isSelectMode={selectedIds.size > 0}
                    onCheckedChange={toggleSelect}
                    onDelete={handleDelete}
                    onRegenerate={handleRegenerate}
                    isRegenerating={regeneratingIds.has(bm.id)}
                    onSelect={(b) => setDetailBookmark(b)}
                    index={i}
                  />
                </div>
              ))
            )}
          </div>

          {!loading && displayedBookmarks.length > 0 && (
            <div
              className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t pt-3"
              style={{ borderColor: "var(--bk-border)" }}
            >
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--bk-text-muted)" }}>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 rounded-[7px] border px-2 text-xs outline-none"
                  style={{
                    background: "var(--bk-bg)",
                    borderColor: "var(--bk-border)",
                    color: "var(--bk-text-primary)",
                  }}
                  aria-label="Bookmarks per page"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                </select>
              </label>

              <span className="text-xs font-medium" style={{ color: "var(--bk-text-muted)" }}>
                {Math.min((currentPage - 1) * pageSize + 1, totalRecords)}-{Math.min(currentPage * pageSize, totalRecords)} of {totalRecords}
              </span>

              <div className="flex items-center gap-1.5" aria-label="Bookmark pages">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] border transition-bk disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    color: "var(--bk-text-muted)",
                    borderColor: "var(--bk-border)",
                    background: "var(--bk-bg)",
                  }}
                  aria-label="Previous page"
                >
                  <ChevronLeftIcon className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] border transition-bk disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    color: "var(--bk-text-muted)",
                    borderColor: "var(--bk-border)",
                    background: "var(--bk-bg)",
                  }}
                  aria-label="Next page"
                >
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar (slides up when items selected) */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-3 left-3 right-3 z-50 flex max-h-[min(70vh,260px)] flex-wrap items-center gap-2 overflow-y-auto rounded-[16px] px-3 py-3 shadow-2xl animate-slide-up sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:px-5"
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

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
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
        onAdded={() => fetchBookmarks(currentPage, pageSize, debouncedSearchQuery, activeTab)}
      />

      {/* Bookmark Detail Modal */}
      <BookmarkDetailDialog
        bookmark={detailBookmark}
        open={!!detailBookmark}
        onOpenChange={(open) => !open && setDetailBookmark(null)}
        onDelete={handleDelete}
        onRegenerate={handleRegenerate}
        isRegenerating={detailBookmark ? regeneratingIds.has(detailBookmark.id) : false}
      />

      <FolderChangeDialog
        open={!!folderChangePrompt}
        currentFolder={folderChangePrompt?.currentFolder ?? null}
        proposedFolder={folderChangePrompt?.proposedFolder ?? ""}
        onCancel={handleCancelFolderChange}
        onConfirm={handleConfirmFolderChange}
      />
    </div>
  );
}
