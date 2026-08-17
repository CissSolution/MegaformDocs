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

// ── Create a SQL source against the demo table the DB screen already lists ──
report.createClicked = await deep.click("button.primary", "Create");
await page.waitForTimeout(600);
await deep.fill(".editor input", "QA departments", 0);
await deep.fill(".editor input", "DashboardDatabase", 2);   // 0 name, 1 cache, 2 connection
await deep.fill(".editor textarea",
  "SELECT Id AS value, Name AS label FROM MF_DemoDepartments", 0);
await page.waitForTimeout(300);
await shot("02-editor-filled");

report.testClicked = await deep.click(".editor button", "Test");
await page.waitForTimeout(2500);
report.sample = await deep.text(".sample");
report.msgAfterTest = await deep.text(".msg");
await shot("03-tested");

report.saveClicked = await deep.click(".editor button.primary", "Save");
await page.waitForTimeout(2500);
report.rowsAfterSave = await deep.text("tbody tr");
await shot("04-saved");

// ── Reopen it: the stored settings must come back into the editor ───────────
report.editClicked = await deep.click("tbody button", "Edit");
await page.waitForTimeout(800);
report.editorValues = await page.evaluate(() => {
  const walk = (root) => {
    const view = root.querySelector("megaform-prevalue-sources-view");
    if (view?.shadowRoot) return view.shadowRoot;
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  const sr = walk(document);
  if (!sr) return null;
  return {
    inputs: [...sr.querySelectorAll(".editor input")].map((i) => i.value),
    textarea: sr.querySelector(".editor textarea")?.value || "",
    type: sr.querySelector(".editor select")?.value || "",
  };
});
await shot("05-reopened");

// ── Clean up after ourselves ────────────────────────────────────────────────
page.on("dialog", (d) => d.accept());
await deep.click("tbody button.danger", "Delete");
await page.waitForTimeout(2000);
report.rowsAfterDelete = await deep.text("tbody tr");
report.emptyAfterDelete = await deep.text(".empty");
await shot("06-deleted");

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
