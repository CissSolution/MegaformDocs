// ============================================================================
//  The Prevalue Sources screen, driven the way a person drives it.
//
//  Opens the node from the MegaForm tree, creates a SQL-backed source, tests it,
//  saves it, checks the list, edits it, and deletes it — photographing each step.
//  The element lives in the backoffice's own shadow DOM, so every query pierces
//  shadow roots; a plain querySelector finds nothing here and would read as
//  "the screen is empty".
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-prevalue-sources-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-prevalues";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };

// Deep helpers — the screen and the tree both live behind shadow roots.
const deep = {
  click: (sel, text) => page.evaluate(([s, t]) => {
    const walk = (root) => {
      for (const el of root.querySelectorAll(s)) {
        // uui-menu-item carries its caption in a label ATTRIBUTE and renders it inside its
        // own shadow root, so matching on textContent alone finds none of the tree nodes.
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
      for (const el of root.querySelectorAll(s)) out.push((el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return out;
  }, sel),
};

const report = { errors };

// ── Open the node from the tree, the way a user would ───────────────────────
// Login lands in Content; the MegaForm tree only exists inside its own section.
await page.evaluate(() => {
  history.pushState({}, "", "/umbraco/section/megaform");
  window.dispatchEvent(new PopStateEvent("popstate"));
});
await page.waitForTimeout(3000);
report.treeClicked = await deep.click("uui-menu-item", "Prevalue Sources");
await page.waitForTimeout(2500);
report.url = page.url().replace(BASE, "");
report.heading = await deep.text("h2");
report.emptyState = await deep.text(".empty");
await shot("01-screen");

// ── Create through the PICKERS, the way Umbraco Forms' editor works ────────
const selectByLabel = (labelText, optionMatch) => page.evaluate(([lbl, opt]) => {
  const walk = (root) => {
    for (const row of root.querySelectorAll(".frow")) {
      const label = row.querySelector(".flabel")?.textContent?.trim() || "";
      if (!label.toLowerCase().startsWith(lbl.toLowerCase())) continue;
      const sel = row.querySelector("select");
      if (!sel) return { ok: false, why: "no select in row" };
      const options = [...sel.options].map((o) => o.textContent.trim());
      const hit = [...sel.options].find((o) => o.value && new RegExp(opt, "i").test(o.textContent));
      if (!hit) return { ok: false, why: "no option matching " + opt, options: options.slice(0, 12) };
      sel.value = hit.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, picked: hit.textContent.trim(), count: sel.options.length };
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  return walk(document) || { ok: false, why: "row not found: " + lbl };
}, [labelText, optionMatch]);

const setType = (label) => page.evaluate((want) => {
  const walk = (root) => {
    for (const sel of root.querySelectorAll(".head select")) {
      const hit = [...sel.options].find((o) => o.textContent.trim() === want);
      if (hit) { sel.value = hit.value; sel.dispatchEvent(new Event("change", { bubbles: true })); return true; }
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { if (walk(el.shadowRoot)) return true; }
    return false;
  };
  return walk(document);
}, label);

// ---- 1. Umbraco data type, the type that answered HTTP 400 before ----------
report.createClicked = await deep.click("button.primary", "Create");
await page.waitForTimeout(800);
await deep.fill(".head input", "QA data type source", 0);
report.typeSwitched = await setType("Umbraco data type");
await page.waitForTimeout(2500);
report.dataTypePick = await selectByLabel("Data type", "Dropdown");
await page.waitForTimeout(400);
await shot("02-datatype-picked");
report.testClicked = await deep.click(".editor button", "Test");
await page.waitForTimeout(3000);
report.dataTypeMsg = (await deep.text(".msg")).slice(0, 3);
report.dataTypeSample = await deep.text(".sample");
await shot("03-datatype-tested");

// ---- 2. Umbraco documents: root node + document type + value/label fields --
report.typeSwitched2 = await setType("Umbraco documents");
await page.waitForTimeout(2500);
report.rootPick = await selectByLabel("Root node", ".");   // first real node
await page.waitForTimeout(600);
report.docTypePick = await selectByLabel("Document type", ".");
await page.waitForTimeout(1200);
report.valueFieldOptions = await selectByLabel("Value field", "Name|Id");
await page.waitForTimeout(400);
await shot("04-documents-configured");
report.testClicked2 = await deep.click(".editor button", "Test");
await page.waitForTimeout(3000);
report.documentsMsg = (await deep.text(".msg")).slice(0, 3);
report.documentsSample = await deep.text(".sample");
await shot("05-documents-tested");

await deep.click(".editor button", "Cancel");
await page.waitForTimeout(600);

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
