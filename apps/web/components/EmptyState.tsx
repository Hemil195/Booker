// components/EmptyState.tsx
// Two variants:
//   - "no-device": user hasn't linked a browser yet (linking code screen)
//   - "no-bookmarks": device is linked but no bookmarks match the current filter

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PlusCircleIcon, Loader2Icon, RefreshCwIcon, AlertCircleIcon, DownloadIcon } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

// ── No bookmarks (device connected, list is empty) ────────────────────────────
export function NoBookmarksState({
  onAddBookmark,
}: {
  onAddBookmark: () => void;
}) {
  return (
    <div className="col-span-full flex w-full flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
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
  compact?: boolean;
}

type CodeState = "loading" | "active" | "expired" | "error" | "linked";

interface LinkingCodeResult {
  device_id: string;
  linking_code: string;
}

const pendingLinkCodeRequests = new Map<string, Promise<LinkingCodeResult>>();

function requestLinkCode(userId: string, forceNew = false): Promise<LinkingCodeResult> {
  const existingRequest = pendingLinkCodeRequests.get(userId);
  if (!forceNew && existingRequest) return existingRequest;

  const request = (async () => {
    const response = await fetch("/api/create-link-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force_new: forceNew }),
    });
    const result = await response.json();
    if (!response.ok || !result.device_id || !result.linking_code) {
      throw new Error(result.error ?? "Unable to create a browser-linking record.");
    }
    return result as LinkingCodeResult;
  })();

  if (!forceNew) {
    pendingLinkCodeRequests.set(userId, request);
    void request.then(
      () => { if (pendingLinkCodeRequests.get(userId) === request) pendingLinkCodeRequests.delete(userId); },
      () => { if (pendingLinkCodeRequests.get(userId) === request) pendingLinkCodeRequests.delete(userId); },
    );
  }
  return request;
}

export function LinkingCodeCard({ userId, onLinked, compact = false }: LinkingCodeCardProps) {
  const [state, setState] = useState<CodeState>("loading");
  const [code, setCode] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(600);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const onLinkedRef = useRef(onLinked);
  onLinkedRef.current = onLinked;

  const generateCode = useCallback(async (forceNew = false) => {
    setState("loading");
    setCode(null);
    setErrorMessage(null);

    try {
      const result = await requestLinkCode(userId, forceNew);
      setDeviceId(result.device_id);
      setCode(result.linking_code);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create a browser-linking record.");
      setState("error");
      return;
    }

    setSecondsLeft(600);
    setState("active");
  }, [userId]);

  useEffect(() => {
    const run = async () => {
      await generateCode();
    };
    void run();
  }, [generateCode]);

  useEffect(() => {
    if (!deviceId || state !== "active") return;

    let checking = false;
    const checkInterval = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const { data } = await supabase
          .from("devices")
          .select("api_key_hash, linking_code")
          .eq("id", deviceId)
          .single();

        if (data?.api_key_hash && !data.linking_code) {
          setState("linked");
          onLinkedRef.current?.();
        }
      } finally {
        checking = false;
      }
    }, 3000);

    const expiryTimeout = setTimeout(() => {
      setState((current) => (current === "active" ? "expired" : current));
    }, 10 * 60 * 1000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(expiryTimeout);
    };
  }, [deviceId, state, supabase]);

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
      <div className={`flex flex-col items-center justify-center ${compact ? "py-8" : "py-20"} animate-fade-in`}>
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
    <div className={`flex flex-col ${compact ? "items-stretch justify-start py-4" : "items-center justify-center py-16"} px-4 text-center animate-fade-in`}>
      <div className={`w-full ${compact ? "grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]" : "max-w-sm"}`}>
        {/* Header */}
        <div className={compact ? "text-center lg:col-span-2" : "text-center"}>
          <h2 className={`${compact ? "text-lg" : "text-xl"} font-semibold mb-2`} style={{ color: "var(--bk-text-primary)" }}>
            Connect your browser
          </h2>
          <p className={`text-sm ${compact ? "mb-0" : "mb-8"}`} style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
            Install the Bookar extension, then enter this code in the extension popup to start
            syncing.
          </p>
        </div>

        <div className={compact ? "space-y-3" : ""}>
          {/* Code display */}
          <div
            className={`bk-card ${compact ? "p-5" : "p-8 mb-4"}`}
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
                      onClick={() => void generateCode(true)}
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
        </div>

        <div className={compact ? "space-y-3" : ""}>
          {/* Download Button */}
          <div className={compact ? "" : "mt-6"}>
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
            className={`${compact ? "" : "mt-6"} p-4 rounded-[12px] text-left space-y-2`}
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
    </div>
  );
}
