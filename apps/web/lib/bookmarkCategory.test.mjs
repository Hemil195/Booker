import assert from "node:assert/strict";
import test from "node:test";
import { isGenericBrowserFolder, normalizeCategory } from "./bookmarkCategory.ts";

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