"use client";
// app/terms/page.tsx
// Terms & Conditions page — specific to what Bookar actually does.

import Link from "next/link";

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 48, scrollMarginTop: 80 }}>
      <h2 style={{
        fontSize: 18,
        fontWeight: 700,
        color: "var(--bk-text-primary)",
        letterSpacing: "-0.01em",
        marginBottom: 16,
        paddingBottom: 10,
        borderBottom: "1px solid var(--bk-border)",
      }}>{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--bk-text-muted)", marginBottom: 14 }}>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 14, color: "var(--bk-text-muted)", lineHeight: 1.7, marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  );
}

const LAST_UPDATED = "July 27, 2025";

export default function TermsPage() {
  return (
    <div style={{ background: "var(--bk-bg)", minHeight: "100vh" }}>
      {/* Top nav */}
      <header style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "rgba(9,9,11,0.88)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--bk-border)",
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto", height: 56, display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo.png" alt="Bookar" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--bk-text-primary)" }}>Bookar</span>
          </Link>
          <span style={{ color: "var(--bk-border)", fontSize: 16, fontWeight: 200 }}>/</span>
          <span style={{ fontSize: 13, color: "var(--bk-text-muted)", fontWeight: 500 }}>Terms & Conditions</span>
          <div style={{ flex: 1 }} />
          <Link href="/docs" style={{ fontSize: 12, color: "var(--bk-text-muted)", textDecoration: "none" }}>Docs</Link>
          <Link href="/dashboard" style={{ fontSize: 12, color: "var(--bk-text-muted)", textDecoration: "none" }}>Dashboard →</Link>
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "56px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <h1 style={{
            fontSize: 36,
            fontWeight: 700,
            color: "var(--bk-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: 10,
          }}>
            Terms & Conditions
          </h1>
          <p style={{ fontSize: 13, color: "var(--bk-text-muted)" }}>Last updated: {LAST_UPDATED}</p>
          <p style={{ fontSize: 14, color: "var(--bk-text-muted)", marginTop: 16, lineHeight: 1.7, maxWidth: 620 }}>
            These terms explain how Bookar works, what data we collect, and what you agree to by using the service. We&apos;ve written this specifically for what Bookar actually does — not a generic template.
          </p>
        </div>

        <Section title="1. What Bookar does" id="what-bookar-does">
          <P>
            Bookar is a personal bookmark synchronization and AI enrichment service. When you install the Bookar browser extension and link it to your account, the extension sends your browser bookmarks to Bookar&apos;s backend. Bookar stores these bookmarks in a database scoped to your account and optionally generates AI-written descriptions of each page using a third-party language model API.
          </P>
          <P>
            Bookar also runs an MCP (Model Context Protocol) server that allows you to connect AI tools like Claude and ChatGPT to your bookmark collection using API keys you control.
          </P>
        </Section>

        <Section title="2. What data we collect" id="data-collected">
          <P>By using Bookar, we collect and store:</P>
          <Ul items={[
            "Your Google account email address and display name, obtained via Google Sign-In (OAuth 2.0). We do not store your Google password.",
            "Bookmark data you sync through the extension: page URL, page title, folder path, and the timestamp when the bookmark was added.",
            "Browser metadata: the name and type of the browser used for each sync session (e.g. 'Chrome', 'Brave'), and a device name you choose when linking.",
            "API keys: if you generate a Bookar API key from the Connections page, a cryptographic hash of that key is stored. The raw key is shown to you once and not retained.",
            "AI-generated descriptions: when a bookmark is added, we send the page URL and title to NVIDIA's NIM API and store the returned description in your account.",
          ]} />
          <P>
            We do not collect your browser history, your browsing activity beyond explicitly bookmarked pages, the contents of web pages, or any payment information (Bookar is free).
          </P>
        </Section>

        <Section title="3. How AI descriptions are processed" id="ai-descriptions">
          <P>
            When a bookmark is created, Bookar sends the page URL and title to the <strong style={{ color: "var(--bk-text-primary)" }}>NVIDIA NIM API</strong> (specifically the <code style={{ fontSize: 12, color: "var(--bk-text-primary)", background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 4 }}>meta/llama-3.1-8b-instruct</code> model). NVIDIA&apos;s data handling and privacy practices apply to this request and are governed by NVIDIA&apos;s terms of service.
          </P>
          <P>
            We do not send any content from your bookmarked pages beyond the URL and title. The AI-generated description is stored on your account and is only visible to you (and any AI tools you connect with your own API key).
          </P>
        </Section>

        <Section title="4. Third-party AI access via API keys" id="api-key-access">
          <P>
            From the Connections & AI page, you can generate a Bookar API key (<code style={{ fontSize: 12, color: "var(--bk-text-primary)", background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: 4 }}>bk_live_...</code>). This key grants access to your bookmarks via Bookar&apos;s MCP server.
          </P>
          <P>
            <strong style={{ color: "var(--bk-text-primary)" }}>You are responsible for your API key.</strong> If you add this key to Claude Desktop, ChatGPT, Cursor, or any other MCP-compatible tool, that tool will have the ability to read and search your bookmarks. Bookar does not control what AI tools do with the bookmark data they retrieve.
          </P>
          <P>
            You can revoke access at any time by deleting the API key from the Connections page. Deleting a key immediately invalidates it.
          </P>
        </Section>

        <Section title="5. Data storage & security" id="data-storage">
          <P>
            Your data is stored in a Supabase PostgreSQL database. Row-level security (RLS) policies on the database ensure that API requests can only access data belonging to the authenticated user or matching the API key&apos;s associated account.
          </P>
          <P>
            All data in transit is encrypted via TLS. We do not encrypt bookmark data at rest beyond the protections provided by Supabase&apos;s infrastructure.
          </P>
          <P>
            We do not sell, share, or transfer your bookmark data to any third party beyond the AI description service described above.
          </P>
        </Section>

        <Section title="6. Your rights" id="your-rights">
          <P>You have the right to:</P>
          <Ul items={[
            "Delete all your data at any time using the Factory Reset option in Settings. This permanently removes all your bookmarks and device connections from our database.",
            "Disconnect any browser device from the Connections page, which stops future sync from that device.",
            "Revoke AI access by deleting API keys from the Connections page.",
            "Export your data — your bookmarks can be searched and copied from the dashboard at any time. Bulk export is on the roadmap.",
            "Request account deletion by contacting us at the email below.",
          ]} />
        </Section>

        <Section title="7. Data retention" id="data-retention">
          <P>
            Your data is retained as long as your account exists. If you perform a Factory Reset, your bookmark and device data is permanently deleted immediately. Your Google account authentication record may persist in Supabase Auth for a brief period after deletion; you can contact us to request complete removal.
          </P>
          <P>
            We do not retain backups of your personal bookmark data beyond what Supabase&apos;s standard backup infrastructure maintains.
          </P>
        </Section>

        <Section title="8. Service availability & liability" id="liability">
          <P>
            Bookar is provided as-is, without warranty of any kind. We make no guarantee of uptime, data durability, or AI description quality. Bookmark data could be lost in the event of a catastrophic infrastructure failure; we recommend not relying on Bookar as your sole bookmark backup.
          </P>
          <P>
            We are not liable for any loss of data, loss of access, or any consequential damages arising from your use of Bookar.
          </P>
          <P>
            We reserve the right to modify, suspend, or discontinue the service at any time with reasonable notice. If we discontinue the service, we will provide at least 30 days notice so you can export your data.
          </P>
        </Section>

        <Section title="9. Changes to these terms" id="changes">
          <P>
            If we make material changes to these terms, we will update the &quot;Last updated&quot; date at the top of this page and may send a notification to your account email. Continued use of Bookar after changes are posted constitutes acceptance.
          </P>
        </Section>

        <Section title="10. Contact" id="contact">
          <P>
            Questions about these terms or requests for data deletion can be sent to:{" "}
            <a href="mailto:hello@bookar.app" style={{ color: "var(--bk-text-primary)", textDecoration: "underline" }}>
              hello@bookar.app
            </a>
          </P>
          <P>
            For technical issues or bug reports, see our <Link href="/docs#troubleshooting" style={{ color: "var(--bk-text-primary)", textDecoration: "underline" }}>troubleshooting guide</Link>.
          </P>
        </Section>
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--bk-border)",
        padding: "24px",
        display: "flex",
        justifyContent: "center",
        gap: 32,
      }}>
        {[
          { label: "Home", href: "/" },
          { label: "Docs", href: "/docs" },
          { label: "Dashboard", href: "/dashboard" },
        ].map(l => (
          <Link key={l.label} href={l.href} style={{ fontSize: 12, color: "var(--bk-text-muted)", textDecoration: "none" }}>
            {l.label}
          </Link>
        ))}
      </footer>
    </div>
  );
}
