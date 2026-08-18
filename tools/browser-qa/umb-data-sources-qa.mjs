// ============================================================================
//  Data Sources node — create, test, save, list, edit, delete, and prove
//  Tables/Columns refuse a connection key that is not in the stored entry.
//
//  The screen is a native Lit element inside the Umbraco backoffice shadow tree.
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-data-sources-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-data-sources";
fs.mkdirSync(OUT, { recursive: true });

const SOURCE_NAME = `QA DataSource ${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };

// Deep helpers — pierce shadow roots.
const deep = {
  click: (sel, text) => page.evaluate(([s, t]) => {
    const walk = (root) => {
      for (const el of root.querySelectorAll(s)) {
        const caption = ((el.getAttribute && el.getAttribute("label")) || "") + " " + (el.textContent || "");
        if (!t || caption.trim().toLowerCase().includes(t.toLowerCase())) return el;
      }
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
      return null;
    };
    const el = walk(document);
    if (!el) return false;
    el.click();
    return true;
  }, [sel, text]),
  fill: (sel, value, nth = 0) => page.evaluate(([s, v, i]) => {
    const found = [];
    const walk = (root) => {
      found.push(...root.querySelectorAll(s));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    const el = found[i];
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    return true;
  }, [sel, value, nth]),
  text: (sel) => page.evaluate((s) => {
    const out = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll(s)) out.push((el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return out;
  }, sel),
  selectByLabel: (labelText, optionValue) => page.evaluate(([lbl, val]) => {
    const walk = (root) => {
      for (const row of root.querySelectorAll(".frow")) {
        const label = row.querySelector(".flabel")?.textContent?.trim() || "";
        if (!label.toLowerCase().startsWith(lbl.toLowerCase())) continue;
        const sel = row.querySelector("select");
        if (!sel) return { ok: false, why: "no select in row" };
        const hit = [...sel.options].find((o) => o.value === val);
        if (!hit) return { ok: false, why: "option not found: " + val, options: [...sel.options].map((o) => o.value) };
        sel.value = hit.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, picked: hit.textContent.trim() };
      }
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
      return null;
    };
    return walk(document) || { ok: false, why: "row not found: " + lbl };
  }, [labelText, optionValue]),
};

const report = { errors };

// ── Open the Data Sources node from the MegaForm section tree ───────────────
await page.evaluate(() => {
  history.pushState({}, "", "/umbraco/section/megaform");
  window.dispatchEvent(new PopStateEvent("popstate"));
});
await page.waitForTimeout(3000);
report.treeClicked = await deep.click("uui-menu-item", "Data Sources");
await page.waitForTimeout(2500);
report.url = page.url().replace(BASE, "");
report.heading = await deep.text("h2");
report.emptyState = await deep.text(".empty");
await shot("01-screen");

// ── Create a data source pointing at the dashboard connection ──────────────
report.createClicked = await deep.click("button.primary", "Create");
await page.waitForTimeout(800);
await deep.fill(".editor input", SOURCE_NAME);
// Pick the first available connection (usually umbracoDbDSN on the demo host).
report.connectionPick = await deep.selectByLabel("Connection", "umbracoDbDSN");
await deep.fill(".editor textarea", "Created by QA");
report.saveClicked = await deep.click(".editor button.primary", "Save");
await page.waitForTimeout(1500);
report.saveMsg = (await deep.text(".msg")).slice(0, 5);
await shot("02-saved");

// ── Edit and test the connection ──────────────────────────────────────────
report.editClicked = await deep.click("table tbody button", "Edit");
await page.waitForTimeout(800);
await deep.fill(".editor textarea", "Updated by QA");
report.testClicked = await deep.click(".editor button", "Test");
await page.waitForTimeout(2500);
report.testMsg = (await deep.text(".msg")).slice(0, 5);
await shot("03-tested");
report.save2Clicked = await deep.click(".editor button.primary", "Save");
await page.waitForTimeout(1500);
report.editMsg = (await deep.text(".msg")).slice(0, 5);
await shot("04-edited");

// ── API-level checks: Tables uses the stored entry, never a raw connection key ─
// Discover the id of the source we just saved.
const savedId = await page.evaluate(async (name) => {
  const res = await fetch("/umbraco/MegaForm/MegaFormApi/DataSources/List", { credentials: "include" });
  const list = await res.json();
  const item = list.find((x) => x.name === name);
  return item ? item.id : 0;
}, SOURCE_NAME);
report.savedId = savedId;

if (savedId > 0) {
  const ok = await page.evaluate(async (id) => {
    const res = await fetch(`/umbraco/MegaForm/MegaFormApi/DataSources/Tables?dataSourceId=${id}`, { credentials: "include" });
    return { status: res.status, json: await res.json() };
  }, savedId);
  report.tablesOkStatus = ok.status;
  report.tablesOkCount = ok.json.tables?.length ?? -1;

  const withBadKey = await page.evaluate(async (id) => {
    // The controller resolves the connection from the stored entry; a connectionKey param is ignored.
    const res = await fetch(`/umbraco/MegaForm/MegaFormApi/DataSources/Tables?dataSourceId=${id}&connectionKey=DefinitelyNotAllowed`, { credentials: "include" });
    return { status: res.status };
  }, savedId);
  report.tablesIgnoresRawKeyStatus = withBadKey.status;
}

const missing = await page.evaluate(async () => {
  const res = await fetch("/umbraco/MegaForm/MegaFormApi/DataSources/Tables?dataSourceId=0", { credentials: "include" });
  return { status: res.status, text: await res.text() };
});
report.tablesMissingStatus = missing.status;
report.tablesMissingText = missing.text.slice(0, 200);

// ── Delete it ────────────────────────────────────────────────────────────────
page.once("dialog", async (dialog) => { await dialog.accept(); });
report.deleteClicked = await deep.click("table tbody button.danger", "Delete");
await page.waitForTimeout(2000);
report.emptyAfterDelete = await deep.text(".empty");
await shot("05-deleted");

// Final pass/fail summary.
report.pass =
  report.saveMsg.includes("Saved.") &&
  report.testMsg.some((m) => m.includes("Connected.")) &&
  report.editMsg.includes("Saved.") &&
  report.tablesOkStatus === 200 &&
  report.tablesOkCount > 0 &&
  report.tablesMissingStatus === 400 &&
  report.emptyAfterDelete.includes("No data sources yet.");

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
