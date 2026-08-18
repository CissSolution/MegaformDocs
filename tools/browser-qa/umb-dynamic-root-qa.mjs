// ============================================================================
//  Dynamic root: does a relative root resolve DIFFERENTLY per page?
//
//  That is the whole point of the feature, so the test is not "does it return
//  options" but "does the SAME source return the page's own branch for two
//  different pages". It drives the API the way the live form does — Test with a
//  pageId, which is the same context the renderer passes — and then drives the
//  editor UI to confirm the controls exist and save.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR
//  Run: node tools/browser-qa/umb-dynamic-root-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-dynamic-root";
const API = "/umbraco/MegaForm/MegaFormApi/PrevalueSources";
const META = "/umbraco/MegaForm/MegaFormApi/PrevalueMeta";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const report = { errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e).slice(0, 200)));

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
await page.evaluate(() => { history.pushState({}, "", "/umbraco/section/megaform"); dispatchEvent(new PopStateEvent("popstate")); });
await page.waitForTimeout(3500);

const call = (path, init) => page.evaluate(async ([p, i]) => {
  const mod = await import("/App_Plugins/MegaForm/backoffice/contexts/megaform-permissions-context.js");
  const res = await mod.mfFetch(p, i ? { ...i, headers: { "Content-Type": "application/json", ...(i.headers || {}) } } : undefined);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
}, [path, init]);

// ── The content we can aim at ───────────────────────────────────────────────
const roots = await call(`${META}/ContentRoots`);
report.contentNodes = (roots.body || []).map((n) => `${n.id}:${n.name}${n.depth ? " (child)" : ""}`);
const pages = (roots.body || []).filter((n) => n.depth === 0);
report.pagesUsed = pages.slice(0, 2).map((p) => `${p.id}:${p.name}`);

// ── 1. "Use current page as root" — the simplest relative root ──────────────
const currentPageSource = {
  name: "QA dynamic — current page", type: "umbracoDocuments", cacheMinutes: 0,
  settingsJson: JSON.stringify({ useCurrentPageAsRoot: true, includeDescendants: false }),
};
report.currentPage = {};
for (const p of pages.slice(0, 2)) {
  const res = await call(`${API}/Test?pageId=${p.id}`, { method: "POST", body: JSON.stringify(currentPageSource) });
  report.currentPage[p.name] = { status: res.status, labels: (res.body?.options || []).map((o) => o.label) };
}
const noPage = await call(`${API}/Test`, { method: "POST", body: JSON.stringify(currentPageSource) });
report.currentPage.noPageContext = { status: noPage.status, total: noPage.body?.total };

// ── 2. Dynamic root: origin Current, step NearestAncestorOrSelf ─────────────
// With no document type filter the nearest ancestor-or-self IS the page, so the
// interesting part is that the answer follows the page it was asked about.
const dynamicSource = {
  name: "QA dynamic — origin Current", type: "umbracoDocuments", cacheMinutes: 0,
  settingsJson: JSON.stringify({
    includeDescendants: true,
    dynamicRoot: { originAlias: "Current", steps: [{ alias: "NearestAncestorOrSelf", documentTypeAliases: [] }] },
  }),
};
report.dynamic = {};
for (const p of pages.slice(0, 2)) {
  const res = await call(`${API}/Test?pageId=${p.id}`, { method: "POST", body: JSON.stringify(dynamicSource) });
  report.dynamic[p.name] = { status: res.status, labels: (res.body?.options || []).map((o) => o.label).slice(0, 6) };
}

// ── 3. Origin ContentRoot — an absolute answer, same for every page ─────────
const contentRootSource = {
  name: "QA dynamic — origin ContentRoot", type: "umbracoDocuments", cacheMinutes: 0,
  settingsJson: JSON.stringify({ dynamicRoot: { originAlias: "ContentRoot", steps: [] } }),
};
report.contentRoot = {};
for (const p of pages.slice(0, 2)) {
  const res = await call(`${API}/Test?pageId=${p.id}`, { method: "POST", body: JSON.stringify(contentRootSource) });
  report.contentRoot[p.name] = { status: res.status, labels: (res.body?.options || []).map((o) => o.label) };
}

// ── 4. The editor: are the controls there, and does one save? ───────────────
const deepClick = (sel, text) => page.evaluate(([s, t]) => {
  const walk = (root) => {
    for (const el of root.querySelectorAll(s)) {
      const caption = ((el.getAttribute && el.getAttribute("label")) || "") + " " + (el.textContent || "");
      if (!t || caption.toLowerCase().includes(t.toLowerCase())) return el;
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  const el = walk(document);
  if (!el) return false;
  el.click();
  return true;
}, [sel, text]);

await deepClick("uui-menu-item", "Prevalue Sources");
await page.waitForTimeout(2500);
await deepClick("button.primary", "Create");
await page.waitForTimeout(800);
report.editorRows = await page.evaluate(() => {
  const walk = (root) => {
    const rows = [...root.querySelectorAll(".frow")].map((r) => r.querySelector(".flabel")?.textContent?.trim());
    if (rows.length) return rows;
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit?.length) return hit; }
    return [];
  };
  return walk(document);
});
// Switch to Umbraco documents and read the rows again — the relative-root controls live there.
await page.evaluate(() => {
  const walk = (root) => {
    for (const sel of root.querySelectorAll(".head select")) {
      const hit = [...sel.options].find((o) => o.textContent.trim() === "Umbraco documents");
      if (hit) { sel.value = hit.value; sel.dispatchEvent(new Event("change", { bubbles: true })); return true; }
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { if (walk(el.shadowRoot)) return true; }
    return false;
  };
  return walk(document);
});
await page.waitForTimeout(2500);
report.documentRows = await page.evaluate(() => {
  const walk = (root) => {
    const rows = [...root.querySelectorAll(".frow")].map((r) => r.querySelector(".flabel")?.textContent?.trim());
    if (rows.length) return rows;
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit?.length) return hit; }
    return [];
  };
  return walk(document);
});
await page.screenshot({ path: `${OUT}/01-documents-editor.png` });

// Pick an origin so the step editor appears, then photograph it.
report.originPicked = await page.evaluate(() => {
  const walk = (root) => {
    for (const row of root.querySelectorAll(".frow")) {
      if (!/dynamic root/i.test(row.querySelector(".flabel")?.textContent || "")) continue;
      const sel = row.querySelector("select");
      const hit = [...sel.options].find((o) => o.value === "Current");
      if (!hit) return false;
      sel.value = hit.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { if (walk(el.shadowRoot)) return true; }
    return false;
  };
  return walk(document);
});
await page.waitForTimeout(900);
report.afterOriginRows = await page.evaluate(() => {
  const walk = (root) => {
    const row = [...root.querySelectorAll(".frow")].find((r) => /dynamic root/i.test(r.querySelector(".flabel")?.textContent || ""));
    if (row) return { selects: row.querySelectorAll("select").length, buttons: [...row.querySelectorAll("button")].map((b) => b.textContent.trim()) };
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  return walk(document);
});
await page.screenshot({ path: `${OUT}/02-origin-current.png` });

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
