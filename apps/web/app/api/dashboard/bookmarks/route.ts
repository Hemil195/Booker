import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

const DEFAULT_PAGE_SIZE = 10;
type FilterTab = "all" | "recent" | "bot";

function groupBookmarks(data: any[]) {
  const groupMap = new Map<string, any>();
  const stalePendingCutoff = Date.now() - 2 * 60 * 1000;

  data.forEach((bookmark) => {
    const normalizedUrl = (bookmark.url || "").trim().toLowerCase().replace(/\/$/, "");
    const pendingUpdatedAt = Date.parse(bookmark.updated_at);
    const descriptionPending = bookmark.description_pending
      && Number.isFinite(pendingUpdatedAt)
      && pendingUpdatedAt >= stalePendingCutoff;
    const deviceName =
      bookmark.devices?.browser && bookmark.devices.browser !== "Unknown"
        ? bookmark.devices.browser
        : bookmark.devices?.device_name && bookmark.devices.device_name !== "Pending Device"
          ? bookmark.devices.device_name
          : "Browser";

    if (!groupMap.has(normalizedUrl)) {
      groupMap.set(normalizedUrl, {
        ...bookmark,
        description_pending: descriptionPending,
        device_name: deviceName,
        browser: bookmark.devices?.browser,
      });
    } else {
      const existing = groupMap.get(normalizedUrl);
      if (deviceName && existing.device_name && !existing.device_name.includes(deviceName)) {
        existing.device_name = `${existing.device_name}, ${deviceName}`;
      }
    }
  });

  return Array.from(groupMap.values());
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "User session required" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const requestedPage = Number.parseInt(params.get("page") || "1", 10);
  const requestedPageSize = Number.parseInt(params.get("size") || String(DEFAULT_PAGE_SIZE), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = [10, 25, 50].includes(requestedPageSize) ? requestedPageSize : DEFAULT_PAGE_SIZE;
  const queryText = (params.get("q") || "").trim();
  const tab = (params.get("tab") || "all") as FilterTab;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  let query = supabase
    .from("bookmarks")
    .select("*, devices(device_name, browser)", { count: "exact" })
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (tab === "bot") query = query.in("source", ["bot", "mcp", "api"]);
  if (queryText) {
    const escapedQuery = queryText.replace(/[%(),]/g, " ");
    query = query.or(
      `title.ilike.%${escapedQuery}%,url.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%,folder_path.ilike.%${escapedQuery}%`,
    );
  }

  let { data, error, count } = await query.range(start, end);

  if (error) {
    let fallbackQuery = supabase
      .from("bookmarks")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (tab === "bot") fallbackQuery = fallbackQuery.in("source", ["bot", "mcp", "api"]);
    if (queryText) {
      const escapedQuery = queryText.replace(/[%(),]/g, " ");
      fallbackQuery = fallbackQuery.or(
        `title.ilike.%${escapedQuery}%,url.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%,folder_path.ilike.%${escapedQuery}%`,
      );
    }
    const fallback = await fallbackQuery.range(start, end);
    data = fallback.data;
    error = fallback.error;
    count = fallback.count;
  }

  if (error) {
    return NextResponse.json({ error: "Failed to load bookmarks" }, { status: 500 });
  }

  return NextResponse.json(
    { bookmarks: groupBookmarks(data ?? []), total: count ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
