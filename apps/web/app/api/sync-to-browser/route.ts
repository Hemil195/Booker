// apps/web/app/api/sync-to-browser/route.ts
// GET /api/sync-to-browser
// Headers: Authorization: Bearer <device_api_key>
// Returns bookmarks to add and linked browser state to reconcile for this device.

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
    .or(`device_id.eq.${auth.deviceId},device_id.is.null,source.in.(bot,mcp,api)`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: { code: "DB_ERROR", message: error.message } }, { status: 500 });
  }

  const changes: {
    id: string;
    browser_bookmark_id: string;
    url: string;
    title: string | null;
    folder_path: string | null;
    deleted_at: string | null;
  }[] = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error: changesError } = await supabase
      .from("bookmarks")
      .select("id, browser_bookmark_id, url, title, folder_path, deleted_at")
      .eq("user_id", auth.userId)
      .eq("device_id", auth.deviceId)
      .not("browser_bookmark_id", "is", null)
      .order("updated_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (changesError) {
      return NextResponse.json({ error: { code: "DB_ERROR", message: changesError.message } }, { status: 500 });
    }

    changes.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return NextResponse.json({ bookmarks: bookmarks || [], changes });
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

  const { data, error } = await supabase
    .from("bookmarks")
    .update({
      device_id: auth.deviceId,
      browser_bookmark_id: body.browser_bookmark_id,
    })
    .eq("id", body.bookmark_id)
    .eq("user_id", auth.userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: { code: "DB_ERROR", message: error.message } }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bookmark not found" } }, { status: 404 });
  }

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
