import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { processBookmarkAiDescription } from "@/lib/aiIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabaseServer = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "User session required" }, { status: 401 });
  }

  let body: { bookmark_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  if (!body.bookmark_id) {
    return NextResponse.json({ error: "bookmark_id is required" }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: bookmark, error } = await supabaseAdmin
    .from("bookmarks")
    .select("id, url, title, folder_path")
    .eq("id", body.bookmark_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error || !bookmark) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  const { error: pendingError } = await supabaseAdmin
    .from("bookmarks")
    .update({ description_pending: true })
    .eq("id", bookmark.id)
    .eq("user_id", user.id);

  if (pendingError) {
    return NextResponse.json({ error: "Failed to start description regeneration" }, { status: 500 });
  }

  const proposedFolder = await processBookmarkAiDescription(
    bookmark.id,
    bookmark.url,
    bookmark.title ?? undefined,
    bookmark.folder_path,
    { preserveFolder: true },
  );

  return NextResponse.json({ status: "ok", bookmark_id: bookmark.id, proposed_folder: proposedFolder });
}