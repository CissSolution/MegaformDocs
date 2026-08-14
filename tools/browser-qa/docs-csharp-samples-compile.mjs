// ============================================================================
//  Compile every C# sample in the scripting documentation against a real site.
//
//  A documentation page whose sample does not compile is the failure this whole
//  set was rewritten to remove. This extracts each ```csharp fence from the
//  pages and pushes it through FormScript/Validate on a live site, which is the
//  same compiler a host hits when they paste the sample in.
//
//  Fences are compiled as written. A fence that is deliberately a fragment
//  (a signature list, a table of statuses) will fail, and the report says which
//  page and which fence so a human can decide.
//
//  Env: DNN_BASE_URL, DNN_USER, DNN_PASSWORD, DOCS_DIR, FORM_ID
//  Run: node tools/browser-qa/docs-csharp-samples-compile.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DNN_BASE_URL || "http://megaclean008.ai";
const USER = process.env.DNN_USER || "admin";
const PASS = process.env.DNN_PASSWORD;
const DOCS = process.env.DOCS_DIR;
const FORM_ID = Number(process.env.FORM_ID || 235);

const PAGES = [
  "automation-overview.md",
  "automation-custom-db.md",
  "automation-rest-crm.md",
  "automation-notifications.md",
  "automation-user-provisioning.md",
  "scripting-safety.md",
];

function fences(md) {
  const out = [];
  const re = /```csharp\r?\n([\s\S]*?)```/g;
  let m, i = 0;
  while ((m = re.exec(md)) !== null) {
    const code = m[1];
    const line = md.slice(0, m.index).split("\n").length;
    out.push({ index: ++i, line, code });
  }
  return out;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.locator("#dnn_ctr_Login_Login_DNN_txtUsername").fill(USER);
await page.locator("#dnn_ctr_Login_Login_DNN_txtPassword").fill(PASS);
await page.locator("#dnn_ctr_Login_Login_DNN_cmdLogin").click();
await page.waitForFunction(() => /Logout/i.test(document.body?.innerText || ""), null, { timeout: 120000 });

let total = 0, ok = 0;
const failures = [];

for (const file of PAGES) {
  const full = path.join(DOCS, file);
  if (!fs.existsSync(full)) { console.log(`SKIP ${file} (missing)`); continue; }
  const list = fences(fs.readFileSync(full, "utf8"));
  for (const f of list) {
    total++;
    const res = await page.evaluate(async ([formId, source]) => {
      const tok = document.querySelector('input[name="__RequestVerificationToken"]')?.value || "";
      const r = await fetch("/DesktopModules/MegaForm/API/FormScript/Validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", RequestVerificationToken: tok },
        body: JSON.stringify({ formId, source }),
      });
      const t = await r.text();
      try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 200) }; }
    }, [FORM_ID, f.code]);

    const errs = (res.json?.diagnostics || []).filter((d) => (d.Severity || d.severity) === "error");
    if (res.json?.success === true && errs.length === 0) { ok++; continue; }
    failures.push({
      file, fence: f.index, docLine: f.line,
      first: errs[0] ? `${errs[0].Code} ${errs[0].Message}`.slice(0, 150) : `HTTP ${res.status} ${res.text || ""}`,
      head: f.code.split("\n").slice(0, 2).join(" / ").slice(0, 90),
    });
  }
  console.log(`${file}: ${list.length} fences`);
}

console.log(`\n=== ${ok}/${total} C# samples compile ===`);
for (const f of failures) {
  console.log(`\n  ${f.file} fence #${f.fence} (page line ~${f.docLine})`);
  console.log(`    starts: ${f.head}`);
  console.log(`    error : ${f.first}`);
}
await browser.close();
