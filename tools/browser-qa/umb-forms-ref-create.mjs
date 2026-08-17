// ============================================================================
//  Create a form in stock Umbraco Forms, so its designer can be put next to
//  MegaForm's builder.
//
//  The create action is not a button on the page: it lives in the entity-action
//  bundle ("...") that Umbraco 14+ paints next to a tree item on hover.
//
//  Env: UMB_BASE (default http://localhost:5139), UMB_USER, UMB_PASS, OUT_DIR, FORM_NAME
//  Run: node tools/browser-qa/umb-forms-ref-create.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin, deepClick } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5139";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
const FORM_NAME = process.env.FORM_NAME || "Contact us (Umbraco Forms)";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("  shot:", n, "|", page.url()); };

const labels = async () =>
  await page.evaluate(() => {
    const acc = [];
    const walk = (root, depth) => {
      root.querySelectorAll("*").forEach((e) => {
        const t = e.tagName.toLowerCase();
        if (/^(button|a|uui-button|uui-menu-item|umb-entity-action)$/.test(t)) {
          const l = (e.getAttribute("label") || e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
          const r = e.getBoundingClientRect();
          if (l && r.width > 0) acc.push(l);
        }
        if (e.shadowRoot && depth < 14) walk(e.shadowRoot, depth + 1);
      });
    };
    walk(document, 0);
    return [...new Set(acc)];
  });

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
await deepClick(page, "Forms");
await page.waitForTimeout(6000);

// Locators resolve to the hidden light-DOM copies of these web components, so drive the
// pointer by coordinate instead: the tree item sits at y≈130 and its action bundle at x≈300.
// (Measured with tools/browser-qa/umb-forms-ref-probe.mjs — rerun that if the layout moves.)
await page.mouse.move(150, 132);
await page.waitForTimeout(1200);
await page.mouse.click(305, 132);
await page.waitForTimeout(2500);
await shot("create-01-actions-open");
console.log("  actions:", (await labels()).slice(-14).join(" | "));

for (const rx of [/^create/i, /new form/i]) {
  const item = page.getByText(rx).first();
  if (await item.isVisible().catch(() => false)) { await item.click().catch(() => {}); break; }
}
await page.waitForTimeout(4000);
await shot("create-02-after-create");
console.log("  visible:", (await labels()).slice(-16).join(" | "));

// Some versions ask to pick a starting point (blank / template) before the designer opens.
for (const rx of [/blank/i, /empty/i, /scratch/i]) {
  const opt = page.getByText(rx).first();
  if (await opt.isVisible().catch(() => false)) { await opt.click().catch(() => {}); await page.waitForTimeout(3500); break; }
}
await shot("create-03-designer");

const nameBox = page.locator('input:visible').first();
if (await nameBox.isVisible().catch(() => false)) await nameBox.fill(FORM_NAME).catch(() => {});
await page.waitForTimeout(1200);
await shot("create-04-named");

for (const rx of [/^save$/i, /^create$/i]) {
  const btn = page.getByRole("button", { name: rx }).first();
  if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(6000); break; }
}
await shot("create-05-saved");
console.log("  final:", (await labels()).slice(-16).join(" | "));

await browser.close();
