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
  // Always move the dot to the END of <body>, not merely "append it if detached". Full-screen product
  // overlays (the BPMN editor, the builder shell) also sit at z-index 2147483647, and equal z-index is
  // broken by DOM ORDER - an overlay mounted after the cursor paints on top of it. The cursor then
  // measures perfectly (display block, visibility visible, opacity 1, a real 22px rect at the right
  // coordinates) and is nowhere in the recording, which sends you hunting for a style bug that is not
  // there. A "dotIsLastChild: false" reading is the tell.
  // (No backticks in this comment: CURSOR_SCRIPT is itself a template literal, so one would end it.)
  const attach = () => {
    if (!document.body) return;
    if (dot !== document.body.lastElementChild) document.body.appendChild(dot);
  };
  attach();
  document.addEventListener('DOMContentLoaded', attach);
  // ðŸ”´ The cursor lives on <body>, and MegaForm's full-screen modes hide every direct child of body
  // that is not on their whitelist - builder/loader ships
  // 'body.mf-builder-open>*:not(#mf-builder-root)...{display:none!important}' and the BPMN editor
  // ships 'body.mf-dnn-workflow-open > *:not(...){display:none!important}'. The dot then reports
  // opacity 1, the right left/top and z-index 2147483647 while computing display:none, which reads
  // like a z-index fight it is not: it filmed a whole BPMN demo with no cursor in a single frame.
  // An INLINE !important declaration outranks any author stylesheet whatever its specificity, so
  // reassert it on every move instead of trying to out-specify the rule.
  const show = () => dot.style.setProperty('display', 'block', 'important');
  show();
  window.__mfCursor = {
    to(x, y) { attach(); show(); dot.style.left = x + 'px'; dot.style.top = y + 'px'; dot.style.opacity = '1'; },
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
 * Find the time ranges where something actually happens, so a GIF can skip the dead air.
 *
 * Passing no `segments` to toGif keeps EVERY frame, and that is how three Persona Bar demos came
 * out at ~70 MB each: the scenarios run about 150 seconds, most of it a still page waiting on a
 * navigation or an animation, and a 150-second GIF is enormous no matter how far you drop the fps
 * or the width. Trimming is the only lever that matters; the rest is rounding.
 *
 * Rather than have a human scrub three videos, sample one small frame a second and keep the
 * seconds that differ from their predecessor. Rounding the samples to 1 fps is deliberate - the
 * cursor blinking or a spinner turning should not count as activity, and at this resolution they
 * do not move enough to clear the threshold.
 *
 * Returns [[startSec, endSec], ...], already merged and padded, capped at `maxSeconds` total, with
 * the busiest ranges kept first. Returns null when nothing stands out, which makes toGif fall back
 * to its keep-everything behaviour rather than silently emitting an empty GIF.
 */
export function pickSegments(webm, { threshold = 1.6, pad = 1, gap = 2, maxSeconds = 24 } = {}) {
  const ff = ffmpegPath();
  const work = fs.mkdtempSync(path.join(path.dirname(webm), 'probe-'));
  try {
    execFileSync(ff, ['-i', webm, '-vf', 'scale=160:-1', '-r', '1', path.join(work, 'p-%05d.png')],
                 { stdio: 'ignore' });
    const shots = fs.readdirSync(work).filter((f) => f.endsWith('.png')).sort();
    if (shots.length < 3) return null;

    // Mean absolute difference against the previous second, as a percentage of full scale.
    const busy = [];
    let prev = null;
    shots.forEach((f, i) => {
      const px = PNG.sync.read(fs.readFileSync(path.join(work, f))).data;
      if (prev) {
        let sum = 0;
        for (let p = 0; p < px.length; p += 4) {
          sum += Math.abs(px[p] - prev[p]) + Math.abs(px[p + 1] - prev[p + 1]) + Math.abs(px[p + 2] - prev[p + 2]);
        }
        const score = (sum / (px.length / 4) / 3) / 255 * 100;
        if (score >= threshold) busy.push({ t: i, score });
      }
      prev = px;
    });
    if (!busy.length) return null;

    // Merge seconds that are close enough to read as one continuous action.
    const merged = [];
    for (const b of busy) {
      const last = merged[merged.length - 1];
      if (last && b.t - last.end <= gap) { last.end = b.t; last.score += b.score; }
      else merged.push({ start: b.t, end: b.t, score: b.score });
    }

    // Keep the most eventful ranges until the budget runs out, then restore chronological order -
    // a demo that jumps backwards in time is worse than one that is slightly too long.
    const dur = (r) => (r.end + pad) - Math.max(0, r.start - pad);
    const kept = [];
    let total = 0;
    for (const r of [...merged].sort((a, b) => b.score - a.score)) {
      if (total + dur(r) > maxSeconds && kept.length) continue;
      kept.push(r); total += dur(r);
    }
    return kept.sort((a, b) => a.start - b.start)
               .map((r) => [Math.max(0, r.start - pad), r.end + pad]);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * webm -> GIF. `segments` keeps only the interesting time ranges, so a 40s recording with a
 * 20s "saving…" gap still becomes a short GIF.
 */
export function toGif(webm, gifOut, { width = 820, fps = 6, quality = 24, segments = null, crop = null } = {}) {
  const work = fs.mkdtempSync(path.join(path.dirname(gifOut), 'frames-'));
  const ff = ffmpegPath();
  const ranges = segments && segments.length ? segments : [null];
  let index = 0;
  // `crop` = {x, y, w, h} in RECORDED pixels, applied before the scale. A 1500px-wide capture shrunk
  // to a 720px GIF renders 12px UI text at ~6px, which is not reading material - the point of a
  // settings-panel demo is that the reader can read the settings. Cropping to the panel keeps the
  // text near 1:1 instead of spending the width on chrome nobody is looking at.
  const vf = (crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : '') + `scale=${width}:-1`;

  for (const range of ranges) {
    const args = [];
    if (range) { args.push('-ss', String(range[0]), '-t', String(range[1] - range[0])); }
    args.push('-i', webm, '-vf', vf, '-r', String(fps),
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
