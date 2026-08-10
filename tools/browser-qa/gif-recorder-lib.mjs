// Demo-GIF pipeline, rebuilt 2026-08-10 (the 2026-07-07 scripts lived in a scratchpad that is gone).
//
// Playwright records webm; that webm becomes PNG frames; the frames become a GIF.
//
// 🔴 Playwright's bundled ffmpeg is a STRIPPED build: no gif muxer, no fps/lanczos filters. Only
// scale/crop/pad and the png/webm muxers work. So frames are extracted with `-vf scale -r` and the
// GIF is assembled in pure JS with gif-encoder-2 + pngjs. Do not "simplify" this to `-f gif`.
//
// A synthetic cursor is drawn INSIDE the frame that owns the element, because the interesting
// clicks happen in the Persona Bar iframe and a cursor painted on the top document would sit in
// the wrong coordinate space.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import GIFEncoder from 'gif-encoder-2';

export function ffmpegPath() {
  const root = path.join(process.env.USERPROFILE || process.env.HOME, 'AppData/Local/ms-playwright');
  const dir = fs.readdirSync(root).find((d) => d.startsWith('ffmpeg-'));
  return path.join(root, dir, 'ffmpeg-win64.exe');
}

/** The cursor lives in the frame it clicks in, so its coordinates are that frame's. */
export const CURSOR_SCRIPT = `
(() => {
  if (window.__mfCursor) return;
  const dot = document.createElement('div');
  dot.id = '__mf-cursor';
  dot.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'width:22px', 'height:22px', 'margin:-11px 0 0 -11px',
    'border-radius:50%', 'background:rgba(223,0,0,.28)', 'border:2px solid #df0000',
    'box-shadow:0 0 0 4px rgba(223,0,0,.12)', 'pointer-events:none', 'opacity:0',
    'transition:left .45s cubic-bezier(.4,0,.2,1),top .45s cubic-bezier(.4,0,.2,1),opacity .2s,transform .12s',
  ].join(';');
  const attach = () => { if (document.body && !dot.isConnected) document.body.appendChild(dot); };
  attach();
  document.addEventListener('DOMContentLoaded', attach);
  window.__mfCursor = {
    to(x, y) { attach(); dot.style.left = x + 'px'; dot.style.top = y + 'px'; dot.style.opacity = '1'; },
    press() { dot.style.transform = 'scale(.6)'; setTimeout(() => { dot.style.transform = 'scale(1)'; }, 160); },
    hide() { dot.style.opacity = '0'; },
  };
})();
`;

/** Move the cursor onto a selector, pause so the viewer sees it, then click it via the DOM. */
export async function clickAt(frame, selector, { pause = 900, nth = 0 } = {}) {
  await frame.evaluate(({ sel, i }) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) throw new Error('cursor target not found: ' + sel);
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  }, { sel: selector, i: nth });
  await frame.waitForTimeout(pause);
  await frame.evaluate(() => window.__mfCursor?.press());
  await frame.waitForTimeout(160);
  await frame.evaluate(({ sel, i }) => {
    const el = document.querySelectorAll(sel)[i];
    el.click();
  }, { sel: selector, i: nth });
}

/**
 * webm -> GIF. `segments` keeps only the interesting time ranges, so a 40s recording with a
 * 20s "saving…" gap still becomes a short GIF.
 */
export function toGif(webm, gifOut, { width = 820, fps = 6, quality = 24, segments = null } = {}) {
  const work = fs.mkdtempSync(path.join(path.dirname(gifOut), 'frames-'));
  const ff = ffmpegPath();
  const ranges = segments && segments.length ? segments : [null];
  let index = 0;

  for (const range of ranges) {
    const args = [];
    if (range) { args.push('-ss', String(range[0]), '-t', String(range[1] - range[0])); }
    args.push('-i', webm, '-vf', `scale=${width}:-1`, '-r', String(fps),
              path.join(work, `s${index}-%05d.png`));
    execFileSync(ff, args, { stdio: 'ignore' });
    index++;
  }

  const frames = fs.readdirSync(work).filter((f) => f.endsWith('.png')).sort();
  if (!frames.length) throw new Error('ffmpeg produced no frames for ' + webm);

  const first = PNG.sync.read(fs.readFileSync(path.join(work, frames[0])));
  const encoder = new GIFEncoder(first.width, first.height, 'neuquant', true, frames.length);
  encoder.setDelay(Math.round(1000 / fps));
  encoder.setQuality(quality);
  encoder.setRepeat(0);
  encoder.start();
  for (const f of frames) {
    encoder.addFrame(PNG.sync.read(fs.readFileSync(path.join(work, f))).data);
  }
  encoder.finish();
  fs.writeFileSync(gifOut, encoder.out.getData());
  fs.rmSync(work, { recursive: true, force: true });

  return { gif: gifOut, frames: frames.length, bytes: fs.statSync(gifOut).size,
           size: `${first.width}x${first.height}` };
}

/** Log in once; every scenario starts from an authenticated page. */
export async function login(page, site, user, pass) {
  await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 120000 });
  if (await page.locator('input[id*="txtUsername"]').count()) {
    await page.locator('input[id*="txtUsername"]').fill(user);
    await page.locator('input[id*="txtPassword"]').fill(pass);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {}),
      page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
    ]);
  }
}

/** Open Persona Bar → Content → MegaForm and wait for the list. */
export async function openPanel(page) {
  const pb = page.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
  if (!pb) throw new Error('Persona Bar frame not found');
  await clickAt(pb, 'li#Content', { pause: 700 });
  await pb.waitForTimeout(700);
  await clickAt(pb, 'li#MegaForm', { pause: 700 });
  await pb.waitForSelector('.mf-pb-table tbody tr', { timeout: 60000 });
  await page.mouse.move(900, 500);          // let the Content flyout close
  await pb.waitForTimeout(1600);
  return pb;
}
