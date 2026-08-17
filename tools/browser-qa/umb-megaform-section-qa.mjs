// ============================================================================
//  Walk every MegaForm view in the Umbraco backoffice, photograph each one, and
//  record which request answered HTML instead of JSON.
//
//  The failing views report "Unexpected token '<'", which only says the response
//  was a page; this records the URL, status and content-type behind it, plus which
//  frame it came from — the shared admin UI runs inside an iframe on its own auth.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-megaform-section-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ["dashboard", "/umbraco/section/megaform"],
  ["submissions", "/umbraco/section/megaform/view/open/submissions"],
  ["languages", "/umbraco/section/megaform/view/open/languages"],
  ["settings", "/umbraco/section/megaform/view/open/settings"],
];

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const bad = [];
page.on("response", async (r) => {
  const url = r.url();
  if (!url.startsWith(BASE)) return;
  const ct = (r.headers()["content-type"] || "").toLowerCase();
  const accept = (r.request().headers()["accept"] || "").toLowerCase();
  const wantsJson = accept.includes("json") || /\/api\/|MegaFormApi/i.test(url);
  if (wantsJson && !ct.includes("json")) {
    bad.push(`${r.status()} ${ct.split(";")[0] || "(none)"} ${url.replace(BASE, "")} [frame:${r.frame() === page.mainFrame() ? "main" : "iframe"}]`);
  }
});

await page.goto(`${BASE}/umbraco`, { waitUntil: "domcontentloaded", timeout: 120000 });
const user = page.locator('input[name="username"], input[name="email"]').first();
await user.waitFor({ state: "visible", timeout: 60000 });
await user.fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button[type="submit"]').first().click();
await page.waitForFunction(() => /\/umbraco\/section\//.test(location.pathname), null, { timeout: 120000 });
await page.waitForTimeout(3000);

for (const [name, path] of VIEWS) {
  bad.length = 0;
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/section-${name}.png`, fullPage: false });

  // Read text across shadow roots AND iframes; a plain innerText misses both.
  const text = await page.evaluate(() => {
    const out = [];
    const walk = (root) => {
      out.push(root.textContent || "");
      root.querySelectorAll?.("*")?.forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
    };
    walk(document.body);
    return out.join(" ").replace(/\s+/g, " ");
  });
  let frameText = "";
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    frameText += " " + (await f.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ")).catch(() => ""));
  }
  const all = text + frameText;
  const err = (all.match(/Unexpected token[^|]{0,60}|Unable to load[^.]{0,40}\./g) || []).slice(0, 3);

  console.log(`\n=== ${name} (${path})`);
  console.log(`  frames: ${page.frames().length - 1} iframe(s)`);
  console.log(`  error text: ${err.length ? err.join(" | ") : "(none)"}`);
  console.log(`  html-instead-of-json: ${bad.length ? bad.join("\n      ") : "(none)"}`);
}

await browser.close();
