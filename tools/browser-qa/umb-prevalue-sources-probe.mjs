// ============================================================================
//  Does the PrevalueSource catalog actually work? It has never been run.
//
//  Exercises the whole round trip from the backoffice's own session: List, Save a
//  textfile source, Test it, read Options, then Delete. Anything that answers HTML
//  or 404 is reported with its status, because a catalog nobody has called is a
//  catalog whose first caller finds the bugs.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS
//  Run: node tools/browser-qa/umb-prevalue-sources-probe.mjs
// ============================================================================
import { chromium } from "playwright";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const API = "/umbraco/MegaForm/MegaFormApi/PrevalueSources";

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const page = await browser.newContext({ viewport: { width: 1400, height: 900 } }).then((c) => c.newPage());
await umbLogin(page, { base: BASE, user: USER, pass: PASS });

const call = (path, init) =>
  page.evaluate(async ([p, i]) => {
    const res = await fetch(p, i ? { ...i, headers: { "Content-Type": "application/json", ...(i.headers || {}) } } : undefined);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { status: res.status, ct: res.headers.get("content-type") || "", body };
  }, [path, init]);

const out = {};
out.list = await call(`${API}/List`);

// A textfile source needs a file the provider can read; write one through the host's
// own wwwroot is not possible from here, so probe the SQL provider against the same
// database the builder's DB Tables screen already lists.
const sqlSource = {
  name: "QA probe — departments",
  type: "sql",
  cacheMinutes: 0,
  // Property names come from SqlDatabasePrevalueProvider.Settings: connectionKey + sql.
  settingsJson: JSON.stringify({
    connectionKey: "DashboardDatabase",
    sql: "SELECT Id AS value, Name AS label FROM MF_DemoDepartments",
  }),
};
out.saveSql = await call(`${API}/Save`, { method: "POST", body: JSON.stringify(sqlSource) });
const savedId = out.saveSql?.body?.id;
out.test = await call(`${API}/Test`, { method: "POST", body: JSON.stringify(sqlSource) });
if (savedId) {
  out.options = await call(`${API}/Options/${savedId}`);
  out.get = await call(`${API}/Get/${savedId}`);
  out.delete = await call(`${API}/Delete/${savedId}`, { method: "POST" });
}
out.listAfter = await call(`${API}/List`);

// Which provider names does the registry answer to? The Save above guesses "sql".
out.providers = await call(`${API}/Providers`);

console.log(JSON.stringify(out, null, 1));
await browser.close();
