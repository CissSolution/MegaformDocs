// Do khoi hero + khung ngoai cua mot form template, de biet vi sao hero toi den va vi sao co
// "card thua" bao quanh. Doc mau THAT da tinh toan, khong doc CSS nguon.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(async () => {
  const info = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      box: [Math.round(r.left), Math.round(r.right), Math.round(r.width), Math.round(r.height)],
      bg: cs.backgroundColor, bgImage: (cs.backgroundImage || '').slice(0, 90),
      color: cs.color, opacity: cs.opacity, radius: cs.borderRadius,
    };
  };
  // Anh hero co that su tai duoc khong (200 khac voi "ve ra duoc")
  const url = (getComputedStyle(document.querySelector('.mfp-hero-image') || document.body).backgroundImage || '')
    .replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
  let img = null;
  if (url && url !== 'none') {
    img = await new Promise((res) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res('LOI TAI ANH');
      i.src = url;
    });
  }
  // Khung ngoai: to nhat trong cac to tien co bo tron va nen toi
  const wrap = [];
  let el = document.querySelector('.mfp-hero');
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (parseFloat(cs.borderRadius) > 4 || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      wrap.push({ sel: el.tagName + '.' + (el.className || '').toString().slice(0, 45), w: Math.round(r.width), bg: cs.backgroundColor, radius: cs.borderRadius });
    }
    el = el.parentElement;
  }
  return { heroImage: info('.mfp-hero-image'), overlay: info('.mfp-hero-overlay'), title: info('.mfp-hero-title'),
           hero: info('.mfp-hero'), anhTaiDuoc: img, toTien: wrap };
}), null, 2));
await browser.close();
