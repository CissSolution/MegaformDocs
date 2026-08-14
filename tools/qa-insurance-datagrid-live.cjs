const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outDir = path.join(process.cwd(), 'artifacts', 'visual-qa', 'insurance-datagrid');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1 });
  const url = process.argv[2] || 'http://megaclean008.ai/?mfFormId=231&qa=insurance-datagrid';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.mfp-insurance-enrollment', { timeout: 30000 });
  await page.waitForSelector('.ie-dependents [data-mfw-dgrid="1"]', { timeout: 30000 });
  await page.locator('.ie-dependents').scrollIntoViewIfNeeded();

  const screenshotPath = path.join(outDir, 'insurance-datagrid-live.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const metricsBefore = await page.evaluate(() => {
    const root = document.querySelector('.mfp-insurance-enrollment');
    const grid = document.querySelector('.ie-dependents [data-mfw-dgrid="1"]');
    const head = document.querySelector('.ie-dependents .mfw-dgrid-head .mfw-dgrid-cell');
    const hidden = document.querySelector('input[name="dependents"][data-mfw-dgrid-state="1"]');
    const rowCount = document.querySelectorAll('.ie-dependents [data-mfw-row]').length;
    const inputCount = document.querySelectorAll('.ie-dependents .mfw-dgrid-input').length;
    const fakeTableCount = document.querySelectorAll('.mfp-insurance-enrollment .ie-table').length;
    const ariaHiddenFakeCount = document.querySelectorAll('.ie-dependents [aria-hidden="true"], .mfp-insurance-enrollment .ie-table[aria-hidden="true"]').length;
    const gridStyle = grid ? getComputedStyle(grid) : null;
    const headStyle = head ? getComputedStyle(head) : null;
    return {
      hasRoot: !!root,
      hasDataGrid: !!grid,
      hiddenValueLength: hidden ? hidden.value.length : 0,
      hiddenPreview: hidden ? hidden.value.slice(0, 180) : null,
      rowCount,
      inputCount,
      fakeTableCount,
      ariaHiddenFakeCount,
      gridBorder: gridStyle ? gridStyle.borderTopStyle : null,
      headBackground: headStyle ? headStyle.backgroundColor : null,
      headColor: headStyle ? headStyle.color : null,
      headFontSize: headStyle ? headStyle.fontSize : null,
      headerLabels: Array.from(document.querySelectorAll('.ie-dependents .mfw-dgrid-head .mfw-dgrid-cell'))
        .map((x) => x.textContent.trim()),
    };
  });

  const nameInputs = page.locator('.ie-dependents [data-mfw-row="0"] [data-mfw-cell="name"]');
  const nameInputCount = await nameInputs.count();
  if (nameInputCount !== 1) {
    throw new Error(`Expected one first-row dependent name input, got ${nameInputCount}`);
  }
  await nameInputs.fill('Avery Stone');
  await page.locator('.ie-dependents [data-mfw-row="0"] [data-mfw-cell="relationship"]').fill('Child');

  const metricsAfter = await page.evaluate(() => {
    const hidden = document.querySelector('input[name="dependents"][data-mfw-dgrid-state="1"]');
    let parsed = null;
    try { parsed = hidden && hidden.value ? JSON.parse(hidden.value) : null; } catch {}
    return {
      hiddenValue: hidden ? hidden.value : null,
      parsedRows: Array.isArray(parsed) ? parsed.length : 0,
      firstRow: Array.isArray(parsed) ? parsed[0] : null,
    };
  });

  const report = {
    url,
    screenshotPath,
    pass: Boolean(
      metricsBefore.hasRoot &&
      metricsBefore.hasDataGrid &&
      metricsBefore.rowCount >= 3 &&
      metricsBefore.inputCount >= 18 &&
      metricsBefore.fakeTableCount === 0 &&
      metricsBefore.ariaHiddenFakeCount === 0 &&
      metricsAfter.parsedRows >= 3 &&
      metricsAfter.firstRow &&
      metricsAfter.firstRow.name === 'Avery Stone' &&
      metricsAfter.firstRow.relationship === 'Child'
    ),
    metricsBefore,
    metricsAfter,
  };

  const reportPath = path.join(outDir, 'insurance-datagrid-live.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
