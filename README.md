# Bookar

> Your saved knowledge, synced everywhere.

Bookar is a personal library for links you want to keep. It brings browser bookmarks into one
searchable dashboard, helps organize them, and can let connected AI assistants find or manage them
when you ask.

## How Bookar works

1. Sign in to your Bookar website with Google.
2. Link the browser extension with the short code shown in your dashboard. It imports your current
   bookmarks and sends future bookmark changes to Bookar.
3. Search, organize, and manage bookmarks from the dashboard. Changes made in Bookar are sent back
   to the linked browser when it next syncs (normally within a minute); you can also choose **Sync
   Now** in the extension.
4. Ask Bookar to create an AI summary when you need one. Summaries are not automatically generated
   for every bookmark.
5. Optionally connect an AI assistant from **Connections & AI** so it can work with your library.

The extension only records a visit when the exact web address is already saved as a bookmark in
that browser. It needs the browser's history permission for this feature, and it does not upload
your general browsing history or import visits from before tracking was enabled.

For a step-by-step guide written for Bookar users, open **Docs** in the Bookar website (or visit
`/docs` on your own Bookar site). This README also includes the technical setup for people running
their own copy of Bookar.

## What it does

- Syncs bookmarks and their folder paths between supported Chromium browsers and Bookar
- Lets you search, organize, move, share, and manage bookmarks from the dashboard
- Generates or regenerates AI summaries on demand using Groq, with NVIDIA as a fallback
- Offers an optional AI connection with 15 actions for searching and managing bookmarks

## Monorepo structure

```
/apps/web          — Website, dashboard, user guide, and web APIs
/apps/mcp-server   — Optional standalone AI connection service
/extension         — Chrome/Brave/Edge extension
/supabase          — Database changes and bookmark-processing function
```

## Run your own copy

### Quick local start on Windows

From the repository root, run:

```powershell
.\run-local.ps1
```

This opens separate terminals for the web app and the standalone MCP server:

```text
Web:    http://localhost:3000
MCP:    http://localhost:3001/api/mcp
Health: http://localhost:3001/health
```

### 1. Prerequisites (outside the IDE)

| What | Where |
|---|---|
| Node.js 20.9+ and npm | nodejs.org |
| Supabase project | supabase.com |
| Google OAuth credentials | console.cloud.google.com |
| Groq and/or NVIDIA API key | console.groq.com / build.nvidia.com |
| Vercel account | vercel.com |

### 2. Supabase setup

```bash
# Run all migrations in order (paste into Supabase SQL Editor or use the CLI):
# supabase/migrations/0001_init.sql
# supabase/migrations/0002_add_unique_bookmark_constraint.sql
# supabase/migrations/0003_add_bookmark_visit_tracking.sql

# Enable Google Auth provider in Supabase dashboard:
# Authentication → Providers → Google → enable

# Database → Publications → supabase_realtime:
# Enable the bookmarks table so dashboard updates can arrive in real time.
```

### 3. Web app

```bash
cd apps/web
npm install
# Create .env.local with the web variables listed below.
npm run dev
```

For production, set the same variables in Vercel and set the project root directory to `apps/web`.
Run `npm run build` locally to verify a production build.

### 4. MCP server

```bash
cd apps/mcp-server
npm install
# Create .env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_KEY_HASH_SECRET.
npm run dev
```

The web app already serves MCP at `/api/mcp`; this standalone server is optional. If deployed
separately, set its Vercel project root to `apps/mcp-server`.

### 5. Browser extension

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer Mode**
3. For production, download the extension ZIP from your Bookar website. For local development,
   select the repository's `/extension` folder instead.
4. Click **Load unpacked** and select the downloaded/unzipped folder. If you are loading the source
   folder for production, change `API_BASE` in both `extension/background.js` and
   `extension/popup.js` to your web-app URL first; the downloaded ZIP does this automatically.
5. Approve the requested bookmark and history permissions, click the Bookar icon, and enter the
   6-digit linking code from the dashboard.

The first link backfills existing browser bookmarks. Matching URLs already in Bookar are left
unchanged during that backfill; newly imported bookmarks keep their browser folder or use the
user's saved-folder patterns when the browser path is generic.

The extension records visits only when the visited URL exactly matches a bookmark saved in that
browser, then updates the matching Bookar bookmark's last-visited date and visit count. Tracking
begins after the updated extension is installed/reloaded and the `0003` migration is applied;
past browser history is not imported. The dashboard's **Most visited** tab and bookmark details
show the tracked usage, and the MCP `most_visited` tool makes it available to AI clients.

## Environment variables

### apps/web/.env.local

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
API_KEY_HASH_SECRET=
NEXT_PUBLIC_SITE_URL=
GROQ_API_KEY=                    # optional; tried first when configured
GROQ_MODEL=openai/gpt-oss-20b   # optional
NVIDIA_API_KEY=                  # optional fallback provider
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b  # optional
```

Set at least one AI provider key to enable AI-generated summaries. `NEXT_PUBLIC_SITE_URL` should
be the public web-app origin in production; local development can use `http://localhost:3000`.

### apps/mcp-server/.env

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
API_KEY_HASH_SECRET=   # must match web's value
PORT=3001
```

## Connecting AI tools

Use the MCP endpoint shown on the dashboard's **Connections & AI** page and an API key generated
there. The web app endpoint is `/api/mcp`; the standalone MCP server can be deployed separately.

**Claude Desktop**: Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bookar": {
      "type": "http",
      "url": "https://your-bookar-domain/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

**ChatGPT**: In **Connections & AI**, generate a key and copy the ChatGPT connector URL. In ChatGPT,
open Settings → Developer Mode → Connectors → Create Connector, paste that URL, and set
Authentication to **No Auth**. The copied URL includes the API key, so treat it like a password and
do not share it.

The MCP endpoint provides these tools: `save_bookmark`, `get_bookmark`, `update_bookmark`,
`delete_bookmark`, `restore_bookmark`, `archive_bookmark`, `find`, `list_by_folder`, `get_tags`,
`workspace_stats`, `most_visited`, `find_duplicates`, `analyse_topic`, `context_pack`, and `bulk_tag`.

**REST/OpenAPI fallback**: Import `public/openapi.yaml` into Zapier, Make, Copilot Studio, etc.

## Security

- API keys are stored on the server as HMAC-SHA256 hashes; newly generated raw keys are shown once
- Database row-level security keeps each user's bookmarks and devices private
- Linking codes expire in 10 minutes, single-use
- `SUPABASE_SERVICE_ROLE_KEY` never exposed to browser bundles
