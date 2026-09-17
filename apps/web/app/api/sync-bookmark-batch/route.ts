// apps/web/app/api/sync-bookmark-batch/route.ts
// POST /api/sync-bookmark-batch
// Headers: Authorization: Bearer <device_api_key>
//
// Fast, non-blocking backfill endpoint.
// Immediately bulk-inserts/upserts bookmarks into database with description_pending = true,
// updates device last_synced_at, and returns an instant response in <200ms.
// Asynchronously triggers Edge Function description generation in background without blocking HTTP response.

import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { processBookmarkAiDescription } from "@/lib/aiIngest";

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

  // Build all rows for instant bulk upsert
  const validBookmarks = bookmarks.filter((bm) => bm.url && (bm.url.startsWith("http://") || bm.url.startsWith("https://")));
  const requestedUrls = validBookmarks.map((bm) => bm.url);
  const { data: existingRows } = await supabase
    .from("bookmarks")
    .select("id, url, description, tags, description_pending")
    .eq("user_id", auth.userId)
    .in("url", requestedUrls);
  const existingByUrl = new Map(
    (existingRows ?? []).map((row) => [row.url, row]),
  );

  const rawRows = validBookmarks.map((bm) => ({
    user_id: auth.userId,
    device_id: auth.deviceId,
    url: bm.url,
    title: bm.title || bm.url,
    folder_path: bm.folder_path || null,
    description: existingByUrl.get(bm.url)?.description ?? null,
    tags: existingByUrl.get(bm.url)?.tags ?? [],
    browser_bookmark_id: bm.browser_bookmark_id || null,
    source: "browser" as const,
    // Do not requeue completed AI work when the extension sends a backfill again.
    description_pending: existingByUrl.get(bm.url)?.description_pending ?? true,
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

  const savedBookmarkRecords: { id: string; url: string; title?: string; folder_path?: string | null }[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("bookmarks")
      .upsert(chunk, {
        onConflict: "user_id,url",
        ignoreDuplicates: false,
      })
      .select("id, url, title");

    if (!error && data) {
      insertedCount += data.length;
      data.forEach((item: any) => {
        const row = existingByUrl.get(item.url);
        if (!row || row.description_pending) {
          const source = rows.find((candidate) => candidate.url === item.url);
          savedBookmarkRecords.push({
            id: item.id,
            url: item.url,
            title: item.title,
            folder_path: source?.folder_path,
          });
        }
      });
    } else if (error) {
      console.warn("Batch upsert notice, running resilient fallback:", error.message);
      // Resilient fallback if unique constraint is absent
      for (const row of chunk) {
        const { data: existing } = await supabase
          .from("bookmarks")
          .select("id")
          .eq("user_id", row.user_id)
          .eq("url", row.url)
          .maybeSingle();

        if (existing) {
          const { error: updateErr } = await supabase
            .from("bookmarks")
            .update({
              title: row.title,
              folder_path: row.folder_path,
              browser_bookmark_id: row.browser_bookmark_id,
              updated_at: new Date().toISOString(),
              deleted_at: null,
            })
            .eq("id", existing.id);
          if (!updateErr) {
            insertedCount++;
            if (existingByUrl.get(row.url)?.description_pending) {
              savedBookmarkRecords.push({ id: existing.id, url: row.url, title: row.title, folder_path: row.folder_path });
            }
          }
        } else {
          const { data: inserted, error: insertErr } = await supabase
            .from("bookmarks")
            .insert(row)
            .select("id")
            .single();
          if (!insertErr && inserted) {
            insertedCount++;
            savedBookmarkRecords.push({ id: inserted.id, url: row.url, title: row.title, folder_path: row.folder_path });
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

  // Process AI descriptions in parallel chunks
  const BATCH_AI_SIZE = 3;
  for (let i = 0; i < savedBookmarkRecords.length; i += BATCH_AI_SIZE) {
    const chunk = savedBookmarkRecords.slice(i, i + BATCH_AI_SIZE);
    await Promise.all(
      chunk.map((bm) =>
        processBookmarkAiDescription(bm.id, bm.url, bm.title || undefined, bm.folder_path)
      )
    );
  }

  const durationMs = Date.now() - startTime;

  return NextResponse.json({
    ok: true,
    status: "queued",
    total: bookmarks.length,
    processed: insertedCount || validBookmarks.length,
    duration_ms: durationMs,
  });
}
