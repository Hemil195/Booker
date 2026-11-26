// components/AddBookmarkDialog.tsx
// Dialog for manually adding a bookmark URL from the dashboard with browser sync target selection.

"use client";

import { useState, useEffect } from "react";
import { Loader2Icon, PlusCircleIcon, LaptopIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { inferBookmarkFolder, type BookmarkFolderExample } from "@/lib/bookmarkCategory";

interface DeviceOption {
  id: string;
  device_name: string;
  browser: string;
}

interface AddBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  deviceId?: string;
  devices?: DeviceOption[];
  onAdded: () => void;
}

export function AddBookmarkDialog({
  open,
  onOpenChange,
  userId,
  deviceId: initialDeviceId = "",
  devices: initialDevices = [],
  onAdded,
}: AddBookmarkDialogProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [targetDevice, setTargetDevice] = useState<string>("all");
  const [availableDevices, setAvailableDevices] = useState<DeviceOption[]>(initialDevices);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [folderExamples, setFolderExamples] = useState<BookmarkFolderExample[]>([]);
  const [folderPath, setFolderPath] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    if (!open) return;

    if (availableDevices.length === 0) {
      supabase
        .from("devices")
        .select("id, device_name, browser")
        .eq("user_id", userId)
        .neq("browser", "bot")
        .then(({ data }: { data: DeviceOption[] | null }) => {
          if (data && data.length > 0) {
            setAvailableDevices(data);
            if (data.length === 1) setTargetDevice(data[0].id);
          }
        });
    }

    supabase
      .from("bookmarks")
      .select("folder_path, title, url, description, tags")
      .eq("user_id", userId)
      .not("folder_path", "is", null)
      .is("deleted_at", null)
      .then(({ data }) => {
        if (!data) return;
        const examples = data as BookmarkFolderExample[];
        setFolderExamples(examples);
        const folders = Array.from(new Set(examples
          .map((bookmark) => bookmark.folder_path?.trim())
          .filter((folder): folder is string => Boolean(folder))))
          .sort((first, second) => first.localeCompare(second));
        setAvailableFolders(folders);
      });
  }, [open, userId, availableDevices.length, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) { setError("URL is required"); return; }
    if (!url.startsWith("http")) { setError("Please enter a valid URL starting with http/https"); return; }

    const targetDevId = targetDevice === "all"
      ? (availableDevices[0]?.id || initialDeviceId)
      : targetDevice;

    if (!targetDevId) {
      setError("No connected browser device found. Please connect your browser first.");
      return;
    }

    setLoading(true);
    setError(null);
    const resolvedFolder = folderPath === "__bookmarks_bar__"
      ? ""
      : folderPath === "__uncategorized__"
        ? null
        : folderPath === "auto"
          ? inferBookmarkFolder(title.trim() || url.trim(), url.trim(), null, folderExamples)
          : folderPath;

    const bookmarkUrl = url.trim();
    const bookmarkTitle = title.trim() || bookmarkUrl;
    const { data: existing, error: lookupError } = await supabase
      .from("bookmarks")
      .select("id, deleted_at")
      .eq("user_id", userId)
      .eq("url", bookmarkUrl)
      .maybeSingle();

    if (lookupError) {
      setLoading(false);
      setError("Failed to check for an existing bookmark. Please try again.");
      return;
    }

    let savedId: string | null = null;
    let saveError: string | null = null;

    if (existing && !existing.deleted_at) {
      setLoading(false);
      setError("This bookmark is already saved.");
      return;
    }

    if (existing) {
      const restoredAt = new Date().toISOString();
      const { data: restored, error } = await supabase
        .from("bookmarks")
        .update({
          device_id: targetDevId,
          title: bookmarkTitle,
          folder_path: resolvedFolder,
          browser_bookmark_id: null,
          source: "dashboard",
          description_pending: true,
          created_at: restoredAt,
          updated_at: restoredAt,
          deleted_at: null,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      savedId = restored?.id ?? null;
      saveError = error?.message ?? null;
    } else {
      const { data: inserted, error } = await supabase.from("bookmarks").insert({
        user_id: userId,
        device_id: targetDevId,
        url: bookmarkUrl,
        title: bookmarkTitle,
        folder_path: resolvedFolder,
        source: "dashboard",
        description_pending: true,
      }).select("id").single();
      savedId = inserted?.id ?? null;
      saveError = error?.message ?? null;
    }

    setLoading(false);

    if (saveError || !savedId) {
      setError("Failed to save bookmark. Please try again.");
      return;
    }

    try {
      const generationResponse = await fetch("/api/generate-bookmark-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmark_id: savedId, preserve_folder: true }),
      });
      if (!generationResponse.ok) {
        console.error("Failed to queue bookmark description:", await generationResponse.text());
      }
    } catch (error) {
      console.error("Failed to queue bookmark description:", error);
    }

    setUrl("");
    setTitle("");
    setFolderPath("auto");
    onOpenChange(false);
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: "var(--bk-surface)",
          border: "1px solid var(--bk-border)",
          borderRadius: "16px",
          maxWidth: "440px",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2 text-base font-semibold"
            style={{ color: "var(--bk-text-primary)" }}
          >
            <PlusCircleIcon className="w-4 h-4 text-white" />
            Add a Bookmark
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label
              className="text-xs mb-1.5 block font-medium"
              style={{ color: "var(--bk-text-muted)" }}
            >
              URL *
            </label>
            <input
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }}
              className="w-full px-3 py-2.5 text-sm rounded-[8px] outline-none transition-bk font-mono"
              style={{
                background: "var(--bk-bg)",
                border: "1px solid var(--bk-border)",
                color: "var(--bk-text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--bk-accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--bk-border)")}
              autoFocus
            />
          </div>

          <div>
            <label
              className="text-xs mb-1.5 block font-medium"
              style={{ color: "var(--bk-text-muted)" }}
            >
              Title (optional — AI generates title if left blank)
            </label>
            <input
              type="text"
              placeholder="My bookmark title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-[8px] outline-none transition-bk"
              style={{
                background: "var(--bk-bg)",
                border: "1px solid var(--bk-border)",
                color: "var(--bk-text-primary)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--bk-accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--bk-border)")}
            />
          </div>

          <div>
            <label
              className="text-xs mb-1.5 block font-medium"
              style={{ color: "var(--bk-text-muted)" }}
            >
              Folder
            </label>
            <select
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              className="w-full px-3 py-2.5 text-xs rounded-[8px] outline-none transition-bk"
              style={{
                background: "var(--bk-bg)",
                border: "1px solid var(--bk-border)",
                color: "var(--bk-text-primary)",
              }}
            >
              <option value="auto">Auto sort from your bookmarks</option>
              <option value="__bookmarks_bar__">Bookmarks bar</option>
              <option value="__uncategorized__">Keep uncategorized</option>
              {availableFolders.map((folder) => (
                <option key={folder} value={folder}>{folder}</option>
              ))}
            </select>
          </div>

          {/* Target Connected Browser Dropdown Selector */}
          <div>
            <label
              className="text-xs mb-1.5 flex items-center gap-1 font-medium"
              style={{ color: "var(--bk-text-muted)" }}
            >
              <LaptopIcon className="w-3 h-3" />
              Sync to Browser Extension
            </label>
            {availableDevices.length > 1 ? (
              <select
                value={targetDevice}
                onChange={(e) => setTargetDevice(e.target.value)}
                className="w-full px-3 py-2.5 text-xs rounded-[8px] outline-none transition-bk"
                style={{
                  background: "var(--bk-bg)",
                  border: "1px solid var(--bk-border)",
                  color: "var(--bk-text-primary)",
                }}
              >
                <option value="all">⚡ All Connected Browsers</option>
                {availableDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.browser ? `${d.browser} (${d.device_name})` : d.device_name}
                  </option>
                ))}
              </select>
            ) : availableDevices.length === 1 ? (
              <div
                className="p-2.5 rounded-[8px] text-xs flex items-center justify-between"
                style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
              >
                <span className="truncate" style={{ color: "var(--bk-text-primary)" }}>
                  {availableDevices[0].browser ? `${availableDevices[0].browser} (${availableDevices[0].device_name})` : availableDevices[0].device_name}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide">Sync Target</span>
              </div>
            ) : (
              <p className="text-xs italic" style={{ color: "var(--bk-text-muted)" }}>
                No browser extension linked yet. Bookmark will be saved to your web account.
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs font-medium" style={{ color: "#fc8181" }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 py-2.5 rounded-[8px] text-xs transition-bk"
              style={{
                border: "1px solid var(--bk-border)",
                color: "var(--bk-text-muted)",
                background: "transparent",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] text-xs font-semibold transition-bk"
              style={{
                background: loading ? "rgba(255,255,255,0.2)" : "var(--bk-accent)",
                color: "#09090b",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                "Save & Sync Bookmark"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
