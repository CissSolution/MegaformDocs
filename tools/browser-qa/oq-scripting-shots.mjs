// ============================================================================
//  Screenshots of the after-submit C# scripting UI on Oqtane, for the docs.
//
//  Counting endpoints proves the feature answers; it does not prove a host can
//  find the screen or read what it says. These shots exist to be opened.
//
//  Env: OQ_BASE, OQ_USER, OQ_PASS, OQ_FORM_ID, OUT_DIR
//  Run: node tools/browser-qa/oq-scripting-shots.mjs
// ============================================================================
import { chromium } from "playwright";

const BASE = process.env.OQ_BASE || "http://localhost:5131";
const USER = process.env.OQ_USER || "host";
const PASS = process.env.OQ_PASS || "abc@ABC1024";
const FORM_ID = Number(process.env.OQ_FORM_ID || 1);
const OUT = process.env.OUT_DIR;

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// "Could not reach the server." is the panel's catch-all for any failed fetch, so it hides the
// difference between a 404, a 403 and a wrong base URL. Watch the wire instead of the message.
page.on("response", async (r) => {
  if (!/FormScript/i.test(r.url())) return;
  let body = "";
  try { body = (await r.text()).slice(0, 220); } catch { }
  console.log(`  [net] ${r.request().method()} ${r.url()} -> ${r.status()} ${body}`);
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);
await page.locator('input[id*="Username" i], input[name*="username" i], #Username').first().fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button:has-text("Login"), input[type="submit"][value*="Login" i]').first().click();
await page.waitForFunction(() => !/\/login/i.test(location.pathname) || /logout/i.test(document.body?.innerText || ""),
                           null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(3000);

// ── the MegaForm admin pane ─────────────────────────────────────────────────
await page.goto(`${BASE}/admin/megaform`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/oq-01-admin-pane.png`, fullPage: false });
console.log("wrote oq-01-admin-pane.png");

// What can be clicked from here? Printing this is how the builder route gets found without
// guessing at URLs that may or may not exist on this build.
const links = await page.evaluate(() =>
  [].slice.call(document.querySelectorAll("a[href], button"))
    .map((e) => ({ tag: e.tagName, text: (e.textContent || "").trim().slice(0, 46), href: e.getAttribute("href") || "" }))
    .filter((e) => e.text)
    .slice(0, 45));
console.log(JSON.stringify(links, null, 1).slice(0, 2600));

// ── the builder ─────────────────────────────────────────────────────────────
// Route read off the pane's own Edit links rather than guessed.
await page.goto(`${BASE}/admin/megaform?mfpanel=builder&formId=${FORM_ID}`,
                { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForFunction(() => !!document.getElementById("mf-builder-root"), null, { timeout: 90000 })
          .catch(() => console.log("mf-builder-root never appeared"));
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/oq-02-builder.png` });
console.log("wrote oq-02-builder.png");

// The panel lives under Form Settings, id mf-script-panel (dom.ts:1554).
const openedSettings = await page.evaluate(() => {
  const btn = [].slice.call(document.querySelectorAll("button, a, [role=tab], .mf-tab"))
    .find((e) => /form settings|settings/i.test((e.textContent || "").trim()));
  if (btn) { btn.click(); return (btn.textContent || "").trim().slice(0, 40); }
  return null;
});
console.log("clicked settings entry:", openedSettings);
await page.waitForTimeout(3500);

const panel = page.locator("#mf-script-panel");
if (await panel.count()) {
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  const facts = await page.evaluate(() => {
    const p = document.getElementById("mf-script-panel");
    const src = document.getElementById("mf-script-source");
    const status = document.getElementById("mf-script-status");
    return {
      visible: !!(p && p.offsetParent !== null),
      heading: p ? (p.querySelector("h6")?.textContent || "").trim() : null,
      sourceChars: src ? (src.value || "").length : null,
      status: status ? (status.textContent || "").trim().slice(0, 160) : null,
      enabled: document.getElementById("mf-script-enabled")?.checked ?? null,
    };
  });
  console.log("script panel:", JSON.stringify(facts));
  await panel.screenshot({ path: `${OUT}/oq-03-script-panel.png` }).catch((e) => console.log("panel shot:", e.message));
  console.log("wrote oq-03-script-panel.png");
} else {
  console.log("#mf-script-panel not in the DOM");
}

await browser.close();
