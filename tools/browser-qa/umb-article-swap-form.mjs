// ============================================================================
//  Swap the MegaForm on a news article the way an editor does it, and prove the
//  public page changed.
//
//  Form tab -> MegaForm picker -> Save and publish -> re-fetch the public URL and
//  read data-form-id off the rendered root. Anything less measures the back office
//  talking to itself.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, GUID, PUBLIC_URL, SWAP_TO, REVERT_TO
//  Run: node tools/browser-qa/umb-article-swap-form.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
const GUID = process.env.GUID || "8283d176-045c-4ecf-804f-65aa75e721b5"; // file uploads article
const PUBLIC_URL = process.env.PUBLIC_URL || "/what-we-changed-about-file-uploads/";
const SWAP_TO = process.env.SWAP_TO || "104";
const REVERT_TO = process.env.REVERT_TO || "";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function publicFormId() {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${PUBLIC_URL}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const id = await p.evaluate(() => document.querySelector(".megaform-root")?.getAttribute("data-form-id") ?? "(none)");
  await p.close();
  return id;
}

async function setForm(value, tag) {
  await page.goto(`${BASE}/umbraco/section/content/workspace/document/edit/${GUID}/invariant`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(9000);
  await page.getByText("Form", { exact: true }).first().click({ timeout: 20000 });
  await page.waitForTimeout(4000);

  const select = page.locator("select").first();
  const options = await select.locator("option").evaluateAll((els) => els.map((o) => `${o.value}|${o.textContent.trim()}`));
  console.log(`  picker options (${options.length}): ${options.slice(0, 6).join(" · ")}${options.length > 6 ? " …" : ""}`);

  await select.selectOption(value);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/swap-${tag}-picked.png` });

  await page.getByText("Save and publish", { exact: true }).first().click({ timeout: 20000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/swap-${tag}-published.png` });
}

await umbLogin(page, { base: BASE, user: USER, pass: PASS });

console.log("before      :", await publicFormId());

console.log(`switching to form ${SWAP_TO}`);
await setForm(SWAP_TO, "to" + SWAP_TO);
console.log("after swap  :", await publicFormId());

if (REVERT_TO) {
  console.log(`reverting to form ${REVERT_TO}`);
  await setForm(REVERT_TO, "back" + REVERT_TO);
  console.log("after revert:", await publicFormId());
}

await browser.close();
