// ============================================================================
//  Look at the MegaForm form picker inside the Umbraco backoffice and record what
//  the network actually answered for /Form/List — the reported failure was
//  "Unexpected token '<' ... is not valid JSON", i.e. the endpoint answered HTML.
//
//  Login is done patiently: the fields mount inside a web component well after the
//  first paint, and a fill that runs too early is skipped in silence, which then
//  reads as "wrong password".
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-megaform-picker-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const apiCalls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (/MegaFormApi\/Form\/(List|Lookup)/i.test(u)) {
    apiCalls.push(`${r.status()} ${r.headers()["content-type"] || "?"} ${u.replace(BASE, "")}`);
  }
});
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });

await page.goto(`${BASE}/umbraco`, { waitUntil: "domcontentloaded", timeout: 120000 });

const user = page.locator('input[name="username"], input[name="email"]').first();
await user.waitFor({ state: "visible", timeout: 60000 });
await user.fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.screenshot({ path: `${OUT}/picker-00-login-filled.png` });
await page.locator('button[type="submit"]').first().click();

await page.waitForFunction(() => /\/umbraco\/section\//.test(location.pathname), null, { timeout: 120000 });
await page.waitForTimeout(4000);
console.log("logged in:", page.url());

// Content section → the seeded "Contact Us" page carries a MegaForm picker property.
await page.goto(`${BASE}/umbraco/section/content`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(7000);
await page.screenshot({ path: `${OUT}/picker-01-content.png`, fullPage: true });

const target = process.env.NODE_NAME || "Contact Us";
const node = page.getByText(target, { exact: true }).first();
if (await node.count()) {
  await node.click({ timeout: 30000 });
  await page.waitForTimeout(8000);
} else {
  console.log(`!! node "${target}" not found in the tree`);
}

await page.screenshot({ path: `${OUT}/picker-02-node.png`, fullPage: true });

const seen = await page.evaluate(() => {
  const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
  return {
    hasPicker: !!document.querySelector("megaform-form-picker"),
    unableToLoad: /Unable to load forms[^.]*\./.exec(text)?.[0] ?? "(none)",
    searchBox: !!document.querySelector('megaform-form-picker uui-input, uui-input[type="search"]'),
    excerpt: text.slice(0, 260),
  };
});
console.log("picker state:", JSON.stringify(seen, null, 1));
console.log("Form API calls:", apiCalls.length ? apiCalls.join(" | ") : "(none seen)");
console.log("console errors:", consoleErrors.length ? consoleErrors.join(" | ") : "(none)");

await browser.close();
