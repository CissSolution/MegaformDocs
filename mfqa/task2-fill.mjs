import { launch, shot, BASE } from './lib.mjs';

const FORM_ID = 862;
const ROWS = Number(process.env.ROWS || 30);
const { browser, page, errs } = await launch();

const first = ['Anna','Liam','Mia','Noah','Ava','Ethan','Sofia','Lucas','Emma','Leo','Zoe','Max','Iris','Sam','Nora','Owen','Lena','Finn','Ruby','Jack','Cora','Ian','Tara','Theo','Vera','Cole','Maya','Dean','Lola','Reed'];
const last = ['Müller','Smith','Rossi','Nguyen','Garcia','Khan','Brown','Sato','Dubois','Costa','Park','Weber','Lopez','Yang','Klein','Murphy','Silva','Haas','Ortiz','Funk','Berg','Vega','Roy','Stein','Wolf','Diaz','Frank','Cruz','Bauer','Pratt'];
const states = ['CA','NY','TX','FL','WA','IL','MA','CO','OR','GA'];

function pickSelect(sel, r) {
  const opts = Array.from(sel.options).filter(o => o.value !== '' && !o.disabled);
  if (!opts.length) return false;
  sel.value = opts[r % opts.length].value;
  return true;
}

async function fillRow(r) {
  return page.evaluate((args) => {
    const { r, first, last, states } = args;
    const fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const pickSelect = (sel) => { const opts = Array.from(sel.options).filter(o => o.value !== '' && !o.disabled); if (!opts.length) return; sel.value = opts[r % opts.length].value; };
    const email = `qa.user${r}@example.com`;
    const pw = `Pw!${1000 + r}xZ`;
    document.querySelectorAll('.mf-composite').forEach(c => {
      const preset = c.getAttribute('data-preset');
      const inputs = Array.from(c.querySelectorAll('input,select,textarea')).filter(e => e.type !== 'hidden');
      if (preset === 'email_confirm') {
        inputs.filter(e => e.tagName === 'INPUT').forEach(e => { e.value = email; fire(e); });
        return;
      }
      if (preset === 'password_confirm') {
        inputs.filter(e => e.tagName === 'INPUT').forEach(e => { e.value = pw; fire(e); });
        return;
      }
      // SSN uses a strict ###-##-#### input mask that rejects programmatic value-set; it is
      // optional, so leave it blank (the per-part mask check only runs on a non-empty value).
      if (preset === 'ssn') return;
      inputs.forEach(e => {
        const part = (e.getAttribute('data-mf-part') || e.name || '').toLowerCase();
        if (e.tagName === 'SELECT') { pickSelect(e); fire(e); return; }
        // skip the phone country trigger (part empty / not a real text part)
        if (preset === 'phone' && !part) return;
        let v = '';
        if (e.type === 'date') { v = `19${80 + (r % 19)}-0${1 + (r % 9)}-1${r % 9}`; }
        else if (e.type === 'email') v = email;
        else if (e.type === 'tel' || part === 'number' || part === 'area' || part === 'ext') v = part === 'area' ? String(200 + r) : part === 'ext' ? String(10 + r) : String(5550000 + r);
        else if (e.type === 'number' || preset === 'number' || part === 'amount' || part === 'min' || part === 'max') v = String(100 + r * 7);
        else if (e.type === 'url' || preset === 'url') v = `https://site${r}.example.com`;
        else if (part === 'first') v = first[r % first.length];
        else if (part === 'last') v = last[r % last.length];
        else if (part === 'middle') v = 'Q';
        else if (part === 'street') v = `${100 + r} Maple Ave`;
        else if (part === 'street2') v = `Apt ${r + 1}`;
        else if (part === 'city') v = ['Berlin','Austin','Rome','Hanoi','Madrid'][r % 5];
        else if (part === 'zip' || part === 'postal' || part === 'postcode') v = String(10000 + r * 11);
        else if (part === 'ssn' || preset === 'ssn') { const ss = String(100000001 + r); v = ss.slice(0,3) + '-' + ss.slice(3,5) + '-' + ss.slice(5,9); }
        else if (preset === 'textarea') v = `Long text sample row ${r}. The quick brown fox.`;
        else if (preset === 'text') v = `Sample-${r}`;
        else v = `val${r}`;
        e.value = v; fire(e);
      });
    });
    // collect hidden combined values for verification
    const hidden = {};
    document.querySelectorAll('.mf-composite').forEach(c => {
      const k = c.getAttribute('data-key');
      const h = document.querySelector(`input[type=hidden][name="${k}"]`);
      if (h) hidden[k] = h.value;
    });
    return hidden;
  }, { r, first, last, states });
}

let ok = 0;
const post200 = [];
page.on('response', res => { try { if (res.url().includes('Submit/Post')) post200.push(res.status()); } catch (e) {} });

for (let r = 0; r < ROWS; r++) {
  await page.goto(`${BASE}/api/MegaForm/render/${FORM_ID}`, { waitUntil: 'networkidle', timeout: 45000 });
  // Wait for the renderer to finish booting (Schema fetch + init binds the submit handler).
  await page.waitForFunction((fid) => !!document.getElementById('mf-btn-submit-' + fid) && document.querySelectorAll('.mf-composite').length >= 19, FORM_ID, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2200);
  const hidden = await fillRow(r);
  if (r === 0) console.log('row0 hidden combined values:', JSON.stringify(hidden, null, 1));
  await page.waitForTimeout(500);
  const before = post200.length;
  // Click with retry — the renderer binds the submit handler after the async Schema fetch,
  // so an early click can no-op. Re-click until a Submit/Post response is seen.
  let posted = false;
  for (let attempt = 0; attempt < 4 && !posted; attempt++) {
    await page.evaluate((fid) => { const b = document.getElementById('mf-btn-submit-' + fid); if (b) b.click(); }, FORM_ID);
    let waited = 0;
    while (post200.length === before && waited < 3000) { await page.waitForTimeout(300); waited += 300; }
    posted = post200.length > before;
  }
  if (posted) ok++;
  await page.waitForTimeout(400);
  if (r === 0 && !posted) {
    const diag = await page.evaluate(() => ({
      errs: [...document.querySelectorAll('[id^=mf-err-]')].map(e => ({ k: e.id.replace('mf-err-', ''), m: e.textContent.trim() })).filter(x => x.m),
      hasRenderer: !!(window.MegaFormRenderer && window.MegaFormRenderer.init),
      btnDisabled: document.getElementById('mf-btn-submit-862')?.disabled,
    }));
    console.log('ROW0 NO-POST DIAG:', JSON.stringify(diag, null, 1));
  }
  if (r === 0) await shot(page, 'task2-after-submit-row0.png');
}

console.log(`\nSUBMIT 200 responses: ${ok}/${ROWS}`);
console.log('statuses:', JSON.stringify(post200));
console.log('console errors:', JSON.stringify(errs.slice(0, 6)));
await browser.close();
