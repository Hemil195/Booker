import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { FoldersClient } from "@/components/FoldersClient";

export const dynamic = "force-dynamic";

export default async function FolderPathPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: bookmarks } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user!.id)
    .is("deleted_at", null);

  return (
    <FoldersClient
      userId={user!.id}
      initialBookmarks={bookmarks ?? []}
      initialFolder={path.join("/")}
    />
  );
}