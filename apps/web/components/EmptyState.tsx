// components/EmptyState.tsx
// Two variants:
//   - "no-device": user hasn't linked a browser yet (linking code screen)
//   - "no-bookmarks": device is linked but no bookmarks match the current filter

"use client";

import { useState, useEffect, useCallback } from "react";
import { PlusCircleIcon, Loader2Icon, RefreshCwIcon, AlertCircleIcon, DownloadIcon } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

// ── No bookmarks (device connected, list is empty) ────────────────────────────
export function NoBookmarksState({
  onAddBookmark,
}: {
  onAddBookmark: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: "var(--bk-selection)",
          border: "1px solid rgba(146,220,229,0.2)",
        }}
      >
        <PlusCircleIcon className="w-7 h-7" style={{ color: "var(--bk-accent)" }} />
      </div>
      <h3 className="text-base font-semibold mb-2" style={{ color: "var(--bk-text-primary)" }}>
        No bookmarks yet
      </h3>
      <p className="text-sm mb-6 max-w-sm" style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
        Bookmarks you save in your browser will appear here automatically. You can also add
        one manually.
      </p>
      <button
        onClick={onAddBookmark}
        className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-sm font-medium transition-bk"
        style={{ background: "var(--bk-accent)", color: "#20242B" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bk-accent-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bk-accent)")}
      >
        <PlusCircleIcon className="w-4 h-4" />
        Add a bookmark
      </button>
    </div>
  );
}

// ── No device linked (linking code screen) ─────────────────────────────────────
interface LinkingCodeCardProps {
  userId: string;
  onLinked?: () => void;
}

type CodeState = "loading" | "active" | "expired" | "error" | "linked";

export function LinkingCodeCard({ userId, onLinked }: LinkingCodeCardProps) {
  const [state, setState] = useState<CodeState>("loading");
  const [code, setCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(600);
  const supabase = createSupabaseBrowserClient();

  const generateCode = useCallback(async () => {
    setState("loading");
    setCode(null);
    setErrorMessage(null);

    let deviceId: string;
    try {
      const response = await fetch("/api/create-link-code", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.device_id || !result.linking_code) {
        throw new Error(result.error ?? "Unable to create a browser-linking record.");
      }
      deviceId = result.device_id;
      setCode(result.linking_code);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create a browser-linking record.");
      setState("error");
      return;
    }

    setSecondsLeft(600);
    setState("active");

    // Poll for this device being linked (extension completes the link)
    const checkInterval = setInterval(async () => {
      const { data } = await supabase
        .from("devices")
        .select("api_key_hash, linking_code")
        .eq("id", deviceId)
        .single();

      if (data?.api_key_hash && !data.linking_code) {
        // Device was linked!
        clearInterval(checkInterval);
        setState("linked");
        onLinked?.();
      }
    }, 3000);

    // Cleanup on expiry
    setTimeout(() => {
      clearInterval(checkInterval);
      setState((s) => (s === "active" ? "expired" : s));
    }, 10 * 60 * 1000);

    return () => clearInterval(checkInterval);
  }, [supabase, userId, onLinked]);

  useEffect(() => {
    const run = async () => {
      await generateCode();
    };
    void run();
  }, [generateCode]);

  // Countdown timer
  useEffect(() => {
    if (state !== "active") return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  if (state === "linked") {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
          style={{ background: "rgba(146,220,229,0.15)", border: "2px solid var(--bk-accent)" }}
        >
          <span style={{ fontSize: "28px" }}>✓</span>
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--bk-accent)" }}>
          Device connected!
        </h3>
        <p className="text-sm" style={{ color: "var(--bk-text-muted)" }}>
          Your bookmarks are syncing now…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="w-full max-w-sm">
        {/* Header */}
        <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--bk-text-primary)" }}>
          Connect your browser
        </h2>
        <p className="text-sm mb-8" style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
          Install the Bookar extension, then enter this code in the extension popup to start
          syncing.
        </p>

        {/* Code display */}
        <div
          className="bk-card p-8 mb-4"
          style={{
            boxShadow: state === "active"
              ? "0 0 0 1px rgba(146,220,229,0.2), 0 0 30px rgba(146,220,229,0.08)"
              : undefined,
          }}
        >
          {state === "loading" && (
            <Loader2Icon
              className="w-8 h-8 mx-auto animate-spin"
              style={{ color: "var(--bk-accent)" }}
            />
          )}

          {state === "error" && (
            <div className="flex flex-col items-center gap-3">
              <AlertCircleIcon className="w-8 h-8" style={{ color: "#ef4444" }} />
              <p className="text-sm" style={{ color: "#fc8181" }}>
                Failed to generate code.
              </p>
              {errorMessage && (
                <p className="text-xs max-w-xs break-words" style={{ color: "var(--bk-text-muted)" }}>
                  {errorMessage}
                </p>
              )}
            </div>
          )}

          {(state === "active" || state === "expired") && code && (
            <>
              <div
                className="text-5xl font-mono font-bold tracking-[0.2em] mb-4 select-all"
                style={{
                  color: state === "expired" ? "var(--bk-text-muted)" : "var(--bk-accent)",
                  fontFamily: "var(--font-geist-mono, monospace)",
                  animation:
                    state === "active"
                      ? "pulse-glow 2s ease-in-out infinite"
                      : undefined,
                  filter: state === "expired" ? "grayscale(1)" : undefined,
                }}
              >
                {code}
              </div>

              {state === "active" && (
                <p className="text-xs" style={{ color: "var(--bk-text-muted)" }}>
                  Expires in{" "}
                  <span style={{ color: secondsLeft < 60 ? "#f59e0b" : "var(--bk-text-primary)" }}>
                    {minutes}:{String(seconds).padStart(2, "0")}
                  </span>
                </p>
              )}

              {state === "expired" && (
                <div>
                  <p className="text-sm mb-4" style={{ color: "var(--bk-text-muted)" }}>
                    This code has expired.
                  </p>
                  <button
                    onClick={generateCode}
                    className="flex items-center gap-2 mx-auto px-4 py-2 rounded-[8px] text-sm font-medium transition-bk"
                    style={{ background: "var(--bk-accent)", color: "#20242B" }}
                  >
                    <RefreshCwIcon className="w-3.5 h-3.5" />
                    Generate new code
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {state === "active" && (
          <p className="text-xs" style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
            Waiting for your browser extension to connect…
          </p>
        )}

        {/* Download Button */}
        <div className="mt-6">
          <a
            href="/api/extension-zip"
            download
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-sm font-semibold transition-bk"
            style={{
              background: "var(--bk-accent)",
              color: "#09090b",
              textDecoration: "none",
              boxShadow: "0 2px 12px rgba(146,220,229,0.15)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bk-accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bk-accent)")}
          >
            <DownloadIcon className="w-4 h-4" />
            Download Extension (.zip)
          </a>
        </div>

        {/* Install instructions */}
        <div
          className="mt-6 p-4 rounded-[12px] text-left space-y-2"
          style={{ background: "var(--bk-surface)", border: "1px solid var(--bk-border)" }}
        >
          <p className="text-xs font-medium" style={{ color: "var(--bk-text-primary)" }}>
            How to install the extension
          </p>
          {[
            'Download and unzip the extension file above',
            "Go to chrome://extensions in your browser",
            "Enable Developer Mode (top-right toggle)",
            'Click "Load Unpacked" and select the unzipped extension folder',
            "Click the Bookar icon and enter the 6-digit code above",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="text-[10px] font-medium w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "var(--bk-selection)", color: "var(--bk-accent)" }}
              >
                {i + 1}
              </span>
              <p className="text-xs" style={{ color: "var(--bk-text-muted)" }}>
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
