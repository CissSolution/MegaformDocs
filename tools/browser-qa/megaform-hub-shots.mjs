// Screenshots of the /MegaForm hub page, loaded the way a visitor loads it: signed out, no cache.
//
// Counting <style> tags in the served HTML proves the CSS was delivered, not that the page looks
// right -- a stylesheet can arrive and still lay out wrong. These shots exist to be opened.
//
// Env: SHOT_BASE, OUT_DIR
import { chromium } from "playwright";

const BASE = process.env.SHOT_BASE || "https://dnndefender.com";
const OUT = process.env.OUT_DIR;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/MegaForm?cb=${process.env.CB || "1"}`, { waitUntil: "networkidle", timeout: 240000 });
await page.waitForTimeout(2500);

const facts = await page.evaluate(() => {
  const hub = document.querySelector("#mf-hub");
  const grid = document.querySelector(".mfh-grid");
  const cards = [].slice.call(document.querySelectorAll(".mfh-card"));
  const visible = cards.filter((c) => c.offsetParent !== null);
  const cs = hub ? getComputedStyle(hub) : null;
  const gs = grid ? getComputedStyle(grid) : null;
  const h1 = document.querySelector("#mf-hub h1");
  return {
    hubFound: !!hub,
    hubMaxWidth: cs ? cs.maxWidth : null,          // 1220px only if the module CSS applied
    gridColumns: gs ? gs.gridTemplateColumns : null, // four tracks at 1280 wide
    cards: cards.length,
    cardsVisible: visible.length,                   // 12 if the pager script ran
    pagerButtons: document.querySelectorAll(".mfh-pager button").length,
    pagerInfo: (document.querySelector(".mfh-pager-info") || {}).textContent || null,
    h1Size: h1 ? getComputedStyle(h1).fontSize : null,
    imagesBroken: [].slice.call(document.images).filter((i) => i.complete && i.naturalWidth === 0).length,
    docHeight: Math.round(document.documentElement.scrollHeight),
  };
});
console.log(JSON.stringify(facts, null, 2));

await page.screenshot({ path: `${OUT}/mf-hub-01-top.png`, clip: { x: 0, y: 0, width: 1280, height: 900 } });

// Section shots come from the elements themselves. Clipping the viewport against a bounding box
// read after scrolling gives coordinates in the wrong frame of reference, and Playwright answers
// that with "clipped area is either empty or outside the resulting image".
for (const [sel, name] of [[".mfh-grid", "02-gallery"], [".mfh-plain", "03-plain"], [".mfh-feats", "04-features"]]) {
  const el = page.locator(sel).first();
  if (await el.count()) {
    await el.scrollIntoViewIfNeeded();
    // Every image on this page is loading="lazy". Shooting straight after the scroll catches the
    // panel before its image has started, which photographs an empty box and reads as a broken
    // page -- wait for the ones inside this element to actually decode.
    await page.waitForFunction((s) => {
      const root = document.querySelector(s);
      if (!root) return true;
      return [].slice.call(root.querySelectorAll("img")).every((i) => i.complete && i.naturalWidth > 0);
    }, sel, { timeout: 30000 }).catch(() => console.log(`${name}: images did not all load`));
    await page.waitForTimeout(400);
    await el.screenshot({ path: `${OUT}/mf-hub-${name}.png` }).catch((e) => console.log(`${name}: ${e.message}`));
  }
}
console.log("shots written");
await browser.close();
