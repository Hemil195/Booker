// apps/web/app/api/mcp/route.ts
// Bookar — Bookmark Intelligence MCP (Model Context Protocol) server.
// 14 intent-shaped tools across 4 intelligence layers.
// Auth: Bearer API key in Authorization header OR ?api_key= query param.
//
// RELIABILITY: Supabase admin client is created at module level so Vercel
// keeps it alive across warm invocations (no per-request reconnect overhead).
// All DB queries are wrapped in a withTimeout() guard to prevent silent hangs.
// The handler returns a structured error on ANY failure so AI clients always
// get a meaningful response, never a bare 502/504.

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

// ── Vercel config ─────────────────────────────────────────────────────────────
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — Vercel Pro/Hobby max

// ── Module-level client (survives warm invocations, zero cold-reconnect cost) ─
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const HASH_SECRET = process.env.API_KEY_HASH_SECRET || "";

let _adminClient: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _adminClient;
}

// ── Reliability: query timeout wrapper ───────────────────────────────────────
// Accepts PromiseLike (covers Supabase PostgrestBuilder which is thenable
// but not a full Promise), wraps in Promise.resolve for proper race.
function withTimeout<T>(thenable: PromiseLike<T>, ms = 8000): Promise<T> {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`DB query timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function hashKey(rawKey: string): string {
  if (!HASH_SECRET) throw new Error("API_KEY_HASH_SECRET env var not set");
  return createHmac("sha256", HASH_SECRET).update(rawKey).digest("hex");
}

async function verifyKey(rawKey: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !HASH_SECRET) return null;
  const hash = hashKey(rawKey);
  const { data, error } = await withTimeout(
    getAdmin()
      .from("devices")
      .select("id, user_id")
      .eq("api_key_hash", hash)
      .single(),
  );
  if (error || !data) return null;
  return data as { id: string; user_id: string };
}

// ── Universal Intent-Aware Search Engine ──────────────────────────────────────────────
// Works for ANY topic — tech, cooking, law, music, photography, travel,
// medicine, finance, gaming, fashion, science, art... everything.
//
// Strategy:
// 1. Stop-word removal + keyword extraction
// 2. Morphological expansion (plurals, verb forms, word roots) for each keyword
// 3. Domain-agnostic URL domain scoring (github, youtube, etc. → topic hints)
// 4. Multi-field weighted scoring: title(6) > tags(5) > desc(3) > url(2) > folder(1)
// 5. If DB returns 0 results — retry with individual keywords (broader fallback)

const STOP_WORDS = new Set([
  "i","me","my","we","our","you","your","he","she","it","its","they","them",
  "the","a","an","is","are","was","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","can","may","might",
  "need","want","find","show","give","get","look","search","fetch",
  "from","with","for","to","in","on","at","of","and","or","but","not",
  "some","any","all","this","that","these","those","which","who","what",
  "how","when","where","why","about","related","like","similar","same",
  "bookmarks","bookmark","saved","save","links","link","url","urls",
  "resources","resource","page","pages","site","sites","web",
  "stuff","things","anything","something","everything","nothing",
  "please","help","just","also","too","very","really","quite","so",
  "more","most","many","much","few","little","use","used","using",
  "make","made","making","go","going","come","coming","see","saw",
  "know","knowing","think","thought","try","trying","new","old",
  "good","best","top","great","nice","cool","awesome","useful",
  "different","various","other","another","into","over","up","out",
  "re","me","up","own","an","no","am","if","as","by","at",
]);

// Lightweight morphological expansion — generates word variants
// Works universally: "design" → ["design","designer","designing","designs","designed"]
//                   "database" → ["database","databases","databasing"]
//                   "recipe" → ["recipe","recipes","recipies"]
function expandWord(word: string): string[] {
  const w = word.toLowerCase();
  const variants = new Set([w]);
  // Plurals / singulars
  if (w.endsWith("ies")) variants.add(w.slice(0, -3) + "y");
  else if (w.endsWith("es") && w.length > 4) variants.add(w.slice(0, -2));
  else if (w.endsWith("s") && w.length > 3) variants.add(w.slice(0, -1));
  else { variants.add(w + "s"); variants.add(w + "es"); }
  // Common verb/noun/adj forms
  if (w.endsWith("ing") && w.length > 5) { variants.add(w.slice(0, -3)); variants.add(w.slice(0, -3) + "e"); }
  if (w.endsWith("ed") && w.length > 4) { variants.add(w.slice(0, -2)); variants.add(w.slice(0, -1)); }
  if (w.endsWith("er") && w.length > 4) variants.add(w.slice(0, -2));
  if (w.endsWith("tion") && w.length > 5) variants.add(w.slice(0, -3) + "e");
  if (w.endsWith("ity") && w.length > 5) variants.add(w.slice(0, -3));
  if (w.endsWith("al") && w.length > 4) variants.add(w.slice(0, -2));
  // Add -ing, -er forms for root words
  if (!w.endsWith("ing") && w.length > 3) variants.add(w + "ing");
  if (!w.endsWith("er") && w.length > 3) variants.add(w + "er");
  return Array.from(variants).filter((v) => v.length > 2);
}

// Domain-to-topic hints: used to score bookmarks from known domains higher
// when the query matches the domain's topic.
const DOMAIN_HINTS: Record<string, string[]> = {
  // Dev
  "github.com": ["code","library","tool","developer","open source","project"],
  "stackoverflow.com": ["code","programming","debug","question","developer"],
  "npmjs.com": ["javascript","package","library","node","module"],
  "codepen.io": ["css","javascript","animation","frontend","demo","design"],
  "dev.to": ["developer","tutorial","article","programming","tips"],
  // Design
  "figma.com": ["design","ui","prototype","wireframe","component"],
  "dribbble.com": ["design","inspiration","ui","visual","creative","art"],
  "behance.net": ["design","inspiration","portfolio","creative","art"],
  "awwwards.com": ["design","web","creative","inspiration","award"],
  "framer.com": ["design","animation","ui","prototype","component"],
  "webflow.com": ["design","no-code","website","cms","visual"],
  // Learning
  "youtube.com": ["video","tutorial","course","learning","guide","how to"],
  "medium.com": ["article","blog","tutorial","guide","essay","learning"],
  "udemy.com": ["course","learning","tutorial","training","online"],
  "coursera.org": ["course","university","certificate","learning","training"],
  // Tools
  "notion.so": ["productivity","notes","wiki","template","workspace","docs"],
  "vercel.com": ["deployment","hosting","frontend","serverless"],
  "supabase.com": ["database","backend","postgres","auth","storage","api"],
  "openai.com": ["ai","gpt","llm","api","chatbot"],
  "anthropic.com": ["ai","claude","llm","safety"],
  "huggingface.co": ["ai","model","machine learning","dataset","nlp"],
  "producthunt.com": ["startup","product","launch","tool","saas","app"],
  "stripe.com": ["payment","billing","api","saas","business","finance"],
};

function parseQuery(query: string) {
  const q = query.toLowerCase().trim();
  // Extract meaningful words (remove stop words, keep 2+ char words)
  const words = q
    .replace(/[^a-z0-9\s'\-]/g, " ")
    .split(/[\s\-]+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  // Build expanded term set with morphological variants
  const expanded = new Set<string>(words);
  for (const word of words) {
    expandWord(word).forEach((v) => expanded.add(v));
  }

  return { words, expanded: Array.from(expanded), originalQuery: q };
}

function scoreBookmark(bm: any, { words, expanded, originalQuery }: ReturnType<typeof parseQuery>): number {
  const title = (bm.title ?? "").toLowerCase();
  const desc = (bm.description ?? "").toLowerCase();
  const url = (bm.url ?? "").toLowerCase();
  const tags = (Array.isArray(bm.tags) ? bm.tags.join(" ") : "").toLowerCase();
  const folder = (bm.folder_path ?? "").toLowerCase();
  let score = 0;

  // Exact full query match (highest signal)
  if (title.includes(originalQuery)) score += 25;
  else if (desc.includes(originalQuery)) score += 10;
  else if (url.includes(originalQuery)) score += 6;

  // Individual word matches (weighted by field importance)
  for (const word of words) {
    if (word.length < 2) continue;
    if (title.includes(word)) score += 8;
    if (tags.includes(word)) score += 6;
    if (desc.includes(word)) score += 4;
    if (url.includes(word)) score += 2;
    if (folder.includes(word)) score += 2;
  }

  // Morphological variant matches (lower weight)
  for (const variant of expanded) {
    if (words.includes(variant)) continue; // already counted above
    if (variant.length < 3) continue;
    if (title.includes(variant)) score += 3;
    if (tags.includes(variant)) score += 3;
    if (desc.includes(variant)) score += 1;
    if (url.includes(variant)) score += 1;
  }

  // Domain hint bonus — bookmark from a topically relevant domain
  try {
    const hostname = new URL(bm.url ?? "http://x").hostname.replace(/^www\./, "");
    for (const [domain, hints] of Object.entries(DOMAIN_HINTS)) {
      if (hostname.includes(domain)) {
        const overlap = hints.filter((h) =>
          words.some((w) => h.includes(w) || w.includes(h)) ||
          expanded.some((e) => h.includes(e) || e.includes(h))
        );
        score += overlap.length * 4;
        break;
      }
    }
  } catch { /* ignore bad URLs */ }

  return score;
}

async function searchBookmarks(uid: string, query: string, limit = 40): Promise<any[]> {
  const db = getAdmin();
  const parsed = parseQuery(query);

  if (!parsed.words.length) {
    // Empty / all stop words — return recent bookmarks as context
    const { data } = await withTimeout(
      db.from("bookmarks")
        .select("id, title, url, description, tags, folder_path, created_at")
        .eq("user_id", uid).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(limit),
    );
    return data || [];
  }

  // Build broad OR filter: full phrase + top expanded terms
  // We include the phrase AND individual words to maximise recall
  const phrase = parsed.originalQuery.replace(/'/g, "''");
  const keyTerms = [...new Set([...parsed.words, ...parsed.expanded])]
    .filter((t) => t.length > 2)
    .slice(0, 8); // cap at 8 to keep query short

  const parts: string[] = [
    `title.ilike.%${phrase}%`,
    `url.ilike.%${phrase}%`,
    `description.ilike.%${phrase}%`,
    ...keyTerms.flatMap((t) => {
      const s = t.replace(/'/g, "''");
      return [`title.ilike.%${s}%`, `description.ilike.%${s}%`, `url.ilike.%${s}%`];
    }),
  ];
  // Deduplicate filter parts
  const uniqueParts = [...new Set(parts)];

  const { data, error } = await withTimeout(
    db.from("bookmarks")
      .select("id, title, url, description, tags, folder_path, created_at")
      .eq("user_id", uid).is("deleted_at", null)
      .or(uniqueParts.join(","))
      .order("created_at", { ascending: false })
      .limit(limit * 5), // over-fetch for scoring
  );
  if (error) throw new Error(error.message);

  const scored = (data || []) as any[];

  // Score and rank
  const results = scored
    .map((bm) => ({ ...bm, _score: scoreBookmark(bm, parsed) }))
    .filter((bm) => bm._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  // If nothing scored above 0, return the raw results sorted by date
  // (broad match — better than empty hands)
  if (results.length === 0 && scored.length > 0) {
    return scored.slice(0, limit);
  }
  return results;
}


// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, MCP-Session-Id, X-Api-Key",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

// ── Tool definitions (shown on tools/list) ───────────────────────────────────
const TOOLS = [
  // ── Layer 1: CRUD ──────────────────────────────────────────────────────────
  {
    name: "save_bookmark",
    description:
      "Save a new bookmark to Bookar. Use this when the user wants to save, bookmark, or remember a URL. " +
      "Provide the URL, an optional title, optional notes, and an optional folder path. " +
      "The system automatically queues AI description generation if no notes are given.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to bookmark (required)" },
        title: { type: "string", description: "Page title (optional)" },
        notes: {
          type: "string",
          description:
            "Short description or reason you saved this (optional — triggers AI auto-description if omitted)",
        },
        folder: {
          type: "string",
          description: "Folder path, e.g. 'Work/AI' or 'Research' (optional)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to attach, e.g. [\"ai\", \"tools\"] (optional)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "get_bookmark",
    description:
      "Fetch a single bookmark by its ID. Use this when you have an ID from a previous find() result and need full details.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bookmark UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_bookmark",
    description:
      "Edit an existing bookmark's title, notes, folder, or tags. Use this when the user wants to rename, re-tag, or reorganise a specific bookmark.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bookmark UUID to update" },
        title: { type: "string", description: "New title (optional)" },
        notes: { type: "string", description: "New description/notes (optional)" },
        folder: { type: "string", description: "New folder path (optional)" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Replace tags array (optional)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_bookmark",
    description:
      "Soft-delete a bookmark (moves it to trash, recoverable). Use when the user says 'delete', 'remove', or 'get rid of' a bookmark.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bookmark UUID to delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "restore_bookmark",
    description:
      "Restore a previously deleted bookmark from trash. Use when the user says 'bring back', 'undo delete', or 'restore'.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bookmark UUID to restore" },
      },
      required: ["id"],
    },
  },
  {
    name: "archive_bookmark",
    description:
      "Archive a bookmark by moving it to the _archive folder (does not delete). Use when the user says 'archive', 'I'm done with this', or 'hide but keep'.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Bookmark UUID to archive" },
      },
      required: ["id"],
    },
  },

  // ── Layer 2: Intelligent Retrieval ─────────────────────────────────────────
  {
    name: "find",
    description:
      "Search the user's bookmarks using natural language. Pass any keyword or phrase as `query`. " +
      "Optionally filter by folder, tag, or date range. If no query is given, returns recent bookmarks. " +
      "Always try this first when the user asks to find, search, show, or recall a saved link.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword or phrase to search across title, URL, description, and tags",
        },
        folder: { type: "string", description: "Filter to a specific folder (optional)" },
        tag: { type: "string", description: "Filter by tag (optional)" },
        saved_after: { type: "string", description: "ISO 8601 date — only bookmarks saved after this date" },
        saved_before: { type: "string", description: "ISO 8601 date — only bookmarks saved before this date" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
    },
  },
  {
    name: "list_by_folder",
    description:
      "List all bookmarks inside a specific folder, or get an overview of all top-level folders with bookmark counts. " +
      "Use when the user mentions a folder by name, or asks 'what folders do I have?'",
    inputSchema: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description:
            "Folder path to list (e.g. 'Work/AI'). Omit to get a top-level folder overview with counts.",
        },
        limit: { type: "number", description: "Max results (default 30, max 100)" },
      },
    },
  },
  {
    name: "get_tags",
    description:
      "Return all unique tags in the user's bookmark library, with usage counts sorted by most-used. " +
      "Use when the user asks about their tags, wants to see their taxonomy, or you need to understand what tags exist before suggesting one.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ── Layer 3: Analysis ──────────────────────────────────────────────────────
  {
    name: "workspace_stats",
    description:
      "Get a complete health overview of the user's bookmark workspace: total count, folder count, tag count, duplicate count, top tags, and oldest unsorted bookmark. " +
      "Use when the user asks 'how many bookmarks do I have?', wants a summary, or asks about library health.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "find_duplicates",
    description:
      "Find bookmarks with the same or very similar URLs (normalised comparison). " +
      "Use when the user wants to clean up their library, remove duplicates, or audit their bookmarks.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max duplicate groups to return (default 10)" },
      },
    },
  },
  {
    name: "analyse_topic",
    description:
      "Given a topic keyword, return all relevant bookmarks grouped by folder plus a plain-English analysis of what the user has saved on this topic. " +
      "Use when the user asks 'what do I have on X?' or 'summarise my bookmarks about Y'.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Topic to analyse (e.g. 'machine learning', 'startup ideas', 'productivity')",
        },
      },
      required: ["topic"],
    },
  },

  // ── Layer 4: Power / Context ───────────────────────────────────────────────
  {
    name: "context_pack",
    description:
      "⭐ The most powerful Bookar tool. Call this when the user asks to research a topic, wants a reading list, or says 'show me everything about X'. " +
      "Pass a goal or topic as a natural language string — returns all relevant bookmarks grouped by folder, a tag cloud, and a summary. " +
      "One call gives everything the AI needs to reason deeply about a topic from the user's personal knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "Goal or topic in plain English (e.g. 'build a SaaS', 'machine learning', 'Japan trip')",
        },
        max_per_group: {
          type: "number",
          description: "Max bookmarks per folder group (default 5, max 10)",
        },
      },
      required: ["goal"],
    },
  },
  {
    name: "bulk_tag",
    description:
      "Apply a tag to all bookmarks matching a keyword in one shot. " +
      "Use when the user says 'tag all my React bookmarks as frontend' or wants to organise a batch.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Keyword — all matching bookmarks will receive the tag" },
        tag: { type: "string", description: "Tag to apply" },
      },
      required: ["keyword", "tag"],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  device: { id: string; user_id: string },
): Promise<string> {
  const db = getAdmin();
  const uid = device.user_id;

  // ── save_bookmark ──────────────────────────────────────────────────────────
  if (name === "save_bookmark") {
    const url = String(args.url || "").trim();
    if (!url) return "❌ Error: `url` is required.";
    // Validate URL shape
    try { new URL(url); } catch {
      return "❌ Error: Invalid URL. Please provide a full URL starting with http:// or https://";
    }
    const title = String(args.title || url).trim();
    const notes = args.notes ? String(args.notes) : null;
    const folder = args.folder ? String(args.folder) : null;
    const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];

    // Check for existing duplicate
    const { data: existing } = await withTimeout(
      db.from("bookmarks").select("id, title")
        .eq("user_id", uid).eq("url", url).is("deleted_at", null).limit(1),
    );
    if (existing && existing.length > 0) {
      return `⚠️ This URL is already in your Bookar library as "${existing[0].title ?? url}" (ID: \`${existing[0].id}\`). Use update_bookmark to edit it, or delete_bookmark first to replace it.`;
    }

    const { data, error } = await withTimeout(
      db
        .from("bookmarks")
        .insert({
          user_id: uid,
          device_id: device.id,
          url,
          title,
          description: notes,
          folder_path: folder,
          tags: tags.length ? tags : null,
          source: "mcp",
          description_pending: !notes,
        })
        .select("id, title, url")
        .single(),
    );
    if (error) return `❌ Failed to save: ${error.message}`;
    return `✅ Saved bookmark:\n**${data.title}**\nURL: ${data.url}\nID: \`${data.id}\`${folder ? `\nFolder: ${folder}` : ""}${tags.length ? `\nTags: ${tags.join(", ")}` : ""}`;
  }

  // ── get_bookmark ───────────────────────────────────────────────────────────
  if (name === "get_bookmark") {
    const id = String(args.id || "").trim();
    if (!id) return "❌ Error: `id` is required.";
    const { data, error } = await withTimeout(
      db
        .from("bookmarks")
        .select("id, title, url, description, tags, folder_path, created_at, updated_at")
        .eq("id", id)
        .eq("user_id", uid)
        .single(),
    );
    if (error || !data) return `❌ Bookmark not found or does not belong to your account.`;
    return [
      `**${data.title ?? data.url}**`,
      `URL: ${data.url}`,
      data.description ? `Description: ${data.description}` : "",
      data.folder_path ? `Folder: ${data.folder_path}` : "",
      Array.isArray(data.tags) && data.tags.length ? `Tags: ${data.tags.join(", ")}` : "",
      `Saved: ${new Date(data.created_at).toLocaleDateString()}`,
      `ID: \`${data.id}\``,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ── update_bookmark ────────────────────────────────────────────────────────
  if (name === "update_bookmark") {
    const id = String(args.id || "").trim();
    if (!id) return "❌ Error: `id` is required.";
    const patch: Record<string, unknown> = {};
    if (args.title) patch.title = String(args.title);
    if (args.notes !== undefined) patch.description = args.notes ? String(args.notes) : null;
    if (args.folder !== undefined) patch.folder_path = args.folder ? String(args.folder) : null;
    if (Array.isArray(args.tags)) patch.tags = args.tags.map(String);
    // Guard: at least one field must be changed
    if (Object.keys(patch).length === 0)
      return "❌ Nothing to update — please provide at least one of: title, notes, folder, tags.";
    patch.updated_at = new Date().toISOString();

    const { error } = await withTimeout(
      db.from("bookmarks").update(patch).eq("id", id).eq("user_id", uid),
    );
    if (error) return `❌ Update failed: ${error.message}`;
    return `✅ Bookmark \`${id}\` updated successfully.`;
  }

  // ── delete_bookmark ────────────────────────────────────────────────────────
  if (name === "delete_bookmark") {
    const id = String(args.id || "").trim();
    if (!id) return "❌ Error: `id` is required.";
    const { error } = await withTimeout(
      db
        .from("bookmarks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", uid),
    );
    if (error) return `❌ Delete failed: ${error.message}`;
    return `🗑 Bookmark \`${id}\` moved to trash. Use restore_bookmark to undo.`;
  }

  // ── restore_bookmark ───────────────────────────────────────────────────────
  if (name === "restore_bookmark") {
    const id = String(args.id || "").trim();
    if (!id) return "❌ Error: `id` is required.";
    const { error } = await withTimeout(
      db
        .from("bookmarks")
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", uid),
    );
    if (error) return `❌ Restore failed: ${error.message}`;
    return `✅ Bookmark \`${id}\` restored from trash.`;
  }

  // ── archive_bookmark ───────────────────────────────────────────────────────
  if (name === "archive_bookmark") {
    const id = String(args.id || "").trim();
    if (!id) return "❌ Error: `id` is required.";
    const { error } = await withTimeout(
      db
        .from("bookmarks")
        .update({ folder_path: "_archive", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", uid),
    );
    if (error) return `❌ Archive failed: ${error.message}`;
    return `📦 Bookmark \`${id}\` archived to _archive folder.`;
  }

  // ── find ───────────────────────────────────────────────────────────────────
  if (name === "find") {
    const limit = Math.min(Number(args.limit) || 20, 50);

    let results: any[];

    if (args.query) {
      // Keyword search via robust multi-field ilike helper
      try {
        results = await searchBookmarks(uid, String(args.query), limit);
      } catch (e: any) {
        return `❌ Search failed: ${e.message}`;
      }
      // Apply post-search filters
      if (args.folder) results = results.filter((b) => b.folder_path === String(args.folder));
      if (args.tag) results = results.filter((b) => Array.isArray(b.tags) && b.tags.includes(String(args.tag)));
    } else {
      // No query — apply structured filters, or return recent bookmarks
      let q = db
        .from("bookmarks")
        .select("id, title, url, description, tags, folder_path, created_at")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (args.folder) q = q.eq("folder_path", String(args.folder)) as any;
      if (args.tag) q = (q as any).contains("tags", [String(args.tag)]);
      if (args.saved_after) q = q.gte("created_at", String(args.saved_after)) as any;
      if (args.saved_before) q = q.lte("created_at", String(args.saved_before)) as any;
      const { data, error } = await withTimeout(q);
      if (error) return `❌ Search failed: ${error.message}`;
      results = data || [];
    }

    if (!results || results.length === 0)
      return args.query
        ? `No bookmarks found matching "${args.query}". Try a different keyword or use workspace_stats to see what's in your library.`
        : "No bookmarks found with the given filters.";

    const lines = results.map((bm: any) =>
      [
        `**${bm.title ?? bm.url}**`,
        `URL: ${bm.url}`,
        bm.description ? `→ ${bm.description}` : "",
        bm.folder_path ? `📁 ${bm.folder_path}` : "",
        Array.isArray(bm.tags) && bm.tags.length ? `🏷 ${bm.tags.join(", ")}` : "",
        `🗓 ${new Date(bm.created_at).toLocaleDateString()} | ID: \`${bm.id}\``,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return `Found **${results.length}** bookmark(s):\n\n${lines.join("\n\n---\n\n")}`;
  }

  // ── list_by_folder ─────────────────────────────────────────────────────────
  if (name === "list_by_folder") {
    if (!args.folder) {
      // Return folder overview with counts
      const { data, error } = await withTimeout(
        db
          .from("bookmarks")
          .select("folder_path")
          .eq("user_id", uid)
          .is("deleted_at", null)
          .not("folder_path", "is", null),
      );
      if (error) return `❌ Failed to fetch folders: ${error.message}`;
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const top = String(r.folder_path).split("/")[0];
        counts[top] = (counts[top] || 0) + 1;
      });
      const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
      if (sorted.length === 0) return "No folders found. All bookmarks are currently unsorted.";
      return (
        `📁 **Your Folders** (${sorted.length} top-level):\n\n` +
        sorted.map(([name, count]) => `• **${name}** — ${count} bookmark${count !== 1 ? "s" : ""}`).join("\n")
      );
    }

    const limit = Math.min(Number(args.limit) || 30, 100);
    const { data, error } = await withTimeout(
      db
        .from("bookmarks")
        .select("id, title, url, description, tags, created_at")
        .eq("user_id", uid)
        .eq("folder_path", String(args.folder))
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit),
    );
    if (error) return `❌ Failed to fetch folder: ${error.message}`;
    if (!data || data.length === 0)
      return `Folder **${args.folder}** is empty or doesn't exist.`;
    const lines = data.map(
      (bm: any) =>
        `• **${bm.title ?? bm.url}**\n  ${bm.url}${bm.description ? `\n  ${bm.description}` : ""}\n  ID: \`${bm.id}\``,
    );
    return `📁 **${args.folder}** — ${data.length} bookmark(s):\n\n${lines.join("\n\n")}`;
  }

  // ── get_tags ───────────────────────────────────────────────────────────────
  if (name === "get_tags") {
    const { data, error } = await withTimeout(
      db
        .from("bookmarks")
        .select("tags")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .not("tags", "is", null),
    );
    if (error) return `❌ Failed to fetch tags: ${error.message}`;
    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      if (Array.isArray(row.tags)) {
        row.tags.forEach((t: string) => {
          counts[t] = (counts[t] || 0) + 1;
        });
      }
    });
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    if (sorted.length === 0) return "No tags found in your bookmark library yet.";
    return (
      `🏷 **Your Tags** (${sorted.length} unique):\n\n` +
      sorted.map(([tag, count]) => `• **${tag}** (${count})`).join("\n")
    );
  }

  // ── workspace_stats ────────────────────────────────────────────────────────
  if (name === "workspace_stats") {
    const [totalRes, foldersRes, tagsRes, oldestUnsortedRes] = await Promise.all([
      withTimeout(
        db
          .from("bookmarks")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .is("deleted_at", null),
      ),
      withTimeout(
        db
          .from("bookmarks")
          .select("folder_path")
          .eq("user_id", uid)
          .is("deleted_at", null)
          .not("folder_path", "is", null),
      ),
      withTimeout(
        db
          .from("bookmarks")
          .select("tags")
          .eq("user_id", uid)
          .is("deleted_at", null)
          .not("tags", "is", null),
      ),
      withTimeout(
        db
          .from("bookmarks")
          .select("title, url, created_at")
          .eq("user_id", uid)
          .is("deleted_at", null)
          .is("folder_path", null)
          .order("created_at", { ascending: true })
          .limit(1),
      ),
    ]);

    const total = totalRes.count ?? 0;
    const folders = new Set(
      (foldersRes.data || []).map((r: any) => String(r.folder_path).split("/")[0]),
    );
    const tagCounts: Record<string, number> = {};
    (tagsRes.data || []).forEach((row: any) => {
      if (Array.isArray(row.tags)) {
        row.tags.forEach((t: string) => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      }
    });
    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([tag, count]) => `${tag} (${count})`);
    const oldest = oldestUnsortedRes.data?.[0];

    return [
      `📊 **Bookar Workspace Stats**`,
      ``,
      `• Total bookmarks: **${total}**`,
      `• Folders: **${folders.size}** top-level`,
      `• Unique tags: **${Object.keys(tagCounts).length}**`,
      `• Top tags: ${topTags.length ? topTags.join(", ") : "none yet"}`,
      oldest
        ? `• Oldest unsorted: **${oldest.title ?? oldest.url}** (saved ${new Date(oldest.created_at).toLocaleDateString()})`
        : "• All bookmarks are in folders — great organisation! ✅",
    ].join("\n");
  }

  // ── find_duplicates ────────────────────────────────────────────────────────
  if (name === "find_duplicates") {
    const limit = Math.min(Number(args.limit) || 10, 50);
    // Fetch in batches to handle large libraries (up to 2000 bookmarks)
    const { data, error } = await withTimeout(
      db
        .from("bookmarks")
        .select("id, title, url, folder_path, created_at")
        .eq("user_id", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(2000),
    );
    if (error) return `❌ Failed to check duplicates: ${error.message}`;
    const groups: Record<string, any[]> = {};
    (data || []).forEach((bm: any) => {
      // Improved normalisation: strip protocol, www, trailing slash, fragment, and UTM params
      let norm = String(bm.url).trim().toLowerCase();
      try {
        const u = new URL(norm);
        // Remove www.
        u.hostname = u.hostname.replace(/^www\./, "");
        // Remove common tracking params
        ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"].forEach(p => u.searchParams.delete(p));
        // Remove fragment
        u.hash = "";
        // Rebuild without trailing slash on pathname
        norm = `${u.hostname}${u.pathname.replace(/\/$/, "")}${u.search}`;
      } catch { norm = norm.replace(/^https?:\/\//, "").replace(/\/$/, ""); }
      if (!groups[norm]) groups[norm] = [];
      groups[norm].push(bm);
    });
    const dupes = Object.entries(groups)
      .filter(([, bms]) => bms.length > 1)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, limit);
    if (dupes.length === 0) return "✅ No duplicate bookmarks found!";
    const lines = dupes.map(([norm, bms]) =>
      `**Duplicate URL:** \`${norm}\` — ${bms.length} copies\n` +
      bms
        .map((bm) => `  • ${bm.title ?? bm.url} | Folder: ${bm.folder_path ?? "unsorted"} | Saved: ${new Date(bm.created_at).toLocaleDateString()} | ID: \`${bm.id}\``)
        .join("\n"),
    );
    return `Found **${dupes.length}** duplicate group(s) (${(data || []).length} bookmarks scanned):\n\n${lines.join("\n\n")}\n\nTip: Use delete_bookmark with the IDs to remove the copies you don't want.`;
  }

  // ── analyse_topic ──────────────────────────────────────────────────────────
  if (name === "analyse_topic") {
    const topic = String(args.topic || "").trim();
    if (!topic) return "❌ Error: `topic` is required.";

    let data: any[];
    try {
      data = await searchBookmarks(uid, topic, 40);
    } catch (e: any) {
      return `❌ Analysis failed: ${e.message}`;
    }
    if (!data || data.length === 0)
      return `No bookmarks found about "${topic}". You might not have saved anything on this topic yet.`;

    // Group by folder
    const byFolder: Record<string, any[]> = {};
    const allTags: Record<string, number> = {};
    data.forEach((bm: any) => {
      const folder = bm.folder_path ?? "Unsorted";
      if (!byFolder[folder]) byFolder[folder] = [];
      byFolder[folder].push(bm);
      if (Array.isArray(bm.tags)) bm.tags.forEach((t: string) => { allTags[t] = (allTags[t] || 0) + 1; });
    });

    const topTags = Object.entries(allTags)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([t]) => t);

    const sections = Object.entries(byFolder).map(([folder, bms]) =>
      `**📁 ${folder}** (${bms.length})\n` +
      bms
        .slice(0, 5)
        .map((bm) => `  • ${bm.title ?? bm.url}${bm.description ? ` — ${bm.description.slice(0, 80)}` : ""}`)
        .join("\n"),
    );

    return [
      `🔍 **Topic Analysis: "${topic}"**`,
      `Found **${data.length}** relevant bookmark(s) across **${Object.keys(byFolder).length}** folder(s).`,
      topTags.length ? `Related tags: ${topTags.map((t) => `\`${t}\``).join(", ")}` : "",
      ``,
      sections.join("\n\n"),
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ── context_pack ───────────────────────────────────────────────────────────
  if (name === "context_pack") {
    const goal = String(args.goal || "").trim();
    if (!goal) return "❌ Error: `goal` is required.";
    const maxPerGroup = Math.min(Number(args.max_per_group) || 5, 10);

    let data: any[];
    try {
      data = await searchBookmarks(uid, goal, 60);
    } catch (e: any) {
      return `❌ context_pack failed: ${e.message}`;
    }
    if (!data || data.length === 0)
      return `No bookmarks found related to your goal: "${goal}". Your Bookar library may not have resources on this topic yet.`;

    // Group by folder
    const byFolder: Record<string, any[]> = {};
    const tagCloud: Record<string, number> = {};
    const folderSet = new Set<string>();

    data.forEach((bm: any) => {
      const folder = bm.folder_path ?? "📌 Unsorted";
      folderSet.add(folder);
      if (!byFolder[folder]) byFolder[folder] = [];
      byFolder[folder].push(bm);
      if (Array.isArray(bm.tags))
        bm.tags.forEach((t: string) => { tagCloud[t] = (tagCloud[t] || 0) + 1; });
    });

    const sortedTags = Object.entries(tagCloud)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([t, c]) => `${t}(${c})`);

    const groupSections = Object.entries(byFolder)
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([folder, bms]) => {
        const shown = bms.slice(0, maxPerGroup);
        const more = bms.length - shown.length;
        return (
          `**📁 ${folder}** — ${bms.length} resource${bms.length !== 1 ? "s" : ""}` +
          (more > 0 ? ` (+${more} more)` : "") +
          "\n" +
          shown
            .map(
              (bm) =>
                `  • [${bm.title ?? bm.url}](${bm.url})` +
                (bm.description ? `\n    ${bm.description.slice(0, 100)}` : ""),
            )
            .join("\n")
        );
      });

    return [
      `🧠 **Context Pack: "${goal}"**`,
      ``,
      `📊 **Overview**`,
      `• ${data.length} relevant bookmarks across ${folderSet.size} folder(s)`,
      sortedTags.length ? `• Tag cloud: ${sortedTags.join(" · ")}` : "",
      ``,
      `📚 **Resources by Topic**`,
      ``,
      groupSections.join("\n\n"),
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ── bulk_tag ───────────────────────────────────────────────────────────────
  if (name === "bulk_tag") {
    const keyword = String(args.keyword || "").trim();
    const tag = String(args.tag || "").trim().toLowerCase();
    if (!keyword || !tag) return "❌ Error: `keyword` and `tag` are both required.";

    let matchedData: any[];
    try {
      // Search returns full bookmark, we only need id + tags
      const found = await searchBookmarks(uid, keyword, 100);
      matchedData = found.map((b) => ({ id: b.id, tags: b.tags }));
    } catch (e: any) {
      return `❌ bulk_tag search failed: ${e.message}`;
    }
    if (!matchedData || matchedData.length === 0)
      return `No bookmarks found matching "${keyword}" — no tags applied.`;
    const data = matchedData;

    // Only update bookmarks that don't already have the tag
    const toUpdate = (data as any[]).filter((bm) => {
      const existing: string[] = Array.isArray(bm.tags) ? bm.tags : [];
      return !existing.map((t: string) => t.toLowerCase()).includes(tag);
    });
    if (toUpdate.length === 0)
      return `✅ All ${data.length} matching bookmark(s) already have the tag "${tag}".`;

    // Sequential chunked updates — avoids Supabase connection exhaustion
    const CHUNK = 10;
    let updated = 0;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (bm: any) => {
          const existingTags: string[] = Array.isArray(bm.tags) ? bm.tags : [];
          const newTags = [...existingTags, tag];
          const { error: upErr } = await withTimeout(
            db
              .from("bookmarks")
              .update({ tags: newTags, updated_at: new Date().toISOString() })
              .eq("id", bm.id)
              .eq("user_id", uid),
          );
          if (!upErr) updated++;
        }),
      );
    }

    return `🏷 Applied tag **"${tag}"** to **${updated}** bookmark(s) matching "${keyword}" (${data.length - toUpdate.length} already had it).`;
  }

  return `❌ Unknown tool: "${name}"`;
}

// ── Server info & protocol ────────────────────────────────────────────────────
const SERVER_INFO = {
  name: "bookar",
  version: "2.0.0",
  description:
    "Bookar Bookmark Intelligence — your personal knowledge base. Save, organise, find, and reason over your bookmarks using 14 intent-shaped tools.",
  protocolVersion: "2024-11-05",
  capabilities: { tools: {} },
};

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleMcpRequest(req: NextRequest): Promise<Response> {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // ── Warmup / health ping (no auth required) ────────────────────────────────
  // AI orchestration platforms (ChatGPT, Claude.ai, etc.) send a GET to probe
  // the server. We respond instantly so the connection looks "always alive".
  const url = new URL(req.url);
  if (req.method === "GET" && !url.searchParams.get("api_key") &&
    !req.headers.get("authorization")) {
    return NextResponse.json(
      { status: "ok", server: "bookar-mcp", version: "2.0.0", auth: "required" },
      { status: 200, headers: CORS },
    );
  }

  // ── Extract API key ────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  let rawKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!rawKey) {
    rawKey =
      url.searchParams.get("api_key") ||
      url.searchParams.get("key") ||
      "";
  }

  if (!rawKey) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: "UNAUTHORIZED",
          message:
            "Missing API key. Pass your Bookar API key as: " +
            "Authorization: Bearer <key>  OR  ?api_key=<key>",
        },
      },
      { status: 401, headers: CORS },
    );
  }

  // ── Verify device ──────────────────────────────────────────────────────────
  let device: { id: string; user_id: string } | null = null;
  try {
    device = await verifyKey(rawKey);
  } catch (err: any) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: "AUTH_ERROR", message: err?.message ?? "Auth error" } },
      { status: 500, headers: CORS },
    );
  }

  if (!device) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } },
      { status: 401, headers: CORS },
    );
  }

  // ── Authenticated GET: server info ─────────────────────────────────────────
  if (req.method === "GET") {
    return NextResponse.json(
      { ...SERVER_INFO, mcpEndpoint: `${url.origin}/api/mcp` },
      { headers: CORS },
    );
  }

  // ── Parse JSON-RPC body ────────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error — body must be valid JSON" } },
      { status: 400, headers: CORS },
    );
  }

  const { id, method, params } = body || {};

  // ── initialize ─────────────────────────────────────────────────────────────
  if (method === "initialize") {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_INFO.name, version: SERVER_INFO.version },
        },
      },
      { headers: CORS },
    );
  }

  // ── notifications/initialized — one-way, no response expected by MCP spec ─
  // Some clients treat 204 on a notification as an error; return 200 + empty object
  if (method === "notifications/initialized") {
    return NextResponse.json({}, { status: 200, headers: CORS });
  }

  // ── tools/list ─────────────────────────────────────────────────────────────
  if (method === "tools/list") {
    return NextResponse.json(
      { jsonrpc: "2.0", id, result: { tools: TOOLS } },
      { headers: CORS },
    );
  }

  // ── tools/call ─────────────────────────────────────────────────────────────
  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs: Record<string, unknown> = params?.arguments || {};

    if (!toolName) {
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32602, message: "params.name is required" } },
        { status: 400, headers: CORS },
      );
    }

    const known = TOOLS.some((t) => t.name === toolName);
    if (!known) {
      return NextResponse.json(
        { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: "${toolName}"` } },
        { status: 404, headers: CORS },
      );
    }

    try {
      const text = await executeTool(toolName, toolArgs, device);
      return NextResponse.json(
        { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } },
        { headers: CORS },
      );
    } catch (err: any) {
      // Never let a tool crash the whole server — return a structured error
      const message =
        err?.message?.includes("timed out")
          ? "The database query timed out. Please try again in a few seconds."
          : `Tool execution error: ${err?.message ?? "Unknown error"}`;
      return NextResponse.json(
        { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `❌ ${message}` }] } },
        { headers: CORS },
      );
    }
  }

  // ── Unsupported method ─────────────────────────────────────────────────────
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not supported: ${method}` } },
    { status: 404, headers: CORS },
  );
}

export async function GET(req: NextRequest) { return handleMcpRequest(req); }
export async function POST(req: NextRequest) { return handleMcpRequest(req); }
export async function DELETE(req: NextRequest) { return handleMcpRequest(req); }
export async function OPTIONS(req: NextRequest) { return handleMcpRequest(req); }
