// Clear the DNN cache after writing HtmlText straight into the database.
//
// The HTML module caches its content per module, so a row written outside DNN's own save path is
// invisible until the cache drops. This reuses the login/fetch shape from tools/dnn_live_sql.mjs,
// which is known to work against this site -- dnn-api-call.mjs sends TabId:-1 and dies at the
// network layer with "Failed to fetch", which reads like an outage rather than a bad header.
import { chromium } from "playwright";

const BASE = process.env.DNN_BASE_URL || "https://dnndefender.com";
const USER = process.env.DNN_USER || "host";
const PASS = process.env.DNN_PASSWORD;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.locator("#dnn_ctr_Login_Login_DNN_txtUsername").fill(USER);
await page.locator("#dnn_ctr_Login_Login_DNN_txtPassword").fill(PASS);
await Promise.all([
  page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {}),
  page.locator("#dnn_ctr_Login_Login_DNN_cmdLogin").click(),
]);
await page.waitForFunction(() => /Logout/i.test(document.body?.innerText || ""), null, { timeout: 60000 });

const session = await page.evaluate(() => ({
  token: document.querySelector('input[name="__RequestVerificationToken"]')?.value || "",
  tabId: window.dnn?.getVar?.("sf_tabId", "-1") || "-1",
}));
const cookieHeader = (await ctx.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join("; ");

// Candidates, most likely first. The Persona Bar route shape is /API/personaBar/<Controller>/<Action>.
const CANDIDATES = [
  ["POST", "/API/PersonaBar/Server/ClearCache"],
  ["POST", "/API/PersonaBar/ServerSettings/ClearCache"],
  ["POST", "/API/PersonaBar/Servers/ClearCache"],
  ["GET",  "/API/PersonaBar/Server/ClearCache"],
];

for (const [method, path] of CANDIDATES) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Cookie: cookieHeader,
        RequestVerificationToken: session.token,
        TabId: String(session.tabId || ""),
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/json; charset=UTF-8",
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    const body = (await r.text()).slice(0, 200);
    console.log(`${method} ${path} -> ${r.status} ${body}`);
    if (r.ok) { console.log("CLEARED"); break; }
  } catch (e) {
    console.log(`${method} ${path} -> threw ${e.message}`);
  }
}

await browser.close();
