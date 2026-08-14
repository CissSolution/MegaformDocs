import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DNN_BASE_URL || "https://dnndefender.com";
const USERNAME = process.env.DNN_USER || "host";
const PASSWORD = process.env.DNN_PASSWORD;
const ROOT_TAB_ID = Number(process.env.MEGAFORM_ROOT_TAB_ID || 1450);
const ROOT_TARGETS = process.env.MEGAFORM_ROOT_TAB_IDS
  ? process.env.MEGAFORM_ROOT_TAB_IDS.split(",")
      .map((value) => ({ type: "tab", value: Number(value.trim()) }))
      .filter((item) => item.value)
  : (process.env.MEGAFORM_ROOT_PATHS || "/MegaForm,/MegaFormContinue")
      .split(",")
      .map((value) => ({ type: "path", value: value.trim() }))
      .filter((item) => item.value);
const AUTH_MODE = process.argv.includes("--login") || process.env.MEGAFORM_QA_AUTH === "login" ? "login" : "logout";
const OUT_DIR =
  process.env.MEGAFORM_QA_OUT ||
  path.resolve("qa", `dnn-live-megaform-01113-${AUTH_MODE}-${new Date().toISOString().replace(/[:.]/g, "-")}`);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fileSafe(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

function summarizeFailures(results) {
  return results.filter(
    (item) =>
      item.status >= 400 ||
      item.hasCriticalError ||
      !item.hasAperture ||
      !item.hasDemoInfo ||
      !item.hasForm ||
      !item.layoutNotShrunk ||
      !item.sideBySide,
  );
}

async function waitSoft(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function inspectPage(page, tabId, titleHint = "") {
  let response = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await page.goto(`${BASE_URL}/Default.aspx?tabid=${tabId}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1500 * attempt);
    }
  }
  if (lastError) throw lastError;
  await waitSoft(page);

  const data = await page.evaluate(() => {
    const q = (selector) => document.querySelector(selector);
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const text = document.body?.innerText || "";
    const links = Array.from(document.querySelectorAll('link[href], script[src]'))
      .map((el) => el.getAttribute("href") || el.getAttribute("src") || "")
      .join("\n");
    const demo = q(".mf-demo-info");
    const form = q('[id^="mf-form-wrapper-"], .mf-form-wrapper');
    const row = q(".aperture-row");
    const leftPane = q("#dnn_LeftPane, #LeftPane, [id$='_LeftPane']");
    const contentPane = q("#dnn_ContentPane, #ContentPane, [id$='_ContentPane']");
    const leftRect = rectOf(leftPane || demo);
    const contentRect = rectOf(contentPane || form);
    const formRect = rectOf(form);
    const demoRect = rectOf(demo);
    const rowRect = rectOf(row);
    const minExpectedRowWidth = Math.min(900, Math.round(window.innerWidth * 0.72));
    const sameRow =
      demoRect &&
      formRect &&
      Math.abs((demoRect.top || 0) - (formRect.top || 0)) < 120 &&
      formRect.left > demoRect.right;
    return {
      title: document.title,
      finalUrl: location.href,
      hasAperture: Boolean(q(".aperture-theme")) || /Skins\/Aperture/i.test(links),
      hasAcme: /skins\/acmeskin/i.test(links),
      hasDemoInfo: Boolean(demo),
      hasForm: Boolean(form),
      hasCriticalError: /critical error has occurred|could not load skin|error loading module/i.test(text),
      bodySnippet: text.slice(0, 400),
      demoRect,
      formRect,
      rowRect,
      leftRect,
      contentRect,
      layoutNotShrunk: Boolean(rowRect && rowRect.width >= minExpectedRowWidth),
      sideBySide: Boolean(sameRow),
    };
  });

  return {
    tabId,
    titleHint,
    status: response?.status() || 0,
    ...data,
  };
}

function rootUrl(target) {
  if (target.type === "tab") return `${BASE_URL}/Default.aspx?tabid=${target.value}`;
  return `${BASE_URL}${target.value.startsWith("/") ? "" : "/"}${target.value}`;
}

function rootLabel(target) {
  return target.type === "tab" ? `tab-${target.value}` : fileSafe(target.value);
}

async function collectRootLinks(page, target) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(rootUrl(target), {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1500 * attempt);
    }
  }
  if (lastError) throw lastError;
  await waitSoft(page);
  const rootInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="tabid="]'));
    const items = links
      .map((a) => {
        const href = a.getAttribute("href") || "";
        const match = href.match(/[?&]tabid=(\d+)/i);
        return match ? { tabId: Number(match[1]), title: (a.textContent || "").trim(), href } : null;
      })
      .filter(Boolean)
      .filter((item) => item.tabId && item.tabId !== Number(new URL(location.href).searchParams.get("tabid") || 0));
    const seen = new Set();
    return {
      title: document.title,
      finalUrl: location.href,
      items: items.filter((item) => {
        if (seen.has(item.tabId)) return false;
        seen.add(item.tabId);
        return true;
      }),
      hasAperture: Boolean(document.querySelector(".aperture-theme")),
      hasRootIndex: /MegaForm Demo Library/i.test(document.body?.innerText || ""),
    };
  });
  return { ...rootInfo, target };
}

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function login(page) {
  if (!PASSWORD) {
    throw new Error("Set DNN_PASSWORD before running login QA.");
  }
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
  const loggedIn = await page.evaluate(() => /Logout|SuperUser Account/i.test(document.body?.innerText || ""));
  if (!loggedIn) throw new Error("Login QA did not reach a host session.");
}

function writeReport({ rootInfo, desktopResults, mobileResults, screenshots }) {
  const failures = summarizeFailures(desktopResults);
  const mobileFailures = mobileResults.filter((item) => item.status >= 400 || item.hasCriticalError || !item.hasAperture || !item.hasDemoInfo || !item.hasForm);
  const report = {
    baseUrl: BASE_URL,
    authMode: AUTH_MODE,
    rootTabId: ROOT_TAB_ID,
    rootTargets: ROOT_TARGETS,
    outDir: OUT_DIR,
    rootInfo,
    desktop: {
      checked: desktopResults.length,
      failures,
    },
    mobile: {
      checked: mobileResults.length,
      failures: mobileFailures,
    },
    screenshots,
  };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2), "utf8");

  const md = [
    "# DNN MegaForm 01.07.113 Visual QA",
    "",
    `Base URL: ${BASE_URL}`,
    `Auth mode: ${AUTH_MODE}`,
    `Root targets: ${ROOT_TARGETS.map((target) => `${target.type}:${target.value}`).join(", ")}`,
    `Desktop pages checked: ${desktopResults.length}`,
    `Desktop failures: ${failures.length}`,
    `Mobile sample pages checked: ${mobileResults.length}`,
    `Mobile failures: ${mobileFailures.length}`,
    "",
    "## Screenshots",
    ...screenshots.map((shot) => `- ${path.basename(shot.file)}: ${shot.label}`),
    "",
    "## Desktop Results",
    ...desktopResults.map((item) => `- Tab ${item.tabId}: ${item.hasAperture ? "Aperture" : "NO_APERTURE"}, demo=${item.hasDemoInfo}, form=${item.hasForm}, sideBySide=${item.sideBySide}, wide=${item.layoutNotShrunk}, status=${item.status}, ${item.titleHint || item.title}`),
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "report.md"), md, "utf8");
  return report;
}

async function main() {
  ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true, args: ["--disable-http2"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 920 } });
  const page = await context.newPage();
  const screenshots = [];

  try {
    if (AUTH_MODE === "login") {
      await login(page);
    }
    const roots = [];
    let pages = [];
    const seenPages = new Set();
    for (const target of ROOT_TARGETS) {
      const info = await collectRootLinks(page, target);
      roots.push(info);
      screenshots.push({
        label: `Root index desktop ${target.type}:${target.value}`,
        file: await screenshot(page, `root-${rootLabel(target)}-desktop`),
      });
      for (const item of info.items) {
        if (seenPages.has(item.tabId)) continue;
        seenPages.add(item.tabId);
        pages.push({ ...item, root: target });
      }
    }
    const rootInfo = { roots, items: pages };
    if (pages.length === 0) {
      pages = Array.from({ length: 33 }, (_, index) => ({ tabId: ROOT_TAB_ID + index + 1, title: `Template ${index + 1}` }));
    }

    const desktopResults = [];
    for (const item of pages) {
      const result = await inspectPage(page, item.tabId, item.title);
      desktopResults.push(result);
      if (desktopResults.length <= 3 || desktopResults.length === pages.length || !result.sideBySide || !result.hasForm) {
        screenshots.push({
          label: `Desktop Tab ${item.tabId} ${item.title}`,
          file: await screenshot(page, `desktop-${item.tabId}-${fileSafe(item.title)}`),
        });
      }
    }

    await page.setViewportSize({ width: 390, height: 900 });
    const samplePages = [pages[0], pages[Math.floor(pages.length / 2)], pages[pages.length - 1]].filter(Boolean);
    const mobileResults = [];
    for (const item of samplePages) {
      const result = await inspectPage(page, item.tabId, item.title);
      mobileResults.push(result);
      screenshots.push({
        label: `Mobile Tab ${item.tabId} ${item.title}`,
        file: await screenshot(page, `mobile-${item.tabId}-${fileSafe(item.title)}`),
      });
    }

    const report = writeReport({ rootInfo, desktopResults, mobileResults, screenshots });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
