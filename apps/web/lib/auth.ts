// apps/web/lib/auth.ts
// Server-side auth helpers for API routes.
// Verifies device/bot API keys against the hashed values in the DB.

import { createSupabaseAdminClient } from "./supabaseClient";
import { hashApiKey } from "./apiKey";

export interface AuthedDevice {
  deviceId: string;
  userId: string;
}

/**
 * Verify a device or bot API key from the Authorization header.
 * Returns { deviceId, userId } or null if invalid/revoked.
 */
export async function verifyRequestApiKey(
  request: Request,
): Promise<AuthedDevice | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!rawKey) return null;

  const hash = hashApiKey(rawKey);
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("devices")
    .select("id, user_id")
    .eq("api_key_hash", hash)
    .single();

  if (error || !data) return null;
  return { deviceId: data.id, userId: data.user_id };
}

/**
 * Middleware-style helper for API routes. Call at the top of any route
 * handler that requires a valid device API key.
 * Returns a Response on failure, null on success.
 */
export async function requireDeviceAuth(
  request: Request,
): Promise<{ auth: AuthedDevice; error: null } | { auth: null; error: Response }> {
  const auth = await verifyRequestApiKey(request);
  if (!auth) {
    return {
      auth: null,
      error: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
  return { auth, error: null };
}
