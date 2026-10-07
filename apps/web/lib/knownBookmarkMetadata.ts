export interface KnownBookmarkMetadata {
  title: string;
  description: string;
  category: string;
  folder?: string;
}

const KNOWN_HOSTS: Record<string, KnownBookmarkMetadata> = {
  "drive.google.com": {
    title: "Google Drive",
    description: "Google Drive is a cloud storage service for storing, organizing, and sharing files. This bookmark opens your Google Drive workspace.",
    category: "Productivity",
    folder: "Drive",
  },
  "mail.google.com": {
    title: "Gmail",
    description: "Gmail is Google's email service for sending, receiving, and organizing messages. This bookmark opens your Gmail inbox.",
    category: "Productivity",
    folder: "Mail",
  },
  "gmail.com": {
    title: "Gmail",
    description: "Gmail is Google's email service for sending, receiving, and organizing messages. This bookmark opens your Gmail inbox.",
    category: "Productivity",
    folder: "Mail",
  },
};

export function getKnownBookmarkMetadata(url: string): KnownBookmarkMetadata | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (KNOWN_HOSTS[hostname]) return KNOWN_HOSTS[hostname];

    if (hostname === "docs.google.com" || hostname === "sheets.google.com" || hostname === "slides.google.com") {
      const title = hostname === "sheets.google.com" ? "Google Sheets" : hostname === "slides.google.com" ? "Google Slides" : "Google Docs";
      const descriptions: Record<string, string> = {
        "Google Docs": "Google Docs is an online word processor for creating, editing, and collaborating on documents.",
        "Google Sheets": "Google Sheets is an online spreadsheet app for organizing data, working with formulas, and collaborating.",
        "Google Slides": "Google Slides is an online presentation app for creating and collaborating on slide decks.",
      };
      return {
        title,
        description: descriptions[title],
        category: "Productivity",
      };
    }
  } catch {
    return null;
  }

  return null;
}