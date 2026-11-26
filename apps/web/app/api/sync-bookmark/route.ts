// apps/web/app/api/sync-bookmark/route.ts
// POST /api/sync-bookmark
// Headers: Authorization: Bearer <device_api_key>

import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { normalizeBrowserFolderPath } from "@/lib/bookmarkCategory";
import { scheduleBookmarkAiDescription } from "@/lib/aiIngest";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Auth
  const { auth, error: authError } = await requireDeviceAuth(req);
  if (authError) return authError;

  let body: {
    event?: string;
    browser_bookmark_id?: string;
    url?: string;
    title?: string;
    folder_path?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }

  const { event, browser_bookmark_id, url, title, folder_path } = body;

  if (!event || !["created", "updated", "deleted"].includes(event)) {
    return NextResponse.json(
      { error: { code: "INVALID_FIELD", message: "event must be created | updated | deleted" } },
      { status: 422 },
    );
  }

  const supabase = createSupabaseAdminClient();

  // ── DELETED ────────────────────────────────────────────────────────────────
  if (event === "deleted") {
    if (!browser_bookmark_id) {
      return NextResponse.json(
        { error: { code: "MISSING_FIELD", message: "browser_bookmark_id required for deleted event" } },
        { status: 422 },
      );
    }
    const { error } = await supabase
      .from("bookmarks")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", auth.deviceId)
      .eq("browser_bookmark_id", browser_bookmark_id);

    if (error) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500 },
      );
    }
    return NextResponse.json({ status: "deleted" });
  }

  // ── CREATED / UPDATED ──────────────────────────────────────────────────────
  if (!url) {
    return NextResponse.json(
      { error: { code: "MISSING_FIELD", message: "url is required" } },
      { status: 422 },
    );
  }

  // Upsert bookmark: lookup by browser_bookmark_id or user_id + url
  let existing: { id: string; browser_bookmark_id: string | null; deleted_at: string | null } | null = null;

  if (browser_bookmark_id) {
    const { data, error } = await supabase
      .from("bookmarks")
      .select("id, browser_bookmark_id, deleted_at")
      .eq("device_id", auth.deviceId)
      .eq("browser_bookmark_id", browser_bookmark_id)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500 },
      );
    }
    existing = data;
  }

  if (!existing && url) {
    const { data, error } = await supabase
      .from("bookmarks")
      .select("id, browser_bookmark_id, deleted_at")
      .eq("user_id", auth.userId)
      .eq("url", url)
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: error.message } },
        { status: 500 },
      );
    }
    existing = data;
  }

  let bookmarkId: string;
  let shouldGenerateDescription = false;

  if (existing) {
    bookmarkId = existing.id;

    // A backfill or duplicate create event must not replace the user's saved folder.
    // Apply browser edits only when this is the same linked browser bookmark.
    if (
      existing.deleted_at ||
      (event === "updated" && browser_bookmark_id === existing.browser_bookmark_id)
    ) {
      const restoredAt = new Date().toISOString();
      const { error } = await supabase
        .from("bookmarks")
        .update({
          device_id: auth.deviceId,
          url,
          title: title ?? url,
          folder_path: normalizeBrowserFolderPath(folder_path),
          browser_bookmark_id: browser_bookmark_id ?? null,
          source: "browser",
          description_pending: true,
          ...(existing.deleted_at ? { created_at: restoredAt } : {}),
          updated_at: restoredAt,
          deleted_at: null,
        })
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json(
          { error: { code: "DB_ERROR", message: error.message } },
          { status: 500 },
        );
      }
      shouldGenerateDescription = true;
    }
  } else {
    // Insert new
    const { data: inserted, error } = await supabase
      .from("bookmarks")
      .insert({
        user_id: auth.userId,
        device_id: auth.deviceId,
        url,
        title: title ?? url,
        folder_path: normalizeBrowserFolderPath(folder_path),
        browser_bookmark_id: browser_bookmark_id ?? null,
        source: "browser",
        description_pending: true,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: error?.message ?? "Insert failed" } },
        { status: 500 },
      );
    }
    bookmarkId = inserted.id;
    shouldGenerateDescription = true;
  }

  // Update device last_synced_at
  await supabase
    .from("devices")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", auth.deviceId);

  if (shouldGenerateDescription) {
    scheduleBookmarkAiDescription({
      id: bookmarkId,
      url,
      title: title ?? url,
      folder: normalizeBrowserFolderPath(folder_path),
    }, { preserveFolder: true, preserveTitle: true });
  }

  return NextResponse.json({ bookmark_id: bookmarkId, status: "synced" });
}
