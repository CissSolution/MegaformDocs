// Try the plausible Umbraco Forms workspace routes and report which one renders a designer.
// Cheaper than fighting the entity-action menu in shadow DOM, and it also documents the route
// an editor lands on when they click Create.
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5139";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  "/umbraco/section/forms/workspace/forms-form/create",
  "/umbraco/section/forms/workspace/form/create",
  "/umbraco/section/forms/workspace/forms/create",
  "/umbraco/section/forms/view/forms/create",
];

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await umbLogin(page, { base: BASE, user: "admin@local", pass: "Admin123456!" });

for (const [i, r] of ROUTES.entries()) {
  await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const text = await page.evaluate(() => {
    const acc = [];
    const walk = (root, d) => {
      root.querySelectorAll("*").forEach((e) => {
        const t = e.tagName.toLowerCase();
        if (/^(h1|h2|h3|uui-box|uui-input|input|uui-button|button)$/.test(t)) {
          const l = (e.getAttribute("label") || e.getAttribute("placeholder") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
          const rect = e.getBoundingClientRect();
          if (l && rect.width > 0) acc.push(l);
        }
        if (e.shadowRoot && d < 14) walk(e.shadowRoot, d + 1);
      });
    };
    walk(document, 0);
    return [...new Set(acc)];
  });
  console.log(`${r}\n   url now: ${page.url()}\n   ui: ${text.slice(-12).join(" | ")}`);
  await page.screenshot({ path: `${OUT}/route-${i}.png` });
}

await browser.close();
