export const CATEGORIES = [
  "AI & Tools",
  "Development",
  "Design",
  "Learning",
  "Productivity",
  "Business",
  "Government",
  "Media",
  "Finance",
  "Travel",
  "Shopping",
  "News",
  "Health",
  "Other",
] as const;

const CATEGORY_KEYWORDS: Record<(typeof CATEGORIES)[number], string[]> = {
  "AI & Tools": [
    "ai", "artificial intelligence", "llm", "large language model", "machine learning",
    "generative ai", "chatbot", "neural network", "model inference", "language model",
    "prompt engineering", "image generation",
  ],
  Development: [
    "code", "coding", "coding challenge", "developer", "development", "programming",
    "software", "api", "github", "database", "javascript", "typescript", "python",
    "c sharp", "c#", "dotnet", "git", "repository", "leetcode", "problem solving",
  ],
  Design: [
    "design", "ui", "ux", "user interface", "figma", "prototype", "css", "creative",
    "visual design", "graphic design", "wireframe", "typography",
  ],
  Learning: [
    "learn", "learning", "course", "tutorial", "education", "lesson", "school",
    "university", "study", "curriculum", "academy", "training", "lecture",
  ],
  Productivity: [
    "productivity", "notes", "task", "calendar", "workflow", "organize", "organization",
    "bookmark", "search", "project management", "to do list", "document editor", "cloud storage",
    "email service", "inbox", "online document", "collaborate on files",
  ],
  Business: [
    "business", "startup", "company", "marketing", "sales", "entrepreneur", "crm",
    "customer relationship management", "business plan",
  ],
  Government: [
    "government", "gov", "public service", "citizen", "state portal", "official portal",
    "municipality", "public records", "immigration service",
  ],
  Media: [
    "video", "movie", "film", "music", "podcast", "stream", "streaming", "episode",
    "episodes", "tv show", "television", "entertainment", "talent show", "series",
    "watch online", "broadcast", "photo", "season", "live tv", "singer",
  ],
  Finance: [
    "finance", "bank", "money", "investment", "stock", "payment", "crypto",
    "cryptocurrency", "trading", "portfolio", "accounting", "budgeting",
  ],
  Travel: [
    "travel", "flight", "hotel", "trip", "vacation", "tourism", "airline", "itinerary",
    "travel booking", "destination",
  ],
  Shopping: [
    "shop", "shopping", "store", "buy", "product", "deal", "ecommerce", "shopping cart",
    "marketplace", "price comparison",
  ],
  News: [
    "news", "journal", "politics", "headline", "press", "newspaper", "current events",
    "breaking news", "journalism",
  ],
  Health: [
    "health", "medical", "doctor", "fitness", "medicine", "wellness", "hospital", "patient",
    "diagnosis", "workout", "mental health",
  ],
  Other: [],
};

function normalizeEvidence(value: string): string {
  return value
    .toLowerCase()
    .replace(/c\s*\+\s*\+/g, " c plus plus ")
    .replace(/c\s*#|c-sharp/g, " c sharp ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGenericBrowserFolder(folder?: string | null): boolean {
  if (!folder) return true;
  const normalizedFolder = folder.trim().toLowerCase();
  return /^(other bookmarks|bookmarks bar|mobile bookmarks|imported)(\/|$)/i.test(normalizedFolder)
    || CATEGORIES.some((category) => category.toLowerCase() === normalizedFolder);
}

export interface BookmarkFolderExample {
  folder_path: string | null;
  title: string | null;
  url: string;
  description?: string | null;
  tags?: string[];
}

const FOLDER_MATCH_STOP_WORDS = new Set([
  "and", "are", "com", "for", "from", "http", "https", "into", "net", "org", "the", "this", "with", "www",
]);

function bookmarkTokens(values: Array<string | null | undefined>): Set<string> {
  return new Set(values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !FOLDER_MATCH_STOP_WORDS.has(token)));
}

function bookmarkHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isDefaultFolderPath(folder: string | null): boolean {
  return !folder?.trim() || /^(other bookmarks|bookmarks bar|mobile bookmarks|imported)$/i.test(folder.trim());
}

export function createBookmarkFolderMatcher(examples: BookmarkFolderExample[]) {
  const preparedExamples = examples.flatMap((example) => {
    const folder = example.folder_path?.trim();
    if (!folder || isDefaultFolderPath(folder)) return [];

    const tokens = bookmarkTokens([
      example.title,
      example.url,
      example.description,
      ...(example.tags ?? []),
    ]);
    return tokens.size > 0 ? [{ folder, tokens, host: bookmarkHost(example.url) }] : [];
  });

  return (title: string, url: string, currentFolder: string | null): string | null => {
    if (!isDefaultFolderPath(currentFolder)) return currentFolder;

    const incomingTokens = bookmarkTokens([title, url]);
    if (incomingTokens.size === 0) return currentFolder;

    const folderScores = new Map<string, number[]>();
    const incomingHost = bookmarkHost(url);

    for (const example of preparedExamples) {
      const { folder, tokens: exampleTokens } = example;
      let sharedTokens = 0;
      for (const token of incomingTokens) {
        if (exampleTokens.has(token)) sharedTokens++;
      }

      const overlapScore = sharedTokens / Math.sqrt(incomingTokens.size * exampleTokens.size);
      const hostScore = incomingHost && incomingHost === example.host ? 0.35 : 0;
      if (overlapScore + hostScore < 0.28) continue;

      const scores = folderScores.get(folder) ?? [];
      scores.push(overlapScore + hostScore);
      folderScores.set(folder, scores);
    }

    const rankedFolders = Array.from(folderScores, ([folder, scores]) => ({
      folder,
      score: Math.max(...scores) + Math.min(scores.length - 1, 3) * 0.04,
    })).sort((first, second) => second.score - first.score);

    if (!rankedFolders.length || (rankedFolders[1] && rankedFolders[0].score - rankedFolders[1].score < 0.08)) {
      return currentFolder;
    }

    return rankedFolders[0].folder;
  };
}

export function inferBookmarkFolder(
  title: string,
  url: string,
  currentFolder: string | null,
  examples: BookmarkFolderExample[],
): string | null {
  return createBookmarkFolderMatcher(examples)(title, url, currentFolder);
}

export function normalizeCategory(value: unknown, evidence: string): string {
  const candidate = typeof value === "string"
    ? CATEGORIES.find((category) => category.toLowerCase() === value.trim().toLowerCase())
    : undefined;
  const normalizedEvidence = normalizeEvidence(evidence);
  const paddedEvidence = ` ${normalizedEvidence} `;
  let bestCategory: (typeof CATEGORIES)[number] | null = null;
  let bestScore = 0;
  let tiedCategories: (typeof CATEGORIES)[number][] = [];

  for (const category of CATEGORIES) {
    const score = CATEGORY_KEYWORDS[category].reduce((total, keyword) => {
      const normalizedKeyword = normalizeEvidence(keyword);
      if (!normalizedKeyword || !paddedEvidence.includes(` ${normalizedKeyword} `)) return total;
      return total + (normalizedKeyword.includes(" ") ? 2 : 1);
    }, 0);

    if (score > bestScore) {
      bestCategory = category;
      bestScore = score;
      tiedCategories = [category];
    } else if (score > 0 && score === bestScore) {
      tiedCategories.push(category);
    }
  }

  if (bestCategory && bestScore > 0) {
    return candidate && tiedCategories.includes(candidate) ? candidate : bestCategory;
  }
  return candidate ?? "Other";
}