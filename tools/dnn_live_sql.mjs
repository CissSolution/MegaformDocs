import fs from "node:fs";
import { chromium } from "playwright";

const BASE_URL = process.env.DNN_BASE_URL || "https://dnndefender.com";
const USERNAME = process.env.DNN_USER || "host";
const PASSWORD = process.env.DNN_PASSWORD;
const SQL_FILE = process.argv[2];

if (!PASSWORD) {
  throw new Error("Set DNN_PASSWORD before running this script.");
}

function parseMaybeJson(text) {
  let value = text;
  for (let i = 0; i < 3 && typeof value === "string"; i += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  return value;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loginAndGetSession() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/?ctl=Login&returnurl=%2f`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator("#dnn_ctr_Login_Login_DNN_txtUsername").fill(USERNAME);
  await page.locator("#dnn_ctr_Login_Login_DNN_txtPassword").fill(PASSWORD);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {}),
    page.locator("#dnn_ctr_Login_Login_DNN_cmdLogin").click(),
  ]);
  await page.waitForTimeout(1500);

  const session = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const token =
      document.querySelector('input[name="__RequestVerificationToken"]')?.value ||
      window.jQuery?.ServicesFramework?.(-1)?.getAntiForgeryValue?.() ||
      "";
    const tabId = window.dnn?.getVar?.("sf_tabId", "-1") || "-1";
    return { loggedIn: /Logout|SuperUser Account/i.test(text), token, tabId };
  });
  if (!session.loggedIn) {
    throw new Error("Login did not reach a host session.");
  }
  if (!session.token) {
    throw new Error("Could not find DNN request verification token.");
  }

  const cookies = await context.cookies(BASE_URL);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return { browser, session, cookieHeader };
}

async function apiFetch(cookieHeader, session, endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Cookie: cookieHeader,
      RequestVerificationToken: session.token,
      TabId: String(session.tabId || "-1"),
      "X-Requested-With": "XMLHttpRequest",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const parsed = parseMaybeJson(text);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 1200)}`);
  }
  return parsed;
}

function compactData(data) {
  if (!Array.isArray(data)) return data;
  return data.map((table) => ({
    columns: table.Columns || table.columns || table.Header || table.header,
    rows: (table.Rows || table.rows || table.Data || table.data || []).slice(0, 80),
    rowCount: (table.Rows || table.rows || table.Data || table.data || []).length,
  }));
}

async function main() {
  const query = (SQL_FILE ? fs.readFileSync(SQL_FILE, "utf8") : await readStdin()).replace(/^\uFEFF/, "");
  if (!query.trim()) {
    throw new Error("No SQL supplied.");
  }

  const { browser, session, cookieHeader } = await loginAndGetSession();
  try {
    const saved = await apiFetch(cookieHeader, session, "/API/personaBar/SqlConsole/GetSavedQueries", {
      method: "GET",
    });
    const connection = saved.connections?.[0] || saved.Connections?.[0] || "";
    if (!connection) {
      throw new Error(`Could not resolve SQL connection from ${JSON.stringify(saved).slice(0, 500)}`);
    }

    const result = await apiFetch(cookieHeader, session, "/API/personaBar/SqlConsole/RunQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ connection, query }),
    });
    if (process.env.DNN_SQL_RAW === "1") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(JSON.stringify({
        ok: true,
        hasData: Boolean(result.Data || result.data),
        data: compactData(result.Data || result.data),
        message: result.Message || result.message || null,
      }, null, 2));
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
