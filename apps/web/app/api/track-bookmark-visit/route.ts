import { NextRequest, NextResponse } from "next/server";
import { requireDeviceAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  const { auth, error: authError } = await requireDeviceAuth(req);
  if (authError) return authError;

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }

  if (
    !requestBody
    || typeof requestBody !== "object"
    || Array.isArray(requestBody)
  ) {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be a JSON object" } },
      { status: 400 },
    );
  }

  const body = requestBody as { url?: unknown; visited_at?: unknown };
  if (typeof body.url !== "string" || body.url.length > 2048) {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: "url must be a valid HTTP or HTTPS URL" } },
      { status: 422 },
    );
  }

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: "url must be a valid HTTP or HTTPS URL" } },
      { status: 422 },
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: "Only HTTP and HTTPS bookmark visits are tracked" } },
      { status: 422 },
    );
  }

  if (body.visited_at !== undefined && typeof body.visited_at !== "string") {
    return NextResponse.json(
      { error: { code: "INVALID_VISIT_TIME", message: "visited_at must be a valid timestamp" } },
      { status: 422 },
    );
  }

  const visitedAt = typeof body.visited_at === "string" ? new Date(body.visited_at) : new Date();
  if (!Number.isFinite(visitedAt.getTime()) || visitedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json(
      { error: { code: "INVALID_VISIT_TIME", message: "visited_at must be a valid recent timestamp" } },
      { status: 422 },
    );
  }

  const { data, error } = await createSupabaseAdminClient().rpc("record_bookmark_visit", {
    p_user_id: auth.userId,
    p_url: body.url,
    p_visited_at: visitedAt.toISOString(),
  });

  if (error) {
    console.error("Failed to record bookmark visit:", error.message);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to record bookmark visit" } },
      { status: 500 },
    );
  }

  return NextResponse.json({ tracked: data > 0 });
}
