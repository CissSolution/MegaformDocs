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

async function record01_AI_Form_Creation(page) {
  const dir = 'Videos/MegaFormOqtane/recordings/01_ai_form_creation';
  const ctx = await newRecordingContext(page, dir);
  const p = await ctx.newPage();

  // Scene 1: Dashboard + Create with AI
  await p.goto('http://localhost:5070/?mfpanel=dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('button:has-text("Create with AI")', { timeout: 60000 });
  await wait(2000);
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
  await wait(4000);

  await ctx.close();
  const path = await p.video().path();
  return path;
}

async function record02_Rapid_Form_Builder(page) {
  const dir = 'Videos/MegaFormOqtane/recordings/02_rapid_form_builder';
  const ctx = await newRecordingContext(page, dir);
  const p = await ctx.newPage();

  await p.goto('http://localhost:5070/?mfpanel=builder&formId=867', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);

  // Drag Input field onto canvas
  await p.dragAndDrop('.mf-field-palette [data-type="text"]', '.mf-canvas-drop-zone').catch(() => {});
  await wait(2000);

  // Click Email field to show properties
  await p.click('.mf-field:has-text("Email"), .mf-canvas [data-key*="email"]').catch(() => {});
  await wait(2000);

  // Open Layout tab and drag Section
  await p.click('button:has-text("Layout")');
  await wait(1000);
  await p.dragAndDrop('.mf-field-palette [data-type="section"]', '.mf-canvas-drop-zone').catch(() => {});
  await wait(2000);

  // Design tab
  await p.click('button:has-text("Design")');
  await wait(3000);

  await ctx.close();
  const path = await p.video().path();
  return path;
}

async function record03_Database_Connectivity(page) {
  const dir = 'Videos/MegaFormOqtane/recordings/03_database_connectivity';
  const ctx = await newRecordingContext(page, dir);
  const p = await ctx.newPage();

  // Use an existing DB-connected form
  await p.goto('http://localhost:5070/?mfpanel=builder&formId=863', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);

  await p.evaluate(() => { document.getElementById('mf-tab-link-settings').click(); });
  await wait(1000);
  await p.evaluate(() => {
    const panel = document.querySelector('.mf-settings-scroll');
    const el = Array.from(panel.querySelectorAll('*')).find(e => e.textContent.includes('Database (save submission'));
    if (el && panel) panel.scrollTop = el.offsetTop - panel.offsetTop - 20;
  });
  await wait(3000);

  // Highlight INSERT SQL area by clicking it
  await p.click('#mf-setting-db-insert-enabled').catch(() => {});
  await wait(3000);

  await ctx.close();
  const path = await p.video().path();
  return path;
}

async function record04_Personal_Inbox_Workflow(page) {
  const dir = 'Videos/MegaFormOqtane/recordings/04_personal_inbox_workflow';
  const ctx = await newRecordingContext(page, dir);
  const p = await ctx.newPage();

  // Workflow tab in builder
  await p.goto('http://localhost:5070/?mfpanel=builder&formId=863', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);
  await p.evaluate(() => { document.getElementById('mf-tab-link-bpmn').click(); });
  await wait(4000);

  // My Inbox
  await p.goto('http://localhost:5070/?mfpanel=my-inbox', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);

  await ctx.close();
  const path = await p.video().path();
  return path;
}

async function record05_Developer_API_SDK(page) {
  const dir = 'Videos/MegaFormOqtane/recordings/05_developer_api_sdk';
  const ctx = await newRecordingContext(page, dir);
  const p = await ctx.newPage();

  // Show SDK files / code on screen using a simple HTML page created locally
  await p.goto('http://localhost:5070/?mfpanel=builder&formId=863', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);
  await p.evaluate(() => { document.getElementById('mf-tab-link-settings').click(); });
  await wait(1000);
  await p.evaluate(() => {
    const panel = document.querySelector('.mf-settings-scroll');
    if (panel) panel.scrollTop = 0;
  });
  await wait(3000);

  await ctx.close();
  const path = await p.video().path();
  return path;
}

export default async function recordAll(page) {
  const results = {};
  results['01'] = await record01_AI_Form_Creation(page);
  results['02'] = await record02_Rapid_Form_Builder(page);
  results['03'] = await record03_Database_Connectivity(page);
  results['04'] = await record04_Personal_Inbox_Workflow(page);
  results['05'] = await record05_Developer_API_SDK(page);
  return results;
}
