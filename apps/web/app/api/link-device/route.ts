// apps/web/app/api/link-device/route.ts
// POST /api/link-device
// Request:  { "linking_code": "483920", "device_name": "My Brave", "browser": "Brave" }
// Success:  { "device_id": "uuid", "api_key": "raw-64-char-hex" }

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";
import { generateApiKey, hashApiKey } from "@/lib/apiKey";

export async function POST(req: NextRequest) {
  let body: { linking_code?: string; device_name?: string; browser?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Request body must be JSON" } },
      { status: 400 },
    );
  }

  const { linking_code, device_name, browser } = body;
  if (!linking_code || typeof linking_code !== "string") {
    return NextResponse.json(
      { error: { code: "MISSING_FIELD", message: "linking_code is required" } },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  // Look up device by linking code
  const { data: device, error } = await supabase
    .from("devices")
    .select("id, linking_code_expires_at")
    .eq("linking_code", linking_code.trim())
    .single();

  if (error || !device) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Invalid or expired linking code" } },
      { status: 404 },
    );
  }

  if (
    device.linking_code_expires_at &&
    new Date(device.linking_code_expires_at) < new Date()
  ) {
    return NextResponse.json(
      { error: { code: "CODE_EXPIRED", message: "Linking code has expired" } },
      { status: 400 },
    );
  }

  // Generate non-expiring API key
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);

  // Set real device name and browser if provided
  const updatedDeviceName = device_name?.trim() || `Device (${browser || "Browser"})`;
  const updatedBrowser = browser?.trim() || "Browser";

  const { error: updateError } = await supabase
    .from("devices")
    .update({
      device_name: updatedDeviceName,
      browser: updatedBrowser,
      api_key_hash: keyHash,
      linking_code: null,
      linking_code_expires_at: null,
    })
    .eq("id", device.id);

  if (updateError) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Failed to store API key" } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    device_id: device.id,
    api_key: rawKey,
  });
}
