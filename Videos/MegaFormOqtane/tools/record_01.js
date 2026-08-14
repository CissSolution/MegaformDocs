async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function newRecordingContext(page, dir) {
  const cookies = await page.context().cookies();
  const browser = page.context().browser();
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir, size: { width: 1920, height: 1080 } }
  });
  await ctx.addCookies(cookies);
  return ctx;
}

async function record(page) {
  const dir = 'Videos/MegaFormOqtane/recordings/01_ai_form_creation';
  const ctx = await newRecordingContext(page, dir);
  const p = await ctx.newPage();

  // Scene 1: Dashboard + Create with AI
  await p.goto('http://localhost:5070/?mfpanel=dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('button:has-text("Create with AI")', { timeout: 60000 });
  await wait(2500);
  await p.click('button:has-text("Create with AI")');
  await wait(2000);

  // Scene 2: Type prompt
  await p.fill('textarea[placeholder*="Describe the form"]', 'Create a customer registration form with name, email, phone and save to Registrations table');
  await wait(1000);
  await p.click('button:has-text("Send")');

  // Scene 3: Wait AI generate (up to 25s)
  await p.waitForSelector('.mfd-ai-preview form, [data-mfd-ai-preview] form, .mf-form-preview', { timeout: 30000 }).catch(() => {});
  await wait(8000);

  // Scene 4: Open builder
  await p.click('button:has-text("Open Builder")');
  await wait(3000);

  // Switch to admin builder
  await p.goto('http://localhost:5070/?mfpanel=builder&formId=867', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);

  // Open Settings tab and scroll to Database panel
  await p.evaluate(() => { document.getElementById('mf-tab-link-settings').click(); });
  await wait(1000);
  await p.evaluate(() => {
    const panel = document.querySelector('.mf-settings-scroll');
    const el = Array.from(panel.querySelectorAll('*')).find(e => e.textContent.includes('Database (save submission'));
    if (el && panel) panel.scrollTop = el.offsetTop - panel.offsetTop - 20;
  });
  await wait(5000);

  await ctx.close();
  return await p.video().path();
}

record(page);
