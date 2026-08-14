// ============================================================================
//  Capture the screenshots the reCAPTCHA documentation page needs.
//
//  Everything here is taken from a real form on a real site, anonymously —
//  what a visitor sees, not a mock-up.
//
//  Env: SHOT_BASE (site), SHOT_PAGE (form page path), OUT_DIR
//  Run: node tools/browser-qa/recaptcha-doc-shots.mjs
// ============================================================================
import { chromium } from "playwright";

const BASE = process.env.SHOT_BASE || "https://dnndefender.com";
const PAGE = process.env.SHOT_PAGE || "/mf-recaptcha-qa-20260814";
const OUT = process.env.OUT_DIR;

const browser = await chromium.launch({ headless: true });

// Crop to the form card rather than the whole viewport: a documentation image of a
// site chrome the reader does not have is noise.
async function shotForm(page, file) {
  const card = page.locator(".mf-form, [data-mf-form-id], .mfp, form").first();
  const box = await card.boundingBox().catch(() => null);
  const clip = box
    ? { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: Math.min(1200, box.width + 32), height: Math.min(900, box.height + 32) }
    : undefined;
  await page.screenshot({ path: `${OUT}/${file}`, clip });
}

// ── 1. the form as a visitor sees it: v3 invisible, no reserved space ───────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${PAGE}?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(7000);
  const m = await page.evaluate(() => {
    const host = document.querySelector(".mf-widget-host");
    const badge = document.querySelector(".grecaptcha-badge");
    return {
      widgetHostHeight: host ? Math.round(host.getBoundingClientRect().height) : null,
      badge: badge ? { w: Math.round(badge.getBoundingClientRect().width), h: Math.round(badge.getBoundingClientRect().height) } : null,
      grecaptcha: typeof window.grecaptcha !== "undefined",
    };
  });
  console.log("form-clean", JSON.stringify(m));
  await shotForm(page, "recaptcha-01-form.png");
  await page.screenshot({ path: `${OUT}/recaptcha-01b-badge.png`, clip: { x: 1000, y: 830, width: 280, height: 160 } }).catch(() => {});
  await ctx.close();
}

// ── 2. what a visitor sees when the check does not pass ────────────────────
// Google's script is blocked, which is what an ad-blocker or a restrictive network
// does. The form then has no token to send and the server refuses the submission.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  // Match Google's HOSTS only. A bare /recaptcha/ also matches the demo page's own path, which
  // aborted the navigation instead of the script and produced ERR_FAILED on the page itself.
  await page.route(/^https:\/\/(www\.google\.com|www\.gstatic\.com|www\.recaptcha\.net)\//, (r) => r.abort());
  await page.goto(`${BASE}${PAGE}?cb=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(5000);

  await page.fill('input[name="name"], input[type="text"]', "Jane Carter").catch(() => {});
  await page.fill('input[name="email"], input[type="email"]', "jane.carter@contoso.com").catch(() => {});

  // Target the VISIBLE button carrying the form's submit label. A plain `form button` also matches
  // the renderer's hidden "Previous" control (display:none, 0x0), and waiting for that to become
  // clickable times out — which reads exactly like a disabled submit button and is not one.
  const btn = page.getByRole("button", { name: /verify and submit|submit|send/i }).first();
  console.log("submit button:", await btn.count(), await btn.textContent().catch(() => "?"));
  await btn.click({ timeout: 20000 }).catch((e) => console.log("click failed:", e.message.slice(0, 60)));

  // Wait for the refusal to actually appear rather than guessing a duration.
  await page.waitForFunction(
    () => /CAPTCHA/i.test(document.body.innerText) &&
          !!document.querySelector(".mf-field-error:not(:empty), .mf-form-error, .mfp-error"),
    null, { timeout: 30000 }).catch(() => console.log("no visible captcha error within 30s"));
  await page.waitForTimeout(1500);

  const shown = await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/.{0,80}(CAPTCHA|captcha).{0,80}/);
    return { messageOnPage: m ? m[0].replace(/\s+/g, " ").trim() : null };
  });
  console.log("form-refused", JSON.stringify(shown));
  await shotForm(page, "recaptcha-02-refused.png");
  await ctx.close();
}

await browser.close();
console.log("done ->", OUT);
