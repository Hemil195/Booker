import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import {
  scheduleBookmarkAiDescription,
  type BookmarkAiOptions,
} from "@/lib/aiIngest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (user) {
    userId = user.id;
  } else {
    const { auth, error } = await requireDeviceAuth(req);
    if (error) return error;
    userId = auth.userId;
  }

  let body: {
    bookmark_id?: string;
    preserve_folder?: boolean;
    preserve_description?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  if (!body.bookmark_id) {
    return NextResponse.json({ error: "bookmark_id is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: bookmark, error } = await supabase
    .from("bookmarks")
    .select("id, url, title, folder_path")
    .eq("id", body.bookmark_id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single();

  if (error || !bookmark) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("bookmarks")
    .update({ description_pending: true, updated_at: new Date().toISOString() })
    .eq("id", bookmark.id)
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (updateError) {
    return NextResponse.json({ error: "Failed to queue bookmark description" }, { status: 500 });
  }

  const options: BookmarkAiOptions = {
    preserveFolder: body.preserve_folder ?? true,
    preserveDescription: body.preserve_description,
  };
  scheduleBookmarkAiDescription(bookmark, options);

  return NextResponse.json(
    { status: "queued", bookmark_id: bookmark.id },
    { status: 202 },
  );
}
