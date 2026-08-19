// ============================================================================
//  The Design toolbar after the cleanup, checked on the screen it happened on.
//
//  What this asserts, in the order the handoff (§5) asks for it:
//
//   1. the tool row holds ONLY authoring controls — Add page to start, Add page to
//      end, Reorder. None of the nine inspector glyphs are left in it.
//   2. each Add page button changes the SCHEMA, not just the canvas: a new first
//      page whose only field is the new Section, and a new last page at the end.
//      Read from B.state.schema.fields, never from the DOM.
//   3. Print and Rules open from the Settings screen, Workflow from its own tab.
//   4. photographed at 1366 and 1680 — the row must not wrap or clip at either,
//      which is how the AI Designer button was caught rendering as a 28px stub.
//
//  It also re-runs the two defects the handoff left open:
//   - the field Security section AFTER the Preview step (the exact sequence that
//     used to lose it);
//   - the role list, which was empty because the catalog was fetched from a route
//     Umbraco does not serve.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID
//  Run: node tools/browser-qa/umb-toolbar-cleanup-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-toolbar-cleanup";
const FORM = process.env.FORM_ID || "101";
fs.mkdirSync(OUT, { recursive: true });

const AUTHORING_ONLY = ["add-page-start", "add-page-end", "mf-reorder-toggle"];

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const report = { errors: [], checks: {} };
page.on("pageerror", (e) => report.errors.push(String(e).slice(0, 200)));

/** Open a workspace route and hand back the builder frame once its canvas exists. */
async function openBuilder(route) {
  await page.evaluate((href) => {
    history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, route);
  await page.waitForTimeout(1500);
  const el = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 });
  const frame = await el.contentFrame();
  await frame.waitForFunction(() => !!document.getElementById("mf-canvas-fields"), null, { timeout: 90000 });
  await page.waitForTimeout(3500);
  return frame;
}

/** The page structure the renderer will see: page breaks are Sections, at index > 0. */
const READ_PAGES = () => {
  const fields = (window.MegaFormBuilder?.state?.schema?.fields) || [];
  const isSection = (f) => String(f?.type ?? f?.Type ?? "") === "Section";
  const props = (f) => ({ ...(f?.Properties || {}), ...(f?.properties || {}) });
  const isBreak = (f) => isSection(f) && !!(props(f).pageBreak ?? props(f).PageBreak);
  const starts = [0];
  fields.forEach((f, i) => { if (i > 0 && isBreak(f)) starts.push(i); });
  return {
    total: fields.length,
    firstType: fields[0] ? String(fields[0].type || fields[0].Type) : null,
    sections: fields.filter(isSection).length,
    pages: starts.map((s, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : fields.length;
      return { start: s, count: end - s, keys: fields.slice(s, end).map((f) => f.key || f.Key) };
    }),
  };
};

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
let frame = await openBuilder(`/umbraco/section/megaform/view/open/builder/${FORM}`);

// ── 1. The tool row ─────────────────────────────────────────────────────────
report.checks.toolRow = await frame.evaluate((expected) => {
  const row = document.querySelector(".mf-secondary-toolbar");
  const tools = [...(row?.querySelectorAll(".mf-secondary-tool") || [])].map((b) => ({
    id: b.getAttribute("data-mf-page-tool") || b.getAttribute("data-mf-secondary-tab") || b.id,
    label: (b.querySelector(".lbl") || b.querySelector(".mf-secondary-tool-label"))?.textContent?.trim() || "",
    width: Math.round(b.getBoundingClientRect().width),
  }));
  const ids = tools.map((t) => t.id);
  return {
    tools,
    ids,
    onlyAuthoring: ids.length === expected.length && expected.every((e) => ids.includes(e)),
    // Removing an icon must NOT remove the hidden anchor: Print, Theme, DB, Rules and
    // Workflow only build their pane when one of those is clicked.
    // "steps" is not in this list on purpose: it never had a rail anchor, it is an
    // accordion section inside the field pane (MFDesignEnsureOpen), so demanding one
    // would report a failure that has always been true and means nothing.
    missingHiddenAnchors: ["print", "theme", "db", "rules", "workflow", "perms", "settings", "html"]
      .filter((id) => !document.getElementById("mf-tab-link-" + id)),
    // The panes themselves are still in the DOM, so nothing that opens one is orphaned.
    panesKept: ["print", "theme", "db", "rules", "workflow", "perms"]
      .filter((id) => !document.getElementById("mf-tab-" + id)),
  };
}, AUTHORING_ONLY);
await page.screenshot({ path: `${OUT}/01-tool-row.png` });

// The overflow menu is where the form-wide editors went on hosts without their own
// screens; on Umbraco it should carry only the three that have nowhere else to go.
report.checks.overflowMenu = await frame.evaluate(() => {
  document.getElementById("mf-btn-more")?.click();
  const items = [...document.querySelectorAll("#mf-more-dropdown [data-mf-more-tab]")]
    .map((b) => b.getAttribute("data-mf-more-tab"));
  return { items, open: !!document.getElementById("mf-more-menu")?.classList.contains("is-open") };
});
await page.screenshot({ path: `${OUT}/02-overflow-menu.png` });
await frame.evaluate(() => document.getElementById("mf-btn-more")?.click());

// ── 2. Add page to start / end, read from the schema ────────────────────────
const before = await frame.evaluate(READ_PAGES);

await frame.evaluate(() => document.querySelector('[data-mf-page-tool="add-page-end"]')?.click());
await page.waitForTimeout(1200);
const afterEnd = await frame.evaluate(READ_PAGES);
await page.screenshot({ path: `${OUT}/03-after-add-page-end.png` });

await frame.evaluate(() => document.querySelector('[data-mf-page-tool="add-page-start"]')?.click());
await page.waitForTimeout(1200);
const afterStart = await frame.evaluate(READ_PAGES);
await page.screenshot({ path: `${OUT}/04-after-add-page-start.png` });

report.checks.addPage = {
  before, afterEnd, afterStart,
  endAddedOnePage: afterEnd.pages.length === before.pages.length + 1,
  endPageIsLastAndEmpty:
    afterEnd.pages.length > 0 && afterEnd.pages[afterEnd.pages.length - 1].count === 1,
  endAddedOneSection: afterEnd.sections === before.sections + 1,
  startAddedOnePage: afterStart.pages.length === afterEnd.pages.length + 1,
  // A new FIRST page holding just its own Section — the old content has moved to page two.
  startPageIsFirstAndEmpty: afterStart.pages[0]?.count === 1,
  startKeptOldContentOnPageTwo:
    JSON.stringify(afterStart.pages[1]?.keys?.slice(-3) || []) ===
    JSON.stringify(afterEnd.pages[0]?.keys?.slice(-3) || []),
};

// Leave the form as it was found: this is a QA run, not an edit session.
await frame.evaluate(() => {
  const B = window.MegaFormBuilder;
  B.state.isDirty = false;
});

// ── 4. Widths — the row must not wrap or clip ───────────────────────────────
report.checks.widths = {};
for (const width of [1366, 1680]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(900);
  report.checks.widths[width] = await frame.evaluate(() => {
    const row = document.querySelector(".mf-secondary-toolbar");
    if (!row) return null;
    const tools = [...row.querySelectorAll(".mf-secondary-tool")];
    const box = row.getBoundingClientRect();
    const tops = tools.map((t) => Math.round(t.getBoundingClientRect().top));
    return {
      rowWidth: Math.round(box.width),
      clipped: row.scrollWidth > Math.ceil(box.width) + 1,
      wrapped: new Set(tops).size > 1,
      tools: tools.map((t) => ({
        id: t.getAttribute("data-mf-page-tool") || t.id,
        width: Math.round(t.getBoundingClientRect().width),
        labelShown: !!(t.querySelector(".lbl")?.getBoundingClientRect().width > 0),
      })),
    };
  });
  await page.screenshot({ path: `${OUT}/05-row-${width}.png` });
}
await page.setViewportSize({ width: 1500, height: 950 });

// ── Defect 4.2 — Security section AFTER Preview, the sequence that lost it ──
// Re-open the builder first: the two page buttons above added pages to the working copy,
// and on a multi-page canvas the control we want to click can be on a page that is not
// showing. Reloading also throws those unsaved edits away, which is what a QA run should
// leave behind. (The first attempt at this timed out on "element is not visible" — the
// gear was real, the page it sits on was not the one on screen.)
frame = await openBuilder(`/umbraco/section/megaform/view/open/builder/${FORM}`);

await frame.evaluate(() => document.getElementById("mf-btn-theme-preview")?.click());
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/06-preview-open.png` });
await frame.evaluate(() => document.getElementById("mf-flyout-close")?.click());
await page.waitForTimeout(800);

{
  const idx = await frame.evaluate(() => (window.MegaFormBuilder.state.schema.fields || [])
    .findIndex((f) => ["Text", "Email", "Phone", "Textarea", "Select", "Radio"].includes(f.type)));
  // A real click, through Playwright. Calling .click() on the gear from inside
  // frame.evaluate() leaves the properties pane closed, and the run then reports the
  // Security section as missing when nothing was ever opened — measured, twice.
  const gear = await frame.$(`.mf-canvas-item[data-index="${idx}"] .mf-edit-field`);
  if (gear) { await gear.scrollIntoViewIfNeeded(); await gear.click({ force: true }); }
  await page.waitForTimeout(2500);
  report.checks.fieldPicked = await frame.evaluate((i) => ({
    idx: i,
    clicked: !!document.querySelector(`.mf-canvas-item[data-index="${i}"] .mf-edit-field`),
    selectedIndex: window.MegaFormBuilder.state.selectedFieldIndex,
    flyoutOpen: !!document.getElementById("mf-panel-right")?.classList.contains("mf-flyout-open"),
    key: window.MegaFormBuilder.state.schema.fields[i]?.key,
  }), idx);
}

report.checks.fieldSecurityAfterPreview = await frame.evaluate(() => {
  const props = document.getElementById("mf-field-props");
  const wrap = props?.querySelector("#mf-prop-field-security")
    || document.getElementById("mf-prop-field-security");
  const vis = wrap?.querySelector("#mf-prop-field-roles");
  const ro = wrap?.querySelector("#mf-prop-field-readonly-roles");
  return {
    present: !!wrap,
    inFieldProps: !!props?.querySelector("#mf-prop-field-security"),
    visible: wrap ? getComputedStyle(wrap).display !== "none" : false,
    heading: wrap?.querySelector("h6")?.textContent?.trim(),
    roleOptions: vis ? [...vis.options].map((o) => o.textContent.trim()) : null,
    readOnlyOptions: ro ? [...ro.options].map((o) => o.textContent.trim()) : null,
  };
});

// Scroll the flyout so the section is photographed, not just counted.
{
  const scroller = await frame.evaluate(() => {
    const el = document.querySelector(".mf-flyout-body");
    return el ? { h: el.clientHeight, sh: el.scrollHeight } : null;
  });
  if (scroller) {
    const step = Math.max(1, scroller.h - 60);
    for (let y = 0, i = 0; y < scroller.sh && i < 8; y += step, i++) {
      await frame.evaluate((top) => { document.querySelector(".mf-flyout-body").scrollTop = top; }, y);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/07-field-tile${i}.png` });
    }
  }
}

// ── Defect 4.3 — what the catalog endpoint actually answers now ─────────────
report.checks.roleCatalog = await frame.evaluate(async () => {
  const cfg = window.__MF_PLATFORM__ || {};
  const root = document.getElementById("mf-builder-root");
  let base = String(cfg.apiBase || root?.dataset?.apiBase || "/api/MegaForm/");
  if (!base.endsWith("/")) base += "/";
  const fid = Number(root?.dataset?.formId || 0);
  try {
    const res = await fetch(`${base}Permissions/Catalog?formId=${fid}`, { credentials: "same-origin" });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.toLowerCase().includes("json")) {
      return { url: base + "Permissions/Catalog", status: res.status, contentType: ct };
    }
    const body = await res.json();
    const principals = body?.catalog?.principals || body?.catalog?.Principals || [];
    return {
      url: base + "Permissions/Catalog",
      status: res.status,
      principals: principals.length,
      roles: principals.filter((p) => String(p.principalType || "").toLowerCase() === "role")
        .map((p) => p.roleName || p.principalId),
    };
  } catch (e) {
    return { error: String(e).slice(0, 160) };
  }
});

// ── 3. The new destinations ─────────────────────────────────────────────────
report.checks.workflowTab = await (async () => {
  await page.evaluate((f) => {
    history.pushState({}, "", `/umbraco/section/megaform/view/open/workflow/${f}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, FORM);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/08-workflow-tab.png` });
  return page.evaluate(() => {
    const deep = (root, out = []) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.classList?.contains("mf-ws-tab")) out.push(el);
        if (el.shadowRoot) deep(el.shadowRoot, out);
      }
      return out;
    };
    const tabs = deep(document);
    const findFrame = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.tagName === "IFRAME") return el.getAttribute("src");
        if (el.shadowRoot) { const s = findFrame(el.shadowRoot); if (s) return s; }
      }
      return null;
    };
    return {
      tabLabels: tabs.map((t) => t.textContent.trim()),
      current: tabs.filter((t) => t.getAttribute("aria-current") === "page").map((t) => t.textContent.trim()),
      frameSrc: findFrame(document),
    };
  });
})();

report.checks.settingsScreen = await (async () => {
  await page.evaluate((f) => {
    history.pushState({}, "", `/umbraco/section/megaform/view/open/form-settings/${f}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, FORM);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/09-settings-screen.png`, fullPage: false });
  // Photograph the two new sections, not just their headings: they sit below the fold and a
  // heading counted in the DOM is not a section anyone can see.
  await page.evaluate(() => {
    const deep = (root, sel) => {
      const hit = root.querySelector(sel);
      if (hit) return hit;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) { const s = deep(el.shadowRoot, sel); if (s) return s; }
      }
      return null;
    };
    const scroller = deep(document, ".scroll");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/09b-settings-print-rules.png` });
  return page.evaluate(() => {
    const deep = (root, sel, out = []) => {
      out.push(...root.querySelectorAll(sel));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) deep(el.shadowRoot, sel, out);
      return out;
    };
    const headings = deep(document, ".section > h3").map((h) => h.textContent.trim());
    const buttons = deep(document, "button.link").map((b) => b.textContent.trim());
    return { headings, buttons, hasPrint: headings.includes("Print"), hasRules: headings.includes("Rules") };
  });
})();

report.checks.printFromSettings = await (async () => {
  await page.evaluate((f) => {
    history.pushState({}, "", `/umbraco/section/megaform/view/open/form-settings/${f}/print`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, FORM);
  await page.waitForTimeout(2000);
  let paneOk = null;
  try {
    const el = await page.waitForSelector('iframe[src*="pane=print"]', { timeout: 30000 });
    const f2 = await el.contentFrame();
    await f2.waitForFunction(() => !!document.getElementById("mf-canvas-fields"), null, { timeout: 90000 });
    await page.waitForTimeout(5000);
    paneOk = await f2.evaluate(() => {
      const pane = document.getElementById("mf-tab-print");
      const panel = document.getElementById("mf-panel-right");
      return {
        paneVisible: pane ? getComputedStyle(pane).display !== "none" : false,
        flyoutOpen: !!panel?.classList.contains("mf-flyout-open"),
        title: document.querySelector(".mf-flyout-title")?.textContent?.trim(),
        mounted: (document.getElementById("mf-print-settings-container")?.childElementCount || 0) > 0,
      };
    });
  } catch (e) {
    paneOk = { error: String(e).slice(0, 160) };
  }
  await page.screenshot({ path: `${OUT}/10-print-from-settings.png` });
  return paneOk;
})();

report.checks.securityScreen = await (async () => {
  await page.evaluate(() => {
    history.pushState({}, "", "/umbraco/section/megaform/view/open/security");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForTimeout(3000);
  const deepClick = (label) => page.evaluate((want) => {
    const deep = (root, out = []) => {
      out.push(...root.querySelectorAll(".areas button"));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) deep(el.shadowRoot, out);
      return out;
    };
    const btn = deep(document).find((b) => b.textContent.trim() === want);
    btn?.click();
    return !!btn;
  }, label);
  const clicked = await deepClick("Form permissions");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/11-security-form-permissions.png` });
  const state = await page.evaluate(() => {
    const deep = (root, sel, out = []) => {
      out.push(...root.querySelectorAll(sel));
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) deep(el.shadowRoot, sel, out);
      return out;
    };
    const areas = deep(document, ".areas button").map((b) => b.textContent.trim());
    const headers = deep(document, "table.matrix thead th").map((th) => th.childNodes[0]?.textContent?.trim());
    const rows = deep(document, "table.matrix tbody tr").length;
    const forms = deep(document, "#mf-sec-form option").length;
    const err = deep(document, ".msg.err").map((m) => m.textContent.trim().slice(0, 120));
    return { areas, headers, rows, forms, err };
  });
  return { clicked, ...state };
})();

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 6000));
await browser.close();
