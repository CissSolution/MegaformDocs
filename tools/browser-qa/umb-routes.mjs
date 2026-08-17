// ============================================================================
//  Does clicking a MegaForm sidebar link actually change the view on Umbraco?
//
//  Two traps this script exists to avoid:
//
//  1. HTTP status proves nothing. The backoffice is a single-page app, so every
//     /umbraco/... path returns the same 200 shell whether a view exists or not.
//  2. page.goto() proves LESS than nothing. Umbraco 14+ authenticates with OIDC
//     and holds the token in memory, so a full navigation re-bootstraps and
//     bounces to /umbraco/login. Measured: every direct goto to a section view
//     landed on the OAuth authorize URL, which looks exactly like "this route is
//     broken" and is really "you left the app".
//
//  So: log in once, enter the section by clicking, then drive the router the way
//  the sidebar itself does, and read back which element mounted.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-routes.mjs
// ============================================================================
import { chromium } from "playwright";
import { umbLogin, deepClick as dc } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "https://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

console.log("logged in at:", await umbLogin(page, { base: BASE, user: USER, pass: PASS }));
await dc(page, "MegaForm");
await page.waitForTimeout(8000);
console.log("in section:", page.url(), "\n");

// Read what mounted, the way a person would: which megaform-* element is on screen.
const probe = () => page.evaluate(() => {
  const acc = new Set();
  const deep = (root) => {
    root.querySelectorAll("*").forEach((e) => {
      const t = e.tagName.toLowerCase();
      if (t.startsWith("megaform-")) acc.add(t);
      if (e.shadowRoot) deep(e.shadowRoot);
    });
  };
  deep(document);
  const main = document.querySelector("umb-section-main, #main, main");
  // The iframe src is the whole point: the mounted element can be right while the page it frames
  // is the wrong form. Search shadow roots — the views render their iframe inside one.
  const frames = new Set();
  const deepFrames = (root) => {
    root.querySelectorAll("iframe").forEach((f) => frames.add(f.getAttribute("src") || ""));
    root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) deepFrames(e.shadowRoot); });
  };
  deepFrames(document);
  return {
    url: location.pathname + location.search,
    elements: [...acc].filter((t) => !t.includes("sidebar")).join(","),
    frame: [...frames].join(" | "),
    text: ((main || document.body)?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90),
  };
});

console.log(`${"clicked".padEnd(15)} ${"url after".padEnd(44)} ${"mounted".padEnd(26)} iframe src`);
console.log("-".repeat(112));

// Drive the router exactly as megaform-sidebar-menu.js:212-219 does, so this measures the
// application's own navigation contract rather than Playwright's.
// [OneSectionView 2026-08-15] Everything now goes through the single "open" view; the left tree
// is the only navigation. The last row is the OLD path, kept deliberately: it must NOT resolve,
// and seeing it fall back is how we know the old four-tab routing is really gone.
const routes = [
  ["Dashboard",    "/umbraco/section/megaform/dashboard/megaform-dashboard"],
  ["Submissions",  "/umbraco/section/megaform/view/open/submissions"],
  ["Languages",    "/umbraco/section/megaform/view/open/languages"],
  ["Builder new",  "/umbraco/section/megaform/view/open/builder/new"],
  ["Builder #1",   "/umbraco/section/megaform/view/open/builder/1"],
  ["Subs of #1",   "/umbraco/section/megaform/view/open/submissions?formId=1"],
  ["OLD /view/builder", "/umbraco/section/megaform/view/builder/1"],
];

for (const [label, href] of routes) {
  await page.evaluate((h) => {
    window.history.pushState({}, "", h);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, href);
  await page.waitForTimeout(4500);
  const p = await probe();
  console.log(`${label.padEnd(15)} ${p.url.slice(0, 44).padEnd(44)} ${(p.elements || "(none)").padEnd(26)} ${p.frame}`);
  if (!p.elements) console.log(`${" ".repeat(15)} ↳ text: ${p.text}`);
  await page.screenshot({ path: `${OUT}/umb-rt-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png` });
}

await browser.close();
