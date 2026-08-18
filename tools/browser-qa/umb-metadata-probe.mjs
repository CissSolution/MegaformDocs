// ============================================================================
//  What can a backoffice element ask Umbraco for, to build REAL pickers?
//
//  Umbraco Forms' own prevalue source editor never asks anyone to type an alias:
//  Root node is a picker, Document type is a list, and Value field is a list of the
//  standard fields plus that document type's own properties. To do the same, the
//  MegaForm screen needs the same metadata — this probe calls the candidate
//  management-API endpoints with the backoffice's token and prints what each one
//  actually returns, so the picker is built against measured shapes, not guesses.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS
//  Run: node tools/browser-qa/umb-metadata-probe.mjs
// ============================================================================
import { chromium } from "playwright";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const page = await browser.newContext({ viewport: { width: 1400, height: 900 } }).then((c) => c.newPage());
await umbLogin(page, { base: BASE, user: USER, pass: PASS });
// Mount a MegaForm element so the auth context reaches the helper we borrow the token from.
await page.evaluate(() => { history.pushState({}, "", "/umbraco/section/megaform"); dispatchEvent(new PopStateEvent("popstate")); });
await page.waitForTimeout(4000);

const out = await page.evaluate(async () => {
  const mod = await import("/App_Plugins/MegaForm/backoffice/contexts/megaform-permissions-context.js");
  const get = async (url) => {
    const res = await mod.mfFetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 120); }
    const shape = (o) => {
      if (Array.isArray(o)) return { count: o.length, first: o[0] ? Object.keys(o[0]) : [], sample: o[0] };
      if (o && typeof o === "object") return { keys: Object.keys(o), items: Array.isArray(o.items) ? { count: o.items.length, first: o.items[0] ? Object.keys(o.items[0]) : [], sample: o.items[0] } : undefined };
      return o;
    };
    return { status: res.status, shape: shape(body) };
  };
  return {
    dataTypeTree: await get("/umbraco/management/api/v1/tree/data-type/root?skip=0&take=5"),
    documentTypeTree: await get("/umbraco/management/api/v1/tree/document-type/root?skip=0&take=5"),
    documentTree: await get("/umbraco/management/api/v1/tree/document/root?skip=0&take=5"),
    // MegaForm's own allow-listed SQL connections (never connection strings).
    sqlConnections: await get("/umbraco/MegaForm/MegaFormApi/AiTools/SqlConnections"),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
