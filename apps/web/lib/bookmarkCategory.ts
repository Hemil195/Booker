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
    "bookmark", "search", "project management", "to do list", "document editor",
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