// app/api/recreate-descriptions/route.ts
// POST /api/recreate-descriptions
// Bulk re-generates AI descriptions for all bookmarks belonging to the current user.
// Awaits parallel processing chunks so live Vercel deployments do NOT freeze execution.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { processBookmarkAiDescription } from "@/lib/aiIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  // Mark all as pending first
  const ids = bookmarks.map((b: any) => b.id);
  if (ids.length > 0) {
    await supabaseAdmin
      .from("bookmarks")
      .update({ description_pending: true })
      .in("id", ids);

    // Process in fast parallel chunks of 5 with Promise.all
    const BATCH_SIZE = 3;
    for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
      const chunk = bookmarks.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map((bm: any) =>
          processBookmarkAiDescription(bm.id, bm.url, bm.title ?? undefined, bm.folder_path)
        )
      );
    }
  }

  return NextResponse.json({
    status: "ok",
    message: `Successfully generated AI descriptions for ${bookmarks.length} bookmark(s).`,
    count: bookmarks.length,
  });
}
