// ============================================================================
//  Builder DB Tables picker — §4.2 Umbraco Forms parity.
//
//  Verifies that the builder's DB tab uses the shared DataSource catalog on
//  Umbraco: the picker is populated from DataSources/List, tables/columns are
//  read via DataSources/Tables/Columns with dataSourceId, and the legacy
//  connectionKey parameter is not sent.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID, HEADED
//  Run: node tools/browser-qa/umb-db-picker-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-db-picker";
const FORM = process.env.FORM_ID || "103";
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

const requests = [];
page.on("request", (r) => {
  const url = r.url();
  if (url.includes("/MegaFormApi/") || url.includes("/MegaFormPopup/") || url.includes("/api/MegaForm")) {
    requests.push({ method: r.method(), url: url.replace(BASE, ""), hasDataSourceId: url.includes("dataSourceId="), hasConnectionKey: url.includes("connectionKey=") });
  }
});

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };

// Ensure at least one DataSource exists so the picker has something to show.
const sourceName = `QA DB Picker ${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
const dataSourceId = await page.evaluate(async (name) => {
  // Discover an allowed connection name (DashboardDatabase is not always registered on Umbraco).
  const connRes = await fetch("/umbraco/MegaForm/MegaFormApi/DataSources/Connections", { credentials: "include" });
  let connectionKey = "DashboardDatabase";
  if (connRes.ok) {
    const j = await connRes.json();
    const list = j.connections || [];
    if (list.length) connectionKey = list[0];
  }
  // Try to find an existing source using that connection first.
  const listRes = await fetch("/umbraco/MegaForm/MegaFormApi/DataSources/List", { credentials: "include" });
  if (listRes.ok) {
    const list = await listRes.json();
    const existing = list.find((x) => x.connectionKey === connectionKey);
    if (existing) return existing.id;
  }
  // Create one if needed.
  const saveRes = await fetch("/umbraco/MegaForm/MegaFormApi/DataSources/Save", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 0, name, connectionKey, description: "QA auto-created" }),
  });
  if (!saveRes.ok) {
    const txt = await saveRes.text().catch(() => "");
    console.log("DataSources/Save failed:", saveRes.status, txt.slice(0, 200));
    return 0;
  }
  const saved = await saveRes.json();
  return saved.id || 0;
}, sourceName);

await page.evaluate((form) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${form}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(1500);

const frameHandle = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 });
const frame = await frameHandle.contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-builder-app"), null, { timeout: 90000 });
await page.waitForTimeout(3000);
await shot("01-builder");

// Open the DB tab. Prefer the legacy activator if exposed; otherwise click the visible tab.
const dbOpened = await frame.evaluate(() => {
  if (typeof window.MFActivateRightTab === "function") {
    window.MFActivateRightTab("db");
    return "MFActivateRightTab(db)";
  }
  const tab = document.querySelector('[data-tab="db"], .mf-right-tab[data-tab="db"], #mf-tab-link-db');
  if (tab) { tab.click(); return "clicked tab"; }
  return "no opener";
});
await page.waitForTimeout(2500);
await shot("02-db-tab");

// Wait for the data-source picker to populate and report its state.
const picker = await frame.evaluate(() => {
  const sel = document.querySelector('#mf-db-tables-body [data-conn]');
  if (!sel) return { found: false };
  const options = [...sel.options].map((o) => ({ value: o.value, text: (o.textContent || "").trim() }));
  return {
    found: true,
    value: sel.value,
    optionCount: options.length,
    options: options.slice(0, 20),
    label: document.querySelector('#mf-db-tables-body .mf-bdb-search')?.previousElementSibling?.textContent?.trim() || "",
  };
});

// Wait for tables to load.
await frame.waitForFunction(() => {
  const list = document.querySelector('#mf-db-tables-body [data-list]');
  return !!list && list.querySelectorAll('.mf-bdb-group').length > 0;
}, null, { timeout: 15000 });

const tables = await frame.evaluate(() => {
  const rows = [...document.querySelectorAll('#mf-db-tables-body .mf-bdb-table')].slice(0, 10);
  return rows.map((r) => ({
    name: r.getAttribute("data-table"),
    schema: (r.querySelector('.mf-bdb-table-schema')?.textContent || "").trim(),
  }));
});
await shot("03-tables");

// Expand the first table and wait for columns.
let columns = [];
if (tables.length) {
  await frame.evaluate(() => {
    const head = document.querySelector('#mf-db-tables-body .mf-bdb-table-head');
    if (head) head.click();
  });
  await page.waitForTimeout(1500);
  columns = await frame.evaluate(() => {
    return [...document.querySelectorAll('#mf-db-tables-body .mf-bdb-col')].slice(0, 10).map((c) => ({
      name: c.getAttribute("data-col"),
      type: c.getAttribute("data-uitype"),
    }));
  });
  await shot("04-columns");
}

// Relevant network requests after opening the DB tab.
const relevant = requests.filter((r) =>
  r.url.includes("DataSources/") || r.url.includes("Subform/Tables") || r.url.includes("Subform/Columns")
);
const usedCatalog = relevant.some((r) => r.url.includes("DataSources/Tables") && r.hasDataSourceId);
const leakedConnectionKey = relevant.some((r) => r.hasConnectionKey);

const report = {
  dataSourceId,
  dbOpened,
  picker,
  tableCount: tables.length,
  firstTables: tables.slice(0, 5),
  columnCount: columns.length,
  firstColumns: columns.slice(0, 5),
  relevantRequests: relevant.slice(0, 30),
  usedCatalog,
  noConnectionKeyLeak: !leakedConnectionKey,
  pass: dataSourceId > 0 && picker.found && picker.optionCount > 0 && tables.length > 0 && usedCatalog && !leakedConnectionKey,
  errors: errors.slice(0, 20),
};

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.pass ? 0 : 1);
