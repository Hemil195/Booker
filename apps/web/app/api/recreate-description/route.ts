import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { processBookmarkAiDescription } from "@/lib/aiIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const serverClient = await createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { bookmark_id?: string } | null;
  if (!body?.bookmark_id) {
    return NextResponse.json({ error: "bookmark_id is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: bookmark, error } = await admin
    .from("bookmarks")
    .select("id, url, title, folder_path")
    .eq("id", body.bookmark_id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error || !bookmark) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  await admin.from("bookmarks").update({ description_pending: true }).eq("id", bookmark.id);
  await processBookmarkAiDescription(bookmark.id, bookmark.url, bookmark.title ?? undefined, bookmark.folder_path);

  const { data: updated } = await admin
    .from("bookmarks")
    .select("id, title, description, tags, folder_path, description_pending")
    .eq("id", bookmark.id)
    .single();

  return NextResponse.json({ bookmark: updated });
}
