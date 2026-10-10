// apps/web/lib/aiIngest.ts
// Background helper to fetch page metadata and invoke Groq first, with NVIDIA as a fallback.
// Optimized for fast, resilient serverless execution on live deployments.

import { createSupabaseAdminClient } from "./supabaseClient";
import { isGenericBrowserFolder, normalizeCategory } from "./bookmarkCategory";
import { getKnownBookmarkMetadata } from "./knownBookmarkMetadata";

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_MODEL = process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";

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

async function callStructuredModel(
  provider: "groq" | "nvidia",
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider === "groq" ? 12000 : 15000);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Return only the requested JSON object. Do not include a preamble, analysis, Markdown, or code fences.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${provider.toUpperCase()} request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseModelJson(content);
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`${provider.toUpperCase()} summary request timed out; retrying fallback provider if configured`, provider === "groq" ? "groq" : "nvidia");
    } else {
      console.warn(`${provider.toUpperCase()} LLM call failed`, err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
      if (readerResponse.ok) return { content: (await readerResponse.text()).slice(0, 8000) };
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
      content: [pathText, headings, paragraphs || cleanText(articleRoot).slice(0, 4_000)].filter(Boolean).join(" ").slice(0, 5_000),
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
  options: { preserveFolder?: boolean } = {},
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  try {
    // 1. Fetch metadata and readable page text before asking NVIDIA to summarize it.
    const knownMetadata = getKnownBookmarkMetadata(url);
    const meta = knownMetadata ? {} : await fetchPageMeta(url);
    const savedTitle = currentTitle && !/^https?:\/\//i.test(currentTitle) ? currentTitle.trim() : "";
    const contextTitle = savedTitle || knownMetadata?.title || meta.title || getCleanTitleFromUrl(url);
    const contextDesc = knownMetadata?.description || meta.description || "";
    const pageContent = knownMetadata?.description || meta.content || "";
    const domain = getDomain(url);
    const urlPath = new URL(url).pathname.replace(/[-_/]+/g, " ").replace(/\.[a-z0-9]+$/i, "").trim();

    const fallbackDescription = contextDesc || (pageContent
      ? `This page, titled "${contextTitle}", contains information available at ${domain}. It may be useful to review the page for its specific content and purpose.`
      : `This bookmark points to "${contextTitle}" on ${domain}. The site blocked automatic reading, so open the link to view its current content.`);
    let aiDescription: string | null = knownMetadata?.description ?? null;
    let modelTags: unknown[] = [];
    let modelCategory: unknown = knownMetadata?.category ?? null;

    // 2. Try Groq first, then NVIDIA as a backup if Groq fails or is unavailable.
    const prompt = `Article title: ${contextTitle}
    Article URL path: ${urlPath || "(none)"}
    Article text: ${pageContent || "(none)"}

    Return exactly one compact JSON object and nothing else. Do not write analysis or reasoning. The description must be exactly two short plain-English sentences about this specific article, not the website brand. Use 3-5 specific lowercase tags and one category from: AI & Tools, Development, Design, Learning, Productivity, Business, Government, Media, Finance, Travel, Shopping, News, Health, Other.
    JSON keys: description, tags, folder.`;

    const providerAttempts: Array<{ provider: "groq" | "nvidia"; endpoint: string; apiKey: string; model: string }> = [];
    if (GROQ_API_KEY) {
      providerAttempts.push({
        provider: "groq",
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: GROQ_API_KEY,
        model: GROQ_MODEL,
      });
    }
    if (NVIDIA_API_KEY) {
      providerAttempts.push({
        provider: "nvidia",
        endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
        apiKey: NVIDIA_API_KEY,
        model: NVIDIA_MODEL,
      });
    }

    for (const attempt of knownMetadata ? [] : providerAttempts) {
      const parsed = await callStructuredModel(
        attempt.provider,
        attempt.endpoint,
        attempt.apiKey,
        attempt.model,
        prompt,
      );

      if (!parsed || typeof parsed.description !== "string" || !parsed.description.trim()) {
        const nextProvider = providerAttempts[providerAttempts.indexOf(attempt) + 1];
        if (nextProvider) {
          console.warn(`${attempt.provider.toUpperCase()} failed; falling back to ${nextProvider.provider.toUpperCase()}`);
        }
        continue;
      }

      aiDescription = normalizeDescription(parsed.description, fallbackDescription);
      if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
        modelTags = parsed.tags;
      }
      modelCategory = parsed.folder;
      break;
    }

    const evidence = `${contextTitle} ${urlPath} ${contextDesc} ${pageContent} ${url}`;
    const category = normalizeCategory(modelCategory, evidence);
    const tags = normalizeTags(modelTags, domain);
    const finalTags = tags.length > 0 ? tags : fallbackTags(contextTitle, url);
    const folder = knownMetadata?.folder
      ?? (isGenericBrowserFolder(currentFolder) ? category : currentFolder ?? null);

    // Preserve the saved description unless a provider returned a new one.
    const update: {
      title: string;
      tags: string[];
      folder_path?: string | null;
      description_pending: boolean;
      updated_at: string;
      description?: string;
    } = {
      title: contextTitle,
      tags: finalTags,
      description_pending: false,
      updated_at: new Date().toISOString(),
    };
    if (!options.preserveFolder) update.folder_path = folder;
    if (aiDescription) update.description = aiDescription;

    // 3. Update bookmark row
    await supabase
      .from("bookmarks")
      .update(update)
      .eq("id", bookmarkId);
    return folder;
  } catch (err) {
    console.error("AI Ingest error:", err);
    await supabase
      .from("bookmarks")
      .update({ description_pending: false })
      .eq("id", bookmarkId);
    return currentFolder ?? null;
  }
}
