// ============================================================================
//  Reproduce the failure the owner photographed, then prove the bridge fixes it.
//
//  «Unable to load submissions — Unexpected token '<', "<!DOCTYPE"… is not valid JSON»
//  is what a MegaForm screen shows when its API call is answered with the login PAGE.
//  The screens run in an iframe served anonymously and, until the token bridge, sent
//  nothing but the backoffice COOKIE — which lapses about half an hour into a session.
//
//  Clearing the cookies after login reproduces exactly that state: the backoffice SPA
//  keeps its bearer token in memory and carries on, while the frame has lost its only
//  credential. With the bridge the frame asks the parent for that token and the screen
//  loads.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID
//  Run: node tools/browser-qa/umb-token-bridge-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-token-bridge";
const FORM = process.env.FORM_ID || "202";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const report = { htmlAnswers: [], authHeaderSeen: 0, apiCalls: 0 };

page.on("request", (r) => {
  const u = r.url();
  if (!/\/(api\/MegaForm|umbraco\/MegaForm\/MegaFormApi)\//i.test(u)) return;
  report.apiCalls++;
  const hasAuth = !!r.headers()["authorization"];
  if (hasAuth) report.authHeaderSeen++;
  const authHead = (r.headers()["authorization"] || "").slice(0, 20);
  (report.requests ||= []).push(`${hasAuth ? authHead : "----"} ${r.frame() === page.mainFrame() ? "parent" : "frame "} ${u.replace(BASE, "").slice(0, 70)}`);
});
report.allApi = [];
report.console = [];
page.on("response", async (r) => {
  const u = r.url();
  if (!/\/(api\/MegaForm|umbraco\/MegaForm\/MegaFormApi)\//i.test(u)) return;
  const ct = (r.headers()["content-type"] || "").toLowerCase();
  report.allApi.push(`${r.status()} ${ct.split(";")[0] || "(none)"} ${u.replace(BASE, "").slice(0, 90)}`);
  if (ct.includes("html") || r.status() === 401) {
    report.htmlAnswers.push(`${r.status()} ${ct.split(";")[0]} ${u.replace(BASE, "")}`);
  }
});
page.on("console", (m) => { if (m.type() === "error") report.console.push(m.text().slice(0, 180)); });

await umbLogin(page, { base: BASE, user: USER, pass: PASS });

// Reproduce the real failure: the cookie the MegaForm MVC pages authenticate on lapses,
// while Umbraco's own session carries on. Clearing EVERY cookie is a harsher state than
// production ever reaches — it also breaks Bellissima's token refresh, so the parent has
// no token to lend and the test proves nothing about the bridge.
const before = await ctx.cookies();
report.cookiesBefore = before.map((c) => c.name);
const keep = before.filter((c) => !/UMB_UCONTEXT|MegaForm/i.test(c.name));
await ctx.clearCookies();
await ctx.addCookies(keep);
report.cookiesAfterClear = (await ctx.cookies()).map((c) => c.name);

await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/submissions/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(2000);

const frameEl = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Submissions"]', { timeout: 60000 });
const frame = await frameEl.contentFrame();
await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/01-entries-cookieless.png` });

report.screen = await frame.evaluate(() => {
  const text = (document.body.innerText || "").replace(/\s+/g, " ").trim();
  return {
    hasJsonParseError: /Unexpected token '<'/i.test(text),
    hasUnableToLoad: /Unable to load/i.test(text),
    tokenInFrame: !!window.__MF_TOKEN,
    firstLine: text.slice(0, 140),
    rows: document.querySelectorAll("table tbody tr").length,
  };
});

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
