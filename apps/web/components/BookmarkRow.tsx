// components/BookmarkRow.tsx
// Single bookmark row for the dashboard list.
// Hover reveals quick Open link button & kebab menu + checkbox.
// Click row toggles selection when in select mode, or opens detail modal otherwise.

"use client";

import { useState } from "react";
import {
  MoreHorizontalIcon,
  ExternalLinkIcon,
  Trash2Icon,
  FolderIcon,
  BotIcon,
  ClockIcon,
  InfoIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FaviconImage } from "@/components/FaviconImage";
import type { Bookmark } from "@/lib/database.types";

export type BookmarkWithDevice = Bookmark & { device_name?: string; browser?: string };

interface BookmarkRowProps {
  bookmark: BookmarkWithDevice;
  checked: boolean;
  isSelectMode?: boolean;
  onCheckedChange: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onSelect?: (bookmark: BookmarkWithDevice) => void;
  index?: number;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BookmarkRow({
  bookmark,
  checked,
  isSelectMode = false,
  onCheckedChange,
  onDelete,
  onSelect,
  index = 0,
}: BookmarkRowProps) {
  const [hovered, setHovered] = useState(false);


  const handleRowClick = () => {
    if (isSelectMode) {
      onCheckedChange(bookmark.id, !checked);
    } else {
      onSelect?.(bookmark);
    }
  };

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-[10px] group transition-bk cursor-pointer select-none"
      style={{
        border: "1px solid transparent",
        borderColor: checked ? "rgba(255,255,255,0.25)" : "transparent",
        backgroundColor: checked
          ? "rgba(255,255,255,0.06)"
          : hovered
          ? "rgba(255,255,255,0.03)"
          : "transparent",
        animationDelay: `${index * 20}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleRowClick}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          e.stopPropagation();
          onCheckedChange(bookmark.id, e.target.checked);
        }}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 flex-shrink-0 rounded cursor-pointer"
        style={{
          width: "15px",
          height: "15px",
          opacity: hovered || checked || isSelectMode ? 1 : 0.3,
          accentColor: "var(--bk-accent)",
          transition: "opacity var(--bk-ease)",
        }}
      />

      {/* Favicon */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center overflow-hidden"
        style={{ background: "var(--bk-surface)", border: "1px solid var(--bk-border)" }}
      >
        <FaviconImage url={bookmark.url} title={bookmark.title} size={64} imgSize={22} rounded="6px" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span
            className="text-sm font-medium leading-snug transition-bk line-clamp-1"
            style={{ color: "var(--bk-text-primary)" }}
          >
            {bookmark.title ?? bookmark.url}
          </span>
          {((bookmark.source as string) === "bot" || (bookmark.source as string) === "mcp" || (bookmark.source as string) === "api" || (bookmark.source && (bookmark.source as string) !== "browser" && (bookmark.source as string) !== "dashboard")) && (
            <span
              className="bk-pill flex-shrink-0 text-[10px] font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded-[5px]"
              style={{
                background: "rgba(146, 220, 229, 0.12)",
                color: "#92dce5",
                border: "1px solid rgba(146, 220, 229, 0.3)",
                marginTop: "1px",
              }}
            >
              <BotIcon style={{ width: "10px", height: "10px" }} />
              {(bookmark.source as string) === "mcp" ? "MCP AI" : "Bot"}
            </span>
          )}
        </div>

        {/* Description */}
        {bookmark.description_pending ? (
          <p className="text-xs mt-0.5" style={{ color: "var(--bk-text-muted)", fontStyle: "italic" }}>
            Generating description…
          </p>
        ) : bookmark.description ? (
          <p
            className="text-xs mt-0.5 line-clamp-1"
            style={{ color: "var(--bk-text-muted)" }}
          >
            {bookmark.description}
          </p>
        ) : null}

        {/* Metadata line (Folder, Device, Added date timestamp) */}
        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]" style={{ color: "var(--bk-text-muted)" }}>
          {bookmark.folder_path && (
            <span className="flex items-center gap-1">
              <FolderIcon style={{ width: "10px", height: "10px" }} />
              {bookmark.folder_path}
            </span>
          )}
          {bookmark.device_name && (
            <span>· {bookmark.device_name}</span>
          )}
          <span
            className="flex items-center gap-1"
            title={`Added on ${new Date(bookmark.created_at).toLocaleString("en-US")}`}
            suppressHydrationWarning
          >
            <ClockIcon style={{ width: "10px", height: "10px" }} />
            Added {relativeTime(bookmark.created_at)}
          </span>

          {/* Tags */}
          {bookmark.tags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="bk-pill"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "var(--bk-text-muted)",
                border: "1px solid var(--bk-border)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Hover action buttons (Open Link & Kebab Menu) */}
      <div
        className="flex items-center gap-1.5 flex-shrink-0"
        style={{
          opacity: hovered || checked ? 1 : 0,
          transition: "opacity var(--bk-ease)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hover Open Link button below/beside 3 dots */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(bookmark.url, "_blank", "noopener,noreferrer");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs font-medium transition-bk"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "var(--bk-text-primary)",
            border: "1px solid var(--bk-border)",
          }}
          title="Open link in new tab"
        >
          <ExternalLinkIcon className="w-3 h-3" />
          <span className="text-[11px]">Open link</span>
        </button>

        {/* Kebab dropdown menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="p-1.5 rounded-[6px] transition-bk"
            style={{ color: "var(--bk-text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
          >
            <MoreHorizontalIcon className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem onClick={() => onSelect?.(bookmark)}>
              <InfoIcon className="w-3.5 h-3.5 mr-2" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}>
              <ExternalLinkIcon className="w-3.5 h-3.5 mr-2" />
              Open link
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-400 focus:text-red-400"
              onClick={() => onDelete(bookmark.id)}
            >
              <Trash2Icon className="w-3.5 h-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
