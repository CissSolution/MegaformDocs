// B274 QA — Page integration selects in the module Settings popup (no need for Theme Designer).
import { launch, login, shot, BASE } from './lib.mjs';
const { browser, page, errs } = await launch();
await login(page);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
// Open the inline Settings popup via the admin-dock Settings link (onclick opens it; not a nav).
await page.evaluate(() => {
  const link = document.querySelector('[data-mf-settings-link], a.mf-oq-btn');
  if (link) (link).click();
});
await page.waitForTimeout(6000);

// Expand any accordion whose header mentions Theme (the Theme & Layout section holds Page integration).
await page.evaluate(() => {
  const heads = [...document.querySelectorAll('button, [role="button"], [class*="acc"], [class*="accordion"], summary')];
  heads.filter(h => /theme|layout/i.test(h.textContent || '')).forEach(h => { try { (h).click(); } catch {} });
});
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const txt = document.body.innerText || '';
  const sels = [...document.querySelectorAll('select')].map(s => ({
    opts: [...s.options].map(o => o.text),
    value: s.value,
  })).filter(s => s.opts.some(o => /Inherit from page|Borrow from page|MegaForm theme/i.test(o)));
  return {
    popupOpen: !!document.querySelector('[class*="mf-vd"]'),
    hasPageIntegration: /Page integration/i.test(txt),
    hasTypographySource: /Typography source/i.test(txt),
    hasColorSource: /Color source/i.test(txt),
    inheritSelects: sels,
  };
});
console.log('[settings popup]', JSON.stringify(info, null, 0));
await shot(page, 'b274-settings-popup-page-integration.png');

// Diagnose the load: does GET Form/{id} surface the flags, and what form is the popup editing?
const apiCheck = await page.evaluate(async () => {
  const out = {};
  for (const fid of [864]) {
    try {
      const r = await fetch(`/api/MegaForm/Form/${fid}`, { credentials: 'same-origin' });
      const t = await r.text();
      out[fid] = { status: r.status, hasInheritKey: /inheritPageTypography/i.test(t), typTrue: /"inheritPageTypography"\s*:\s*true/i.test(t) };
    } catch (e) { out[fid] = { err: String(e) }; }
  }
  return out;
});
console.log('GET Form check:', JSON.stringify(apiCheck));

// Also fetch via the SAME helper path the popup uses, to see the parsed theme layout.
const layoutCheck = await page.evaluate(async () => {
  try {
    const r = await fetch('/api/MegaForm/Form/864', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const t = await r.text();
    let dto = {}; try { dto = JSON.parse(t); } catch {}
    const sraw = dto.settingsJson ?? dto.SettingsJson ?? '{}';
    const rraw = dto.resolvedSettingsJson ?? dto.ResolvedSettingsJson ?? '{}';
    const fields = Object.keys(dto).filter(k => /setting/i.test(k));
    let s = {}; try { s = typeof sraw === 'string' ? JSON.parse(sraw) : sraw; } catch {}
    let rs = {}; try { rs = typeof rraw === 'string' ? JSON.parse(rraw) : rraw; } catch {}
    return { status: r.status, settingsFields: fields, settingsJson_typ: s.inheritPageTypography, resolved_typ: rs.inheritPageTypography, resolved_col: rs.inheritPageColors };
  } catch (e) { return { err: String(e) }; }
});
console.log('layout helper check:', JSON.stringify(layoutCheck));

console.log('\n=== SUMMARY ===');
console.log('popup open:', info.popupOpen);
console.log('Page integration + 2 source selects present:', info.hasPageIntegration && info.hasTypographySource && info.hasColorSource && info.inheritSelects.length === 2);
console.log('selects reflect form 864 (both = page, since borrow ON):', info.inheritSelects.map(s => s.value).join(','));
console.log('errs:', JSON.stringify(errs.slice(0, 4)));
await browser.close();
