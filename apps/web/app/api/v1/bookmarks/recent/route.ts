// apps/web/app/api/v1/bookmarks/recent/route.ts
// GET /api/v1/bookmarks/recent?limit=10
// Headers: Authorization: Bearer <bot_api_key>

import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

export async function GET(req: NextRequest) {
  const { auth, error: authError } = await requireDeviceAuth(req);
  if (authError) return authError;

  if (!checkRateLimit(auth.deviceId)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Rate limit exceeded (60 req/min)" } },
      { status: 429 },
    );
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "10", 10) || 10, 1), 50);

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("bookmarks")
    .select(`
      id,
      title,
      url,
      description,
      tags,
      folder_path,
      created_at,
      devices!inner(device_name, browser)
    `)
    .eq("user_id", auth.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to fetch recent bookmarks" } },
      { status: 500 },
    );
  }

  const results = (data ?? []).map((row: any) => ({
    title: row.title,
    url: row.url,
    description: row.description,
    tags: row.tags,
    folder_path: row.folder_path,
    created_at: row.created_at,
    device_name: row.devices?.device_name ?? null,
    browser: row.devices?.browser ?? null,
  }));

  return NextResponse.json({ results }, {
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
