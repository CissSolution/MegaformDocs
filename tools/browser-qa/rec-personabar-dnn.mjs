// Records the three Persona Bar demos used by Docs/docfx/articles/dnn-persona-bar.md.
//
//   node tools/browser-qa/rec-personabar-dnn.mjs [site] [user] [pass] [outDir] [scenario]
//
// scenario: new-form | submissions | add-to-page | all (default)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CURSOR_SCRIPT, clickAt, login, openPanel, pickSegments, toGif } from './gif-recorder-lib.mjs';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'demo-gifs');
const only = process.argv[6] || 'all';
const videoDir = path.join(outDir, '_video');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });

const VIEWPORT = { width: 1280, height: 720 };

// Force the MegaForm admin UI into English for every recorded frame.
//
// MegaForm resolves its display language as ?mflocale -> localStorage('mf-locale') -> platform
// culture (MegaForm.UI/src/languages/index.ts:279,557). The Languages panel writes that key and
// calls the choice "sticky for your browser" - but Playwright launches a BLANK profile on every
// run, so the recorder never inherits whatever a human picked. Detection fell through to the
// platform culture and the demos came out in Vietnamese while the docs around them are English.
//
// Setting the key here rather than relying on the site makes the language a property of the
// RECORDING, so these GIFs stay English no matter which portal or profile they are captured from.
// addInitScript runs before page scripts on every navigation, which matters because these
// scenarios click through several full page loads.
const FORCE_ENGLISH = `try { localStorage.setItem('mf-locale', 'en-US'); } catch (e) {}`;

// Log in ONCE, outside any recorded context: the login page and its redirect were ten seconds of
// dead footage at the head of every clip, and dead footage is most of a GIF's weight.
let storageState = null;
async function signIn() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  // Seed it here too: storageState carries localStorage, so the recorded contexts start English
  // even before their own init script runs.
  await context.addInitScript(FORCE_ENGLISH);
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
  await context.addInitScript(FORCE_ENGLISH);
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  await steps(page);
  await page.waitForTimeout(1200);
  const video = page.video();
  await context.close();
  const webm = await video.path();
  await browser.close();

  const gif = path.join(outDir, name + '.gif');
  // 640 was half the 1280 capture, and the docs column is wider than that - the browser had to
  // upscale every frame, so the UI text in these demos read soft. 960 keeps the source above the
  // column's own width so the figure renders at or below 1:1.
  //
  // Trim before encoding, always. Without segments these scenarios produced ~70 MB GIFs: they run
  // about 150 seconds and most of that is a motionless page waiting on a navigation. Width and fps
  // barely dent that - only dropping the dead air does. pickSegments returns null if it cannot tell
  // action from stillness, and toGif then keeps everything, so a surprising recording degrades to
  // the old behaviour instead of silently producing an empty demo.
  const segments = pickSegments(webm);
  const info = toGif(webm, gif, { width: 960, fps: 5, quality: 28, segments });
  info.segments = segments;
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
