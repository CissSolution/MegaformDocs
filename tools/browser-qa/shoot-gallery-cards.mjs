// Chup anh the cho tung trang demo template.
//
// Chup AN DANH, khong dang nhap: mot anh the co thanh cong cu admin cua DNN trong do la anh sai -
// khach xem gallery khong bao gio thay thanh do. Cung vi the khong dung dnnshot.mjs o day.
//
// Chup dung khung nhin (khong full-page) roi thu nho: the trong luoi cao khoang 3:4 so voi be
// ngang, nen mot anh full-page dai 4000px vua nang vua chi hien mep tren sau khi object-fit cat.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = path.resolve(process.argv[2]);
const listFile = path.resolve(process.argv[3]);
const site = (process.argv[4] || 'https://dnndefender.com').replace(/\/$/, '');
fs.mkdirSync(outDir, { recursive: true });

// PowerShell's Set-Content -Encoding utf8 writes a BOM, and JSON.parse rejects it outright with a
// bare "Unexpected token" that says nothing about the cause. Strip it rather than demand that every
// caller remember to write BOM-less files.
const items = JSON.parse(fs.readFileSync(listFile, 'utf8').replace(/^﻿/, ''));
const VIEWPORT = { width: 1200, height: 900 };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
let ok = 0, fail = 0;

for (const it of items) {
  const out = path.join(outDir, it.Slug + '.png');
  const url = `${site}/Default.aspx?tabid=${it.TabId}`;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    // Cho form ve xong. Khong co selector thi van chup - mot anh chung con hon khong co anh.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: out, fullPage: false });
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`OK   ${it.Slug} (${kb} KB)`);
    ok++;
  } catch (e) {
    console.log(`LOI  ${it.Slug}: ${String(e.message).split('\n')[0]}`);
    fail++;
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(`\nchup duoc ${ok}, loi ${fail}`);
