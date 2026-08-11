// Doc chu that su hien tren pager cua template gallery, sau khi JS da chay.
//
// Vi sao can: pager duoc dung phia client tu so the BEN TRONG .mfh-grid, con dong "N live demos"
// la chu tinh trong HTML. Dem the bang regex tren HTML tho KHONG chung minh duoc hai con so khop -
// mot lan chen the ra ngoai luoi da cho header 73 va pager 34 ma vong kiem tra van bao dat.
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://dnndefender.com/MegaForm';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const grid = document.querySelector('.mfh-grid');
  const pager = document.querySelector('.mfh-pager');
  const head = document.querySelector('.mfh-secthead span');
  return {
    cardsInGrid: grid ? grid.querySelectorAll('.mfh-card').length : -1,
    cardsOnPage: document.querySelectorAll('.mfh-card').length,
    cardsOutsideGrid: document.querySelectorAll('.mfh-card').length - (grid ? grid.querySelectorAll('.mfh-card').length : 0),
    heading: head ? head.textContent.trim() : null,
    pager: pager ? pager.textContent.replace(/\s+/g, ' ').trim() : null,
    visibleNow: [...document.querySelectorAll('.mfh-card')].filter((c) => c.offsetParent !== null).length,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
