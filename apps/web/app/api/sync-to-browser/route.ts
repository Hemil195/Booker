// apps/web/app/api/sync-to-browser/route.ts
// GET /api/sync-to-browser
// Headers: Authorization: Bearer <device_api_key>
// Returns bookmarks created from dashboard/bot that need to be added to browser bookmarks.

import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  const { auth, error: authError } = await requireDeviceAuth(req);
  if (authError) return authError;

  const supabase = createSupabaseAdminClient();

  const { data: bookmarks, error } = await supabase
    .from("bookmarks")
    .select("id, url, title, folder_path, source, created_at, device_id")
    .eq("user_id", auth.userId)
    .is("browser_bookmark_id", null)
    .is("deleted_at", null)
    .or(`device_id.eq.${auth.deviceId},device_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: { code: "DB_ERROR", message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ bookmarks: bookmarks || [] });
}

export async function POST(req: NextRequest) {
  const { auth, error: authError } = await requireDeviceAuth(req);
  if (authError) return authError;

  let body: { bookmark_id: string; browser_bookmark_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.bookmark_id || !body.browser_bookmark_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 422 });
  }

  const supabase = createSupabaseAdminClient();

  await supabase
    .from("bookmarks")
    .update({ browser_bookmark_id: body.browser_bookmark_id })
    .eq("id", body.bookmark_id)
    .eq("user_id", auth.userId)
    .eq("device_id", auth.deviceId);

  return NextResponse.json({ status: "updated" });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
