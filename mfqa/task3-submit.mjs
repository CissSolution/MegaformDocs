import { launch, shot, BASE } from './lib.mjs';

const FORM_ID = 863;
const ROWS = Number(process.env.ROWS || 6);
const { browser, page, errs } = await launch();

const names = ['Grace Hopper','Alan Turing','Ada Lovelace','Linus T.','Margaret H.','Dennis R.','Barbara L.','Ken T.'];
const roles = ['Greeter','Driver','Cook','Medic'];
const post200 = [];
page.on('response', res => { try { if (res.url().includes('Submit/Post')) post200.push(res.status()); } catch (e) {} });

let ok = 0;
for (let r = 0; r < ROWS; r++) {
  await page.goto(`${BASE}/api/MegaForm/render/${FORM_ID}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForFunction((fid) => !!document.getElementById('mf-btn-submit-' + fid), FORM_ID, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2200);
  await page.evaluate((args) => {
    const { r, names, roles } = args;
    const fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const set = (sel, v) => { const e = document.querySelector(sel); if (e) { e.value = v; fire(e); } };
    set('[name="full_name"]', names[r % names.length]);
    set('[name="email"]', `reg${r}@example.com`);
    set('[name="phone"]', '0900' + String(100000 + r));
    const role = document.querySelector('[name="role"]'); if (role) { role.value = roles[r % roles.length]; fire(role); }
  }, { r, names, roles });
  await page.waitForTimeout(500);
  const before = post200.length;
  let posted = false;
  for (let a = 0; a < 4 && !posted; a++) {
    await page.evaluate((fid) => document.getElementById('mf-btn-submit-' + fid)?.click(), FORM_ID);
    let w = 0; while (post200.length === before && w < 3000) { await page.waitForTimeout(300); w += 300; }
    posted = post200.length > before;
  }
  if (posted) ok++;
  await page.waitForTimeout(500);
  if (r === 0) await shot(page, 'task3-form863.png');
}
console.log(`SUBMIT 200: ${ok}/${ROWS}`, JSON.stringify(post200));
console.log('errs', JSON.stringify(errs.slice(0, 4)));
await browser.close();
