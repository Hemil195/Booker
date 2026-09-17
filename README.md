# Bookar

> Your saved knowledge, synced everywhere — AI bookmark sync platform.

## What it does

- Syncs browser bookmarks in real time across all your devices
- Auto-generates AI descriptions (NVIDIA NIM, `meta/llama-3.1-8b-instruct`)
- Searchable from Claude, ChatGPT, and any AI assistant via MCP

## Monorepo structure

```
/apps/web          — Next.js 15 dashboard + API routes
/apps/mcp-server   — Standalone MCP server (Streamable HTTP)
/extension         — Manifest V3 Chrome/Brave/Edge extension
/supabase          — DB migrations + Edge Functions
```

## Quick start

### 1. Prerequisites (outside the IDE)

| What | Where |
|---|---|
| Supabase project | supabase.com |
| Google OAuth credentials | console.cloud.google.com |
| NVIDIA NIM API key | build.nvidia.com |
| Vercel account | vercel.com |

### 2. Supabase setup

```bash
# Run the migration (paste in Supabase SQL editor or use CLI)
# File: supabase/migrations/0001_init.sql

# Enable Google Auth provider in Supabase dashboard:
# Authentication → Providers → Google → enable

# Set Edge Function secrets:
supabase secrets set NVIDIA_API_KEY=<your-key>
supabase secrets set NVIDIA_MODEL=meta/llama-3.1-8b-instruct
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-key>
supabase secrets set API_KEY_HASH_SECRET=<random-32-char-string>

# Deploy Edge Function:
supabase functions deploy ingest-bookmark
```

### 3. Web app

```bash
cd apps/web
cp .env.example .env.local
# Fill in all values in .env.local
npm install
npm run dev        # dev
vercel             # production
```

### 4. MCP server

```bash
cd apps/mcp-server
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_KEY_HASH_SECRET
node index.js      # dev (port 3001)
vercel             # production (separate Vercel project)
```

### 5. Browser extension

1. Open `chrome://extensions` (or `brave://extensions`)
2. Enable **Developer Mode**
3. Click **Load Unpacked** → select the `/extension` folder
4. Update `API_BASE` in `extension/background.js` and `extension/popup.js` to your Vercel URL
5. Click the Bookar icon → enter the 6-digit linking code from the dashboard

## Environment variables

### apps/web/.env.local

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NVIDIA_API_KEY=
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
API_KEY_HASH_SECRET=
NEXT_PUBLIC_SITE_URL=
MCP_SERVER_URL=http://localhost:3001/api/mcp  # local dev only
```

### apps/mcp-server/.env

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
API_KEY_HASH_SECRET=   # must match web's value
PORT=3001
```

## Connecting AI tools

All tools use the same MCP server URL + API key generated from the dashboard Connections page.

**Claude Desktop**: Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bookar": {
      "type": "http",
      "url": "https://your-mcp-server.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

**ChatGPT** (Plus/Pro/Business/Enterprise): Settings → Developer Mode → Connectors → Create → paste MCP server URL, choose API key auth.

**REST/OpenAPI fallback**: Import `public/openapi.yaml` into Zapier, Make, Copilot Studio, etc.

## Security

- All API keys stored hashed (HMAC-SHA256) — never in plaintext
- RLS enforced on all user tables
- Linking codes expire in 10 minutes, single-use
- `SUPABASE_SERVICE_ROLE_KEY` never exposed to browser bundles
