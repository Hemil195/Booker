// app/dashboard/connections/page.tsx
// Connections page: connected browser devices, MCP Server URL, API keys, per-tool setup cards.

import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { ConnectionsClient } from "@/components/ConnectionsClient";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch all linked devices & bot keys for this user
  const { data: devices } = await supabase
    .from("devices")
    .select("id, device_name, browser, api_key_hash, created_at, last_synced_at")
    .eq("user_id", user!.id)
    .is("linking_code", null)
    .not("api_key_hash", "is", null)
    .order("created_at", { ascending: false });

  return (
    <ConnectionsClient
      userId={user!.id}
      allDevices={devices ?? []}
      mcpServerUrl={process.env.MCP_SERVER_URL}
    />
  );
}
