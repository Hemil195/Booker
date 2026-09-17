// app/dashboard/folders/page.tsx
// Folders page displaying all browser-synced and custom folders.

import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { FoldersClient } from "@/components/FoldersClient";

export const dynamic = "force-dynamic";

export default async function FoldersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: bookmarks } = await supabase
    .from("bookmarks")
    .select("id, folder_path, title, url, created_at")
    .eq("user_id", user!.id)
    .is("deleted_at", null);

  return <FoldersClient userId={user!.id} initialBookmarks={bookmarks ?? []} />;
}
