#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  'Samples/FormTemplates/Premium/botanical-thankyou.json',
  'Samples/FormTemplates/Premium/GALLERY-PUBLISHED/botanical-thankyou.json',
];
const markerStart = '/* [BotanicalSignatureWidget v20260809] */';
const markerEnd = '/* [/BotanicalSignatureWidget] */';
const markerPattern = new RegExp(`${markerStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${markerEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
const widgetCss = `${markerStart}
.mfp-botanical-thankyou .mfp-signature .mf-signature-field{display:flex!important;flex-direction:column!important;width:100%!important}
.mfp-botanical-thankyou .mfp-signature .mf-signature-canvas-wrap{overflow:hidden!important;min-height:96px!important;border:1px solid var(--bot-line)!important;border-radius:8px!important;background:color-mix(in srgb,var(--bot-paper) 88%,white)!important}
.mfp-botanical-thankyou .mfp-signature canvas.mf-signature-canvas{display:block!important;width:100%!important;height:96px!important;border:0!important;border-radius:0!important;background:transparent!important;touch-action:none!important}
.mfp-botanical-thankyou .mfp-signature .mf-signature-placeholder{color:var(--bot-muted)!important;font-family:var(--bot-font)!important;font-size:12px!important}
.mfp-botanical-thankyou .mfp-signature .mf-signature-actions{display:flex!important;justify-content:flex-end!important;gap:7px!important;margin-top:6px!important}
.mfp-botanical-thankyou .mfp-signature .mf-sig-clear,.mfp-botanical-thankyou .mfp-signature .mf-sig-undo{min-height:29px!important;padding:4px 10px!important;border:1px solid var(--bot-line)!important;border-radius:999px!important;background:var(--bot-paper)!important;color:var(--bot-muted)!important;font:700 11px/18px var(--bot-font)!important;text-transform:none!important;box-shadow:none!important}
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
  let count = 0;
  visit(template, (field) => {
    if (field.key !== 'signature') return;
    field.type = 'Signature';
    field.placeholder = '';
    field.widgetProps = {
      ...(field.widgetProps || {}),
      height: 96,
      placeholderText: 'Sign here',
      clearText: 'Clear',
      undoText: 'Undo',
    };
    count += 1;
  });
  if (count !== 1) throw new Error(`${relative}: expected one signature field, found ${count}`);

  const canonicalHtml = [template.customHtml, template.settings?.customHtml]
    .map((value) => String(value || ''))
    .sort((left, right) => right.length - left.length)[0];
  const canonicalCss = [template.customCss, template.settings?.customCss]
    .map((value) => String(value || '').replace(markerPattern, '').trim())
    .sort((left, right) => right.length - left.length)[0];
  if (!canonicalHtml || !canonicalCss) throw new Error(`${relative}: missing canonical custom shell`);

  const contracts = [template];
  if (template.settings && typeof template.settings === 'object') contracts.push(template.settings);
  for (const contract of contracts) {
    contract.customHtml = canonicalHtml
      .replace('Type your full name as a digital signature', 'Draw your signature below');
    const oldCss = canonicalCss
      .replace(/\.mfp-botanical-thankyou \.mfp-signature textarea\{[^}]*\}/g, '')
      .trim();
    contract.customCss = `${oldCss}\n\n${widgetCss}\n`;
  }
  writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`);
  console.log(`fixed ${relative}`);
}
