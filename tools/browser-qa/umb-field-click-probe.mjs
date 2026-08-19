// Probe: what happens when the gear on a canvas control is clicked.
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const OUT = process.env.OUT_DIR || "./qa-field-click-probe";
const FORM = process.env.FORM_ID || "101";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
await umbLogin(page, { base: BASE, user: "admin@local", pass: "Admin123456!" });
await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(1500);
const frame = await (await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 })).contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-canvas-fields"), null, { timeout: 90000 });
await page.waitForTimeout(4000);

const out = {};
out.canvas = await frame.evaluate(() => {
  const items = [...document.querySelectorAll(".mf-canvas-item")].slice(0, 4).map((el) => ({
    index: el.getAttribute("data-index"),
    hasGear: !!el.querySelector(".mf-edit-field"),
    gearClass: el.querySelector(".mf-edit-field")?.className,
    classes: el.className.slice(0, 60),
  }));
  return { count: document.querySelectorAll(".mf-canvas-item").length, items };
});

// Click the gear the way a person does, not through .click() on a hidden node.
out.beforeClick = await frame.evaluate(() => ({
  selectedIndex: window.MegaFormBuilder?.state?.selectedFieldIndex,
  flyoutOpen: !!document.getElementById("mf-panel-right")?.classList.contains("mf-flyout-open"),
}));

const target = await frame.$('.mf-canvas-item[data-index="1"] .mf-edit-field');
if (target) {
  await target.scrollIntoViewIfNeeded();
  await target.click({ force: true });
}
await page.waitForTimeout(2500);

out.afterClick = await frame.evaluate(() => {
  const props = document.getElementById("mf-field-props");
  const sec = document.querySelector("#mf-prop-field-security");
  return {
    selectedIndex: window.MegaFormBuilder?.state?.selectedFieldIndex,
    flyoutOpen: !!document.getElementById("mf-panel-right")?.classList.contains("mf-flyout-open"),
    flyoutScope: document.getElementById("mf-panel-right")?.getAttribute("data-mf-flyout-scope"),
    flyoutTitle: document.querySelector(".mf-flyout-title")?.textContent?.trim(),
    propsDisplay: props?.style.display,
    noFieldPlaceholder: document.getElementById("mf-no-field-selected")?.style.display,
    secDisplay: sec?.style.display,
    secOptions: sec ? [...(sec.querySelector("#mf-prop-field-roles")?.options || [])].map((o) => o.textContent) : null,
    generalGroupShown: document.getElementById("mf-prop-general-group")?.style.display,
    labelValue: document.getElementById("mf-prop-label")?.value,
  };
});
await page.screenshot({ path: `${OUT}/after-click.png` });

// And through the toolbar-free path the handoff points at: MFOpenFlyout('field').
out.viaOpenFlyout = await frame.evaluate(async () => {
  window.MFOpenFlyout?.("field");
  await new Promise((r) => setTimeout(r, 1200));
  const sec = document.querySelector("#mf-prop-field-security");
  return {
    propsDisplay: document.getElementById("mf-field-props")?.style.display,
    secDisplay: sec?.style.display,
    secOptions: sec ? [...(sec.querySelector("#mf-prop-field-roles")?.options || [])].map((o) => o.textContent) : null,
  };
});
await page.screenshot({ path: `${OUT}/via-openflyout.png` });

fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await browser.close();
