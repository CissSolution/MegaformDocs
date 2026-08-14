// ============================================================================
//  Capture the screenshots the reCAPTCHA documentation page needs.
//
//  Everything here comes from a real form on a real site, loaded anonymously —
//  what a visitor sees, not a mock-up.
//
//  Two images:
//    01  the whole demo page, so the reader sees a page rather than a crop
//    02  Google's badge, cut to the element's own box
//
//  Both at deviceScaleFactor 2: a documentation screenshot is read at full
//  width on a high-density display, and a 1x capture of small type is mush.
//
//  Env: SHOT_BASE, SHOT_PAGE, OUT_DIR
//  Run: node tools/browser-qa/recaptcha-doc-shots.mjs
// ============================================================================
import { chromium } from "playwright";

const BASE = process.env.SHOT_BASE || "https://dnndefender.com";
const PAGE = process.env.SHOT_PAGE || "/mf-recaptcha-qa-20260814";
const OUT = process.env.OUT_DIR;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(`${BASE}${PAGE}?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 240000 });
await page.waitForTimeout(8000);

// The badge animates in from the right and settles; capturing mid-slide gives a half-off-screen
// image that looks like a rendering bug rather than a badge.
await page.waitForFunction(() => {
  const b = document.querySelector(".grecaptcha-badge");
  return b && b.getBoundingClientRect().right <= window.innerWidth + 1;
}, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);

const facts = await page.evaluate(() => {
  const host = document.querySelector(".mf-widget-host");
  const badge = document.querySelector(".grecaptcha-badge");
  const b = badge && badge.getBoundingClientRect();
  return {
    widgetHostHeight: host ? Math.round(host.getBoundingClientRect().height) : null,
    badge: b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null,
    grecaptcha: typeof window.grecaptcha !== "undefined",
    docHeight: Math.round(document.documentElement.scrollHeight),
  };
});
console.log("facts", JSON.stringify(facts));

// ── 1. the whole demo page ─────────────────────────────────────────────────
// Trim the viewport to the document so the shot has no dead band under the footer.
await page.setViewportSize({ width: 1280, height: Math.min(1400, Math.max(700, facts.docHeight)) });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/megaform-recaptcha-v3-form.png` });
console.log("wrote megaform-recaptcha-v3-form.png");

// ── 2. the badge, cut to its own box ───────────────────────────────────────
if (facts.badge) {
  // Collapsed, the badge is only Google's logo and says nothing. Hovering expands it to
  // "protected by reCAPTCHA / Privacy - Terms", which is the part that matters: those links are
  // what Google's terms require a site to show.
  await page.hover(".grecaptcha-badge").catch(() => {});
  await page.waitForTimeout(1500);

  const b = await page.evaluate(() => {
    const r = document.querySelector(".grecaptcha-badge").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const pad = 14;
  await page.screenshot({
    path: `${OUT}/megaform-recaptcha-v3-badge.png`,
    clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 },
  });
  console.log("wrote megaform-recaptcha-v3-badge.png");
} else {
  console.log("badge not found — no close-up written");
}

await browser.close();
