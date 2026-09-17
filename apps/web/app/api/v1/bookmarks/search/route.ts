// apps/web/app/api/v1/bookmarks/search/route.ts
// GET /api/v1/bookmarks/search?q=<query>
// Headers: Authorization: Bearer <bot_api_key>

import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";

// Simple in-memory rate limiter: 60 req/min per key
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

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { error: { code: "MISSING_QUERY", message: "q query parameter is required" } },
      { status: 400 },
    );
  }

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
      devices!inner(device_name, browser)
    `)
    .eq("user_id", auth.userId)
    .is("deleted_at", null)
    .textSearch("bookmarks_search_idx", q, { type: "websearch" })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("search error:", error);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Search failed" } },
      { status: 500 },
    );
  }

  const results = (data ?? []).map((row: any) => ({
    title: row.title,
    url: row.url,
    description: row.description,
    tags: row.tags,
    folder_path: row.folder_path,
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
