/**
 * Look at what a recorded GIF actually shows: play it in Chromium and screenshot it on a timer.
 *
 * Run: node tools/browser-qa/gif-frames.mjs <file.gif> <outDir> [shots=8] [stepMs=1100]
 *
 * Two dead ends this exists to avoid:
 *   - Playwright's bundled ffmpeg cannot READ a gif ("Invalid data found when processing input").
 *     It is a slim build with the encoder only, which is why toGif works and -i file.gif does not.
 *   - page.setContent() + <img src="file://…"> renders a broken-image icon: the page's origin is
 *     about:blank and Chromium blocks file:// subresources from it. Navigating straight AT the gif
 *     works, because then the file IS the document.
 *
 * A GIF that was never opened is not verified: a motion-picked GIF of this repo's builder shipped
 * once without the panel it was supposed to demonstrate, at the right size and frame count.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const gif = process.argv[2], out = process.argv[3], shots = Number(process.argv[4] || 8), step = Number(process.argv[5] || 1100);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 780, height: 560 } });
await p.goto(pathToFileURL(path.resolve(gif)).href, { waitUntil: 'load' });
const ok = await p.evaluate(() => { const i = document.querySelector('img'); return i ? { w: i.naturalWidth, h: i.naturalHeight } : null; });
console.log('image in page:', JSON.stringify(ok));
await p.waitForTimeout(500);
for (let i = 1; i <= shots; i++) {
  await p.locator('img').screenshot({ path: path.join(out, 'f' + String(i).padStart(2, '0') + '.png') });
  await p.waitForTimeout(step);
}
await b.close();
console.log('wrote', shots, 'frames');
