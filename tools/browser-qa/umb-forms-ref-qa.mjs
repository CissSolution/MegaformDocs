// ============================================================================
//  Reference site: stock Umbraco + Umbraco Forms (no MegaForm), for comparing how
//  the two products actually work.
//
//  Opens the Forms section, photographs it, and walks into the form designer so the
//  screens can be put side by side with MegaForm's.
//
//  Env: UMB_BASE (default http://localhost:5139), UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-forms-ref-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin, deepClick } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5139";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [browser]", m.text().slice(0, 140)); });

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
console.log("logged in:", page.url());

const sections = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 200));
console.log("top nav / body:", sections);

await deepClick(page, "Forms");
await page.waitForTimeout(7000);
console.log("after Forms click:", page.url());
await page.screenshot({ path: `${OUT}/forms-01-section.png`, fullPage: false });

// The section tree lists Forms / Data sources / Prevalue sources in stock Umbraco Forms.
const treeText = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 400));
console.log("section text:", treeText);

// Walk into the create-a-form flow.
for (const label of ["Forms", "Create", "New form", "Create form"]) {
  const el = page.getByText(label, { exact: true }).first();
  if (await el.isVisible().catch(() => false)) {
    await el.click().catch(() => {});
    await page.waitForTimeout(4000);
  }
}
await page.screenshot({ path: `${OUT}/forms-02-create.png`, fullPage: false });
console.log("after create attempt:", page.url());
console.log("visible:", await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 400)));

await browser.close();
