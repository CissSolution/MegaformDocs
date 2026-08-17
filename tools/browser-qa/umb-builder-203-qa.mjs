// ============================================================================
//  The exact URL the owner reported, checked twice: once in a clean browser, and
//  once in a browser that has ALREADY CACHED the previous build of the backoffice
//  extension files — which is the state that produced
//
//    SyntaxError: The requested module './contexts/megaform-permissions-context.js'
//    does not provide an export named 'getMegaFormBearerToken'
//
//  Umbraco serves those files with ?umb__rnd=<package version>; while that version
//  stays the same a browser keeps whatever copy it has, so a NEW import of a NEW
//  export fails against an OLD cached module even though the server is serving the
//  new one. The second pass reproduces that by loading the section once, keeping the
//  same browser profile, and loading it again after the change.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID
//  Run: node tools/browser-qa/umb-builder-203-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-builder-203";
const FORM = process.env.FORM_ID || "203";
fs.mkdirSync(OUT, { recursive: true });

const report = {};

// A persistent profile keeps the HTTP cache between the two passes, which a fresh
// context does not — and the cache is the whole point of this check.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mf-umb-profile-"));

async function pass(label, ctx) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

  // AllowConcurrentLogins is false on this host, so a login can lose a race with an
  // earlier QA session; and on the second pass the profile is already signed in.
  if (!/\/umbraco\/section\//.test(page.url())) {
    try {
      await umbLogin(page, { base: BASE, user: USER, pass: PASS });
    } catch (e) {
      await page.waitForTimeout(4000);
      await umbLogin(page, { base: BASE, user: USER, pass: PASS });
    }
  }
  await page.evaluate((f) => {
    history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${f}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, FORM);
  await page.waitForTimeout(2500);

  let builderReady = false;
  let canvasFields = 0;
  try {
    const frameEl = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 45000 });
    const frame = await frameEl.contentFrame();
    await frame.waitForFunction(() => !!document.getElementById("mf-builder-app"), null, { timeout: 60000 });
    await page.waitForTimeout(5000);
    builderReady = true;
    canvasFields = await frame.evaluate(() => document.querySelectorAll("#mf-canvas-fields .mf-canvas-item").length);
  } catch (e) {
    errors.push("builder did not mount: " + String(e).slice(0, 120));
  }

  // Did the header band render? That is this element's own work, and it only runs if the
  // module parsed at all — the SyntaxError killed the whole view.
  const header = await page.evaluate(() => {
    const walk = (root) => {
      for (const el of root.querySelectorAll(".mf-ws-head")) return (el.textContent || "").replace(/\s+/g, " ").trim();
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
      return "";
    };
    return walk(document);
  });

  await page.screenshot({ path: `${OUT}/${label}.png` });
  report[label] = {
    url: page.url().replace(BASE, ""),
    builderReady,
    canvasFields,
    header,
    moduleErrors: errors.filter((e) => /does not provide an export|SyntaxError|Failed to fetch dynamically/i.test(e)),
    otherErrors: errors.filter((e) => !/does not provide an export|SyntaxError|Failed to fetch dynamically/i.test(e)).slice(0, 6),
  };
  await page.close();
}

const ctx = await chromium.launchPersistentContext(profile, {
  headless: process.env.HEADED !== "1",
  viewport: { width: 1500, height: 950 },
});
await pass("01-first-load", ctx);
// Second pass in the SAME profile: everything is cached now.
await pass("02-cached-reload", ctx);
await ctx.close();

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
fs.rmSync(profile, { recursive: true, force: true });
