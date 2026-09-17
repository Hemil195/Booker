// components/BookmarkDetailDialog.tsx
// Modal displaying complete details for a bookmark when clicked.

"use client";

import { useState } from "react";
import {
  ExternalLinkIcon,
  CopyIcon,
  CheckIcon,
  Trash2Icon,
  FolderIcon,
  BotIcon,
  ClockIcon,
  LaptopIcon,
  TagIcon,
  SparklesIcon,
  GlobeIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FaviconImage } from "@/components/FaviconImage";
import type { Bookmark } from "@/lib/database.types";

type BookmarkWithDevice = Bookmark & { device_name?: string; browser?: string };

interface BookmarkDetailDialogProps {
  bookmark: BookmarkWithDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: string) => void;
  onRegenerated?: (bookmark: Partial<BookmarkWithDevice> & { id: string }) => void;
}

export function BookmarkDetailDialog({
  bookmark,
  open,
  onOpenChange,
  onDelete,
  onRegenerated,
}: BookmarkDetailDialogProps) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const handleRegenerate = async () => {
    if (!bookmark || regenerating) return;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const response = await fetch("/api/recreate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmark_id: bookmark.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.bookmark) throw new Error(data.error || "Unable to regenerate description");
      onRegenerated?.(data.bookmark);
    } catch (error) {
      setRegenerateError(error instanceof Error ? error.message : "Unable to regenerate description");
    } finally {
      setRegenerating(false);
    }
  };

  if (!bookmark) return null;

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(bookmark.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  const formattedDate = new Date(bookmark.created_at).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: "var(--bk-surface)",
          border: "1px solid var(--bk-border)",
          borderRadius: "16px",
          maxWidth: "540px",
          width: "calc(100vw - 32px)",
          maxHeight: "90vh",
          overflowY: "auto",
          overflowX: "hidden",
          minWidth: 0,
          boxSizing: "border-box",
          padding: "clamp(16px, 4vw, 24px)",
        }}
      >
        <DialogHeader className="mb-2">
          <div className="flex items-center gap-3">
            {/* Favicon */}
            <div
              className="w-12 h-12 rounded-[12px] flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{
                background: "var(--bk-bg)",
                border: "1px solid var(--bk-border)",
              }}
            >
              <FaviconImage url={bookmark.url} title={bookmark.title} size={128} imgSize={28} rounded="8px" />
            </div>

            <div className="flex-1 min-w-0">
              <DialogTitle
                className="text-base font-semibold break-words line-clamp-3 leading-snug"
                style={{ color: "var(--bk-text-primary)", wordBreak: "break-word" }}
              >
                {bookmark.title ?? bookmark.url}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {bookmark.source === "bot" ? (
                  <span
                    className="bk-pill"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      color: "var(--bk-text-primary)",
                      border: "1px solid var(--bk-border)",
                    }}
                  >
                    <BotIcon className="w-3 h-3" />
                    Added by Bot / MCP
                  </span>
                ) : (
                  <span
                    className="bk-pill"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      color: "var(--bk-text-muted)",
                      border: "1px solid var(--bk-border)",
                    }}
                  >
                    <GlobeIcon className="w-3 h-3" />
                    Browser Sync
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* URL section */}
        <div
          className="flex items-center justify-between gap-2 p-3 rounded-[10px] my-3"
          style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
        >
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono break-all hover:underline flex-1 min-w-0"
            style={{
              color: "var(--bk-text-primary)",
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {bookmark.url}
          </a>
          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-[6px] transition-bk flex-shrink-0"
            style={{
              background: copied ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
              color: "var(--bk-text-primary)",
              border: "1px solid var(--bk-border)",
            }}
          >
            {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {/* Description Section */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--bk-text-muted)" }}>
            <SparklesIcon className="w-3.5 h-3.5" style={{ color: "var(--bk-text-primary)" }} />
            AI Summary & Description
          </div>
          <div
            className="p-3.5 rounded-[10px] text-xs leading-relaxed break-words"
            style={{
              background: "var(--bk-bg)",
              border: "1px solid var(--bk-border)",
              color: bookmark.description ? "var(--bk-text-primary)" : "var(--bk-text-muted)",
              fontStyle: bookmark.description_pending ? "italic" : "normal",
            }}
          >
            {bookmark.description_pending
              ? "Generating AI description with NVIDIA Llama 3.1…"
              : bookmark.description || "No description available for this bookmark."}
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating || bookmark.description_pending}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-medium transition-bk"
            style={{ background: "rgba(255,255,255,0.06)", color: "var(--bk-text-primary)", border: "1px solid var(--bk-border)" }}
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate this summary"}
          </button>
          {regenerateError && <p className="mt-1 text-xs break-words" style={{ color: "#fc8181" }}>{regenerateError}</p>}
        </div>

        {/* Tags */}
        {bookmark.tags && bookmark.tags.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--bk-text-muted)" }}>
              <TagIcon className="w-3.5 h-3.5" />
              Tags
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bookmark.tags.map((tag) => (
                <span
                  key={tag}
                  className="bk-pill"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "var(--bk-text-primary)",
                    border: "1px solid var(--bk-border)",
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Details Grid */}
        <div
          className="grid grid-cols-2 gap-3 p-3.5 rounded-[10px] mb-5 text-xs"
          style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
        >
          <div>
            <span style={{ color: "var(--bk-text-muted)" }} className="block mb-0.5">
              <FolderIcon className="w-3 h-3 inline mr-1" /> Folder
            </span>
            <span style={{ color: "var(--bk-text-primary)" }} className="font-medium">
              {bookmark.folder_path || "Root / Uncategorized"}
            </span>
          </div>

          <div>
            <span style={{ color: "var(--bk-text-muted)" }} className="block mb-0.5">
              <LaptopIcon className="w-3 h-3 inline mr-1" /> Device
            </span>
            <span style={{ color: "var(--bk-text-primary)" }} className="font-medium">
              {bookmark.device_name && bookmark.device_name !== "Pending Device"
                ? `${bookmark.device_name} (${bookmark.browser || "Browser"})`
                : `Linked Browser (${bookmark.browser && bookmark.browser !== "Unknown" ? bookmark.browser : "Synced"})`}
            </span>
          </div>

          <div>
            <span style={{ color: "var(--bk-text-muted)" }} className="block mb-0.5">
              <ClockIcon className="w-3 h-3 inline mr-1" /> Saved On
            </span>
            <span style={{ color: "var(--bk-text-primary)" }} className="font-medium">
              {formattedDate}
            </span>
          </div>

          <div>
            <span style={{ color: "var(--bk-text-muted)" }} className="block mb-0.5">
              ID
            </span>
            <span
              style={{ color: "var(--bk-text-muted)" }}
              className="font-mono text-[11px] truncate block"
            >
              {bookmark.id}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => {
              onDelete(bookmark.id);
              onOpenChange(false);
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[8px] text-xs font-medium transition-bk"
            style={{
              background: "rgba(239,68,68,0.12)",
              color: "#fc8181",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <Trash2Icon className="w-3.5 h-3.5" />
            Delete Bookmark
          </button>

          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[8px] text-xs font-semibold transition-bk"
            style={{
              background: "var(--bk-accent)",
              color: "#09090b",
              textDecoration: "none",
            }}
          >
            <ExternalLinkIcon className="w-3.5 h-3.5" />
            Open Link
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
