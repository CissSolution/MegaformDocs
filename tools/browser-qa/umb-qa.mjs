// ============================================================================
//  Umbraco backoffice QA for the MegaForm dashboard.
//
//  Playwright with its own Chromium, ignoreHTTPSErrors for the dev certificate.
//
//  Steps:
//    shots   log in, open the MegaForm dashboard, photograph it, and report the
//            left-rail structure so a duplicate is a count rather than an opinion
//    links   collect every link the dashboard offers and resolve each one, so a
//            route that does not exist on Umbraco shows up as a status code
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-qa.mjs [shots|links|all]
// ============================================================================
import { chromium } from "playwright";

const BASE = process.env.UMB_BASE || "https://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
const STEP = process.argv[2] || "all";

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [browser]", m.text().slice(0, 150)); });

await page.goto(`${BASE}/umbraco`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(6000);

// Umbraco 13+ backoffice is a web-component login; 10-12 is AngularJS. Try both shapes.
const email = page.locator('input[name="email"], input[type="email"], #umb-username, input[id*="username" i]').first();
await email.waitFor({ timeout: 60000 }).catch(() => {});
if (await email.count()) {
  await email.fill(USER);
  await page.locator('input[type="password"], #umb-passwordTwo, input[name="password"]').first().fill(PASS);
  await page.locator('button[type="submit"], uui-button[label="Login"] button, .umb-login-button').first().click();
  await page.waitForTimeout(9000);
}
console.log("url after login:", page.url());
await page.screenshot({ path: `${OUT}/umb-00-after-login.png` });

// ── find the MegaForm section ───────────────────────────────────────────────
const sections = await page.evaluate(() => {
  const seen = [];
  const walk = (root) => {
    root.querySelectorAll("a[href], button, [role=tab], uui-menu-item, umb-menu-item").forEach((e) => {
      const t = (e.textContent || "").trim();
      if (t && t.length < 60) seen.push({ text: t, href: e.getAttribute("href") || "" });
    });
    root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
  };
  walk(document);
  return seen.slice(0, 120);
});
const mega = sections.filter((s) => /megaform/i.test(s.text) || /megaform/i.test(s.href));
console.log("\n=== MegaForm entries visible ===");
console.log(JSON.stringify(mega, null, 1).slice(0, 1200));

// Click the section rather than navigating to it. The backoffice is a single-page app: a direct
// GET of /umbraco/section/megaform re-bootstraps and lands back on Content, which reads as
// "the section does not exist" when it is only "the router was not asked".
const clicked = await page.evaluate(() => {
  const find = (root) => {
    for (const a of root.querySelectorAll("a[href], button")) {
      if (/^megaform$/i.test((a.textContent || "").trim())) return a;
    }
    for (const e of root.querySelectorAll("*")) {
      if (e.shadowRoot) { const hit = find(e.shadowRoot); if (hit) return hit; }
    }
    return null;
  };
  const el = find(document);
  if (el) { el.click(); return el.getAttribute("href") || "(button)"; }
  return null;
});
console.log("clicked MegaForm nav:", clicked);
await page.waitForTimeout(9000);
console.log("url now:", page.url());
await page.screenshot({ path: `${OUT}/umb-01-dashboard.png` });
console.log("wrote umb-01-dashboard.png");

// ── the left rail, counted ──────────────────────────────────────────────────
const rail = await page.evaluate(() => {
  const collect = (root, out) => {
    root.querySelectorAll("a[href], button, uui-menu-item, umb-menu-item, .umb-tree-item, li").forEach((e) => {
      const t = (e.textContent || "").trim().replace(/\s+/g, " ");
      if (t && t.length < 50) out.push(t);
    });
    root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) collect(e.shadowRoot, out); });
  };
  const out = [];
  collect(document, out);
  const counts = {};
  out.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  return {
    duplicated: Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 25),
    total: out.length,
  };
});
console.log("\n=== labels appearing more than once (candidate duplicates) ===");
console.log(JSON.stringify(rail.duplicated, null, 1).slice(0, 1600));

// ── every link the dashboard offers, resolved ───────────────────────────────
if (STEP === "links" || STEP === "all") {
  const hrefs = await page.evaluate(() => {
    const out = new Set();
    const walk = (root) => {
      root.querySelectorAll("a[href]").forEach((a) => {
        const h = a.getAttribute("href") || "";
        if (h && !/^(#|javascript:|mailto:)/i.test(h)) out.add(h);
      });
      root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
    };
    walk(document);
    return [...out];
  });
  console.log(`\n=== resolving ${hrefs.length} link(s) ===`);
  for (const h of hrefs.slice(0, 40)) {
    const abs = h.startsWith("http") ? h : new URL(h, BASE).toString();
    const r = await page.evaluate(async (u) => {
      try { const x = await fetch(u, { method: "GET", credentials: "include" }); return x.status; }
      catch (e) { return "threw " + e.message.slice(0, 40); }
    }, abs);
    console.log(`  ${String(r).padStart(6)}  ${h.slice(0, 110)}`);
  }
}

await browser.close();
