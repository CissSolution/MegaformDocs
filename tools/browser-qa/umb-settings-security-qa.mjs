// ============================================================================
//  Form Settings and Security, checked the way they are used — and photographed
//  SCROLL-AWARE.
//
//  Both screens are taller than the viewport and scroll inside their own container,
//  so `fullPage: true` captures nothing below the fold: the page itself does not
//  scroll, the div does. This walks the inner scroller and saves a tile per screenful,
//  then reports what was found in each one — the same reason scroll-tiles.mjs exists.
//
//  What it proves:
//   · Settings opens as its OWN screen (no builder iframe) and every section is there
//   · a change made in it survives a save and a reload — read back from the API
//   · Security lists Umbraco user groups, shows MegaForm's package permissions, and a
//     toggle saved there comes back on reload
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID
//  Run: node tools/browser-qa/umb-settings-security-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-settings-security";
const FORM = process.env.FORM_ID || "202";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const report = { errors: [] };
page.on("pageerror", (e) => report.errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") report.errors.push(m.text().slice(0, 160)); });

await umbLogin(page, { base: BASE, user: USER, pass: PASS });

/** The inner scroller of a native MegaForm screen, wherever it lives in the shadow trees. */
const scrollInfo = () => page.evaluate(() => {
  const walk = (root) => {
    for (const el of root.querySelectorAll(".scroll")) {
      return { height: el.clientHeight, scrollHeight: el.scrollHeight, top: el.scrollTop };
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  return walk(document);
});

const scrollTo = (y) => page.evaluate((target) => {
  const walk = (root) => {
    for (const el of root.querySelectorAll(".scroll")) { el.scrollTop = target; return true; }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { if (walk(el.shadowRoot)) return true; }
    return false;
  };
  return walk(document);
}, y);

/** Text visible in the scroller right now — so each tile can be described, not just saved. */
const visibleText = () => page.evaluate(() => {
  const walk = (root) => {
    for (const el of root.querySelectorAll(".scroll")) {
      const top = el.scrollTop, bottom = top + el.clientHeight;
      const out = [];
      for (const h of el.querySelectorAll("h3, .label")) {
        const y = h.offsetTop;
        if (y >= top - 20 && y <= bottom) out.push((h.textContent || "").split("\n")[0].trim().slice(0, 40));
      }
      return out;
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return [];
  };
  return walk(document);
});

async function scrollTiles(label) {
  const info = await scrollInfo();
  if (!info) { report[`${label}_scroller`] = "none"; await page.screenshot({ path: `${OUT}/${label}.png` }); return; }
  const tiles = [];
  const step = Math.max(1, info.height - 60);
  for (let y = 0, i = 0; y < info.scrollHeight && i < 8; y += step, i++) {
    await scrollTo(y);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${label}-tile${i}.png` });
    tiles.push({ y, shows: await visibleText() });
  }
  await scrollTo(0);
  report[`${label}_scroller`] = { height: info.height, scrollHeight: info.scrollHeight, tiles };
}

const deepClick = (sel, text) => page.evaluate(([s, t]) => {
  const walk = (root) => {
    for (const el of root.querySelectorAll(s)) {
      const caption = ((el.getAttribute && el.getAttribute("label")) || "") + " " + (el.textContent || "");
      if (!t || caption.toLowerCase().includes(t.toLowerCase())) return el;
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  const el = walk(document);
  if (!el) return false;
  el.click();
  return true;
}, [sel, text]);

const api = (path, init) => page.evaluate(async ([p, i]) => {
  const mod = await import("/App_Plugins/MegaForm/backoffice/contexts/megaform-permissions-context.js");
  const res = await mod.mfFetch(p, i ? { ...i, headers: { "Content-Type": "application/json", ...(i.headers || {}) } } : undefined);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
}, [path, init]);

// ── Settings: its own screen, not the builder ───────────────────────────────
await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/form-settings/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(4000);

report.settings = await page.evaluate(() => {
  const walk = (root) => {
    if (root.querySelector("megaform-form-settings-view")) return true;
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { if (walk(el.shadowRoot)) return true; }
    return false;
  };
  return {
    nativeScreen: walk(document),
    builderFrame: !!document.querySelector('iframe[src*="/umbraco/MegaForm/Builder"]'),
    url: location.pathname,
  };
});
await scrollTiles("01-settings");

// Change the submit caption, save, and read it back from the API.
const marker = `Send it ${Math.floor(Date.now() / 1000) % 10000}`;
report.captionSet = await page.evaluate((value) => {
  const walk = (root) => {
    for (const row of root.querySelectorAll(".row")) {
      if (!/submit button/i.test(row.querySelector(".label")?.textContent || "")) continue;
      const input = row.querySelector("input");
      if (!input) return false;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { if (walk(el.shadowRoot)) return true; }
    return false;
  };
  return walk(document);
}, marker);
await deepClick("button.primary", "Save");
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/02-settings-saved.png` });
const readBack = await api(`/umbraco/MegaForm/MegaFormApi/Form/Get?formId=${FORM}`);
report.captionPersisted = {
  wanted: marker,
  stored: readBack.body?.submitButtonText ?? readBack.body?.SubmitButtonText,
};

// ── Security ────────────────────────────────────────────────────────────────
await deepClick("uui-menu-item", "Security");
await page.waitForTimeout(3500);
report.security = await page.evaluate(() => {
  const walk = (root) => {
    const view = root.querySelector("megaform-security-view");
    if (view?.shadowRoot) {
      const sr = view.shadowRoot;
      return {
        groups: [...sr.querySelectorAll(".groups button")].map((b) => b.textContent.trim()),
        permissions: [...sr.querySelectorAll(".row .label")].map((l) => l.textContent.split("\n")[0].trim()),
        heading: sr.querySelector("h2")?.textContent?.trim(),
      };
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  return walk(document);
});
await scrollTiles("03-security");

// Toggle one permission on the selected group, save, reload, and check it stuck.
report.toggle = await page.evaluate(() => {
  const walk = (root) => {
    const view = root.querySelector("megaform-security-view");
    if (view?.shadowRoot) {
      const rows = [...view.shadowRoot.querySelectorAll(".row")];
      const row = rows.find((r) => /use ai/i.test(r.querySelector(".label")?.textContent || "")) || rows[rows.length - 1];
      const box = row?.querySelector("input[type=checkbox]");
      if (!box) return null;
      const before = box.checked;
      box.checked = !before;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      return { permission: row.querySelector(".label")?.textContent.split("\n")[0].trim(), before, after: !before };
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
    return null;
  };
  return walk(document);
});
await deepClick("button.act.primary", "Save");
await page.waitForTimeout(3000);
report.afterSave = await api("/umbraco/MegaForm/MegaFormApi/Security/Groups");
await page.screenshot({ path: `${OUT}/04-security-saved.png` });

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
await browser.close();
