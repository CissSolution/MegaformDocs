// Synthetic browser QA for the DataGrid Studio popup. Anonymous users
// can't reach the builder, but the Studio is a self-contained plugin
// that only requires window.MegaFormBuilder.state.schema.fields. We
// inject a mock builder state, load the plugin via a <script> tag, then
// call MFDataGridStudio.open() and snapshot the modal.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Visit any page that loads MegaForm assets so we can piggyback the CRM version
await page.goto(`${BASE}/xx?formid=293`, { waitUntil: 'domcontentloaded', timeout: 45000 });

// Inject a mock builder state with a DataGrid field
await page.evaluate(() => {
  (window).MegaFormBuilder = {
    state: {
      isDirty: false,
      schema: {
        fields: [
          {
            key: 'demo_grid',
            type: 'DataGrid',
            label: 'Demo grid',
            widgetProps: {
              tableName: 'Products',
              parentKeyColumn: 'SupplierId',
              displayTemplate: 'card',
              imageColumn: 'image_url',
              titleColumn: 'product_name',
              subtitleColumn: 'sku',
              allowAdd: true,
              allowDelete: true,
              columns: [
                { key: 'image_url',    label: 'Image',         type: 'image',    width: '1fr',   required: false, placeholder: 'Paste URL' },
                { key: 'product_name', label: 'Product name',  type: 'text',     width: '2fr',   required: true },
                { key: 'unit_price',   label: 'Unit price',    type: 'currency', width: '120px', required: true, decimals: 2 },
                { key: 'stock_qty',    label: 'Stock qty',     type: 'number',   width: '110px', decimals: 0 },
                { key: 'sku',          label: 'SKU',           type: 'text',     width: '130px' }
              ]
            }
          }
        ]
      }
    },
    callModule: () => {},
    syncSchemaToHtmlImmediate: () => {},
  };
});

// Load the studio plugin script
await page.addScriptTag({ url: `/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-datagrid-studio.js?_=${Date.now()}` });

// Confirm global is present
const hasStudio = await page.evaluate(() => typeof (window).MFDataGridStudio?.open === 'function');
const badge    = await page.evaluate(() => (window).MFDataGridStudio?.badge);
console.log('hasStudio:', hasStudio, 'badge:', badge);

// Open it
await page.evaluate(() => (window).MFDataGridStudio.open('demo_grid'));
await page.waitForSelector('.mf-dgs-overlay', { timeout: 5000 });

const settingsCount = await page.locator('[data-mf-dgs-panel="settings"] .mf-dgs-row').count();
const tabCount      = await page.locator('.mf-dgs-tab').count();
const colCountTxt   = await page.locator('[data-mf-dgs-colcount]').first().textContent();

await page.screenshot({ path: join(OUT, 'datagrid-studio-01-settings.png'), fullPage: false });

// Switch to Columns tab
await page.locator('[data-mf-dgs-tab="columns"]').click();
await page.waitForTimeout(400);
const colsCount = await page.locator('[data-mf-dgs-col]').count();
// Expand first column
await page.locator('[data-mf-dgs-col-toggle]').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'datagrid-studio-02-columns.png'), fullPage: false });

// Switch to Display Template tab
await page.locator('[data-mf-dgs-tab="template"]').click();
await page.waitForTimeout(300);
const templateSelected = await page.locator('[data-mf-dgs-input="displayTemplate"]').first().inputValue();
const imageColSelected = await page.locator('[data-mf-dgs-input="imageColumn"]').first().inputValue();
await page.screenshot({ path: join(OUT, 'datagrid-studio-03-template.png'), fullPage: false });

// Switch to Data Bind tab
await page.locator('[data-mf-dgs-tab="bind"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'datagrid-studio-04-bind.png'), fullPage: false });

// Edit a column — change product_name label
await page.locator('[data-mf-dgs-tab="columns"]').click();
await page.waitForTimeout(300);
// Open the second column (product_name)
await page.locator('[data-mf-dgs-col-toggle]').nth(1).click();
await page.waitForTimeout(300);
const labelInp = page.locator('[data-mf-dgs-col="1"] [data-mf-dgs-col-field="label"]');
await labelInp.fill('Tên hàng hoá (edited)');
await labelInp.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await page.waitForTimeout(300);
// Verify the schema mutated
const editedLabel = await page.evaluate(() => (window).MegaFormBuilder.state.schema.fields[0].widgetProps.columns[1].label);
const isDirty     = await page.evaluate(() => (window).MegaFormBuilder.state.isDirty);
await page.screenshot({ path: join(OUT, 'datagrid-studio-05-edited.png'), fullPage: false });

const report = {
  hasStudio, badge,
  settingsRows: settingsCount,
  tabCount,
  colCount: colCountTxt,
  columnsRendered: colsCount,
  templateSelected, imageColSelected,
  editedLabel, isDirty,
  consoleErrors: errs
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'datagrid-studio-report.json'), JSON.stringify(report, null, 2));
await browser.close();
