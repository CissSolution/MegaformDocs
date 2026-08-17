// ============================================================================
//  End-to-end QA for the after-submit C# hook on Oqtane.
//
//  Everything here runs against a live site through a real host session. The
//  point is to answer questions that reading source cannot:
//
//    1. Does Type.GetType("...,MegaForm.Scripting") resolve on Oqtane? The
//       assembly has no "Oqtane" in its name, so Oqtane's module scan does not
//       load it, and the server DLL references it only by reflection, so it is
//       not in the deps.json graph either.
//    2. Does MegaForm.Core land in the compiler's reference set? Oqtane loads
//       module assemblies from a byte[], and Assembly.Location is "" for those.
//    3. Does a saved script actually RUN when a submission arrives, and does
//       its side effect reach the database?
//
//  Uses Playwright with its own Chromium: oq-drive.mjs steers the machine's
//  Chrome over CDP and dies whenever a real browser window is already open.
//
//  Env: OQ_BASE, OQ_USER, OQ_PASS, OQ_FORM_ID
//  Run: node tools/browser-qa/oq-scripting-qa.mjs <probe|validate|save|submit|all>
// ============================================================================
import { chromium } from "playwright";

const BASE = process.env.OQ_BASE || "http://localhost:5131";
const USER = process.env.OQ_USER || "host";
const PASS = process.env.OQ_PASS || "abc@ABC1024";
const FORM_ID = Number(process.env.OQ_FORM_ID || 1);
const STEP = process.argv[2] || "all";

// The demo script: ordinary C#, ordinary ADO.NET, no MegaForm-specific plumbing.
// This is the shape the documentation teaches, so it is the shape QA has to prove.
const DEMO_SCRIPT = `using System;
using Microsoft.Data.SqlClient;

// The connection string is the host's own. ctx carries the submission, not a database
// handle -- there is no ctx.Db to reach for, by design.
const string cs = "Server=.\\\\SQLEXPRESS;Database=Oqtane_MegaForm_KB20812;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=False;";

using (var cn = new SqlConnection(cs))
{
    cn.Open();
    using (var cmd = cn.CreateCommand())
    {
        cmd.CommandText =
            "INSERT INTO MF_QA_ScriptLog (SubmissionId, FormId, Email, Subject, RanAtUtc) " +
            "VALUES (@s, @f, @e, @j, @t)";
        cmd.Parameters.AddWithValue("@s", ctx.SubmissionId);
        cmd.Parameters.AddWithValue("@f", ctx.FormId);
        cmd.Parameters.AddWithValue("@e", (object)ctx.GetString("email") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@j", (object)ctx.GetString("subject") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@t", ctx.UtcNow);
        cmd.ExecuteNonQuery();
    }
}

ctx.Log("wrote MF_QA_ScriptLog row for submission " + ctx.SubmissionId);
ctx.SetVariable("qaRow", "written");`;

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx0.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);
await page.locator('input[id*="Username" i], input[name*="username" i], #Username').first().fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button:has-text("Login"), input[type="submit"][value*="Login" i]').first().click();
await page.waitForFunction(() => !/\/login/i.test(location.pathname) || /logout/i.test(document.body?.innerText || ""),
                           null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log("host session:", /logout/i.test(await page.evaluate(() => document.body?.innerText || "")));

async function api(method, path, body) {
  return page.evaluate(async ([m, p, b]) => {
    const headers = { "Content-Type": "application/json" };
    const xsrf = document.cookie.split("; ").find((c) => c.startsWith("CSRF-TOKEN="));
    if (xsrf) headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrf.split("=")[1]);
    const r = await fetch(p, { method: m, headers, credentials: "include", ...(b ? { body: JSON.stringify(b) } : {}) });
    const t = await r.text();
    try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 500) }; }
  }, [method, path, body || null]);
}
const show = (label, r) => console.log(`\n=== ${label} ===\n${JSON.stringify(r).slice(0, 1100)}`);

if (STEP === "probe" || STEP === "all") {
  show(`FormScript/Get/${FORM_ID}`, await api("GET", `/api/MegaFormPopup/FormScript/Get/${FORM_ID}`));
}

if (STEP === "validate" || STEP === "all") {
  // Which SqlClient binds is a fact the documentation must state, not guess: the Oqtane server
  // carries Microsoft.Data.SqlClient, and System.Data.SqlClient is not part of net10.0.
  for (const ns of ["Microsoft.Data.SqlClient", "System.Data.SqlClient"]) {
    const r = await api("POST", "/api/MegaFormPopup/FormScript/Validate",
                        { formId: FORM_ID, source: `using ${ns};\nctx.Log("probe");` });
    const errs = (r.json?.diagnostics || []).filter((d) => d.severity === "error");
    console.log(`  using ${ns.padEnd(26)} -> ${r.json?.success ? "BINDS" : "fails: " + (errs[0]?.code + " " + errs[0]?.message).slice(0, 90)}`);
  }
  show("Validate (the demo script)", await api("POST", "/api/MegaFormPopup/FormScript/Validate",
                                               { formId: FORM_ID, source: DEMO_SCRIPT }));
}

// RoslynScriptCompiler pins CSharpParseOptions to LanguageVersion.CSharp7_3 for every target, not
// only the net472 one. On a net10.0 host that is surprising enough to be worth measuring rather
// than asserting from the source.
if (STEP === "lang" || STEP === "all") {
  const probes = [
    ["C# 7.3 out var",        'if (int.TryParse("1", out var n)) ctx.Log(n.ToString());'],
    ["C# 8 switch expression", 'var s = ctx.FormId switch { 1 => "one", _ => "other" }; ctx.Log(s);'],
    ["C# 8 using declaration", 'using var d = new System.IO.MemoryStream(); ctx.Log("ok");'],
    ["C# 9 target-typed new",  'System.Text.StringBuilder sb = new(); ctx.Log("ok");'],
  ];
  console.log("\n=== language level actually accepted ===");
  for (const [label, src] of probes) {
    const r = await api("POST", "/api/MegaFormPopup/FormScript/Validate", { formId: FORM_ID, source: src });
    const e = (r.json?.diagnostics || []).find((d) => d.severity === "error");
    console.log(`  ${label.padEnd(26)} ${r.json?.success ? "accepted" : "REJECTED " + e?.code + " " + (e?.message || "").slice(0, 70)}`);
  }
}

if (STEP === "save" || STEP === "all") {
  show("Save (enabled)", await api("POST", "/api/MegaFormPopup/FormScript/Save",
    { formId: FORM_ID, source: DEMO_SCRIPT, enabled: true, onFailure: "continue", timeoutSeconds: 10 }));
}

// TestRun executes the script directly, bypassing the submit pipeline. Running it separately is
// what tells "the compiler and runner are broken" apart from "the submit path never calls them" --
// the two failures look identical from the outside, because every early return in
// SubmissionProcessor.RunAutomationStage is silent.
if (STEP === "testrun" || STEP === "all") {
  show("TestRun", await api("POST", "/api/MegaFormPopup/FormScript/TestRun", {
    formId: FORM_ID, source: DEMO_SCRIPT,
    sampleData: { email: "testrun@example.com", subject: "TestRun direct execution" },
  }));
}

if (STEP === "submit" || STEP === "all") {
  const stamp = Date.now();
  const data = {
    first_name: "Oqtane", last_name: "QA",
    email: `oqtane-qa-${stamp}@example.com`,
    phone: "+61 400 000 000",
    subject: `after-submit script QA ${stamp}`,
    message: "Submitted by tools/browser-qa/oq-scripting-qa.mjs to prove the hook runs.",
    contact_reason: "support", preferred_contact: "email", terms: true,
  };
  // submissionTime MATTERS. Left at 0 the heuristic scores the post as robotic (measured: 55,
  // over the threshold), sets IsSpam and skips the whole post-commit branch -- workflow, notify
  // and the script -- while still inserting the row and answering the caller with HTTP 200 and
  // "Thank you! Your message has been sent successfully." A QA run that omits it concludes the
  // script is broken, and every signal it can see agrees with that wrong conclusion.
  const r = await api("POST", "/api/MegaForm/Submit/Post",
                      { formId: FORM_ID, data, submissionTime: 32.5 });
  show("Submit/Post", r);
  console.log(`\nsubmitted subject: after-submit script QA ${stamp}`);
  console.log(`submissionId: ${r.json?.submissionId} -- now check MF_QA_ScriptLog AND MF_Submissions.IsSpam`);
}

await browser.close();
