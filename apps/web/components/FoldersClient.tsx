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
  ExternalLinkIcon,
  MoveRightIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { Toast } from "@base-ui/react/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookmarkRow, BookmarkWithDevice } from "@/components/BookmarkRow";
import { BookmarkDetailDialog } from "@/components/BookmarkDetailDialog";
import { FolderChangeDialog } from "@/components/FolderChangeDialog";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { Bookmark } from "@/lib/database.types";

type BookmarkRowItem = Bookmark;

interface FoldersClientProps {
  userId: string;
  initialBookmarks: BookmarkRowItem[];
}

export function FoldersClient(props: FoldersClientProps) {
  return (
    <Toast.Provider timeout={4000}>
      <FoldersClientContent {...props} />
      <FolderToastViewport />
    </Toast.Provider>
  );
}

function FolderToastViewport() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 top-4 z-[110] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 outline-none">
        {toasts.map((toast) => {
          const isError = toast.type === "error";
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              className="flex items-center gap-3 rounded-[8px] border px-4 py-3 text-sm shadow-xl transition-all duration-200 data-[starting-style]:translate-x-3 data-[starting-style]:opacity-0 data-[ending-style]:translate-x-3 data-[ending-style]:opacity-0"
              style={{
                background: "var(--bk-surface)",
                borderColor: isError ? "rgba(248,113,113,0.45)" : "var(--bk-border)",
                color: "var(--bk-text-primary)",
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: isError ? "rgba(248,113,113,0.14)" : "var(--bk-selection)",
                  color: isError ? "#f87171" : "var(--bk-accent)",
                }}
              >
                {isError ? <XIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
              </span>
              <Toast.Content className="min-w-0 flex-1">
                <Toast.Title className="break-words text-xs font-medium leading-relaxed">
                  {toast.title}
                </Toast.Title>
              </Toast.Content>
              <Toast.Close aria-label="Dismiss notification" className="shrink-0 text-[var(--bk-text-muted)] hover:text-[var(--bk-text-primary)]">
                <XIcon className="h-4 w-4" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function FoldersClientContent({ initialBookmarks }: FoldersClientProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkRowItem[]>(initialBookmarks);
  const [createOpen, setCreateOpen] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareCopied, setShareCopied] = useState(false);
  const [detailBookmark, setDetailBookmark] = useState<BookmarkWithDevice | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSelectionIds, setMoveSelectionIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    bookmarkId?: string;
    folder?: string;
  } | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const [folderChangePrompt, setFolderChangePrompt] = useState<{
    bookmarkId: string;
    currentFolder: string | null;
    proposedFolder: string;
  } | null>(null);
  const supabase = createSupabaseBrowserClient();
  const toastManager = Toast.useToastManager();
  const showActionToast = (message: string, type: "success" | "error" = "success") => {
    toastManager.add({ title: message, type, timeout: 4000 });
  };

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
      showActionToast("Could not move the selected bookmarks.", "error");
      return false;
    }

    setBookmarks((prev) => prev.map((bookmark) =>
      ids.includes(bookmark.id) ? { ...bookmark, folder_path: folderPath } : bookmark,
    ));
    showActionToast(`${ids.length} bookmark${ids.length === 1 ? "" : "s"} moved to ${targetFolder}.`);
    return true;
  };

  const openMoveDialog = (ids: string[]) => {
    if (ids.length === 0) return;
    setMoveSelectionIds(ids);
    setMoveTarget("");
    setNewFolderName("");
    setMoveError(null);
    setMoveDialogOpen(true);
  };

  const handleMoveSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetFolder = moveTarget === "__new_folder__" ? newFolderName.trim() : moveTarget;
    if (!targetFolder) {
      setMoveError("Choose a folder or enter a new folder name.");
      return;
    }

    setMoveError(null);
    const moved = await persistMove(moveSelectionIds, targetFolder);
    if (!moved) {
      setMoveError("Could not move the selected bookmarks. Please try again.");
      return;
    }
    if (moveTarget === "__new_folder__") {
      setCustomFolders((prev) => Array.from(new Set([...prev, targetFolder])));
    }
    setSelectedIds(new Set());
    setMoveDialogOpen(false);
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
      if (event.key === "Escape") setContextMenu(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      const result: { proposed_folder?: string | null } = await response.json();

      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("id", bookmark.id)
        .single();
      if (error || !data) throw new Error("Summary generated, but the updated bookmark could not be loaded");

      if (result.proposed_folder && result.proposed_folder !== bookmark.folder_path) {
        setFolderChangePrompt({
          bookmarkId: bookmark.id,
          currentFolder: bookmark.folder_path,
          proposedFolder: result.proposed_folder,
        });
      }

      setBookmarks((prev) => prev.map((item) => item.id === bookmark.id ? data : item));
      setDetailBookmark((current) => current?.id === bookmark.id ? data : current);
      showActionToast("Bookmark summary regenerated.");
    } catch (error) {
      setBookmarks((prev) => prev.map((item) =>
        item.id === bookmark.id ? { ...item, description_pending: false } : item,
      ));
      showActionToast(error instanceof Error ? error.message : "Failed to regenerate bookmark summary.", "error");
    } finally {
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
    showActionToast("Bookmark moved to the suggested folder.");
    setFolderChangePrompt(null);
  };

  const handleCancelFolderChange = () => setFolderChangePrompt(null);

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await supabase
      .from("bookmarks")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    setBookmarks((prev) => prev.filter((b) => !selectedIds.has(b.id)));
    setSelectedIds(new Set());
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
      showActionToast("Could not move the dragged bookmarks.", "error");
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

            <button
              onClick={() => openMoveDialog(Array.from(selectedIds))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk"
              style={{ background: "rgba(255,255,255,0.08)", color: "var(--bk-text-primary)", border: "1px solid var(--bk-border)" }}
            >
              <MoveRightIcon className="w-3.5 h-3.5" /> Move
            </button>

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

      <FolderChangeDialog
        open={!!folderChangePrompt}
        currentFolder={folderChangePrompt?.currentFolder ?? null}
        proposedFolder={folderChangePrompt?.proposedFolder ?? ""}
        onCancel={handleCancelFolderChange}
        onConfirm={handleConfirmFolderChange}
      />

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent
          style={{
            maxWidth: "420px",
            padding: "20px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--bk-text-primary)" }}>
              <MoveRightIcon className="h-4 w-4" style={{ color: "var(--bk-accent)" }} />
              Move {moveSelectionIds.length === 1 ? "bookmark" : `${moveSelectionIds.length} bookmarks`}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleMoveSubmit} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--bk-text-muted)" }}>
                Destination folder
              </label>
              <select
                value={moveTarget}
                onChange={(event) => { setMoveTarget(event.target.value); setMoveError(null); }}
                className="w-full rounded-[8px] px-3 py-2.5 text-xs outline-none"
                style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)", color: "var(--bk-text-primary)" }}
              >
                <option value="">Choose a folder</option>
                <option value="Uncategorized">Uncategorized</option>
                {existingFolders.filter((folder) => folder !== "Uncategorized").map((folder) => (
                  <option key={folder} value={folder}>{folder}</option>
                ))}
                <option value="__new_folder__">Create new folder…</option>
              </select>
            </div>

            {moveTarget === "__new_folder__" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--bk-text-muted)" }}>
                  New folder name
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newFolderName}
                  onChange={(event) => { setNewFolderName(event.target.value); setMoveError(null); }}
                  placeholder="e.g. Work/Design"
                  className="w-full rounded-[8px] px-3 py-2.5 text-xs outline-none"
                  style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)", color: "var(--bk-text-primary)" }}
                />
              </div>
            )}

            {moveError && <p className="text-xs" role="alert" style={{ color: "#fc8181" }}>{moveError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMoveDialogOpen(false)}
                className="rounded-[8px] border px-3 py-2 text-xs"
                style={{ borderColor: "var(--bk-border)", color: "var(--bk-text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!moveTarget || (moveTarget === "__new_folder__" && !newFolderName.trim())}
                className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                style={{ background: "var(--bk-accent)", color: "#09090b" }}
              >
                {moveTarget === "__new_folder__" ? <FolderPlusIcon className="h-3.5 w-3.5" /> : <MoveRightIcon className="h-3.5 w-3.5" />}
                Move
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { openMoveDialog(idsForBookmarkAction(contextMenu.bookmarkId!)); setContextMenu(null); }}>
                <MoveRightIcon className="h-3.5 w-3.5" /> Move to folder…
              </button>
              <div className="my-1 border-t" style={{ borderColor: "var(--bk-border)" }} />
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs" style={{ color: "#fc8181" }} onClick={() => { void handleDelete(contextMenu.bookmarkId!); setContextMenu(null); }}>
                <Trash2Icon className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          ) : contextMenu.folder ? (
            <>
              <button role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/10" style={{ color: "var(--bk-text-primary)" }} onClick={() => { setActiveFolder(contextMenu.folder!); setContextMenu(null); }}>
                <FolderIcon className="h-3.5 w-3.5" /> Open folder
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
