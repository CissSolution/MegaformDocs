// Bulk Visual QA — verify the dashboard / builder claims that haven't been
// proven yet. Captures one screenshot per claim and DOM probes.
//
// Targets:
//   1. Slim post-submit card (form 302 submit → check rendered card)
//   2. Custom Apps modal — 3 new buttons (Export / Import .zip / Starter kits)
//   3. Starter kits gallery — modal lists 3 kits with Install button
//   4. AI Form Creator — Dashboard "✨ Create with AI" button mounted
//   5. Business Starters — 6 cards
//   6. Builder DB Panel v2 / Layout Designer v2 / Razor Studio (existence only —
//      these are deep inside builder editor and need form-context)

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Login
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

async function safeGoto(url) {
  try { await page.goto(url, { waitUntil: 'commit', timeout: 60000 }); }
  catch { await page.waitForTimeout(2500); await page.goto(url, { waitUntil: 'commit', timeout: 60000 }); }
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
}

const report = { startedAt: new Date().toISOString(), checks: {} };

// ───────────────────────────────────────────────────────────────
// 1. Slim post-submit card on form 302
// ───────────────────────────────────────────────────────────────
await safeGoto(`${BASE}/xx?formid=302`);
await page.waitForTimeout(2200);
await page.locator('input[name="full_name"]').first().fill('QA Bulk Test');
await page.locator('select[name="class_id"]').first().selectOption('3');
await page.waitForTimeout(300);
await page.evaluate(() => {
  const b = document.querySelector('[id^="mf-btn-submit-"]');
  if (b) b.click();
});
await page.waitForTimeout(3500);
const postSubmit = await page.evaluate(() => {
  const card = document.querySelector('.mf-form-success, [id^="mf-success-"], [class*="success"]');
  return {
    hasCard: !!card,
    has_check_icon: !!document.querySelector('.fa-check'),
    fill_again_text: document.querySelector('[id^="mf-post-submit-fill-again-"]')?.textContent || null,
    done_text: document.querySelector('[id^="mf-post-submit-done-"]')?.textContent || null,
    num_continue_buttons: Array.from(document.querySelectorAll('button, a')).filter(el => /^Continue$/i.test((el.textContent || '').trim())).length,
    cardMaxWidth: card ? getComputedStyle(card.querySelector('div') || card).maxWidth : null,
  };
});
await page.screenshot({ path: join(OUT, 'qa-bulk-01-postsubmit.png'), fullPage: false });
report.checks.slimPostSubmit = {
  pass: postSubmit.has_check_icon && postSubmit.num_continue_buttons === 0 && /Nhập tiếp/.test(postSubmit.fill_again_text || ''),
  ...postSubmit,
};

// ───────────────────────────────────────────────────────────────
// Reach an admin dashboard
// ───────────────────────────────────────────────────────────────
await safeGoto(`${BASE}/Careers`);
await page.waitForTimeout(2200);

// ───────────────────────────────────────────────────────────────
// 4. AI Form Creator button on Dashboard header
// ───────────────────────────────────────────────────────────────
const aiBtn = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const ai = btns.find(b => /create with ai|✨|create.*ai/i.test((b.textContent || '').trim()));
  return ai ? { text: ai.textContent.trim().slice(0, 60), present: true } : { present: false };
});
report.checks.aiFormCreatorButton = { pass: aiBtn.present, ...aiBtn };
await page.screenshot({ path: join(OUT, 'qa-bulk-04-dashboard-header.png'), fullPage: false });

// ───────────────────────────────────────────────────────────────
// 5. Business Starters modal — 6 cards
// ───────────────────────────────────────────────────────────────
const bsBtn = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const bs = btns.find(b => /business starters/i.test((b.textContent || '').trim()));
  if (bs) { bs.click(); return true; }
  return false;
});
if (bsBtn) {
  // BS modal fetches Starter/Status async then re-renders cards.
  // Wait 4s for the populate to complete.
  await page.waitForTimeout(4000);
  const bsModal = await page.evaluate(() => {
    const modals = Array.from(document.querySelectorAll('.mf-modal, [class*="modal"]')).filter(m => /Business Starters/i.test(m.textContent || ''));
    const modal = modals[modals.length - 1];
    if (!modal) return { mounted: false };
    const cardTitles = Array.from(modal.querySelectorAll('strong, h3, h4'))
      .map(e => (e.textContent || '').trim())
      .filter(t => t.length > 0 && t.length < 50);
    const launchCount = Array.from(modal.querySelectorAll('button')).filter(b => /launch|open board|reseed/i.test((b.textContent || ''))).length;
    return { mounted: true, cardTitles, launchCount, modalText: (modal.innerText || '').slice(0, 600) };
  });
  await page.screenshot({ path: join(OUT, 'qa-bulk-05-business-starters.png'), fullPage: false });
  report.checks.businessStarters = {
    pass: bsModal.mounted && bsModal.launchCount >= 6 && bsModal.cardTitles?.some(t => /leave/i.test(t)),
    ...bsModal,
  };

  // Custom Apps section + 3 new buttons sit INSIDE the same BS modal body
  // (scrolling down). Probe for them while the modal is open.
  const customApps = await page.evaluate(() => {
    const modal = Array.from(document.querySelectorAll('.mf-modal')).find(m => /Business Starters|Custom Apps/i.test(m.textContent || ''));
    if (!modal) return { found: false };
    const allBtns = Array.from(modal.querySelectorAll('button'));
    return {
      found: true,
      hasStarterKitsBtn: allBtns.some(b => /starter kits/i.test((b.textContent || ''))),
      hasImportZipBtn:   allBtns.some(b => /import \.zip|import zip/i.test((b.textContent || ''))),
      hasCustomAppsLabel: /Custom Apps/i.test(modal.textContent || ''),
    };
  });
  await page.screenshot({ path: join(OUT, 'qa-bulk-02-custom-apps.png'), fullPage: false });
  report.checks.customAppsButtons = {
    pass: customApps.hasStarterKitsBtn && customApps.hasImportZipBtn,
    ...customApps,
  };

  // Click Starter kits if found
  if (customApps.hasStarterKitsBtn) {
    await page.evaluate(() => {
      const modal = Array.from(document.querySelectorAll('.mf-modal')).find(m => /Business Starters|Custom Apps/i.test(m.textContent || ''));
      const sk = Array.from(modal.querySelectorAll('button')).find(b => /starter kits/i.test((b.textContent || '')));
      if (sk) sk.click();
    });
    await page.waitForTimeout(2500);
    const kitsProbe = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.mf-modal'))
        .filter(m => /starter kits/i.test((m.querySelector('.mf-modal-header h4, h4')?.textContent || '')));
      const lastModal = cards[cards.length - 1];
      if (!lastModal) return { mounted: false };
      const installButtons = Array.from(lastModal.querySelectorAll('button')).filter(b => /^install/i.test((b.textContent || '').trim()));
      const titles = Array.from(lastModal.querySelectorAll('strong')).map(e => e.textContent.trim()).filter(t => t.length > 0 && t.length < 50);
      return { mounted: true, installCount: installButtons.length, titles };
    });
    await page.screenshot({ path: join(OUT, 'qa-bulk-03-starter-kits.png'), fullPage: false });
    report.checks.starterKitsGallery = {
      pass: kitsProbe.mounted && kitsProbe.installCount >= 3 && kitsProbe.titles?.some(t => /purchase|recruitment|blog/i.test(t)),
      ...kitsProbe,
    };
  } else {
    report.checks.starterKitsGallery = { pass: false, reason: 'Starter kits button not in Custom Apps section' };
  }

  // close modal
  await page.evaluate(() => {
    const closes = Array.from(document.querySelectorAll('.mf-modal-close'));
    closes.reverse().forEach(c => c.click());
  });
  await page.waitForTimeout(500);
} else {
  report.checks.businessStarters = { pass: false, reason: 'Business Starters button not found' };
}

writeFileSync(join(OUT, 'qa-bulk-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
