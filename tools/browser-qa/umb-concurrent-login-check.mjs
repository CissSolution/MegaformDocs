// ============================================================================
//  Two back-office sessions for the same user at once — does the first survive?
//
//  With Security:AllowConcurrentLogins = false, a second sign-in kills the first
//  one's token. The back office does not say so: the tree endpoint answers 401 and
//  the content tree simply renders EMPTY, which reads as "someone deleted all the
//  content". This checks the first session again after the second signs in.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-concurrent-login-check.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin, deepClick } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });

async function treeNodes(page) {
  const names = ["Contact Us", "Home", "News"];
  const seen = [];
  for (const n of names) {
    const visible = await page.getByText(n, { exact: true }).first().isVisible().catch(() => false);
    if (visible) seen.push(n);
  }
  return seen;
}

// Session A — the one a human would have open.
const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
const pageA = await ctxA.newPage();
await umbLogin(pageA, { base: BASE, user: USER, pass: PASS });
await deepClick(pageA, "Content");
await pageA.waitForTimeout(5000);
console.log("A after login          :", (await treeNodes(pageA)).join(", ") || "(empty tree)");
await pageA.screenshot({ path: `${OUT}/concurrent-A1.png` });

// Session B — a QA script signing in as the same user.
const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
const pageB = await ctxB.newPage();
await umbLogin(pageB, { base: BASE, user: USER, pass: PASS });
await deepClick(pageB, "Content");
await pageB.waitForTimeout(5000);
console.log("B after login          :", (await treeNodes(pageB)).join(", ") || "(empty tree)");

// Back to A: bounce through another section so the tree is fetched again with A's token.
await deepClick(pageA, "Media");
await pageA.waitForTimeout(3000);
await deepClick(pageA, "Content");
await pageA.waitForTimeout(6000);
const after = await treeNodes(pageA);
console.log("A after B signed in    :", after.join(", ") || "(empty tree)");
await pageA.screenshot({ path: `${OUT}/concurrent-A2.png` });

console.log(after.length >= 3 ? "PASS — both sessions usable" : "FAIL — the first session was evicted");

await browser.close();
