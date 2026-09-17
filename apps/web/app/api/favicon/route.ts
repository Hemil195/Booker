// apps/web/app/api/favicon/route.ts
// Direct server-side HTML metadata scraper for extracting favicons.

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domainParam = searchParams.get("domain") || searchParams.get("url");

  if (!domainParam) {
    return new NextResponse("Domain or URL required", { status: 400 });
  }

  let domain = domainParam.trim().toLowerCase();
  try {
    const rawUrl = domain.match(/^[a-zA-Z]+:\/\//) ? domain : `https://${domain}`;
    const parsed = new URL(rawUrl);
    domain = parsed.hostname;
  } catch {
    domain = domain.split("/")[0].split(":")[0];
  }

  if (!domain || domain === "localhost" || domain === "127.0.0.1") {
    return new NextResponse("Icon not found", { status: 404 });
  }

  const targetOrigin = `https://${domain}`;

  try {
    // 1. Fetch site HTML with 3s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(targetOrigin, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      // Match <link rel="icon" ... href="..."> or apple-touch-icon / shortcut icon
      const iconMatch = html.match(/<link[^>]+rel=["']?(?:shortcut icon|icon|apple-touch-icon)["']?[^>]+href=["']?([^"'\s>]+)["']?/i) ||
                        html.match(/<link[^>]+href=["']?([^"'\s>]+)["']?[^>]+rel=["']?(?:shortcut icon|icon|apple-touch-icon)["']?/i);

      if (iconMatch && iconMatch[1]) {
        let iconUrl = iconMatch[1].trim();
        if (iconUrl.startsWith("//")) {
          iconUrl = `https:${iconUrl}`;
        } else if (iconUrl.startsWith("/")) {
          iconUrl = `${targetOrigin}${iconUrl}`;
        } else if (!iconUrl.startsWith("http")) {
          iconUrl = `${targetOrigin}/${iconUrl}`;
        }

        return NextResponse.redirect(iconUrl, {
          headers: {
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }
    }
  } catch {
    // HTML scraping timed out or failed
  }

  // 2. Fallback check for /favicon.ico at root
  try {
    const icoUrl = `${targetOrigin}/favicon.ico`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const icoRes = await fetch(icoUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (icoRes.ok) {
      return NextResponse.redirect(icoUrl, {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    }
  } catch {}

  return new NextResponse("Favicon not found", { status: 404 });
}
