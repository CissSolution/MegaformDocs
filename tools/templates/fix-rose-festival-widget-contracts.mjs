#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  'Samples/FormTemplates/Premium/GALLERY-PUBLISHED/Rose_festival_row_based_OK.json',
];

const markerStart = '/* [RoseWidgetContracts v20260809] */';
const markerEnd = '/* [/RoseWidgetContracts] */';
const widgetCss = `${markerStart}
.mfp.rose-festival .rose-card-corner{display:none!important}
.mfp.rose-festival .rose-section-finish .mf-signature-field{display:flex!important;flex-direction:column!important;width:100%!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
.mfp.rose-festival .rose-section-finish .mf-signature-canvas-wrap{position:relative!important;display:block!important;overflow:hidden!important;width:100%!important;min-height:96px!important;margin:0!important;padding:0!important;border:1.5px solid var(--rose-border)!important;border-radius:12px!important;background:var(--rose-cream)!important;box-shadow:none!important}
.mfp.rose-festival .rose-section-finish canvas.mf-signature-canvas{display:block!important;box-sizing:border-box!important;width:100%!important;height:96px!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;cursor:crosshair!important;touch-action:none!important}
.mfp.rose-festival .rose-section-finish .mf-signature-placeholder{position:absolute!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;color:var(--rose-text-muted)!important;pointer-events:none!important}
.mfp.rose-festival .rose-section-finish .mf-signature-placeholder svg{width:18px!important;height:18px!important}
.mfp.rose-festival .rose-section-finish .mf-signature-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;margin:6px 0 0!important;padding:0!important;border:0!important;background:transparent!important}
.mfp.rose-festival .rose-section-finish .mf-sig-clear,.mfp.rose-festival .rose-section-finish .mf-sig-undo{min-width:0!important;min-height:30px!important;margin:0!important;padding:5px 10px!important;border:1px solid var(--rose-border)!important;border-radius:8px!important;background:var(--rose-white)!important;color:var(--rose-text-muted)!important;box-shadow:none!important;font-family:'Lato',sans-serif!important;font-size:12px!important;line-height:18px!important;text-transform:none!important}
.mfp.rose-festival .rose-section-finish .mf-sig-clear:hover,.mfp.rose-festival .rose-section-finish .mf-sig-undo:hover{border-color:var(--rose-pink)!important;color:var(--rose-pink-dark)!important}
${markerEnd}`;

function visit(value, callback) {
  if (!value || typeof value !== 'object') return;
  callback(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => visit(item, callback));
    else if (child && typeof child === 'object') visit(child, callback);
  }
}

for (const relative of files) {
  const file = resolve(relative);
  const template = JSON.parse(readFileSync(file, 'utf8'));
  let signatureCount = 0;
  visit(template, (field) => {
    if (field.key !== 'signature' || field.type !== 'Signature') return;
    field.widgetProps = {
      ...(field.widgetProps || {}),
      height: 96,
      placeholderText: 'Sign here',
      clearText: 'Clear',
      undoText: 'Undo',
    };
    signatureCount += 1;
  });
  if (signatureCount !== 1) throw new Error(`${relative}: expected one Signature field, found ${signatureCount}`);

  const markerPattern = new RegExp(`${markerStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${markerEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
  const contracts = [template];
  if (template.settings && typeof template.settings === 'object') contracts.push(template.settings);
  for (const contract of contracts) {
    contract.customHtml = String(contract.customHtml || '')
      .replace(/\s*<div class="rose-card-corner (?:tl|tr|bl|br)"><\/div>/g, '');
    if (/rose-card-corner/.test(contract.customHtml)) {
      throw new Error(`${relative}: corner markup remains in a customHtml contract`);
    }
    const oldCss = String(contract.customCss || '');
    contract.customCss = `${oldCss.replace(markerPattern, '').trim()}\n\n${widgetCss}\n`;
  }
  writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`fixed ${relative}`);
}
