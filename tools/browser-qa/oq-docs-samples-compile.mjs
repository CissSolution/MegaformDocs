// ============================================================================
//  Compile every ```csharp fence in the Oqtane scripting docs against a live
//  Oqtane site, through the same FormScript/Validate endpoint a host hits.
//
//  A documentation sample that does not compile is worse than no sample: the
//  reader assumes their site is broken. The compiler here is C# 7.3 even on a
//  net10.0 host, so samples written in modern C# fail — which is exactly what
//  this catches.
//
//  Env: OQ_BASE, OQ_USER, OQ_PASS, OQ_FORM_ID, DOCS
//  Run: node tools/browser-qa/oq-docs-samples-compile.mjs [file.md ...]
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.OQ_BASE || "http://localhost:5131";
const USER = process.env.OQ_USER || "host";
const PASS = process.env.OQ_PASS || "abc@ABC1024";
const FORM_ID = Number(process.env.OQ_FORM_ID || 1);
const DOCS = process.env.DOCS || "Docs/docfx/articles";
const FILES = process.argv.slice(2).length ? process.argv.slice(2) : ["oqtane-after-submit-script.md"];

function fences(md) {
  const out = [];
  const re = /```csharp\r?\n([\s\S]*?)```/g;
  let m, i = 0;
  while ((m = re.exec(md)) !== null) {
    out.push({ index: ++i, line: md.slice(0, m.index).split("\n").length, code: m[1] });
  }
  return out;
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);
await page.locator('input[id*="Username" i], input[name*="username" i], #Username').first().fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button:has-text("Login"), input[type="submit"][value*="Login" i]').first().click();
await page.waitForFunction(() => !/\/login/i.test(location.pathname) || /logout/i.test(document.body?.innerText || ""),
                           null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(2500);

let total = 0, ok = 0;
const failures = [];

for (const file of FILES) {
  const full = path.join(DOCS, file);
  if (!fs.existsSync(full)) { console.log(`SKIP ${file} (missing)`); continue; }
  const list = fences(fs.readFileSync(full, "utf8"));
  for (const f of list) {
    total++;
    const res = await page.evaluate(async ([formId, source]) => {
      const headers = { "Content-Type": "application/json" };
      const xsrf = document.cookie.split("; ").find((c) => c.startsWith("CSRF-TOKEN="));
      if (xsrf) headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrf.split("=")[1]);
      const r = await fetch("/api/MegaFormPopup/FormScript/Validate", {
        method: "POST", headers, credentials: "include",
        body: JSON.stringify({ formId, source }),
      });
      const t = await r.text();
      try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 200) }; }
    }, [FORM_ID, f.code]);

    const errs = (res.json?.diagnostics || []).filter((d) => d.severity === "error");
    if (res.json?.success === true && errs.length === 0) { ok++; continue; }
    failures.push({
      file, fence: f.index, docLine: f.line,
      first: errs[0] ? `${errs[0].code} ${errs[0].message}`.slice(0, 150) : `HTTP ${res.status} ${res.text || ""}`,
      head: f.code.split("\n").filter((l) => l.trim())[0]?.slice(0, 80) || "",
    });
  }
  console.log(`${file}: ${list.length} csharp fences`);
}

console.log(`\n=== ${ok}/${total} samples compile on a live Oqtane site ===`);
for (const f of failures) {
  console.log(`\n  ${f.file} fence #${f.fence} (line ~${f.docLine})`);
  console.log(`    starts: ${f.head}`);
  console.log(`    error : ${f.first}`);
}
await browser.close();
process.exit(failures.length ? 1 : 0);
