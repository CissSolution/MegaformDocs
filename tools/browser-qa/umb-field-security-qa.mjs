// ============================================================================
//  Three moves, checked on the screen they happened on:
//
//   1. Theme Designer left the icon row and became a LABELLED "Preview" button in
//      the top bar — an unlabelled palette glyph in a row of ten is invisible.
//   2. The Permissions tool left the builder toolbar (it lives under Security now).
//   3. Field settings gained a Security section: "Visible to roles" and
//      "Read-only for roles" for THAT field, and a choice made there survives.
//
//  Scroll-aware: the field settings flyout scrolls inside itself, so the section
//  under test can sit below the fold — the script scrolls the panel and photographs
//  a tile per screenful, then reports what each tile showed.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID
//  Run: node tools/browser-qa/umb-field-security-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-field-security";
const FORM = process.env.FORM_ID || "101";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const report = { errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e).slice(0, 200)));

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(2000);
const frameEl = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 });
const frame = await frameEl.contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-canvas-fields"), null, { timeout: 90000 });
await page.waitForTimeout(5000);

// ── 1 + 2. The toolbar, and the new Preview button ──────────────────────────
report.toolbar = await frame.evaluate(() => {
  const tools = [...document.querySelectorAll(".mf-secondary-tool")]
    .map((b) => b.getAttribute("data-mf-secondary-tab") || b.id);
  const preview = document.getElementById("mf-btn-theme-preview");
  const rect = preview && preview.getBoundingClientRect();
  return {
    tools,
    permsToolGone: !tools.includes("perms"),
    themeToolGone: !tools.includes("theme"),
    previewButton: preview ? {
      label: preview.textContent.trim(),
      inTopbar: !!preview.closest(".w-topbar"),
      width: Math.round(rect.width),
    } : null,
  };
});
await page.screenshot({ path: `${OUT}/01-toolbar.png` });

// Preview opens the theme designer flyout.
await frame.evaluate(() => document.getElementById("mf-btn-theme-preview")?.click());
await page.waitForTimeout(2500);
report.previewOpens = await frame.evaluate(() => ({
  open: !!document.getElementById("mf-panel-right")?.classList.contains("mf-flyout-open"),
  title: document.querySelector(".mf-flyout-title")?.textContent?.trim(),
}));
await page.screenshot({ path: `${OUT}/02-preview-open.png` });
await frame.evaluate(() => document.getElementById("mf-flyout-close")?.click());
await page.waitForTimeout(600);

// ── 3. Field settings → Security ────────────────────────────────────────────
report.field = await frame.evaluate(() => {
  // A real input field, not a Section: layout containers have no access rules of their own,
  // and the first canvas item on this form is a Section — which is how the first run of this
  // script reported the feature missing when it was simply looking at the wrong card.
  const B0 = window.MegaFormBuilder;
  const idx = (B0.state.schema.fields || []).findIndex((f) => ["Text", "Email", "Phone", "Textarea", "Select", "Radio"].includes(f.type));
  const btn = document.querySelector(`.mf-canvas-item[data-index="${idx}"] .mf-edit-field`);
  if (!btn) return { clicked: false };
  btn.scrollIntoView({ block: "center" });
  btn.click();
  const f = B0.state.schema.fields[idx];
  return { clicked: true, key: f?.key, label: f?.label, type: f?.type };
});
await page.waitForTimeout(2500);

// Walk the flyout body: the Security section can be below the fold.
const tiles = [];
const scroller = await frame.evaluate(() => {
  const el = document.querySelector(".mf-flyout-body");
  return el ? { h: el.clientHeight, sh: el.scrollHeight } : null;
});
if (scroller) {
  const step = Math.max(1, scroller.h - 60);
  for (let y = 0, i = 0; y < scroller.sh && i < 6; y += step, i++) {
    await frame.evaluate((top) => { document.querySelector(".mf-flyout-body").scrollTop = top; }, y);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/03-field-tile${i}.png` });
    tiles.push({
      y,
      shows: await frame.evaluate(() => {
        const el = document.querySelector(".mf-flyout-body");
        const top = el.scrollTop, bottom = top + el.clientHeight;
        return [...el.querySelectorAll("h6, label")]
          .filter((h) => h.offsetTop >= top - 30 && h.offsetTop <= bottom)
          .map((h) => h.textContent.trim().slice(0, 34));
      }),
    });
  }
}
report.flyoutTiles = { scroller, tiles };

report.security = await frame.evaluate(() => {
  const wrap = document.getElementById("mf-prop-field-security");
  const vis = document.getElementById("mf-prop-field-roles");
  const ro = document.getElementById("mf-prop-field-readonly-roles");
  return {
    present: !!wrap,
    visible: wrap ? getComputedStyle(wrap).display !== "none" : false,
    heading: wrap?.querySelector("h6")?.textContent?.trim(),
    roleOptions: vis ? [...vis.options].map((o) => o.textContent.trim()) : null,
    readOnlyOptions: ro ? [...ro.options].map((o) => o.textContent.trim()) : null,
  };
});

// Pick a role and prove it reaches the schema for THIS field.
report.applied = await frame.evaluate(() => {
  const sel = document.getElementById("mf-prop-field-roles");
  const option = sel && [...sel.options].find((o) => o.value);
  if (!option) return { ok: false, why: "no role to pick" };
  option.selected = true;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  const B = window.MegaFormBuilder;
  const idx = B.state.selectedFieldIndex;
  const field = B.state.schema.fields[idx];
  return { ok: true, picked: option.value, key: field?.key, showIf: JSON.stringify(field?.showIf || null).slice(0, 200) };
});
await page.screenshot({ path: `${OUT}/04-role-picked.png` });

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 3500));
await browser.close();
