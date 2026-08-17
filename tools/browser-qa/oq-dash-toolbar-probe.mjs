// Reproduce the dashboard header toolbar at a narrow container width and report why it collides.
//
// The report is "the buttons are squeezed in windowed mode". Counting elements proves nothing here
// — what matters is the measured box of each control and whether the boxes overlap, so this reads
// geometry and then photographs the strip.
//
// Env: OQ_BASE, OQ_USER, OQ_PASS, OUT_DIR, WIDTHS (comma-separated)
import { chromium } from "playwright";

const BASE = process.env.OQ_BASE || "http://localhost:5188";
const USER = process.env.OQ_USER || "host";
const PASS = process.env.OQ_PASS || "Fresh@2026x";
const OUT = process.env.OUT_DIR || ".";
const WIDTHS = (process.env.WIDTHS || "1327,1200,1024,900").split(",").map(Number);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// The login form is rendered by Blazor, so it is absent from the initial HTML — settle first,
// then fill. Swallowing the post-login wait hides a failed sign-in and every later measurement
// is then taken on the anonymous home page, which looks like "the toolbar does not exist".
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);
await page.locator('input[id*="Username" i], input[name*="username" i], #Username').first().fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button:has-text("Login"), input[type="submit"][value*="Login" i]').first().click();
await page.waitForFunction(
  () => !/\/login/i.test(location.pathname) || /logout/i.test(document.body?.innerText || ""),
  null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(3000);

const signedIn = await page.evaluate(() => /logout/i.test(document.body?.innerText || ""));
console.log("signed in:", signedIn);
if (!signedIn) { console.log("ABORT — khong dang nhap duoc, moi so do sau se vo nghia"); await browser.close(); process.exit(1); }

await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
// Wait for the panel itself rather than a flat sleep.
await page.waitForFunction(() => /Form Management/.test(document.body?.innerText || ""),
                           null, { timeout: 60000 })
          .catch(() => console.log("!! panel 'Form Management' khong xuat hien"));
await page.waitForTimeout(2500);

for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    // The strip that holds "Form Management" and the action buttons on its right.
    const label = [...document.querySelectorAll("*")]
      .find((e) => (e.textContent || "").trim() === "Form Management" && e.children.length === 0);
    let bar = label;
    for (let i = 0; i < 6 && bar; i++) {
      if (bar.querySelectorAll("button, a").length >= 3) break;
      bar = bar.parentElement;
    }
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    const kids = [...bar.querySelectorAll("button, a")].map((e) => {
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return {
        text: (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22),
        x: Math.round(b.x), w: Math.round(b.width), right: Math.round(b.right),
        overflow: cs.overflow, ws: cs.whiteSpace,
      };
    });
    // Overlap = a control starting before the previous one ended.
    let overlaps = 0;
    for (let i = 1; i < kids.length; i++) if (kids[i].x < kids[i - 1].right - 1) overlaps++;
    const spill = kids.some((k) => k.right > Math.round(r.right) + 1);
    return {
      barClass: bar.className && bar.className.toString().slice(0, 70),
      barW: Math.round(r.width),
      display: getComputedStyle(bar).display,
      flexWrap: getComputedStyle(bar).flexWrap,
      gap: getComputedStyle(bar).gap,
      controls: kids.length, overlaps, spill, kids,
    };
  });

  console.log(`\n=== viewport ${w}px ===`);
  if (!info) { console.log("  (khong tim thay thanh cong cu)"); continue; }
  console.log(`  bar .${info.barClass}  w=${info.barW}  display=${info.display} wrap=${info.flexWrap} gap=${info.gap}`);
  console.log(`  controls=${info.controls}  OVERLAPS=${info.overlaps}  spill-out=${info.spill}`);
  for (const k of info.kids) console.log(`     x=${String(k.x).padStart(5)} w=${String(k.w).padStart(4)} "${k.text}"`);

  const bar = page.locator("text=Form Management").first();
  const box = await bar.boundingBox().catch(() => null);
  if (box) {
    await page.screenshot({
      path: `${OUT}/dash-toolbar-${w}.png`,
      clip: { x: 0, y: Math.max(0, box.y - 18), width: Math.min(w, 1600), height: 76 },
    }).catch(() => {});
  }
}

await browser.close();
