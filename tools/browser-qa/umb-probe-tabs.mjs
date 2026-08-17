// Where does Umbraco render the section-view tab strip, and can it be reached from outside?
//
// Decides how to remove the duplicate row: a strip in light DOM can be hidden with one CSS rule
// from the package; a strip inside a shadow root cannot, and the fix has to be structural
// (collapse four section views into one that routes internally).
//
// Env: UMB_BASE, UMB_USER, UMB_PASS
import { chromium } from "playwright";
import { umbLogin, deepClick } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "https://localhost:5138";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await deepClick(page, "MegaForm");
await page.waitForTimeout(9000);

const info = await page.evaluate(() => {
  // Find the element whose text is exactly the four view labels, and record the shadow-root
  // chain that leads to it.
  const LABELS = ["Dashboard", "Builder", "Submissions", "Languages"];
  const hits = [];
  const walk = (root, path, depth) => {
    root.querySelectorAll("*").forEach((e) => {
      const tag = e.tagName.toLowerCase();
      const txt = (e.textContent || "").replace(/\s+/g, " ").trim();
      if (LABELS.every((l) => txt.includes(l)) && txt.length < 90) {
        hits.push({ tag, depth, path: path.concat(tag).join(" > "), text: txt });
      }
      if (e.shadowRoot) walk(e.shadowRoot, path.concat(tag + "#shadow"), depth + 1);
    });
  };
  walk(document, [], 0);
  // Deepest match is the closest wrapper around the strip.
  hits.sort((a, b) => b.path.length - a.path.length);
  return {
    matches: hits.slice(0, 4),
    // Would a plain document-level stylesheet reach it? Only if depth is 0.
    reachableByGlobalCss: hits.some((h) => h.depth === 0),
  };
});

console.log(JSON.stringify(info, null, 1).slice(0, 1800));
await browser.close();
