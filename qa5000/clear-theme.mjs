// Truly clear the C8 test colour override via the purpose-built Form/SaveTheme endpoint
// (writes themeCssOverrides={} into BOTH schema.settings and settingsJson). Clearing via
// SaveForm didn't stick (the resolver re-merged it). The override mapped --primary onto the
// template's --au-soft AND --au-primary (same #004e66) → the "Step 01" eyebrow text became
// invisible (bg==color). Clearing restores the template's original colours.
import { launch, login, getForm } from './lib.mjs';

const ids = (process.argv[2] || '11,13,14,15').split(',').map(Number);
const { browser, page } = await launch(true);
try {
  await login(page);
  for (const id of ids) {
    const res = await page.evaluate(async (id) => {
      function tok() { const m = document.cookie.match(/(?:^|;\s*)(?:CSRF-TOKEN|XSRF-TOKEN)=([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; }
      const r = await fetch('/api/MegaForm/Form/SaveTheme', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', RequestVerificationToken: tok(), 'X-XSRF-TOKEN': tok() },
        body: JSON.stringify({ FormId: id, CssOverrides: {} }),
      });
      const t = await r.text();
      return { status: r.status, ok: r.ok, t: t.slice(0, 160) };
    }, id);
    // verify
    const f = await getForm(page, id);
    const ov = JSON.parse(f.settingsJson || '{}').themeCssOverrides || {};
    console.log(`form ${id}: SaveTheme ${res.status} ${res.ok ? 'OK' : res.t} -> themeCssOverrides now ${JSON.stringify(ov)}`);
  }
} finally { await browser.close(); }
