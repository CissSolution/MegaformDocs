// ============================================================================
//  Drag a control out of the palette, for real, and photograph what the canvas
//  does while the pointer is still down.
//
//  Three claims to test:
//   1. Reorder sits in the top tool row, not on a band of its own above the canvas.
//   2. Dragging from the palette puts the canvas into arrange mode — one short row
//      per field — and reverts on drop.
//   3. A layout Row shows its columns as drop targets, and a control dropped in one
//      lands in that column's fields[] in the schema, not on the form root.
//
//  Nothing here trusts a class name alone: every step also reads the builder's own
//  schema, and every state is photographed.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, FORM_ID, VIEW_W, VIEW_H, HEADED
//  Run: node tools/browser-qa/umb-builder-arrange-qa.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || "./qa-arrange";
const FORM = process.env.FORM_ID || "103";
const W = Number(process.env.VIEW_W || 1500);
const H = Number(process.env.VIEW_H || 950);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await umbLogin(page, { base: BASE, user: USER, pass: PASS });
await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(1500);

const frameEl = await page.waitForSelector('iframe[src*="/umbraco/MegaForm/Builder"]', { timeout: 60000 });
const frame = await frameEl.contentFrame();
await frame.waitForFunction(() => !!document.getElementById("mf-canvas-fields"), null, { timeout: 90000 });
await page.waitForTimeout(4500);

const frameBox = await frameEl.boundingBox();
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };
// Rect of a node inside the frame, in PAGE coordinates.
const rectOf = async (sel, nth = 0) => {
  const r = await frame.evaluate(([s, i]) => {
    const el = document.querySelectorAll(s)[i];
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }, [sel, nth]);
  if (!r) return null;
  return { x: frameBox.x + r.x + r.w / 2, y: frameBox.y + r.y + r.h / 2, w: r.w, h: r.h,
           top: frameBox.y + r.y, bottom: frameBox.y + r.y + r.h };
};
const schema = () => frame.evaluate(() => {
  const S = window.MegaFormBuilder && window.MegaFormBuilder.state && window.MegaFormBuilder.state.schema;
  const f = (S && S.fields) || [];
  return {
    count: f.length,
    types: f.map((x) => x.type),
    rows: f.filter((x) => Array.isArray(x.columns)).map((x) => ({
      key: x.key, cols: x.columns.map((c) => (c.fields || []).length),
    })),
  };
});

const report = { errors };

// ── 1. Where does Reorder live? ─────────────────────────────────────────────
report.reorder = await frame.evaluate(() => {
  const b = document.getElementById("mf-reorder-toggle");
  if (!b) return { present: false };
  const parents = [];
  for (let p = b.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) {
    parents.push(p.className ? String(p.className).split(" ")[0] : p.tagName.toLowerCase());
  }
  const r = b.getBoundingClientRect();
  return {
    present: true, parents,
    inToolbar: !!b.closest(".mf-secondary-toolbar"),
    legacyBar: !!document.querySelector(".mf-reorder-bar"),
    y: Math.round(r.top), h: Math.round(r.height),
  };
});
await shot("01-initial");
report.before = await schema();

// ── 2. Drag a palette control into the middle of the form ───────────────────
const src = await rectOf(".mf-palette-item", 0);          // BASIC → first tile (Input)
const targetField = await rectOf("#mf-canvas-fields > .mf-canvas-item", 1);
await page.mouse.move(src.x, src.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(src.x + ((targetField.x - src.x) * i) / 6, src.y + ((targetField.y - src.y) * i) / 6, { steps: 4 });
  await page.waitForTimeout(90);
}
await page.waitForTimeout(500);
report.midDrag = await frame.evaluate(() => {
  const body = document.body;
  const card = document.querySelector("#mf-canvas-fields > .mf-canvas-item");
  const b = card && card.getBoundingClientRect();
  return {
    arrangeClass: body.classList.contains("mf-arrange-mode"),
    mfMode: body.getAttribute("data-mf-mode"),
    firstCardHeight: b ? Math.round(b.height) : null,
    ghosts: document.querySelectorAll("#mf-canvas-fields .mf-sortable-ghost, #mf-canvas-fields .sortable-ghost").length,
  };
});
await shot("02-mid-drag");
await page.mouse.up();
await page.waitForTimeout(1200);
report.afterDrop = await schema();
report.afterClass = await frame.evaluate(() => document.body.classList.contains("mf-arrange-mode"));
await shot("03-after-drop");

// ── 3. Add a layout Row, then drop a control INTO one of its columns ────────
report.layoutTiles = await frame.evaluate(() => {
  const tab = document.querySelector('.mf-ptab[data-cat="layout"]');
  if (tab) tab.click();
  return [...document.querySelectorAll("#mf-pcat-layout .mf-palette-item")]
    .map((i) => (i.getAttribute("data-type") || "") + ":" + (i.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 12);
});
await page.waitForTimeout(600);
await shot("04-layout-palette");

// The tile that creates a two-column Row.
const rowTileIndex = await frame.evaluate(() => {
  const items = [...document.querySelectorAll("#mf-pcat-layout .mf-palette-item")];
  return items.findIndex((it) => (it.getAttribute("data-type") || "") === "Row");
});
if (rowTileIndex >= 0) {
  const rowSrc = await rectOf("#mf-pcat-layout .mf-palette-item", rowTileIndex);
  const dropAt = await rectOf("#mf-canvas-fields > .mf-canvas-item", 0);
  await page.mouse.move(rowSrc.x, rowSrc.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(rowSrc.x + ((dropAt.x - rowSrc.x) * i) / 6, rowSrc.y + ((dropAt.y - rowSrc.y) * i) / 6, { steps: 4 });
    await page.waitForTimeout(90);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  report.afterRow = await schema();
  await shot("05-row-added");

  // Now a control INTO the first column of that row.
  if (report.afterRow.rows.length) {
    await frame.evaluate(() => {
      const tab = document.querySelector('.mf-ptab[data-cat="basic"]');
      if (tab) tab.click();
    });
    await page.waitForTimeout(500);
    const ctrl = await rectOf("#mf-pcat-basic .mf-palette-item", 0);
    if (ctrl) {
      // Press first, nudge to enter arrange mode, and only THEN measure the column:
      // arrange mode collapses every card, so a rect taken before the drag points at
      // whatever slid up into that place. (First run of this script dropped on the form
      // root for exactly that reason and read as "columns do not accept drops".)
      await page.mouse.move(ctrl.x, ctrl.y);
      await page.mouse.down();
      await page.mouse.move(ctrl.x + 30, ctrl.y + 20, { steps: 4 });
      await page.waitForTimeout(350);
      const col = await rectOf("#mf-canvas-fields .mf-row-col", 0);
      if (!col) throw new Error("no .mf-row-col during drag");
      const from = { x: ctrl.x + 30, y: ctrl.y + 20 };
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(from.x + ((col.x - from.x) * i) / 8, from.y + ((col.y - from.y) * i) / 8, { steps: 4 });
        await page.waitForTimeout(90);
      }
      // Converge: inserting the drag placeholder reflows the list, so the column slides
      // out from under the pointer (measured: 86px in one run, which read as "columns
      // reject drops" when it was the aim that was stale). Re-measure and re-aim until
      // the builder itself reports the pointer inside a column.
      for (let tries = 0; tries < 5; tries++) {
        const now = await rectOf("#mf-canvas-fields .mf-row-col", 0);
        if (!now) break;
        await page.mouse.move(now.x, now.y, { steps: 3 });
        await page.waitForTimeout(250);
        const dbg = await frame.evaluate(() => window.__mfDropDebug || null);
        if (dbg && dbg.inColumn) break;
      }
      await page.waitForTimeout(300);
      report.colMidDrag = await frame.evaluate(() => {
        const c = document.querySelector("#mf-canvas-fields .mf-row-col");
        const b = c && c.getBoundingClientRect();
        const cx = b ? b.left + b.width / 2 : 0;
        const cy = b ? b.top + b.height / 2 : 0;
        const hit = b ? document.elementFromPoint(cx, cy) : null;
        return {
          colHeight: b ? Math.round(b.height) : null,
          dashed: c ? getComputedStyle(c).borderStyle : null,
          hint: c ? c.getAttribute("data-mf-drop-hint") : null,
          colRect: b ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null,
          // What is actually under the pointer, and does the column own a Sortable?
          hitTag: hit ? hit.tagName.toLowerCase() + "." + String(hit.className || "").split(" ")[0] : null,
          hitInColumn: hit ? !!hit.closest(".mf-row-col") : null,
          colHasSortable: !!(c && (c._sortable || c.__sortable)),
          colClasses: c ? c.className : null,
          bodyClasses: document.body.className,
        };
      });
      await shot("06-drag-over-column");
      // What the drop-target resolver will actually see at this exact point.
      report.dropStack = await frame.evaluate(() => {
        const c = document.querySelector("#mf-canvas-fields .mf-row-col");
        const b = c.getBoundingClientRect();
        const x = b.left + b.width / 2, y = b.top + b.height / 2;
        return {
          point: [Math.round(x), Math.round(y)],
          stack: document.elementsFromPoint(x, y).slice(0, 6)
            .map((e) => e.tagName.toLowerCase() + "." + String(e.className || "").split(" ").slice(0, 2).join(".")),
          sortableOnColumn: !!(window.Sortable && window.Sortable.get && window.Sortable.get(c)),
          sortableOnCanvas: !!(window.Sortable && window.Sortable.get && window.Sortable.get(document.getElementById("mf-canvas-fields"))),
          dropDebug: window.__mfDropDebug || null,
        };
      });
      await page.mouse.up();
      await page.waitForTimeout(1500);
      report.afterColumnDrop = await schema();
      await shot("07-after-column-drop");
    }
  }
}

// ── 4. The moved Reorder button still opens the reorder screen ──────────────
await frame.evaluate(() => document.getElementById("mf-reorder-toggle")?.click());
await page.waitForTimeout(900);
report.reorderOpens = await frame.evaluate(() => {
  const o = document.querySelector(".mf-reorder-overlay");
  return { overlay: !!o, rows: document.querySelectorAll(".mf-reorder-row").length };
});
await shot("08-reorder-open");
await frame.evaluate(() => {
  const done = [...document.querySelectorAll(".mf-reorder-btn")].find((b) => /done/i.test(b.textContent || ""));
  if (done) done.click();
});
await page.waitForTimeout(600);

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
