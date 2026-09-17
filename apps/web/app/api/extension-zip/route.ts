// app/api/extension-zip/route.ts
// On-the-fly bundler: zips the production extension folder and injects the live domain URL.

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import JSZip from "jszip";

const EXT_DIR = path.join(process.cwd(), "..", "..", "extension");

function addDirToZip(zip: JSZip, dirPath: string, zipPath: string, targetDomain: string) {
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const entryZipPath = zipPath ? `${zipPath}/${entry}` : entry;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addDirToZip(zip, fullPath, entryZipPath, targetDomain);
    } else {
      let content = fs.readFileSync(fullPath);

      // Inject the current live website domain into JS files
      if (entry === "popup.js" || entry === "background.js") {
        let jsText = content.toString("utf-8");
        jsText = jsText.replace(
          /const API_BASE = ["'].*?["'];/,
          `const API_BASE = "${targetDomain}";`
        );
        content = Buffer.from(jsText, "utf-8");
      }

      zip.file(entryZipPath, content);
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!fs.existsSync(EXT_DIR)) {
      return NextResponse.json(
        { error: "Extension folder not found on server." },
        { status: 404 }
      );
    }

    const host = req.headers.get("host") || "bookar-rereal.vercel.app";
    const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const liveDomain = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`;

    const zip = new JSZip();
    addDirToZip(zip, EXT_DIR, "", liveDomain);

    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="bookar-extension.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("extension-zip route error:", err);
    return NextResponse.json({ error: "Failed to generate extension zip." }, { status: 500 });
  }
}
