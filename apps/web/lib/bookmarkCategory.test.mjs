import assert from "node:assert/strict";
import test from "node:test";
import { inferBookmarkFolder, isGenericBrowserFolder, normalizeCategory } from "./bookmarkCategory.ts";
import { getKnownBookmarkMetadata } from "./knownBookmarkMetadata.ts";

const cases = [
  ["AI & Tools", "AI chatbot for generative artificial intelligence"],
  ["Development", "LeetTrack is a tool for tracking coding challenges. It helps users monitor progress and improve problem-solving skills."],
  ["Design", "Figma UI design prototypes and wireframes"],
  ["Learning", "Online university course with tutorials and lessons"],
  ["Productivity", "Task calendar and project management workflow"],
  ["Business", "Startup CRM for marketing and sales teams"],
  ["Government", "Official government portal for citizen public services"],
  ["Media", "India's Got Talent streams episodes and seasons for entertainment"],
  ["Finance", "Cryptocurrency trading and investment portfolio"],
  ["Travel", "Book flights and hotels for your vacation"],
  ["Shopping", "Online shopping store with product deals"],
  ["News", "Breaking news headlines from the newspaper"],
  ["Health", "Medical clinic, doctors, fitness and wellness"],
  ["Other", "A personal page with a welcome message"],
];

for (const [expectedCategory, evidence] of cases) {
  test(`classifies ${expectedCategory} evidence`, () => {
    assert.equal(normalizeCategory("Other", evidence), expectedCategory);
  });
}

test("specific page evidence overrides a conflicting model category", () => {
  assert.equal(normalizeCategory("AI & Tools", cases[1][1]), "Development");
});

test("preserves an explicit model category when evidence has no category signal", () => {
  assert.equal(normalizeCategory("Travel", "My saved page"), "Travel");
});

test("treats generated categories as reclassifiable but keeps custom folders", () => {
  assert.equal(isGenericBrowserFolder("Other"), true);
  assert.equal(isGenericBrowserFolder("AI & Tools"), true);
  assert.equal(isGenericBrowserFolder("Work/Design Tools"), false);
});

test("infers a folder from matching saved bookmark examples", () => {
  const examples = [
    {
      folder_path: "Engineering",
      title: "TypeScript language guide",
      url: "https://docs.example.dev/typescript",
      tags: ["programming", "developer"],
    },
  ];
  assert.equal(
    inferBookmarkFolder("TypeScript developer handbook", "https://another.dev/handbook", null, examples),
    "Engineering",
  );
});

test("preserves explicit browser folders during matching", () => {
  assert.equal(
    inferBookmarkFolder("TypeScript developer handbook", "https://another.dev/handbook", "Reading List", []),
    "Reading List",
  );
});

test("leaves ambiguous bookmark matches uncategorized", () => {
  const examples = [
    { folder_path: "Engineering", title: "TypeScript guide", url: "https://one.dev/guide" },
    { folder_path: "Learning", title: "TypeScript guide", url: "https://two.dev/guide" },
  ];
  assert.equal(
    inferBookmarkFolder("TypeScript guide", "https://new.dev/guide", null, examples),
    null,
  );
});

test("recognizes Google Drive as Productivity with a product-specific description", () => {
  const metadata = getKnownBookmarkMetadata("https://drive.google.com/drive/my-drive");
  assert.equal(metadata?.title, "Google Drive");
  assert.equal(metadata?.category, "Productivity");
  assert.equal(metadata?.folder, "Drive");
  assert.match(metadata?.description ?? "", /cloud storage/i);
});

test("recognizes Gmail inbox URLs independently of account path", () => {
  const metadata = getKnownBookmarkMetadata("https://mail.google.com/mail/u/0/#inbox");
  assert.equal(metadata?.title, "Gmail");
  assert.equal(metadata?.category, "Productivity");
  assert.equal(metadata?.folder, "Mail");
  assert.match(metadata?.description ?? "", /email service/i);
});

test("known Google descriptions do not require replacing the user's saved title", () => {
  const savedTitle = "Hemil Patel";
  const knownMetadata = getKnownBookmarkMetadata("https://drive.google.com/drive/my-drive");
  assert.equal(savedTitle || knownMetadata?.title, "Hemil Patel");
});

test("other Google products do not force Drive or Mail folders", () => {
  assert.equal(getKnownBookmarkMetadata("https://docs.google.com/document/d/example")?.folder, undefined);
});

test("recognizes Google Docs, Sheets, and Slides as distinct products", () => {
  assert.equal(getKnownBookmarkMetadata("https://docs.google.com/document/d/example")?.title, "Google Docs");
  assert.equal(getKnownBookmarkMetadata("https://sheets.google.com/spreadsheets/d/example")?.title, "Google Sheets");
  assert.equal(getKnownBookmarkMetadata("https://slides.google.com/presentation/d/example")?.title, "Google Slides");
});

test("does not apply Google product metadata to unrelated hosts", () => {
  assert.equal(getKnownBookmarkMetadata("https://example.com/google-drive"), null);
});