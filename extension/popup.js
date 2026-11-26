// extension/popup.js

// Local development API. Set bookar_api_base in extension storage for production.
const API_BASE = "http://localhost:3000";

async function getApiBase() {
  const result = await chrome.storage.local.get("bookar_api_base");
  return result.bookar_api_base && result.bookar_api_base !== "https://bookar-rereal.vercel.app"
    ? result.bookar_api_base
    : API_BASE;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const stateLinked = document.getElementById("state-linked");
const stateUnlinked = document.getElementById("state-unlinked");
const statusBadge = document.getElementById("status-badge");
const codeInput = document.getElementById("code-input");
const nameInput = document.getElementById("name-input");
const btnLink = document.getElementById("btn-link");
const btnUnlink = document.getElementById("btn-unlink");
const errorMsg = document.getElementById("error-msg");
const successMsg = document.getElementById("success-msg");
const deviceNameEl = document.getElementById("device-name");
const deviceBrowserEl = document.getElementById("device-browser");
const linkDashboard = document.getElementById("link-dashboard");
const linkToDashboard = document.getElementById("link-to-dashboard");

// Active Tab Elements
const activeTabTitle = document.getElementById("active-tab-title");
const activeTabFavicon = document.getElementById("active-tab-favicon");
const saveUrlInput = document.getElementById("save-url-input");
const saveFolderInput = document.getElementById("save-folder-input");
const btnSaveTab = document.getElementById("btn-save-tab");
const saveSuccessMsg = document.getElementById("save-success-msg");
const saveErrorMsg = document.getElementById("save-error-msg");
const btnManualSync = document.getElementById("btn-manual-sync");

let currentTabInfo = { title: "", url: "" };

// ── Initialize popup ─────────────────────────────────────────────────────────
async function init() {
  const apiBase = await getApiBase();
  const dashboardUrl = `${apiBase}/dashboard`;

  // Set dashboard links
  if (linkDashboard) linkDashboard.href = dashboardUrl;
  if (linkToDashboard) linkToDashboard.href = dashboardUrl;

  const result = await chrome.storage.local.get(["bookar_api_key", "bookar_device_name", "bookar_browser"]);

  if (result.bookar_api_key) {
    showLinkedState(result.bookar_device_name ?? "My Device", result.bookar_browser ?? "Browser");
    loadActiveTabInfo();
  } else {
    showUnlinkedState();
  }
}

function showLinkedState(name, browser) {
  stateLinked.style.display = "block";
  stateUnlinked.style.display = "none";
  if (statusBadge) statusBadge.style.display = "inline-flex";
  deviceNameEl.textContent = name;
  deviceBrowserEl.textContent = browser;
}

function showUnlinkedState() {
  stateLinked.style.display = "none";
  stateUnlinked.style.display = "block";
  if (statusBadge) statusBadge.style.display = "none";
  if (codeInput) codeInput.value = "";
  hideMessages();
}

function showError(msg) {
  if (errorMsg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = "block";
  }
  if (successMsg) successMsg.style.display = "none";
}

function showSuccess(msg) {
  if (successMsg) {
    successMsg.textContent = msg;
    successMsg.style.display = "block";
  }
  if (errorMsg) errorMsg.style.display = "none";
}

function hideMessages() {
  if (errorMsg) errorMsg.style.display = "none";
  if (successMsg) successMsg.style.display = "none";
}

// ── Load Active Tab Info ──────────────────────────────────────────────────────
async function loadActiveTabInfo() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0]) {
      const tab = tabs[0];
      currentTabInfo = { title: tab.title || "", url: tab.url || "" };

      if (activeTabTitle) activeTabTitle.textContent = tab.title || tab.url || "Active Web Page";
      if (saveUrlInput) saveUrlInput.value = tab.url || "";

      if (activeTabFavicon && tab.url) {
        let domain = "";
        try { domain = new URL(tab.url).hostname; } catch {}
        
        const sources = [];
        if (tab.favIconUrl) sources.push(tab.favIconUrl);
        if (domain) {
          sources.push(`https://faviconapi.com/${encodeURIComponent(domain)}`);
          sources.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`);
          sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`);
        }

        let currentIdx = 0;
        const tryNextFavicon = () => {
          if (currentIdx < sources.length) {
            activeTabFavicon.src = sources[currentIdx++];
            activeTabFavicon.style.display = "block";
          } else {
            activeTabFavicon.style.display = "none";
          }
        };

        activeTabFavicon.onerror = tryNextFavicon;
        tryNextFavicon();
      }
    }
  } catch (err) {
    console.warn("Could not query active tab:", err);
  }
}

// ── Save Active Tab to Bookar ────────────────────────────────────────────────
if (btnSaveTab) {
  btnSaveTab.addEventListener("click", async () => {
    const result = await chrome.storage.local.get("bookar_api_key");
    if (!result.bookar_api_key) {
      if (saveErrorMsg) {
        saveErrorMsg.textContent = "Extension not linked yet.";
        saveErrorMsg.style.display = "block";
      }
      return;
    }

    const url = saveUrlInput ? saveUrlInput.value.trim() : currentTabInfo.url;
    const title = currentTabInfo.title || url;
    const folderPath = saveFolderInput ? saveFolderInput.value.trim() : "";

    if (!url || !url.startsWith("http")) {
      if (saveErrorMsg) {
        saveErrorMsg.textContent = "Invalid URL to save.";
        saveErrorMsg.style.display = "block";
      }
      return;
    }

    btnSaveTab.disabled = true;
    btnSaveTab.innerHTML = '<span class="spinner"></span> Saving…';
    if (saveErrorMsg) saveErrorMsg.style.display = "none";
    if (saveSuccessMsg) saveSuccessMsg.style.display = "none";

    try {
      const apiBase = await getApiBase();
      const syncEndpoint = `${apiBase}/api/sync-bookmark`;

      const res = await fetch(syncEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${result.bookar_api_key}`,
        },
        body: JSON.stringify({
          event: "created",
          url: url,
          title: title,
          folder_path: folderPath || null,
        }),
      });

      if (res.ok) {
        if (saveSuccessMsg) {
          saveSuccessMsg.textContent = "✓ Saved to Bookar!";
          saveSuccessMsg.style.display = "block";
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (saveErrorMsg) {
        saveErrorMsg.textContent = "Failed to save bookmark.";
        saveErrorMsg.style.display = "block";
      }
    } finally {
      btnSaveTab.disabled = false;
      btnSaveTab.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Save Current Page to Bookar`;
    }
  });
}

// ── Manual Sync Button ────────────────────────────────────────────────────────
if (btnManualSync) {
  btnManualSync.addEventListener("click", async () => {
    btnManualSync.disabled = true;
    btnManualSync.textContent = "Syncing…";
    chrome.runtime.sendMessage({ type: "FORCE_SYNC" });
    setTimeout(() => {
      btnManualSync.disabled = false;
      btnManualSync.textContent = "Sync Now ⚡";
    }, 1500);
  });
}

// ── Detect browser name ───────────────────────────────────────────────────────
async function detectBrowser() {
  try {
    if (navigator.brave) {
      const isBrave = await navigator.brave.isBrave().catch(() => false);
      if (isBrave) return "Brave";
    }
  } catch {}
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Edge";
  return "Chrome";
}

// ── Link device ───────────────────────────────────────────────────────────────
if (btnLink) {
  btnLink.addEventListener("click", async () => {
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      showError("Please enter the 6-digit code from your dashboard.");
      return;
    }

    btnLink.disabled = true;
    btnLink.innerHTML = '<span class="spinner"></span> Linking…';
    hideMessages();

    try {
      const browser = await detectBrowser();
      const customName = nameInput ? nameInput.value.trim() : "";
      const deviceName = customName || `My ${browser}`;

      const apiBase = await getApiBase();
      const linkEndpoint = `${apiBase}/api/link-device`;

      const res = await fetch(linkEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linking_code: code,
          device_name: deviceName,
          browser: browser,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errCode = data?.error?.code;
        if (errCode === "NOT_FOUND") {
          showError("Code not found. Make sure you copied it correctly.");
        } else if (errCode === "CODE_EXPIRED") {
          showError("Code has expired. Generate a new one from the dashboard.");
        } else {
          showError(data?.error?.message ?? "Something went wrong. Try again.");
        }
        return;
      }

      // Store API key and device info
      await chrome.storage.local.set({
        bookar_api_key: data.api_key,
        bookar_device_id: data.device_id,
        bookar_device_name: deviceName,
        bookar_browser: browser,
        bookar_api_base: apiBase,
      });

      showSuccess("✓ Device linked! Syncing your bookmarks...");

      // Notify background to trigger backfill
      chrome.runtime.sendMessage({ type: "DEVICE_LINKED" });

      // Switch to linked state after a short delay
      setTimeout(() => {
        showLinkedState(deviceName, browser);
        loadActiveTabInfo();
      }, 1200);
    } catch (err) {
      showError("Network error. Please check your connection and try again.");
    } finally {
      btnLink.disabled = false;
      btnLink.textContent = "Link Device";
    }
  });
}

// ── Unlink device ─────────────────────────────────────────────────────────────
if (btnUnlink) {
  btnUnlink.addEventListener("click", async () => {
    if (!confirm("Unlink this device? Your bookmarks will remain in Bookar.")) return;
    await chrome.storage.local.remove([
      "bookar_api_key",
      "bookar_device_id",
      "bookar_device_name",
      "bookar_browser",
      "bookar_api_base",
      "bookar_backfill_done",
      "bookar_sync_cursor",
    ]);
    showUnlinkedState();
  });
}

// ── Code input filters ────────────────────────────────────────────────────────
if (codeInput) {
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
    hideMessages();
  });

  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && btnLink) btnLink.click();
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
