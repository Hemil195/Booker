# Bookar

> Your saved knowledge, synced everywhere — AI bookmark sync platform.

## What it does

- Syncs bookmarks from Chromium browsers and keeps their folder paths in Bookar
- Lets you search, organize, move, share, and manage bookmarks from the dashboard
- Generates or regenerates AI summaries on demand using Groq, with NVIDIA as a fallback
- Exposes a 14-tool MCP server for AI clients such as Claude and ChatGPT

## Monorepo structure

```
/apps/web          — Next.js 16.2 dashboard, docs, and API/MCP routes
/apps/mcp-server   — Standalone MCP server (Streamable HTTP)
/extension         — Manifest V3 Chrome/Brave/Edge extension
/supabase          — DB migrations + Edge Functions
```

## Quick start

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
# Run both migrations in order (paste into Supabase SQL Editor or use the CLI):
# supabase/migrations/0001_init.sql
# supabase/migrations/0002_add_unique_bookmark_constraint.sql

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
3. Click **Load Unpacked** → select the `/extension` folder
4. Set `API_BASE` in `extension/background.js` and `extension/popup.js` to `http://localhost:3000` for local development or your deployed web-app URL for production
5. Click the Bookar icon → enter the 6-digit linking code from the dashboard

The first link backfills existing browser bookmarks. Matching URLs already in Bookar are left
unchanged during that backfill; newly imported bookmarks keep their browser folder or use the
user's saved-folder patterns when the browser path is generic.

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
Authentication to **No Auth**. The copied URL includes the API key as a query parameter.

The MCP endpoint provides these tools: `save_bookmark`, `get_bookmark`, `update_bookmark`,
`delete_bookmark`, `restore_bookmark`, `archive_bookmark`, `find`, `list_by_folder`, `get_tags`,
`workspace_stats`, `find_duplicates`, `analyse_topic`, `context_pack`, and `bulk_tag`.

**REST/OpenAPI fallback**: Import `public/openapi.yaml` into Zapier, Make, Copilot Studio, etc.

## Security

- API keys are stored on the server as HMAC-SHA256 hashes; newly generated raw keys are shown once
- RLS enforced on all user tables
- Linking codes expire in 10 minutes, single-use
- `SUPABASE_SERVICE_ROLE_KEY` never exposed to browser bundles
