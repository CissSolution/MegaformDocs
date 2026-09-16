import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const value = process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[++i]
    : 'true';
  args.set(key.slice(2), value);
}

const baseUrl = String(args.get('base-url') || 'http://127.0.0.1:5518').replace(/\/$/, '');
const email = args.get('email') || process.env.MF_UMBRACO_EMAIL || 'admin@example.com';
const password = args.get('password') || process.env.MF_UMBRACO_PASSWORD || '';
const requestedForm = args.get('form') || '';
const directFormId = Number(args.get('direct-form-id') || 0);
const workspaceFormId = Number(args.get('form-id') || 0);
const expectedHost = args.get('host') || 'umbraco-workspace';
const outputDir = path.resolve(args.get('output') || 'artifacts/umbraco-workspace-qa');
const playwrightModule = process.env.MF_PLAYWRIGHT_MODULE || 'playwright';
const require = createRequire(import.meta.url);
const { chromium } = require(playwrightModule);

if (!password && !(directFormId > 0)) {
  throw new Error('Set --password or MF_UMBRACO_PASSWORD, or use --direct-form-id for frame-only QA.');
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
const page = await context.newPage();

async function waitForFrame(urlPattern, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => urlPattern.test(candidate.url()));
    if (frame) return frame;
    await page.waitForTimeout(250);
  }
  return null;
}

const report = {
  baseUrl,
  requestedForm: requestedForm || '(first available form)',
  mode: directFormId > 0 ? 'direct-builder' : 'workspace-route',
  startedAt: new Date().toISOString(),
  checks: {},
};

try {
  let builderFrame;
  if (directFormId > 0) {
    const directUrl = `${baseUrl}/umbraco/MegaForm/Builder/${directFormId}?host=${encodeURIComponent(expectedHost)}`;
    await page.goto(directUrl, { waitUntil: 'domcontentloaded' });
    builderFrame = page.mainFrame();
    report.checks.outerRoute = `not-run; direct builder QA at ${directUrl}`;
  } else {
    await page.goto(`${baseUrl}/umbraco/section/megaform`, { waitUntil: 'domcontentloaded' });
    // The Bellissima shell paints its requested route before the OAuth client decides whether
    // it has a session. Give that decision time to redirect through authorize -> login.
    await page.waitForTimeout(2_500);
    if (/\/security\/back-office\/authorize/i.test(page.url())) {
      await page.waitForURL((url) => /\/umbraco\/login/i.test(url.pathname), { timeout: 30_000 });
    }

    if (/\/umbraco\/login/i.test(page.url())) {
      // Umbraco 18 renders the login controls through nested web components. Their visual
      // labels are not consistently exposed as accessible labels in headless Chromium.
      const emailInput = page.locator('input[type="email"], input[name="email"], input').first();
      const passwordInput = page.locator('input[type="password"]').first();
      const loginButton = page.locator('button[type="submit"], button').filter({ hasText: 'Login' }).first();
      await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await loginButton.click();
      await page.waitForURL((url) => /\/umbraco(?:\/section\/megaform)?\/?$/i.test(url.pathname), {
        timeout: 30_000,
      });
      await page.goto(`${baseUrl}/umbraco/section/megaform`, { waitUntil: 'domcontentloaded' });
    }

    const dashboardFrame = await waitForFrame(/\/umbraco\/MegaForm\/Admin/i);
    if (!dashboardFrame) {
      const diagnosticPath = path.join(outputDir, `umbraco-${new URL(baseUrl).port}-dashboard-timeout.png`);
      await page.screenshot({ path: diagnosticPath, fullPage: true });
      const visibleText = (await page.locator('body').innerText()).slice(0, 2_000);
      console.error(JSON.stringify({ url: page.url(), diagnosticPath, visibleText }, null, 2));
      throw new Error('MegaForm dashboard iframe did not load.');
    }

    const openForm = requestedForm
      ? dashboardFrame.getByText(requestedForm, { exact: false }).first()
      : dashboardFrame.locator('a[href*="/umbraco/MegaForm/Builder/"]').first();
    let opened = false;
    if (workspaceFormId > 0) {
      await dashboardFrame.goto(`${baseUrl}/umbraco/MegaForm/Builder/${workspaceFormId}`);
      opened = true;
    } else if (await openForm.count() > 0) {
      await openForm.click();
      opened = true;
    } else if (requestedForm) {
      opened = await dashboardFrame.evaluate((label) => {
        const visit = (root) => {
          const candidates = root.querySelectorAll?.('a, button, [role="button"], [data-form-id]') || [];
          for (const candidate of candidates) {
            if ((candidate.textContent || '').includes(label)) {
              candidate.click();
              return true;
            }
          }
          const elements = root.querySelectorAll?.('*') || [];
          for (const element of elements) {
            if (element.shadowRoot && visit(element.shadowRoot)) return true;
          }
          return false;
        };
        return visit(document);
      }, requestedForm);
    }

    if (!opened) {
      console.error(JSON.stringify({
        frames: page.frames().map((frame) => frame.url()),
        dashboardText: (await dashboardFrame.locator('body').innerText()).slice(0, 2_000),
      }, null, 2));
      throw new Error(`Could not find ${requestedForm ? `form "${requestedForm}"` : 'a form link'} in the dashboard.`);
    }

    await page.waitForURL(/\/umbraco\/section\/megaform\/view\/open\/builder\/\d+/i, { timeout: 30_000 });
    report.checks.outerRoute = page.url();
    builderFrame = await waitForFrame(/\/umbraco\/MegaForm\/Builder\/\d+/i);
    if (!builderFrame) throw new Error('Workspace did not replace the dashboard frame with the builder frame.');
  }

  await builderFrame.locator('#mf-builder-root').waitFor({ state: 'visible', timeout: 30_000 });
  await builderFrame.locator('.mf-form-wrapper').waitFor({ state: 'visible', timeout: 30_000 });

  const metrics = await builderFrame.evaluate(() => {
    const root = document.getElementById('mf-builder-root');
    const topbar = document.querySelector('.w-topbar');
    const primary = document.querySelector('.mf-primary-bar');
    const layout = document.querySelector('.mf-builder-layout');
    const canvas = document.getElementById('mf-canvas-dropzone');
    const form = document.querySelector('.mf-form-wrapper');
    const footer = document.getElementById('mf-inline-workflow-summary');
    const rect = (element) => element ? element.getBoundingClientRect().toJSON() : null;
    const style = (element, property) => element ? getComputedStyle(element)[property] : null;
    const primaryRect = rect(primary);
    const topbarRect = rect(topbar);
    const layoutRect = rect(layout);
    const canvasRect = rect(canvas);
    const formRect = rect(form);
    return {
      host: root?.dataset.mfHost || '',
      topbarDisplay: style(topbar, 'display'),
      primaryDisplay: style(primary, 'display'),
      topbarRect,
      primaryRect,
      layoutRect,
      canvasRect,
      formRect,
      toolbarToLayoutGap: layoutRect ? Math.round(layoutRect.top - Math.max(
        topbarRect && style(topbar, 'display') !== 'none' ? topbarRect.bottom : 0,
        primaryRect && style(primary, 'display') !== 'none' ? primaryRect.bottom : 0,
      )) : null,
      canvasToFormGap: canvasRect && formRect ? Math.round(formRect.top - canvasRect.top) : null,
      workflowSummaryExists: Boolean(footer),
      workflowSummaryDisplay: style(footer, 'display'),
      bodyMode: document.body.dataset.mfMode || '',
    };
  });

  report.metrics = metrics;
  report.checks.workspaceHost = metrics.host === expectedHost;
  report.checks.builderMode = metrics.bodyMode === 'build';
  report.checks.noBlankToolbarBand = metrics.toolbarToLayoutGap !== null && metrics.toolbarToLayoutGap <= 4;
  report.checks.canvasAnchoredToTop = metrics.canvasToFormGap !== null && metrics.canvasToFormGap <= 40;
  report.checks.workflowSummaryExists = metrics.workflowSummaryExists;

  const screenshotPath = path.join(outputDir, `umbraco-${new URL(baseUrl).port}-workspace.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  report.screenshot = screenshotPath;

  const workflow = builderFrame.locator('#mf-inline-workflow-summary');
  await workflow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  report.checks.workflowSummaryVisible = await workflow.isVisible();
  const workflowScreenshotPath = path.join(outputDir, `umbraco-${new URL(baseUrl).port}-workflow-summary.png`);
  await page.screenshot({ path: workflowScreenshotPath, fullPage: false });
  report.workflowScreenshot = workflowScreenshotPath;

  const failed = Object.entries(report.checks).filter(([, value]) => value === false);
  report.passed = failed.length === 0;
  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
