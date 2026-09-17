// components/SettingsModal.tsx
// Modal displaying user profile info, display name update with auth persistence, AI maintenance, and permanent Factory Reset DB wiper.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserIcon,
  MailIcon,
  ShieldCheckIcon,
  CpuIcon,
  GlobeIcon,
  CheckIcon,
  SparklesIcon,
  Loader2Icon,
  Trash2Icon,
  AlertTriangleIcon,
  DownloadIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
}

export function SettingsModal({ open, onOpenChange, user }: SettingsModalProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recreating, setRecreating] = useState(false);
  const [recreateStatus, setRecreateStatus] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [displayName, setDisplayName] = useState(
    user.user_metadata?.full_name || user.email?.split("@")[0] || "Bookar User"
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await supabase.auth.updateUser({
        data: { full_name: displayName.trim() },
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => {
        setSaved(false);
        onOpenChange(false);
      }, 1000);
    } catch (err) {
      console.error("Failed to update display name", err);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateAiDescriptions = async () => {
    setRecreating(true);
    setRecreateStatus(null);
    try {
      const res = await fetch("/api/recreate-descriptions", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRecreateStatus(`✓ Queued AI descriptions for ${data.count ?? 0} bookmark(s)!`);
      } else {
        setRecreateStatus("Failed to queue AI descriptions.");
      }
    } catch {
      setRecreateStatus("Network error triggering AI descriptions.");
    } finally {
      setRecreating(false);
    }
  };

  const handleFactoryReset = async () => {
    setResetting(true);
    try {
      await supabase.from("bookmarks").delete().eq("user_id", user.id);
      await supabase.from("devices").delete().eq("user_id", user.id);
      setResetting(false);
      setResetConfirmOpen(false);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("Failed to perform factory reset", err);
      setResetting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          style={{
            background: "var(--bk-surface)",
            border: "1px solid var(--bk-border)",
            borderRadius: "16px",
            maxWidth: "480px",
            padding: "24px",
          }}
        >
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2 text-base font-semibold"
              style={{ color: "var(--bk-text-primary)" }}
            >
              <UserIcon className="w-4 h-4" style={{ color: "var(--bk-text-primary)" }} />
              Account & Settings
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-2">
            {/* User Profile Card */}
            <div
              className="flex items-center gap-3 p-3.5 rounded-[12px]"
              style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
            >
              {user.user_metadata?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.user_metadata.avatar_url}
                  alt=""
                  className="w-12 h-12 rounded-full border border-white/10"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base"
                  style={{ background: "var(--bk-selection)", color: "var(--bk-text-primary)" }}
                >
                  {(user.email?.[0] ?? "U").toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--bk-text-primary)" }}>
                  {displayName}
                </p>
                <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: "var(--bk-text-muted)" }}>
                  <MailIcon className="w-3 h-3" />
                  {user.email}
                </p>
              </div>
            </div>

            {/* Name Field */}
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--bk-text-muted)" }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[8px] outline-none transition-bk"
                style={{
                  background: "var(--bk-bg)",
                  border: "1px solid var(--bk-border)",
                  color: "var(--bk-text-primary)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--bk-accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--bk-border)")}
              />
            </div>

            {/* AI Re-generation Section */}
            <div
              className="p-3.5 rounded-[12px] space-y-2 text-xs"
              style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--bk-text-primary)" }}>
                  <SparklesIcon className="w-3.5 h-3.5" style={{ color: "var(--bk-text-primary)" }} />
                  AI Description Maintenance
                </span>
              </div>
              <p className="text-[11px]" style={{ color: "var(--bk-text-muted)", lineHeight: "1.5" }}>
                Re-scan and generate fresh AI descriptions & tags for all your saved bookmarks at once using NVIDIA Llama 3.1.
              </p>
              <button
                type="button"
                onClick={handleRegenerateAiDescriptions}
                disabled={recreating}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[8px] font-medium text-xs transition-bk mt-1"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "var(--bk-text-primary)",
                  border: "1px solid var(--bk-border)",
                }}
              >
                {recreating ? (
                  <>
                    <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                    Generating AI Descriptions…
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-3.5 h-3.5" />
                    Re-generate AI Descriptions for All Bookmarks
                  </>
                )}
              </button>
              {recreateStatus && (
                <p className="text-[11px] font-medium text-center mt-1" style={{ color: "var(--bk-text-primary)" }}>
                  {recreateStatus}
                </p>
              )}
            </div>

            {/* Integration Status Badges */}
            <div
              className="p-3.5 rounded-[12px] space-y-2 text-xs"
              style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5" style={{ color: "var(--bk-text-primary)" }}>
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                  Authentication Status
                </span>
                <span className="text-emerald-400 font-medium">Google Auth Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5" style={{ color: "var(--bk-text-primary)" }}>
                  <CpuIcon className="w-3.5 h-3.5" style={{ color: "var(--bk-text-primary)" }} />
                  AI Model Engine
                </span>
                <span style={{ color: "var(--bk-text-muted)" }}>NVIDIA Llama 3.1 8B</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5" style={{ color: "var(--bk-text-primary)" }}>
                  <GlobeIcon className="w-3.5 h-3.5 text-sky-400" />
                  Multi-Device Sync
                </span>
                <span className="text-sky-400 font-medium">Enabled</span>
              </div>
            </div>

            {/* Extension Download + Factory Reset Section */}
            <div className="pt-2 border-t space-y-2" style={{ borderColor: "var(--bk-border)" }}>
              {/* Download Extension Button */}
              <a
                href="/api/extension-zip"
                download="bookar-extension.zip"
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[8px] font-medium text-xs transition-bk"
                style={{
                  background: "var(--bk-selection)",
                  color: "var(--bk-text-primary)",
                  border: "1px solid var(--bk-border)",
                  textDecoration: "none",
                  display: "flex",
                }}
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Download Browser Extension (.zip)
              </a>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-[8px] font-semibold text-xs transition-bk"
                style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "#fc8181",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                <Trash2Icon className="w-3.5 h-3.5" />
                Permanently Remove All User Data (Factory Reset)
              </button>
            </div>

            {/* Save Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 py-2 rounded-[8px] text-xs transition-bk"
                style={{
                  border: "1px solid var(--bk-border)",
                  color: "var(--bk-text-muted)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-xs font-semibold transition-bk"
                style={{
                  background: saved ? "rgba(255,255,255,0.2)" : "var(--bk-accent)",
                  color: saved ? "var(--bk-text-primary)" : "#09090b",
                  border: saved ? "1px solid var(--bk-border)" : "none",
                }}
              >
                {saving ? (
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                ) : saved ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5" />
                    Saved Everywhere!
                  </>
                ) : (
                  "Save Preferences"
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alert Confirmation Modal for Permanent Factory Reset */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent
          style={{
            background: "var(--bk-surface)",
            border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: "16px",
            maxWidth: "420px",
            padding: "20px",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-red-400">
              <AlertTriangleIcon className="w-5 h-5 text-red-400" />
              Permanently Wipe All Data?
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 mt-2 text-xs" style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
            <p>
              This action performs a complete <strong>Factory Reset</strong>. It will permanently delete all your saved bookmarks, folder structures, connected browser sessions, and API keys from the database.
            </p>
            <div className="p-3 rounded-[8px] bg-red-500/10 border border-red-500/20 text-red-300 font-medium">
              ⚠️ This action is permanent and cannot be undone.
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={() => setResetConfirmOpen(false)}
              className="flex-1 py-2 rounded-[8px] text-xs transition-bk"
              style={{ border: "1px solid var(--bk-border)", color: "var(--bk-text-primary)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFactoryReset}
              disabled={resetting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-xs font-bold transition-bk"
              style={{ background: "#dc2626", color: "#ffffff" }}
            >
              {resetting ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : "Confirm Factory Reset"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
