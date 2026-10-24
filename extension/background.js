// extension/background.js
// Manifest V3 Service Worker
// Listens to chrome.bookmarks API and syncs changes to Bookar with zero polling.

// ---------------------------------------------------------------------------
// Config — reads from chrome.storage.local with fallback to build domain
const API_BASE = "http://localhost:3000";
const RETRY_DELAY_MS = 5000;

async function getApiBase() {
  const result = await chrome.storage.local.get("bookar_api_base");
  return result.bookar_api_base && result.bookar_api_base !== "https://bookar-rereal.vercel.app"
    ? result.bookar_api_base
    : API_BASE;
}

// ---------------------------------------------------------------------------
// Detect browser name
// ---------------------------------------------------------------------------
async function detectBrowser() {
  try {
    if (typeof navigator !== "undefined" && navigator.brave) {
      const isBrave = await navigator.brave.isBrave().catch(() => false);
      if (isBrave) return "Brave";
    }
  } catch {}
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Firefox/")) return "Firefox";
  return "Chrome";
}

// ---------------------------------------------------------------------------
// Get stored API key
// ---------------------------------------------------------------------------
async function getApiKey() {
  const result = await chrome.storage.local.get("bookar_api_key");
  return result.bookar_api_key ?? null;
}

// ---------------------------------------------------------------------------
// Handle 401 Unauthorized globally: immediately disconnect device
// ---------------------------------------------------------------------------
async function handleUnauthorizedKey() {
  console.warn("Bookar: Invalid or revoked API key (401). Disconnecting device to prevent retry loops.");
  await chrome.storage.local.remove([
    "bookar_api_key",
    "bookar_device_id",
    "bookar_device_name",
    "bookar_browser",
    "bookar_backfill_done",
    "bookar_pending_sync",
  ]);
}

// ---------------------------------------------------------------------------
// Sync a single bookmark event with retry on failure
// ---------------------------------------------------------------------------
async function syncBookmark(payload, retryCount = 0) {
  const apiKey = await getApiKey();
  if (!apiKey) return;
  const apiBase = await getApiBase();
  const syncEndpoint = `${apiBase}/api/sync-bookmark`;

  try {
    const res = await fetch(syncEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      await handleUnauthorizedKey();
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (retryCount === 0) {
      console.warn("Bookar: Sync failed, retrying once:", err);
      setTimeout(() => syncBookmark(payload, 1), RETRY_DELAY_MS);
    } else {
      const result = await chrome.storage.local.get("bookar_pending_sync");
      const pending = result.bookar_pending_sync ?? [];
      pending.push({ payload, failedAt: Date.now() });
      await chrome.storage.local.set({ bookar_pending_sync: pending });
      console.error("Bookar: Sync failed twice, queued for retry:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Resolve folder path from bookmark tree node ID
// ---------------------------------------------------------------------------
async function getFolderPath(parentId) {
  if (!parentId) return null;
  try {
    const [node] = await chrome.bookmarks.get(parentId);
    if (!node || node.url) return null;

    const parts = [];
    let current = node;

    while (current && current.id !== "0" && current.id !== "1" && current.id !== "2") {
      if (current.title) parts.unshift(current.title);
      if (!current.parentId) break;
      try {
        [current] = await chrome.bookmarks.get(current.parentId);
      } catch {
        break;
      }
    }

    return parts.length > 0 ? parts.join("/") : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Flatten bookmark tree into array of leaf nodes
// ---------------------------------------------------------------------------
function flattenTree(nodes, results = []) {
  for (const node of nodes) {
    if (node.url && (node.url.startsWith("http://") || node.url.startsWith("https://"))) {
      results.push(node);
    }
    if (node.children) {
      flattenTree(node.children, results);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Build folder path map: id -> path string
// ---------------------------------------------------------------------------
function buildFolderPathMap(nodes, parentPath = "", map = {}) {
  for (const node of nodes) {
    const path = parentPath
      ? node.title ? `${parentPath}/${node.title}` : parentPath
      : node.title ?? "";

    if (!node.url && node.id) {
      map[node.id] = path;
    }

    if (node.children) {
      buildFolderPathMap(node.children, path, map);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Backfill: send all existing bookmarks on first link
// ---------------------------------------------------------------------------
async function backfillAllBookmarks() {
  const apiKey = await getApiKey();
  if (!apiKey) return;
  const apiBase = await getApiBase();
  const batchEndpoint = `${apiBase}/api/sync-bookmark-batch`;

  try {
    const tree = await chrome.bookmarks.getTree();
    const folderPathMap = buildFolderPathMap(tree);
    const allBookmarks = flattenTree(tree);

    if (allBookmarks.length === 0) return;

    const payload = allBookmarks.map((bm) => ({
      event: "created",
      browser_bookmark_id: bm.id,
      url: bm.url,
      title: bm.title,
      folder_path: bm.parentId ? folderPathMap[bm.parentId] ?? null : null,
    }));

    const res = await fetch(batchEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ bookmarks: payload }),
    });

    if (res.status === 401) {
      await handleUnauthorizedKey();
      return;
    }

    console.log(`Bookar: Backfilled ${payload.length} bookmarks.`);
    await chrome.storage.local.set({ bookar_backfill_done: true });
  } catch (err) {
    console.error("Bookar: Backfill failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Sync pending web-added bookmarks down into Chrome browser bookmarks
// Called ON-DEMAND when web-add occurs (NO INTERVAL POLLING)
// ---------------------------------------------------------------------------
async function getBookmarksBarId() {
  try {
    const [bookmarksBar] = await chrome.bookmarks.get("1");
    return bookmarksBar?.id ?? null;
  } catch {
    return null;
  }
}

async function findOrCreateBrowserFolder(folderPath) {
  const parts = folderPath.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const tree = await chrome.bookmarks.getTree();
  let matchedFolderId = null;

  const findPath = (nodes, parentPath = []) => {
    for (const node of nodes) {
      if (node.url) continue;
      const path = [
        ...parentPath,
        ...(["0", "1", "2"].includes(node.id) ? [] : [node.title]),
      ];
      if (path.join("/") === parts.join("/")) {
        matchedFolderId = node.id;
        return true;
      }
      if (node.children && findPath(node.children, path)) return true;
    }
    return false;
  };

  findPath(tree);
  if (matchedFolderId) return matchedFolderId;

  let parentId = await getBookmarksBarId();
  if (!parentId) {
    const [otherBookmarks] = await chrome.bookmarks.get("2");
    parentId = otherBookmarks?.id;
  }
  if (!parentId) return null;

  for (const part of parts) {
    const children = await chrome.bookmarks.getChildren(parentId);
    let folder = children.find((child) => !child.url && child.title === part);
    if (!folder) {
      folder = await chrome.bookmarks.create({ parentId, title: part });
    }
    parentId = folder.id;
  }
  return parentId;
}

async function applyDashboardChanges(changes) {
  for (const change of changes ?? []) {
    try {
      let bookmark;
      try {
        [bookmark] = await chrome.bookmarks.get(change.browser_bookmark_id);
      } catch {
        bookmark = null;
      }

      if (!bookmark) {
        if (!change.deleted_at) {
          await syncBookmark({
            event: "deleted",
            browser_bookmark_id: change.browser_bookmark_id,
            url: change.url,
          });
        }
        continue;
      }

      if (change.deleted_at) {
        await chrome.bookmarks.remove(bookmark.id);
        continue;
      }

      const updatedFields = {};
      if (bookmark.title !== (change.title || change.url)) updatedFields.title = change.title || change.url;
      if (bookmark.url !== change.url) updatedFields.url = change.url;
      if (Object.keys(updatedFields).length > 0) {
        await chrome.bookmarks.update(bookmark.id, updatedFields);
      }

      const bookmarksBarId = await getBookmarksBarId();
      const currentFolderPath = await getFolderPath(bookmark.parentId);
      if (change.folder_path && currentFolderPath !== change.folder_path) {
        const parentId = await findOrCreateBrowserFolder(change.folder_path);
        if (parentId) await chrome.bookmarks.move(bookmark.id, { parentId });
      } else if (!change.folder_path && bookmarksBarId && bookmark.parentId !== bookmarksBarId) {
        await chrome.bookmarks.move(bookmark.id, { parentId: bookmarksBarId });
      }
    } catch (err) {
      console.warn("Bookar: Failed to apply dashboard bookmark change:", err);
    }
  }
}

let syncWebToBrowserPromise = null;
let lastWebSyncStartedAt = 0;

async function syncWebToBrowser() {
  if (syncWebToBrowserPromise) return syncWebToBrowserPromise;

  const waitMs = Math.max(0, 2000 - (Date.now() - lastWebSyncStartedAt));
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  if (syncWebToBrowserPromise) return syncWebToBrowserPromise;
  lastWebSyncStartedAt = Date.now();
  syncWebToBrowserPromise = performWebToBrowserSync();
  try {
    await syncWebToBrowserPromise;
  } finally {
    syncWebToBrowserPromise = null;
  }
}

async function performWebToBrowserSync() {
  const apiKey = await getApiKey();
  if (!apiKey) return;
  const apiBase = await getApiBase();
  const webSyncEndpoint = `${apiBase}/api/sync-to-browser`;

  try {
    const res = await fetch(webSyncEndpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.status === 401) {
      await handleUnauthorizedKey();
      return;
    }

    if (!res.ok) return;
    const { bookmarks, changes } = await res.json();

    for (const bm of bookmarks ?? []) {
      try {
        const parentId = bm.folder_path
          ? await findOrCreateBrowserFolder(bm.folder_path)
          : await getBookmarksBarId();
        const createdNode = await chrome.bookmarks.create({
          title: bm.title || bm.url,
          url: bm.url,
          ...(parentId ? { parentId } : {}),
        });

        // Report browser_bookmark_id back to server so it is marked synced
        await fetch(webSyncEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            bookmark_id: bm.id,
            browser_bookmark_id: createdNode.id,
          }),
        });
      } catch (err) {
        console.warn("Bookar: Failed to add bookmark into Chrome:", err);
      }
    }

    await applyDashboardChanges(changes);
  } catch (err) {
    console.error("Bookar: Web sync to browser error:", err);
  }
}

// ---------------------------------------------------------------------------
// On service worker startup, installation, or periodic alarm
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  if (chrome?.alarms) {
    chrome.alarms.create("bookar_sync_alarm", { periodInMinutes: 1.0 });
  }
  syncWebToBrowser();
});

if (chrome?.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "bookar_sync_alarm") {
      await syncWebToBrowser();
    }
  });
}

chrome.runtime.onStartup.addListener(async () => {
  await syncWebToBrowser();
});

// ---------------------------------------------------------------------------
// Message listener: popup / web app sends messages to trigger actions
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DEVICE_LINKED") {
    chrome.storage.local.get("bookar_backfill_done").then(async (result) => {
      if (!result.bookar_backfill_done) {
        await backfillAllBookmarks();
      }
      await syncWebToBrowser();
    });
    sendResponse({ ok: true });
  }

  if (message.type === "FORCE_SYNC") {
    syncWebToBrowser().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "GET_STATUS") {
    getApiKey().then((key) => {
      sendResponse({ linked: !!key });
    });
    return true;
  }
});

// ---------------------------------------------------------------------------
// Bookmark event listeners
// ---------------------------------------------------------------------------
chrome.bookmarks.onCreated.addListener(async (_id, bookmark) => {
  if (!bookmark.url) return;
  const folderPath = await getFolderPath(bookmark.parentId);
  await syncBookmark({
    event: "created",
    browser_bookmark_id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    folder_path: folderPath,
  });
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    const [bookmark] = await chrome.bookmarks.get(id);
    if (!bookmark.url) return;
    const folderPath = await getFolderPath(bookmark.parentId);
    await syncBookmark({
      event: "updated",
      browser_bookmark_id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      folder_path: folderPath,
    });
  } catch (err) {
    console.error("Bookar: bookmark update error:", err);
  }
});

chrome.bookmarks.onMoved.addListener(async (id) => {
  try {
    const [bookmark] = await chrome.bookmarks.get(id);
    if (!bookmark.url) return;
    const folderPath = await getFolderPath(bookmark.parentId);
    await syncBookmark({
      event: "updated",
      browser_bookmark_id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      folder_path: folderPath,
    });
  } catch (err) {
    console.error("Bookar: bookmark move sync error:", err);
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  if (!removeInfo.node.url) return;
  await syncBookmark({
    event: "deleted",
    browser_bookmark_id: id,
    url: removeInfo.node.url,
  });
});
