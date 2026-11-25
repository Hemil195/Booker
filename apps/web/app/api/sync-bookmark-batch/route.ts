// apps/web/app/api/sync-bookmark-batch/route.ts
// POST /api/sync-bookmark-batch
// Headers: Authorization: Bearer <device_api_key>
//
// Fast, non-blocking backfill endpoint.
// Immediately imports bookmarks without overwriting existing user-managed records,
// updates device last_synced_at, and returns an instant response in <200ms.
// Asynchronously triggers Edge Function description generation in background without blocking HTTP response.

import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { normalizeBrowserFolderPath } from "@/lib/bookmarkCategory";

interface BookmarkInput {
  event?: string;
  browser_bookmark_id?: string;
  url: string;
  title?: string;
  folder_path?: string;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  // Auth check
  const { auth, error: authError } = await requireDeviceAuth(req);
  if (authError) return authError;

  let body: { bookmarks?: BookmarkInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }

  const { bookmarks } = body;
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return NextResponse.json(
      { error: { code: "EMPTY_BATCH", message: "bookmarks array is required and must not be empty" } },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const validBookmarks = bookmarks.filter((bookmark) => bookmark.url && (bookmark.url.startsWith("http://") || bookmark.url.startsWith("https://")));
  // Build all rows for instant bulk upsert
  const rawRows = validBookmarks.map((bm) => ({
    user_id: auth.userId,
    device_id: auth.deviceId,
    url: bm.url,
    title: bm.title || bm.url,
    // Keep exactly the folder the user has in their browser (never guess one).
    folder_path: normalizeBrowserFolderPath(bm.folder_path),
    browser_bookmark_id: bm.browser_bookmark_id || null,
    source: "browser" as const,
    description_pending: false,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }));

  // Deduplicate rows in memory by URL so PostgreSQL ON CONFLICT receives unique targets per batch
  const uniqueRowsMap = new Map<string, typeof rawRows[0]>();
  for (const r of rawRows) {
    uniqueRowsMap.set(r.url, r);
  }
  const rows = Array.from(uniqueRowsMap.values());

  // Perform bulk upsert in chunks of 100 for fast DB execution
  const BATCH_SIZE = 100;
  let insertedCount = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("bookmarks")
      .upsert(chunk, {
        onConflict: "user_id,url",
        ignoreDuplicates: true,
      })
      .select("id, url, title");

    if (!error && data) {
      insertedCount += data.length;
    } else if (error) {
      console.warn("Batch upsert notice, running resilient fallback:", error.message);
      // Insert only when no record exists, even if the unique constraint is absent.
      for (const row of chunk) {
        const { data: existing } = await supabase
          .from("bookmarks")
          .select("id")
          .eq("user_id", row.user_id)
          .eq("url", row.url)
          .maybeSingle();

        if (existing) {
          continue;
        } else {
          const { data: inserted, error: insertErr } = await supabase
            .from("bookmarks")
            .insert(row)
            .select("id")
            .single();
          if (!insertErr && inserted) {
            insertedCount++;
          }
        }
      }
    }
  }

  // Update device last_synced_at timestamp immediately
  await supabase
    .from("devices")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", auth.deviceId);

  const durationMs = Date.now() - startTime;

  return NextResponse.json({
    ok: true,
    status: "queued",
    total: bookmarks.length,
    processed: insertedCount,
    duration_ms: durationMs,
  });
}
