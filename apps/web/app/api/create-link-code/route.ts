import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseAdminClient } from "@/lib/supabaseClient";

export async function POST(request: Request) {
  const supabaseServer = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "User session required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const forceNew = body?.force_new === true;
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: pendingDevice, error: lookupError } = await supabaseAdmin
    .from("devices")
    .select("id, linking_code, linking_code_expires_at")
    .eq("user_id", user.id)
    .neq("browser", "bot")
    .is("api_key_hash", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: "Unable to prepare browser connection" }, { status: 500 });
  }

  if (
    !forceNew
    && pendingDevice?.linking_code
    && pendingDevice.linking_code_expires_at
    && new Date(pendingDevice.linking_code_expires_at).getTime() > Date.now()
  ) {
    return NextResponse.json({
      device_id: pendingDevice.id,
      linking_code: pendingDevice.linking_code,
    });
  }

  const linkingCode = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (pendingDevice) {
    const { error } = await supabaseAdmin
      .from("devices")
      .update({
        linking_code: linkingCode,
        linking_code_expires_at: expiresAt,
      })
      .eq("id", pendingDevice.id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: "Unable to prepare browser connection" }, { status: 500 });
    }

    return NextResponse.json({ device_id: pendingDevice.id, linking_code: linkingCode });
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