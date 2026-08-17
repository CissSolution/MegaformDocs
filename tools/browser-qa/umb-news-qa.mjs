// ============================================================================
//  Umbraco newsroom QA — the seeded News pages and the MegaForm on each one.
//
//  Every form on these pages is rendered by JavaScript after a fetch for the
//  schema, so HTTP 200 and a <div class="megaform-root"> prove nothing. This
//  script waits for real controls to appear inside that div, counts them, and
//  photographs the page so the result can be looked at rather than inferred.
//
//  Env: UMB_BASE (default http://localhost:5138), OUT_DIR
//  Run: node tools/browser-qa/umb-news-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { slug: "/news/", shot: "news-list", form: 2, label: "News list" },
  { slug: "/megaform-2033-ships-for-oqtane/", shot: "article-1-newsletter", form: 2, label: "Release / newsletter" },
  { slug: "/registration-opens-for-the-2026-user-conference/", shot: "article-2-event", form: 4, label: "Event registration" },
  { slug: "/dropdowns-that-read-from-your-own-database/", shot: "article-3-sqllookup", form: 201, label: "SQL lookup" },
  { slug: "/what-we-changed-about-file-uploads/", shot: "article-4-upload", form: 6, label: "File upload" },
  { slug: "/long-forms-without-the-drop-off/", shot: "article-5-multistep", form: 5, label: "Multi-step" },
  { slug: "/case-study-an-application-intake-that-runs-itself/", shot: "article-6-premium", form: 102, label: "Premium 12-field" },
];

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });

const rows = [];

for (const p of PAGES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

  const res = await page.goto(`${BASE}${p.slug}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);

  // Wait for the renderer to put controls inside the root, not just for the root.
  await page
    .waitForFunction(() => {
      const root = document.querySelector(".megaform-root");
      return root && root.querySelectorAll("input, select, textarea, button").length > 0;
    }, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(1500);

  const probe = await page.evaluate(() => {
    const root = document.querySelector(".megaform-root");
    const q = (sel) => (root ? root.querySelectorAll(sel).length : 0);
    return {
      declaredFormId: root ? root.getAttribute("data-form-id") : null,
      inputs: q("input"),
      selects: q("select"),
      textareas: q("textarea"),
      files: q('input[type="file"]'),
      buttons: q("button"),
      labels: q("label"),
      rootText: root ? (root.innerText || "").trim().slice(0, 120) : "(no root)",
      selectOptions: Array.from(root ? root.querySelectorAll("select") : []).map((s) => s.options.length),
      title: document.title,
    };
  });

  const file = `${OUT}/umb-news-${p.shot}.png`;
  await page.screenshot({ path: file, fullPage: true });

  rows.push({
    label: p.label,
    slug: p.slug,
    status: res ? res.status() : "ERR",
    expectForm: p.form,
    gotForm: probe.declaredFormId,
    controls: probe.inputs + probe.selects + probe.textareas,
    inputs: probe.inputs,
    selects: probe.selects,
    textareas: probe.textareas,
    files: probe.files,
    buttons: probe.buttons,
    labels: probe.labels,
    selectOptions: probe.selectOptions.join("/"),
    firstText: probe.rootText.replace(/\s+/g, " ").slice(0, 60),
    errors: errors.slice(0, 2).join(" | "),
    shot: file,
  });

  await page.close();
}

console.log("\n=== Umbraco newsroom QA ===");
for (const r of rows) {
  console.log(
    `${r.status}  form ${String(r.expectForm).padEnd(3)}→${String(r.gotForm).padEnd(4)} ` +
      `controls=${String(r.controls).padStart(2)} (in ${r.inputs}/sel ${r.selects}/ta ${r.textareas}/file ${r.files}) ` +
      `btn=${r.buttons} lbl=${r.labels} opts=[${r.selectOptions}]  ${r.label}`
  );
  if (r.errors) console.log(`      console: ${r.errors}`);
  if (r.controls === 0) console.log(`      EMPTY ROOT TEXT: ${r.firstText}`);
}
console.log(`\nShots in ${OUT}`);

await browser.close();
