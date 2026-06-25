// Shared QA helpers for MegaForm Oqtane :5070
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = 'http://localhost:5070';
export const OUT = join(process.cwd(), 'mfqa', 'out');
mkdirSync(OUT, { recursive: true });

export async function launch() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  return { browser, ctx, page, errs };
}

export async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  // Oqtane login form
  await page.fill('#username', 'host');
  await page.fill('#password', 'abc@ABC1024'); // :5070 host pwd (from live appsettings Installation.HostPassword)
  await page.getByRole('button', { name: /login/i }).first().click();
  await page.waitForTimeout(5000);
}

export const shot = (page, name) => page.screenshot({ path: join(OUT, name), fullPage: false });
