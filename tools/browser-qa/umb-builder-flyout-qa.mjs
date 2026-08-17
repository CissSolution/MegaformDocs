// ============================================================================
//  Visual QA for the Umbraco-Forms-shaped builder: primary tabs, the secondary
//  gear toolbar, and the settings flyout that replaced the persistent right rail.
//
//  What it answers, per screenshot rather than per element count:
//   · does the builder fill the frame, or is there a dead band under the tabs?
//   · does each gear in the secondary toolbar open the flyout on the right pane?
//   · does the legacy (now hidden) tab strip still carry #mf-tab-link-* anchors?
//     Several panes only mount on a click of those anchors (print, workflow,
//     theme, db, rules), so if the strip is empty the pane opens blank.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID, VIEW_W, VIEW_H, HEADED
//  Run: node tools/browser-qa/umb-builder-flyout-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-builder-flyout";
const FORM = process.env.FORM_ID || "103";
const W = Number(process.env.VIEW_W || 1366);
const H = Number(process.env.VIEW_H || 768);
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[${m.location()?.url?.split("/").pop() || "?"}] ${m.text()}`.slice(0, 220));
});
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
// Full URLs, not just the last path segment: "Get?formId=103 404" names nothing.
const failed = [];
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(BASE, "")}`.slice(0, 180));
});

await umbLogin(page, { base: BASE, user: USER, pass: PASS });

// A full navigation would bounce through OIDC (token lives in memory), so drive the router.
await page.evaluate((form) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${form}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(1500);

// The builder runs in an iframe on the MegaForm MVC route, not in the backoffice SPA.
const frameHandle = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 });
const frame = await frameHandle.contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-builder-app"), null, { timeout: 90000 });
await page.waitForTimeout(4000);

const shot = async (name) => {
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p });
  return p;
};
await shot("01-builder-initial");

// ── Geometry: where the vertical space actually goes ────────────────────────
const geom = await frame.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left),
             right: Math.round(b.right), h: Math.round(b.height), w: Math.round(b.width),
             display: cs.display, position: cs.position };
  };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    scrollH: document.documentElement.scrollHeight,
    topbar: r(".w-topbar"),
    primaryBar: r("#mf-primary-bar"),
    secondaryToolbar: r(".mf-secondary-toolbar"),
    app: r("#mf-builder-app"),
    layout: r(".mf-layout"),
    panelLeft: r("#mf-panel-left"),
    canvas: r("#mf-canvas"),
    canvasFields: r("#mf-canvas-fields"),
    panelRight: r("#mf-panel-right"),
    reorderBtn: r("#mf-reorder-toggle,[data-mf-reorder]"),
  };
});

// ── DOM probes: is the hidden legacy strip still wired? ─────────────────────
const dom = await frame.evaluate(() => {
  const ids = ["field","widget","settings","steps","html","ai","embed","rules","perms","print","workflow","theme","db"];
  const strip = document.querySelector(".mf-right-tabs");
  return {
    rightTabsHtml: strip ? strip.innerHTML.slice(0, 160) : "(no .mf-right-tabs)",
    tabLinksPresent: ids.filter((i) => !!document.getElementById("mf-tab-link-" + i)),
    tabPanesPresent: ids.filter((i) => !!document.getElementById("mf-tab-" + i)),
    secondaryTools: [...document.querySelectorAll(".mf-secondary-tool")].map((b) => b.getAttribute("data-mf-secondary-tab")),
    primaryTabs: [...document.querySelectorAll(".mf-primary-tab")].map((b) => b.getAttribute("data-mf-primary-tab")),
    flyoutClass: document.getElementById("mf-panel-right")?.className || "(none)",
    hasDesignToggle: typeof window.MFDesignToggle === "function",
    hasActivateRightTab: typeof window.MFActivateRightTab === "function",
    bodyText: (document.body.innerText || "").includes("undefined") ? "BODY CONTAINS LITERAL 'undefined'" : "clean",
  };
});

// ── The gear ON a control: the gesture the flyout exists for ────────────────
// Done BEFORE the toolbar sweep: the Workflow tool replaces the whole builder with
// the BPMN editor, and a screenshot taken behind that overlay shows the wrong screen.
const gear = await frame.evaluate(() => {
  const btn = document.querySelector(".mf-canvas-item .mf-edit-field");
  if (!btn) return { clicked: false, why: "no .mf-edit-field on canvas" };
  btn.scrollIntoView({ block: "center" });
  btn.click();
  return { clicked: true };
});
await page.waitForTimeout(1400);
if (gear.clicked) {
  gear.state = await frame.evaluate(() => {
    const panel = document.getElementById("mf-panel-right");
    const b = panel?.getBoundingClientRect();
    return {
      open: !!panel?.classList.contains("mf-flyout-open"),
      width: b ? Math.round(b.width) : 0,
      title: document.querySelector(".mf-flyout-title")?.textContent?.trim() || "",
      visiblePanes: [...document.querySelectorAll(".mf-right-tab-content")]
        .filter((p) => getComputedStyle(p).display !== "none").map((p) => p.id),
      fieldPropsText: (document.getElementById("mf-field-props")?.innerText || "").replace(/\s+/g, " ").slice(0, 90),
    };
  });
}
await shot("gear-on-control");
await frame.evaluate(() => document.getElementById("mf-flyout-close")?.click());
await page.waitForTimeout(400);

// ── Click every gear in the secondary toolbar, photograph the result ────────
const toolResults = [];
for (const tool of dom.secondaryTools) {
  await frame.evaluate((t) => {
    const b = document.querySelector(`.mf-secondary-tool[data-mf-secondary-tab="${t}"]`);
    if (b) b.click();
  }, tool);
  await page.waitForTimeout(1200);
  const state = await frame.evaluate(() => {
    const panel = document.getElementById("mf-panel-right");
    const panes = [...document.querySelectorAll(".mf-right-tab-content")]
      .filter((p) => getComputedStyle(p).display !== "none")
      .map((p) => ({ id: p.id, h: Math.round(p.getBoundingClientRect().height),
                     text: (p.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70) }));
    const b = panel?.getBoundingClientRect();
    return {
      cls: panel?.className || "(none)",
      rect: b ? { left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) } : null,
      visible: b ? b.width > 30 && b.height > 30 && getComputedStyle(panel).opacity !== "0" : false,
      visiblePanes: panes,
      backdrop: document.getElementById("mf-flyout-backdrop")?.className || "(none)",
    };
  });
  await shot(`tool-${tool}`);
  toolResults.push({ tool, ...state });
  // Close before the next one so each screenshot shows one flyout only. The BPMN
  // editor is a full-screen takeover with its own way back, so leave via that.
  await frame.evaluate(() => {
    const back = document.querySelector(".mf-rf-tb-back-btn");
    if (back) back.click();
    document.getElementById("mf-flyout-close")?.click();
  });
  await page.waitForTimeout(600);
}

// ── Topbar overflow: is any action button clipped at this width? ────────────
const topbar = await frame.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const bar = document.querySelector(".w-topbar-builder");
  const actions = document.querySelector(".w-topbar-builder .w-actions");
  const ai = document.getElementById("mf-btn-ai-designer");
  const center = document.querySelector(".w-topbar-builder .w-center");
  const clipped = [];
  document.querySelectorAll(".w-topbar-builder .w-actions > *, .w-topbar-builder .w-center > *").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width === 0) return;
    if (b.left < 0 || b.right > innerWidth + 1) {
      clipped.push((el.id || el.className || el.tagName) + ` [${Math.round(b.left)}..${Math.round(b.right)}]`);
    }
  });
  return { viewportW: innerWidth, bar: box(bar), center: box(center), actions: box(actions), ai: box(ai), clipped };
});

// ── Primary tabs ────────────────────────────────────────────────────────────
const tabResults = [];
for (const tab of dom.primaryTabs) {
  await frame.evaluate((t) => {
    const b = document.querySelector(`.mf-primary-tab[data-mf-primary-tab="${t}"]`);
    if (b) b.click();
  }, tab);
  await page.waitForTimeout(1000);
  const state = await frame.evaluate(() => ({
    appVisible: getComputedStyle(document.getElementById("mf-builder-app")).display !== "none",
    entries: getComputedStyle(document.getElementById("mf-entries-pane") || document.body).display,
    analytics: getComputedStyle(document.getElementById("mf-analytics-pane") || document.body).display,
    flyout: document.getElementById("mf-panel-right")?.className || "(none)",
  }));
  await shot(`tab-${tab}`);
  tabResults.push({ tab, ...state });
}

// ── The workspace tabs, which now live in Umbraco's own header band ─────────
// They are appended into umb-section-main-views' shadow root, so a plain querySelector
// from the page finds nothing — pierce the shadow roots, and prove each one navigates.
const headerTabs = { found: [], nav: [] };
const deepClickTab = async (label) =>
  page.evaluate((want) => {
    const find = (root) => {
      for (const el of root.querySelectorAll(".mf-ws-tab")) {
        if ((el.textContent || "").trim().toLowerCase() === want.toLowerCase()) return el;
      }
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) { const hit = find(el.shadowRoot); if (hit) return hit; }
      }
      return null;
    };
    const el = find(document);
    if (!el) return false;
    el.click();
    return true;
  }, label);

headerTabs.found = await page.evaluate(() => {
  const out = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll(".mf-ws-head")) out.push((el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80));
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(document);
  return out;
});
for (const label of ["Entries", "Analytics", "Design"]) {
  const clicked = await deepClickTab(label);
  await page.waitForTimeout(2500);
  const src = await page.evaluate(() => {
    const walk = (root) => {
      for (const f of root.querySelectorAll("iframe")) return f.getAttribute("src");
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { const hit = walk(el.shadowRoot); if (hit) return hit; }
      return null;
    };
    return walk(document);
  });
  headerTabs.nav.push({ label, clicked, src, url: page.url().replace(BASE, "") });
  await shot(`headertab-${label.toLowerCase()}`);
}

const report = { url: page.url(), viewport: { W, H }, geom, dom, gear, topbar, headerTabs, toolResults, tabResults,
                 errors: errors.slice(0, 25), failedRequests: [...new Set(failed)].slice(0, 40) };
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
console.log("\nshots in:", OUT);
await browser.close();
