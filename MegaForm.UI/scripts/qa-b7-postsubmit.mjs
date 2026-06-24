// Visual QA the slim post-submit card.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(`${BASE}/xx?formid=302`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2000);

// Pick a class + fill name
await page.locator('input[name="full_name"]').first().fill('QA Test Student');
await page.locator('select[name="class_id"]').first().selectOption('3'); // 10A1
await page.waitForTimeout(300);

// Submit via the MegaForm renderer's submit button (id pattern)
await page.evaluate(() => {
  const btn = document.querySelector('[id^="mf-btn-submit-"]');
  if (btn) btn.click();
});
await page.waitForTimeout(3500);

const postSubmit = await page.evaluate(() => {
  return {
    has_check_icon: !!document.querySelector('.fa-check'),
    num_continue_buttons: Array.from(document.querySelectorAll('button, a')).filter(el => /^Continue$/i.test((el.textContent || '').trim())).length,
    has_fill_again_btn: !!document.querySelector('[id^="mf-post-submit-fill-again-"]'),
    has_done_btn: !!document.querySelector('[id^="mf-post-submit-done-"]'),
    fill_again_text: document.querySelector('[id^="mf-post-submit-fill-again-"]')?.textContent || null,
    done_text: document.querySelector('[id^="mf-post-submit-done-"]')?.textContent || null,
    success_html_snippet: document.querySelector('.mf-form-success, [id^="mf-success-"], [class*="success"]')?.outerHTML?.slice(0, 600) || null,
  };
});

await page.screenshot({ path: join(OUT, 'b7-02-postsubmit-slim.png'), fullPage: false });
console.log(JSON.stringify(postSubmit, null, 2));
await browser.close();
