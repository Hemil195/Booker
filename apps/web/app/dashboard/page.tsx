// app/dashboard/page.tsx
// Main dashboard — quick-action cards, filter tabs, bookmark list.

import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: { user } },
    { data: devices },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("devices")
      .select("id, device_name, browser, last_synced_at, api_key_hash")
      .is("linking_code", null) // only fully-linked devices
      .order("created_at", { ascending: false }),
  ]);

  const hasLinkedDevice = (devices ?? []).some((d: any) => d.api_key_hash);

  return (
    <DashboardClient
      userId={user!.id}
      hasLinkedDevice={hasLinkedDevice}
      devices={devices ?? []}
    />
  );
}
