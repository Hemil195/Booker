"use client";
// components/LandingPage.tsx
// High-fidelity narrative scroll landing page for Bookar.

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  ArrowRightIcon,
  DownloadIcon,
  CheckIcon,
  ChevronRightIcon,
  SearchIcon,
  PlusIcon,
  FolderIcon,
  Share2Icon,
  SparklesIcon,
  BotIcon,
  ZapIcon,
  RocketIcon,
  GlobeIcon,
} from "lucide-react";
import { FaviconImage } from "@/components/FaviconImage";

const L = {
  bg: "#09090b",
  surface: "#18181b",
  border: "rgba(255, 255, 255, 0.12)",
  text: "#fafafa",
  muted: "#a1a1aa",
  accentDim: "rgba(255, 255, 255, 0.08)",
};

/* ── Global styles injected once ─────────────────────────────────── */
const GLOBAL_CSS = `
  @keyframes greenPulse {
    0%   { transform: scale(0.95); box-shadow: 0 0 0 0   rgba(16,185,129,0.7); }
    70%  { transform: scale(1);    box-shadow: 0 0 0 8px rgba(16,185,129,0);   }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0   rgba(16,185,129,0);   }
  }
  .pulse-dot { animation: greenPulse 2s infinite; }

  @keyframes scrollUp {
    0%   { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }
  @keyframes scrollDown {
    0%   { transform: translateY(-50%); }
    100% { transform: translateY(0); }
  }
  .marquee-up   { animation: scrollUp   14s linear infinite; }
  .marquee-down { animation: scrollDown 14s linear infinite; }

  @keyframes cursorMove {
    0%   { opacity: 1; }
    100% { opacity: 1; }
  }

  @keyframes cursorClick {
    0%   { transform: scale(1);    }
    40%  { transform: scale(0.82); }
    100% { transform: scale(1);    }
  }
  .cursor-click-anim { animation: cursorClick 220ms ease forwards; }

  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  .fade-up { animation: fadeSlideUp 400ms ease forwards; }

  @media (max-width: 768px) {
    .desktop-only  { display: none !important; }
    .grid-two-col  { grid-template-columns: 1fr !important; }
    .section-pad   { padding: 64px 20px !important; }
    .angled-pad    { padding: 80px 20px !important; }
    .landing-nav { padding: 12px 16px !important; }
    .landing-nav-inner { max-width: none !important; }
    .landing-brand-mark { width: 34px !important; height: 34px !important; }
    .landing-brand-name { font-size: 17px !important; }
    .hero-section { padding: 104px 20px 32px !important; }
    .hero-content { max-width: 680px !important; }
    .hero-h1 { font-size: 52px !important; line-height: 1.04 !important; }
    .hero-copy { font-size: 17px !important; }
    .hero-actions { max-width: 420px; margin: 0 auto; flex-direction: column; }
    .hero-actions a { width: 100%; justify-content: center; min-height: 50px; font-size: 15px !important; }
    .hero-following-section { padding-top: 40px !important; }
    .roadmap-grid  { grid-template-columns: 1fr !important; }
    .footer-glass  { font-size: clamp(72px, 22vw, 140px) !important; }
  }
  @media (min-width: 769px) {
    .mobile-only { display: none !important; }
    .landing-nav { padding: 16px 32px !important; }
    .landing-nav-inner { max-width: 1280px !important; }
    .landing-brand-mark { width: 36px !important; height: 36px !important; }
    .landing-brand-name { font-size: 18px !important; }
    .hero-section { padding: 112px 32px 26px !important; }
    .hero-content { max-width: 1080px !important; }
    .hero-h1 { font-size: 84px !important; line-height: 1.04 !important; }
    .hero-copy { font-size: 19px !important; max-width: 720px !important; }
    .hero-actions a { min-height: 54px; padding: 14px 28px !important; font-size: 16px !important; }
    .hero-following-section { padding-top: 40px !important; }
  }
  @media (min-width: 1440px) {
    .hero-h1 { font-size: 96px !important; }
  }
  @media (max-width: 480px) {
    .hero-section { padding: 96px 16px 28px !important; }
    .hero-h1 { font-size: 42px !important; }
    .hero-copy { font-size: 16px !important; }
  }
`;

/* ── Section wrappers ────────────────────────────────────────────── */
function Section({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`section-pad ${className ?? ""}`} style={{ padding: "100px 24px", position: "relative" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 10 }}>{children}</div>
    </section>
  );
}
function AngledSection({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div id={id} style={{ position: "relative", margin: "0", zIndex: 2 }}>
      <div style={{ position: "absolute", inset: 0, background: L.surface, clipPath: "polygon(0 5%,100% 0%,100% 95%,0% 100%)" }} />
      <div className="angled-pad" style={{ position: "relative", zIndex: 1, padding: "112px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>{children}</div>
      </div>
    </div>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: L.muted, marginBottom: 16 }}>{children}</p>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 700, color: L.text, lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 20 }}>{children}</h2>;
}
function Body({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontSize: 15, lineHeight: 1.7, color: L.muted, maxWidth: 560, ...style }}>{children}</p>;
}

/* ══════════════════════════════════════════════════════════════════
   FIGMA-STYLE CURSOR + INTERACTIVE DASHBOARD
══════════════════════════════════════════════════════════════════ */

/** The SVG Figma-style cursor pointer */
function FigmaCursorSvg({ clicking }: { clicking: boolean }) {
  return (
    <svg
      width="22" height="26" viewBox="0 0 22 26" fill="none"
      style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))", transition: "transform 150ms ease", transform: clicking ? "scale(0.85)" : "scale(1)" }}
    >
      <path d="M4 1L18 12.5L11.5 13.8L15 23L11.5 24.5L8 15.5L3 19L4 1Z" fill="white" stroke="#222" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

type TabId = "bookmarks" | "folders" | "connections";

/* Sequence of auto-demo steps the Figma cursor walks through */
type DemoAction =
  | { type: "setTab"; tab: TabId }
  | { type: "setFolder"; folder: string | null }
  | { type: "setInspect"; id: number | null };

function useDemoSequence(
  dispatch: (a: DemoAction) => void,
  paused: boolean,
) {
  const stepIdx = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 60, y: 45 });
  const [clicking, setClicking] = useState(false);
  const [label] = useState("Hemil");

  const STEPS: Array<{
    x: number; y: number;   // % of mockup width/height
    delay: number;
    action?: () => void;
  }> = [
    { x: 55, y: 9,  delay: 1000, action: () => dispatch({ type: "setTab", tab: "folders" }) },
    { x: 25, y: 55, delay: 1200, action: () => dispatch({ type: "setFolder", folder: "Design Systems" }) },
    { x: 20, y: 18, delay: 1500, action: () => { dispatch({ type: "setFolder", folder: null }); dispatch({ type: "setTab", tab: "bookmarks" }); } },
    { x: 75, y: 9,  delay: 900,  action: () => dispatch({ type: "setTab", tab: "connections" }) },
    { x: 50, y: 55, delay: 1400, action: () => {} },
    { x: 35, y: 9,  delay: 900,  action: () => { dispatch({ type: "setTab", tab: "bookmarks" }); } },
    { x: 60, y: 42, delay: 800,  action: () => dispatch({ type: "setInspect", id: 2 }) },
    { x: 60, y: 65, delay: 1000, action: () => dispatch({ type: "setInspect", id: 4 }) },
    { x: 25, y: 9,  delay: 800,  action: () => {} },
  ];

  const runStep = useCallback(function runStep() {
    if (paused) return;
    const step = STEPS[stepIdx.current % STEPS.length];

    // Move cursor
    setCursorPos({ x: step.x, y: step.y });

    // Click animation + action
    timerRef.current = setTimeout(() => {
      if (paused) return;
      setClicking(true);
      step.action?.();
      setTimeout(() => setClicking(false), 220);

      stepIdx.current++;
      const next = STEPS[stepIdx.current % STEPS.length];
      timerRef.current = setTimeout(() => {
        if (!paused) runStep();
      }, next.delay);
    }, step.delay);
  }, [paused, STEPS]);

  useEffect(() => {
    if (paused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(runStep, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [paused, runStep]);

  return { cursorPos, clicking, label };
}

function InteractiveDashboard() {
  const [state, setState] = useState<{
    activeTab: TabId;
    selectedFolder: string | null;
    inspectBookmark: number | null;
    copiedBookmark: string | null;
  }>({ activeTab: "bookmarks", selectedFolder: null, inspectBookmark: 1, copiedBookmark: null });

  const [userHovering, setUserHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function dispatch(action: DemoAction) {
    setState(prev => {
      switch (action.type) {
        case "setTab":    return { ...prev, activeTab: action.tab, selectedFolder: null };
        case "setFolder": return { ...prev, selectedFolder: action.folder, activeTab: action.folder ? prev.activeTab : "folders" };
        case "setInspect":return { ...prev, inspectBookmark: action.id };
        default: return prev;
      }
    });
  }

  const { cursorPos, clicking, label } = useDemoSequence(dispatch, userHovering);

  const bookmarks = [
    { id: 1, title: "Linear — Product planning, redesigned", url: "linear.app/method", tag: "Design", time: "2h ago", domain: "linear.app", folder: "Design Systems", aiSummary: "Automated issue tracking & roadmap sync. Designed for modern engineering teams." },
    { id: 2, title: "Raycast — Your shortcut to everything",  url: "raycast.com/store",  tag: "Productivity", time: "1d ago", domain: "raycast.com",   folder: "Productivity Tools", aiSummary: "Ultra-fast launcher for macOS with custom scripts and extensions store." },
    { id: 3, title: "Paper — Create, design, do more",        url: "paper.design",        tag: "Design",       time: "3d ago", domain: "paper.design",  folder: "Design Systems",    aiSummary: "Infinite canvas vector tool built specifically for modern UI component systems." },
    { id: 4, title: "Supabase — Realtime Postgres DB",        url: "supabase.com",        tag: "Dev",          time: "5d ago", domain: "supabase.com",  folder: "AI & Backend",      aiSummary: "Open-source Firebase backend with instant Postgres vector embeddings." },
    { id: 5, title: "NVIDIA NIM — LLM Microservices",         url: "build.nvidia.com",    tag: "AI",           time: "1w ago", domain: "nvidia.com",    folder: "AI & Backend",      aiSummary: "Enterprise microservices for fast LLM inference & RAG document indexing." },
  ];
  const folders = [
    { name: "Design Systems",   count: 2 },
    { name: "AI & Backend",     count: 2 },
    { name: "Productivity Tools", count: 1 },
  ];

  const displayedBookmarks = state.selectedFolder
    ? bookmarks.filter(b => b.folder === state.selectedFolder)
    : bookmarks;

  function handleShare(e: React.MouseEvent, title: string, url: string) {
    e.stopPropagation();
    try { navigator.clipboard.writeText(`${title} — https://${url}`); } catch {}
    setState(prev => ({ ...prev, copiedBookmark: title }));
    setTimeout(() => setState(prev => ({ ...prev, copiedBookmark: null })), 2200);
  }

  const activeTab = state.activeTab;
  const selectedFolder = state.selectedFolder;

  return (
    <div style={{ position: "relative" }}>
      {/* Figma cursor overlay */}
      {!userHovering && (
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            zIndex: 50,
            left: `${cursorPos.x}%`,
            top: `${cursorPos.y}%`,
            transition: "left 550ms cubic-bezier(0.4,0,0.2,1), top 550ms cubic-bezier(0.4,0,0.2,1)",
            transform: "translate(-4px, -4px)",
          }}
        >
          <FigmaCursorSvg clicking={clicking} />
          <div style={{
            background: "#5865f2",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 6,
            marginTop: 2,
            marginLeft: 14,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(88,101,242,0.5)",
          }}>
            {label}
          </div>
        </div>
      )}

      {/* The actual mockup — pointer events disabled when cursor is auto-demoing */}
      <div
        ref={containerRef}
        onMouseEnter={() => setUserHovering(true)}
        onMouseLeave={() => setUserHovering(false)}
        style={{
          background: "#18181b",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.85)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          userSelect: "none",
          cursor: userHovering ? "auto" : "none",
        }}
      >
        {/* Navbar */}
        <div style={{ background: "#09090b", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo.png" alt="Bookar" style={{ width: 26, height: 26, borderRadius: 7, objectFit: "cover" }} />
            <span style={{ color: "#fafafa", fontSize: 13, fontWeight: 700 }}>Bookar</span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 3, background: "#18181b", padding: 3, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}>
            {(["bookmarks","folders","connections"] as TabId[]).map(tab => {
              const isActive = tab === activeTab && (tab !== "folders" || !selectedFolder);
              const icons: Record<TabId, React.ReactNode> = {
                bookmarks: null,
                folders: <FolderIcon size={10} />,
                connections: <BotIcon size={10} />,
              };
              const labels: Record<TabId, string> = { bookmarks: "Bookmarks", folders: "Folders", connections: "AI & MCP" };
              return (
                <button key={tab}
                  onClick={() => { setState(prev => ({ ...prev, activeTab: tab, selectedFolder: null })); }}
                  style={{ border: "none", cursor: "pointer", fontSize: 11, color: isActive ? "#fafafa" : "#a1a1aa", background: isActive ? "rgba(255,255,255,0.1)" : "transparent", padding: "3px 9px", borderRadius: 6, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, transition: "all 150ms ease" }}
                >
                  {icons[tab]} {labels[tab]}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#09090b", padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>
            <PlusIcon size={12} /> Add
          </div>
        </div>

        {/* Toast */}
        {state.copiedBookmark && (
          <div style={{ background: "#10b981", color: "#09090b", fontSize: 11, fontWeight: 700, padding: "6px 14px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <CheckIcon size={13} /> Copied to clipboard!
          </div>
        )}

        {/* VIEW: Bookmarks */}
        {(activeTab === "bookmarks" || selectedFolder) && (
          <>
            <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 10 }}>
              {selectedFolder ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <span onClick={() => setState(prev => ({ ...prev, selectedFolder: null, activeTab: "folders" }))} style={{ color: "#a1a1aa", cursor: "pointer", textDecoration: "underline" }}>Folders</span>
                  <span style={{ color: "#52525b" }}>/</span>
                  <span style={{ fontWeight: 700, color: "#fafafa", display: "flex", alignItems: "center", gap: 4 }}><FolderIcon size={11} /> {selectedFolder}</span>
                  <span style={{ fontSize: 10, color: "#a1a1aa", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 8 }}>{displayedBookmarks.length}</span>
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#09090b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "5px 10px" }}>
                  <SearchIcon size={12} color="#a1a1aa" />
                  <span style={{ fontSize: 11, color: "#fafafa" }}>Search AI index...</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#a1a1aa", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 10 }}>5 saved</span>
                </div>
              )}
            </div>
            <div style={{ padding: "4px 12px 12px", minHeight: 200 }}>
              {displayedBookmarks.map(bm => {
                const isSel = state.inspectBookmark === bm.id;
                return (
                  <div key={bm.id} onClick={() => setState(prev => ({ ...prev, inspectBookmark: bm.id }))} style={{ padding: "8px 10px", borderRadius: 8, background: isSel ? "rgba(255,255,255,0.08)" : "transparent", border: `1px solid ${isSel ? "rgba(255,255,255,0.18)" : "transparent"}`, marginBottom: 4, cursor: "pointer", transition: "all 120ms ease" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: "#09090b", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <FaviconImage url={bm.domain} title={bm.title} size={32} imgSize={13} rounded="2px" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#fafafa", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bm.title}</div>
                        <div style={{ fontSize: 10, color: "#a1a1aa", display: "flex", gap: 6 }}><span>{bm.url}</span><span>•</span><span>{bm.time}</span></div>
                      </div>
                      <button onClick={(e) => handleShare(e, bm.title, bm.url)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "3px 7px", color: "#fafafa", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600 }}>
                        <Share2Icon size={11} /> Share
                      </button>
                    </div>
                    {isSel && (
                      <div className="fade-up" style={{ marginTop: 8, padding: "8px 10px", background: "#09090b", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", fontSize: 11, color: "#a1a1aa" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#fafafa", fontWeight: 600, marginBottom: 3 }}><SparklesIcon size={12} color="#10b981" /> AI Summary</div>
                        <p style={{ margin: 0, lineHeight: 1.5 }}>{bm.aiSummary}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* VIEW: Folders */}
        {activeTab === "folders" && !selectedFolder && (
          <div style={{ padding: 14, minHeight: 200 }}>
            <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 10 }}>Select a folder:</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {folders.map(f => (
                <div key={f.name} onClick={() => setState(prev => ({ ...prev, selectedFolder: f.name }))} style={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 150ms ease" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}><FolderIcon size={16} color="#fafafa" /></div>
                  <div>
                    <div style={{ fontSize: 12, color: "#fafafa", fontWeight: 700 }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: "#a1a1aa" }}>{f.count} bookmarks</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: Connections */}
        {activeTab === "connections" && (
          <div style={{ padding: 14, minHeight: 200 }}>
            <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 10 }}>Active MCP Connections:</div>
            {[
              { name: "Claude Desktop", domain: "claude.ai",          lastSync: "2m ago" },
              { name: "ChatGPT Plugin", domain: "chat.openai.com",    lastSync: "12m ago" },
              { name: "Cursor IDE",     domain: "cursor.com",         lastSync: "1h ago" },
            ].map(c => (
              <div key={c.name} style={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FaviconImage url={c.domain} title={c.name} size={32} imgSize={14} rounded="3px" />
                  <span style={{ fontSize: 12, color: "#fafafa", fontWeight: 600 }}>{c.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: "#a1a1aa" }}>{c.lastSync}</span>
                  <span style={{ fontSize: 10, color: "#10b981", background: "rgba(16,185,129,0.12)", padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>● Connected</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hover-to-explore hint */}
      {!userHovering && (
        <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, color: "#52525b", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#52525b" }} />
          Hover to explore yourself
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   EXTENSION MOCKUP
══════════════════════════════════════════════════════════════════ */
function ExtensionMockup() {
  return (
    <div style={{ width: 300, background: "#09090b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.8)", fontFamily: "var(--font-sans,system-ui,sans-serif)" }}>
      <div style={{ background: "#18181b", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo.png" alt="Bookar" width={24} height={24} style={{ borderRadius: 7, objectFit: "cover" }} />
          <div>
            <div style={{ color: "#fafafa", fontSize: 13, fontWeight: 700 }}>Bookar Sync</div>
            <div style={{ color: "#a1a1aa", fontSize: 10 }}>Synced knowledge everywhere</div>
          </div>
        </div>
        <span style={{ fontSize: 10, color: "#fafafa", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 5, background: "#10b981", borderRadius: "50%" }} />
          Ready
        </span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 2 }}>Connected Device</div>
          <div style={{ fontSize: 12, color: "#fafafa", fontWeight: 700 }}>Work Brave (Browser)</div>
          <div style={{ fontSize: 10, color: "#a1a1aa", marginTop: 4 }}>● Real-time bidirectional sync enabled</div>
        </div>
        <div style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, color: "#fafafa", fontWeight: 600, marginBottom: 6 }}>Save Current Page</div>
          <div style={{ background: "#09090b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 8px", fontSize: 11, color: "#a1a1aa", fontFamily: "monospace", marginBottom: 8 }}>https://paper.design</div>
          <div style={{ background: "#ffffff", color: "#09090b", borderRadius: 7, padding: "8px", textAlign: "center", fontSize: 11, fontWeight: 700 }}>+ Save Current Page to Bookar</div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MCP TOOL DOCK
══════════════════════════════════════════════════════════════════ */
const LEFT_TOOLS  = [
  { name: "Claude AI",    domain: "claude.ai" },
  { name: "ChatGPT",      domain: "chat.openai.com" },
  { name: "Cursor",       domain: "cursor.com" },
  { name: "Perplexity",   domain: "perplexity.ai" },
  { name: "Replit",       domain: "replit.com" },
];
const RIGHT_TOOLS = [
  { name: "Windsurf",     domain: "windsurf.com" },
  { name: "Continue",     domain: "continue.dev" },
  { name: "Ollama",       domain: "ollama.com" },
  { name: "GitHub Copilot", domain: "github.com" },
  { name: "Codeium",      domain: "codeium.com" },
];

function ToolIcon({ tool }: { tool: typeof LEFT_TOOLS[0] }) {
  return (
    <div title={tool.name} style={{ width: 58, height: 58, borderRadius: 16, background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
      <FaviconImage url={tool.domain} title={tool.name} size={128} imgSize={40} rounded="8px" />
    </div>
  );
}

function McpToolDock() {
  return (
    <div style={{ textAlign: "center", margin: "40px 0 0" }}>
      {/* Pill */}
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 16, backgroundImage: "radial-gradient(ellipse at 50% -10%,rgba(255,255,255,0.22) 0%,rgba(255,255,255,0.03) 65%),linear-gradient(180deg,#2c2c32 0%,#111114 100%)", borderRadius: 9999, padding: "16px 36px", boxShadow: "0 24px 64px rgba(0,0,0,0.95)", height: 106, overflow: "hidden", position: "relative", isolation: "isolate", clipPath: "inset(0 round 9999px)", WebkitClipPath: "inset(0 round 9999px)" }}>
        {/* Overlay border on top of icons */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 9999, border: "1.5px solid rgba(255,255,255,0.28)", boxShadow: "inset 0 0 20px rgba(0,0,0,0.85),inset 0 2px 2px rgba(255,255,255,0.4),inset 0 -2px 8px rgba(0,0,0,0.9)", pointerEvents: "none", zIndex: 20 }} />
        {/* Vignette left */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 36, background: "linear-gradient(90deg,rgba(17,17,20,0.9),transparent)", pointerEvents: "none", zIndex: 15 }} />
        {/* Vignette right */}
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 36, background: "linear-gradient(270deg,rgba(17,17,20,0.9),transparent)", pointerEvents: "none", zIndex: 15 }} />

        <div style={{ height: 106, overflow: "hidden", position: "relative", zIndex: 1 }}>
          <div className="marquee-up" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...LEFT_TOOLS, ...LEFT_TOOLS].map((t, i) => <ToolIcon key={i} tool={t} />)}
          </div>
        </div>

        <div style={{ width: 72, height: 72, borderRadius: 20, background: "#fafafa", border: "2px solid rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo.png" alt="Bookar" style={{ width: 64, height: 64, borderRadius: 17, objectFit: "cover" }} />
        </div>

        <div style={{ height: 106, overflow: "hidden", position: "relative", zIndex: 1 }}>
          <div className="marquee-down" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...RIGHT_TOOLS, ...RIGHT_TOOLS].map((t, i) => <ToolIcon key={i} tool={t} />)}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 14, color: L.muted, marginTop: 20, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
        connect your bookmarks &amp; saved knowledge with all your apps, agents, and repos, via MCP
      </p>
      <div style={{ marginTop: 24 }}>
        <a href="/api/extension-zip" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#ffffff", color: "#09090b", padding: "12px 28px", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 20px rgba(255,255,255,0.15)" }}>
          <DownloadIcon size={16} /> Download Extension for Chrome / Brave
        </a>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROADMAP  — "build log" timeline, not a card grid
══════════════════════════════════════════════════════════════════ */
const ROADMAP = [
  {
    num: "01", status: "SHIPPED", color: "#10b981",
    title: "Real-time browser sync engine",
    bullets: ["Chrome, Brave & Edge Manifest V3 extension", "6-digit instant device pairing", "Offline-first with background sync queue"],
  },
  {
    num: "02", status: "LIVE",    color: "#38bdf8",
    title: "On-demand AI summaries",
    bullets: ["Groq first, NVIDIA fallback", "Summary, tag, and folder suggestions", "Confirm before changing a bookmark folder"],
  },
  {
    num: "03", status: "LIVE", color: "#38bdf8",
    title: "MCP bookmark tools",
    bullets: ["15 tools for search, organization, and insights", "Connect Claude, ChatGPT, Cursor, and other MCP clients", "Web endpoint plus optional standalone server"],
  },
  {
    num: "04", status: "PLANNED", color: "#a855f7",
    title: "Mobile app + team workspaces",
    bullets: ["iOS & Android apps", "Team shared bookmark spaces", "API access for power users"],
  },
];

function RoadmapTimeline() {
  return (
    <div style={{ marginTop: 52, position: "relative" }}>
      {/* Vertical spine */}
      <div style={{ position: "absolute", left: 28, top: 0, bottom: 0, width: 1, background: "linear-gradient(to bottom,transparent,rgba(255,255,255,0.1) 10%,rgba(255,255,255,0.1) 90%,transparent)", pointerEvents: "none" }} />

      {ROADMAP.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 28, marginBottom: 40, position: "relative" }}>
          {/* Node */}
          <div style={{ flexShrink: 0, width: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${item.color}18`, border: `1.5px solid ${item.color}60`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
              {item.status === "SHIPPED" && <CheckIcon size={14} color={item.color} />}
              {item.status === "LIVE"    && <ZapIcon    size={14} color={item.color} />}
              {item.status === "BUILDING"&& <RocketIcon size={13} color={item.color} />}
              {item.status === "PLANNED" && <GlobeIcon  size={13} color={item.color} />}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: item.color, letterSpacing: "0.06em" }}>{item.status}</span>
          </div>

          {/* Content */}
          <div style={{ flex: 1, paddingTop: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: "clamp(34px,4vw,52px)", fontWeight: 900, letterSpacing: "-0.04em", color: `${item.color}1a`, lineHeight: 1, userSelect: "none" }}>{item.num}</span>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: L.text, letterSpacing: "-0.01em", margin: 0 }}>{item.title}</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {item.bullets.map((b, j) => (
                <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: `${item.color}80`, marginTop: 7, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: L.muted, lineHeight: 1.5 }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   GLASS FOOTER
══════════════════════════════════════════════════════════════════ */
function GlassFooter() {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 80, position: "relative", overflow: "hidden" }}>
      {/* Glass Brand Text */}
      <div style={{ textAlign: "center", padding: "48px 0 0", position: "relative", userSelect: "none", pointerEvents: "none" }}>
        <div
          className="footer-glass"
          style={{
            fontSize: "clamp(100px,16vw,220px)",
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 0.88,
            background: "linear-gradient(180deg,rgba(255,255,255,0.13) 0%,rgba(255,255,255,0.04) 55%,rgba(255,255,255,0.01) 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            position: "relative",
            display: "inline-block",
          }}
        >
          Bookar
        </div>
        {/* Reflection shimmer underline */}
        <div style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.12) 30%,rgba(255,255,255,0.06) 70%,transparent)", maxWidth: 600, margin: "-2px auto 0" }} />
      </div>

      {/* Footer links */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 40px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo.png" alt="Bookar" style={{ width: 20, height: 20, borderRadius: 6, objectFit: "cover" }} />
          <span style={{ fontSize: 13, color: L.text, fontWeight: 600 }}>Bookar</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {[{ label: "Docs", href: "/docs" },{ label: "Terms", href: "/terms" },{ label: "Dashboard", href: "/dashboard" },{ label: "Extension", href: "/api/extension-zip" }].map(l => (
            <Link key={l.label} href={l.href} style={{ fontSize: 12, color: L.muted, textDecoration: "none" }}>{l.label}</Link>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "#52525b", margin: 0 }}>© 2026 Bookar under REREAL. All rights reserved.</p>
      </div>
    </footer>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROOT LANDING PAGE
══════════════════════════════════════════════════════════════════ */
export function LandingPage() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then((res: any) => {
      if (res?.data?.session?.user) {
        window.location.href = "/dashboard";
      }
    });

    const { data: authData } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        window.location.href = "/dashboard";
      }
    });

    return () => {
      authData?.subscription?.unsubscribe();
    };
  }, []);

  return (
    <div style={{ background: L.bg, color: L.text, minHeight: "100vh", fontFamily: "var(--font-sans,system-ui,sans-serif)", position: "relative", overflowX: "hidden" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Subtle grid BG */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 700, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)", backgroundSize: "40px 40px", maskImage: "radial-gradient(ellipse at 50% 30%,black 20%,transparent 80%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 30%,black 20%,transparent 80%)" }} />
      <div style={{ position: "absolute", top: 100, left: "50%", transform: "translateX(-50%)", width: 600, height: 350, background: "radial-gradient(circle,rgba(255,255,255,0.07) 0%,transparent 70%)", filter: "blur(60px)", pointerEvents: "none" }} />

      {/* Nav */}
      <nav className="landing-nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(9,9,11,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "16px 32px" }}>
        <div className="landing-nav-inner" style={{ maxWidth: 1280, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="landing-brand-mark" src="/Logo.png" alt="Bookar" style={{ width: 36, height: 36, borderRadius: 9, objectFit: "cover" }} />
          <span className="landing-brand-name" style={{ fontWeight: 700, fontSize: 18, color: L.text }}>Bookar</span>
          <div style={{ flex: 1 }} />
          <Link href="/docs" className="desktop-only" style={{ fontSize: 15, color: L.muted, textDecoration: "none", padding: "8px 12px" }}>Docs</Link>
          <Link href="/terms" className="desktop-only" style={{ fontSize: 15, color: L.muted, textDecoration: "none", padding: "8px 12px" }}>Terms</Link>
          <Link href="/login" style={{ fontSize: 15, color: "#09090b", background: L.text, textDecoration: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 600 }}>Sign in</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero-section" style={{ padding: "112px 32px 26px", textAlign: "center", position: "relative" }}>
        <div className="hero-content" style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 20, padding: "7px 16px", marginBottom: 24 }}>
            <span className="pulse-dot" style={{ width: 8, height: 8, background: "#10b981", borderRadius: "50%" }} />
            <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700, letterSpacing: "0.08em" }}>BETA IS LIVE</span>
          </div>

          <h1 className="hero-h1" style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.03em", color: L.text, marginBottom: 22 }}>
            all your bookmarks,<br />
            <span style={{ color: L.muted }}>finally searchable</span>
          </h1>

          <p className="hero-copy" style={{ fontSize: 19, color: L.muted, lineHeight: 1.65, maxWidth: 720, margin: "0 auto 32px" }}>
            Bookar syncs your browser bookmarks and folder paths, lets you regenerate AI summaries on demand, and makes your library searchable and manageable through 14 MCP tools.
          </p>

          <div className="hero-actions" style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: L.text, color: "#09090b", padding: "14px 28px", borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
              Sign in with Google <ArrowRightIcon size={17} />
            </Link>
            <a href="/api/extension-zip" style={{ display: "inline-flex", alignItems: "center", gap: 9, background: L.accentDim, color: L.text, padding: "14px 28px", borderRadius: 10, fontWeight: 600, fontSize: 16, textDecoration: "none", border: "1px solid rgba(255,255,255,0.12)" }}>
              <DownloadIcon size={17} /> Download Extension
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 1: Dashboard — desktop interactive, mobile simplified */}
      <Section className="hero-following-section">
        {/* Desktop */}
        <div className="desktop-only" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 50, alignItems: "start", paddingTop: 24 }}>
          <div>
            <Eyebrow>The Dashboard</Eyebrow>
            <H2>all your tabs,<br />none of the chaos</H2>
            <Body>Your browser bookmarks land in one searchable library. Keep your folder structure, move links when you choose, and regenerate an AI summary whenever you need one.</Body>
            <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: L.text, textDecoration: "none", marginTop: 24, fontSize: 13, fontWeight: 600 }}>
              Try it free <ChevronRightIcon size={14} />
            </Link>
          </div>
          <InteractiveDashboard />
        </div>

        {/* Mobile — simplified pitch, no mockup */}
        <div className="mobile-only">
          <Eyebrow>The Dashboard</Eyebrow>
          <H2>all your tabs,<br />none of the chaos</H2>
          <Body style={{ marginBottom: 24 }}>Your browser bookmarks land in one searchable library. Keep your folders, move links when you choose, and regenerate AI summaries when you need them.</Body>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["Works in Chrome, Brave, and Edge","On-demand AI summaries and folder suggestions","Search bookmarks from Claude & ChatGPT"].map(f => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                <CheckIcon size={14} color="#10b981" />
                <span style={{ fontSize: 13, color: L.muted }}>{f}</span>
              </div>
            ))}
          </div>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: L.text, textDecoration: "none", marginTop: 24, fontSize: 13, fontWeight: 600 }}>
            Open dashboard <ChevronRightIcon size={14} />
          </Link>
        </div>
      </Section>

      {/* SECTION 2: Extension */}
      <AngledSection id="extension">
        <div className="grid-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 50, alignItems: "center" }}>
          <div className="desktop-only" style={{ display: "flex", justifyContent: "center" }}>
            <ExtensionMockup />
          </div>
          <div>
            <Eyebrow>The Extension</Eyebrow>
            <H2>every browser,<br />one place</H2>
            <Body>Install the Bookar extension in Chrome, Brave, or Edge and link it with a 6-digit code. Existing bookmarks are imported once; browser changes and Bookar additions sync across your linked devices.</Body>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
              {["One 6-digit code to link a browser","Browser changes and Bookar additions sync","Failed syncs retry in the background"].map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckIcon size={14} color="#10b981" />
                  <span style={{ fontSize: 13, color: L.muted }}>{f}</span>
                </div>
              ))}
            </div>
            <a href="/api/extension-zip" className="mobile-only" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: L.text, color: "#09090b", padding: "11px 22px", borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: "none", marginTop: 24 }}>
              <DownloadIcon size={14} /> Download Extension
            </a>
          </div>
        </div>
      </AngledSection>

      {/* SECTION 3: MCP Dock */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Eyebrow>Connects to your AI tools</Eyebrow>
          <h2 style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 700, color: L.text, lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 16, textAlign: "center" }}>
            your bookmarks,<br />searchable by AI
          </h2>
        </div>
        <McpToolDock />
      </Section>

      {/* SECTION 4: Roadmap timeline */}
      <AngledSection id="roadmap">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 60, alignItems: "start" }} className="grid-two-col">
          <div style={{ position: "sticky", top: 120 }}>
            <Eyebrow>What&apos;s coming</Eyebrow>
            <H2>built in public,<br />shipping fast</H2>
            <Body>Every week Bookar ships. This is our live build log — from shipped features to what&apos;s in active development right now.</Body>
          </div>
          <RoadmapTimeline />
        </div>
      </AngledSection>

      <GlassFooter />
    </div>
  );
}
