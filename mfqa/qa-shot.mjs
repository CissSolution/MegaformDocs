import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
for (const [l,w,h] of [['mobile',390,850],['desktop',1440,900]]) {
  const c = await b.newContext({ viewport:{width:w,height:h} });
  const p = await c.newPage();
  await p.goto('http://localhost:5070/mfqa-panes',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(8000);
  await p.screenshot({ path:`mfqa/out/b278-fixed-${l}.png`, fullPage:true });
  console.log('shot', l);
  await c.close();
}
await b.close();
