import { launch, login, shot, BASE } from './lib.mjs';

const { browser, page, errs } = await launch();
await login(page);

// 1) Homepage runtime platform info
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(3500);
const home = await page.evaluate(() => {
  const root = document.querySelector('#mf-dashboard-root');
  const plat = window.__MF_PLATFORM__ || null;
  const wrap = document.querySelector('[id^="mf-form-wrapper-"]');
  return {
    title: document.title,
    plat,
    dashRoot: root ? { moduleId: root.getAttribute('data-module-id') || root.getAttribute('data-moduleid'), siteId: root.getAttribute('data-site-id') || root.getAttribute('data-siteid') } : null,
    wrapperId: wrap ? wrap.id : null,
    loggedInUser: document.querySelector('.app-login, [href*="logout" i], .username')?.textContent?.trim()?.slice(0,40) || null,
    bodyHasLogout: /logout/i.test(document.body.innerHTML),
  };
});
console.log('HOME=', JSON.stringify(home, null, 2));

// 2) Try to create a tiny standard test form via SaveForm API (test auth)
const create = await page.evaluate(async () => {
  const schema = { fields: [
    { key: 'full_name', type: 'Text', label: 'Full name', required: true, placeholder: 'Your name' },
    { key: 'email', type: 'Email', label: 'Email', required: true, placeholder: 'you@example.com' },
    { key: 'message', type: 'Textarea', label: 'Message', placeholder: 'Say hi' },
  ]};
  const body = {
    FormId: 0,
    ModuleId: 1828, SiteId: 1,
    Title: 'QA Standard Theme Test',
    Status: 'Published',
    SubmitButtonText: 'Submit',
    SuccessMessage: 'Thanks!',
    SchemaJson: JSON.stringify(schema),
    SettingsJson: JSON.stringify({ theme: 'default' }),
    PreserveModuleBindingOnSave: true,
  };
  try {
    const res = await fetch('/api/MegaForm/Form', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-OQTANE-MODULEID': '1828', 'X-OQTANE-SITEID': '1' },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    return { status: res.status, body: txt.slice(0, 300) };
  } catch (e) { return { error: String(e) }; }
});
console.log('CREATE=', JSON.stringify(create, null, 2));

console.log('ERRORS=', JSON.stringify(errs.slice(0, 8), null, 2));
await shot(page, 'discover-home.png');
await browser.close();
