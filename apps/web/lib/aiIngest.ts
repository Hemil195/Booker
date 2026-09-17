// apps/web/lib/aiIngest.ts
// Background helper to fetch page metadata and invoke NVIDIA LLM for descriptions.
// Optimized for fast, resilient serverless execution on live deployments.

import { createSupabaseAdminClient } from "./supabaseClient";

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";

const CATEGORIES = [
  "AI & Tools", "Development", "Design", "Learning", "Productivity",
  "Business", "Government", "Media", "Finance", "Travel", "Shopping", "News", "Health", "Other",
] as const;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "AI & Tools": ["ai", "artificial intelligence", "llm", "machine learning", "generative ai", "chatbot", "neural"],
  Development: ["code", "coding", "developer", "programming", "api", "github", "database", "javascript", "c-sharp", "c#", "dotnet", ".net"],
  Design: ["design", "ui", "ux", "figma", "prototype", "css", "creative", "visual"],
  Learning: ["learn", "course", "tutorial", "education", "lesson", "school", "university"],
  Productivity: ["productivity", "notes", "task", "calendar", "workflow", "organize", "organization", "bookmark", "search"],
  Business: ["business", "startup", "company", "marketing", "sales", "entrepreneur"],
  Government: ["government", "gov", "public service", "citizen", "state portal", "official portal"],
  Media: ["video", "movie", "music", "podcast", "stream", "photo"],
  Finance: ["finance", "bank", "money", "investment", "stock", "payment", "crypto"],
  Travel: ["travel", "flight", "hotel", "trip", "vacation", "tourism"],
  Shopping: ["shop", "shopping", "store", "buy", "product", "deal"],
  News: ["news", "journal", "politics", "headline", "press"],
  Health: ["health", "medical", "doctor", "fitness", "medicine", "wellness"],
};

function isGenericBrowserFolder(folder?: string | null): boolean {
  if (!folder) return true;
  return /^(other bookmarks|bookmarks bar|mobile bookmarks|imported)(\/|$)/i.test(folder.trim());
}

function normalizeDescription(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const cleaned = value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(description|summary)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ?? [];
  return sentences.slice(0, 3).join(" ") || fallback;
}

function normalizeTags(value: unknown, domain: string): string[] {
  const raw = Array.isArray(value) ? value : [];
  const tags = raw
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter((tag) => tag.length >= 2 && tag.length <= 35)
    .filter((tag) => !["website", "web", "page", "resource", "saved", "other"].includes(tag))
    .filter((tag) => !domain.split(".").includes(tag));
  return Array.from(new Set(tags))
    .filter(Boolean)
    .slice(0, 6);
}

function fallbackTags(title: string, url: string): string[] {
  const words = `${title} ${url}`
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word) => !["www", "com", "org", "net", "gov", "in", "http", "https"].includes(word));
  return Array.from(new Set(words)).slice(0, 6);
}

function normalizeCategory(value: unknown, evidence: string): string {
  const candidate = typeof value === "string" ? value.toLowerCase() : "";
  const evidenceText = evidence.toLowerCase();
  let best = "Other";
  let bestScore = 0;
  for (const category of CATEGORIES) {
    const keywordScore = (CATEGORY_KEYWORDS[category] ?? []).reduce(
      (total, keyword) => total + (evidenceText.includes(keyword) ? 1 : 0),
      0,
    );
    const score = keywordScore + (candidate === category.toLowerCase() && keywordScore > 0 ? 2 : 0);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

function parseModelJson(content: string): Record<string, unknown> | null {
  const candidates = content.match(/\{[\s\S]*?\}/g) ?? [];
  for (const candidate of candidates.reverse()) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // Try the next JSON object when a reasoning preamble contains malformed JSON.
    }
  }
  return null;
}

function getDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

function getCleanTitleFromUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const domain = parsed.hostname.replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/$/, "").split("/").pop();
    if (pathname && pathname.length > 2) {
      const formatted = pathname.replace(/[-_]/g, " ");
      return `${formatted.charAt(0).toUpperCase() + formatted.slice(1)} — ${domain}`;
    }
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return urlStr;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string): string {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageMeta(url: string): Promise<{
  title?: string;
  description?: string;
  content?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BookarBot/1.0; +https://bookar.app)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // Some government and JavaScript-heavy sites reject ordinary server fetches.
      // Jina Reader provides a text-only rendering that is useful for summarization.
      const readerResponse = await fetch(`https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`, {
        signal: AbortSignal.timeout(12000),
        headers: { Accept: "text/plain", "User-Agent": "BookarBot/1.0" },
      });
      if (readerResponse.ok) return { content: (await readerResponse.text()).slice(0, 5000) };
      return {};
    }
    const html = (await res.text()).slice(0, 1_500_000);

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const getMeta = (key: string) => {
      const match = html.match(
        new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      );
      return match?.[1]?.trim();
    };
    const ogDesc = getMeta("og:description");
    const metaDesc = getMeta("description");
    const withoutNoise = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    const articleRoot = withoutNoise.match(/<(?:main|article)[^>]*>[\s\S]*?<\/(?:main|article)>/i)?.[0] || withoutNoise;
    const headings = Array.from(articleRoot.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
      .map((match) => cleanText(match[1]))
      .filter((text) => text.length >= 3)
      .join(" ");
    const paragraphs = Array.from(articleRoot.matchAll(/<(?:section|p|h1|h2|h3|li)[^>]*>([\s\S]*?)<\/(?:section|p|h1|h2|h3|li)>/gi))
      .map((match) => cleanText(match[1]))
      .filter((text) => text.length >= 30)
      .join(" ")
      .slice(0, 6_000);
    const pathText = new URL(url).pathname.replace(/[-_/]+/g, " ").replace(/\.[a-z0-9]+$/i, "").trim();
    const genericSiteDescription = /comprehensive educational platform|all-in-one learning portal|learners across domains/i.test(metaDesc || "");

    return {
      title: titleMatch ? cleanText(titleMatch[1]) : undefined,
      description: genericSiteDescription ? undefined : ogDesc || metaDesc,
      content: [pathText, headings, paragraphs || cleanText(articleRoot).slice(0, 4_000)].filter(Boolean).join(" ").slice(0, 4_500),
    };
  } catch {
    return {};
  }
}

export async function processBookmarkAiDescription(
  bookmarkId: string,
  url: string,
  currentTitle?: string,
  currentFolder?: string | null,
) {
  const supabase = createSupabaseAdminClient();

  try {
    // 1. Fetch metadata and readable page text before asking NVIDIA to summarize it.
    const meta = await fetchPageMeta(url);
    const savedTitle = currentTitle && !/^https?:\/\//i.test(currentTitle) ? currentTitle.trim() : "";
    const contextTitle = savedTitle || meta.title || getCleanTitleFromUrl(url);
    const contextDesc = meta.description || "";
    const pageContent = meta.content || "";
    const domain = getDomain(url);
    const urlPath = new URL(url).pathname.replace(/[-_/]+/g, " ").replace(/\.[a-z0-9]+$/i, "").trim();

    const fallbackDescription = contextDesc || (pageContent
      ? `This page, titled "${contextTitle}", contains information available at ${domain}. It may be useful to review the page for its specific content and purpose.`
      : `This bookmark points to "${contextTitle}" on ${domain}. The site blocked automatic reading, so open the link to view its current content.`);
    let aiDescription = fallbackDescription;
    let modelTags: unknown[] = [];
    let modelCategory: unknown = null;

    // 2. Call NVIDIA NIM LLM if API key is provided
    if (NVIDIA_API_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);

            const prompt = `You are Bookar's bookmark summarizer. Analyze the supplied webpage evidence and write for a normal human reader.
          Use ONLY the evidence below. The saved bookmark title and URL path identify the specific article and take priority over generic website branding or site-wide descriptions. Never summarize the website brand when the title identifies a specific article.
URL: ${url}
      URL topic/path: ${urlPath || "(none)"}
Saved bookmark title: ${contextTitle}
Fetched page title: ${meta.title || "(unavailable)"}
      Metadata description: ${contextDesc || "(none)"}
      Visible page text: ${pageContent || "(none)"}

Task:
      1. Write exactly 2 or 3 short sentences in clear, friendly English. Explain what the page is, what a user can do there, and why it may be useful.
      2. Provide 3 to 6 specific lower-case tags. Do not use generic tags such as website, page, resource, or saved.
      3. Choose one folder category from: AI & Tools, Development, Design, Learning, Productivity, Business, Government, Media, Finance, Travel, Shopping, News, Health, or Other.

Respond ONLY with valid JSON in this exact structure:
      {"description":"...","tags":["tag1","tag2"],"folder":"Development"}`;

        const llmRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          signal: controller.signal,
          method: "POST",
          headers: {
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: NVIDIA_MODEL,
            messages: [
              {
                role: "system",
                content: "Return only the requested JSON object. Do not include a preamble, analysis, Markdown, or code fences.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 400,
            response_format: { type: "json_object" },
          }),
        });
        clearTimeout(timeout);

        if (llmRes.ok) {
          const llmData = await llmRes.json();
          const content = llmData.choices?.[0]?.message?.content ?? "";
          const parsed = parseModelJson(content);
          if (parsed) {
            if (parsed.description) aiDescription = normalizeDescription(parsed.description, fallbackDescription);
            if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
              modelTags = parsed.tags;
            }
            modelCategory = parsed.folder;
          }
        } else {
          console.warn("NVIDIA summary request failed", llmRes.status, await llmRes.text());
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.warn("NVIDIA summary timed out for", url);
        } else {
          console.warn("NVIDIA LLM call notice for", url, err);
        }
      }
    }

    const evidence = `${contextTitle} ${urlPath} ${contextDesc} ${pageContent} ${url}`;
    const category = normalizeCategory(modelCategory, evidence);
    const tags = normalizeTags(modelTags, domain);
    const finalTags = tags.length > 0 ? tags : fallbackTags(contextTitle, url);
    const folder = isGenericBrowserFolder(currentFolder) ? category : currentFolder;

    // 3. Update bookmark row
    await supabase
      .from("bookmarks")
      .update({
        title: contextTitle,
        description: aiDescription,
        tags: finalTags,
        folder_path: folder,
        description_pending: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookmarkId);
  } catch (err) {
    console.error("AI Ingest error:", err);
    await supabase
      .from("bookmarks")
      .update({ description_pending: false })
      .eq("id", bookmarkId);
  }
}
