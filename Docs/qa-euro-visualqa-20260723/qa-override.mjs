import { launch, sleep } from './recorder-lib.mjs';
const DNN = 'http://dnn10322_megaqa110.ai';
async function loginDnn(page){ await page.goto(DNN+'/Login?mflocale=en-US',{waitUntil:'load',timeout:180000}); await page.waitForSelector('[id$="txtUsername"]',{timeout:60000}); await page.fill('[id$="txtUsername"]','host'); await page.fill('[id$="txtPassword"]','dnnhost'); const b=page.locator('[id$="_cmdLogin"], [id$="cmdLogin"]').first(); await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:60000}).catch(()=>null),b.click()]); await sleep(3000); }
const s = await launch({ width:1440, height:1400, headless:true }); const page=s.page; page.setDefaultTimeout(90000);
try {
  await loginDnn(page);
  await page.goto(DNN+'/Premium-Templates-110/youth-application?mflocale=en-US',{waitUntil:'load',timeout:120000}); await sleep(6500);
  const r = await page.evaluate(() => {
    const hits = [];
    const wantSel = /ey-shell|ey-panel|\.mfp\b(?![-\w])/;
    const scan = (rules, href) => {
      for (const rule of rules) {
        try {
          if (rule.cssRules) { scan(rule.cssRules, href + (rule.conditionText?(' @'+rule.conditionText):'')); continue; }
          const sel = rule.selectorText || '';
          if ((/ey-shell|ey-panel/.test(sel)) && /background/.test(rule.style.cssText)) {
            hits.push({ sel, bg: rule.style.getPropertyValue('background') || rule.style.getPropertyValue('background-color'), href: (href||'inline').split('/').slice(-1)[0] });
          }
        } catch(e){}
      }
    };
    for (const sh of document.styleSheets) { try { scan(sh.cssRules, sh.href||'inline'); } catch(e){ hits.push({err:'cors', href:(sh.href||'').split('/').slice(-1)[0]}); } }
    // also: which rule WINS for .ey-shell background — walk matched rules
    return { count: hits.length, hits };
  });
  console.log(JSON.stringify(r,null,2));
} catch(e){ console.log('FATAL', e.message); }
finally { await s.browser.close(); }
