import { launch, sleep } from './recorder-lib.mjs';
const DNN = 'http://dnn10322_megaqa110.ai';
async function loginDnn(page){ await page.goto(DNN+'/Login?mflocale=en-US',{waitUntil:'load',timeout:180000}); await page.waitForSelector('[id$="txtUsername"]',{timeout:60000}); await page.fill('[id$="txtUsername"]','host'); await page.fill('[id$="txtPassword"]','dnnhost'); const b=page.locator('[id$="_cmdLogin"], [id$="cmdLogin"]').first(); await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:60000}).catch(()=>null),b.click()]); await sleep(3000); }
const s = await launch({ width:1440, height:1400, headless:true }); const page=s.page; page.setDefaultTimeout(90000);
try {
  await loginDnn(page);
  await page.goto(DNN+'/Premium-Templates-110/youth-application?mflocale=en-US',{waitUntil:'load',timeout:120000}); await sleep(6500);
  const r = await page.evaluate(() => {
    const mfp = document.querySelector('.mfp-euro-youth');
    const cs = getComputedStyle(mfp);
    const shell = document.querySelector('.ey-shell'), panel=document.querySelector('.ey-panel'), hero=document.querySelector('.ey-hero'), card=document.querySelector('.ey-card');
    const vv = n => cs.getPropertyValue(n).trim();
    const bg = el => el?getComputedStyle(el).backgroundColor:null;
    const rr = el => el?Math.round(el.getBoundingClientRect().height):null;
    return {
      vars: { '--ey-wash':vv('--ey-wash'), '--ey-card':vv('--ey-card'), '--ey-border2':vv('--ey-border2'),
              '--mf-page-wash':vv('--mf-page-wash'), '--mf-preset-bg':vv('--mf-preset-bg'),
              '--mf-page-surface':vv('--mf-page-surface'), '--mf-preset-surface':vv('--mf-preset-surface'),
              '--mf-page-bg':vv('--mf-page-bg') },
      bg: { shell:bg(shell), panel:bg(panel), hero:bg(hero), card:bg(card) },
      heights: { shell:rr(shell), hero:rr(hero), panel:rr(panel), card:rr(card) },
      heroFillsShell: rr(hero) && rr(shell) ? (Math.abs(rr(hero)-rr(shell))<=4) : null,
      pageBodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
  console.log(JSON.stringify(r,null,2));
} catch(e){ console.log('FATAL', e.message); }
finally { await s.browser.close(); }
