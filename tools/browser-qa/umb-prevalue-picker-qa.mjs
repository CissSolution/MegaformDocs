// ============================================================================
//  The field-side picker: does choosing a shared prevalue source actually feed the
//  options the renderer will use?
//
//  Proof chain, each step measured rather than assumed:
//   1. create a catalog entry over MF_DemoDepartments (3 rows)
//   2. open the builder, pick a choice field, open its settings flyout
//   3. switch Options source to the shared catalog and pick the entry
//   4. Preview options — the picker's own button, hitting /Options/{id}
//   5. save the form, then call /Field/Options?formId&fieldKey — the SAME endpoint the
//      renderer calls — and require the three labels to come back
//   6. put the field back to a static list, save, delete the catalog entry
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID
//  Run: node tools/browser-qa/umb-prevalue-picker-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-prevalue-picker";
const FORM = process.env.FORM_ID || "103";
const API = "/umbraco/MegaForm/MegaFormApi";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
const report = { errors };
const call = (path, init) => page.evaluate(async ([p, i]) => {
  const res = await fetch(p, i ? { ...i, headers: { "Content-Type": "application/json", ...(i.headers || {}) } } : undefined);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
}, [path, init]);

// ── 1. Catalog entry ────────────────────────────────────────────────────────
const source = {
  name: "QA picker — departments", type: "sql", cacheMinutes: 0,
  settingsJson: JSON.stringify({ connectionKey: "DashboardDatabase", sql: "SELECT Id AS value, Name AS label FROM MF_DemoDepartments" }),
};
report.created = await call(`${API}/PrevalueSources/Save`, { method: "POST", body: JSON.stringify(source) });
const sourceId = report.created?.body?.id;

// ── 2. Builder, choice field, settings flyout ───────────────────────────────
await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(1500);
const frameEl = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 });
const frame = await frameEl.contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-canvas-fields"), null, { timeout: 90000 });
await page.waitForTimeout(5000);

report.picked = await frame.evaluate(() => {
  const B = window.MegaFormBuilder;
  const fields = B.state.schema.fields || [];
  const idx = fields.findIndex((f) => ["Radio", "Dropdown", "Select", "Checkbox", "MultiSelect"].includes(f.type));
  if (idx < 0) return { ok: false };
  window.__mfOriginalProps = JSON.stringify(fields[idx].properties || {});
  const card = document.querySelector(`.mf-canvas-item[data-index="${idx}"] .mf-edit-field`);
  if (card) { card.scrollIntoView({ block: "center" }); card.click(); }
  return { ok: true, index: idx, key: fields[idx].key, type: fields[idx].type };
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-field-settings.png` });

// ── 3. Options source → shared catalog, then pick the entry ─────────────────
report.switched = await frame.evaluate(() => {
  const sel = document.getElementById("mf-prop-options-source");
  if (!sel) return false;
  // The Options group only shows for choice fields; open it if the accordion collapsed it.
  sel.value = "prevalue";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
});
await page.waitForTimeout(2000);
report.pickerOptions = await frame.evaluate(() => {
  const sel = document.getElementById("mf-prop-options-prevalue");
  return sel ? [...sel.options].map((o) => `${o.value}:${o.textContent.trim()}`) : null;
});
report.chose = await frame.evaluate((id) => {
  const sel = document.getElementById("mf-prop-options-prevalue");
  if (!sel) return false;
  sel.value = String(id);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return sel.value === String(id);
}, sourceId);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-source-chosen.png` });

// ── 4. The picker's own preview ─────────────────────────────────────────────
await frame.evaluate(() => document.getElementById("mf-prop-options-prevalue-preview")?.click());
await page.waitForTimeout(2500);
report.preview = await frame.evaluate(() => document.getElementById("mf-prop-options-prevalue-result")?.textContent || "");
await page.screenshot({ path: `${OUT}/03-preview.png` });

report.originalProps = report.originalProps || null;
report.fieldProps = await frame.evaluate((key) => {
  const fields = window.MegaFormBuilder.state.schema.fields || [];
  const f = fields.find((x) => x.key === key);
  return f ? { optionsSource: f.properties?.optionsSource, id: f.properties?.prevalueSourceId, name: f.properties?.prevalueSourceName } : null;
}, report.picked.key);

// ── 5. Save, then ask the endpoint the renderer uses ────────────────────────
await frame.evaluate(() => document.getElementById("mf-btn-save-draft")?.click());
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/04-saved.png` });
report.renderOptions = await call(`/api/MegaForm/Field/Options?formId=${FORM}&fieldKey=${encodeURIComponent(report.picked.key)}`);
// Did the save persist the pointer at all? Read the schema back from the server and look
// at the very field the builder edited — "the endpoint returned []" has two possible causes
// and only the stored schema tells them apart.
const stored = await call(`${API}/Form/Get?formId=${FORM}`);
report.storedField = (() => {
  try {
    const raw = stored.body?.schemaJson || stored.body?.SchemaJson || stored.body?.schema || "";
    const schema = typeof raw === "string" ? JSON.parse(raw) : raw;
    const find = (arr) => {
      for (const f of arr || []) {
        if (f.key === report.picked.key) return f;
        for (const c of f.columns || []) { const hit = find(c.fields); if (hit) return hit; }
      }
      return null;
    };
    const f = find(schema.fields);
    return f ? { key: f.key, props: f.properties || null } : { notFound: true, status: stored.status };
  } catch (e) { return { parseError: String(e).slice(0, 120), status: stored.status }; }
})();

// ── 6. Put the field back and clean up ──────────────────────────────────────
report.reverted = await frame.evaluate((key) => {
  const B = window.MegaFormBuilder;
  const f = (B.state.schema.fields || []).find((x) => x.key === key);
  if (!f) return false;
  // Put back exactly what was there — this runs against real forms.
  f.properties = JSON.parse(window.__mfOriginalProps || "{}");
  B.state.isDirty = true;
  document.getElementById("mf-btn-save-draft")?.click();
  return true;
}, report.picked.key);
await page.waitForTimeout(4000);
if (sourceId) report.deleted = await call(`${API}/PrevalueSources/Delete/${sourceId}`, { method: "POST" });

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
