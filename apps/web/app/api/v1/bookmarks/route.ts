// apps/web/app/api/v1/bookmarks/route.ts
// POST /api/v1/bookmarks — bots add a bookmark (source = 'bot')
// Headers: Authorization: Bearer <bot_api_key>

import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { scheduleBookmarkAiDescription } from "@/lib/aiIngest";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { auth, error: authError } = await requireDeviceAuth(req);
  if (authError) return authError;

  let body: { url?: string; title?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }

  const { url, title, notes } = body;
  if (!url) {
    return NextResponse.json(
      { error: { code: "MISSING_FIELD", message: "url is required" } },
      { status: 422 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("bookmarks")
    .insert({
      user_id: auth.userId,
      device_id: auth.deviceId,
      url,
      title: title ?? url,
      description: notes ?? null,
      source: "bot",
      description_pending: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to add bookmark" } },
      { status: 500 },
    );
  }

  scheduleBookmarkAiDescription({
    id: data.id,
    url,
    title: title ?? url,
  }, { preserveDescription: Boolean(notes) });

  return NextResponse.json({ bookmark_id: data.id, status: "created" }, {
    status: 201,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
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
