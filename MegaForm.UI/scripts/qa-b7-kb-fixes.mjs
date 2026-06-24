// B7 QA — verify:
//   1) Form 302 (Sinh viên) class_id Select renders Classes options
//   2) Form 303 (Điểm số) all 4 FK Selects work (no [INT] bug)
//   3) Post-submit card is slim with single Nhập tiếp + Đóng
//   4) Field/Options endpoint serves the FK rows

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Need a page on the host first so fetch has a base URL
await page.goto(`${BASE}/xx?formid=302`, { waitUntil: 'domcontentloaded', timeout: 30000 });

// 1+2) Test Field/Options endpoint for each FK Select
const probes = await page.evaluate(async () => {
  async function ping(formId, fieldKey) {
    const r = await fetch(`/DesktopModules/MegaForm/API/Field/Options?formId=${formId}&fieldKey=${fieldKey}`, { credentials: 'same-origin' });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  }
  return {
    form302_class_id:     await ping(302, 'class_id'),
    form303_student_id:   await ping(303, 'student_id'),
    form303_subject_id:   await ping(303, 'subject_id'),
    form303_semester_id:  await ping(303, 'semester_id'),
    form303_teacher_id:   await ping(303, 'teacher_id'),
    form301_homeroom:     await ping(301, 'homeroom_teacher_id'),
  };
});

// 3) Already on form 302 — wait for the renderer to populate the dropdown
await page.waitForLoadState('networkidle', { timeout: 30000 });
await page.waitForTimeout(2500);

const formInspect = await page.evaluate(() => {
  const classSel = document.querySelector('select[name="class_id"]') || document.querySelector('[data-mf-field-key="class_id"]');
  return {
    classSelectFound: !!classSel,
    classSelectTag: classSel?.tagName || null,
    classOptionsCount: classSel ? (classSel.tagName === 'SELECT' ? classSel.options.length : -1) : -1,
    classFirstOptions: classSel && classSel.tagName === 'SELECT'
      ? Array.from(classSel.options).slice(0, 5).map(o => ({ v: o.value, l: o.text }))
      : null,
  };
});

await page.screenshot({ path: join(OUT, 'b7-01-form302-classlist.png'), fullPage: false });

// 4) Submit form 302 to trigger the new slim post-submit card
const submitProbe = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/Submit/Post', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formId: 302, data: { full_name: 'QA test', class_id: '1' }, submissionTime: 1.0 })
  });
  return { status: r.status, body: (await r.text()).slice(0, 200) };
});

const report = { probes, formInspect, submitProbe, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'b7-kb-fixes-report.json'), JSON.stringify(report, null, 2));
await browser.close();
