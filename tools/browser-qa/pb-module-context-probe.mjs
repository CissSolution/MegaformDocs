// Which MegaForm endpoints survive with NO module behind them?
//
// The Persona Bar panel is going to host the dashboard SPA itself (owner, 2026-08-10), and the
// panel has no MegaForm module: no ModuleId, no TabId. Some DNN endpoints do not care, some read
// ActiveModule, and [DnnModuleAuthorize] resolves the module from the request and refuses without
// one. Guessing which is which is how you ship a panel that half works, so this measures it.
//
// Every request is a GET issued from INSIDE the Persona Bar iframe, which is the same origin and
// the same cookie jar the SPA will run in. Four context variants per endpoint:
//
//   none      no moduleid/tabid anywhere            <- what the panel can actually offer
//   zeroQs    ?moduleid=0&tabid=0                   <- the naive "just send zero" fix
//   zeroHdr   ModuleId: 0 / TabId: 0 headers        <- what ServicesFramework(0) would send
//   valid     the real pair from the dashboard page <- control group, must pass
//
// It also reports whether the antiforgery token and jQuery.ServicesFramework are reachable inside
// the panel frame, because the write calls (create/delete form) need one of them.
//
//   node tools/browser-qa/pb-module-context-probe.mjs [site] [user] [pass] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const site = (process.argv[2] || 'http://megaclean008.ai').replace(/\/$/, '');
const user = process.argv[3] || 'admin';
const pass = process.argv[4] || 'dnnhost';
const outDir = path.resolve(process.argv[5] || 'qa-out/pb-module-context');
fs.mkdirSync(outDir, { recursive: true });

const API = '/DesktopModules/MegaForm/API/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// ---- login ---------------------------------------------------------------------------------
await page.goto(site + '/Login', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.locator('input[id*="txtUsername"]').fill(user);
await page.locator('input[id*="txtPassword"]').fill(pass);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
  page.locator('a[id*="cmdLogin"], input[id*="cmdLogin"]').click(),
]);

// ---- control group: a real moduleId/tabId pair from the dashboard page ----------------------
const admin = await browser.newPage();
await admin.goto(site + '/mfqa-admin', { waitUntil: 'domcontentloaded', timeout: 90000 });
await admin.waitForTimeout(4000);
const ctx = await admin.evaluate(() => {
  const p = window.__MF_PLATFORM__ || {};
  const root = document.querySelector('[data-module-id], [data-moduleid]');
  const ds = root ? root.dataset : {};
  return {
    moduleId: Number(p.moduleId || p.instanceId || ds.moduleId || 0) || 0,
    tabId: Number(p.tabId || ds.tabId || 0) || 0,
    portalId: Number(p.portalId ?? p.siteId ?? 0) || 0,
    apiBase: p.apiBase || null,
  };
});
await admin.close();

// ---- open the Persona Bar panel -------------------------------------------------------------
// NOT /mfqa-admin: the dashboard overlay on that page covers the Persona Bar and li#Content never
// becomes visible. Any ordinary page works - the panel is chrome, not module content.
const hostPage = process.argv[6] || '/mf-templates/mf-xmas-sale';
await page.goto(site + hostPage, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);
const pb = page.frames().find((f) => f.url().includes('/Dnn.PersonaBar/index.html'));
if (!pb) { console.error('Persona Bar iframe not found - is this user a host/admin?'); await browser.close(); process.exit(2); }
await pb.locator('li#Content').first().click();
await pb.waitForTimeout(600);
await pb.locator('li#MegaForm').first().click();
await pb.waitForSelector('.mf-pb-table, .mf-pb-empty', { timeout: 45000 }).catch(() => {});
await page.mouse.move(900, 500);   // close the Content flyout that sits over the panel
await page.waitForTimeout(1000);

// ---- what the panel frame can offer a write call --------------------------------------------
const authCtx = await pb.evaluate(() => ({
  frameUrl: location.href,
  hasJQuery: typeof window.jQuery !== 'undefined',
  hasServicesFramework: !!(window.jQuery && window.jQuery.ServicesFramework),
  sfTokenFor0: (() => {
    try { return window.jQuery.ServicesFramework(0).getAntiForgeryValue() ? 'present' : 'empty'; }
    catch (e) { return 'threw: ' + e.message; }
  })(),
  hiddenTokenInFrame: !!document.querySelector('input[name="__RequestVerificationToken"]'),
  hasMegaFormGlobal: typeof window.MegaForm !== 'undefined',
  // The decisive one. MegaForm.UI/src/shared/antiforgery.ts does not read the current document -
  // it walks window -> parent -> top and takes the first token it finds. The panel iframe is a
  // same-origin child of an ordinary DNN page, which has both. If this says yes, the SPA's write
  // calls already work here with no new plumbing.
  tokenViaParentWalk: (() => {
    const wins = [];
    for (let w = window; w; w = w.parent === w ? null : w.parent) { wins.push(w); if (w === w.parent) break; }
    try { if (window.top && wins.indexOf(window.top) === -1) wins.push(window.top); } catch { /* cross-origin */ }
    for (const w of wins) {
      try {
        const el = w.document.querySelector('input[name="__RequestVerificationToken"]');
        if (el && el.value) return { found: 'hidden input', where: w === window ? 'panel frame' : 'ancestor', length: el.value.length };
      } catch { /* next */ }
    }
    for (const w of wins) {
      try {
        const sf = w.jQuery && w.jQuery.ServicesFramework ? w.jQuery.ServicesFramework(0) : null;
        const tok = sf ? String(sf.getAntiForgeryValue() || '') : '';
        if (tok) return { found: 'ServicesFramework', where: w === window ? 'panel frame' : 'ancestor', length: tok.length };
      } catch { /* next */ }
    }
    return { found: 'nothing', where: null, length: 0 };
  })(),
}));
const hostAuthCtx = await page.evaluate(() => ({
  hiddenTokenInHostPage: !!document.querySelector('input[name="__RequestVerificationToken"]'),
  hasServicesFramework: !!(window.jQuery && window.jQuery.ServicesFramework),
}));

// ---- a form id to aim the per-form endpoints at ---------------------------------------------
// Read out of the raw text, not a shape: these endpoints return the whole FormInfo (SchemaJson
// and all) and the casing is PascalCase server-side. Resolved from INSIDE the panel frame, which
// is the context under test - asking the dashboard page instead returned nothing here.
const formProbe = await pb.evaluate(async ({ api, pid }) => {
  try {
    const r = await fetch(`${api}Form/List?portalId=${pid}&pageSize=1`, { credentials: 'include' });
    const t = await r.text();
    const m = t.match(/"FormId"\s*:\s*(\d+)/i);
    return { status: r.status, formId: m ? Number(m[1]) : 0, head: t.slice(0, 120) };
  } catch (e) { return { status: -1, formId: 0, head: String(e && e.message) }; }
}, { api: API, pid: ctx.portalId });
const firstForm = formProbe.formId;
if (!firstForm) console.log(`could not resolve a formId: status=${formProbe.status} head=${formProbe.head}`);

// ---- the probe ------------------------------------------------------------------------------
const ENDPOINTS = [
  // the dashboard's own first paint
  'Form/ListAll?portalId=0',
  `Form/List?portalId=${ctx.portalId}&pageSize=5`,
  'Phase2/PinnedPages',
  'Phase2/AppDefinitionList',
  'BuilderTemplates/List',
  `Permissions/Catalog?formId=${firstForm}`,
  'Theme/List',
  // the wizard
  'AiAssistant/DefaultConfig',
  'AiTools/SqlConnections',
  'Starter/Status',
  // settings panes
  'ModuleConfig/EmailSettings',
  'ModuleConfig/CaptchaSettings',
  'ModuleConfig/UploadSettings',
  'ModuleConfig/ConnectionsList',
  'ModuleConfig/CloudStorageConnectionsList',
  // inbox / submissions
  'Submissions/My',
  'Submissions/Languages',
  'Workflow/MyInbox',
  'Workflow/Directory',
  // control group: [DnnModuleAuthorize] must fail without a module
  `WorkflowApi/Get?formId=${firstForm}`,
  `Workflow/Get?formId=${firstForm}`,
  // per-form reads
  `Form/Get?formId=${firstForm}`,
  `Submissions/List?formId=${firstForm}&pageSize=5`,
];

const results = await pb.evaluate(async ({ api, endpoints, ctx }) => {
  const variants = [
    { name: 'none', qs: '', headers: {} },
    { name: 'zeroQs', qs: 'moduleid=0&tabid=0', headers: {} },
    // Split, because the builder ships Form/Get?...&moduleId=0 on DNN today and that works: if
    // zeroQs fails it matters a great deal WHICH of the two params did it.
    { name: 'modIdQs', qs: 'moduleid=0', headers: {} },
    { name: 'tabIdQs', qs: 'tabid=0', headers: {} },
    { name: 'zeroHdr', qs: '', headers: { ModuleId: '0', TabId: '0' } },
    { name: 'valid', qs: '', headers: { ModuleId: String(ctx.moduleId), TabId: String(ctx.tabId) } },
  ];
  const out = [];
  for (const ep of endpoints) {
    const row = { endpoint: ep };
    for (const v of variants) {
      const url = api + ep + (v.qs ? (ep.includes('?') ? '&' : '?') + v.qs : '');
      try {
        const r = await fetch(url, { credentials: 'include', headers: v.headers });
        const text = await r.text();
        row[v.name] = { status: r.status, bytes: text.length, body: r.ok ? '' : text.slice(0, 160).replace(/\s+/g, ' ') };
      } catch (e) {
        row[v.name] = { status: -1, bytes: 0, body: String(e && e.message).slice(0, 160) };
      }
    }
    out.push(row);
  }
  return out;
}, { api: API, endpoints: ENDPOINTS, ctx });

// ---- report ---------------------------------------------------------------------------------
const summary = {
  site, probedAt: new Date().toISOString(),
  control: { ...ctx, firstFormId: firstForm },
  antiforgery: { insidePanelFrame: authCtx, hostPage: hostAuthCtx },
  results,
};
fs.writeFileSync(path.join(outDir, 'module-context-probe.json'), JSON.stringify(summary, null, 2));

const pad = (s, n) => String(s).padEnd(n);
console.log(`\ncontrol pair: moduleId=${ctx.moduleId} tabId=${ctx.tabId} portalId=${ctx.portalId} firstForm=${firstForm}`);
console.log(`antiforgery in panel frame: ServicesFramework=${authCtx.hasServicesFramework} hiddenInput=${authCtx.hiddenTokenInFrame}`);
console.log(`antiforgery via parent walk: ${authCtx.tokenViaParentWalk.found} in the ${authCtx.tokenViaParentWalk.where} (${authCtx.tokenViaParentWalk.length} chars)\n`);
console.log(pad('endpoint', 46) + pad('none', 7) + pad('zeroQs', 8) + pad('modIdQs', 9) + pad('tabIdQs', 9) + pad('zeroHdr', 9) + 'valid');
for (const r of results) {
  console.log(pad(r.endpoint, 46) + pad(r.none.status, 7) + pad(r.zeroQs.status, 8)
    + pad(r.modIdQs.status, 9) + pad(r.tabIdQs.status, 9) + pad(r.zeroHdr.status, 9) + r.valid.status);
}
const brokenWithoutModule = results.filter((r) => r.valid.status === 200 && r.none.status !== 200);
console.log(`\nendpoints that work WITH a module but not without: ${brokenWithoutModule.length}`);
for (const r of brokenWithoutModule) console.log(`  ${r.endpoint}  none=${r.none.status} ${r.none.body}`);
console.log(`\nreport -> ${path.join(outDir, 'module-context-probe.json')}`);
await browser.close();
