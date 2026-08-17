// ============================================================================
//  Place a MegaForm form on an Umbraco page, the way an editor would, and
//  photograph every step. The screenshots are the source material for the
//  "how do I put a form on a page" guide; the QA is a side effect of doing it
//  for real instead of describing it from the source.
//
//  Each step shoots unconditionally, so a step that fails still leaves a
//  picture of what the screen looked like when it did.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-place-form.mjs
// ============================================================================
import { chromium } from "playwright";
import { umbLogin, deepClick } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "https://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

let step = 0;
const shot = async (name) => {
  step += 1;
  const file = `${OUT}/umb-place-${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file }).catch(() => {});
  console.log(`  shot ${file.split("/").pop()}`);
};

// Everything visible, through shadow roots — the backoffice nests components several deep.
const visible = () => page.evaluate(() => {
  const out = [];
  const walk = (root) => {
    root.querySelectorAll("a[href], button, uui-menu-item, umb-menu-item, [role=button], uui-button").forEach((e) => {
      const t = (e.textContent || "").trim().replace(/\s+/g, " ");
      if (t && t.length < 46) out.push(t);
    });
    root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
  };
  walk(document);
  return [...new Set(out)];
});

console.log("login:", await umbLogin(page, { base: BASE, user: USER, pass: PASS }));
await shot("backoffice");

// ── 1. Content section ──────────────────────────────────────────────────────
await deepClick(page, "Content");
await page.waitForTimeout(4000);
await shot("content-section");
console.log("controls:", (await visible()).slice(0, 22).join(" | "));

// ── 2. Create at root ───────────────────────────────────────────────────────
// The root's "..." actions menu is where Create lives in Umbraco 14+.
const opened = await page.evaluate(() => {
  const walk = (root) => {
    for (const e of root.querySelectorAll("button, uui-button, [label]")) {
      const l = (e.getAttribute("label") || e.getAttribute("title") || e.textContent || "").trim();
      if (/^(open actions menu|actions|\.\.\.)$/i.test(l)) { e.click(); return l; }
    }
    for (const e of root.querySelectorAll("*")) { if (e.shadowRoot) { const r = walk(e.shadowRoot); if (r) return r; } }
    return null;
  };
  return walk(document);
});
console.log("actions menu:", opened);
await page.waitForTimeout(2500);
await shot("actions-menu");

const created = await deepClick(page, "Create");
console.log("clicked Create:", created);
await page.waitForTimeout(3500);
await shot("choose-doctype");
console.log("doctypes offered:", (await visible()).slice(0, 20).join(" | "));

// ── 3. Pick the MegaForm page document type ─────────────────────────────────
const picked = await page.evaluate(() => {
  const walk = (root) => {
    for (const e of root.querySelectorAll("button, uui-button, uui-menu-item, a, [role=button], li")) {
      const t = (e.textContent || "").trim();
      if (/megaform/i.test(t) && t.length < 40) { e.click(); return t; }
    }
    for (const e of root.querySelectorAll("*")) { if (e.shadowRoot) { const r = walk(e.shadowRoot); if (r) return r; } }
    return null;
  };
  return walk(document);
});
console.log("picked doc type:", picked);
await page.waitForTimeout(5000);
await shot("editor-opened");

// ── 4. What did the Form Picker property render as? ─────────────────────────
const propState = await page.evaluate(() => {
  const acc = { megaformElements: [], propertyLabels: [], bodyHas: "" };
  const walk = (root) => {
    root.querySelectorAll("*").forEach((e) => {
      const t = e.tagName.toLowerCase();
      if (t.startsWith("megaform-")) acc.megaformElements.push(t);
      if (t === "umb-property" || t === "umb-property-layout") {
        const l = (e.getAttribute("label") || "").trim();
        if (l) acc.propertyLabels.push(l);
      }
      if (e.shadowRoot) walk(e.shadowRoot);
    });
  };
  walk(document);
  const txt = (document.body?.innerText || "").replace(/\s+/g, " ");
  acc.bodyHas = /property editor|not found|could not be found|missing/i.test(txt)
    ? txt.slice(0, 300) : "(no missing-editor wording)";
  return acc;
});
console.log("\n=== Form Picker property ===");
console.log(JSON.stringify(propState, null, 1).slice(0, 900));

await browser.close();
