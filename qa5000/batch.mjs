// Batch keep-style capability matrix across the 4 premium test copies on :5000.
import { launch, login, getAiConfig, OUT } from './lib.mjs';
import { runCase } from './case.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// formId: 11=bulgaria, 13=australia, 14=festa, 15=intake (test copies)
const MATRIX = [
  // bulgaria (11) — C1+C6 already proven; cover C7/C3/C8
  { formId: 11, slug: 'bulgaria-discovery-programme', caseId: 'b-c7', cap: 'C7 cards', expectColor: 0,
    prompt: 'For the "purpose_type" CARD field, replace its options with 4 reproductive-health service cards (each with label, a short meta subtitle, a one-line description, and a relevant emoji icon). Keep optionDisplay cards and the design.' },
  { formId: 11, slug: 'bulgaria-discovery-programme', caseId: 'b-c3', cap: 'C3 remove field', expectColor: 0,
    prompt: 'Remove the "referral" field entirely (how did you hear about us). Keep every other field and the design.' },
  { formId: 11, slug: 'bulgaria-discovery-programme', caseId: 'b-c8', cap: 'C8 colour', expectColor: 1,
    prompt: 'Change the form accent/primary colour to a teal/green clinical palette. Use themeCssOverrides only; do NOT touch customCss.' },

  // australia (13) — full sweep C1/C6/C7/C2/C3/C8
  { formId: 13, slug: 'down-under-australia', caseId: 'a-c1', cap: 'C1 rebrand', expectColor: 0,
    prompt: 'Rebrand this into a "New Zealand Adventure Gap-Year" application. Rebrand the visible hero heading, subtitle, step labels and section captions via set_html_text using the exact current shell strings, update the title and field labels. Keep the design/layout/colours/structure identical.' },
  { formId: 13, slug: 'down-under-australia', caseId: 'a-c6', cap: 'C6 chips', expectColor: 0,
    prompt: 'For the "interests" chip field replace options with New Zealand activities (e.g. Milford Sound, Hobbiton, bungee, glaciers, Maori culture, kayaking). Keep chips display + design.' },
  { formId: 13, slug: 'down-under-australia', caseId: 'a-c7', cap: 'C7 cards', expectColor: 0,
    prompt: 'For the "purpose" CARD field replace options with 4 NZ trip purposes (label + meta + description + emoji icon each). Keep cards display + design.' },
  { formId: 13, slug: 'down-under-australia', caseId: 'a-c2', cap: 'C2 add field', expectColor: 0,
    prompt: 'Add a new required Text field with key "passport_number" labelled "Passport number" in the last step. Keep the design.' },
  { formId: 13, slug: 'down-under-australia', caseId: 'a-c3', cap: 'C3 remove field', expectColor: 0,
    prompt: 'Remove the "stay" field entirely. Keep every other field and the design.' },
  { formId: 13, slug: 'down-under-australia', caseId: 'a-c8', cap: 'C8 colour', expectColor: 1,
    prompt: 'Change the primary/accent colour to a deep alpine blue. Use themeCssOverrides only; do NOT touch customCss.' },

  // festa (14) — C1 (content tokens + shell)/C6/C8 (no cards in this template)
  { formId: 14, slug: 'festa-italiana', caseId: 'f-c1', cap: 'C1 rebrand', expectColor: 0,
    prompt: 'Rebrand this into a "German Oktoberfest Beer Festival" RSVP. Rebrand visible shell headings/captions via set_html_text, update the title, field labels, and any {{content:*}} text tokens. Keep the design/structure/colours identical.' },
  { formId: 14, slug: 'festa-italiana', caseId: 'f-c6', cap: 'C6 chips', expectColor: 0,
    prompt: 'For the "dietary" chip field replace options with Oktoberfest-appropriate dietary needs. Keep chips + design.' },
  { formId: 14, slug: 'festa-italiana', caseId: 'f-c8', cap: 'C8 colour', expectColor: 1,
    prompt: 'Change the accent colour to Bavarian blue and white. themeCssOverrides only; do NOT touch customCss.' },

  // intake (15) — C1 (rich content tokens)/C2/C8
  { formId: 15, slug: 'intake-acme-ocean', caseId: 'i-c1', cap: 'C1 rebrand', expectColor: 0,
    prompt: 'Rebrand this SaaS intake into a "FinTech Bank Onboarding" intake. Update the {{content:*}} brand text tokens (brand_name, brand_sub, step labels, panel_title), the title, and field labels. Keep the design/structure/colours identical.' },
  { formId: 15, slug: 'intake-acme-ocean', caseId: 'i-c2', cap: 'C2 add field', expectColor: 0,
    prompt: 'Add a new required Text field with key "registration_number" labelled "Company registration number". Pick a key not already present. Keep the design.' },
  { formId: 15, slug: 'intake-acme-ocean', caseId: 'i-c8', cap: 'C8 colour', expectColor: 1,
    prompt: 'Change the primary colour to a banking navy/gold. themeCssOverrides only; do NOT touch customCss.' },
];

const only = process.argv[2]; // optional comma-separated caseId prefixes
const cases = only ? MATRIX.filter(c => only.split(',').some(p => c.caseId.startsWith(p.trim()))) : MATRIX;

const { browser, page } = await launch(true);
const results = [];
try {
  await login(page);
  const cfg = await getAiConfig(page, 1);
  if (!cfg.apiKey) throw new Error('no AI key');
  for (const c of cases) {
    const r = await runCase(page, cfg, c);
    results.push(r);
    writeFileSync(join(OUT, `${c.caseId}-result.json`), JSON.stringify(r, null, 2));
  }
} catch (e) { console.error('FATAL', e); } finally { await browser.close(); }

// summary
console.log('\n================ SUMMARY ================');
const byForm = {};
for (const r of results) {
  const passN = (r.checks || []).filter(c => c.p).length, total = (r.checks || []).length;
  byForm[r.formId] = byForm[r.formId] || { pass: 0, n: 0 };
  byForm[r.formId].n++; if (r.pass) byForm[r.formId].pass++;
  console.log(`${r.pass ? '✅' : '❌'} ${r.caseId} (form ${r.formId} ${r.cap}) ${passN}/${total} checks${r.error ? ' ERR:' + r.error : ''}`);
}
console.log('--- per form ---');
for (const [fid, s] of Object.entries(byForm)) console.log(`form ${fid}: ${s.pass}/${s.n} cases pass`);
const formsPassing = Object.values(byForm).filter(s => s.pass >= 1).length;
console.log(`FORMS WITH >=1 PASS: ${formsPassing}`);
writeFileSync(join(OUT, 'batch-summary.json'), JSON.stringify({ results, byForm }, null, 2));
