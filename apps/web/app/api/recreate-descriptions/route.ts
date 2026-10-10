// app/api/recreate-descriptions/route.ts
// POST /api/recreate-descriptions
// Bulk re-generates AI descriptions for all bookmarks belonging to the current user.
// Awaits parallel processing chunks so live Vercel deployments do NOT freeze execution.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { processBookmarkAiDescription } from "@/lib/aiIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabaseServer = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "User session required" } },
      { status: 401 },
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();

  // Fetch all bookmarks for the user
  const { data: bookmarks, error } = await supabaseAdmin
    .from("bookmarks")
    .select("id, url, title, folder_path")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (error || !bookmarks) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: error?.message ?? "Failed to fetch bookmarks" } },
      { status: 500 },
    );
  }

  // Only mark the active chunk pending so a route timeout cannot leave the whole library stuck.
  const BATCH_SIZE = 5;
  for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
    const chunk = bookmarks.slice(i, i + BATCH_SIZE);
    const { error: pendingError } = await supabaseAdmin
      .from("bookmarks")
      .update({ description_pending: true, updated_at: new Date().toISOString() })
      .in("id", chunk.map((bookmark) => bookmark.id));

    if (pendingError) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: "Failed to mark bookmarks for regeneration" } },
        { status: 500 },
      );
    }

    await Promise.all(
      chunk.map((bookmark) =>
        processBookmarkAiDescription(bookmark.id, bookmark.url, bookmark.title ?? undefined, bookmark.folder_path)
      ),
    );
  }

  return NextResponse.json({
    status: "ok",
    message: `Successfully generated AI descriptions for ${bookmarks.length} bookmark(s).`,
    count: bookmarks.length,
  });
}
