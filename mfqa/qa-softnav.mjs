// B273 QA — soft-nav blank-builder fix. Verify "Form Builder" admin-dock link forces a FULL
// reload (data-enhance-nav="false") and the builder actually renders (not blank).
import { launch, login, shot, BASE } from './lib.mjs';
const { browser, page, errs } = await launch();
await login(page);

// Homepage form view should show the admin dock for the logged-in host.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

const dock = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a.mf-oq-linkbtn, a.mf-oq-btn')].map(a => ({
    text: (a.textContent || '').trim(),
    href: a.getAttribute('href'),
    enhanceNav: a.getAttribute('data-enhance-nav'),
  }));
  return { hasDock: !!document.querySelector('.mf-oq-admin-dock'), links };
});
console.log('[homepage admin dock]', JSON.stringify(dock, null, 0));

const builderLink = dock.links.find(l => /form builder/i.test(l.text));
console.log('Form Builder link data-enhance-nav =', builderLink ? builderLink.enhanceNav : '(link not found)');

let clickResult = null;
if (builderLink) {
  // Probe full-reload: a window property survives soft-nav but is wiped by a full reload.
  await page.evaluate(() => { window.__mfNavProbe = 'alive'; });
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('a.mf-oq-linkbtn')].find(x => /form builder/i.test(x.textContent || ''));
    if (a) a.click();
  });
  await page.waitForTimeout(6000);
  clickResult = await page.evaluate(() => {
    const root = document.getElementById('mf-builder-root');
    return {
      url: location.href,
      fullReloadHappened: typeof window.__mfNavProbe === 'undefined',  // wiped → full reload
      builderRootPresent: !!root,
      builderRootHasContent: !!root && root.children.length > 0,
      hasDesignToggle: !!document.getElementById('mf-mode-design'),
      hasThemeDesigner: !!document.querySelector('[data-mf-theme-subtab], .mf-canvas, #mf-canvas-dropzone, .w-topbar'),
    };
  });
  console.log('[after clicking Form Builder]', JSON.stringify(clickResult, null, 0));
  await shot(page, 'b273-builder-after-softnav-click.png');
}

console.log('\n=== SUMMARY ===');
console.log('builder link has data-enhance-nav=false:', builderLink && builderLink.enhanceNav === 'false');
console.log('click → FULL reload:', !!clickResult && clickResult.fullReloadHappened);
console.log('builder rendered (not blank):', !!clickResult && (clickResult.hasDesignToggle || clickResult.hasThemeDesigner || clickResult.builderRootHasContent));
console.log('console errors:', JSON.stringify(errs.slice(0, 4)));
await browser.close();
