"use client";
// app/docs/page.tsx
// Docs page — sidebar + content layout. Real explanatory content about Bookar.

import Link from "next/link";

const NAV = [
  { id: "what-is-bookar", label: "What is Bookar?" },
  { id: "browser-extension", label: "Browser Extension" },
  { id: "dashboard", label: "Using the Dashboard" },
  { id: "ai-descriptions", label: "AI Descriptions" },
  { id: "connect-claude", label: "Connecting Claude" },
  { id: "connect-chatgpt", label: "Connecting ChatGPT" },
  { id: "mcp-tools", label: "MCP & Other Tools" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

function Heading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} style={{
      fontSize: 22,
      fontWeight: 700,
      color: "var(--bk-text-primary)",
      letterSpacing: "-0.01em",
      marginBottom: 12,
      marginTop: 48,
      scrollMarginTop: 80,
    }}>{children}</h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, lineHeight: 1.75, color: "var(--bk-text-muted)", marginBottom: 16 }}>{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: "var(--font-geist-mono, monospace)",
      fontSize: 12,
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 4,
      padding: "1px 6px",
      color: "var(--bk-text-primary)",
    }}>{children}</code>
  );
}

function CodeBlock({ children, lang }: { children: string; lang?: string }) {
  return (
    <pre style={{
      background: "#18181b",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10,
      padding: "16px 18px",
      fontFamily: "var(--font-geist-mono, monospace)",
      fontSize: 12,
      lineHeight: 1.7,
      color: "#e4e4e7",
      overflowX: "auto",
      marginBottom: 20,
    }}>
      <code data-language={lang}>{children}</code>
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderLeft: "3px solid rgba(255,255,255,0.4)",
      borderRadius: "0 8px 8px 0",
      padding: "12px 16px",
      marginBottom: 20,
      fontSize: 13,
      color: "var(--bk-text-muted)",
      lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

export default function DocsPage() {
  return (
    <div style={{ background: "var(--bk-bg)", minHeight: "100vh" }}>
      {/* Top nav */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(9,9,11,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--bk-border)",
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 56, display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo.png" alt="Bookar" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--bk-text-primary)" }}>Bookar</span>
          </Link>
          <span style={{ color: "var(--bk-border)", fontSize: 16, fontWeight: 200 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--bk-text-muted)", fontWeight: 500 }}>Docs</span>
          <div style={{ flex: 1 }} />
          <Link href="/dashboard" style={{ fontSize: 12, color: "var(--bk-text-muted)", textDecoration: "none" }}>Dashboard →</Link>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: "220px 1fr", gap: 64 }}>
        {/* Sidebar */}
        <aside style={{ position: "sticky", top: 80, height: "fit-content" }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--bk-text-muted)", marginBottom: 12 }}>On this page</p>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map(item => (
              <a key={item.id} href={`#${item.id}`} style={{
                fontSize: 13,
                color: "var(--bk-text-muted)",
                textDecoration: "none",
                padding: "5px 10px",
                borderRadius: 6,
                lineHeight: 1.4,
                display: "block",
                transition: "color 150ms ease, background 150ms ease",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--bk-text-primary)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--bk-text-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--bk-border)" }}>
            <Link href="/terms" style={{ fontSize: 12, color: "var(--bk-text-muted)", textDecoration: "none", display: "block", padding: "4px 10px" }}>Terms & Conditions</Link>
            <a href="/api/extension-zip" style={{ fontSize: 12, color: "var(--bk-text-muted)", textDecoration: "none", display: "block", padding: "4px 10px" }}>Download Extension</a>
          </div>
        </aside>

        {/* Content */}
        <main style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--bk-text-primary)", letterSpacing: "-0.02em", marginBottom: 8 }}>Documentation</h1>
          <p style={{ fontSize: 15, color: "var(--bk-text-muted)", marginBottom: 48, lineHeight: 1.6 }}>
            Everything you need to know about Bookar — from installing the extension to connecting your AI tools.
          </p>

          <Heading id="what-is-bookar">What is Bookar?</Heading>
          <P>
            Bookar syncs bookmarks from Chrome, Brave, and Edge into your personal Supabase library. Use the dashboard to search and organize them, regenerate AI summaries when needed, and connect AI clients through the 14-tool MCP endpoint at <Code>/api/mcp</Code>. A standalone MCP server is also available for separate deployment.
          </P>
          <P>
            Existing browser bookmarks are imported when you link the extension. New bookmarks keep their browser folder paths; when a new bookmark arrives in a generic browser folder, Bookar can use your saved bookmark patterns to suggest a matching folder.
          </P>
          <Note>
            AI summaries are generated on demand from a bookmark&apos;s menu or from Settings. They are not automatically generated for every synced bookmark.
          </Note>

          <Heading id="browser-extension">Browser Extension</Heading>
          <P>
            The Bookar browser extension runs as a Manifest V3 service worker in Chromium-based browsers (Chrome, Brave, Edge). It listens to your browser&apos;s bookmark events and syncs any changes to your Bookar account in real time.
          </P>

          <P><strong style={{ color: "var(--bk-text-primary)" }}>Installing the extension (Load Unpacked)</strong></P>
          <ol style={{ paddingLeft: 20, marginBottom: 20 }}>
            {[
              "Download the extension ZIP from Connections & AI or use the download link on this page.",
              "Unzip the file to a folder on your computer.",
              "Open Chrome/Brave/Edge and go to chrome://extensions.",
              "Enable Developer Mode (top-right toggle).",
              "Click Load unpacked and select the unzipped folder.",
              "The Bookar icon will appear in your toolbar.",
            ].map((step, i) => (
              <li key={i} style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}>{step}</li>
            ))}
          </ol>

          <P><strong style={{ color: "var(--bk-text-primary)" }}>Linking your browser</strong></P>
          <P>
            Once the extension is installed, open your <Link href="/dashboard/connections" style={{ color: "var(--bk-text-primary)" }}>Bookar Dashboard → Connections & AI</Link>. You&apos;ll see a 6-digit linking code. Click the Bookar extension icon, enter the code, give your device a name (e.g. <Code>Work Laptop</Code>), and click <strong>Link Device</strong>.
          </P>
          <P>
            After linking, the extension performs a one-time backfill of your existing browser bookmarks. Matching URLs already saved in Bookar are not overwritten during backfill. Later browser additions, edits, moves, and deletions sync to Bookar; bookmarks added in Bookar can also sync to the linked browser.
          </P>

          <Heading id="dashboard">Using the Dashboard</Heading>
          <P>
            The dashboard at <Code>/dashboard</Code> is the main interface for viewing, searching, organizing, and managing your bookmarks.
          </P>
          <P>
            Key features:
          </P>
          <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
            {[
              "Search — filters bookmarks by title, URL, description, and folder path",
              "Folders — open nested folder paths such as Work/Design/Inspiration; the URL updates and browser Back returns to the folder list",
              "Move — select one or more bookmarks, choose Move, then select an existing folder or create a destination folder",
              "Drag and drop — move bookmarks directly onto a folder card",
              "Share selected — copies a formatted list of selected bookmarks to your clipboard",
              "Quick add — add a bookmark from the header and choose its destination folder",
            ].map((item, i) => (
              <li key={i} style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}>{item}</li>
            ))}
          </ul>

          <Heading id="ai-descriptions">AI Descriptions</Heading>
          <P>
            Use <strong style={{ color: "var(--bk-text-primary)" }}>Regenerate Summary</strong> from a bookmark&apos;s menu to refresh its description, tags, and folder suggestion. From Settings, you can regenerate descriptions for the whole library. Bookar tries Groq first and NVIDIA as a fallback when the corresponding provider keys are configured.
          </P>
          <P>
            A single-bookmark regeneration keeps the current folder while it creates the new summary. If the result suggests another folder, Bookar asks before moving the bookmark. If neither provider can produce a summary, the existing description is retained; a new bookmark can remain without one until regeneration succeeds.
          </P>
          <Note>
            Configure at least one of <Code>GROQ_API_KEY</Code> or <Code>NVIDIA_API_KEY</Code> on the web server for provider-generated summaries. See <Link href="/docs#troubleshooting" style={{ color: "var(--bk-text-primary)" }}>Troubleshooting</Link> if regeneration fails.
          </Note>

          <Heading id="connect-claude">Connecting Claude</Heading>
          <P>
            Bookar exposes a Model Context Protocol (MCP) server at <Code>/api/mcp</Code>. To connect Claude Desktop or Claude Code:
          </P>
          <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}>Go to your <Link href="/dashboard/connections" style={{ color: "var(--bk-text-primary)" }}>Bookar → Connections & AI</Link> and generate an API Key.</li>
            <li style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}>Copy the key (starts with <Code>bk_live_...</Code>).</li>
            <li style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}>Open your <Code>claude_desktop_config.json</Code> file and add:</li>
          </ol>
          <CodeBlock lang="json">{`{
  "mcpServers": {
    "bookar": {
      "type": "http",
      "url": "https://YOUR-BOOKAR-DOMAIN/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_BOOKAR_API_KEY"
      }
    }
  }
}`}</CodeBlock>
          <P>Restart Claude Desktop. You can now ask Claude things like: <em>&quot;What design tools did I bookmark last month?&quot;</em> or <em>&quot;Find my bookmarks about React performance.&quot;</em></P>

          <Heading id="connect-chatgpt">Connecting ChatGPT</Heading>
          <P>
            Generate an API key on the Connections & AI page, then copy the ChatGPT Connector URL shown there. The URL includes the key as an <Code>api_key</Code> query parameter.
          </P>
          <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
            {[
              "Open ChatGPT → Settings → Developer Mode → Enable.",
              "Go to Connectors → Create Connector.",
              "Paste the Connector URL copied from Bookar Connections & AI.",
              "Set Authentication to No Auth (or None); the URL already includes the key.",
              "Save and start a new conversation. You can now ask ChatGPT to search your bookmarks.",
            ].map((step, i) => (
              <li key={i} style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}>{step}</li>
            ))}
          </ol>

          <Heading id="mcp-tools">MCP & Other Tools</Heading>
          <P>
            Any tool that supports the MCP protocol can connect to Bookar, including Claude, Cursor, Windsurf, and custom MCP clients. Use the endpoint shown on Connections & AI (usually <Code>https://YOUR-BOOKAR-DOMAIN/api/mcp</Code>) and authenticate with the API key using a Bearer header. The ChatGPT URL is a special case that carries the key in its query string.
          </P>
          <P>
            The MCP server exposes these tools to your AI:
          </P>
          <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
            {[
              "save_bookmark — save a URL with an optional title, notes, folder, and tags",
              "get_bookmark — fetch a bookmark by ID",
              "update_bookmark — edit a bookmark's title, notes, folder, or tags",
              "delete_bookmark — move a bookmark to trash",
              "restore_bookmark — restore a trashed bookmark",
              "archive_bookmark — move a bookmark to the _archive folder",
              "find — search bookmarks by query, folder, tag, or saved date",
              "list_by_folder — list a folder or summarize top-level folders",
              "get_tags — list tags and usage counts",
              "workspace_stats — summarize library, folder, tag, and duplicate counts",
              "find_duplicates — find bookmarks with matching or similar URLs",
              "analyse_topic — group and summarize bookmarks related to a topic",
              "context_pack — gather a topic-focused reading pack from your library",
              "bulk_tag — apply a tag to bookmarks matching a keyword",
            ].map((t, i) => (
              <li key={i} style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}><Code>{t.split(" — ")[0]}</Code> — {t.split(" — ")[1]}</li>
            ))}
          </ul>

          <Heading id="troubleshooting">Troubleshooting</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40 }}>
            {[
              {
                q: "Bookmarks aren't syncing from my browser",
                a: "Make sure the extension is linked — open the extension popup and check that it shows 'Connected Device'. If it shows the unlinked state, re-enter your 6-digit code from the Connections page.",
              },
              {
                q: "AI descriptions are stuck on 'Generating…'",
                a: "Check that at least one provider key, GROQ_API_KEY or NVIDIA_API_KEY, is set in the web app environment. Groq is tried first when configured, followed by NVIDIA.",
              },
              {
                q: "Claude / ChatGPT can't find my bookmarks",
                a: "Double-check that your API key in the MCP config matches one from the Connections page (not a deleted key). Also confirm the URL ends with /api/mcp. If the key was regenerated, update it in your config.",
              },
              {
                q: "The extension was linked but my old bookmarks didn't appear",
                a: "The initial backfill runs once per extension profile. Confirm the extension is connected and its API_BASE points to this Bookar web app. Backfill skips URLs already in Bookar to preserve their saved data.",
              },
              {
                q: "I deleted a bookmark in Chrome but it's still in Bookar",
                a: "Deletion events are synced. If the bookmark still appears, try refreshing the dashboard. If it persists, delete it manually from the dashboard.",
              },
            ].map((item, i) => (
              <div key={i} style={{
                background: "#18181b",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: "16px 18px",
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--bk-text-primary)", marginBottom: 6 }}>{item.q}</p>
                <p style={{ fontSize: 13, color: "var(--bk-text-muted)", lineHeight: 1.65 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
