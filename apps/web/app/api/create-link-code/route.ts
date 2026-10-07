import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";

export async function POST() {
  const supabaseServer = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "User session required" }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: reusableDevice, error: lookupError } = await supabaseAdmin
    .from("devices")
    .select("id")
    .eq("user_id", user.id)
    .neq("browser", "bot")
    .is("api_key_hash", null)
    .is("linking_code", null)
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: "Unable to prepare browser connection" }, { status: 500 });
  }

  const linkingCode = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (reusableDevice) {
    const { error } = await supabaseAdmin
      .from("devices")
      .update({
        linking_code: linkingCode,
        linking_code_expires_at: expiresAt,
      })
      .eq("id", reusableDevice.id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: "Unable to prepare browser connection" }, { status: 500 });
    }

    return NextResponse.json({ device_id: reusableDevice.id, linking_code: linkingCode });
  }

  const { data: device, error } = await supabaseAdmin
    .from("devices")
    .insert({
      user_id: user.id,
      device_name: "Pending Device",
      browser: "Unknown",
      linking_code: linkingCode,
      linking_code_expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !device) {
    return NextResponse.json({ error: "Unable to create browser connection" }, { status: 500 });
  }

  return NextResponse.json({ device_id: device.id, linking_code: linkingCode });
}