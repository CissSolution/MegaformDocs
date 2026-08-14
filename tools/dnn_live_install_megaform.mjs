import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DNN_BASE_URL || "https://dnndefender.com";
const USERNAME = process.env.DNN_USER || "host";
const PASSWORD = process.env.DNN_PASSWORD;
const ZIP_PATH =
  process.env.MEGAFORM_DNN_ZIP ||
  "E:\\DNNDEFENDER AND AI DESIGNES\\AI DESIGNES\\MegaFormSolution_280_Oqtane_um\\MegaForm.DNN\\Install\\MegaForm_01.07.113_Install.zip";
const ACTION = process.argv[2] || "probe";

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

function summarize(value) {
  if (value == null) return value;
  if (typeof value !== "object") return String(value).slice(0, 500);

  const pkg = value.Package || value.package || value.PackageInfo || value.packageInfo || {};
  return {
    keys: Object.keys(value).slice(0, 20),
    success: value.success ?? value.Success ?? value.IsValid ?? value.Valid,
    alreadyInstalled: value.AlreadyInstalled ?? value.alreadyInstalled,
    newPackageId: value.newPackageId ?? value.NewPackageId ?? value.PackageId,
    package: {
      name: pkg.Name ?? pkg.name,
      friendlyName: pkg.FriendlyName ?? pkg.friendlyName,
      version: pkg.Version ?? pkg.version,
      packageType: pkg.PackageType ?? pkg.packageType ?? pkg.Type,
    },
    errors: value.Errors ?? value.errors ?? value.Error ?? value.Message,
    logs: Array.isArray(value.logs)
      ? value.logs.slice(-12)
      : Array.isArray(value.Logs)
        ? value.Logs.slice(-12)
        : undefined,
  };
}

async function loginAndGetSession() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: false,
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

  // [LoginWait 2026-08-14] Was a flat waitForTimeout(1500). DNN's post-login redirect regularly
  // lands later than that on a cold app domain, so the check below read the still-unauthenticated
  // page and the whole run died with "Login did not reach a host session." even though the
  // credentials were fine. Poll for the condition instead of guessing how long it takes.
  const loggedIn = await page
    .waitForFunction(() => /Logout|Sign\s*Out|SuperUser Account/i.test(document.body?.innerText || ""), null, {
      timeout: 30000,
    })
    .then(() => true)
    .catch(() => false);
  if (!loggedIn) {
    throw new Error("Login did not reach a host session.");
  }

  const session = await page.evaluate(() => {
    const token =
      document.querySelector('input[name="__RequestVerificationToken"]')?.value ||
      window.jQuery?.ServicesFramework?.(-1)?.getAntiForgeryValue?.() ||
      "";
    const siteRoot = window.dnn?.getVar?.("sf_siteRoot", "/") || "/";
    const tabId = window.dnn?.getVar?.("sf_tabId", "-1") || "-1";
    return { token, siteRoot, tabId };
  });
  if (!session.token) {
    throw new Error("Could not find DNN request verification token.");
  }

  const cookies = await context.cookies(BASE_URL);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return { browser, context, page, session, cookieHeader };
}

async function apiFetch(cookieHeader, session, endpoint, options = {}) {
  const headers = {
    Cookie: cookieHeader,
    RequestVerificationToken: session.token,
    TabId: String(session.tabId || "-1"),
    "X-Requested-With": "XMLHttpRequest",
    ...(options.headers || {}),
  };
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const parsed = parseMaybeJson(text);
  return { status: response.status, ok: response.ok, parsed, text };
}

async function apiPostFile(cookieHeader, session, methodWithQuery) {
  const buffer = fs.readFileSync(ZIP_PATH);
  const form = new FormData();
  form.append(
    "POSTFILE",
    new Blob([buffer], { type: "application/zip" }),
    path.basename(ZIP_PATH),
  );
  return apiFetch(cookieHeader, session, `/API/personaBar/Extensions/${methodWithQuery}`, {
    method: "POST",
    body: form,
  });
}

async function main() {
  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`Zip not found: ${ZIP_PATH}`);
  }

  const { browser, session, cookieHeader } = await loginAndGetSession();
  try {
    console.log("LOGIN_OK", JSON.stringify({ tabId: session.tabId, tokenLength: session.token.length }));

    const packageTypes = await apiFetch(
      cookieHeader,
      session,
      "/API/personaBar/Extensions/GetInstalledPackages?packageType=Module",
      { method: "GET" },
    );
    console.log("INSTALLED_MODULES_STATUS", packageTypes.status);
    if (packageTypes.ok && packageTypes.parsed?.Results) {
      const mega = packageTypes.parsed.Results.filter((p) => /megaform/i.test(`${p.Name} ${p.FriendlyName}`));
      console.log("MEGAFORM_BEFORE", JSON.stringify(mega.map((p) => ({
        packageId: p.PackageId,
        name: p.Name,
        friendlyName: p.FriendlyName,
        version: p.Version,
        inUse: p.InUse,
      }))));
    } else {
      console.log("INSTALLED_MODULES_BODY", JSON.stringify(summarize(packageTypes.parsed)));
    }

    const parsed = await apiPostFile(cookieHeader, session, "ParsePackage");
    console.log("PARSE_STATUS", parsed.status);
    console.log("PARSE_BODY", JSON.stringify(summarize(parsed.parsed)));
    if (!parsed.ok) {
      throw new Error(`ParsePackage failed: HTTP ${parsed.status} ${parsed.text.slice(0, 500)}`);
    }

    if (ACTION === "install") {
      const installed = await apiPostFile(cookieHeader, session, "InstallPackage");
      console.log("INSTALL_STATUS", installed.status);
      console.log("INSTALL_BODY", JSON.stringify(summarize(installed.parsed)));
      if (!installed.ok) {
        throw new Error(`InstallPackage failed: HTTP ${installed.status} ${installed.text.slice(0, 800)}`);
      }

      const after = await apiFetch(
        cookieHeader,
        session,
        "/API/personaBar/Extensions/GetInstalledPackages?packageType=Module",
        { method: "GET" },
      );
      console.log("INSTALLED_MODULES_AFTER_STATUS", after.status);
      if (after.ok && after.parsed?.Results) {
        const mega = after.parsed.Results.filter((p) => /megaform/i.test(`${p.Name} ${p.FriendlyName}`));
        console.log("MEGAFORM_AFTER", JSON.stringify(mega.map((p) => ({
          packageId: p.PackageId,
          name: p.Name,
          friendlyName: p.FriendlyName,
          version: p.Version,
          inUse: p.InUse,
        }))));
      } else {
        console.log("INSTALLED_MODULES_AFTER_BODY", JSON.stringify(summarize(after.parsed)));
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("FAILED", error.stack || error.message || error);
  process.exit(1);
});
