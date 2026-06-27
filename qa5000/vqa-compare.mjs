// Visual-QA: screenshot a live form render vs its :3100 mock, on a NEUTRAL light page
// background, so we see the FORM's own background (not the host theme). Also probe the
// computed background of the shell root + body so we can categorize dark vs transparent.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'qa5000', 'vqa');
mkdirSync(OUT, { recursive: true });

// id -> {slug, mock}
const MAP = {
  13: { slug: 'australia', name: 'australia' },
  15: { slug: 'intake', name: 'intake' },
  11: { slug: 'bulgaria', name: 'bulgaria' },
  14: { slug: 'festa-italiana', name: 'festa' },
};
const ids = (process.argv[2] || '13,15,11,14').split(',').map(Number);

const browser = await chromium.launch({ headless: true });
for (const id of ids) {
  const meta = MAP[id]; if (!meta) continue;
  // RENDER on a forced-dark page wrapper to reproduce the host-dark issue, AND on light.
  for (const [bg, tag] of [['#0b0b0b', 'onDark'], ['#ffffff', 'onLight']]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, bypassCSP: true });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:5000/api/MegaForm/render/${id}?vqa=${Date.now()}`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.addStyleTag({ content: `html,body{background:${bg} !important;}` }).catch(() => {});
    await page.waitForTimeout(2200);
    await page.screenshot({ path: join(OUT, `${meta.name}-${id}-render-${tag}.png`), fullPage: true });
    if (tag === 'onDark') {
      const probe = await page.evaluate(() => {
        const root = document.querySelector('[class*="mfp"]');
        const pick = (el) => el ? getComputedStyle(el).backgroundColor : null;
        const firstHeading = document.querySelector('[class*="mfp"] h1, [class*="mfp"] h2');
        return {
          rootClass: root ? root.className : null,
          rootBg: pick(root),
          rootParentBg: root && root.parentElement ? pick(root.parentElement) : null,
          headingText: firstHeading ? firstHeading.textContent.trim().slice(0, 30) : null,
          headingColor: firstHeading ? getComputedStyle(firstHeading).color : null,
          headingBgChain: (() => { let e = firstHeading, out = []; for (let i = 0; e && i < 5; i++, e = e.parentElement) out.push(getComputedStyle(e).backgroundColor); return out; })(),
        };
      });
      console.log(`form ${id} (${meta.name}):`, JSON.stringify(probe));
    }
    await ctx.close();
  }
  // MOCK
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, bypassCSP: true });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3100/forms/${meta.slug}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, `${meta.name}-${id}-MOCK.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
console.log('VQA screenshots -> qa5000/vqa/');
