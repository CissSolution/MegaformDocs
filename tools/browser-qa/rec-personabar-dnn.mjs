// Records the three Persona Bar demos used by Docs/docfx/articles/dnn-persona-bar.md.
//
//   node tools/browser-qa/rec-personabar-dnn.mjs [site] [user] [pass] [outDir] [scenario]
//
// scenario: new-form | submissions | add-to-page | all (default)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CURSOR_SCRIPT, clickAt, login, openPanel, toGif } from './gif-recorder-lib.mjs';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'demo-gifs');
const only = process.argv[6] || 'all';
const videoDir = path.join(outDir, '_video');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 720 };

// Log in ONCE, outside any recorded context: the login page and its redirect were ten seconds of
// dead footage at the head of every clip, and dead footage is most of a GIF's weight.
let storageState = null;
async function signIn() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await login(page, site, user, pass);
  storageState = await context.storageState();
  await browser.close();
}

async function record(name, steps) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    storageState,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  await steps(page);
  await page.waitForTimeout(1200);
  const video = page.video();
  await context.close();
  const webm = await video.path();
  await browser.close();

  const gif = path.join(outDir, name + '.gif');
  const info = toGif(webm, gif, { width: 640, fps: 5, quality: 28 });
  console.log(name, JSON.stringify(info));
  return info;
}

// ── 1. New form ───────────────────────────────────────────────────────────────
// The point of the clip: the panel opens, New form is pressed, and the 5-STEP WIZARD appears -
// not the builder of the form the host module was showing, and not the legacy template chooser
// (both fixed 2026-08-10).
async function newForm(page) {
  await page.goto(site + '/mfqa-wide?mfFormId=221', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  const pb = await openPanel(page);
  await pb.waitForTimeout(1500);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {}),
    clickAt(pb, '.mf-pb-new', { pause: 1100 }),
  ]);
  await page.waitForTimeout(9000);   // let the wizard's first step settle on screen
}

// ── 2. Submissions ────────────────────────────────────────────────────────────
async function submissions(page) {
  await page.goto(site + '/mfqa-wide?mfFormId=221', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  const pb = await openPanel(page);

  // Sort by Submissions so the row we open obviously has data - it also shows the new sort.
  await clickAt(pb, '.mf-pb-table th[data-mf-sort="submissions"] .mf-pb-sort', { pause: 900 });
  await pb.waitForTimeout(2200);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {}),
    clickAt(pb, '.mf-pb-table tbody tr:first-child .mf-pb-action', { pause: 1000, nth: 1 }),
  ]);
  await page.waitForTimeout(9000);
}

// ── 3. Add to current page ────────────────────────────────────────────────────
async function addToCurrentPage(page) {
  await page.goto(site + '/mfqa-form', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(5000);
  const pb = await openPanel(page);
  await clickAt(pb, '.mf-pb-addto', { pause: 1000 });
  await pb.waitForSelector('.mf-pb-drop', { timeout: 30000 });
  await pb.waitForTimeout(2500);                       // the picker shows "you are here" selected
  await clickAt(pb, '.mf-pb-confirm', { pause: 1100 });
  await pb.waitForTimeout(5000);                       // the confirmation with the page link
}

const scenarios = {
  'new-form': ['21-personabar-new-form', newForm],
  'submissions': ['22-personabar-submissions', submissions],
  'add-to-page': ['23-personabar-add-to-current-page', addToCurrentPage],
};

await signIn();

for (const [key, [name, steps]] of Object.entries(scenarios)) {
  if (only !== 'all' && only !== key) continue;
  await record(name, steps);
}
