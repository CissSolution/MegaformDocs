// Shared QA helpers for MegaForm Oqtane :5000 (Oqtane.10_new2, host/Minh@2002).
// Session: AI premium-edit keep-style. Reusable across pull-schemas, screenshots, AI-drive.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = 'http://localhost:5000';
export const OUT = join(process.cwd(), 'qa5000', 'out');
mkdirSync(OUT, { recursive: true });

export async function launch(headless = true) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, bypassCSP: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  return { browser, ctx, page, errs };
}

// Robust Oqtane host login on :5000.
export async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.fill('#username', 'host');
  await page.fill('#password', 'Minh@2002');
  // The form submit button is the .col-6 primary "Login" (NOT the navbar a.app-login link).
  const submit = page.locator('button.btn-primary.col-6', { hasText: /login/i }).first();
  if (await submit.count()) await submit.click();
  else await page.getByRole('button', { name: /^login$/i }).last().click();
  // Wait for redirect away from /login OR auth to take effect.
  await page.waitForTimeout(6000);
  for (let i = 0; i < 6; i++) {
    if (await isLoggedIn(page)) return true;
    await page.waitForTimeout(1500);
  }
  return await isLoggedIn(page);
}

export async function isLoggedIn(page) {
  return await page.evaluate(async () => {
    try {
      const r = await fetch('/api/User/current', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!r.ok) return false;
      const u = await r.json();
      return !!(u && (u.IsAuthenticated || u.Username || u.UserId >= 0));
    } catch { return false; }
  });
}

// Authenticated full-form fetch (schema + settings + resolved). Tries multiple endpoints.
export async function getForm(page, id) {
  return await page.evaluate(async (id) => {
    const tryUrls = [
      `/api/MegaForm/Form/${id}`,
      `/api/MegaForm/Form/Get?formId=${id}`,
    ];
    for (const u of tryUrls) {
      try {
        const r = await fetch(u, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (r.ok) return await r.json();
        if (r.status !== 404) return { __error: 'HTTP ' + r.status + ' @ ' + u };
      } catch (e) { return { __error: String(e && e.message || e) + ' @ ' + u }; }
    }
    return { __error: 'all endpoints 404' };
  }, id);
}

export const shot = (page, name, opts = {}) =>
  page.screenshot({ path: join(OUT, name), fullPage: !!opts.full });

// AI default config (admin gets the real apiKey back). Must carry the Site entity
// context (entityid+entityname=Site) or ResolveSiteId()<=0 → empty-key fallback.
export async function getAiConfig(page, siteId = 1) {
  return await page.evaluate(async (siteId) => {
    const url = `/api/AiAssistant/DefaultConfig?entityid=${siteId}&entityname=Site&siteId=${siteId}&siteid=${siteId}`;
    const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!r.ok) return { __error: 'HTTP ' + r.status };
    return await r.json();
  }, siteId);
}

// POST a full form DTO back to SaveForm. Tries plain POST, then with antiforgery header.
export async function saveForm(page, dto) {
  return await page.evaluate(async (dto) => {
    function tokenFromCookie() {
      const m = document.cookie.match(/(?:^|;\s*)(?:CSRF-TOKEN|XSRF-TOKEN|RequestVerificationToken)=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    }
    async function post(extraHeaders) {
      try {
        const r = await fetch('/api/MegaForm/Form', {
          method: 'POST', credentials: 'same-origin', // no keepalive: payloads exceed its 64KB cap
          headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, extraHeaders || {}),
          body: JSON.stringify(dto),
        });
        const text = await r.text();
        return { status: r.status, ok: r.ok, text: text.slice(0, 400) };
      } catch (e) {
        return { status: 0, ok: false, text: 'fetch-throw: ' + String(e && e.message || e) };
      }
    }
    let res = await post();
    if (!res.ok && res.status === 0) { await new Promise(r => setTimeout(r, 1200)); res = await post(); } // retry transient
    if (!res.ok && (res.status === 400 || res.status === 403)) {
      const tok = tokenFromCookie();
      res = await post(tok ? { RequestVerificationToken: tok, 'X-XSRF-TOKEN': tok } : {});
    }
    return res;
  }, dto);
}
