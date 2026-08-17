// List every actionable element in the Forms section, shadow roots included, so the
// create-a-form entry point can be found by name instead of guessed at.
import { chromium } from "playwright";
import { umbLogin, deepClick } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5139";
const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await umbLogin(page, { base: BASE, user: "admin@local", pass: "Admin123456!" });
await deepClick(page, "Forms");
await page.waitForTimeout(7000);

const dump = async (tag) => {
  const out = await page.evaluate(() => {
    const acc = [];
    const walk = (root, depth) => {
      root.querySelectorAll("*").forEach((e) => {
        const t = e.tagName.toLowerCase();
        if (/^(button|a|uui-button|uui-menu-item|uui-symbol-more|umb-entity-actions-bundle|uui-action-bar)$/.test(t)) {
          const label = (e.getAttribute("label") || e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 45);
          const r = e.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) acc.push(`${t} "${label}" @${Math.round(r.x)},${Math.round(r.y)}`);
        }
        if (e.shadowRoot && depth < 14) walk(e.shadowRoot, depth + 1);
      });
    };
    walk(document, 0);
    return [...new Set(acc)];
  });
  console.log(`--- ${tag} (${out.length}) ---`);
  out.forEach((l) => console.log("   ", l));
};

await dump("forms section, no hover");

// Hover the tree root: Umbraco 14+ only paints entity actions on hover/focus.
const treeRoot = page.locator("umb-menu-item-layout, uui-menu-item").first();
await treeRoot.hover().catch(() => {});
await page.waitForTimeout(2000);
await dump("after hovering the first menu item");

await browser.close();
