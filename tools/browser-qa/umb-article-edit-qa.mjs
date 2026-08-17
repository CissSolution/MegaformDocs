// ============================================================================
//  Edit a news article the way an editor would: open the node, look at the Form
//  tab, and check the MegaForm picker is a working control rather than the
//  "configured property editor UI could not be found" message.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, GUID (content node key)
//  Run: node tools/browser-qa/umb-article-edit-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
// Default: "What we changed about file uploads"
const GUID = process.env.GUID || "8283d176-045c-4ecf-804f-65aa75e721b5";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
console.log("after login:", page.url());

// Does a pasted workspace URL survive? The token lives in memory, so a full navigation has to
// re-run the OIDC round trip; if it cannot, this lands back on the login screen.
const target = `${BASE}/umbraco/section/content/workspace/document/edit/${GUID}/invariant`;
await page.goto(target, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(10000);
console.log("after direct goto:", page.url());
console.log("survived direct link:", !/login/i.test(page.url()) && page.url().includes(GUID));

await page.screenshot({ path: `${OUT}/edit-01-content-tab.png` });

const formTab = page.getByText("Form", { exact: true }).first();
await formTab.click({ timeout: 20000 }).catch((e) => console.log("form tab click:", e.message.slice(0, 80)));
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/edit-02-form-tab.png` });

const dump = await page.evaluate(() => {
  const found = [];
  const walk = (root, depth) => {
    root.querySelectorAll("*").forEach((e) => {
      const t = e.tagName.toLowerCase();
      if (/megaform|picker/.test(t)) found.push({ tag: t, text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90) });
      if (t === "select") found.push({ tag: t, value: e.value, options: Array.from(e.options).map((o) => `${o.value}:${o.text}`).slice(0, 30) });
      if (t === "input") found.push({ tag: t, type: e.getAttribute("type") || "", value: e.value ?? "", placeholder: e.getAttribute("placeholder") || "" });
      if (e.shadowRoot && depth < 12) walk(e.shadowRoot, depth + 1);
    });
  };
  walk(document, 0);
  return { found, bodyText: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 400) };
});
console.log(JSON.stringify(dump, null, 1).slice(0, 3500));

await browser.close();
