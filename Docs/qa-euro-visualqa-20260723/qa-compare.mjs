import { launch, sleep } from './recorder-lib.mjs';
import { writeFileSync } from 'node:fs';
const DNN = 'http://dnn10322_megaqa110.ai';
const MOCK = 'http://localhost:3000/forms/euro-youth';

const grab = `(() => {
  const px = el => { if(!el) return null; const c=getComputedStyle(el); const r=el.getBoundingClientRect();
    return { tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,60),
      rectW:Math.round(r.width), rectH:Math.round(r.height),
      width:c.width, maxWidth:c.maxWidth, margin:c.marginLeft+' '+c.marginRight,
      border:c.borderTopWidth+' '+c.borderStyle+' '+c.borderColor, borderRadius:c.borderTopLeftRadius,
      boxShadow:(c.boxShadow||'').slice(0,60), padding:c.paddingTop+' '+c.paddingRight+' '+c.paddingBottom+' '+c.paddingLeft,
      background:(c.backgroundColor), gridCols:c.gridTemplateColumns, gap:c.columnGap };
  };
  const q = s => document.querySelector(s);
  return px;
})()`;

async function capMock(page){
  await page.goto(MOCK,{waitUntil:'domcontentloaded',timeout:60000}); await sleep(3500);
  return await page.evaluate(() => {
    const c = getComputedStyle, R = el => el?el.getBoundingClientRect():null;
    const info = el => { if(!el) return null; const s=c(el),r=R(el); return { tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,70),
      rectW:Math.round(r.width), rectH:Math.round(r.height), maxWidth:s.maxWidth, margin:s.marginLeft+'/'+s.marginRight,
      border:s.borderTopWidth+' '+s.borderTopStyle+' '+s.borderTopColor, borderRadius:s.borderTopLeftRadius,
      boxShadow:(s.boxShadow||'none').slice(0,70), padding:s.padding, background:s.backgroundColor, gridCols:s.gridTemplateColumns, gap:s.columnGap };
    };
    const outer = document.querySelector('main > div');
    const hero = document.querySelector('main aside');
    const section = document.querySelector('main > div > section');
    const card = document.querySelector('main section .rounded-3xl') || (section && section.querySelector('div'));
    const grid = document.querySelector('main section .grid.gap-4') || document.querySelector('main section div.grid');
    return { viewport: innerWidth, outer:info(outer), hero:info(hero), section:info(section), card:info(card), grid:info(grid) };
  });
}
async function loginDnn(page){ await page.goto(DNN+'/Login?mflocale=en-US',{waitUntil:'load',timeout:180000}); await page.waitForSelector('[id$="txtUsername"]',{timeout:60000}); await page.fill('[id$="txtUsername"]','host'); await page.fill('[id$="txtPassword"]','dnnhost'); const b=page.locator('[id$="_cmdLogin"], [id$="cmdLogin"]').first(); await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:60000}).catch(()=>null),b.click()]); await sleep(3000); }
async function capDnn(page){
  await loginDnn(page);
  await page.goto(DNN+'/Premium-Templates-110/youth-application?mflocale=en-US',{waitUntil:'load',timeout:120000}); await sleep(6500);
  await page.evaluate(()=>window.scrollTo(0,0));
  return await page.evaluate(() => {
    const c = getComputedStyle, R = el => el?el.getBoundingClientRect():null;
    const info = el => { if(!el) return null; const s=c(el),r=R(el); return { tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,70),
      rectW:Math.round(r.width), rectH:Math.round(r.height), maxWidth:s.maxWidth, margin:s.marginLeft+'/'+s.marginRight,
      border:s.borderTopWidth+' '+s.borderTopStyle+' '+s.borderTopColor, borderRadius:s.borderTopLeftRadius,
      boxShadow:(s.boxShadow||'none').slice(0,70), padding:s.padding, background:s.backgroundColor, gridCols:s.gridTemplateColumns, gap:s.columnGap };
    };
    const mfp = document.querySelector('.mfp-euro-youth');
    const pane = mfp ? mfp.closest('.DnnModule, .ContentPane, [id*="ContentPane"]') || mfp.parentElement : null;
    return { viewport: innerWidth,
      contentPane: info(pane),
      mfp: info(mfp),
      shell: info(document.querySelector('.ey-shell')),
      hero: info(document.querySelector('.ey-hero')),
      panel: info(document.querySelector('.ey-panel')),
      card: info(document.querySelector('.ey-card')),
      grid: info(document.querySelector('.ey-grid-2')) };
  });
}

const s = await launch({ width:1440, height:1400, headless:true }); const page=s.page; page.setDefaultTimeout(90000);
const res = {};
try {
  console.log('== MOCK =='); res.mock = await capMock(page); console.log(JSON.stringify(res.mock,null,1));
  await page.screenshot({ path:'out/cmp-mock.png', fullPage:false });
  console.log('== DNN =='); res.dnn = await capDnn(page); console.log(JSON.stringify(res.dnn,null,1));
  await page.screenshot({ path:'out/cmp-dnn.png', fullPage:false });
  writeFileSync('qa-compare.json', JSON.stringify(res,null,2));
} catch(e){ console.log('FATAL', e.message, e.stack); }
finally { await s.browser.close(); }
