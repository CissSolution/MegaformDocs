// Probe: why the field Security section stays hidden after a field is selected.
// Reports where #mf-field-props sits, whether the section travelled with it, and what
// happens when renderFieldSecurity is driven by hand.
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const OUT = process.env.OUT_DIR || "./qa-field-security-probe";
const FORM = process.env.FORM_ID || "101";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const log = [];
page.on("console", (m) => { if (m.type() === "error") log.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => log.push("pageerror: " + String(e).slice(0, 200)));

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(1500);
const frame = await (await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 })).contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-canvas-fields"), null, { timeout: 90000 });
await page.waitForTimeout(4000);

const where = async (label) => frame.evaluate((tag) => {
  const props = document.getElementById("mf-field-props");
  const sec = document.querySelector("#mf-prop-field-security");
  const chain = (el) => {
    const out = [];
    for (let n = el; n && out.length < 6; n = n.parentElement) out.push(n.id || n.className || n.tagName);
    return out;
  };
  return {
    tag,
    propsFound: !!props,
    propsConnected: props ? props.isConnected : null,
    propsParent: props ? chain(props.parentElement).slice(0, 3) : null,
    propsDisplay: props ? props.style.display : null,
    secFound: !!sec,
    secInProps: !!props?.querySelector("#mf-prop-field-security"),
    secDisplay: sec ? sec.style.display : null,
    selectCount: sec ? sec.querySelectorAll("select").length : 0,
    optionCount: sec ? sec.querySelector("#mf-prop-field-roles")?.options.length : null,
  };
}, label);

const out = { steps: [] };
out.steps.push(await where("boot"));

// Open Preview (theme designer) and close it — the sequence that used to lose the section.
await frame.evaluate(() => document.getElementById("mf-btn-theme-preview")?.click());
await page.waitForTimeout(2500);
out.steps.push(await where("preview-open"));
await frame.evaluate(() => document.getElementById("mf-flyout-close")?.click());
await page.waitForTimeout(800);
out.steps.push(await where("preview-closed"));

// What state is the canvas in after the theme designer has been opened and closed?
out.canvasAfterPreview = await frame.evaluate(() => {
  const item = document.querySelector('.mf-canvas-item[data-index="1"]');
  const gear = item?.querySelector(".mf-edit-field");
  const box = gear?.getBoundingClientRect();
  const center = document.querySelector(".mf-panel-center");
  return {
    canvasItems: document.querySelectorAll(".mf-canvas-item").length,
    themeIframe: !!document.querySelector("#mf-theme-preview-frame, .mf-theme-preview iframe, #mf-canvas-preview-frame"),
    centerMode: center?.getAttribute("data-mf-mode") || document.getElementById("mf-builder-root")?.getAttribute("data-mf-mode"),
    dropzoneDisplay: getComputedStyle(document.getElementById("mf-canvas-dropzone") || document.body).display,
    itemVisible: item ? getComputedStyle(item).visibility : null,
    gearBox: box ? { w: Math.round(box.width), h: Math.round(box.height) } : null,
    gearVisibility: gear ? getComputedStyle(gear).visibility : null,
    gearOpacity: gear ? getComputedStyle(gear).opacity : null,
    gearDisplay: gear ? getComputedStyle(gear).display : null,
  };
});

out.pick = await frame.evaluate(() => {
  const B = window.MegaFormBuilder;
  const idx = (B.state.schema.fields || []).findIndex((f) => ["Text", "Email", "Phone"].includes(f.type));
  const btn = document.querySelector(`.mf-canvas-item[data-index="${idx}"] .mf-edit-field`);
  btn?.scrollIntoView({ block: "center" });
  btn?.click();
  return { idx, clicked: !!btn };
});
await page.waitForTimeout(2500);
out.steps.push(await where("field-selected"));

// Is the module's own render reachable, and what does a hand-driven call do?
out.manual = await frame.evaluate(async () => {
  const B = window.MegaFormBuilder;
  const sec = document.querySelector("#mf-prop-field-security");
  const before = sec ? sec.style.display : null;
  // Re-select through the module so the same path runs again, now that everything is settled.
  try { B.callModule("properties", "showProps", B.state.selectedFieldIndex); } catch (e) { return { error: String(e).slice(0, 160) }; }
  await new Promise((r) => setTimeout(r, 1200));
  const after = document.querySelector("#mf-prop-field-security");
  return {
    before,
    after: after ? after.style.display : null,
    options: after ? [...(after.querySelector("#mf-prop-field-roles")?.options || [])].map((o) => o.textContent) : null,
    moduleActions: Object.keys(B.modules?.properties || {}),
  };
});
await page.screenshot({ path: `${OUT}/probe.png` });

out.console = log.slice(0, 10);
fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await browser.close();
