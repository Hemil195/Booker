// components/ConnectionsClient.tsx
// Connections page UI — Connected Browsers with timestamps, MCP setup, API keys, and real Lucide icons.

"use client";

import { useState, useCallback, useEffect } from "react";
import {
  KeyIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Trash2Icon,
  PlusIcon,
  Loader2Icon,
  ExternalLinkIcon,
  LaptopIcon,
  GlobeIcon,
  PlugIcon,
  BotIcon,
  MessageSquareIcon,
  FileTextIcon,
  ClockIcon,
  CalendarIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

interface DeviceItem {
  id: string;
  device_name: string;
  browser: string;
  api_key_hash: string | null;
  created_at: string;
  last_synced_at?: string | null;
}

interface ConnectionsClientProps {
  userId: string;
  allDevices: DeviceItem[];
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-bk flex-shrink-0"
      style={{
        background: copied ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
        color: "var(--bk-text-primary)",
        border: "1px solid var(--bk-border)",
      }}
    >
      {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function ToolCard({
  logo,
  name,
  status,
  setupContent,
}: {
  logo: React.ReactNode;
  name: string;
  status: "connected" | "not-connected";
  setupContent: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="bk-card overflow-hidden"
      style={{ border: "1px solid var(--bk-border)" }}
    >
      <div className="flex items-center gap-4 p-4">
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
        >
          {logo}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium" style={{ color: "var(--bk-text-primary)" }}>
            {name}
          </p>
          <span
            className="bk-pill mt-0.5"
            style={{
              background: status === "connected" ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
              color: "var(--bk-text-primary)",
              border: "1px solid var(--bk-border)",
            }}
          >
            {status === "connected" ? "● Connected" : "○ Setup required"}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk flex-shrink-0"
          style={{
            background: expanded ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
            color: "var(--bk-text-primary)",
            border: "1px solid var(--bk-border)",
          }}
        >
          {expanded ? "Hide" : "Setup instructions"}
          {expanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div
          className="px-4 pb-4 animate-fade-in"
          style={{ borderTop: "1px solid var(--bk-border)" }}
        >
          <div className="pt-4">{setupContent}</div>
        </div>
      )}
    </div>
  );
}

function RevealKey({ rawKey }: { rawKey: string }) {
  const [shown, setShown] = useState(true);
  return (
    <div
      className="flex items-center gap-2 p-3 rounded-[8px] mt-2"
      style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
    >
      <code
        className="flex-1 text-xs font-mono break-all"
        style={{ color: "var(--bk-text-primary)", fontFamily: "var(--font-geist-mono, monospace)" }}
      >
        {shown ? rawKey : "•".repeat(rawKey.length)}
      </code>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={() => setShown(!shown)}
          className="px-2 py-1 text-xs rounded-[5px] transition-bk"
          style={{ color: "var(--bk-text-muted)", border: "1px solid var(--bk-border)" }}
        >
          {shown ? "Hide" : "Show"}
        </button>
        <CopyButton value={rawKey} />
      </div>
    </div>
  );
}

export function ConnectionsClient({ allDevices: initialDevices }: ConnectionsClientProps) {
  const supabase = createSupabaseBrowserClient();
  const [devicesList, setDevicesList] = useState<DeviceItem[]>(initialDevices);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [restExpanded, setRestExpanded] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [mcpUrl, setMcpUrl] = useState<string>("https://bookar-rereal.vercel.app/api/mcp");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setMcpUrl(`${window.location.origin}/api/mcp`);
    }
  }, []);

  // Split into connected browser devices and bot keys
  const browserDevices = devicesList.filter((d) => d.browser !== "bot");
  const botKeys = devicesList.filter((d) => d.browser === "bot");

  const handleGenerateKey = useCallback(async () => {
    setGeneratingKey(true);
    try {
      const res = await fetch("/api/generate-api-key", { method: "POST" });
      const json = await res.json();

      setGeneratingKey(false);
      if (!res.ok || json.error || !json.device) {
        alert(`Failed to generate key: ${json.error || "Unknown error"}`);
        return;
      }

      setNewlyGeneratedKey(json.rawKey);
      setDevicesList((prev) => [json.device, ...prev]);
    } catch {
      setGeneratingKey(false);
      alert("Error generating API key. Please check your network connection.");
    }
  }, []);

  const handleRevoke = async (id: string) => {
    await supabase.from("devices").delete().eq("id", id);
    setDevicesList((prev) => prev.filter((k) => k.id !== id));
    setRevokeTarget(null);
  };

  const claudeConfig = (key: string) => `{
  "mcpServers": {
    "bookar": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${key}"
      }
    }
  }
}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--bk-text-primary)" }}>
          Connections & AI Integrations
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
          Manage connected browsers, generate API keys, and connect Claude, ChatGPT, or any AI assistant.
        </p>
      </div>

      {/* ── SECTION 1: Connected Browsers ─────────────────────────────────── */}
      <div className="bk-card p-5" style={{ border: "1px solid var(--bk-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-[8px] flex items-center justify-center"
              style={{ background: "var(--bk-selection)", border: "1px solid var(--bk-border)" }}
            >
              <GlobeIcon className="w-4 h-4" style={{ color: "var(--bk-text-primary)" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--bk-text-primary)" }}>
                Connected Browsers & Extension Devices
              </h2>
              <p className="text-xs" style={{ color: "var(--bk-text-muted)" }}>
                Browsers currently syncing bookmarks to your account
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-[6px]" style={{ background: "var(--bk-selection)", border: "1px solid var(--bk-border)", color: "var(--bk-text-primary)" }}>
            {browserDevices.length} Connected
          </span>
        </div>

        {browserDevices.length === 0 ? (
          <div className="py-6 text-center rounded-[10px]" style={{ border: "1px dashed var(--bk-border)" }}>
            <LaptopIcon className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--bk-text-muted)" }} />
            <p className="text-xs" style={{ color: "var(--bk-text-muted)" }}>
              No browser extensions connected yet. Use the 6-digit code on the home screen to link a browser.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {browserDevices.map((dev) => (
              <div
                key={dev.id}
                className="flex items-center justify-between p-3.5 rounded-[10px]"
                style={{ background: "var(--bk-bg)", border: "1px solid var(--bk-border)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--bk-surface)", border: "1px solid var(--bk-border)" }}
                  >
                    <LaptopIcon className="w-4.5 h-4.5" style={{ color: "var(--bk-text-primary)" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--bk-text-primary)" }}>
                      {dev.device_name}
                    </p>
                    <p className="text-[11px] truncate mt-0.5 flex items-center gap-1" style={{ color: "var(--bk-text-muted)" }} suppressHydrationWarning>
                      <CalendarIcon className="w-3 h-3 flex-shrink-0" />
                      Connected: {new Date(dev.created_at).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[10px] truncate flex items-center gap-1 mt-0.5" style={{ color: "var(--bk-text-muted)" }} suppressHydrationWarning>
                      <ClockIcon className="w-3 h-3 flex-shrink-0" />
                      Last synced: {dev.last_synced_at ? new Date(dev.last_synced_at).toLocaleString("en-US", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Just now"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRevokeTarget(dev.id)}
                  className="p-1.5 rounded-[6px] transition-bk flex-shrink-0 ml-2"
                  style={{ color: "var(--bk-text-muted)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget.style.background = "rgba(239,68,68,0.15)");
                    (e.currentTarget.style.color = "#fc8181");
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget.style.background = "transparent");
                    (e.currentTarget.style.color = "var(--bk-text-muted)");
                  }}
                  title="Unlink device"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 2: MCP Server URL ─────────────────────────────────────── */}
      <div className="bk-card p-5" style={{ border: "1px solid var(--bk-border)" }}>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-7 h-7 rounded-[8px] flex items-center justify-center text-sm"
            style={{ background: "var(--bk-selection)", border: "1px solid var(--bk-border)" }}
          >
            <PlugIcon className="w-4 h-4" style={{ color: "var(--bk-text-primary)" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "var(--bk-text-primary)" }}>
            MCP Server Endpoint URL
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 text-xs px-3 py-2 rounded-[8px] font-mono truncate"
            style={{
              background: "var(--bk-bg)",
              border: "1px solid var(--bk-border)",
              color: "var(--bk-text-primary)",
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {mcpUrl}
          </code>
          <CopyButton value={mcpUrl} />
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--bk-text-muted)" }}>
          Use this URL in any MCP client. Authentication header:{" "}
          <code style={{ color: "var(--bk-text-primary)" }}>Authorization: Bearer &lt;your-key&gt;</code>.
        </p>
      </div>

      {/* ── SECTION 3: API Keys ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--bk-text-primary)" }}>
              API Keys
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--bk-text-muted)" }}>
              Generate non-expiring API keys for Claude, ChatGPT, Cursor, Windsurf, or custom bots.
            </p>
          </div>
          <button
            onClick={handleGenerateKey}
            disabled={generatingKey}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-semibold transition-bk"
            style={{ background: "var(--bk-accent)", color: "#09090b" }}
          >
            {generatingKey ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlusIcon className="w-3.5 h-3.5" />
            )}
            Generate API Key
          </button>
        </div>

        {newlyGeneratedKey && (
          <div className="bk-card p-4 mb-3 border-amber-500/30 bg-amber-500/5 space-y-3">
            <p className="text-xs font-semibold text-amber-400">
              ⚠ Copy your new API key now — it will not be shown again:
            </p>
            <RevealKey rawKey={newlyGeneratedKey} />
            <div className="pt-2 border-t border-amber-500/20">
              <p className="text-xs font-semibold text-emerald-400 mb-1">
                🚀 Instant ChatGPT Connector URL (Copy &amp; Paste into ChatGPT):
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-xs px-3 py-2 rounded-[8px] font-mono truncate"
                  style={{
                    background: "var(--bk-bg)",
                    border: "1px solid var(--bk-border)",
                    color: "#10b981",
                    fontFamily: "var(--font-geist-mono, monospace)",
                  }}
                >
                  {`${mcpUrl}?api_key=${newlyGeneratedKey}`}
                </code>
                <CopyButton value={`${mcpUrl}?api_key=${newlyGeneratedKey}`} label="Copy URL" />
              </div>
            </div>
          </div>
        )}

        {botKeys.length === 0 && !newlyGeneratedKey && (
          <div
            className="py-6 text-center rounded-[10px]"
            style={{ border: "1px dashed var(--bk-border)" }}
          >
            <KeyIcon className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--bk-text-muted)" }} />
            <p className="text-xs" style={{ color: "var(--bk-text-muted)" }}>
              No API keys generated yet. Click &quot;Generate API Key&quot; to connect Claude or ChatGPT.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {botKeys.map((k) => (
            <div key={k.id} className="bk-card p-3.5 flex items-center justify-between gap-3" style={{ border: "1px solid var(--bk-border)" }}>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--bk-text-primary)" }}>
                  {k.device_name}
                </p>
                <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--bk-text-muted)" }} suppressHydrationWarning>
                  Created: {new Date(k.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <button
                onClick={() => setRevokeTarget(k.id)}
                className="p-1.5 rounded-[6px] transition-bk flex-shrink-0"
                style={{ color: "var(--bk-text-muted)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget.style.background = "rgba(239,68,68,0.15)");
                  (e.currentTarget.style.color = "#fc8181");
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget.style.background = "transparent");
                  (e.currentTarget.style.color = "var(--bk-text-muted)");
                }}
                title="Revoke key"
              >
                <Trash2Icon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 4: Per-Tool Setup Guides ─────────────────────────────── */}
      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--bk-text-primary)" }}>
        Tool Setup Instructions
      </h2>
      <div className="space-y-3">
        {/* Claude */}
        <ToolCard
          logo={<BotIcon className="w-5 h-5" style={{ color: "var(--bk-text-primary)" }} />}
          name="Claude (Desktop & Claude Code)"
          status="not-connected"
          setupContent={
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
                Add this to your <code style={{ color: "var(--bk-text-primary)" }}>claude_desktop_config.json</code>:
              </p>
              <div className="relative">
                <pre
                  className="text-xs p-4 rounded-[10px] overflow-x-auto font-mono"
                  style={{
                    background: "var(--bk-bg)",
                    border: "1px solid var(--bk-border)",
                    color: "var(--bk-text-primary)",
                    lineHeight: "1.6",
                  }}
                >
                  {claudeConfig(newlyGeneratedKey || "YOUR_BOOKAR_API_KEY")}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton value={claudeConfig(newlyGeneratedKey || "YOUR_BOOKAR_API_KEY")} label="Copy config" />
                </div>
              </div>
            </div>
          }
        />

        {/* ChatGPT */}
        <ToolCard
          logo={<MessageSquareIcon className="w-5 h-5" style={{ color: "var(--bk-text-primary)" }} />}
          name="ChatGPT (Plus/Pro/Business/Enterprise)"
          status="not-connected"
          setupContent={
            <div className="space-y-3">
              <div
                className="p-3 rounded-[8px] text-xs"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
              >
                ⚠ ChatGPT remote MCP connectors require a paid plan with Developer Mode enabled.
              </div>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li>1. Open ChatGPT → Settings → Developer Mode → Enable</li>
                <li>2. Go to Plugins / Connectors → Create New Connector</li>
                <li>
                  3. Set <strong>Server URL</strong> to:
                  <div className="flex items-center gap-2 mt-1.5">
                    <code className="flex-1 text-xs px-3 py-2 rounded-[8px] font-mono truncate bg-black/40 border border-white/10 text-emerald-400">
                      {newlyGeneratedKey ? `${mcpUrl}?api_key=${newlyGeneratedKey}` : `${mcpUrl}?api_key=YOUR_BOOKAR_API_KEY`}
                    </code>
                    <CopyButton value={newlyGeneratedKey ? `${mcpUrl}?api_key=${newlyGeneratedKey}` : `${mcpUrl}?api_key=YOUR_BOOKAR_API_KEY`} label="Copy" />
                  </div>
                </li>
                <li>4. Set <strong>Authentication</strong> dropdown to: <strong className="text-white">No Auth (or None)</strong></li>
                <li>5. Check <em>&quot;I understand and want to continue&quot;</em> and click <strong>Create</strong>!</li>
              </ol>
            </div>
          }
        />

        {/* REST OpenAPI Fallback */}
        <div className="bk-card overflow-hidden" style={{ border: "1px solid var(--bk-border)" }}>
          <button
            onClick={() => setRestExpanded(!restExpanded)}
            className="w-full flex items-center gap-3 p-4 text-left transition-bk"
            style={{ background: "transparent" }}
          >
            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-sm flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--bk-border)" }}>
              <FileTextIcon className="w-4 h-4" style={{ color: "var(--bk-text-primary)" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--bk-text-primary)" }}>
                REST API / OpenAPI (Zapier, Make, Copilot Studio)
              </p>
              <p className="text-xs" style={{ color: "var(--bk-text-muted)" }}>
                Fallback REST specification for non-MCP automation tools
              </p>
            </div>
            {restExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </button>
          {restExpanded && (
            <div className="px-4 pb-4 animate-fade-in border-t" style={{ borderColor: "var(--bk-border)" }}>
              <div className="pt-3 flex gap-2">
                <a
                  href="/openapi.yaml"
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-bk"
                  style={{
                    background: "var(--bk-selection)",
                    color: "var(--bk-text-primary)",
                    border: "1px solid var(--bk-border)",
                    textDecoration: "none",
                  }}
                >
                  <ExternalLinkIcon className="w-3 h-3" />
                  Download openapi.yaml
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <DialogContent
          style={{
            background: "var(--bk-surface)",
            border: "1px solid var(--bk-border)",
            borderRadius: "14px",
            maxWidth: "380px",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--bk-text-primary)" }}>Unlink device or key?</DialogTitle>
          </DialogHeader>
          <p className="text-xs mb-4" style={{ color: "var(--bk-text-muted)", lineHeight: "1.6" }}>
            The connected browser or AI tool using this key will be disconnected immediately.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setRevokeTarget(null)}
              className="flex-1 py-2 rounded-[8px] text-xs transition-bk"
              style={{ border: "1px solid var(--bk-border)", color: "var(--bk-text-muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => revokeTarget && handleRevoke(revokeTarget)}
              className="flex-1 py-2 rounded-[8px] text-xs font-semibold transition-bk"
              style={{ background: "rgba(239,68,68,0.15)", color: "#fc8181", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              Revoke
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
