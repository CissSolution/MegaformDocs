// Quick probe: open builder form 101, click Preview, report Theme Designer / left pane DOM.
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-theme-probe";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));

await umbLogin(page, { base: BASE, user: USER, pass: PASS });

await page.evaluate(() => {
  history.pushState({}, "", "/umbraco/section/megaform/view/open/builder/101");
  window.dispatchEvent(new PopStateEvent("popstate"));
});
await page.waitForTimeout(2000);

const frameHandle = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 });
const frame = await frameHandle.contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-builder-app"), null, { timeout: 90000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/01-builder.png` });

// Click Preview button
const previewClicked = await frame.evaluate(() => {
  const btn = document.getElementById("mf-btn-preview") || document.querySelector("[data-mf-action='preview'], .mf-btn-preview");
  if (!btn) return "no preview btn";
  btn.click();
  return "clicked " + (btn.id || btn.className);
});
console.log("preview:", previewClicked);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/02-after-preview.png` });

const info = await frame.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { id: el.id, className: el.className.slice(0, 120), text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200), rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } };
  };
  return {
    themeDesigner: r(".mf-theme-designer, #mf-theme-designer, [data-mf-pane='theme']"),
    leftPane: r(".mf-left-pane, #mf-left-pane, .mf-style-pane, #mf-style-pane"),
    rightPanel: r("#mf-panel-right"),
    bodyClasses: document.body.className,
    paneTitles: [...document.querySelectorAll(".mf-flyout-title, .mf-pane-title, .mf-panel-title, h3, h4")].map((x) => (x.textContent || "").trim()).slice(0, 20),
  };
});

fs.writeFileSync(`${OUT}/info.json`, JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
await browser.close();
