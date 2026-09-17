// apps/web/lib/favicon.ts
// Utility module for multi-tier favicon fetching and fallback generation.

/**
 * Extracts clean domain / hostname from a URL or domain string.
 */
export function getDomainFromUrl(urlOrDomain: string): string {
  if (!urlOrDomain) return "";
  const trimmed = urlOrDomain.trim();
  try {
    const rawUrl = trimmed.match(/^[a-zA-Z]+:\/\//) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(rawUrl);
    return parsed.hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase().split("/")[0].split(":")[0];
  }
}

/**
 * Returns an ordered 5-tier list of favicon service URLs for a given domain/URL.
 * 1. FaviconAPI.com (Free scraper & 10-upstream aggregator - returns true 404 on failure)
 * 2. DuckDuckGo Favicon Service (High coverage, returns 404 on failure)
 * 3. Icon Horse Service
 * 4. Bookar Native Server HTML Scraper (/api/favicon?domain=...)
 * 5. Google S2 Favicon API
 */
export function getFaviconFallbackChain(urlOrDomain: string, size: number = 64): string[] {
  const domain = getDomainFromUrl(urlOrDomain);
  if (!domain) return [];

  const encoded = encodeURIComponent(domain);
  return [
    `https://faviconapi.com/${encoded}`,
    `https://icons.duckduckgo.com/ip3/${encoded}.ico`,
    `https://icon.horse/icon/${encoded}`,
    `/api/favicon?domain=${encoded}`,
    `https://www.google.com/s2/favicons?domain=${encoded}&sz=${size}`,
  ];
}

/**
 * Returns 1-2 uppercase letters representing domain initials for avatar fallback.
 * e.g., "google.com" -> "G", "nytimes.com" -> "NY", "github.com" -> "G"
 */
export function getDomainInitials(urlOrDomain: string): string {
  const domain = getDomainFromUrl(urlOrDomain);
  if (!domain) return "🔗";

  const clean = domain.replace(/^www\./, "");
  const parts = clean.split(".");
  const name = parts[0] || clean;

  if (!name) return "🔗";
  if (name.length <= 2) return name.toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)", // Blue
  "linear-gradient(135deg, #10B981 0%, #047857 100%)", // Emerald
  "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)", // Purple
  "linear-gradient(135deg, #F59E0B 0%, #B45309 100%)", // Amber
  "linear-gradient(135deg, #EC4899 0%, #BE185D 100%)", // Pink
  "linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)", // Cyan
  "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)", // Indigo
  "linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)", // Rose
];

/**
 * Deterministically generates a gradient background style for domain fallbacks.
 */
export function getDomainColor(urlOrDomain: string): string {
  const domain = getDomainFromUrl(urlOrDomain);
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}
