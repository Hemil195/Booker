// supabase/functions/ingest-bookmark/index.ts
// Triggered by /api/sync-bookmark via Supabase invoke or HTTP POST
// Steps:
//   1. Validate device API key
//   2. On created/updated: fetch page title + meta description
//   3. Call NVIDIA NIM (meta/llama-3.1-8b-instruct) for description + tags
//   4. Upsert into bookmarks table
//   5. On deleted: soft-delete (set deleted_at)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY")!;
const NVIDIA_MODEL = Deno.env.get("NVIDIA_MODEL") ?? "meta/llama-3.1-8b-instruct";
const HASH_SECRET = Deno.env.get("API_KEY_HASH_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// HMAC-SHA256 hash (must match apps/web/lib/apiKey.ts)
// ---------------------------------------------------------------------------
async function hashKey(raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(HASH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Verify device API key → returns device row or throws
// ---------------------------------------------------------------------------
async function verifyDeviceKey(
  rawKey: string,
): Promise<{ id: string; user_id: string }> {
  const hash = await hashKey(rawKey);
  const { data, error } = await supabase
    .from("devices")
    .select("id, user_id")
    .eq("api_key_hash", hash)
    .single();
  if (error || !data) throw new Error("UNAUTHORIZED");
  return data;
}

// ---------------------------------------------------------------------------
// Fetch page title + meta description (og:description preferred)
// ---------------------------------------------------------------------------
async function fetchPageMeta(
  url: string,
): Promise<{ title: string | null; metaDescription: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Bookar/1.0 (+https://bookar.app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { title: null, metaDescription: null };
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) return { title: null, metaDescription: null };

    const title = doc.querySelector("title")?.textContent?.trim() ?? null;
    const og = doc
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content")
      ?.trim();
    const meta = doc
      .querySelector('meta[name="description"]')
      ?.getAttribute("content")
      ?.trim();
    return { title, metaDescription: og ?? meta ?? null };
  } catch {
    return { title: null, metaDescription: null };
  }
}

// ---------------------------------------------------------------------------
// Call NVIDIA NIM for description + tags
// Rate-limit: caller must throttle to ~1 req/sec for batch scenarios
// ---------------------------------------------------------------------------
async function generateDescription(
  pageTitle: string | null,
  metaDescription: string | null,
  bookmarkTitle: string | null,
): Promise<{ description: string | null; tags: string[] }> {
  const titleStr = pageTitle ?? bookmarkTitle ?? "Unknown page";
  const metaStr = metaDescription ?? "(no description available)";
  const prompt = `Given this page title and meta description, write ONE concise sentence describing what this tool/page is and when someone would use it. Then suggest 2-4 short lowercase tags.

Title: ${titleStr}
Meta description: ${metaStr}

Respond ONLY in this JSON format (no markdown, no extra text):
{"description": "...", "tags": ["tag1", "tag2"]}`;

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 150,
        stream: false,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.error("NVIDIA NIM error:", res.status, await res.text());
      return { description: null, tags: [] };
    }

    const json = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    // Extract JSON from response (guard against any extra text)
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { description: null, tags: [] };
    const parsed = JSON.parse(match[0]);
    return {
      description: parsed.description ?? null,
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 4) : [],
    };
  } catch (err) {
    console.error("NVIDIA NIM fetch failed:", err);
    return { description: null, tags: [] };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } }), {
      status: 405,
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const rawKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!rawKey) {
    return new Response(
      JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Missing API key" } }),
      { status: 401 },
    );
  }

  let device: { id: string; user_id: string };
  try {
    device = await verifyDeviceKey(rawKey);
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } }),
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.event) {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_BODY", message: "Missing event field" } }),
      { status: 422 },
    );
  }

  const { event, browser_bookmark_id, url, title, folder_path } = body;

  // ---- DELETED ----
  if (event === "deleted") {
    if (!browser_bookmark_id) {
      return new Response(
        JSON.stringify({ error: { code: "MISSING_FIELD", message: "browser_bookmark_id required for deleted event" } }),
        { status: 422 },
      );
    }
    const { error } = await supabase
      .from("bookmarks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("device_id", device.id)
      .eq("browser_bookmark_id", browser_bookmark_id);
    if (error) {
      console.error("Soft-delete error:", error);
      return new Response(
        JSON.stringify({ error: { code: "DB_ERROR", message: "Failed to delete bookmark" } }),
        { status: 500 },
      );
    }
    return new Response(JSON.stringify({ status: "deleted" }), { status: 200 });
  }

  // ---- CREATED / UPDATED ----
  if (!url) {
    return new Response(
      JSON.stringify({ error: { code: "MISSING_FIELD", message: "url required" } }),
      { status: 422 },
    );
  }

  // Fetch page meta in parallel with no blocking
  const { title: pageTitle, metaDescription } = await fetchPageMeta(url);

  // Try LLM description (non-blocking on failure)
  const { description, tags } = await generateDescription(pageTitle, metaDescription, title ?? null);
  const descriptionPending = description === null;

  const bookmarkData = {
    user_id: device.user_id,
    device_id: device.id,
    url,
    title: title ?? pageTitle ?? url,
    description: description ?? null,
    tags,
    folder_path: folder_path ?? null,
    browser_bookmark_id: browser_bookmark_id ?? null,
    source: "browser",
    description_pending: descriptionPending,
    updated_at: new Date().toISOString(),
    deleted_at: null, // restore if previously soft-deleted
  };

  // Upsert: match on device_id + browser_bookmark_id if available, else insert
  let bookmarkId: string;
  if (browser_bookmark_id) {
    const { data: existing } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("device_id", device.id)
      .eq("browser_bookmark_id", browser_bookmark_id)
      .single();

    if (existing) {
      const { error } = await supabase
        .from("bookmarks")
        .update(bookmarkData)
        .eq("id", existing.id);
      if (error) {
        console.error("Update error:", error);
        return new Response(
          JSON.stringify({ error: { code: "DB_ERROR", message: "Failed to update bookmark" } }),
          { status: 500 },
        );
      }
      bookmarkId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("bookmarks")
        .insert(bookmarkData)
        .select("id")
        .single();
      if (error || !data) {
        console.error("Insert error:", error);
        return new Response(
          JSON.stringify({ error: { code: "DB_ERROR", message: "Failed to insert bookmark" } }),
          { status: 500 },
        );
      }
      bookmarkId = data.id;
    }
  } else {
    const { data, error } = await supabase
      .from("bookmarks")
      .insert(bookmarkData)
      .select("id")
      .single();
    if (error || !data) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: { code: "DB_ERROR", message: "Failed to insert bookmark" } }),
        { status: 500 },
      );
    }
    bookmarkId = data.id;
  }

  // Update device last_synced_at
  await supabase
    .from("devices")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", device.id);

  return new Response(
    JSON.stringify({ bookmark_id: bookmarkId, status: "queued_for_description" }),
    { status: 200 },
  );
});
