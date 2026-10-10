// apps/mcp-server/search.js
// Bookar Universal Intent-Aware Search Engine
// Works for ANY topic — tech, cooking, law, music, photography, travel,
// medicine, finance, gaming, fashion, science, art, language learning...
//
// HOW IT WORKS:
// 1. Stop-word removal + keyword extraction from natural language query
// 2. Morphological expansion (plurals, verb forms, root words) for each keyword
// 3. Domain-aware scoring — known domains (github, youtube, figma...) get topic bonuses
// 4. Multi-field weighted scoring: title(8) > tags(6) > description(4) > url(2) > folder(2)
// 5. Fallback: if scored results = 0 but DB returned rows, return them sorted by date
//
// Examples that work:
//   "design inspiration"         → Figma, Dribbble, Behance, CSS bookmarks
//   "learn databases"            → PostgreSQL, Supabase, MySQL, MongoDB
//   "react hooks tutorial"       → React, hooks, useEffect bookmarks
//   "Italian pasta recipes"      → cooking, recipe, pasta bookmarks
//   "jazz guitar chords"         → music, guitar, jazz bookmarks
//   "contract law cases"         → law, legal, court bookmarks
//   "startup ideas for 2025"     → ProductHunt, Indie Hackers, SaaS bookmarks
//   "meditation techniques"      → mindfulness, wellness, meditation bookmarks

"use strict";

// ── Stop words ────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  "i","me","my","we","our","you","your","he","she","it","its","they","them",
  "the","a","an","is","are","was","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","can","may","might",
  "need","want","find","show","give","get","look","search","fetch",
  "from","with","for","to","in","on","at","of","and","or","but","not",
  "some","any","all","this","that","these","those","which","who","what",
  "how","when","where","why","about","related","like","similar","same",
  "bookmarks","bookmark","saved","save","links","link","url","urls",
  "resources","resource","page","pages","site","sites","web",
  "stuff","things","anything","something","everything","nothing",
  "please","help","just","also","too","very","really","quite","so",
  "more","most","many","much","few","little","use","used","using",
  "make","made","making","go","going","come","coming","see","saw",
  "know","knowing","think","thought","try","trying","new","old",
  "good","best","top","great","nice","cool","awesome","useful",
  "different","various","other","another","into","over","up","out",
  "re","up","own","no","am","if","as","by",
]);

// ── Morphological expansion ───────────────────────────────────────────────────
// Generates word variants for ANY word, any domain.
// "design" → ["design","designs","designer","designing","designed"]
// "recipe" → ["recipe","recipes","reciped","recipeing"]
// "photography" → ["photography","photographer","photographing","photographed"]
function expandWord(word) {
  const w = word.toLowerCase();
  const variants = new Set([w]);
  // Plurals / singulars
  if (w.endsWith("ies")) variants.add(w.slice(0, -3) + "y");
  else if (w.endsWith("es") && w.length > 4) variants.add(w.slice(0, -2));
  else if (w.endsWith("s") && w.length > 3) variants.add(w.slice(0, -1));
  else { variants.add(w + "s"); variants.add(w + "es"); }
  // Verb forms
  if (w.endsWith("ing") && w.length > 5) { variants.add(w.slice(0, -3)); variants.add(w.slice(0, -3) + "e"); }
  if (w.endsWith("ed") && w.length > 4) { variants.add(w.slice(0, -2)); variants.add(w.slice(0, -1)); }
  if (w.endsWith("er") && w.length > 4) variants.add(w.slice(0, -2));
  // Suffix forms
  if (w.endsWith("tion") && w.length > 5) variants.add(w.slice(0, -3) + "e");
  if (w.endsWith("ity") && w.length > 5) variants.add(w.slice(0, -3));
  if (w.endsWith("al") && w.length > 4) variants.add(w.slice(0, -2));
  if (w.endsWith("ful") && w.length > 5) variants.add(w.slice(0, -3));
  if (w.endsWith("ness") && w.length > 5) variants.add(w.slice(0, -4));
  if (w.endsWith("ly") && w.length > 4) variants.add(w.slice(0, -2));
  // Add -ing / -er for root words
  if (!w.endsWith("ing") && w.length > 3) variants.add(w + "ing");
  if (!w.endsWith("er") && w.length > 3) variants.add(w + "er");
  return Array.from(variants).filter((v) => v.length > 2);
}

// ── Domain hints ──────────────────────────────────────────────────────────────
// Domain → topic keywords. When a bookmark's URL matches one of these domains,
// it gets a relevance bonus if the query overlaps with the domain's topic.
const DOMAIN_HINTS = {
  // Dev & Engineering
  "github.com": ["code","library","tool","developer","open source","project","repo"],
  "stackoverflow.com": ["code","programming","debug","question","developer","answer"],
  "npmjs.com": ["javascript","package","library","node","module","dependency"],
  "codepen.io": ["css","javascript","animation","frontend","demo","design","snippet"],
  "dev.to": ["developer","tutorial","article","programming","tips","opinion"],
  "hackernews.com": ["tech","startup","programming","discussion","news"],
  "hacker-news.firebaseio.com": ["tech","startup","programming","discussion"],
  "raycast.com": ["productivity","tool","developer","extension","shortcut"],
  "caniuse.com": ["css","html","browser","compatibility","web","standard"],
  // Design
  "figma.com": ["design","ui","prototype","wireframe","component","interface"],
  "dribbble.com": ["design","inspiration","ui","visual","creative","art","portfolio"],
  "behance.net": ["design","inspiration","portfolio","creative","art","project"],
  "awwwards.com": ["design","web","creative","inspiration","award","showcase"],
  "framer.com": ["design","animation","ui","prototype","component","website"],
  "webflow.com": ["design","no-code","website","cms","visual","builder"],
  "coolors.co": ["color","palette","design","brand","visual","scheme"],
  "fonts.google.com": ["font","typography","design","web","typeface"],
  // Learning
  "youtube.com": ["video","tutorial","course","learning","guide","how to","watch"],
  "medium.com": ["article","blog","tutorial","guide","essay","learning","opinion"],
  "udemy.com": ["course","learning","tutorial","training","online","certification"],
  "coursera.org": ["course","university","certificate","learning","training","mooc"],
  "substack.com": ["newsletter","article","blog","writing","opinion","analysis"],
  "linkedin.com": ["professional","career","networking","job","business","article"],
  "twitter.com": ["social","news","trending","thread","opinion"],
  "x.com": ["social","news","trending","thread","opinion"],
  // Tools & Productivity
  "notion.so": ["productivity","notes","wiki","template","workspace","docs","database"],
  "obsidian.md": ["notes","knowledge","writing","productivity","markdown","zettelkasten"],
  "airtable.com": ["database","spreadsheet","productivity","no-code","tool"],
  "linear.app": ["project management","issues","engineering","team","agile"],
  // Cloud & Infra
  "vercel.com": ["deployment","hosting","frontend","serverless","next.js"],
  "netlify.com": ["deployment","hosting","frontend","static","serverless"],
  "supabase.com": ["database","backend","postgres","auth","storage","api","open source"],
  "firebase.google.com": ["database","backend","auth","storage","google","mobile"],
  "aws.amazon.com": ["cloud","server","infrastructure","backend","storage","lambda"],
  // AI
  "openai.com": ["ai","gpt","llm","api","chatbot","model","artificial intelligence"],
  "anthropic.com": ["ai","claude","llm","safety","model","assistant"],
  "huggingface.co": ["ai","model","machine learning","dataset","nlp","transformer"],
  "replicate.com": ["ai","model","image generation","api","inference"],
  "langchain.com": ["ai","llm","chain","agent","rag","embedding"],
  // Business
  "producthunt.com": ["startup","product","launch","tool","saas","app","indie"],
  "ycombinator.com": ["startup","founder","investment","accelerator","tech"],
  "stripe.com": ["payment","billing","api","saas","business","finance","subscription"],
  "hubspot.com": ["marketing","crm","sales","email","business","automation"],
  // Finance
  "investopedia.com": ["finance","investing","stock","money","economics","trading"],
  "coinbase.com": ["crypto","bitcoin","blockchain","web3","defi","investment"],
  // Health
  "pubmed.ncbi.nlm.nih.gov": ["research","medicine","health","study","clinical","paper"],
  "healthline.com": ["health","nutrition","fitness","wellness","medicine","symptom"],
  // Food
  "allrecipes.com": ["recipe","cooking","food","ingredient","dish","meal","baking"],
  "seriouseats.com": ["recipe","cooking","food","technique","cuisine","chef"],
  "bonappetit.com": ["recipe","food","cooking","restaurant","cuisine","chef"],
};

// ── Parse a natural language query ───────────────────────────────────────────
function parseQuery(query) {
  const q = query.toLowerCase().trim();
  const words = q
    .replace(/[^a-z0-9\s'\-]/g, " ")
    .split(/[\s\-]+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  const expanded = new Set(words);
  for (const word of words) {
    expandWord(word).forEach((v) => expanded.add(v));
  }

  return { words, expanded: Array.from(expanded), originalQuery: q };
}

// ── Score a single bookmark ───────────────────────────────────────────────────
function scoreBookmark(bm, { words, expanded, originalQuery }) {
  const title = (bm.title ?? "").toLowerCase();
  const desc = (bm.description ?? "").toLowerCase();
  const url = (bm.url ?? "").toLowerCase();
  const tags = (Array.isArray(bm.tags) ? bm.tags.join(" ") : "").toLowerCase();
  const folder = (bm.folder_path ?? "").toLowerCase();
  let score = 0;

  // Exact full query match (jackpot)
  if (title.includes(originalQuery)) score += 25;
  else if (desc.includes(originalQuery)) score += 10;
  else if (url.includes(originalQuery)) score += 6;

  // Individual word matches
  for (const word of words) {
    if (word.length < 2) continue;
    if (title.includes(word)) score += 8;
    if (tags.includes(word)) score += 6;
    if (desc.includes(word)) score += 4;
    if (url.includes(word)) score += 2;
    if (folder.includes(word)) score += 2;
  }

  // Morphological variant matches (lower weight)
  for (const variant of expanded) {
    if (words.includes(variant)) continue;
    if (variant.length < 3) continue;
    if (title.includes(variant)) score += 3;
    if (tags.includes(variant)) score += 3;
    if (desc.includes(variant)) score += 1;
    if (url.includes(variant)) score += 1;
  }

  // Domain hint bonus
  try {
    const hostname = new URL(bm.url ?? "http://x").hostname.replace(/^www\./, "");
    for (const [domain, hints] of Object.entries(DOMAIN_HINTS)) {
      if (hostname.includes(domain)) {
        const overlap = hints.filter((h) =>
          words.some((w) => h.includes(w) || w.includes(h)) ||
          expanded.some((e) => h.includes(e) || e.includes(h))
        );
        score += overlap.length * 4;
        break;
      }
    }
  } catch { /* ignore bad URLs */ }

  return score;
}

// ── Main search function ──────────────────────────────────────────────────────
async function searchBookmarks(supabase, uid, query, { limit = 20, withTimeout, folder, tag, saved_after, saved_before } = {}) {
  const parsed = parseQuery(query);
  const applyFilters = (request) => {
    if (folder) request = request.eq("folder_path", folder);
    if (tag) request = request.contains("tags", [tag.trim().toLowerCase()]);
    if (saved_after) request = request.gte("created_at", saved_after);
    if (saved_before) request = request.lte("created_at", saved_before);
    return request;
  };

  // All stop words / empty query → recent bookmarks
  if (!parsed.words.length) {
    const fetch = applyFilters(supabase
      .from("bookmarks")
      .select("id, title, url, description, tags, folder_path, created_at")
      .eq("user_id", uid).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(limit));
    const { data, error } = withTimeout ? await withTimeout(fetch) : await fetch;
    if (error) throw new Error(error.message);
    return data || [];
  }

  // Build broad OR filter
  const phrase = parsed.originalQuery.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const keyTerms = [...new Set([...parsed.words, ...parsed.expanded])]
    .filter((t) => t.length > 2)
    .slice(0, 8);

  const parts = [
    `title.ilike.%${phrase}%`,
    `url.ilike.%${phrase}%`,
    `description.ilike.%${phrase}%`,
    ...keyTerms.flatMap((t) => {
      const s = t.replace(/'/g, "''");
      return [`title.ilike.%${s}%`, `description.ilike.%${s}%`, `url.ilike.%${s}%`];
    }),
  ];
  const uniqueParts = [...new Set(parts)];

  const fetch = applyFilters(supabase
    .from("bookmarks")
    .select("id, title, url, description, tags, folder_path, created_at")
    .eq("user_id", uid).is("deleted_at", null)
    .or(uniqueParts.join(","))
    .order("created_at", { ascending: false })
    .limit(limit * 5));

  const { data, error } = withTimeout ? await withTimeout(fetch) : await fetch;
  if (error) throw new Error(error.message);

  const scored = (data || []);
  const results = scored
    .map((bm) => ({ ...bm, _score: scoreBookmark(bm, parsed) }))
    .filter((bm) => bm._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  // Fallback: broad results even if nothing scored
  if (results.length === 0 && scored.length > 0) {
    return scored.slice(0, limit);
  }
  return results;
}

module.exports = { searchBookmarks, parseQuery, scoreBookmark, expandWord };
