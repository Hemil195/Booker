// apps/mcp-server/index.js
// Bookar MCP Server v2 — Bookmark Intelligence Layer
// 15 intent-aware tools. Streamable HTTP transport.
// Auth: Bearer API key or ?api_key= query param.

require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createClient } = require("@supabase/supabase-js");
const { createHmac } = require("crypto");
const http = require("http");
const { searchBookmarks } = require("./search.js");
const { z } = require("zod");

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HASH_SECRET = process.env.API_KEY_HASH_SECRET;
const PORT = parseInt(process.env.PORT ?? "3001", 10);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !HASH_SECRET) {
  console.error("Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_KEY_HASH_SECRET");
  process.exit(1);
}

// Module-level client — survives warm Lambda/Vercel invocations
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Query timeout ─────────────────────────────────────────────────────────────
function withTimeout(thenable, ms = 8000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`DB query timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(thenable), timeout]).finally(() => clearTimeout(timeoutId));
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function hashKey(rawKey) {
  return createHmac("sha256", HASH_SECRET).update(rawKey).digest("hex");
}

async function verifyKey(rawKey) {
  const hash = hashKey(rawKey);
  const { data, error } = await withTimeout(
    supabase.from("devices").select("id, user_id").eq("api_key_hash", hash).single()
  );
  if (error || !data) return null;
  return data;
}

// ── Format bookmark for display ───────────────────────────────────────────────
function formatBookmark(bm, index) {
  return [
    index != null ? `${index + 1}. **${bm.title ?? bm.url}**` : `**${bm.title ?? bm.url}**`,
    `   URL: ${bm.url}`,
    bm.description ? `   → ${bm.description}` : "",
    bm.folder_path ? `   📁 ${bm.folder_path}` : "",
    Array.isArray(bm.tags) && bm.tags.length ? `   🏷 ${bm.tags.join(", ")}` : "",
    `   🗓 ${new Date(bm.created_at).toLocaleDateString()} | ID: \`${bm.id}\``,
  ].filter(Boolean).join("\n");
}

// ── MCP Server factory ────────────────────────────────────────────────────────
function createBookarMcpServer(userId, deviceId) {
  const server = new McpServer({ name: "bookar", version: "2.0.0" });
  const uid = userId;

  // The SDK in this project requires Zod schemas. Convert the existing
  // JSON-style parameter definitions to Zod at registration time.
  server.tool = (name, description, paramsSchemaOrCallback, callback) => {
    const paramsSchema =
      typeof paramsSchemaOrCallback === "function" ? {} : (paramsSchemaOrCallback || {});
    const toolCallback =
      typeof paramsSchemaOrCallback === "function" ? paramsSchemaOrCallback : callback;

    const shape = {};
    for (const [key, spec] of Object.entries(paramsSchema)) {
      let fieldSchema;
      if (spec?.type === "number") {
        fieldSchema = z.number();
      } else if (spec?.type === "array") {
        fieldSchema = z.array(z.string());
      } else if (spec?.type === "boolean") {
        fieldSchema = z.boolean();
      } else {
        fieldSchema = z.string();
      }
      shape[key] = fieldSchema.optional();
    }

    return server.registerTool(
      name,
      {
        description,
        inputSchema: z.object(shape),
      },
      toolCallback,
    );
  };

  // ── Layer 1: CRUD ──────────────────────────────────────────────────────────

  server.tool(
    "save_bookmark",
    "Save a new bookmark to Bookar. Use when the user wants to bookmark or remember a URL. " +
    "Provide the URL, optional title, optional notes, and optional folder/tags. " +
    "Returns the saved bookmark's ID.",
    {
      url: { type: "string", description: "Full URL to bookmark (required)" },
      title: { type: "string", description: "Page title (optional)" },
      notes: { type: "string", description: "Description or reason saved (optional)" },
      folder: { type: "string", description: "Folder path e.g. 'Work/AI' (optional)" },
      tags: { type: "array", items: { type: "string" }, description: "Tags e.g. ['ai','tools'] (optional)" },
    },
    async ({ url, title, notes, folder, tags }) => {
      if (!url) return { content: [{ type: "text", text: "❌ Error: `url` is required." }] };
      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error("Unsupported URL protocol");
      } catch {
        return { content: [{ type: "text", text: "❌ Invalid URL. Must start with http:// or https://" }] };
      }

      // Duplicate check
      const { data: existing } = await withTimeout(
        supabase.from("bookmarks").select("id, title").eq("user_id", uid).eq("url", url).is("deleted_at", null).limit(1)
      );
      if (existing?.length > 0) {
        return { content: [{ type: "text", text: `⚠️ Already saved as "${existing[0].title}" (ID: \`${existing[0].id}\`). Use update_bookmark to edit it.` }] };
      }

      const tagsArr = Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean) : [];
      const { data, error } = await withTimeout(
        supabase.from("bookmarks").insert({
          user_id: uid, device_id: deviceId,
          url, title: typeof title === "string" && title.trim() ? title.trim() : url,
          description: notes ?? null,
          folder_path: folder ?? null,
          tags: tagsArr,
          source: "mcp",
          description_pending: false,
        }).select("id, title, url").single()
      );
      if (error) return { content: [{ type: "text", text: `❌ Failed to save: ${error.message}` }] };
      return {
        content: [{
          type: "text", text:
            `✅ Saved: **${data.title}**\nURL: ${data.url}\nID: \`${data.id}\`` +
            (folder ? `\nFolder: ${folder}` : "") +
            (tagsArr.length ? `\nTags: ${tagsArr.join(", ")}` : "")
        }]
      };
    }
  );

  server.tool(
    "get_bookmark",
    "Fetch full details of a bookmark by ID. Use after finding a bookmark's ID with find().",
    { id: { type: "string", description: "Bookmark UUID" } },
    async ({ id }) => {
      if (!id) return { content: [{ type: "text", text: "❌ `id` is required." }] };
      const { data, error } = await withTimeout(
        supabase.from("bookmarks")
          .select("id, title, url, description, tags, folder_path, created_at, updated_at")
          .eq("id", id).eq("user_id", uid).is("deleted_at", null).single()
      );
      if (error || !data) return { content: [{ type: "text", text: "❌ Bookmark not found." }] };
      return {
        content: [{
          type: "text", text: [
            `**${data.title ?? data.url}**`,
            `URL: ${data.url}`,
            data.description ? `Description: ${data.description}` : "",
            data.folder_path ? `Folder: ${data.folder_path}` : "",
            Array.isArray(data.tags) && data.tags.length ? `Tags: ${data.tags.join(", ")}` : "",
            `Saved: ${new Date(data.created_at).toLocaleDateString()}`,
            `ID: \`${data.id}\``,
          ].filter(Boolean).join("\n")
        }]
      };
    }
  );

  server.tool(
    "update_bookmark",
    "Edit a bookmark's title, notes, folder, or tags by ID.",
    {
      id: { type: "string", description: "Bookmark UUID to update" },
      title: { type: "string", description: "New title (optional)" },
      notes: { type: "string", description: "New description (optional)" },
      folder: { type: "string", description: "New folder path (optional)" },
      tags: { type: "array", items: { type: "string" }, description: "Replace tags (optional)" },
    },
    async ({ id, title, notes, folder, tags }) => {
      if (!id) return { content: [{ type: "text", text: "❌ `id` is required." }] };
      const patch = {};
      if (title) patch.title = title;
      if (notes !== undefined) patch.description = notes || null;
      if (folder !== undefined) patch.folder_path = folder || null;
      if (Array.isArray(tags)) patch.tags = tags.map(String);
      if (Object.keys(patch).length === 0)
        return { content: [{ type: "text", text: "❌ Nothing to update — provide title, notes, folder, or tags." }] };
      patch.updated_at = new Date().toISOString();
      const { data, error } = await withTimeout(
        supabase.from("bookmarks").update(patch).eq("id", id).eq("user_id", uid)
          .is("deleted_at", null).select("id").maybeSingle()
      );
      if (error) return { content: [{ type: "text", text: `❌ Update failed: ${error.message}` }] };
      if (!data) return { content: [{ type: "text", text: "❌ Active bookmark not found." }] };
      return { content: [{ type: "text", text: `✅ Bookmark \`${id}\` updated.` }] };
    }
  );

  server.tool(
    "delete_bookmark",
    "Soft-delete a bookmark (moves to trash, recoverable). Use when user says 'delete' or 'remove'.",
    { id: { type: "string", description: "Bookmark UUID to delete" } },
    async ({ id }) => {
      if (!id) return { content: [{ type: "text", text: "❌ `id` is required." }] };
      const { data, error } = await withTimeout(
        supabase.from("bookmarks").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", uid)
          .is("deleted_at", null).select("id").maybeSingle()
      );
      if (error) return { content: [{ type: "text", text: `❌ Delete failed: ${error.message}` }] };
      if (!data) return { content: [{ type: "text", text: "❌ Active bookmark not found." }] };
      return { content: [{ type: "text", text: `🗑 Bookmark \`${id}\` moved to trash. Use restore_bookmark to undo.` }] };
    }
  );

  server.tool(
    "restore_bookmark",
    "Restore a deleted bookmark from trash.",
    { id: { type: "string", description: "Bookmark UUID to restore" } },
    async ({ id }) => {
      if (!id) return { content: [{ type: "text", text: "❌ `id` is required." }] };
      const { data, error } = await withTimeout(
        supabase.from("bookmarks")
          .update({ deleted_at: null, updated_at: new Date().toISOString() })
          .eq("id", id).eq("user_id", uid).select("id").maybeSingle()
      );
      if (error) return { content: [{ type: "text", text: `❌ Restore failed: ${error.message}` }] };
      if (!data) return { content: [{ type: "text", text: "❌ Bookmark not found." }] };
      return { content: [{ type: "text", text: `✅ Bookmark \`${id}\` restored.` }] };
    }
  );

  server.tool(
    "archive_bookmark",
    "Archive a bookmark (moves to _archive folder, not deleted). Use when user says 'archive' or 'hide but keep'.",
    { id: { type: "string", description: "Bookmark UUID to archive" } },
    async ({ id }) => {
      if (!id) return { content: [{ type: "text", text: "❌ `id` is required." }] };
      const { data, error } = await withTimeout(
        supabase.from("bookmarks")
          .update({ folder_path: "_archive", updated_at: new Date().toISOString() })
          .eq("id", id).eq("user_id", uid).is("deleted_at", null).select("id").maybeSingle()
      );
      if (error) return { content: [{ type: "text", text: `❌ Archive failed: ${error.message}` }] };
      if (!data) return { content: [{ type: "text", text: "❌ Active bookmark not found." }] };
      return { content: [{ type: "text", text: `📦 Bookmark \`${id}\` archived.` }] };
    }
  );

  // ── Layer 2: Intelligent Retrieval ─────────────────────────────────────────

  server.tool(
    "find",
    "Search bookmarks using ANY natural language — questions, topics, descriptions, or keywords. " +
    "Understands intent: 'design inspiration', 'AI tools I saved', 'learn databases', 'startup ideas'. " +
    "If no query given, returns recent bookmarks. Always call this first for any search request.",
    {
      query: { type: "string", description: "Natural language search — anything the user says works here" },
      folder: { type: "string", description: "Filter to a folder (optional)" },
      tag: { type: "string", description: "Filter by tag (optional)" },
      saved_after: { type: "string", description: "ISO 8601 date filter (optional)" },
      saved_before: { type: "string", description: "ISO 8601 date filter (optional)" },
      limit: { type: "number", description: "Max results (default 20, max 50)" },
    },
    async ({ query, folder, tag, saved_after, saved_before, limit }) => {
      const maxResults = Math.min(Number(limit) || 20, 50);
      let results;

      try {
        if (query) {
          results = await searchBookmarks(supabase, uid, query, {
            limit: maxResults,
            withTimeout,
            folder,
            tag,
            saved_after,
            saved_before,
          });
        } else {
          // No query — fetch recent, with optional filters
          let q = supabase.from("bookmarks")
            .select("id, title, url, description, tags, folder_path, created_at")
            .eq("user_id", uid).is("deleted_at", null)
            .order("created_at", { ascending: false }).limit(maxResults);
          if (folder) q = q.eq("folder_path", folder);
          if (tag) q = q.contains("tags", [tag]);
          if (saved_after) q = q.gte("created_at", saved_after);
          if (saved_before) q = q.lte("created_at", saved_before);
          const { data, error } = await withTimeout(q);
          if (error) return { content: [{ type: "text", text: `❌ Search failed: ${error.message}` }] };
          results = data || [];
        }
      } catch (e) {
        return { content: [{ type: "text", text: `❌ Search failed: ${e.message}` }] };
      }

      if (!results.length) {
        return {
          content: [{
            type: "text", text: query
              ? `No bookmarks found for "${query}". Try a broader term, or use workspace_stats to see what topics you have.`
              : "No bookmarks found with the given filters."
          }]
        };
      }

      const lines = results.map(formatBookmark);
      return { content: [{ type: "text", text: `Found **${results.length}** bookmark(s):\n\n${lines.join("\n\n---\n\n")}` }] };
    }
  );

  server.tool(
    "list_by_folder",
    "List bookmarks in a specific folder, or show all top-level folders with counts. " +
    "Call with no folder argument to see folder overview.",
    {
      folder: { type: "string", description: "Folder path. Omit to get folder overview." },
      limit: { type: "number", description: "Max bookmarks (default 30)" },
    },
    async ({ folder, limit }) => {
      const max = Math.min(Number(limit) || 30, 100);
      if (!folder) {
        const { data, error } = await withTimeout(
          supabase.from("bookmarks").select("folder_path")
            .eq("user_id", uid).is("deleted_at", null).not("folder_path", "is", null)
        );
        if (error) return { content: [{ type: "text", text: `❌ ${error.message}` }] };
        const counts = {};
        (data || []).forEach((r) => {
          const top = String(r.folder_path).split("/")[0];
          counts[top] = (counts[top] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
        if (!sorted.length) return { content: [{ type: "text", text: "No folders found. All bookmarks are unsorted." }] };
        return {
          content: [{
            type: "text", text: `📁 **Your Folders** (${sorted.length}):\n\n` +
              sorted.map(([name, count]) => `• **${name}** — ${count} bookmark${count !== 1 ? "s" : ""}`).join("\n")
          }]
        };
      }

      const { data, error } = await withTimeout(
        supabase.from("bookmarks")
          .select("id, title, url, description, tags, created_at")
          .eq("user_id", uid).eq("folder_path", folder).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(max)
      );
      if (error) return { content: [{ type: "text", text: `❌ ${error.message}` }] };
      if (!data?.length) return { content: [{ type: "text", text: `Folder **${folder}** is empty.` }] };
      return {
        content: [{
          type: "text", text: `📁 **${folder}** — ${data.length} bookmark(s):\n\n` +
            data.map(formatBookmark).join("\n\n")
        }]
      };
    }
  );

  server.tool(
    "get_tags",
    "List all tags in the library with usage counts, sorted by most-used. " +
    "Use before suggesting tags or to understand the user's taxonomy.",
    {},
    async () => {
      const { data, error } = await withTimeout(
        supabase.from("bookmarks").select("tags")
          .eq("user_id", uid).is("deleted_at", null).not("tags", "is", null)
      );
      if (error) return { content: [{ type: "text", text: `❌ ${error.message}` }] };
      const counts = {};
      (data || []).forEach((r) => {
        if (Array.isArray(r.tags)) r.tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
      });
      const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
      if (!sorted.length) return { content: [{ type: "text", text: "No tags found yet." }] };
      return {
        content: [{
          type: "text", text: `🏷 **Your Tags** (${sorted.length} unique):\n\n` +
            sorted.map(([tag, count]) => `• **${tag}** (${count})`).join("\n")
        }]
      };
    }
  );

  // ── Layer 3: Analysis ──────────────────────────────────────────────────────

  server.tool(
    "most_visited",
    "List the user's most frequently visited bookmarks, including visit counts and last-visited dates. " +
    "Use when asked which saved links they use most or when they last visited a bookmark.",
    { limit: { type: "number", description: "Maximum results (default 10, max 50)" } },
    async ({ limit }) => {
      const max = Math.max(1, Math.min(Math.floor(Number(limit) || 10), 50));
      const { data, error } = await withTimeout(
        supabase.from("bookmarks")
          .select("title, url, folder_path, visit_count, last_visited_at")
          .eq("user_id", uid).is("deleted_at", null).gt("visit_count", 0)
          .order("visit_count", { ascending: false })
          .order("last_visited_at", { ascending: false, nullsFirst: false })
          .limit(max)
      );
      if (error) return { content: [{ type: "text", text: `❌ Failed to load visit statistics: ${error.message}` }] };
      if (!data?.length) {
        return { content: [{ type: "text", text: "No bookmark visits have been tracked yet. Install or reload the Bookar browser extension and visit a saved bookmark." }] };
      }
      const lines = data.map((bookmark, index) =>
        `${index + 1}. **${bookmark.title ?? bookmark.url}** — ${bookmark.visit_count} visit(s)` +
        `${bookmark.last_visited_at ? `; last visited ${new Date(bookmark.last_visited_at).toLocaleString()}` : ""}` +
        `\n   ${bookmark.url}${bookmark.folder_path ? `\n   Folder: ${bookmark.folder_path}` : ""}`
      );
      return { content: [{ type: "text", text: `🔥 **Most Visited Bookmarks** (top ${data.length}):\n\n${lines.join("\n\n")}` }] };
    }
  );

  server.tool(
    "workspace_stats",
    "Get library health overview: total bookmarks, folders, tags, duplicates, top tags, oldest unsorted. " +
    "Use when user asks 'how many bookmarks do I have?' or wants a summary.",
    {},
    async () => {
      const [totalRes, foldersRes, tagsRes, oldestRes] = await Promise.all([
        withTimeout(supabase.from("bookmarks").select("id", { count: "exact", head: true }).eq("user_id", uid).is("deleted_at", null)),
        withTimeout(supabase.from("bookmarks").select("folder_path").eq("user_id", uid).is("deleted_at", null).not("folder_path", "is", null)),
        withTimeout(supabase.from("bookmarks").select("tags").eq("user_id", uid).is("deleted_at", null).not("tags", "is", null)),
        withTimeout(supabase.from("bookmarks").select("title, url, created_at").eq("user_id", uid).is("deleted_at", null).is("folder_path", null).order("created_at", { ascending: true }).limit(1)),
      ]);
      const total = totalRes.count ?? 0;
      const folders = new Set((foldersRes.data || []).map((r) => String(r.folder_path).split("/")[0]));
      const tagCounts = {};
      (tagsRes.data || []).forEach((r) => {
        if (Array.isArray(r.tags)) r.tags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      });
      const topTags = Object.entries(tagCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([t, c]) => `${t}(${c})`);
      const oldest = oldestRes.data?.[0];
      return {
        content: [{
          type: "text", text: [
            "📊 **Bookar Workspace Stats**", "",
            `• Total bookmarks: **${total}**`,
            `• Top-level folders: **${folders.size}**`,
            `• Unique tags: **${Object.keys(tagCounts).length}**`,
            `• Top tags: ${topTags.length ? topTags.join(", ") : "none yet"}`,
            oldest
              ? `• Oldest unsorted: **${oldest.title ?? oldest.url}** (${new Date(oldest.created_at).toLocaleDateString()})`
              : "• All bookmarks are organised in folders ✅",
          ].join("\n")
        }]
      };
    }
  );

  server.tool(
    "find_duplicates",
    "Find bookmarks with duplicate URLs in the library. Returns groups sorted by most-duplicated. " +
    "Use when user wants to clean up or audit their library.",
    { limit: { type: "number", description: "Max duplicate groups (default 10)" } },
    async ({ limit }) => {
      const max = Math.min(Number(limit) || 10, 50);
      const { data, error } = await withTimeout(
        supabase.from("bookmarks")
          .select("id, title, url, folder_path, created_at")
          .eq("user_id", uid).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(2000)
      );
      if (error) return { content: [{ type: "text", text: `❌ ${error.message}` }] };
      const groups = {};
      (data || []).forEach((bm) => {
        let norm = bm.url.trim().toLowerCase();
        try {
          const u = new URL(norm);
          u.hostname = u.hostname.replace(/^www\./, "");
          ["utm_source", "utm_medium", "utm_campaign", "ref"].forEach((p) => u.searchParams.delete(p));
          u.hash = "";
          norm = `${u.hostname}${u.pathname.replace(/\/$/, "")}${u.search}`;
        } catch { norm = norm.replace(/^https?:\/\//, "").replace(/\/$/, ""); }
        if (!groups[norm]) groups[norm] = [];
        groups[norm].push(bm);
      });
      const dupes = Object.entries(groups)
        .filter(([, bms]) => bms.length > 1)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, max);
      if (!dupes.length) return { content: [{ type: "text", text: "✅ No duplicates found!" }] };
      const lines = dupes.map(([norm, bms]) =>
        `**\`${norm}\`** — ${bms.length} copies\n` +
        bms.map((bm) => `  • ${bm.title ?? bm.url} | ${bm.folder_path ?? "unsorted"} | ${new Date(bm.created_at).toLocaleDateString()} | ID: \`${bm.id}\``).join("\n")
      );
      return {
        content: [{
          type: "text", text: `Found **${dupes.length}** duplicate group(s) (${(data || []).length} scanned):\n\n${lines.join("\n\n")}\n\nUse delete_bookmark to remove copies.`
        }]
      };
    }
  );

  server.tool(
    "analyse_topic",
    "Deep analysis of a topic from saved bookmarks: groups by folder, shows related tags, and summarises coverage. " +
    "Use when user asks 'what do I have on X?' or 'summarise my bookmarks about Y'.",
    { topic: { type: "string", description: "Topic to analyse (e.g. 'design', 'databases', 'ai tools')" } },
    async ({ topic }) => {
      if (!topic) return { content: [{ type: "text", text: "❌ `topic` is required." }] };
      let data;
      try { data = await searchBookmarks(supabase, uid, topic, { limit: 40, withTimeout }); }
      catch (e) { return { content: [{ type: "text", text: `❌ ${e.message}` }] }; }
      if (!data?.length) return { content: [{ type: "text", text: `No bookmarks found about "${topic}".` }] };

      const byFolder = {};
      const allTags = {};
      data.forEach((bm) => {
        const folder = bm.folder_path ?? "📌 Unsorted";
        if (!byFolder[folder]) byFolder[folder] = [];
        byFolder[folder].push(bm);
        if (Array.isArray(bm.tags)) bm.tags.forEach((t) => { allTags[t] = (allTags[t] || 0) + 1; });
      });
      const topTags = Object.entries(allTags).sort(([, a], [, b]) => b - a).slice(0, 8).map(([t]) => `\`${t}\``);
      const sections = Object.entries(byFolder).map(([folder, bms]) =>
        `**📁 ${folder}** (${bms.length})\n` +
        bms.slice(0, 5).map((bm) => `  • ${bm.title ?? bm.url}${bm.description ? ` — ${bm.description.slice(0, 80)}` : ""}`).join("\n")
      );

      return {
        content: [{
          type: "text", text: [
            `🔍 **Topic Analysis: "${topic}"**`,
            `Found **${data.length}** bookmarks across **${Object.keys(byFolder).length}** folder(s).`,
            topTags.length ? `Related tags: ${topTags.join(", ")}` : "",
            "",
            sections.join("\n\n"),
          ].filter(Boolean).join("\n")
        }]
      };
    }
  );

  // ── Layer 4: Power / Context ───────────────────────────────────────────────

  server.tool(
    "context_pack",
    "⭐ Most powerful tool. Returns everything the user knows about a topic: bookmarks grouped by folder, " +
    "tag cloud, and resource map. Use for research, reading lists, or 'show me everything about X'. " +
    "Understands intent — 'startup ideas', 'AI tools', 'CSS inspiration' all work.",
    {
      goal: { type: "string", description: "Goal or topic in plain English" },
      max_per_group: { type: "number", description: "Max bookmarks per folder group (default 5)" },
    },
    async ({ goal, max_per_group }) => {
      if (!goal) return { content: [{ type: "text", text: "❌ `goal` is required." }] };
      const maxPer = Math.min(Number(max_per_group) || 5, 10);
      let data;
      try { data = await searchBookmarks(supabase, uid, goal, { limit: 60, withTimeout }); }
      catch (e) { return { content: [{ type: "text", text: `❌ ${e.message}` }] }; }
      if (!data?.length) return { content: [{ type: "text", text: `No bookmarks found for "${goal}". Try a broader topic.` }] };

      const byFolder = {};
      const tagCloud = {};
      data.forEach((bm) => {
        const folder = bm.folder_path ?? "📌 Unsorted";
        if (!byFolder[folder]) byFolder[folder] = [];
        byFolder[folder].push(bm);
        if (Array.isArray(bm.tags)) bm.tags.forEach((t) => { tagCloud[t] = (tagCloud[t] || 0) + 1; });
      });
      const sortedTags = Object.entries(tagCloud).sort(([, a], [, b]) => b - a).slice(0, 12).map(([t, c]) => `${t}(${c})`);
      const sections = Object.entries(byFolder)
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([folder, bms]) => {
          const shown = bms.slice(0, maxPer);
          const more = bms.length - shown.length;
          return `**📁 ${folder}** — ${bms.length} resource${bms.length !== 1 ? "s" : ""}${more > 0 ? ` (+${more} more)` : ""}\n` +
            shown.map((bm) => `  • [${bm.title ?? bm.url}](${bm.url})${bm.description ? `\n    ${bm.description.slice(0, 100)}` : ""}`).join("\n");
        });

      return {
        content: [{
          type: "text", text: [
            `🧠 **Context Pack: "${goal}"**`, "",
            `📊 **Overview**`,
            `• ${data.length} relevant bookmarks across ${Object.keys(byFolder).length} folder(s)`,
            sortedTags.length ? `• Tag cloud: ${sortedTags.join(" · ")}` : "",
            "",
            `📚 **Resources by Topic**`, "",
            sections.join("\n\n"),
          ].filter(Boolean).join("\n")
        }]
      };
    }
  );

  server.tool(
    "bulk_tag",
    "Apply a tag to all bookmarks matching a keyword. Use for batch organisation.",
    {
      keyword: { type: "string", description: "Keyword — matching bookmarks get the tag" },
      tag: { type: "string", description: "Tag to apply" },
    },
    async ({ keyword, tag }) => {
      if (!keyword || !tag) return { content: [{ type: "text", text: "❌ Both `keyword` and `tag` are required." }] };
      const cleanTag = tag.trim().toLowerCase();
      let found;
      try { found = await searchBookmarks(supabase, uid, keyword, { limit: 100, withTimeout }); }
      catch (e) { return { content: [{ type: "text", text: `❌ ${e.message}` }] }; }
      if (!found?.length) return { content: [{ type: "text", text: `No bookmarks found matching "${keyword}".` }] };

      const toUpdate = found.filter((bm) => {
        const existing = Array.isArray(bm.tags) ? bm.tags.map((t) => t.toLowerCase()) : [];
        return !existing.includes(cleanTag);
      });
      if (!toUpdate.length) return { content: [{ type: "text", text: `✅ All ${found.length} matching bookmarks already have the tag "${cleanTag}".` }] };

      let updated = 0;
      const CHUNK = 10;
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        await Promise.all(
          toUpdate.slice(i, i + CHUNK).map(async (bm) => {
            const newTags = [...(Array.isArray(bm.tags) ? bm.tags : []), cleanTag];
            const { error } = await withTimeout(
              supabase.from("bookmarks").update({ tags: newTags, updated_at: new Date().toISOString() }).eq("id", bm.id).eq("user_id", uid)
            );
            if (!error) updated++;
          })
        );
      }
      return { content: [{ type: "text", text: `🏷 Applied tag **"${cleanTag}"** to **${updated}** bookmark(s) matching "${keyword}" (${found.length - toUpdate.length} already had it).` }] };
    }
  );

  return server;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
async function handleHttpRequest(req, res) {
  const setCors = () => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id, MCP-Protocol-Version, X-Api-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  };

  setCors();

  try {
    const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = urlObj.pathname.replace(/\/+$/, "") || "/";

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Claude and other MCP clients probe OAuth metadata before connecting.
    // API-key-in-URL connectors use this server as a custom/no-auth integration,
    // so do not advertise an OAuth authorization flow that is not implemented.
    if (
      pathname === "/.well-known/oauth-protected-resource"
      || pathname === "/.well-known/oauth-protected-resource/api/mcp"
      || pathname === "/.well-known/oauth-authorization-server"
      || pathname === "/.well-known/openid-configuration"
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        resource: `${urlObj.protocol}//${urlObj.host}/api/mcp`,
        authorization_servers: [],
        bearer_methods_supported: ["header", "query"],
      }));
      return;
    }

  // Health / warmup (no auth)
    if (pathname === "/health" || pathname === "/api/mcp/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "bookar-mcp", version: "2.0.0" }));
      return;
    }

    const isMcpRoute = pathname === "/api/mcp" || pathname === "/mcp";
    if (!isMcpRoute) {
      res.writeHead(404);
      res.end();
      return;
    }

    // AI platforms probe the endpoint before attempting authenticated requests.
    if (req.method === "GET" && !req.headers.authorization && !urlObj.searchParams.get("api_key")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "bookar-mcp", version: "2.0.0", auth: "required", tools: 15 }));
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const authHeader = req.headers.authorization ?? "";
    const rawKey = authHeader.replace(/^Bearer\s+/i, "").trim()
      || urlObj.searchParams.get("api_key")
      || urlObj.searchParams.get("key")
      || "";

    if (!rawKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing API key. Pass as Authorization: Bearer <key> or ?api_key=<key>" }));
      return;
    }

    const device = await verifyKey(rawKey);
    if (!device) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or revoked API key" }));
      return;
    }

    if (
      req.method === "GET"
      && !String(req.headers.accept || "").includes("text/event-stream")
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        server: "bookar-mcp",
        version: "2.0.0",
        authenticated: true,
        tools: 15,
        mcpEndpoint: `/api/mcp`,
      }));
      return;
    }

    const mcpServer = createBookarMcpServer(device.user_id, device.id);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } finally {
      await transport.close().catch(() => {});
    }
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

module.exports = handleHttpRequest;

if (require.main === module) {
  http.createServer(handleHttpRequest).listen(PORT, "0.0.0.0", () => {
    console.log(`Bookar MCP v2 listening on :${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/api/mcp`);
    console.log("Tools: 15 (intent-aware search engine active)");
  });
}
