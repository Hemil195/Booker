# Bookar — Complete Build Specification

> Cross-browser bookmark sync platform that auto-describes bookmarks via LLM and exposes them to AI bots (Claude via MCP, ChatGPT via REST/OpenAPI) so they can suggest tools from the user's own saved bookmarks.

Personal project first, free forever unless it gets real traction. Part of the [[rereal-ecosystem]].

---

## 1. Product Summary (give this to Antigravity as context)

Bookar lets a user sign in with Google, install a lightweight browser extension, and have every bookmark they create/edit/delete synced in real time to a central database. Each bookmark gets an auto-generated one-line description via an LLM call. The dashboard shows all bookmarks across every connected browser/device, organized by folder, tagged, searchable. Separately, an MCP server (for Claude) and a REST/OpenAPI layer (for ChatGPT and other bots) let any AI assistant query "what tools does this user have saved" and make real suggestions instead of generic ones.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend/Website | Next.js (App Router), hosted on Vercel | Fast, matches existing REREAL stack |
| Auth | Supabase Auth, Google provider ONLY | No password flow needed |
| Database | Supabase (Postgres) | Full-text search, RLS, realtime, Edge Functions all built in |
| Backend logic | Supabase Edge Functions | Runs the "fetch page → generate description" step |
| LLM | NVIDIA NIM free-tier API (pick a small/fast model — e.g. a Llama or Mistral instruct model available on build.nvidia.com) | Free, good enough for one-line descriptions |
| Browser Extension | Manifest V3, vanilla JS | Works on all Chromium browsers (Brave, Chrome, Edge) with zero changes |
| Bot integration — Claude | MCP server, Node, hosted on Vercel (separate deployment from the website) | Native Claude/Anthropic tool protocol |
| Bot integration — ChatGPT/others | REST API + OpenAPI 3.1 schema, same backend as MCP server | ChatGPT Custom GPT Actions and any REST-capable tool can use it |
| Styling | Tailwind + shadcn/ui | Fast to make it look good, matches [[rereal-ecosystem]] direction |

---

## 3. Database Schema (Supabase / Postgres)

```sql
-- users table is handled by Supabase Auth automatically (auth.users)

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  device_name text not null,       -- e.g. "Vicky's Laptop"
  browser text not null,           -- e.g. "Brave", "Chrome", "Edge"
  linking_code text,               -- temporary 6-digit code for pairing
  api_key text unique,             -- long-lived key the extension uses after linking
  created_at timestamptz default now(),
  last_synced_at timestamptz
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  device_id uuid references public.devices(id) not null,
  url text not null,
  title text,
  description text,               -- LLM-generated
  tags text[] default '{}',
  folder_path text,               -- e.g. "Work/Design Tools"
  browser_bookmark_id text,       -- original ID from chrome.bookmarks API, for update/delete matching
  source text default 'browser',  -- 'browser' or 'bot' — set to 'bot' when added via MCP/REST add_bookmark
  description_pending boolean default false, -- true if LLM call failed/rate-limited, for retry
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz          -- soft delete
);

create index bookmarks_user_id_idx on public.bookmarks(user_id);
create index bookmarks_search_idx on public.bookmarks using gin(to_tsvector('english', title || ' ' || coalesce(description, '')));

-- Row Level Security
alter table public.bookmarks enable row level security;
alter table public.devices enable row level security;

create policy "Users can only see their own bookmarks"
  on public.bookmarks for all
  using (auth.uid() = user_id);

create policy "Users can only see their own devices"
  on public.devices for all
  using (auth.uid() = user_id);
```

Note: schema uses soft-delete (`deleted_at`) rather than hard delete — recommended so bots can still reference "recently removed" context and nothing is lost by accident. The dashboard/extension should treat `deleted_at IS NOT NULL` as "hidden" everywhere. If true hard-delete is preferred instead, drop the column and use a real `DELETE` — flag this decision explicitly to Antigravity so it doesn't silently pick one.

---

## 4. Auth & Device Linking Flow (fixes the "disconnects every 5 hours" problem)

**Confirmed root cause (diagnosed directly from the resume builder's codebase, not a guess):** its OAuth access tokens (`rr_at_*`) expire after exactly 1 hour (`src/app/(main-app)/oauth/token/route.ts`). A 30-day refresh token is issued alongside it and a working `/oauth/token` refresh-grant endpoint exists — but nothing on the client side ever calls it. When the access token expires, `authenticateOAuthToken()` (`src/lib/mcp/auth.ts`) simply returns `null`, the MCP endpoint (`src/app/api/mcp/route.ts`) returns a 401, and the connection just dies with no self-healing step. This is a missing-refresh-call bug, not a fundamentally broken auth design — but it means the resume builder's OAuth pattern must NOT be copied into Bookar as-is.

**Bookar avoids this entire bug class structurally, not by patching a refresh cycle:** no OAuth access/refresh token pair is used for bot connections at all. Instead, a single long-lived, non-expiring API key (random string, hashed at rest) is issued once and never needs refreshing — see the flow below. There is nothing to expire, so there is nothing to forget to refresh.

**Bookar's approach — avoid the problem structurally:**

1. User signs in on the website via Google (Supabase Auth session — normal web session, refreshes automatically in-browser, not a concern).
2. Website dashboard, when no device is connected, shows a **6-digit linking code** (like pairing a smart TV), generated server-side, expires in 10 minutes, stored in `devices.linking_code`.
3. User installs the extension, pastes the code into the extension popup.
4. Extension sends the code to a `/api/link-device` endpoint. Server verifies the code, creates a `devices` row, generates a **long-lived random API key** (not a JWT — a plain random string, e.g. `crypto.randomBytes(32).toString('hex')`), stores it hashed in the DB, returns the raw key to the extension ONCE.
5. Extension stores that API key locally (`chrome.storage.local`) and sends it as a header (`Authorization: Bearer <key>`) on every sync request from then on.
6. Server validates incoming requests by looking up the hashed key — **no expiry, no refresh cycle, nothing to silently die**. If the user wants to revoke a device, they delete it from the dashboard, which invalidates the key immediately.
7. Same pattern for the MCP server and REST API used by bots: the user generates a long-lived API key from the dashboard ("Connect to Claude" button → shows the key + setup instructions), pastes it into their Claude Desktop MCP config or ChatGPT Custom GPT Action auth field. No OAuth dance, no expiry — same as how most working MCP integrations (Notion, Linear, etc.) actually do it in practice.

This avoids the entire class of bug that hit the resume builder: **no token needs silent background refreshing anywhere in this system.**

---

## 5. Extension (Manifest V3)

### File structure
```
/extension
  manifest.json
  background.js       -- service worker, listens to bookmarks API
  popup.html           -- linking code entry UI
  popup.js
  icons/
```

### manifest.json (key parts)
```json
{
  "manifest_version": 3,
  "name": "Bookar Sync",
  "version": "1.0.0",
  "permissions": ["bookmarks", "storage"],
  "host_permissions": ["https://<your-vercel-domain>/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" }
}
```

### background.js logic
- On `chrome.bookmarks.onCreated` → POST to `/api/sync-bookmark` with `{ event: 'created', url, title, folder_path, browser_bookmark_id }`
- On `chrome.bookmarks.onChanged` → POST with `{ event: 'updated', ... }`
- On `chrome.bookmarks.onRemoved` → POST with `{ event: 'deleted', browser_bookmark_id }`
- On extension install/first link → call `chrome.bookmarks.getTree()` to backfill ALL existing bookmarks, POST each one (batch endpoint recommended: `/api/sync-bookmark-batch`)
- Detect browser name via `navigator.userAgent` parsing (Brave has a quirk: it reports as Chrome in UA string, but `navigator.brave` object exists and can be checked with `await navigator.brave?.isBrave()` — use this to correctly label "Brave" vs generic "Chrome")

### Distribution for v1
- Zipped folder, NOT published to Chrome Web Store yet (avoids the $5 fee for now)
- User loads via `chrome://extensions` → Developer Mode → Load Unpacked
- Dashboard should include clear step-by-step screenshots/instructions for this, since it's the one part of the flow that looks "unofficial"

---

## 6. Edge Function: `ingest-bookmark`

Triggered by `/api/sync-bookmark`. Steps:
1. Validate the device's API key (see Auth flow above)
2. On `created`/`updated` events: fetch the page's `<title>` and `<meta name="description">` / `og:description` tags only (NOT full page content — cheaper, faster, avoids most paywalls/bot-blocks)
3. Call NVIDIA NIM API with a short prompt: *"Given this page title and meta description, write one concise sentence describing what this tool/page is and when someone would use it. Also suggest 2-4 short tags."*
4. Parse the response, upsert into `bookmarks` table (match on `browser_bookmark_id` + `device_id` for updates)
5. On `deleted` event: set `deleted_at = now()` (or hard-delete, per the decision in section 3)

---

## 7. MCP Server (for Claude and ChatGPT)

Separate small Node service, deployed on Vercel as its own project (or a route group within the same repo — Antigravity's choice, but keep it logically separate from the website's user-facing routes).

**Transport:** Streamable HTTP — not SSE. SSE is deprecated across MCP clients and must not be used. The server must be reachable over public HTTPS.

**Tools to expose:**
- `search_bookmarks(query: string)` → full-text search against the `bookmarks` table, returns `title, url, description, tags, folder_path`
- `list_recent_bookmarks(limit: number)` → most recently added, useful for "what have I been saving lately"
- `add_bookmark(url, title, notes)` → bots can add a bookmark directly; mark it with `source = 'bot'` in the DB (add this column to the schema in section 3) so the dashboard and extension can visually distinguish bot-added entries from browser-synced ones

**Auth:** long-lived API key (from section 4), sent as `Authorization: Bearer <api_key>` on every MCP request. Same non-expiring key used by both Claude and ChatGPT — one auth system, all consumers.

**Client setup:**
- **Claude Desktop / Claude Code:** add a `bookar` entry to `claude_desktop_config.json`, pointing at the MCP server URL with the API key.
- **ChatGPT (Plus/Pro/Business/Enterprise only):** Settings → Developer Mode → Connectors → Create → paste the Server URL, choose Authentication mode: API key, paste the same key. *Note: ChatGPT's remote MCP connector feature requires a paid plan with Developer Mode enabled — this is a ChatGPT-side requirement, not a Bookar limitation.*
- **Other MCP clients** (Cursor, Windsurf, Claude Code in headless mode, etc.): same Streamable HTTP URL + API key header.

---

## 8. REST API + OpenAPI schema (fallback for non-MCP tools)

The MCP server is the primary integration for all AI tools that support it (Claude, ChatGPT with Developer Mode, and any other MCP-capable client). The REST API exists as a fallback for tools that do not support MCP natively.

Same underlying queries as the MCP server, exposed as plain REST endpoints:
- `GET /api/v1/bookmarks/search?q=...`
- `GET /api/v1/bookmarks/recent?limit=...`
- `POST /api/v1/bookmarks` (bots add a bookmark, same `source = 'bot'` tagging as the MCP tool)

Ship an `openapi.yaml` describing these endpoints. Use cases for the REST/OpenAPI layer:
- **Zapier / Make / n8n**: plain REST + OpenAPI spec is exactly what these tools expect for a custom app connection — same `openapi.yaml`, same auth header.
- **Microsoft Copilot Studio** and **Gemini Extensions**: support OpenAPI-based custom connectors; import `openapi.yaml` directly.
- **Older ChatGPT Custom GPT Actions** (pre-Developer Mode connector feature) or any GPT that can't use MCP: paste `openapi.yaml` into Actions config, auth header `Authorization: Bearer <api_key>`.
- **Any other REST-capable tool or agent framework**: the `openapi.yaml` covers this entirely.

**Connections page UX (replaces the earlier per-tool breakdown in this section):** Show one MCP Server URL and one API key — both shared across all integrations. Per-tool setup notes appear inline per card: Claude Desktop config snippet, ChatGPT Developer Mode steps, other MCP clients, and a collapsible "Use our REST API instead" section for non-MCP tools (Zapier, Make, Copilot Studio, etc.) with a link to `openapi.yaml` and the auth header pattern. Do not show three separate integrations to configure — it's one key, one server, different setup copy per tool.

Auth header: same `Authorization: Bearer <api_key>` pattern as everything else — one auth system, every consumer (extension, MCP, REST/OpenAPI).

---

## 9. Design System (production-ready — build this exactly, do not improvise a different style)

**Component library:** [shadcn/ui](https://ui.shadcn.com/) for every UI primitive — buttons, inputs, dialogs, dropdowns, tooltips, cards, sidebars. Do not hand-roll components shadcn already provides. Use the shadcn CLI to add components as needed rather than copy-pasting once and diverging.

**Reference feel:** Linear, Raycast, Arc Browser, Notion, and Vercel's dashboard — calm, minimal, dense-but-breathable, dark-first. Google's Material feel does NOT apply here despite being mentioned earlier as a comparison point — the locked palette and spacing below (Linear/Raycast/Arc-inspired) is the actual direction; treat Notion/Vercel as the reference for information density and layout discipline, not for color or shape language.

**Color palette (dark mode — default theme):**
| Token | Value | Use |
|---|---|---|
| Background | `#20242B` | Page background |
| Surface / Card | `#2B303A` | Cards, panels, sidebar |
| Primary Accent | `#92DCE5` | Buttons, links, active states, focus rings |
| Hover Accent | `#A8E6EF` | Hover state of accent elements |
| Selection | `rgba(146,220,229,0.15)` | Selected list rows, active nav item background |
| Primary Text | `#EEE5E9` | Headings, body text |
| Secondary Text | `#7C7C7C` | Muted labels, timestamps, descriptions |
| Border | `rgba(255,255,255,0.08)` | Card borders, dividers |

**Light mode:** build a real light theme (not just an afterthought) using the same structural tokens inverted — light background, dark text, same accent teal (`#92DCE5` may need a slightly darker shade like `#4FB8C4` for sufficient contrast on white; Antigravity should verify contrast ratios meet WCAG AA for text-on-accent and accent-on-background in both modes). Dark mode is the default/first-loaded theme; store the user's preference (localStorage or a `theme` column) once a toggle exists.

**Typography:** Geist (both Geist Sans for UI text and Geist Mono for anything code/URL-like — API keys, bookmark URLs shown in a monospace style read more "technical/trustworthy" here).

**Icons:** Lucide icons exclusively — matches the shadcn/ui default icon set, so no second icon library is needed.

**Spacing & shape:** generous whitespace, rounded corners at 12–16px on cards and major containers, 8px on small controls (buttons, inputs, badges). Soft borders (the `rgba(255,255,255,0.08)` token above) instead of hard 1px solid lines. Subtle shadows only — no heavy drop shadows, this is a flat, calm aesthetic, not skeuomorphic.

**Animation:** Apple-like — subtle, fast, purposeful. 180–220ms ease-out for hovers, panel transitions, and dropdown open/close. No bouncy/springy easing, no animations longer than ~250ms anywhere in the interface. Motion should feel like it's confirming an action, never decorating one.

**Brand personality:** calm, intelligent, organized, trustworthy, AI-powered, professional — an AI productivity tool, not a "bookmark manager" in the traditional sense. Copy/microcopy throughout the app should reflect this (e.g. "Your saved knowledge, synced everywhere" rather than "Manage your bookmarks").

**Logo direction:** minimal, geometric mark combining a bookmark shape with an AI/network-node concept — representing memory, synchronization, and connection. Explicitly avoid literal books, folders, or generic ribbon-bookmark icons; the mark should feel closer to a node/graph glyph than a stationery item. This can be designed later/separately from the app build — Antigravity should leave a placeholder logo slot in the header/sidebar rather than blocking on a final mark.

**Dashboard layout — confirmed from reference image:**

The reference shows a proven file-manager-style layout — translate it directly to Bookar's domain:

- **Left sidebar** (fixed width, ~280px): logo mark at top, then nav items with icon + label, one row highlighted with the Selection token (`rgba(146,220,229,0.15)`) background to show the active page. Nav items: `Home` (overview/stats), `All bookmarks` (main list, default active), `Folders` (folder tree browse), `Recently added`, `Bot-added` (filters `source = 'bot'`), `Deleted` (soft-deleted, restorable), `Connections` (the "Connect to Claude/ChatGPT/etc" page), `Settings`.
- **Top of main panel — two quick-action cards side by side**, matching the reference's card pair exactly: left card filled with the Surface color (`#2B303A`) — "Add a bookmark" with a plus icon, opens a quick-add dialog for manual URL entry outside the extension flow. Right card outlined/lighter — "Connect a device", jumps to the linking-code screen if nothing's connected yet, or the connections list if something already is.
- **Filter tab row below that** — pill-style tabs in a rounded track, one active pill visually raised (Surface background, others muted/transparent text), directly replacing the reference's `Documents / Spreadsheets / PDFs / Images` row: `View all`, `By folder`, `Recently added`, `Bot-added`.
- **Bookmark list below the tabs**: each row = small favicon/icon in a rounded square, title (primary text weight), a secondary metadata line (folder path · device/browser it synced from · relative time), and a kebab (⋯) menu that only appears on row hover — matching the reference exactly, keeping rows visually quiet until the cursor lands on one.
- A checkbox per row (left-aligned, as in the reference) enables multi-select for bulk delete/move/tag actions.

Build this as the literal page structure — not a paraphrase of the reference — restyled with Bookar's teal/dark palette instead of the reference's light/monochrome one.

**Model finalized:** `meta/llama-3.1-8b-instruct` via NVIDIA NIM's free tier — update `NVIDIA_MODEL` in section 12's env files to this value directly (no longer an open decision).

**Key UX moments to get right:**
- Dashboard structure: left sidebar = folder tree (mirrors browser bookmark folder structure), main panel = bookmark list/cards with title, auto-description, tags, and a small "synced from [device/browser]" label per entry
- Empty state (no device connected yet) is the linking-code screen, front and center — this is the single most important first-run moment and should get real design attention, not a placeholder
- A settings page with "Connect to Claude" / "Connect to ChatGPT" buttons, each revealing the API key plus copy-paste setup instructions in a code block (Geist Mono)

---

## 10. Build Instructions (single continuous build — not phased releases)

This is meant to be built completely in one working session, not shipped in incremental versions. Antigravity should treat every piece below as part of one deliverable, not a v1/v2 sequence:

- Set up Supabase (schema from section 3, Google Auth provider enabled) and the Next.js website together, since the dashboard needs real auth from the first screen it renders.
- Build the extension (manifest + background.js + popup) against the real API routes from the start, not a mock/local stub — the API contracts in section 13 are final, so there's no need for a placeholder version.
- Build `ingest-bookmark` with the real NVIDIA model call (`meta/llama-3.1-8b-instruct`, confirmed above) from the start, not a stubbed description.
- Build the MCP server and the REST/OpenAPI layer alongside the website, not after — they share the same query logic (section 7 vs. 8) and the same auth scheme (section 4), so building them together avoids duplicating that logic twice.
- Design system (section 9) applies from the first component written — do not build with default/unstyled shadcn components and restyle later; pull in the color tokens, Geist font, and spacing rules before writing the first page.
- Run through the full testing checklist (section 17) once everything above is wired together, as the definition of "done" for this build — not as a later QA pass.

---

## Decisions (all finalized — nothing left open except the dashboard layout reference image)
- [x] Soft-delete used for removed bookmarks (`deleted_at` column, section 3) — preserves bot/recent-context value at no real cost
- [x] Model: `meta/llama-3.1-8b-instruct` via NVIDIA NIM free tier
- [x] `add_bookmark` ships fully in this build for both MCP and REST, tagged `source = 'bot'`
- [x] Root cause of the resume builder's disconnect confirmed: 1-hour OAuth access token with no client-side refresh call. Bookar's non-expiring API-key approach (section 4) fully avoids this bug class.
- [x] Dashboard layout confirmed from reference image — file-manager-style sidebar + quick-action cards + filter tabs + hover-revealed row actions (section 9)

---

## 11. Repository Structure (monorepo, single source of truth)

```
/bookar
  /apps
    /web                  -- Next.js website + dashboard + API routes
      /app
        /(auth)/login/page.tsx
        /dashboard/page.tsx
        /dashboard/settings/page.tsx   -- "Connect to Claude/ChatGPT" screen
        /api/link-device/route.ts
        /api/sync-bookmark/route.ts
        /api/sync-bookmark-batch/route.ts
        /api/v1/bookmarks/search/route.ts
        /api/v1/bookmarks/recent/route.ts
        /api/v1/bookmarks/route.ts      -- POST (add), stretch goal
      /components
      /lib
        supabaseClient.ts
        auth.ts
        apiKey.ts          -- generate/hash/verify API keys (shared logic)
      openapi.yaml
      .env.example
    /mcp-server             -- separate Vercel deployment, Node
      index.ts
      tools/searchBookmarks.ts
      tools/listRecent.ts
      tools/addBookmark.ts
      lib/verifyApiKey.ts   -- same hashing logic as /apps/web, kept in sync
      .env.example
  /extension
    manifest.json
    background.js
    popup.html
    popup.js
    icons/
  /supabase
    /migrations/0001_init.sql
    /functions/ingest-bookmark/index.ts
  README.md
```

Antigravity should treat `/apps/web`, `/apps/mcp-server`, `/extension`, and `/supabase` as four independently deployable units sharing one Postgres DB and one API-key auth scheme — not four disconnected projects.

---

## 12. Environment Variables (exact contract — no ambiguity)

**`/apps/web/.env.example`**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only, never exposed to client
NVIDIA_API_KEY=
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
API_KEY_HASH_SECRET=              # pepper for hashing device/bot API keys
NEXT_PUBLIC_SITE_URL=
```

**`/apps/mcp-server/.env.example`**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
API_KEY_HASH_SECRET=              # MUST match web's value exactly
```

**`/supabase/functions/ingest-bookmark` secrets (via `supabase secrets set`)**
```
NVIDIA_API_KEY=
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 13. API Contracts (exact request/response shapes)

### `POST /api/link-device`
Request: `{ "linking_code": "483920" }`
Success (200): `{ "device_id": "uuid", "api_key": "raw-64-char-hex-shown-once" }`
Errors: `400` invalid/expired code, `404` code not found.

### `POST /api/sync-bookmark`
Headers: `Authorization: Bearer <device_api_key>`
Request:
```json
{
  "event": "created",
  "browser_bookmark_id": "123",
  "url": "https://example.com",
  "title": "Example Tool",
  "folder_path": "Work/Design Tools"
}
```
`event` is one of `created | updated | deleted`. On `deleted`, only `browser_bookmark_id` is required.
Success (200): `{ "bookmark_id": "uuid", "status": "queued_for_description" }`
Errors: `401` invalid/revoked key, `422` missing required field.

### `POST /api/sync-bookmark-batch`
Same shape, wrapped: `{ "bookmarks": [ ... ] }`. Used only for first-connect backfill. Process in chunks (batches of 50) to respect NVIDIA free-tier limits — see section 14.

### `GET /api/v1/bookmarks/search?q=<query>`
Headers: `Authorization: Bearer <bot_api_key>`
Success (200):
```json
{
  "results": [
    {
      "title": "Example Tool",
      "url": "https://example.com",
      "description": "A one-line auto-generated description.",
      "tags": ["design", "reference"],
      "folder_path": "Work/Design Tools",
      "device_name": "Vicky's Laptop",
      "browser": "Brave"
    }
  ]
}
```

### `GET /api/v1/bookmarks/recent?limit=10`
Same result shape, ordered by `created_at desc`.

All `/api/v1/*` routes return `401` on invalid key, `429` if rate-limited (section 14).

---

## 14. Rate Limiting & NVIDIA Free-Tier Handling

- NVIDIA NIM free tier is request-rate-limited (exact numbers vary by model — check the current limit for whichever model is chosen at build time).
- `ingest-bookmark` must queue/throttle rather than fire one LLM call per bookmark instantly during backfill. Recommended: ~1 request/second, not `Promise.all`-ing hundreds at once.
- If the LLM call fails/rate-limits, still save the bookmark with `description = null` and a `description_pending = true` flag for later retry — never block the sync itself on the LLM step succeeding.
- Bot-facing `/api/v1/*` routes should have basic per-key rate limiting (e.g. 60 req/min) — an in-memory or Supabase-backed counter is enough for v1, no Redis needed at this scale.

---

## 15. Error Handling & Logging Standards

- Every API route returns errors as `{ "error": { "code": "string", "message": "human-readable" } }` — never a bare string or raw stack trace to the client.
- Server-side errors get logged with context (user_id, device_id, event type) but responses never leak internal details.
- Extension retries a failed sync once after a short delay, then silently marks the item for retry in local storage rather than looping or alerting the user over a transient blip.

---

## 16. Security Checklist (non-negotiable)

- [ ] All device/bot API keys stored **hashed** (HMAC-SHA256 with `API_KEY_HASH_SECRET`), never logged in plaintext after one-time display
- [ ] RLS enabled and actually enforced on every user-data table
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only used server-side — never shipped to the extension or any client bundle
- [ ] Linking codes expire in 10 minutes, single-use (cleared immediately after successful linking)
- [ ] `/api/v1/*` open CORS (server-to-server bot calls); `/api/sync-bookmark*` requires a valid device API key regardless of origin

---

## 17. Interaction States, Reactions & Motion (every page, not just happy path)

Every screen below must implement all applicable states — not just the default/success view. This is what separates a "working" build from one that actually feels like Linear/Raycast/Arc:

**Universal states for any interactive element (buttons, cards, list rows, nav items):**
- Default → Hover (180-220ms ease-out transition on background/border color, per section 9's animation spec) → Active/pressed (slight scale-down, ~0.98, or a darker shade — pick one and use it consistently everywhere) → Focus-visible (visible focus ring using the accent teal, for keyboard navigation — required for accessibility, not optional) → Disabled (reduced opacity, no hover reaction).

**Dashboard / bookmark list:**
- Loading: skeleton rows (shimmer or pulse animation on gray blocks shaped like the real rows) while data fetches — never a blank screen or a spinner-only state for list content.
- Empty (no bookmarks yet, device connected): illustrated/friendly empty state with the "Add a bookmark" quick-action prominent.
- Empty (no device connected at all): the linking-code screen takes over as the primary empty state, as already specified.
- Populated: rows fade/slide in on first load (short stagger, not a jarring pop); kebab menu fades in on row hover only (per section 9).
- Row hover: subtle background shift using the Surface token, kebab icon appears, checkbox becomes easier to see.
- Search/filter: as the user types in search or switches a filter tab, the list should transition (fade or height-animate) rather than snap instantly — but stay within the 180-220ms budget, never sluggish.
- Bulk-select active (checkboxes checked): a contextual action bar should appear (slide up from bottom or fade in above the list) showing delete/move/tag actions for the selection.

**Linking-code / device connection screen:**
- Idle: code displayed large and clearly, with a countdown or expiry indicator (10 minutes, per section 4) and a subtle pulse or glow on the code itself to draw attention.
- Waiting for extension: after the code is shown, if the tab stays open, poll/listen for the extension completing the link and transition automatically to a "Connected!" success state (checkmark animation, brief) without requiring a manual refresh.
- Expired: code visually grays out with a "Generate new code" button, no dead-end state.
- Error (e.g. code already used, network failure): clear inline error message, not a toast that disappears before it's read.

**Connections page (Claude / ChatGPT / Gemini / other):**
- Each tool shown as a card with its logo/icon, a status pill (`Not connected` / `Connected` / `Key revoked`), and a primary action button that changes based on state (`Connect` → `View setup instructions` → `Revoke`).
- Clicking "Connect" reveals the API key in a monospace (Geist Mono) block with a copy button that shows a brief "Copied!" confirmation (icon swap or small toast, ~1.5s auto-dismiss) — never a silent copy with no feedback.
- Setup instructions for each tool (Claude Desktop config snippet, ChatGPT Custom GPT Actions steps, Gemini/Copilot Studio connector steps, generic OpenAPI import steps) should be shown inline, expandable per tool, not all dumped on one long page.
- Revoking a key requires a confirmation step (dialog: "This will disconnect [Tool]. Continue?") since it's a destructive action.

**Auth / login page:**
- Should look intentionally designed, not a bare "Sign in with Google" button on a blank page — use the same dark background/surface tokens, a short one-line value-prop headline, and the Google button styled to sit naturally within the dark theme (Google's official button guidelines allow a dark-theme variant — use that, not a jarring white button on the dark background).
- Loading state while the OAuth redirect completes: a brief branded loading screen, not a flash of blank white.
- Error (auth failed/cancelled): return to the login screen with a clear, non-technical inline message ("Sign-in was cancelled — try again"), never a raw error code.

**General principle for Antigravity:** every button, form, and page in this build should have its loading, empty, error, and success states designed and implemented together, not as an afterthought. If a page only has a "happy path" implemented, it isn't done.

---

## 18. Testing Checklist Before Calling This "Done"

- [ ] Fresh install, link via code, confirm full existing bookmark list backfills with folder structure intact
- [ ] Add a new bookmark → appears on dashboard within seconds with a real (non-placeholder) description
- [ ] Edit a bookmark's title/folder in-browser → DB record updates, not duplicates
- [ ] Delete a bookmark in-browser → disappears from dashboard and bot search results
- [ ] Link a second device to the same account → both show up correctly labeled, no collision
- [ ] Generate a bot API key, configure Claude Desktop's MCP settings, ask Claude to search bookmarks → real results return
- [ ] Leave the MCP connection idle 6+ hours, query again → still works (the specific bug Bookar must not reproduce)
- [ ] Revoke a device from the dashboard → that device gets `401` on its next sync attempt
- [ ] Every page (dashboard, linking screen, connections, login) shows correct loading/empty/error/success states, not just the happy path — spot-check each against section 17
- [ ] Connect ChatGPT, Gemini, and the generic OpenAPI flow each independently, using the same API key/OpenAPI file — confirm all three actually work against the live REST endpoints, not just Claude via MCP
