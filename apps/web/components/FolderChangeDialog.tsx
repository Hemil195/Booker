"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRightIcon, FolderIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FolderChangeDialogProps {
  open: boolean;
  currentFolder: string | null;
  proposedFolder: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function FolderChangeDialog({
  open,
  currentFolder,
  proposedFolder,
  onCancel,
  onConfirm,
}: FolderChangeDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError("Could not move this bookmark. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !saving) onCancel(); }}>
      <DialogContent
        showCloseButton={false}
        style={{
          background: "var(--bk-surface)",
          border: "1px solid var(--bk-border)",
          borderRadius: "16px",
          width: "min(420px, calc(100vw - 24px))",
          padding: "24px",
          color: "var(--bk-text-primary)",
        }}
      >
        <DialogHeader className="gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px]"
          >
            <Image src="/Logo.png" alt="Bookar" width={40} height={40} className="h-10 w-10 object-cover" />
          </div>
          <div className="space-y-1.5">
            <DialogTitle className="text-base font-semibold" style={{ color: "var(--bk-text-primary)" }}>
              Move this bookmark?
            </DialogTitle>
            <DialogDescription style={{ color: "var(--bk-text-muted)" }}>
              The regenerated summary suggests a different folder. Would you like to move it?
            </DialogDescription>
          </div>
        </DialogHeader>

        <div
          className="my-2 flex min-w-0 items-center gap-3 rounded-[8px] border px-3 py-3"
          style={{ borderColor: "var(--bk-border)", background: "var(--bk-bg)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] font-medium uppercase" style={{ color: "var(--bk-text-muted)" }}>
              Current folder
            </div>
            <div className="truncate text-xs" style={{ color: "var(--bk-text-primary)" }}>
              {currentFolder || "Uncategorized"}
            </div>
          </div>
          <ArrowRightIcon className="h-4 w-4 shrink-0" style={{ color: "var(--bk-text-muted)" }} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] font-medium uppercase" style={{ color: "var(--bk-text-muted)" }}>
              Suggested folder
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: "var(--bk-accent)" }}>
              <FolderIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{proposedFolder}</span>
            </div>
          </div>
        </div>

        {error && <p className="text-xs" style={{ color: "#fc8181" }}>{error}</p>}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-[8px] border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            style={{ borderColor: "var(--bk-border)", color: "var(--bk-text-muted)" }}
          >
            Keep current folder
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="rounded-[8px] px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--bk-accent)", color: "var(--bk-bg)" }}
          >
            {saving ? "Moving…" : "Move bookmark"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}