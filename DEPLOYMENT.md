# Bookar — Live Production Deployment Guide

This guide details the complete production deployment flow for **Bookar**:
1. **Supabase Database & Authentication Setup**
2. **Vercel Deployment for Web App & MCP Server**
3. **Claude & ChatGPT Production AI Integration**
4. **Chrome / Brave / Edge Extension Configuration & Publishing**

---

## 1. Supabase Database & Auth Setup

### Step 1: Database Schema & Realtime Setup
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard) and open your project (or create a new project).
2. Open the **SQL Editor** tab from the left sidebar.
3. Run the migrations in order in the SQL Editor: [`0001_init.sql`](supabase/migrations/0001_init.sql), [`0002_add_unique_bookmark_constraint.sql`](supabase/migrations/0002_add_unique_bookmark_constraint.sql), then [`0003_add_bookmark_visit_tracking.sql`](supabase/migrations/0003_add_bookmark_visit_tracking.sql).
4. Go to **Database** $\rightarrow$ **Publications** $\rightarrow$ Click `supabase_realtime` and ensure the `bookmarks` table is enabled for Realtime events.

### Step 2: Authentication & Redirect URLs
1. In Supabase, go to **Authentication** $\rightarrow$ **URL Configuration**:
   - Set **Site URL**: `https://your-app-domain.vercel.app`
   - Add **Redirect URL**: `https://your-app-domain.vercel.app/auth/callback`
   - Add local development URL (if testing locally): `http://localhost:3000/auth/callback`
2. Go to **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Google**:
   - Enable **Google Auth**.
   - Paste your **Client ID** and **Client Secret** obtained from your [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   - In Google Cloud Console, add `https://<your-supabase-project>.supabase.co/auth/v1/callback` to Authorized Redirect URIs.

---

## 2. Vercel Production Deployment

### Option A: Web Application (`apps/web`)

1. Connect your repository to GitHub.
2. Go to [Vercel New Project](https://vercel.com/new) and import your repository.
3. Set **Root Directory** to `apps/web`.
4. Configure **Environment Variables** in Vercel:

| Variable Name | Value Description | Example / Required |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Public Anon Key | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Private Service Role Key | `eyJhbGciOi...` |
| `GROQ_API_KEY` | Groq API key (tried first when configured) | `gsk-xxxx...` |
| `GROQ_MODEL` | Groq model (optional) | `openai/gpt-oss-20b` |
| `NVIDIA_API_KEY` | NVIDIA NIM API key (fallback provider) | `nvapi-xxxx...` |
| `NVIDIA_MODEL` | NVIDIA model (optional) | `nvidia/nemotron-3.5-lightning-30b-a3b` |
| `API_KEY_HASH_SECRET` | Secret key for hashing API keys (32+ chars) | `your-secure-random-32-char-string` |
| `NEXT_PUBLIC_SITE_URL` | Live Production Web Domain | `https://your-app-domain.vercel.app` |

Configure at least one AI provider key to generate summaries. `NEXT_PUBLIC_SITE_URL` is used when
building the downloadable extension package; set it to the public web-app origin. Then click
**Deploy**.

---

### Option B: Standalone MCP Server (`apps/mcp-server`, optional)

The web app already exposes MCP at `https://your-app-domain.vercel.app/api/mcp`. Deploy the
standalone server only if you want a separate MCP service.

1. In Vercel, click **Add New Project** $\rightarrow$ Import the same repository.
2. Set **Root Directory** to `apps/mcp-server`.
3. Configure Environment Variables:

```env
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
API_KEY_HASH_SECRET=your-secure-random-32-char-string
```

4. Deploy the project. Note down the public MCP endpoint URL:
   `https://your-mcp-domain.vercel.app/api/mcp`

---

## 3. Connecting AI Clients in Production

### Connecting Claude (Desktop & Claude Code)
Generate an API Key from your Bookar Dashboard (**Connections & AI** tab), then add this configuration to your local `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bookar": {
      "type": "http",
      "url": "https://your-mcp-domain.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_BOOKAR_API_KEY"
      }
    }
  }
}
```

### Connecting ChatGPT (Plus / Pro / Enterprise)
1. In Bookar **Connections & AI**, generate an API key and copy the ChatGPT Connector URL shown.
   The copied URL contains the key.
2. In ChatGPT, open **Settings → Developer Mode → Enable**.
3. Open **Connectors → Create Connector** and paste the copied URL.
4. Set authentication to **No Auth** (sometimes shown as **None**) and save.

Treat the full connector URL like a password because it contains your API key. You can revoke the
key from Bookar's Connections & AI page. If you deploy the standalone MCP server, use its
`/api/mcp` address in place of the web app's address while keeping the `api_key` query parameter.

---

## 4. Browser Extension Deployment & Publishing

### Step 1: Package the extension
The simplest production setup is to download the extension ZIP from the deployed Bookar website.
The website automatically inserts its own address into the ZIP. If you load the source folder
directly instead, set `API_BASE` in [`extension/background.js`](extension/background.js) and
[`extension/popup.js`](extension/popup.js) to your production web-app URL:

```javascript
const API_BASE = "https://your-app-domain.vercel.app";
```

### Step 2: Test Extension Locally
1. Open Chrome/Brave/Edge and navigate to `chrome://extensions`.
2. Enable **Developer Mode** toggle (top right).
3. Click **Load unpacked** → select the downloaded/unzipped extension folder and accept its bookmark and history permissions.
4. Open Connections & AI in the Bookar dashboard, then link the extension using the displayed 6-digit code.
5. The first link backfills existing browser bookmarks. Existing Bookar records with matching URLs are preserved.

The extension tracks visits only for URLs already bookmarked in that browser. It does not import
past browsing history; last-visited dates and visit counts begin after the updated extension is
installed/reloaded and migration `0003` has been applied.

---

## Summary Checklist

- [ ] Run migrations `0001_init.sql`, `0002_add_unique_bookmark_constraint.sql`, and `0003_add_bookmark_visit_tracking.sql` in order.
- [ ] Configure Supabase Google OAuth provider & Auth redirect URLs.
- [ ] Deploy `apps/web` on Vercel with all production environment variables.
- [ ] Optionally deploy `apps/mcp-server` on Vercel if you want a separate MCP service.
- [ ] Download the extension ZIP from the deployed website, or set `API_BASE` in both extension source files.
- [ ] Test linking browser extension with live dashboard and allow its history permission for bookmarked-URL visit tracking.
