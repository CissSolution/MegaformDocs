// ============================================================================
//  Does the backoffice actually SHOW what the public form stored?
//
//  Typed storage writes field values into MF_SubmissionValue* and leaves
//  MF_Submissions.DataJson as "{}". A grid that reads dataJson therefore renders
//  a row of dashes for a submission that is perfectly intact in the database —
//  which looks like data loss and is not. This opens the submissions screen for
//  a form and reports the visible cell text, so the two can be told apart.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, FORM_ID, OUT_DIR
//  Run: node tools/browser-qa/umb-submissions-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const FORM_ID = process.env.FORM_ID || "4";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [browser]", m.text().slice(0, 160)); });

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
console.log("logged in:", page.url());

// The submissions screen is a server-rendered MVC route behind the backoffice cookie,
// not part of the token-authenticated SPA, so a direct navigation is safe here.
const target = `${BASE}/umbraco/MegaForm/Submissions?formId=${FORM_ID}`;
const res = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 120000 });
console.log("submissions route:", res ? res.status() : "ERR", target);

await page.waitForTimeout(9000);

const probe = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll("table tr, [role='row'], .mf-subrow")).slice(0, 8);
  return {
    title: document.title,
    rowCount: rows.length,
    rows: rows.map((r) => (r.innerText || "").replace(/\s+/g, " ").trim().slice(0, 140)),
    bodyStart: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 300),
  };
});

console.log(`title: ${probe.title}`);
console.log(`rows : ${probe.rowCount}`);
probe.rows.forEach((r, i) => console.log(`  [${i}] ${r}`));
if (!probe.rowCount) console.log(`body : ${probe.bodyStart}`);

await page.screenshot({ path: `${OUT}/umb-submissions-form${FORM_ID}.png`, fullPage: true });
console.log(`shot : ${OUT}/umb-submissions-form${FORM_ID}.png`);

await browser.close();
