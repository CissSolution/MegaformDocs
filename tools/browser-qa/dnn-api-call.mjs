// Goi mot API cua DNN/MegaForm bang phien host that (cookie + RequestVerificationToken).
//
//   node tools/browser-qa/dnn-api-call.mjs GET  /API/MegaForm/AiAssistant/DefaultConfig
//   node tools/browser-qa/dnn-api-call.mjs POST /API/MegaForm/AiAssistant/DefaultConfig bodyFile.json
//
// Body doc tu FILE, khong tu dong lenh: khoa API khong duoc nam trong lich su shell hay log.
// Ket qua in ra da che moi truong co ten chua "key"/"secret"/"token".
//
// Dung Playwright (Chromium rieng) chu khong dieu khien Chrome cua may qua CDP - cong cu CDP chet
// khi nguoi dung dang mo Chrome.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.DNN_BASE_URL || 'https://dnndefender.com';
const [, , method, apiPath, bodyFile] = process.argv;
if (!method || !apiPath) throw new Error('usage: <GET|POST> <apiPath> [bodyFile.json]');
if (!process.env.DNN_PASSWORD) throw new Error('Set DNN_PASSWORD.');

const mask = (v) => {
  if (v && typeof v === 'object') {
    const out = Array.isArray(v) ? [] : {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = /key|secret|token|password/i.test(k) && typeof val === 'string' && val.length > 6
        ? val.slice(0, 4) + '…(' + val.length + ' ky tu)'
        : mask(val);
    }
    return out;
  }
  return v;
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(process.env.DNN_USER || 'host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(process.env.DNN_PASSWORD);
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {}),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// Dieu huong han ve trang chu va cho lang: goi fetch ngay sau khi bam Login lam ngu canh evaluate
// bi huy giua chung va bao "Failed to fetch" - trong nhu loi mang chu khong phai loi dieu huong.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(2500);

const body = bodyFile ? JSON.parse(fs.readFileSync(bodyFile, 'utf8')) : null;
const res = await page.evaluate(async ([url, m, b]) => {
  const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
  // ⭐ KHONG gui ModuleId/TabId. Chung khong trung tinh: gui "0" thi DNN tra 400 cho moi endpoint,
  // gui "-1" thi request chet o tang mang va fetch bao "Failed to fetch" - nhin y het loi mang.
  // Khong gui gi ca thi 200. Chi them chung khi endpoint thuc su doi ngu canh module.
  const init = {
    method: m,
    headers: { RequestVerificationToken: token, 'X-Requested-With': 'XMLHttpRequest' },
  };
  if (b) { init.headers['Content-Type'] = 'application/json; charset=UTF-8'; init.body = JSON.stringify(b); }
  const r = await fetch(url, init);
  const text = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* khong phai JSON */ }
  return { status: r.status, parsed, text: parsed ? null : text.slice(0, 400) };
  // Duong dan TUONG DOI, khong ghep BASE: neu dang nhap xong DNN dua sang mot host khac (www,
  // hoac canonical host), URL tuyet doi thanh cross-origin va fetch nem "Failed to fetch" - trong
  // y het loi mang.
}, [apiPath, method, body]);

console.log(JSON.stringify({ status: res.status, body: res.parsed ? mask(res.parsed) : res.text }, null, 2));
await browser.close();
