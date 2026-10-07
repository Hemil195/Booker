// components/FoldersClient.tsx
// Folders view component with styled folder cards, in-place opening, breadcrumbs, selection system, and share feature.

"use client";

import { useState, useMemo, useEffect } from "react";
import {
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  ChevronRightIcon,
  HomeIcon,
  ArrowLeftIcon,
  CheckSquareIcon,
  SquareIcon,
  Share2Icon,
  Trash2Icon,
  ChevronUpIcon,
  CopyIcon,
  ScissorsIcon,
  ClipboardPasteIcon,
  ExternalLinkIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookmarkRow, BookmarkWithDevice } from "@/components/BookmarkRow";
import { BookmarkDetailDialog } from "@/components/BookmarkDetailDialog";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Bookmark } from "@/lib/database.types";

type BookmarkRowItem = Bookmark;

interface FoldersClientProps {
  userId: string;
  initialBookmarks: BookmarkRowItem[];
}

export function FoldersClient({ initialBookmarks }: FoldersClientProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkRowItem[]>(initialBookmarks);
  const [createOpen, setCreateOpen] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareCopied, setShareCopied] = useState(false);
  const [detailBookmark, setDetailBookmark] = useState<BookmarkWithDevice | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [clipboard, setClipboard] = useState<{ ids: string[]; mode: "copy" | "cut" } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bookmarkId?: string;
    folder?: string;
  } | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const supabase = createSupabaseBrowserClient();

  // Group bookmarks by folder
  const folderMap = useMemo(() => {
    const map = new Map<string, BookmarkRowItem[]>();

    bookmarks.forEach((bm) => {
      const folder = bm.folder_path || "Uncategorized";
      if (!map.has(folder)) map.set(folder, []);
      map.get(folder)!.push(bm);
    });

    // Include empty custom created folders
    customFolders.forEach((cf) => {
      if (!map.has(cf)) map.set(cf, []);
    });

    return map;
  }, [bookmarks, customFolders]);

  const existingFolders = useMemo(() => {
    return Array.from(folderMap.keys()).sort();
  }, [folderMap]);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderNameInput.trim()) return;
    setCustomFolders((prev) => Array.from(new Set([...prev, folderNameInput.trim()])));
    setFolderNameInput("");
    setCreateOpen(false);
  };

  const activeBookmarks = useMemo(() => {
    if (!activeFolder) return [];
    return folderMap.get(activeFolder) || [];
  }, [activeFolder, folderMap]);

  const allActiveSelected =
    activeBookmarks.length > 0 &&
    activeBookmarks.every((b) => selectedIds.has(b.id));

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allActiveSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      activeBookmarks.forEach((b) => next.add(b.id));
      setSelectedIds(next);
    }
  };

  const persistMove = async (ids: string[], targetFolder: string) => {
    if (ids.length === 0) return;
    const folderPath = targetFolder === "Uncategorized" ? null : targetFolder;
    const { error } = await supabase
      .from("bookmarks")
      .update({ folder_path: folderPath, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (error) {
      setActionMessage("Could not move the selected bookmarks.");
      return false;
    }

    setBookmarks((prev) => prev.map((bookmark) =>
      ids.includes(bookmark.id) ? { ...bookmark, folder_path: folderPath } : bookmark,
    ));
    setActionMessage(`${ids.length} bookmark${ids.length === 1 ? "" : "s"} moved to ${targetFolder}.`);
    return true;
  };

  const beginClipboardAction = (ids: string[], mode: "copy" | "cut") => {
    if (ids.length === 0) return;
    setClipboard({ ids, mode });
    setSelectedIds(new Set(ids));
    setActionMessage(`${ids.length} bookmark${ids.length === 1 ? "" : "s"} ${mode === "copy" ? "copied" : "cut"}.`);
  };

  const pasteBookmarks = async (targetFolder: string) => {
    if (!clipboard?.ids.length) return;
    const targetPath = targetFolder === "Uncategorized" ? null : targetFolder;

    if (clipboard.mode === "cut") {
      const moved = await persistMove(clipboard.ids, targetFolder);
      if (moved) setClipboard(null);
      return;
    }

    const sourceBookmarks = bookmarks.filter((bookmark) => clipboard.ids.includes(bookmark.id));
    const copies = sourceBookmarks.map((bookmark) => ({
      user_id: bookmark.user_id,
      device_id: bookmark.device_id,
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description,
      tags: bookmark.tags,
      folder_path: targetPath,
      browser_bookmark_id: null,
      source: bookmark.source,
      description_pending: false,
    }));

    const { data, error } = await supabase.from("bookmarks").insert(copies).select("*");
    if (error || !data) {
      setActionMessage("Could not paste the copied bookmarks.");
      return;
    }

    setBookmarks((prev) => [...data, ...prev]);
    setActionMessage(`${data.length} bookmark${data.length === 1 ? "" : "s"} pasted to ${targetFolder}.`);
    setClipboard(null);
    setSelectedIds(new Set());
  };

  const idsForBookmarkAction = (bookmarkId: string) =>
    selectedIds.has(bookmarkId) ? Array.from(selectedIds) : [bookmarkId];

  const openContextMenu = (
    event: React.MouseEvent,
    target: { bookmarkId?: string; folder?: string },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (target.bookmarkId && !selectedIds.has(target.bookmarkId)) {
      setSelectedIds(new Set([target.bookmarkId]));
    }
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 260)),
      ...target,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;

      const shortcut = event.ctrlKey || event.metaKey;
      if (!shortcut) {
        if (event.key === "Escape") setContextMenu(null);
        return;
      }

      if (event.key.toLowerCase() === "c" && selectedIds.size > 0) {
        event.preventDefault();
        beginClipboardAction(Array.from(selectedIds), "copy");
      } else if (event.key.toLowerCase() === "x" && selectedIds.size > 0) {
        event.preventDefault();
        beginClipboardAction(Array.from(selectedIds), "cut");
      } else if (event.key.toLowerCase() === "v" && clipboard) {
        event.preventDefault();
        void pasteBookmarks(activeFolder || "Uncategorized");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, clipboard, activeFolder, bookmarks, existingFolders]);

  const handleDelete = async (id: string) => {
    await supabase
      .from("bookmarks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleRegenerate = async (bookmark: BookmarkWithDevice) => {
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

      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("id", bookmark.id)
        .single();
      if (error || !data) throw new Error("Summary generated, but the updated bookmark could not be loaded");

      setBookmarks((prev) => prev.map((item) => item.id === bookmark.id ? data : item));
      setDetailBookmark((current) => current?.id === bookmark.id ? data : current);
      setActionMessage("Bookmark summary regenerated.");
    } catch (error) {
      setBookmarks((prev) => prev.map((item) =>
        item.id === bookmark.id ? { ...item, description_pending: false } : item,
      ));
      setActionMessage(error instanceof Error ? error.message : "Failed to regenerate bookmark summary.");
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(bookmark.id);
        return next;
      });
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
    await persistMove(ids, targetFolder.trim());
    setSelectedIds(new Set());
    setNewFolderName("");
  };

  const handleDropOnFolder = async (event: React.DragEvent, folder: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDropFolder(null);
    try {
      const ids = JSON.parse(event.dataTransfer.getData("application/bookar-bookmarks")) as string[];
      await persistMove(ids, folder);
      setSelectedIds(new Set());
    } catch {
      setActionMessage("Could not move the dragged bookmarks.");
    }
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

  const folderEntries = Array.from(folderMap.entries());

  return (
    <div className="space-y-6" onClick={() => contextMenu && setContextMenu(null)}>
      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b" style={{ borderColor: "var(--bk-border)" }}>
        <div>
          {/* Breadcrumb Navigation Bar */}
          <nav className="flex items-center gap-2 text-xs mb-1" style={{ color: "var(--bk-text-muted)" }}>
            <button
              onClick={() => { setActiveFolder(null); setSelectedIds(new Set()); }}
              className="flex items-center gap-1 hover:underline transition-bk"
              style={{ color: activeFolder ? "var(--bk-text-muted)" : "var(--bk-text-primary)" }}
            >
              <HomeIcon className="w-3.5 h-3.5" />
              Folders
            </button>

            {activeFolder && (
              <>
                <ChevronRightIcon className="w-3.5 h-3.5 opacity-50" />
                <span className="font-semibold text-xs" style={{ color: "var(--bk-text-primary)" }}>
                  {activeFolder}
                </span>
              </>
            )}
          </nav>

          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--bk-text-primary)" }}>
            {activeFolder ? (
              <>
                <FolderIcon className="w-5 h-5" style={{ color: "var(--bk-text-primary)" }} />
                {activeFolder}
              </>
            ) : (
              "Folders & Categories"
            )}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--bk-text-muted)" }}>
            {activeFolder
              ? `${activeBookmarks.length} bookmark(s) saved in this folder`
              : "Synced from your browser bookmarks and Bookar tools"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeFolder ? (
            <button
              onClick={() => { setActiveFolder(null); setSelectedIds(new Set()); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-medium transition-bk"
              style={{ background: "var(--bk-surface)", border: "1px solid var(--bk-border)", color: "var(--bk-text-primary)" }}
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              Back to All Folders
            </button>
          ) : (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-semibold transition-bk"
              style={{ background: "var(--bk-accent)", color: "#09090b" }}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Create Folder
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div className="flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-xs" role="status" style={{ background: "var(--bk-surface)", border: "1px solid var(--bk-border)", color: "var(--bk-text-muted)" }}>
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} aria-label="Dismiss message" className="text-xs">Dismiss</button>
        </div>
      )}

      {/* VIEW 1: Grid of Folder Cards (when no folder is open) */}
      {!activeFolder && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {folderEntries.map(([folderName, items]) => (
            <div
              key={folderName}
              onClick={() => { setActiveFolder(folderName); setSelectedIds(new Set()); }}
              onContextMenu={(event) => openContextMenu(event, { folder: folderName })}
              onDragOver={(event) => { event.preventDefault(); setDropFolder(folderName); }}
              onDragLeave={() => setDropFolder((current) => current === folderName ? null : current)}
              onDrop={(event) => void handleDropOnFolder(event, folderName)}
              className="group cursor-pointer transition-all duration-200"
            >
              {/* Folder Top Tab */}
              <div
                className="w-24 h-4 rounded-t-[8px] transition-bk"
                style={{
                  background: dropFolder === folderName ? "var(--bk-selection)" : "var(--bk-surface)",
                  borderTop: "1px solid var(--bk-border)",
                  borderLeft: "1px solid var(--bk-border)",
                  borderRight: "1px solid var(--bk-border)",
                  marginLeft: "12px",
                }}
              />

              {/* Folder Main Body */}
              <div
                className="bk-card p-5 -mt-px rounded-b-[14px] rounded-tr-[14px] transition-bk group-hover:border-white/30 group-hover:translate-y-[-2px]"
                style={{
                  background: "var(--bk-surface)",
                  border: "1px solid var(--bk-border)",
                  boxShadow: "var(--bk-shadow-card)",
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center transition-bk group-hover:scale-105"
                    style={{ background: "var(--bk-selection)" }}
                  >
                    <FolderIcon className="w-5 h-5" style={{ color: "var(--bk-text-primary)" }} />
                  </div>
                  <span
                    className="bk-pill"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "var(--bk-text-muted)",
                      border: "1px solid var(--bk-border)",
                    }}
                  >
                    {items.length} bookmark{items.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <h3 className="text-base font-semibold truncate" style={{ color: "var(--bk-text-primary)" }}>
                  {folderName}
                </h3>

                <p className="text-xs mt-1.5 truncate" style={{ color: "var(--bk-text-muted)" }}>
                  {items.length > 0 ? items[0].title || items[0].url : "Empty folder"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 2: In-place Full Bookmark List / Table inside Opened Folder */}
      {activeFolder && (
        <div className="bk-card p-5 animate-fade-in space-y-4" style={{ border: "1px solid var(--bk-border)" }}>
          {activeBookmarks.length === 0 ? (
            <div className="text-center py-12">
              <FolderIcon className="w-8 h-8 mx-auto mb-2 opacity-40" style={{ color: "var(--bk-text-muted)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--bk-text-primary)" }}>
                Folder &quot;{activeFolder}&quot; is empty
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--bk-text-muted)" }}>
                Move bookmarks into this folder from All Bookmarks or create a new bookmark.
              </p>
            </div>
          ) : (
            <div className="space-y-[2px]">
              {activeBookmarks.map((bm, i) => (
                <div
                  key={bm.id}
                  draggable
                  onContextMenu={(event) => openContextMenu(event, { bookmarkId: bm.id })}
                  onDragStart={(event) => {
                    const ids = idsForBookmarkAction(bm.id);
                    event.dataTransfer.setData("application/bookar-bookmarks", JSON.stringify(ids));
                    event.dataTransfer.effectAllowed = "move";
                    if (!selectedIds.has(bm.id)) setSelectedIds(new Set([bm.id]));
                  }}
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
                    isRegenerating={regeneratingIds.has(bm.id)}
                    onSelect={(b) => setDetailBookmark(b)}
                    index={i}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar inside Folder View */}
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
            {allActiveSelected ? (
              <CheckSquareIcon className="w-3.5 h-3.5" style={{ color: "var(--bk-accent)" }} />
            ) : (
              <SquareIcon className="w-3.5 h-3.5" style={{ color: "var(--bk-text-muted)" }} />
            )}
            {allActiveSelected ? "Deselect All" : "Select All"}
          </button>

          <span className="text-xs font-semibold" style={{ color: "var(--bk-text-primary)" }}>
            {selectedIds.size} selected
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => beginClipboardAction(Array.from(selectedIds), "copy")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk"
              style={{ background: "rgba(255,255,255,0.08)", color: "var(--bk-text-primary)", border: "1px solid var(--bk-border)" }}
              title="Copy selected (Ctrl+C)"
            >
              <CopyIcon className="w-3.5 h-3.5" /> Copy
            </button>
            <button
              onClick={() => beginClipboardAction(Array.from(selectedIds), "cut")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk"
              style={{ background: "rgba(255,255,255,0.08)", color: "var(--bk-text-primary)", border: "1px solid var(--bk-border)" }}
              title="Cut selected (Ctrl+X)"
            >
              <ScissorsIcon className="w-3.5 h-3.5" /> Cut
            </button>
            <button
              onClick={() => void pasteBookmarks(activeFolder || "Uncategorized")}
              disabled={!clipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.08)", color: "var(--bk-text-primary)", border: "1px solid var(--bk-border)" }}
              title="Paste here (Ctrl+V)"
            >
              <ClipboardPasteIcon className="w-3.5 h-3.5" /> Paste
            </button>
            {/* Share Selected */}
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

      {/* Bookmark Detail Modal */}
      <BookmarkDetailDialog
        bookmark={detailBookmark}
        open={!!detailBookmark}
        onOpenChange={(open) => !open && setDetailBookmark(null)}
        onDelete={handleDelete}
      />

      {/* Create Folder Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          style={{
            background: "var(--bk-surface)",
            border: "1px solid var(--bk-border)",
            borderRadius: "16px",
            maxWidth: "400px",
            padding: "20px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--bk-text-primary)" }}>
              <FolderPlusIcon className="w-4 h-4" style={{ color: "var(--bk-accent)" }} />
              Create New Folder
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateFolder} className="space-y-3 mt-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--bk-text-muted)" }}>
                Folder Name / Path
              </label>
              <input
                type="text"
                placeholder="e.g. Work/Design Tools"
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-[8px] outline-none"
                style={{
                  background: "var(--bk-bg)",
                  border: "1px solid var(--bk-border)",
                  color: "var(--bk-text-primary)",
                }}
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex-1 py-2 text-xs rounded-[8px]"
                style={{ border: "1px solid var(--bk-border)", color: "var(--bk-text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 text-xs font-semibold rounded-[8px]"
                style={{ background: "var(--bk-accent)", color: "#09090b" }}
              >
                Create
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {contextMenu && (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          className="fixed z-[100] min-w-52 max-h-[min(70vh,420px)] overflow-y-auto rounded-[8px] p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y, background: "var(--bk-surface)", border: "1px solid var(--bk-border)" }}
        >
          {contextMenu.bookmarkId ? (
            <>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { const item = bookmarks.find((bookmark) => bookmark.id === contextMenu.bookmarkId); if (item) setDetailBookmark(item); setContextMenu(null); }}>
                <ExternalLinkIcon className="h-3.5 w-3.5" /> Open details
              </button>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { beginClipboardAction(idsForBookmarkAction(contextMenu.bookmarkId!), "copy"); setContextMenu(null); }}>
                <CopyIcon className="h-3.5 w-3.5" /> Copy <span className="ml-auto text-[10px] opacity-60">Ctrl+C</span>
              </button>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { beginClipboardAction(idsForBookmarkAction(contextMenu.bookmarkId!), "cut"); setContextMenu(null); }}>
                <ScissorsIcon className="h-3.5 w-3.5" /> Cut <span className="ml-auto text-[10px] opacity-60">Ctrl+X</span>
              </button>
              <div className="my-1 border-t" style={{ borderColor: "var(--bk-border)" }} />
              <p className="px-2 py-1 text-[10px] font-semibold uppercase" style={{ color: "var(--bk-text-muted)" }}>Move to</p>
              {existingFolders.filter((folder) => folder !== activeFolder).map((folder) => (
                <button key={folder} role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { void persistMove(idsForBookmarkAction(contextMenu.bookmarkId!), folder); setContextMenu(null); }}>
                  <FolderIcon className="h-3.5 w-3.5" /> <span className="truncate">{folder}</span>
                </button>
              ))}
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { void persistMove(idsForBookmarkAction(contextMenu.bookmarkId!), "Uncategorized"); setContextMenu(null); }}>
                <FolderIcon className="h-3.5 w-3.5" /> Uncategorized
              </button>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs" style={{ color: "#fc8181" }} onClick={() => { void handleDelete(contextMenu.bookmarkId!); setContextMenu(null); }}>
                <Trash2Icon className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          ) : contextMenu.folder ? (
            <>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { setActiveFolder(contextMenu.folder!); setContextMenu(null); }}>
                <FolderIcon className="h-3.5 w-3.5" /> Open folder
              </button>
              {clipboard && (
                <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { void pasteBookmarks(contextMenu.folder!); setContextMenu(null); }}>
                  <ClipboardPasteIcon className="h-3.5 w-3.5" /> Paste into folder
                </button>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
