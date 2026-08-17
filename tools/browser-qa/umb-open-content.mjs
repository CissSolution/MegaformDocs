// Open an existing content node and report what its MegaForm property rendered as.
//
// Simpler and more reliable than driving the create-content flow: the node already exists, so
// this measures the thing that matters — whether an editor can actually pick a form — without
// depending on the shape of Umbraco's create dialog.
//
// Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, NODE_NAME
import { chromium } from "playwright";
import { umbLogin, deepClick } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "https://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
const NODE = process.env.NODE_NAME || "Contact Us";

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
await deepClick(page, "Content");
await page.waitForTimeout(4000);

// A real pointer click, not element.click(). Umbraco's tree items open the workspace from
// pointer events; calling .click() in page context returns the href and changes nothing on
// screen, which reads as "the node will not open".
const item = page.getByText(NODE, { exact: true }).first();
await item.waitFor({ timeout: 60000 }).catch(() => {});
await item.click({ timeout: 30000 }).catch((e) => console.log("click failed:", e.message.slice(0, 80)));
await page.waitForFunction(() => /workspace|edit/.test(location.pathname), null, { timeout: 60000 })
          .catch(() => console.log("workspace route never appeared"));
await page.waitForTimeout(7000);
console.log("url:", page.url());
await page.screenshot({ path: `${OUT}/umb-node-open.png` });
console.log("wrote umb-node-open.png");

const state = await page.evaluate(() => {
  const acc = { customElements: [], labels: [], inputs: [], text: "" };
  const walk = (root) => {
    root.querySelectorAll("*").forEach((e) => {
      const t = e.tagName.toLowerCase();
      if (t.startsWith("megaform-") || t.includes("form-picker")) acc.customElements.push(t);
      if (t === "umb-property" || t === "umb-property-layout") {
        const l = (e.getAttribute("label") || "").trim();
        if (l) acc.labels.push(l);
      }
      if (t === "input" || t === "select" || t === "uui-select") acc.inputs.push(t + ":" + (e.getAttribute("name") || e.getAttribute("label") || ""));
      if (e.shadowRoot) walk(e.shadowRoot);
    });
  };
  walk(document);
  acc.customElements = [...new Set(acc.customElements)];
  acc.text = (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 320);
  return acc;
});
console.log(JSON.stringify(state, null, 1).slice(0, 1400));

await browser.close();
