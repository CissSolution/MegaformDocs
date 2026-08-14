/**
 * Record the four integration demo GIFs that the docs embed.
 *
 *   30-db-pane-groups.gif      the builder's Database tab: grouped, collapsed, searchable
 *   31-webhook-crm.gif         a submission arriving at the CRM twice — open, then Bearer-authenticated
 *   32-sql-insert-lead.gif     a submission arriving as a row in the customer's own CRM_Leads table
 *   33-bpmn-api-task.gif       the BPMN canvas' API service task, and the order it creates
 *   34-db-insert-settings.gif  Form Settings → Database: connection, target table, INSERT SQL,
 *                              :token mapping, and the Test button proving it against the real table
 *
 * 30 and 34 both show "the builder and SQL" but answer different questions: 30 is the table BROWSER
 * (what is in the database), 34 is the CONFIGURATION that writes to it (owner, 2026-08-13 — the
 * int-sql-insert doc needs the second one, because a reader who has seen a table list still does not
 * know where the INSERT is entered).
 *
 * Sample people are deliberately fictional and English (owner, 2026-08-13).
 *
 *   35-bpmn-api-task-canvas.gif  the BPMN palette and canvas: Service Task badged API, wired between
 *                                Form submitted and Done
 *   36-webhook-node-config.gif   the Webhook node's settings: destination, payload, auth, response
 *
 * Prerequisites depend on WHICH scenario:
 *   30 / 34 / 35 / 36  — builder-only. Just the site and a host login; nothing leaves the machine.
 *   31 / 33            — need the mock CRM running AND a host that is allowed to call loopback:
 *                        node tools/mock-crm/mock-crm-server.mjs
 *                        MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1 on the host
 *                        ⚠️ On DNN neither is enough today: the workflow engine records no execution
 *                        at all for the webhook demo form (see handoff §13.3), so 31/33 film nothing.
 *   32                 — needs the seeded form plus sqlcmd for the evidence shot.
 *   Seeded demo forms come from: node tools/samples/seed-integration-demos.mjs
 *
 * Run: node tools/samples/record-integration-gifs.mjs [--only 31] [--site http://localhost:5131]
 * Writes: demo-gifs/ and Docs/docfx/images/
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { CURSOR_SCRIPT, clickAt, pickSegments, toGif } from '../browser-qa/gif-recorder-lib.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const PLATFORM = arg('platform', 'oqtane').toLowerCase();
const IS_DNN = PLATFORM === 'dnn';
const SITE = arg('site', IS_DNN ? 'http://dnn_megafresh.ai' : 'http://localhost:5131').replace(/\/$/, '');
const CRM = arg('crm', 'http://localhost:5199');
const ONLY = arg('only', '');
const USER = arg('user', 'host');
const PASS = arg('pass', IS_DNN ? 'Dnn@Host2026' : 'abc@ABC1024');
const DB = arg('db', IS_DNN ? 'DNN_MegaFresh' : 'Oqtane_MegaForm_KB20812');
const DBSERVER = arg('dbserver', IS_DNN ? 'WINDOWS-11\\SQLEXPRESS' : '.\\SQLEXPRESS');

// Where each demo lives. Oqtane can serve a form straight from /api/MegaForm/render/{id}; DNN has
// no such endpoint, so every demo sits on its own page and the builder opens through the module's
// Edit control (?ctl=Edit&mid=…).
const DNN_PAGES = {
  sqlInsert: { path: '/MegaFormDemo1SQLInsert', moduleId: Number(arg('mid1', '386')), formId: Number(arg('fid1', '7')) },
  webhook: { path: '/MegaFormDemo2Webhook', moduleId: Number(arg('mid2', '387')), formId: Number(arg('fid2', '8')) },
  apiTask: { path: '/MegaFormDemo3APITask', moduleId: Number(arg('mid3', '388')), formId: Number(arg('fid3', '9')) },
};
const formUrl = (k, oqFormId) => (IS_DNN ? SITE + DNN_PAGES[k].path : `${SITE}/api/MegaForm/render/${oqFormId}`);
// ?ctl=Edit with no formId lands on "Create a New Form" (the template picker), not on the form
// the module renders — FormEdit.ascx.cs reads the id from the query string.
const builderUrl = (k, oqFormId) => (IS_DNN
  ? `${SITE}${DNN_PAGES[k].path}?ctl=Edit&mid=${DNN_PAGES[k].moduleId}&formId=${DNN_PAGES[k].formId}`
  : `${SITE}/?mfpanel=builder&formId=${oqFormId}`);

const REPO = 'E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um';
const WORK = path.join(REPO, 'qa-out/integration-demos/video');
const GIFS = path.join(REPO, 'demo-gifs');
const DOCIMG = path.join(REPO, 'Docs/docfx/images');
[WORK, GIFS, DOCIMG].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// A real browser UA and unhurried typing: AntiSpamService scores "HeadlessChrome" +25 and a
// >2-field form finished in under 3 seconds +30, and 50 is the spam threshold. A flagged
// submission skips the whole workflow, so a rushed recording films nothing arriving.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

const stamp = String(Date.now()).slice(-5);

/** The builder asks "leave this page?" on navigate; the dialog handler dismisses it, which aborts
 *  the navigation. Drop the handler (and the dirty flag it guards) before moving on. */
async function leaveBuilder(page) {
  await page.evaluate(() => {
    try { const B = window.MegaFormBuilder; if (B && B.state) B.state.isDirty = false; } catch { /* not the builder */ }
    window.onbeforeunload = null;
  });
}

async function record(name, viewport, scenario, gifOpts = {}) {
  const dir = path.join(WORK, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // A local QA host lives only in the Windows hosts file and Chromium's resolver ignores it, so
  // page.goto hangs to the timeout and reads as "the site is down". Pin the name explicitly.
  const host = (() => { try { return new URL(SITE).hostname; } catch { return ''; } })();
  const resolverArgs = /^(localhost|127\.)/.test(host) ? [] : [`--host-resolver-rules=MAP ${host} 127.0.0.1`];
  const browser = await chromium.launch({ headless: true, args: resolverArgs });
  const ctx = await browser.newContext({ viewport, userAgent: UA, recordVideo: { dir, size: viewport } });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  // Video recording starts with the page, so elapsed-time marks line up with the webm timeline.
  const t0 = Date.now();
  const marks = [];
  let cropRect = null;
  // mark()    — "the part worth keeping runs between these calls"
  // setCrop() — "crop to this rect", measured live because a panel's box depends on how wide the
  //             scenario dragged it, which no constant in this file can know.
  const api = { mark: () => marks.push((Date.now() - t0) / 1000), setCrop: (r) => { cropRect = r; } };
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  try {
    await scenario(page, ctx, api);
  } finally {
    await page.close();
    await ctx.close();
    await browser.close();
  }
  const webm = fs.readdirSync(dir).filter((f) => f.endsWith('.webm')).map((f) => path.join(dir, f))[0];
  if (!webm) throw new Error('no video for ' + name);
  // Width and fps decide the size, and nothing else comes close: 860px @ 6fps over 20s of kept
  // footage lands around 15 MB, which is not a file anyone wants in a docs page. 720 @ 5 with a
  // tighter segment budget holds it near 5 MB and stays readable.
  // A scenario that calls mark() has stated exactly which window matters, so trust it over the
  // motion heuristic. pickSegments scores the page LOAD as the most eventful thing in a builder
  // recording and can drop a quiet settings panel completely — it once produced a 34-frame GIF in
  // which the panel being demonstrated never appears at all (2026-08-13).
  // An EVEN number of marks reads as start/end PAIRS, which is how a scenario keeps two moments and
  // throws away the dead air between them (filling a form, then the row that appeared in the
  // customer's table 20 seconds and one sqlcmd later). An odd count keeps one span, first to last.
  let segments;
  if (marks.length >= 2 && marks.length % 2 === 0) {
    segments = [];
    for (let i = 0; i < marks.length; i += 2) {
      segments.push([Math.max(0, marks[i] - 0.4), marks[i + 1] + 0.4]);
    }
  } else if (marks.length) {
    segments = [[Math.max(0, marks[0] - 0.6), marks[marks.length - 1] + 0.6]];
  } else {
    segments = pickSegments(webm, { threshold: 1.4, pad: 1, gap: 2, maxSeconds: gifOpts.maxSeconds || 18 });
  }
  const out = path.join(GIFS, name + '.gif');
  const info = toGif(webm, out, { width: 720, fps: 5, quality: 28, ...gifOpts, segments, crop: cropRect || gifOpts.crop || null });
  fs.copyFileSync(out, path.join(DOCIMG, name + '.gif'));
  console.log(`${name}: ${info.size}, ${info.frames} frames, ${(info.bytes / 1048576).toFixed(2)} MB`);
  return info;
}

async function login(page) {
  if (IS_DNN) {
    // /?ctl=Login 301s to the friendly URL; go straight there.
    await page.goto(SITE + '/Login?returnurl=%2f', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(USER);
    await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(PASS);
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}),
      page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
    ]);
    await page.waitForTimeout(4000);
    return;
  }
  await page.goto(SITE + '/login', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('input[placeholder="Username"]').fill(USER);
  await page.locator('input[placeholder="Password"]').fill(PASS);
  await page.locator('button:has-text("Login")').click();
  await page.waitForTimeout(6000);
}

/** Type into a public form field the way the renderer expects, one field at a time. */
async function typeField(page, key, value) {
  await page.evaluate(({ k, v }) => {
    const el = document.querySelector(`[name="${k}"]`) || document.querySelector(`#${k}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { k: key, v: value });
  await page.waitForTimeout(900);
}

async function submitForm(page, waitAfter = 6500) {
  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"], .mf-submit-btn')
      || [...document.querySelectorAll('button')].find((x) => /submit|send/i.test(x.textContent || ''));
    if (!btn) return;
    btn.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = btn.getBoundingClientRect();
    window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__mfCursor?.press());
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const btn = document.querySelector('button[type="submit"], .mf-submit-btn')
      || [...document.querySelectorAll('button')].find((x) => /submit|send/i.test(x.textContent || ''));
    btn?.click();
  });
  await page.waitForTimeout(waitAfter);
}

const want = (n) => !ONLY || ONLY === n;

/** Move the recorded cursor onto an element WITHOUT clicking it. Reading a settings panel is the
 *  point of scenario 34, and several of its controls mutate state when clicked — "Generate INSERT"
 *  replaces the configured statement with a synthesised one, which would film the demo destroying
 *  its own configuration. */
// `scroll` defaults to FALSE: once a scenario has framed a panel and cropped the GIF to it, a
// helpful scrollIntoView slides the subject out of the crop and the demo films the wrong rectangle.
async function hoverAt(page, selector, pause = 1500, { scroll = false } = {}) {
  await page.evaluate(({ sel, doScroll }) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('hover target not found: ' + sel);
    if (doScroll) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  }, { sel: selector, doScroll: scroll });
  await page.waitForTimeout(pause);
}

/** Hover the first element matching `selector` whose text matches `re`. The BPMN palette and canvas
 *  label everything by text, not by id: "Service Task" and "Service Task (DB)" share a class, and the
 *  canvas node carries the label the seeder gave it. */
async function hoverText(page, selector, re, pause = 1500, { scroll = false } = {}) {
  const found = await page.evaluate(({ sel, src, flags, doScroll }) => {
    const rx = new RegExp(src, flags);
    // offsetParent !== null: the target must be ON SCREEN, not merely in the DOM. A collapsed section
    // ("Advanced options" ships shut, with Auth type and Response routes inside it) keeps its labels
    // in the document, so a text match alone happily points the cursor at a zero-sized box and the
    // recording shows nothing at all. Failing loudly here is the whole point.
    const el = [...document.querySelectorAll(sel)]
      .find((e) => e.offsetParent !== null && rx.test((e.textContent || '').replace(/\s+/g, ' ')));
    if (!el) return null;
    if (doScroll) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    // Return an OBJECT, not the matched text: an <input> has no textContent, so a bare string return
    // hands back '' for a perfectly good hit and every falsy-check upstream calls it a miss.
    return { hit: true, text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 40) };
  }, { sel: selector, src: re.source, flags: re.flags.replace('g', ''), doScroll: scroll });
  if (!found || !found.hit) throw new Error(`hoverText found nothing: ${selector} =~ ${re}`);
  await page.waitForTimeout(pause);
  return found.text;
}

/** clickAt() always scrolls its target to centre; this one clicks where the element already is. */
async function clickHere(page, selector, pause = 1200) {
  await hoverAt(page, selector, pause);
  await page.evaluate(() => window.__mfCursor?.press());
  await page.waitForTimeout(160);
  await page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
}

// ── 30 — the Database tab ────────────────────────────────────────────────────
if (want('30')) {
  await record('30-db-pane-groups', { width: 1500, height: 900 }, async (page) => {
    await login(page);
    await page.goto(builderUrl('sqlInsert', 1), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(9000);
    await clickAt(page, '#mf-tab-link-db', { pause: 1200 });
    await page.waitForTimeout(5000);                                   // "Your tables" only
    await clickAt(page, '#mf-db-tables-body [data-show-system]', { pause: 1400 });
    await page.waitForTimeout(3500);                                   // three groups, counted
    await clickAt(page, '[data-group-toggle="megaform"]', { pause: 1400 });
    await page.waitForTimeout(2500);                                   // 25 rows + a pager
    await clickAt(page, '.mf-bdb-group[data-group="megaform"] .mf-bdb-more', { pause: 1200 });
    await page.waitForTimeout(2200);
    await clickAt(page, '[data-group-toggle="megaform"]', { pause: 900 });
    await page.waitForTimeout(1200);
    // Type through the DOM rather than page.type: on DNN the right rail can leave the search box
    // scrolled out of the viewport, and Playwright then refuses to click an "invisible" element.
    await page.evaluate(() => {
      const el = document.querySelector('#mf-db-tables-body [data-search]');
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      el.focus();
    });
    await page.waitForTimeout(700);
    for (const ch of 'crm') {
      await page.evaluate((c) => {
        const el = document.querySelector('#mf-db-tables-body [data-search]');
        if (!el) return;
        el.value += c;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, ch);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(2600);                                   // filter opens the matches
    await clickAt(page, '#mf-db-tables-body .mf-bdb-table .mf-bdb-table-head', { pause: 1200 });
    await page.waitForTimeout(4000);                                   // real columns, was a 500
  }, { fps: 4, quality: 30, maxSeconds: 15 });
}

// Playwright records ONE VIDEO PER PAGE. A second tab is a second webm, so a scenario that fills a
// form in tab 1 and shows the result in tab 2 produces a GIF of the form and nothing else — the
// payoff lands in a file nobody assembles. Every scenario below therefore stays on one page and
// NAVIGATES to the evidence.

// ── 31 — webhook to the CRM, open then authenticated ─────────────────────────
if (want('31')) {
  await record('31-webhook-crm', { width: 1280, height: 900 }, async (page) => {
    await page.goto(formUrl('webhook', 12), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    await typeField(page, 'full_name', 'Daniel Brooks');
    await typeField(page, 'email', `lead${stamp}@acme-demo.com`);
    await typeField(page, 'phone', '+1 415 555 0148');
    await typeField(page, 'message', 'Please send the enterprise pricing.');
    await submitForm(page);
    await page.goto(CRM + '/', { waitUntil: 'domcontentloaded' });      // the receiving end
    await page.waitForTimeout(7000);                                    // two rows: open + Bearer
  });
}

// ── 32 — submit-time INSERT into the customer's table ────────────────────────
if (want('32')) {
  await record('32-sql-insert-lead', { width: 1280, height: 900 }, async (page, _ctx, api) => {
    await page.goto(formUrl('sqlInsert', 11), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    await typeField(page, 'full_name', 'Emily Carter');
    await typeField(page, 'email', `contact${stamp}@acme-demo.com`);
    await typeField(page, 'phone', '+1 415 555 0132');
    api.mark();                                  // ── keep: the finished form, and what it answers with
    await typeField(page, 'message', 'Please send a quote for 100 units.');
    await submitForm(page, 3000);
    api.mark();
    // The table itself is the evidence — a green form is not, because the insert is fail-soft.
    // Left to the motion heuristic this GIF kept the form and the thank-you and dropped the table
    // entirely (2026-08-13), i.e. everything except the claim the article makes.
    execFileSync(process.execPath, [path.join(REPO, 'tools/samples/show-crm-leads.mjs'),
      '--db', DB, '--server', DBSERVER, '--top', '2'], { stdio: 'ignore' });
    await page.goto('file:///' + path.join(REPO, 'qa-out/integration-demos/crm-leads.html').replace(/\\/g, '/'),
      { waitUntil: 'domcontentloaded' });
    api.mark();                                  // ── keep: the row in the customer's own table
    await page.waitForTimeout(3200);
    api.mark();
  }, { fps: 3, quality: 30 });
}

// ── 33 — the BPMN API service task ───────────────────────────────────────────
if (want('33')) {
  await record('33-bpmn-api-task', { width: 1500, height: 900 }, async (page) => {
    await login(page);
    await page.goto(builderUrl('apiTask', 13), { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(9000);
    await clickAt(page, '#mf-tab-link-workflow', { pause: 1400 });
    await page.waitForTimeout(10000);                                  // canvas: trigger → API task → end
    // Open the service task so its URL and field mapping are on screen.
    const opened = await page.evaluate(() => {
      const n = [...document.querySelectorAll('.react-flow__node')]
        .find((el) => /API service task/i.test(el.textContent || ''));
      if (!n) return false;
      n.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = n.getBoundingClientRect();
      window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(opened ? 8000 : 2000);
    // Then the same four fields go in, and the order comes out the other side.
    await leaveBuilder(page);
    await page.goto(formUrl('apiTask', 13), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await typeField(page, 'customer_code', 'ACME-001');
    await typeField(page, 'contact_name', 'Marcus Reid');
    await typeField(page, 'contact_email', `order${stamp}@acme-demo.com`);
    await typeField(page, 'amount', '12500');
    await submitForm(page);
    await page.goto(CRM + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7000);
  });
}

// ── 34 — where the INSERT is actually configured ─────────────────────────────
// Everything on this panel is already populated by the seeded form, so the scenario only reveals
// and tests — it never types. That matters: the picker preselects the target table by parsing the
// configured "INSERT INTO", and re-picking it (or pressing "Generate INSERT") would rewrite the
// statement on camera.
if (want('34')) {
  await record('34-db-insert-settings', { width: 1500, height: 950 }, async (page, _ctx, api) => {
    await login(page);
    await page.goto(builderUrl('sqlInsert', 11), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(11000);
    // Form Settings is a COLLAPSED accordion on load — the whole Database group is display:none
    // until its head is clicked, so walking straight to the panel films an empty rail.
    await clickAt(page, '[data-mf-design-toggle="settings"]', { pause: 1400 });
    await page.waitForTimeout(3000);
    // In its default 340px rail the panel is unreadable once the frame is scaled down for a GIF, so
    // widen it the way a designer does: #mf-right-resizer is a real splitter (min 420, max 1120).
    const rz = await page.evaluate(() => {
      const e = document.querySelector('#mf-right-resizer');
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    });
    if (!rz) throw new Error('#mf-right-resizer not found — cannot widen the settings panel');
    await page.mouse.move(rz.x, rz.y);
    await page.mouse.down();
    for (const x of [rz.x - 200, rz.x - 420, rz.x - 620]) { await page.mouse.move(x, rz.y, { steps: 8 }); await page.waitForTimeout(140); }
    await page.mouse.up();
    await page.waitForTimeout(1400);
    // At full width the whole Database group fits on one screen, so frame it once and hold still:
    // every later beat is a cursor move, not a scroll.
    const box = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.mf-prop-group')]
        .find((x) => /Database \(save/i.test((x.querySelector('h6') || {}).textContent || ''));
      if (!g) return null;
      g.scrollIntoView({ block: 'center', behavior: 'instant' });
      const b = g.getBoundingClientRect();
      const panel = document.querySelector('.mf-panel-right').getBoundingClientRect();
      return { x: Math.round(panel.x), y: Math.round(b.y), w: Math.round(panel.width), h: Math.round(b.height) };
    });
    if (!box) throw new Error('Database settings group not found');
    await page.waitForTimeout(600);
    // Reserve room BELOW the group: the result box is appended to it when the test runs, so a crop
    // measured against the group's pre-click height cuts the answer in half — the first cut of this
    // GIF lost the "Rows affected (then rolled back)" line, which is the line that proves it worked.
    const even = (n) => (n % 2 ? n - 1 : n);
    const cx = Math.max(0, box.x - 6);
    const cy = Math.max(0, box.y - 24);
    api.setCrop({
      x: even(cx),
      y: even(cy),
      w: even(Math.min(1500 - cx, box.w + 12)),
      h: even(Math.min(950 - cy - 4, box.h + 170)),
    });

    api.mark();                                               // ── keep from here ──
    await hoverAt(page, '#mf-setting-db-insert-enabled', 800);    // "Enable database INSERT on submit"
    await hoverAt(page, '#mf-setting-db-insert-conn', 1000);      // named connection, resolved server-side
    await hoverAt(page, '#mf-setting-db-insert-table', 800);      // target table…
    await hoverAt(page, '#mf-setting-db-insert-cols', 1200);      // …and its 10 real columns, mapped or not
    await hoverAt(page, '#mf-setting-db-insert-fields', 1000);    // the :token chips = the parameter mapping
    await hoverAt(page, '#mf-setting-db-insert-sql', 1400);       // the INSERT statement itself
    // The payoff: the server runs this INSERT against the real table inside a transaction and rolls
    // it back, reporting the parameters it bound. A screenshot of a filled-in form proves nothing.
    await clickHere(page, '#mf-setting-db-insert-test', 800);
    await page.waitForTimeout(2800);
    api.mark();                                               // ── to here ──
    // Measured on this footage: ~3.0e-7 MB per pixel per frame, so width and frame COUNT are the
    // only two levers that matter. The same beats ran 12 MB at 860 @ 4fps and 4.5 MB at 760 @ 3fps;
    // 760 @ 2fps holds it near 3 MB while keeping the panel text at ~0.8 scale, which is the whole
    // reason for cropping. Every beat here is a HOLD, so a low frame rate costs nothing to read.
  }, { width: 760, fps: 2, quality: 30 });
}

/** Scroll a panel (or its first scrollable descendant) in visible steps, so the GIF shows the reveal
 *  rather than a jump cut. The BPMN node panel is ~440px wide and taller than the screen. */
async function scrollPanel(page, selector, by, steps = 4) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(({ sel, amount }) => {
      const root = document.querySelector(sel);
      if (!root) throw new Error('scrollPanel: no ' + sel);
      const target = (root.scrollHeight > root.clientHeight + 4)
        ? root
        : [...root.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4) || root;
      target.scrollTop += amount;
    }, { sel: selector, amount: Math.round(by / steps) });
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(400);
}

// ── 35 — the BPMN canvas: where an API service task comes from ────────────────
// For ?doc=int-bpmn-api-task. The BPMN tab opens a FULL-SCREEN editor (own top bar, palette, canvas,
// node panel) rather than a rail inside the builder - so there is no #mf-right-resizer here and the
// palette cannot be widened; the crop is what makes it readable.
if (want('35')) {
  await record('35-bpmn-api-task-canvas', { width: 1500, height: 950 }, async (page, _ctx, api) => {
    await login(page);
    await page.goto(builderUrl('apiTask', 13), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(11000);
    await clickAt(page, '#mf-tab-link-workflow', { pause: 1400 });
    await page.waitForTimeout(11000);
    const box = await page.evaluate(() => {
      const canvas = document.querySelector('.react-flow');
      const nodes = [...document.querySelectorAll('.react-flow__node')].map((n) => n.getBoundingClientRect());
      if (!canvas || !nodes.length) return null;
      return {
        right: Math.round(canvas.getBoundingClientRect().right),
        nodeBottom: Math.round(Math.max(...nodes.map((r) => r.bottom))),
        count: nodes.length,
      };
    });
    if (!box) throw new Error('BPMN canvas or its nodes not found');
    const even = (n) => (n % 2 ? n - 1 : n);
    // x from 0 so the palette is in shot - the article's step 3 is "drag Service Task from the
    // palette", which is unillustratable without the palette. Bottom padded past the node row.
    api.setCrop({ x: 0, y: 48, w: even(box.right), h: even(Math.min(950 - 48, box.nodeBottom + 90 - 48)) });

    api.mark();                                                          // ── keep from here ──
    await hoverText(page, '.mf-rf-palette__group-label', /User and Service Tasks/i, 1400);
    // Type in the palette search so the GIF carries a real change, not only a moving dot: the list
    // narrows to the three Service Task variants, which is the article's "drag Service Task (the one
    // badged API)" made visible.
    await hoverText(page, '.mf-rf-palette__search-input', /.?/, 700);
    for (const ch of 'service') {
      // ⚠️ The BPMN editor is REACT. A plain `el.value += c` leaves React's own value in place, so the
      // box stays empty and the list never filters - measured: 10 palette items before, 10 after,
      // input.value ''. Going through the native value setter (as typeField does for form fields)
      // filters to 3. It fails silently either way, which is how a GIF ends up filming nothing.
      await page.evaluate((c) => {
        const el = document.querySelector('.mf-rf-palette__search-input');
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, (el.value || '') + c);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, ch);
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(1700);                                     // filtered: API / DB / Sheet
    // "Service Task" badged API. Its siblings are Service Task (DB) and Service Task (Sheet), and the
    // badge text is part of the item's textContent - hence the anchored API prefix.
    await hoverText(page, '.mf-rf-palette-item', /^API\s*Service Task$/, 1700);
    await hoverText(page, '.mf-rf-node', /API service task/i, 1300);
    await page.evaluate(() => {
      const n = [...document.querySelectorAll('.react-flow__node')].find((el) => /API service task/i.test(el.textContent || ''));
      window.__mfCursor?.press();
      n?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(3000);                                     // node selected + panel opens
    api.mark();                                                          // ── to here ──
  }, { width: 900, fps: 2, quality: 30 });
}

// ── 36 — the Webhook node's own settings panel ────────────────────────────────
// For ?doc=int-webhook, whose sections ARE this panel: Destination, Authentication, Use the reply.
if (want('36')) {
  await record('36-webhook-node-config', { width: 1500, height: 950 }, async (page, _ctx, api) => {
    await login(page);
    await page.goto(builderUrl('webhook', 12), { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(11000);
    await clickAt(page, '#mf-tab-link-workflow', { pause: 1400 });
    await page.waitForTimeout(11000);
    // The Bearer-token node, not the open one: it is the only one with Authentication filled in, and
    // the article devotes a section to it.
    await page.evaluate(() => {
      const n = [...document.querySelectorAll('.react-flow__node')].find((el) => /Bearer/i.test(el.textContent || ''));
      if (!n) throw new Error('Bearer-token webhook node not on the canvas');
      n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(5500);
    const panel = await page.evaluate(() => {
      const e = document.querySelector('.mf-rf-config');
      if (!e || !e.offsetParent) return null;
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    if (!panel) throw new Error('.mf-rf-config panel did not open');
    const even = (n) => (n % 2 ? n - 1 : n);
    api.setCrop({ x: even(Math.max(0, panel.x - 6)), y: even(Math.max(0, panel.y - 6)),
                  w: even(Math.min(1500 - panel.x + 6, panel.w + 12)),
                  h: even(Math.min(950 - panel.y + 6, panel.h + 12)) });

    api.mark();                                                          // ── keep from here ──
    await hoverText(page, '.mf-rf-cfg-label', /^Webhook URL/i, 800);    // Destination
    // Type a destination that means something to the reader. The seeded demo points at the local
    // mock (http://localhost:5199/...), which is our test rig and is exactly the kind of thing a DNN
    // site owner has never heard of - and MegaForm's SSRF guard refuses loopback anyway, so it is not
    // even a URL they could copy. Editing here only dirties the canvas; nothing is saved or applied.
    // Pin the element ONCE. Re-finding it per keystroke by "the input that looks like a URL" stops
    // matching the moment the box is cleared, and would then happily type into some other field.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('.mf-rf-config input')].find((i) => /^https?:\/\//.test(i.value || ''));
      if (!el) throw new Error('webhook URL input not found');
      window.__mfUrlInput = el;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const r = el.getBoundingClientRect();
      window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    });
    await page.waitForTimeout(500);
    for (const ch of 'https://crm.acme-demo.com/api/leads') {
      await page.evaluate((c) => {
        const el = window.__mfUrlInput;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, (el.value || '') + c);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, ch);
      await page.waitForTimeout(45);
    }
    await page.waitForTimeout(900);
    await hoverText(page, '.mf-rf-cfg-label', /^Method$/i, 800);
    await hoverText(page, '.mf-rf-cfg-label', /^Payload mode$/i, 1100);  // Payload
    await scrollPanel(page, '.mf-rf-config', 300);
    // Authentication and Use-the-reply live behind a COLLAPSED "Advanced options" disclosure - the
    // article's own words are "Advanced options → Auth type". Open it on camera.
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('summary, button, a, div, span')].find((e) =>
        /^[\s▸▾▶▼]*Advanced options[\s]*$/.test((e.textContent || '')) && e.children.length <= 2);
      if (!t) throw new Error('"Advanced options" disclosure not found');
      t.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = t.getBoundingClientRect();
      window.__mfCursor?.to(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      window.__mfCursor?.press();
      const t = [...document.querySelectorAll('summary, button, a, div, span')].find((e) =>
        /^[\s▸▾▶▼]*Advanced options[\s]*$/.test((e.textContent || '')) && e.children.length <= 2);
      t.click();
    });
    await page.waitForTimeout(1300);
    await hoverText(page, '.mf-rf-cfg-label', /^Auth type$/i, 1100);     // Authentication
    await hoverText(page, '.mf-rf-cfg-label', /^Bearer token$/i, 1100);
    await scrollPanel(page, '.mf-rf-config', 300);
    await hoverText(page, '.mf-rf-cfg-label', /^Response variable$/i, 1100);  // Use the reply
    await hoverText(page, '.mf-rf-cfg-label', /^Response routes$/i, 1400);
    api.mark();                                                          // ── to here ──
    // The panel is ~445px wide. Output at its own size: upscaling to the 720 default would triple the
    // bytes without adding a single readable pixel.
  }, { width: 420, fps: 2, quality: 30 });
}

console.log('\nGIFs written to demo-gifs/ and Docs/docfx/images/');
