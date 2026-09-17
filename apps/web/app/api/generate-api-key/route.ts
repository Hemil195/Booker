// app/api/generate-api-key/route.ts
// Server-side route to generate and hash a new device/bot API key securely.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { generateApiKey, hashApiKey } from "@/lib/apiKey";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawKey = `bookar_sec_${generateApiKey()}`;
    const keyHash = hashApiKey(rawKey);

    const deviceName = `Bot Key — ${new Date().toLocaleDateString()}`;

    const { data, error } = await supabase
      .from("devices")
      .insert({
        user_id: user.id,
        device_name: deviceName,
        browser: "bot",
        api_key_hash: keyHash,
      })
      .select("id, device_name, browser, api_key_hash, created_at, last_synced_at")
      .single();

    if (error || !data) {
      console.error("Failed to insert device key:", error);
      return NextResponse.json(
        { error: error?.message || "Failed to create key" },
        { status: 500 }
      );
    }

    return NextResponse.json({ device: data, rawKey });
  } catch (err: any) {
    console.error("generate-api-key error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
