/**
 * MegaForm Dashboard — AI Form Creator (v20260530-29)
 * ─────────────────────────────────────────────────────────────────────────
 * Jotform-style "Create with AI" modal launched from the dashboard's New Form
 * button strip. The user types a natural-language prompt; the existing AI
 * provider (window.MF_AI) generates a form schema; the schema renders live in
 * a preview pane on the right. User can:
 *   • 🔁 Regenerate — send the prompt back with a "make it different" hint
 *   • ✏️ Open Builder — POST save + redirect to the builder for further edits
 *   • ✅ Save & Use Now — POST save + redirect to form view (/xx?formid=N)
 *
 * Design language mirrors E:\MENU SPECS\ACME V38 AICHATBOT\components\ai-block-builder\ai-chatbot.tsx
 * (dark slate palette, chat bubbles, preview panel on the right).
 *
 * Self-contained: no external CSS, no dependency on builder.ts. Reuses
 *   window.MF_AI.chatWithTools (provider abstraction — works with OpenAI,
 *     Claude bridge, Kimi, OpenRouter, custom, etc.)
 *   window.MegaFormRenderer.init (form preview)
 *   POST /api/MegaForm/Form/Save (DNN) or POST /api/MegaForm/Form (Oqtane)
 *     for persistence.
 */

import { t as i18nT, getLocale as i18nGetLocale } from '@i18n';
import { ensureDbDialect, getDbProviderKey } from '@shared/ddl-dialect';
import { insertIntoCardBody, syncFieldPlaceholders } from '@shared/custom-html-insert';
import { applyHtmlTextSwaps, collectHtmlTextNodes } from '@shared/html-text-swap';

// [i18n 2026-06-10] The Create-with-AI modal was a mix of hardcoded Vietnamese +
// English. T() translates the modal chrome (uses the dashboard bundle's embedded
// @i18n catalog, falling back to the global, then the English literal).
function T(key: string, fallback: string): string {
  try { const v = i18nT(key); if (v && v !== key) return String(v); } catch { /* embedded n/a */ }
  try { const I = (window as any).MegaFormI18n; if (I && typeof I.t === 'function') { const v = I.t(key); if (v && v !== key) return String(v); } } catch { /* global n/a */ }
  return fallback;
}
function aiActiveLocale(): string {
  try { const ls = localStorage.getItem('mf-locale'); if (ls) return ls; } catch { /* no storage */ }
  try { const l = i18nGetLocale(); if (l && l !== 'en-US') return l; } catch { /* embedded n/a */ }
  try { const I = (window as any).MegaFormI18n; if (I && I.getLocale) { const l = I.getLocale(); if (l) return l; } } catch { /* global n/a */ }
  return 'en-US';
}
// Map the active UI locale → a language the AI should WRITE the form + replies in.
// en-US (or unknown) returns '' so no instruction is added (default English).
function aiTargetLanguage(): string {
  const map: Record<string, string> = {
    'es-ES': 'Spanish (español)', 'fr-FR': 'French (français)', 'de-DE': 'German (Deutsch)',
    'pt-BR': 'Brazilian Portuguese (português do Brasil)', 'ar-SA': 'Arabic (العربية)',
  };
  const loc = aiActiveLocale();
  return (loc && loc !== 'en-US' && map[loc]) ? map[loc] : '';
}

interface SimplePlatformCfg {
  platform?: string;
  apiBaseUrl?: string;
  apiBase?: string;
  moduleId?: number;
  siteId?: number;
  portalId?: number;
}

const BADGE = 'MfAiFormCreator v20260530-42';

const AI_SYSTEM_PROMPT = [
  'You are the MegaForm AI Form Creator. Given a SHORT user description, return EITHER a single form schema OR a multi-form app batch in ONE shot.',
  '',
  'OUTPUT FORMAT — STRICT (pick ONE shape):',
  '',
  '(A) SINGLE FORM (default for simple "create a form" prompts):',
  '    { "schema": {...}, "explain": "1-2 sentence summary" }',
  '',
  '(B) MULTI-FORM APP (when user asks for an "app / system / ứng dụng / hệ thống" with multiple forms + DB tables):',
  '    { "ops": [{ "op": "app_batch", "tables": [{"ddl": "CREATE TABLE [dbo].[X](...);"}, ...], "forms": [{"title":"…","fields":[...],"tableName":"X","schemaName":"dbo"}, ...] }], "explain": "1-2 sentences" }',
  '',
  '⚠ KEYWORD TRIGGERS for shape (B) — emit `app_batch` automatically when the prompt contains: "ứng dụng" / "hệ thống" / "app" / "system" / "build me a … app" / multiple form names linked together / "+ DB / + tables / + cơ sở dữ liệu / + relational DB". Do NOT emit a single schema in those cases — the dashboard cannot show 4 forms in one preview.',
  '',
  'app_batch requirements:',
  '  • Each tables[].ddl is a full `CREATE TABLE [dbo].[Name]([Id] INT IDENTITY(1,1) PRIMARY KEY, ..., [CreatedOnUtc] DATETIME2 DEFAULT SYSUTCDATETIME());`',
  '  • Foreign keys inside DDL: `[ParentId] INT NULL CONSTRAINT FK_Child_Parent FOREIGN KEY REFERENCES [dbo].[Parent]([Id]) ON DELETE <action>` where <action> per CASCADE-DELETE rule:',
  '     – NOT NULL FK (child requires parent) → `ON DELETE NO ACTION` (default — admin must clean children before deleting parent)',
  '     – NULL-able FK + ownership weak (e.g. Student.ClassId) → `ON DELETE SET NULL`',
  '     – Strong ownership (e.g. OrderItem.OrderId, Comment.PostId) → `ON DELETE CASCADE`',
  '     – Reference data (e.g. Order.ProductId) → `ON DELETE NO ACTION` (RESTRICT) so accidental delete throws',
  '  • Each form has `tableName` (auto-wires settings.databaseInsert with INSERT INTO that table) and uses snake_case field keys matching the table column names.',
  '  • FK-bound Select fields can be omitted from the form schema — the dispatcher auto-upgrades any field whose key matches a parsed FK column to `properties.optionsSource:"sql"` pointing at the parent table. You may also emit them explicitly with optionsSql for full control.',
  '',
  'No markdown fences, no prose outside JSON.',
  '',
  'Schema shape:',
  '{ "version":"1.0",',
  '  "title": "<short user-facing form title>",',
  '  "fields": [<field objects>],',
  '  "settings": { "submitButtonText":"Submit", "successMessage":"Thank you. We received your submission.", "theme":"default" } }',
  '',
  'Field shape — choose `type` semantically (Text only as last fallback):',
  '  Text · Email · CompositePhone · Number · Date · Time · Textarea · Select · Radio · Checkbox · File · Rating · Signature · Url · Hidden · Section · Row',
  'Each field: { "key":"snake_case", "type":"<Type>", "label":"<Display>", "required":<bool>, "placeholder":"…"? , "options":[{value,label}]? }',
  '',
  'LAYOUT RULES:',
  '- Pair 2 short related fields in a Row (first/last name, email/phone, from/to date). Row shape: { "key":"row_X", "type":"Row", "columns":[{"span":6,"fields":[<field>]},{"span":6,"fields":[<field>]}] }',
  '- Radio/Checkbox with ≥4 options → add "properties":{"optionColumns":2}',
  '- Section breaks: { "key":"sec_X", "type":"Section", "label":"<heading>" } — wrap multi-step wizards with "properties":{"pageBreak":true}',
  '- Long text (message/notes) → Textarea, full-width',
  '- File/Signature/DataGrid/DataRepeater/DynamicLabel must be full-width (NEVER inside a Row column)',
  '',
  'COMPOSITE FIELD-GROUPS (one field = several sub-inputs, submitted as a single combined value):',
  '- Shape: { "key":"phone", "type":"Composite", "label":"Phone", "widgetProps":{ "preset":"phone" } }. Set ONLY widgetProps.preset; the sub-inputs, masks, regex and match-validation are built-in.',
  '- Presets: phone (country+area+number+ext) · name (first+last) · name_plus (prefix+first+middle+last+suffix) · address (street/city/state/zip; also set widgetProps.addressScheme = us|intl|canada|uk) · ssn (masked ###-##-####) · dob (day/month/year) · time (hour/minute/AM-PM) · email_confirm (email + confirm) · password_confirm (password + confirm).',
  '- The aliases CompositePhone/CompositeName/CompositeAddress/CompositeSsn/CompositeDob/CompositeTime/CompositeEmailConfirm/CompositePasswordConfirm are also accepted and auto-normalised, but prefer type:"Composite"+preset. Use a Composite phone instead of a plain Phone field when the user wants the country/area code split out.',
  '',
  'DEFAULT MODE — standard Section/Row layout, theme:"default" or one of the 12 themed presets (minimal | modern-blue | warm-sunset | dark-elegance | nature-green | flat-material | classic-formal | playful | healthcare | executive | tech-startup). Never invent theme names. DO NOT emit customHtml or customCss in default mode.',
  '',
  '🎨 PREMIUM CUSTOM-SHELL MODE — opt in ONLY when the user explicitly asks for a premium / Jotform / branded / image / hero / banner / background / glassmorphism / corporate-header / 2-column / designer / specific-visual-style look.',
  '',
  '  ⚡ FREE-FORM FIRST — the 4 templates below are STARTING POINTS, not a closed enum. You may:',
  '    • Adapt any template (swap image-left for image-right, change gradient colors, switch fonts)',
  '    • Combine elements from multiple templates (e.g. header-band + 2-column split body)',
  '    • Invent an entirely NEW layout — sidebar navigation, asymmetric grid, multi-section panels, animated entry, sticky header, parallax hero, Z-pattern, F-pattern, magazine column layout — anything the user describes.',
  '  Whatever you invent, the COMMON RULES below still hold (theme:"custom", .mfp scoping, {{field:KEY}} for every field, scoped CSS, mobile @media). Auto-repair safety net runs after parsing and injects missing field placeholders regardless of which structure you chose, so creative freedom does not break the form.',
  '',
  '  PICK BY KEYWORD MAP (starting point — adapt freely if the user wants variations):',
  '  • "split", "2-col", "image left", "image right", "ảnh bên trái", "designer", "Jotform default" → mfp-split',
  '  • "hero top", "hero banner", "ảnh trên cùng", "banner đầu trang", "marketing", "landing", "webinar", "event signup" → mfp-hero-top',
  '  • "background", "full-page bg", "ảnh nền", "ảnh nền cả trang", "fields trên ảnh nền", "glassmorphism", "invitation", "rsvp", "wedding", "luxury" → mfp-bg-overlay',
  '  • "header band", "header strip", "color header", "corporate header", "B2B", "support", "thanh tiêu đề màu" → mfp-header-band',
  '  • Generic "premium / branded" with no specific cue → mfp-split',
  '',
  '  COMMON RULES (apply to ALL 4 layouts):',
  '  1. Set `settings.theme = "custom"` (REQUIRED).',
  '  2. customHtml root: `<div class="mfp mfp-<layout>">…</div>` (mfp-split | mfp-hero-top | mfp-bg-overlay | mfp-header-band).',
  '  3. 🛑 MANDATORY: include `{{field:KEY}}` placeholder for EVERY field listed in `fields[]`. Auto-repair will inject missing ones but emit them correctly first try.',
  '  4. Use `{{form:title}}`, `{{form:description}}` for editable form-level text — REPLACE as plain text.',
  '  5. 🛑 SUBMIT BUTTON RULE — `{{form:submit}}` replaces as TEXT LABEL ONLY (just the words "Submit"), NOT a button element. ALWAYS wrap inside a real button tag: `<button type="submit" class="mfp-submit">{{form:submit}}</button>`. Without the `<button>` wrapper, the form has no clickable submit AND the renderer chrome will not auto-hide → user sees double "Submit" text (one inside custom, one as chrome button below).',
  '  6. 🛑 FULLWIDTH RULE — `.mfp.mfp-<layout>` MUST use `max-width: 100%; width: 100%` (never a fixed pixel max-width like 760/880/1100px). The form must fill its parent container. Production form templates all do this. If you need to constrain inner content, apply max-width to an INNER child like `.mfp-form-inner` or `.mfp-card-inner` (which is the readable column).',
  '  7. EVERY CSS rule prefixed by `.mfp.mfp-<layout>` — never global `input{}`, `body{}`, `:root{}`.',
  '  8. Mobile `@media (max-width:640-760px)` collapse.',
  '  9. Images: `https://picsum.photos/seed/<keyword>/<W>/<H>` only. NEVER `images.unsplash.com/photo-<hex>` (hallucinates). The container CSS MUST constrain dimensions (e.g. `.mfp-hero-banner{height:280px}` or `.mfp-hero{aspect-ratio:3/4}`) so an `<img>` cannot blow up to its natural size and dominate the page. Set `.mfp-hero-img{width:100%;height:100%;object-fit:cover}` ALWAYS.',
  '  10. 🛑 MULTI-STEP + CUSTOM-SHELL ARE INCOMPATIBLE. If the user asks for a multi-step / wizard form, you MUST use plain Section fields with `properties.pageBreak:true` and NO customHtml. The renderer builds step UI + Next/Previous buttons automatically. Hand-rolled step indicators inside customHtml are visual-only — they do NOT page through fields, so step 1 ends up empty and all fields land on whatever step the customHtml lists them in. PICK ONE: (a) Multi-step wizard → plain layout, `settings.multiPage:true` + Section.pageBreak, no customHtml; (b) Premium custom-shell → single-page layout, no step indicators in customHtml.',
  '',
  '  CANONICAL TEMPLATES (paste verbatim, swap field keys + image seed + title text):',
  '',
  '  ━━ Layout A · mfp-split (Jotform default: image LEFT 42% + form RIGHT 58%) ━━',
  '  customHtml: `<div class="mfp mfp-split"><div class="mfp-hero"><img src="https://picsum.photos/seed/HERO/800/1100" class="mfp-hero-img"><div class="mfp-hero-overlay"><h1 class="mfp-hero-title">{{form:title}}</h1><p class="mfp-hero-sub">{{form:description}}</p></div></div><div class="mfp-form"><div class="mfp-form-inner">{{field:K1}}{{field:K2}}…<button type="submit" class="mfp-submit">{{form:submit}}</button></div></div></div>`',
  '  customCss: `.mfp.mfp-split{display:grid;grid-template-columns:42% 58%;width:100%;max-width:100%;min-height:560px;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px -10px rgba(15,23,42,0.18);background:#fff;margin:0 auto}.mfp.mfp-split .mfp-hero{position:relative;overflow:hidden}.mfp.mfp-split .mfp-hero-img{width:100%;height:100%;object-fit:cover;filter:brightness(0.7)}.mfp.mfp-split .mfp-hero-overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:36px 40px;color:#fff;background:linear-gradient(135deg,rgba(15,23,42,0.55),rgba(15,23,42,0.15))}.mfp.mfp-split .mfp-hero-title{font-size:36px;font-weight:800;margin:0 0 12px}.mfp.mfp-split .mfp-hero-sub{font-size:15px;opacity:0.92;margin:0}.mfp.mfp-split .mfp-form{padding:48px 44px;display:flex;align-items:center;background:#fafafa}.mfp.mfp-split .mfp-form-inner{width:100%;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:18px}.mfp.mfp-split input,.mfp.mfp-split textarea,.mfp.mfp-split select{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:11px 14px;font-size:14px;background:#fff;box-sizing:border-box}.mfp.mfp-split input:focus,.mfp.mfp-split textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.12);outline:none}.mfp.mfp-split .mf-field-label{font-size:13px;font-weight:600;color:#334155;margin-bottom:6px;display:block}.mfp.mfp-split .mf-required{color:#ef4444}.mfp.mfp-split .mfp-submit{width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;margin-top:8px}.mfp.mfp-split .mfp-submit:hover{transform:translateY(-1px);box-shadow:0 8px 16px -4px rgba(99,102,241,0.4)}@media (max-width:760px){.mfp.mfp-split{grid-template-columns:1fr}.mfp.mfp-split .mfp-hero{min-height:240px}.mfp.mfp-split .mfp-hero-title{font-size:24px}.mfp.mfp-split .mfp-form{padding:28px 24px}}`',
  '',
  '  ━━ Layout B · mfp-hero-top (banner image at top + form below — marketing) ━━',
  '  customHtml: `<div class="mfp mfp-hero-top"><div class="mfp-hero-banner"><img src="https://picsum.photos/seed/HERO/1600/520" class="mfp-hero-img"><div class="mfp-hero-overlay"><h1 class="mfp-hero-title">{{form:title}}</h1><p class="mfp-hero-sub">{{form:description}}</p></div></div><div class="mfp-form-card"><div class="mfp-form-inner">{{field:K1}}{{field:K2}}…<button type="submit" class="mfp-submit">{{form:submit}}</button></div></div></div>`',
  '  customCss: `.mfp.mfp-hero-top{width:100%;max-width:100%;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 60px -10px rgba(15,23,42,0.16)}.mfp.mfp-hero-top .mfp-hero-banner{position:relative;height:240px;max-height:240px;overflow:hidden}.mfp.mfp-hero-top .mfp-hero-img{width:100%!important;height:100%!important;max-height:240px!important;object-fit:cover;filter:brightness(0.65);display:block}.mfp.mfp-hero-top .mfp-hero-overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:28px 32px;color:#fff;background:linear-gradient(180deg,rgba(15,23,42,0.05),rgba(15,23,42,0.55))}.mfp.mfp-hero-top .mfp-hero-title{font-size:30px;font-weight:800;margin:0 0 8px;line-height:1.15}.mfp.mfp-hero-top .mfp-hero-sub{font-size:14px;opacity:0.92;margin:0}.mfp.mfp-hero-top .mfp-form-card{padding:32px 40px 40px;background:#fafafa}.mfp.mfp-hero-top .mfp-form-inner{display:flex;flex-direction:column;gap:18px;max-width:680px;margin:0 auto;width:100%}.mfp.mfp-hero-top input,.mfp.mfp-hero-top textarea,.mfp.mfp-hero-top select{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:11px 14px;font-size:14px;background:#fff;box-sizing:border-box}.mfp.mfp-hero-top input:focus,.mfp.mfp-hero-top textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.12);outline:none}.mfp.mfp-hero-top .mf-field-label{font-size:13px;font-weight:600;color:#334155;margin-bottom:6px;display:block}.mfp.mfp-hero-top .mf-required{color:#ef4444}.mfp.mfp-hero-top .mfp-submit{width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;margin-top:8px}.mfp.mfp-hero-top .mfp-submit:hover{transform:translateY(-1px);box-shadow:0 8px 16px -4px rgba(99,102,241,0.4)}@media (max-width:640px){.mfp.mfp-hero-top .mfp-hero-banner{height:180px;max-height:180px}.mfp.mfp-hero-top .mfp-hero-img{max-height:180px!important}.mfp.mfp-hero-top .mfp-hero-title{font-size:22px}.mfp.mfp-hero-top .mfp-form-card{padding:24px 20px}}`',
  '',
  '  ━━ Layout C · mfp-bg-overlay (full-page background + glassmorphism floating card) ━━',
  '  customHtml: `<div class="mfp mfp-bg-overlay"><div class="mfp-bg-img"></div><div class="mfp-card"><div class="mfp-card-inner"><h1 class="mfp-card-title">{{form:title}}</h1><p class="mfp-card-sub">{{form:description}}</p>{{field:K1}}{{field:K2}}…<button type="submit" class="mfp-submit">{{form:submit}}</button></div></div></div>`',
  '  customCss: `.mfp.mfp-bg-overlay{position:relative;width:100%;max-width:100%;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;box-sizing:border-box}.mfp.mfp-bg-overlay .mfp-bg-img{position:absolute;inset:0;background-image:url(\'https://picsum.photos/seed/INVITATION/1920/1200\');background-size:cover;background-position:center;filter:brightness(0.55) blur(2px);z-index:0}.mfp.mfp-bg-overlay .mfp-card{position:relative;z-index:1;width:100%;max-width:560px;background:rgba(255,255,255,0.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.18);border-radius:18px;padding:40px 36px;box-shadow:0 30px 80px -20px rgba(15,23,42,0.4)}.mfp.mfp-bg-overlay .mfp-card-inner{display:flex;flex-direction:column;gap:16px}.mfp.mfp-bg-overlay .mfp-card-title{font-size:30px;font-weight:800;margin:0 0 4px;color:#0f172a;line-height:1.1;text-align:center}.mfp.mfp-bg-overlay .mfp-card-sub{font-size:14px;color:#475569;margin:0 0 16px;text-align:center}.mfp.mfp-bg-overlay input,.mfp.mfp-bg-overlay textarea,.mfp.mfp-bg-overlay select{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:11px 14px;font-size:14px;background:#fff;box-sizing:border-box}.mfp.mfp-bg-overlay input:focus,.mfp.mfp-bg-overlay textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.12);outline:none}.mfp.mfp-bg-overlay .mf-field-label{font-size:13px;font-weight:600;color:#334155;margin-bottom:6px;display:block}.mfp.mfp-bg-overlay .mf-required{color:#ef4444}.mfp.mfp-bg-overlay .mfp-submit{width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;padding:13px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;margin-top:6px}`',
  '',
  '  ━━ Layout D · mfp-header-band (color band on top + white form card overlapping below — corporate/B2B) ━━',
  '  customHtml: `<div class="mfp mfp-header-band"><div class="mfp-band"><h1 class="mfp-band-title">{{form:title}}</h1><p class="mfp-band-sub">{{form:description}}</p></div><div class="mfp-body"><div class="mfp-body-inner">{{field:K1}}{{field:K2}}…<button type="submit" class="mfp-submit">{{form:submit}}</button></div></div></div>`',
  '  customCss: `.mfp.mfp-header-band{width:100%;max-width:100%;margin:0 auto 60px;box-sizing:border-box}.mfp.mfp-header-band .mfp-band{background:linear-gradient(135deg,#1e3a8a,#3b82f6);color:#fff;padding:36px 36px 56px;border-radius:14px 14px 0 0}.mfp.mfp-header-band .mfp-band-title{font-size:26px;font-weight:800;margin:0 0 8px;line-height:1.2}.mfp.mfp-header-band .mfp-band-sub{font-size:14px;opacity:0.9;margin:0}.mfp.mfp-header-band .mfp-body{background:#fff;border-radius:14px;box-shadow:0 24px 60px -20px rgba(15,23,42,0.25);margin-top:-32px;position:relative;padding:32px 36px 40px}.mfp.mfp-header-band .mfp-body-inner{display:flex;flex-direction:column;gap:18px;max-width:760px;margin:0 auto;width:100%}.mfp.mfp-header-band input,.mfp.mfp-header-band textarea,.mfp.mfp-header-band select{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:11px 14px;font-size:14px;background:#fff;box-sizing:border-box}.mfp.mfp-header-band input:focus,.mfp.mfp-header-band textarea:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.15);outline:none}.mfp.mfp-header-band .mf-field-label{font-size:13px;font-weight:600;color:#334155;margin-bottom:6px;display:block}.mfp.mfp-header-band .mf-required{color:#ef4444}.mfp.mfp-header-band .mfp-submit{background:#1e3a8a;color:#fff;border:0;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;margin-top:8px;align-self:flex-start}.mfp.mfp-header-band .mfp-submit:hover{background:#1e40af}@media (max-width:640px){.mfp.mfp-header-band .mfp-band,.mfp.mfp-header-band .mfp-body{padding-left:20px;padding-right:20px}}`',
  '',
  '  Color variants for mfp-header-band band gradient: healthcare `linear-gradient(135deg,#0f766e,#14b8a6)`, marketing `linear-gradient(135deg,#ec4899,#f97316)`, finance `linear-gradient(135deg,#1e293b,#475569)`, education `linear-gradient(135deg,#7c3aed,#a855f7)`.',
  '',
  'When the user mentions:',
  '  • "tax", "total", "subtotal", "invoice", "line items" → add a DataGrid with computeFormula columns',
  '  • "auto-fill X when Y", "show A when B", "ẩn hiện theo điều kiện" → add settings.rules array with { id, name, enabled:true, priority:N, when:{type:group,logic:all,children:[{type:rule,field,operator,value}]}, then:[{action,targetType,target,value?}], else:[…] }. Operators: eq,neq,gt,gte,lt,lte,contains,startsWith,endsWith,in,notIn,isEmpty,isNotEmpty,isTrue,isFalse. Actions: show,hide,require,optional,enable,disable,setValue,clear. targetType: field|section|step.',
  '',
  'DATABASE INSERT (single form):',
  '  • If the user asks to "save to table / lưu vào bảng / store in database / INSERT on submit" for a SINGLE form, emit `schema.settings.databaseInsert` = { enabled:true, connectionKey:"DashboardDatabase", databaseType:"SqlServer", insertSql:"INSERT INTO ...", parameterMapping:{} }.',
  '  • `insertSql` must use `:fieldKey` placeholders matching the field keys above.',
  '  • Example: for fields with keys `full_name`, `email`, emit `insertSql`: "INSERT INTO [dbo].[Registrations]([FullName],[Email]) VALUES (:full_name, :email)".',
  '  • Only emit this when the prompt explicitly requests custom-table persistence. Do NOT invent a table name if the user did not ask for one.',
  '',
  'Keep the schema TIGHT — 5 to 12 fields is the sweet spot for AI-generated forms. The user can always extend in the Builder afterwards.',
].join('\n');

// ─── Platform helpers ─────────────────────────────────────────────────────
// [v20260530-39] Platform detection — when __MF_PLATFORM__ is missing (Oqtane
// Dashboard page doesn't set it before the modal opens), fall back to
// signals on the DOM. Blazor script tag is the strongest Oqtane marker.
function isOqtaneRuntime(): boolean {
  try {
    if (document.querySelector('script[src*="_framework/blazor"]')) return true;
    if (/\/[^\/]*\/\d+\/Dashboard\b/i.test(location.pathname)) return true;  // /business/*/190/Dashboard
    return false;
  } catch { return false; }
}
function platformCfg(): SimplePlatformCfg {
  const raw = (window as any).__MF_PLATFORM__ || {};
  const cfg: any = { ...raw };
  // [SaveFix 2026-06-23] On Oqtane the dashboard sets window.__MF_PLATFORM__.moduleId/siteId
  // from DashboardView.OnAfterRenderAsync, but a render-order race with the form-renderer
  // boot (BuildRendererBootScript merges only theme flags) can leave __MF_PLATFORM__ WITHOUT
  // them — only {allowThemePresetSelector,presetThemeKey,productionMode} survive. The AI-form
  // "Save & Use Now" then POSTs moduleId/siteId=0 and the server 400s ("MegaForm Oqtane save
  // requires a valid moduleId and siteId"). The dashboard root ALWAYS carries the ids as
  // data-* attributes (DashboardView.razor #mf-dashboard-root), so recover them from the DOM
  // whenever they're absent. (Completes the DOM-fallback the platform/isOqtaneRuntime check
  // below already started — it only ever recovered `platform`, never the ids.)
  const hasModule = typeof cfg.moduleId === 'number' && cfg.moduleId > 0;
  const hasSite = (typeof cfg.siteId === 'number' && cfg.siteId > 0)
               || (typeof cfg.portalId === 'number' && cfg.portalId > 0);
  if (!hasModule || !hasSite || !cfg.platform) {
    try {
      const root = document.getElementById('mf-dashboard-root')
        || document.querySelector('[data-platform][data-module-id]');
      if (root) {
        const num = (v: string | null) => { const n = parseInt(String(v == null ? '' : v), 10); return isFinite(n) ? n : 0; };
        const mid = num(root.getAttribute('data-module-id'));
        const sid = num(root.getAttribute('data-site-id') || root.getAttribute('data-portal-id'));
        const plat = root.getAttribute('data-platform') || '';
        const ab = root.getAttribute('data-api-base') || '';
        if (!hasModule && mid > 0) cfg.moduleId = mid;
        if (!hasSite && sid > 0) { cfg.siteId = sid; cfg.portalId = sid; }
        if (!cfg.platform && plat) cfg.platform = plat;
        if (!cfg.apiBase && ab) cfg.apiBase = ab;
      }
    } catch { /* DOM not ready — fall through to the runtime-detection default below */ }
  }
  if (cfg.platform) return cfg as SimplePlatformCfg;
  if (isOqtaneRuntime()) {
    return { ...cfg, platform: 'oqtane' } as SimplePlatformCfg;
  }
  return cfg as SimplePlatformCfg;
}
function apiBase(): string {
  const w = window as any;
  let b = String(w.__MF_API_BASE__ || '');
  if (!b) {
    const cfg = platformCfg();
    b = String(cfg.apiBaseUrl || cfg.apiBase || '');
  }
  if (!b) {
    if (isOqtaneRuntime()) {
      // [v20260530-40] Oqtane resolves SiteId from URL alias. Path must
      // start with the alias (e.g. /business/api/MegaFormPopup/Subform/Tables)
      // otherwise SiteId = 0 and the controller throws 500. Extract alias
      // from current pathname.
      const m = location.pathname.match(/^\/([^\/]+)\//);
      const alias = m ? m[1] : '';
      b = (alias ? '/' + alias : '') + '/api/MegaFormPopup/';
    } else {
      b = '/DesktopModules/MegaForm/API/';
    }
  }
  if (b.charAt(b.length - 1) !== '/') b += '/';
  return b;
}
// [P1-3] AiTools controller lives at /api/AiTools on Oqtane (resolves SiteId
// from the auth context, NOT the URL alias — proven by the working SqlTables
// call). The MegaFormPopup base above would 404 for AiTools/ExecuteDdl.
function aiBase(): string {
  const w = window as any;
  const cfg = platformCfg();
  const explicit = String((cfg as any).aiApiBase || w.__MF_AI_API_BASE__ || '');
  if (explicit) return explicit.charAt(explicit.length - 1) === '/' ? explicit : explicit + '/';
  if (isOqtaneRuntime()) return '/api/';
  return '/DesktopModules/MegaForm/API/';
}

// ─── AI provider bootstrap (the dashboard does NOT preload the AI bundle) ───
// [B88-fix] "Create with AI" lives on the dashboard, which deliberately omits
// megaform-ai-form-assistant.js (the ~160KB provider bundle that sets
// window.MF_AI). So callAI() used to throw "AI provider not loaded". We now
// inject the bundle on demand + apply the SHARED server AI Settings
// (DefaultConfig) authoritatively, so Create-with-AI works standalone.
let __mfAiBootPromise: Promise<void> | null = null;

function aiBundleUrl(): string {
  // Derive from the dashboard's own <script src> so the module base + ?v= match.
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  const src = scripts.map(s => s.src).find(u => /megaform-dashboard\.js/i.test(u))
           || scripts.map(s => s.src).find(u => /megaform-(builder-loader|ai-form-assistant)\.js/i.test(u));
  if (src) return src.replace(/megaform-(dashboard|builder-loader)\.js/i, 'megaform-ai-form-assistant.js');
  return (isOqtaneRuntime() ? '/Modules/MegaForm/js/' : '/DesktopModules/MegaForm/Assets/js/') + 'megaform-ai-form-assistant.js';
}

function aiDefaultConfigQuery(): string {
  const cfg: any = platformCfg();
  if (isOqtaneRuntime()) {
    const sid = cfg.siteId ?? cfg.SiteId ?? cfg.portalId ?? 1;
    return '?entityid=' + encodeURIComponent(String(sid)) + '&entityname=Site&siteId=' + encodeURIComponent(String(sid));
  }
  const pid = cfg.portalId ?? cfg.PortalId ?? 0;
  return '?portalId=' + encodeURIComponent(String(pid));
}

async function ensureMfAi(): Promise<any> {
  const w = window as any;
  const ready = () => w.MF_AI && typeof w.MF_AI.chatWithTools === 'function';
  if (!ready()) {
    if (!__mfAiBootPromise) {
      __mfAiBootPromise = new Promise<void>((resolve, reject) => {
        try {
          let s = document.querySelector('script[data-mf-ai-bundle]') as HTMLScriptElement | null;
          if (s) { resolve(); return; }
          s = document.createElement('script');
          s.src = aiBundleUrl();
          s.async = true;
          s.setAttribute('data-mf-ai-bundle', '1');
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Could not load the AI provider bundle.'));
          document.head.appendChild(s);
        } catch (e) { reject(e as any); }
      });
    }
    await __mfAiBootPromise;
    const start = Date.now();
    while (!ready()) {
      if (Date.now() - start > 8000) throw new Error('AI provider bundle loaded but MF_AI is unavailable.');
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await applySharedAiConfig(w.MF_AI);
  return w.MF_AI;
}

// Apply the shared server AI Settings (what the dashboard "AI Settings" page
// edits) authoritatively — so Create-with-AI honors the provider the admin just
// saved (e.g. claude-cli) instead of stale per-browser localStorage.
async function applySharedAiConfig(api: any): Promise<void> {
  const ok = (c: any) => c && (c.apiKey || c.provider === 'claude-cli' || c.provider === 'megaform-local');
  try {
    const r = await fetch(aiBase() + 'AiAssistant/DefaultConfig' + aiDefaultConfigQuery(), { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) {
      const def = await r.json();
      if (ok(def) && typeof api.setConfig === 'function') { api.setConfig(def); return; }
    }
  } catch { /* fall through to whatever the bundle auto-loaded */ }
  const start = Date.now();
  while (Date.now() - start < 5000) {
    try { if (ok(api.getConfig && api.getConfig())) return; } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 120));
  }
}

function saveEndpoint(): string {
  const cfg = platformCfg();
  const platform = String(cfg.platform || '').toLowerCase();
  const base = apiBase();
  let url = platform === 'oqtane' ? base + 'Form' : base + 'Form/Save';
  // DNN: append ?portalId=N (server scopes data to the caller's portal —
  // matches toolbar.ts:332 appendDnnPortalQuery). Without this, child-portal
  // installs land in the wrong portal context and 401 / 400.
  if (platform === 'dnn') {
    const raw = (cfg as any).portalId !== undefined ? (cfg as any).portalId : (cfg as any).PortalId;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '' : raw), 10);
    const pid = isFinite(n) && n >= 0 ? n : 0;
    url += (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
  }
  // Oqtane: append ?authmoduleid + authsiteid (matches toolbar.ts:319 appendOqtaneAuthQuery).
  if (platform === 'oqtane') {
    const qs: string[] = [];
    if ((cfg.moduleId || 0) > 0) qs.push('authmoduleid=' + cfg.moduleId);
    if ((cfg.siteId   || 0) > 0) qs.push('authsiteid='   + cfg.siteId);
    if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
  }
  return url;
}

// [v20260530-38] Shared auth helpers for GET fetches (tables, columns, etc).
// Mirror toolbar.ts pattern: DNN needs RequestVerificationToken + ?portalId;
// Oqtane needs X-OQTANE-* headers + ?authmoduleid/authsiteid query.
function appendPlatformQuery(url: string): string {
  const cfg = platformCfg();
  const platform = String(cfg.platform || '').toLowerCase();
  if (platform === 'dnn') {
    if (/[?&]portalId=/i.test(url)) return url;
    const raw = (cfg as any).portalId !== undefined ? (cfg as any).portalId : (cfg as any).PortalId;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '' : raw), 10);
    const pid = isFinite(n) && n >= 0 ? n : 0;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
  }
  if (platform === 'oqtane') {
    const qs: string[] = [];
    if ((cfg.moduleId || 0) > 0) qs.push('authmoduleid=' + cfg.moduleId);
    if ((cfg.siteId   || 0) > 0) qs.push('authsiteid='   + cfg.siteId);
    if (qs.length) return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
  }
  return url;
}
function buildFetchHeaders(): Record<string, string> {
  const cfg = platformCfg();
  const platform = String(cfg.platform || '').toLowerCase();
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  if (platform === 'dnn') {
    try {
      const sf = (window as any).jQuery?.ServicesFramework?.((cfg as any).instanceId || cfg.moduleId || 0);
      if (sf) headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
    } catch {}
  } else if (platform === 'oqtane') {
    const bearer = (window as any).__MF_TOKEN;
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    if ((cfg.moduleId || 0) > 0) headers['X-OQTANE-MODULEID'] = String(cfg.moduleId);
    if ((cfg.siteId   || 0) > 0) headers['X-OQTANE-SITEID']   = String(cfg.siteId);
    if (((cfg as any).aliasId  || 0) > 0) headers['X-OQTANE-ALIASID']  = String((cfg as any).aliasId);
  }
  return headers;
}

// [v20260530-34] Auth headers matching toolbar.ts applySaveHeaders.
// Fixes the HTTP 401 on Save & Use Now — the dispatcher was POSTing without
// RequestVerificationToken on DNN / X-OQTANE-* on Oqtane.
function buildSaveHeaders(): Record<string, string> {
  const cfg = platformCfg();
  const platform = String(cfg.platform || '').toLowerCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (platform === 'dnn') {
    try {
      const sf = (window as any).jQuery?.ServicesFramework?.((cfg as any).instanceId || cfg.moduleId || 0);
      if (sf) {
        headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
        // [v20260527-04] DO NOT set TabId/ModuleId — DNN 400s with
        // "Specified page is not in this site" on child-portal aliases.
        // Server reads portalId from the query string instead.
      }
    } catch { /* ServicesFramework not loaded */ }
  } else if (platform === 'oqtane') {
    const bearer = (window as any).__MF_TOKEN;
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    if ((cfg.moduleId || 0) > 0) headers['X-OQTANE-MODULEID'] = String(cfg.moduleId);
    if ((cfg.siteId   || 0) > 0) headers['X-OQTANE-SITEID']   = String(cfg.siteId);
    if (((cfg as any).aliasId  || 0) > 0) headers['X-OQTANE-ALIASID']  = String((cfg as any).aliasId);
  }
  return headers;
}
function viewUrl(formId: number): string {
  // Best-effort: keep the user on the same page they came from with formid query.
  const path = (window.location.pathname || '/').split('#')[0];
  return path + '?formid=' + formId;
}
function builderUrl(formId: number): string {
  const path = (window.location.pathname || '/').split('?')[0].split('#')[0];
  return path + '?formId=' + formId + '#mf-builder';
}

// ─── Modal ────────────────────────────────────────────────────────────────
interface ChatBubble { role: 'user' | 'ai' | 'system'; text: string; }

// [UNIFY 2026-06-10] Host adapter so this ONE studio component works in BOTH
// surfaces: the dashboard (default — Save & Use Now persists a new form) and the
// in-builder "MegaForm AI" launcher (Apply-to-canvas via host.onApply). The
// builder passes onApply that writes the schema to MegaFormBuilder + repaints.
export interface StudioHost {
  mode?: 'dashboard' | 'builder';
  onApply?: (schema: any) => void | Promise<void>;
  formId?: number;
  initialPrompt?: string;   // pre-fill + auto-send (e.g. widget-drop "+ AI Form")
}

export function openAiFormCreator(host?: StudioHost): void {
  if (document.getElementById('mfd-ai-form-creator-root')) return;

  const isBuilder = !!(host && host.mode === 'builder');

  const overlay = document.createElement('div');
  overlay.id = 'mfd-ai-form-creator-root';
  // [UNIFY] Survive the builder's fullscreen-takeover CSS (hides non-overlay
  // direct body children) AND stack above #mf-builder-root (z-index 2147483000)
  // when launched from the builder. Harmless on the dashboard.
  overlay.setAttribute('data-mf-overlay', '1');
  if (isBuilder) {
    // [AiDesignerBuilder 20260617] Dock as a RIGHT-side panel with NO backdrop so
    // the centre CANVAS stays fully visible + interactive and is the live preview:
    // each AI result auto-applies to the canvas (see wireShell). The panel covers
    // only the right rail; the form on the canvas is unobstructed.
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'right:0', 'bottom:0',
      'z-index:2147483001', 'display:flex', 'align-items:stretch', 'justify-content:flex-end',
      'background:transparent',
      'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
    ].join(';');
  } else {
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(15,23,42,0.78)',
      'z-index:999998', 'display:flex', 'align-items:center', 'justify-content:center',
      'backdrop-filter:blur(2px)',
      'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
    ].join(';');
  }

  const modal = document.createElement('div');
  if (isBuilder) {
    modal.style.cssText = [
      'background:#0f172a', 'color:#e2e8f0',
      'width:min(440px,96vw)', 'height:100%',
      'display:flex', 'flex-direction:column',
      'box-shadow:-12px 0 40px -10px rgba(2,6,23,0.55)',
      'overflow:hidden', 'border-left:1px solid #1e293b',
    ].join(';');
  } else {
    modal.style.cssText = [
      'background:#0f172a', 'color:#e2e8f0', 'border-radius:14px',
      'width:min(1180px,95vw)', 'height:min(740px,92vh)',
      'display:flex', 'flex-direction:column',
      'box-shadow:0 20px 50px -10px rgba(2,6,23,0.6)',
      'overflow:hidden', 'border:1px solid #1e293b',
    ].join(';');
  }

  modal.innerHTML = renderShellHtml(isBuilder);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const state: {
    bubbles: ChatBubble[];
    schema: any | null;
    explain: string;
    loading: boolean;
    history: any[];      // chat history to pass to MF_AI for continuity
    attachments: Array<{ type: 'image' | 'text'; name: string; dataUrl?: string; content?: string; mediaType?: string; size?: number }>;
    allTables: string[];      // [v20260530-34] table names fetched from /Subform/Tables
    selectedTables: string[]; // user-toggled subset injected into AI context
    dbError: string;
  } = { bubbles: [], schema: null, explain: '', loading: false, history: [], attachments: [], allTables: [], selectedTables: [], dbError: '' };

  wireShell(overlay, modal, state, host || { mode: 'dashboard' });
  renderBubbles(modal, state);
  // Fire-and-forget tables fetch — strip stays hidden until tables arrive.
  loadTablesStrip(modal, state);
}

// [v20260530-34] Fetch DashboardDatabase tables once and render a toggle
// strip above the chat input. Selected tables are appended to the AI prompt
// so the user can say "build me a form from GG_Players" without the AI
// having to call list_sql_tables.
// [P0-2/TASK-A] Use AiTools/SqlTables (NOT Subform/Tables): AiTools resolves
// SiteId from the AUTH context — on the dashboard there is no URL alias, so the
// MegaFormPopup/Subform path resolves SiteId=0 → 404. SqlTables is also
// provider-aware (SQLite/PG/MySQL/MSSQL) and falls back to the site DB.
async function loadTablesStrip(modal: HTMLElement, state: any): Promise<void> {
  try {
    const url = aiBase() + 'AiTools/SqlTables?top=500';
    const r = await fetch(url, { credentials: 'same-origin', headers: buildFetchHeaders() });
    if (!r.ok) {
      // [v20260530-41] Surface the error to the DB pane so user sees what's
      // wrong (most common: DashboardDatabase connection not configured on
      // a fresh Oqtane install).
      const errText = await r.text().catch(() => '');
      let msg = 'Failed to load tables — HTTP ' + r.status;
      try {
        const j = JSON.parse(errText);
        if (j.error) msg = j.error;
      } catch {}
      state.dbError = msg;
      renderDbList(modal, state, '');
      const status = modal.querySelector<HTMLElement>('[data-mfd-ai-db-status]');
      if (status) status.textContent = '⚠ ' + msg.slice(0, 80);
      return;
    }
    const j = await r.json().catch(() => ({} as any));
    const tables = Array.isArray(j.tables) ? j.tables.map((t: any) => String(t.name || t.Name || t)) : [];
    state.allTables = tables.filter((t: string) => t && !/^(sys|MS_|MF_AI_|MegaForm_Sample_)/i.test(t)).sort();
    if (!state.allTables.length) return;
    renderTablesStrip(modal, state);
  } catch (e: any) {
    state.dbError = 'Network error: ' + (e?.message || String(e));
    renderDbList(modal, state, '');
  }
}

function renderTablesStrip(modal: HTMLElement, state: any): void {
  // Just refresh the DB pane list + selected strip + tab badge.
  renderDbList(modal, state, '');
  renderDbSelectedStrip(modal, state);
  updateDbTabBadge(modal, state);
  const status = modal.querySelector<HTMLElement>('[data-mfd-ai-db-status]');
  if (status) status.textContent = state.allTables.length + ' tables';
}

// [v20260530-35] Tab switcher
function switchTab(modal: HTMLElement, state: any, name: string): void {
  modal.querySelectorAll<HTMLButtonElement>('[data-mfd-ai-tab]').forEach(b => {
    const isActive = b.getAttribute('data-mfd-ai-tab') === name;
    b.style.background = isActive ? '#1e293b' : 'transparent';
    b.style.color = isActive ? '#f1f5f9' : '#94a3b8';
    b.style.fontWeight = isActive ? '600' : '500';
    b.style.borderBottom = isActive ? '2px solid #6366f1' : '0';
  });
  modal.querySelectorAll<HTMLElement>('[data-mfd-ai-pane]').forEach(p => {
    const v = p.getAttribute('data-mfd-ai-pane') === name;
    p.style.display = v ? 'flex' : 'none';
  });
  // [v20260530-36] Defensive re-render when switching to DB so the list
  // refreshes even if the initial load completed before the tab existed.
  if (name === 'db') {
    const search = modal.querySelector<HTMLInputElement>('[data-mfd-ai-db-search]');
    renderDbList(modal, state, (search?.value || ''));
    renderDbSelectedStrip(modal, state);
    updateDbTabBadge(modal, state);
  }
}

// [v20260530-35] Database pane — list with search + expand for columns
function renderDbList(modal: HTMLElement, state: any, filter: string): void {
  const list = modal.querySelector<HTMLElement>('[data-mfd-ai-db-list]');
  if (!list) return;
  list.innerHTML = '';
  if (!state.allTables.length) {
    if (state.dbError) {
      list.innerHTML = '<div style="color:#fca5a5;font-size:12px;padding:20px;line-height:1.6;">⚠ <strong>Database tables unavailable</strong><br><span style="color:#cbd5e1;">' + escapeHtml(state.dbError) + '</span><br><br><span style="font-size:11px;color:#94a3b8;">Fix: configure the <code style="background:#1e293b;padding:1px 5px;border-radius:3px;">DashboardDatabase</code> connection in Site Settings → MegaForm → Database (Oqtane) or add it to <code style="background:#1e293b;padding:1px 5px;border-radius:3px;">appsettings.json</code> ConnectionStrings (Web). You can still use the <strong>Chat tab</strong> to create forms without database tables.</span></div>';
      return;
    }
    list.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:24px;text-align:center;font-style:italic;">⏳ ' + T('ai.loading_tables', 'Loading tables from DashboardDatabase…') + '</div>';
    return;
  }
  const f = (filter || '').trim().toLowerCase();
  const filtered = state.allTables.filter((t: string) => !f || t.toLowerCase().includes(f));
  if (!filtered.length) {
    list.innerHTML = '<div style="color:#64748b;font-size:12px;padding:14px;text-align:center;">No tables match · clear search to see all ' + state.allTables.length + '</div>';
    return;
  }
  filtered.forEach((name: string) => {
    const selected = state.selectedTables.indexOf(name) >= 0;
    const row = document.createElement('div');
    // [v20260530-37 FIX] flex-shrink:0 + min-height — without these, 57 rows
    // in a flex column container with overflow-y:auto shrink down to ~3px
    // each (flex-shrink:1 default) before scroll engages. Result: visible
    // stripe pattern with all row content collapsed below the visible area.
    row.style.cssText = 'flex-shrink:0;min-height:34px;display:flex;flex-direction:column;background:' + (selected ? '#1e293b' : 'transparent') + ';border:1px solid ' + (selected ? '#475569' : '#1e293b') + ';border-radius:7px;overflow:hidden;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;padding:7px 10px;gap:8px;cursor:pointer;';
    head.innerHTML =
      '<span data-toggle style="font-size:10px;color:#64748b;width:10px;text-align:center;">▶</span>' +
      '<input type="checkbox" data-pick' + (selected ? ' checked' : '') + ' style="margin:0;cursor:pointer;accent-color:#6366f1;">' +
      '<span style="flex:1;font-size:13px;color:' + (selected ? '#f1f5f9' : '#cbd5e1') + ';font-weight:' + (selected ? '600' : '500') + ';">' + escapeHtml(name) + '</span>' +
      (selected ? '<span style="font-size:10px;color:#a5b4fc;">attached</span>' : '');
    const body = document.createElement('div');
    body.style.cssText = 'display:none;padding:0 10px 8px 28px;border-top:1px solid #1e293b;font-size:11px;color:#94a3b8;';
    body.setAttribute('data-cols', '');
    row.appendChild(head);
    row.appendChild(body);

    // Toggle checkbox
    const cb = head.querySelector<HTMLInputElement>('[data-pick]');
    cb?.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = state.selectedTables.indexOf(name);
      if (cb.checked && idx < 0) state.selectedTables.push(name);
      if (!cb.checked && idx >= 0) state.selectedTables.splice(idx, 1);
      renderDbList(modal, state, filter);
      renderDbSelectedStrip(modal, state);
      updateDbTabBadge(modal, state);
    });

    // Toggle expand schema
    head.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const expanded = body.style.display === 'block';
      body.style.display = expanded ? 'none' : 'block';
      const arrow = head.querySelector<HTMLElement>('[data-toggle]');
      if (arrow) arrow.textContent = expanded ? '▶' : '▼';
      if (!expanded && !body.dataset['loaded']) {
        body.innerHTML = '<div style="padding:8px 0;font-style:italic;">Loading schema…</div>';
        loadColumns(name).then((cols) => {
          if (!cols.length) {
            body.innerHTML = '<div style="padding:8px 0;color:#dc2626;">Failed to load schema (auth or table-not-found)</div>';
            return;
          }
          body.innerHTML = '<table style="width:100%;border-collapse:collapse;margin:4px 0;"><thead><tr><th style="text-align:left;font-weight:600;color:#cbd5e1;padding:3px 6px;">Column</th><th style="text-align:left;font-weight:600;color:#cbd5e1;padding:3px 6px;">Type</th><th style="text-align:left;font-weight:600;color:#cbd5e1;padding:3px 6px;">Nullable</th></tr></thead><tbody>' +
            cols.map((c) => '<tr><td style="padding:2px 6px;color:#e2e8f0;font-family:monospace;">' + escapeHtml(c.name) + '</td><td style="padding:2px 6px;color:#94a3b8;">' + escapeHtml(c.type) + '</td><td style="padding:2px 6px;color:#64748b;">' + (c.nullable ? 'YES' : 'NO') + '</td></tr>').join('') +
            '</tbody></table>';
          body.dataset['loaded'] = '1';
        });
      }
    });
    list.appendChild(row);
  });
}

function renderDbSelectedStrip(modal: HTMLElement, state: any): void {
  const strip = modal.querySelector<HTMLElement>('[data-mfd-ai-db-selected-strip]');
  const host  = modal.querySelector<HTMLElement>('[data-mfd-ai-db-selected]');
  if (!strip || !host) return;
  if (!state.selectedTables.length) { strip.style.display = 'none'; host.innerHTML = ''; return; }
  strip.style.display = 'block';
  host.innerHTML = '';
  state.selectedTables.forEach((name: string) => {
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:#6366f1;color:#fff;border-radius:14px;padding:3px 4px 3px 10px;font-size:11px;font-weight:600;';
    chip.innerHTML = '✓ ' + escapeHtml(name) + '<button type="button" style="background:transparent;border:0;color:#fff;cursor:pointer;padding:0;width:18px;height:18px;line-height:1;font-size:14px;">×</button>';
    chip.querySelector('button')?.addEventListener('click', () => {
      const idx = state.selectedTables.indexOf(name);
      if (idx >= 0) state.selectedTables.splice(idx, 1);
      renderDbList(modal, state, (modal.querySelector<HTMLInputElement>('[data-mfd-ai-db-search]')?.value) || '');
      renderDbSelectedStrip(modal, state);
      updateDbTabBadge(modal, state);
    });
    host.appendChild(chip);
  });
}

function updateDbTabBadge(modal: HTMLElement, state: any): void {
  const badge = modal.querySelector<HTMLElement>('[data-mfd-ai-tab-db-badge]');
  if (!badge) return;
  const n = state.selectedTables.length;
  badge.textContent = String(n);
  badge.style.background = n > 0 ? '#6366f1' : '#334155';
  badge.style.color = n > 0 ? '#fff' : '#cbd5e1';
}

// [v20260530-35] Fetch + cache column schema for a table.
const __columnsCache: Record<string, Array<{ name: string; type: string; nullable: boolean }>> = {};
async function loadColumns(tableName: string): Promise<Array<{ name: string; type: string; nullable: boolean }>> {
  if (__columnsCache[tableName]) return __columnsCache[tableName];
  try {
    // [P0-2] AiTools/SqlColumns (auth-context SiteId, provider-aware) — same
    // reason as loadTablesStrip: Subform/Columns 404s on the dashboard (no alias).
    const url = aiBase() + 'AiTools/SqlColumns?table=' + encodeURIComponent(tableName);
    const r = await fetch(url, { credentials: 'same-origin', headers: buildFetchHeaders() });
    if (!r.ok) return [];
    const j = await r.json().catch(() => ({} as any));
    const cols = (Array.isArray(j.columns) ? j.columns : []).map((c: any) => ({
      name: String(c.name || c.Name || c.column || ''),
      type: String(c.type || c.Type || c.dataType || c.DataType || ''),
      nullable: !!(c.nullable || c.Nullable || c.isNullable || c.IsNullable),
    })).filter((c: any) => c.name);
    __columnsCache[tableName] = cols;
    return cols;
  } catch { return []; }
}

// [AiBear 20260617] Robot-bear mascot for the AI Designer empty-state (user-supplied).
// xmlns corrected to the real SVG namespace so it renders both inline and as an asset.
const BEAR_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%" aria-hidden="true">',
  '<rect width="100%" height="100%" rx="24" fill="#0d1117"/>',
  '<defs>',
  '<radialGradient id="mfbearglow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#00f2fe" stop-opacity="0.3"/><stop offset="100%" stop-color="#00f2fe" stop-opacity="0"/></radialGradient>',
  '<linearGradient id="mfbearmetal" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#282a36"/><stop offset="50%" stop-color="#44475a"/><stop offset="100%" stop-color="#21222c"/></linearGradient>',
  '<linearGradient id="mfbearneon" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00f2fe"/><stop offset="100%" stop-color="#4facfe"/></linearGradient>',
  '</defs>',
  '<circle cx="200" cy="200" r="180" fill="url(#mfbearglow)"/>',
  '<circle cx="110" cy="120" r="45" fill="url(#mfbearmetal)" stroke="#00f2fe" stroke-width="3"/><circle cx="110" cy="120" r="25" fill="#1f2335" stroke="#4facfe" stroke-width="2"/>',
  '<circle cx="290" cy="120" r="45" fill="url(#mfbearmetal)" stroke="#00f2fe" stroke-width="3"/><circle cx="290" cy="120" r="25" fill="#1f2335" stroke="#4facfe" stroke-width="2"/>',
  '<rect x="100" y="110" width="200" height="180" rx="90" fill="url(#mfbearmetal)" stroke="#00f2fe" stroke-width="4"/>',
  '<path d="M 200 110 L 200 140 M 200 140 L 170 160 M 200 140 L 230 160" stroke="#00f2fe" stroke-width="3" stroke-linecap="round" fill="none"/>',
  '<circle cx="170" cy="160" r="4" fill="#00f2fe"/><circle cx="230" cy="160" r="4" fill="#00f2fe"/>',
  '<rect x="130" y="175" width="140" height="50" rx="15" fill="#15161e" stroke="#4facfe" stroke-width="2"/>',
  '<ellipse cx="165" cy="200" rx="18" ry="6" fill="#00f2fe"/><circle cx="165" cy="200" r="3" fill="#ffffff"/>',
  '<ellipse cx="235" cy="200" rx="18" ry="6" fill="#00f2fe"/><circle cx="235" cy="200" r="3" fill="#ffffff"/>',
  '<rect x="160" y="235" width="80" height="45" rx="22.5" fill="#1f2335" stroke="#00f2fe" stroke-width="2"/>',
  '<polygon points="190,245 210,245 200,255" fill="url(#mfbearneon)"/>',
  '<path d="M 185 265 Q 200 275 215 265" stroke="#00f2fe" stroke-width="3" stroke-linecap="round" fill="none"/>',
  '<line x1="120" y1="240" x2="135" y2="240" stroke="#4facfe" stroke-width="3" stroke-linecap="round"/>',
  '<line x1="265" y1="240" x2="280" y2="240" stroke="#4facfe" stroke-width="3" stroke-linecap="round"/>',
  '</svg>',
].join('');

function renderShellHtml(isBuilder?: boolean): string {
  // [AiDesignerBuilder 20260617] Builder mode = chat-only docked panel; the
  // form preview is the LIVE CANVAS (changes auto-apply there), so we drop the
  // right "Live preview" column and the single column fills the panel.
  const title = isBuilder ? T('ai.title_builder', 'AI Designer') : T('ai.title', 'Create form with AI');
  const subtitle = isBuilder
    ? T('ai.subtitle_builder', 'Describe a change — it is applied live to the form on the canvas.')
    : T('ai.subtitle', 'Describe your form — AI will generate it. Preview, then save and run.');
  const parts: string[] = [
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:#1e293b;border-bottom:1px solid #334155;">',
    '  <div style="display:flex;align-items:center;gap:10px;">',
    '    <span style="font-size:22px;line-height:1;">✨</span>',
    '    <div>',
    '      <div style="font-weight:700;font-size:15px;color:#f1f5f9;">' + title + '</div>',
    '      <div style="font-size:11px;color:#94a3b8;">' + subtitle + '</div>',
    '    </div>',
    '  </div>',
    '  <button type="button" data-mfd-ai-close style="background:transparent;border:1px solid #334155;color:#cbd5e1;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:18px;line-height:1;">×</button>',
    '</div>',
    '<div style="flex:1;display:grid;grid-template-columns:' + (isBuilder ? '1fr' : 'minmax(0,440px) 1fr') + ';min-height:0;">',
    '  <div style="display:flex;flex-direction:column;background:#0f172a;border-right:1px solid #1e293b;min-height:0;">',
    // ─── Tab navigation ───
    '    <div style="display:flex;gap:0;padding:8px 12px 0;background:#0b1224;border-bottom:1px solid #1e293b;">',
    '      <button type="button" data-mfd-ai-tab="chat" style="background:#1e293b;color:#f1f5f9;border:0;border-radius:8px 8px 0 0;padding:8px 18px;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid #6366f1;">💬 ' + T('ai.tab_chat', 'Chat') + '</button>',
    '      <button type="button" data-mfd-ai-tab="db" style="background:transparent;color:#94a3b8;border:0;border-radius:8px 8px 0 0;padding:8px 18px;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;">📊 ' + T('ai.tab_database', 'Database') + ' <span data-mfd-ai-tab-db-badge style="background:#334155;color:#cbd5e1;padding:2px 7px;border-radius:9999px;font-size:10px;font-weight:600;">0</span></button>',
    '    </div>',
    // ─── Chat pane ───
    '    <div data-mfd-ai-pane="chat" style="flex:1;display:flex;flex-direction:column;min-height:0;">',
    '      <div data-mfd-ai-log style="flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px;"></div>',
    '    </div>',
    // ─── Database pane ───
    '    <div data-mfd-ai-pane="db" style="flex:1;display:none;flex-direction:column;min-height:0;background:#0b1224;">',
    '      <div style="padding:12px 14px 0;">',
    '        <input data-mfd-ai-db-search type="search" placeholder="' + T('ai.db_search_ph', 'Search tables by name… (e.g. GG_, User, Order)').replace(/"/g, '&quot;') + '" style="width:100%;background:#1e293b;border:1px solid #334155;color:#f1f5f9;border-radius:7px;padding:8px 12px;font-size:13px;outline:none;box-sizing:border-box;">',
    '        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px;color:#64748b;">',
    '          <span><span data-mfd-ai-db-status>Loading…</span> · click table row to expand schema</span>',
    '          <button type="button" data-mfd-ai-db-clear style="background:transparent;border:0;color:#64748b;cursor:pointer;font-size:11px;text-decoration:underline;">Clear all</button>',
    '        </div>',
    '      </div>',
    '      <div data-mfd-ai-db-list style="flex:1;overflow-y:auto;padding:8px 14px 14px;display:flex;flex-direction:column;gap:4px;"></div>',
    '      <div data-mfd-ai-db-selected-strip style="border-top:1px solid #1e293b;padding:10px 14px;background:#0f172a;display:none;">',
    '        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">Selected (sent with every prompt):</div>',
    '        <div data-mfd-ai-db-selected style="display:flex;flex-wrap:wrap;gap:4px;max-height:64px;overflow-y:auto;"></div>',
    '      </div>',
    '    </div>',
    '    <div style="border-top:1px solid #1e293b;padding:14px;background:#0b1224;">',
    '      <div data-mfd-ai-attachments style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:10px;"></div>',
    '      <div data-mfd-ai-droparea style="position:relative;">',
    '        <textarea data-mfd-ai-input placeholder="' + T('ai.input_ph', 'Describe the form you need (e.g. an event-registration form with name, email, phone, attendance date, notes) · Paste or drop an image / .txt file for the AI to reference').replace(/"/g, '&quot;') + '" rows="3" style="width:100%;background:#1e293b;border:1px solid #334155;color:#f1f5f9;border-radius:8px;padding:10px 12px;font-size:13px;resize:vertical;outline:none;box-sizing:border-box;"></textarea>',
    '      </div>',
    '      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">',
    '        <div style="display:flex;align-items:center;gap:10px;">',
    '          <button type="button" data-mfd-ai-attach title="Đính kèm ảnh / .txt / .md / .json" style="background:transparent;border:1px solid #334155;color:#cbd5e1;border-radius:6px;width:32px;height:32px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">📎</button>',
    '          <input type="file" data-mfd-ai-file accept="image/*,.txt,.md,.json,.csv,.html" multiple style="display:none;">',
    '          <span style="font-size:11px;color:#64748b;">⏎ ' + T('ai.enter_hint', 'Enter to send · Paste/drop an image OK') + '</span>',
    '        </div>',
    '        <button type="button" data-mfd-ai-send style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:600;font-size:13px;cursor:pointer;">' + T('ai.send', 'Send') + ' →</button>',
    '      </div>',
    '    </div>',
    '  </div>',
  ];
  if (!isBuilder) {
    parts.push(
      '  <div style="display:flex;flex-direction:column;background:#f8fafc;color:#0f172a;min-height:0;">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:#fff;border-bottom:1px solid #e2e8f0;">',
      '      <div style="font-weight:600;font-size:13px;color:#0f172a;">' + T('ai.live_preview', 'Live preview') + '</div>',
      '      <div data-mfd-ai-status style="font-size:11px;color:#64748b;">' + T('ai.no_form_yet', '(no form yet)') + '</div>',
      '    </div>',
      '    <div data-mfd-ai-preview style="flex:1;overflow-y:auto;padding:24px;"></div>',
      '    <div style="border-top:1px solid #e2e8f0;background:#f1f5f9;padding:12px 18px;display:flex;gap:8px;justify-content:flex-end;">',
      '      <button type="button" data-mfd-ai-action="regen"  disabled style="background:#fff;border:1px solid #cbd5e1;color:#475569;padding:8px 14px;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;opacity:0.5;">🔁 ' + T('ai.regenerate', 'Regenerate') + '</button>',
      '      <button type="button" data-mfd-ai-action="builder" disabled style="background:#fff;border:1px solid #cbd5e1;color:#475569;padding:8px 14px;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;opacity:0.5;">✏️ ' + T('ai.open_builder', 'Open Builder') + '</button>',
      '      <button type="button" data-mfd-ai-action="save"   disabled style="background:#16a34a;color:#fff;border:0;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;opacity:0.5;">✅ ' + T('ai.save_use', 'Save & Use Now') + '</button>',
      '    </div>',
      '  </div>',
    );
  }
  parts.push('</div>');
  return parts.join('');
}

function wireShell(overlay: HTMLElement, modal: HTMLElement, state: any, host?: StudioHost): void {
  const isBuilderHost = !!(host && host.mode === 'builder' && typeof host.onApply === 'function');
  const closeBtn  = modal.querySelector<HTMLButtonElement>('[data-mfd-ai-close]');
  const sendBtn   = modal.querySelector<HTMLButtonElement>('[data-mfd-ai-send]');
  const input     = modal.querySelector<HTMLTextAreaElement>('[data-mfd-ai-input]');
  const regenBtn  = modal.querySelector<HTMLButtonElement>('[data-mfd-ai-action="regen"]');
  const buildBtn  = modal.querySelector<HTMLButtonElement>('[data-mfd-ai-action="builder"]');
  const saveBtn   = modal.querySelector<HTMLButtonElement>('[data-mfd-ai-action="save"]');

  // [UNIFY] Builder host: the studio applies the schema to the CURRENT canvas
  // instead of persisting a new form. Relabel "Save & Use Now" → "Apply to form"
  // and hide "Open Builder" (we are already in the builder).
  if (isBuilderHost) {
    if (saveBtn) saveBtn.innerHTML = '✅ Apply to form';
    if (buildBtn) buildBtn.style.display = 'none';
  }

  const closeModal = () => overlay.parentNode?.removeChild(overlay);
  closeBtn?.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Welcome message — Beary mascot greeting (shown as the empty-state hero by
  // renderBubbles). NOTE: a NEW i18n key (ai.bear_greeting) is used on purpose —
  // the legacy `ai.greeting` is already populated in the catalog with the old
  // "…live preview on the right…" text, which would override this fallback.
  state.bubbles.push({ role: 'ai', text: T('ai.bear_greeting', 'Hi there! I\'m here to help you design the perfect form. Ask me to add fields, fix validation, or improve your layout.') });

  const doSend = async () => {
    const text = (input?.value || '').trim();
    const hasAttachments = state.attachments.length > 0;
    if ((!text && !hasAttachments) || state.loading) return;
    if (input) input.value = '';
    const sentAttachments = state.attachments.slice();
    state.attachments = [];
    renderAttachmentChips(modal, state);
    const displayText = text || ('📎 ' + sentAttachments.length + ' attachment' + (sentAttachments.length === 1 ? '' : 's'));
    state.bubbles.push({ role: 'user', text: displayText + (sentAttachments.length ? ' (+' + sentAttachments.length + ' file)' : '') });
    state.loading = true;
    renderBubbles(modal, state);
    updateStatus(modal, '⏳ ' + T('ai.generating', 'Generating…'));
    try {
      // [AiDesignerBuilder] In builder mode, feed the CURRENT canvas form to the
      // AI so requests are incremental ("add a dropdown" adds to the existing
      // form instead of regenerating from scratch).
      let builderForm: any = undefined;
      if (isBuilderHost) {
        try {
          const B: any = (window as any).MegaFormBuilder;
          const sc = B && B.state && B.state.schema;
          if (sc) {
            const s = sc.settings || {};
            builderForm = {
              title: s.title || '',
              description: s.description || '',
              fields: sc.fields || [],
              // [B3 2026-06-27] Carry the PREMIUM design (read-only context) so callAI
              // can detect a premium edit, preserve the immutable shell byte-for-byte,
              // and let the AI rebrand hardcoded shell text via htmlTextSwaps.
              settings: {
                customHtml: s.customHtml || s.CustomHtml || '',
                customCss: s.customCss || s.CustomCss || '',
                theme: s.theme || s.Theme || '',
                themeCssOverrides: s.themeCssOverrides || s.ThemeCssOverrides || {},
                templateGuideSlug: s.templateGuideSlug || s.TemplateGuideSlug || '',
              },
            };
          }
        } catch { /* no canvas yet */ }
      }
      const result = await callAI(text, state.history, sentAttachments, state.selectedTables.slice(), builderForm);
      state.history.push({ role: 'user', content: text });
      if (result.schema) {
        state.schema = result.schema;
        state.explain = result.explain || '';
        if (isBuilderHost) {
          // [AiDesignerBuilder] The CANVAS is the preview — auto-apply each result
          // there (no separate preview pane, no "Apply" click). The panel stays
          // open so the user can keep iterating ("now make email required").
          state.bubbles.push({ role: 'ai', text: result.explain || T('ai.applied_to_canvas', 'Applied to the form on the canvas.') });
          try { Promise.resolve(host!.onApply!(result.schema)); }
          catch (e: any) { state.bubbles.push({ role: 'system', text: 'Apply error: ' + (e?.message || String(e)) }); }
        } else {
          state.bubbles.push({ role: 'ai', text: result.explain || T('ai.form_generated', 'Form generated. Check the preview →') });
          const repaired = (result.schema as any).__autoRepairedFields as string[] | undefined;
          if (repaired && repaired.length) {
            state.bubbles.push({ role: 'system', text: '⚠ Auto-repaired customHtml — appended missing placeholders for: ' + repaired.join(', ') + '. Preview should now show all fields.' });
          }
          renderPreview(modal, state.schema);
          enableActions(modal, true);
        }
        state.history.push({ role: 'assistant', content: JSON.stringify({ schema: result.schema, explain: result.explain || '' }) });
      } else if (result.appBatch) {
        // [v20260531-AppBatchDashboard] Multi-form app_batch path.
        // Dispatch via MFAI_Ops; render preview area with "Running…"
        // until the orchestrator finishes, then show created-form links.
        state.bubbles.push({ role: 'ai', text: result.explain || 'Building app — running app_batch …' });
        state.history.push({ role: 'assistant', content: JSON.stringify({ ops: [result.appBatch], explain: result.explain || '' }) });
        await runAppBatchFromDashboard(modal, state, result.appBatch);
      } else {
        state.bubbles.push({ role: 'ai', text: result.rawText || '(no schema returned — try a more specific prompt)' });
      }
    } catch (err: any) {
      state.bubbles.push({ role: 'system', text: 'Error: ' + (err.message || String(err)) });
    } finally {
      state.loading = false;
      renderBubbles(modal, state);
      updateStatus(modal, state.schema ? '✓ ' + T('ai.form_ready', 'Form ready — click Save & Use Now') : T('ai.no_form_yet', '(no form yet)'));
    }
  };
  sendBtn?.addEventListener('click', doSend);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });

  // [v20260530-35] Tab navigation — Chat / Database
  modal.querySelectorAll<HTMLButtonElement>('[data-mfd-ai-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(modal, state, btn.getAttribute('data-mfd-ai-tab') || 'chat'));
  });
  // Database pane search
  const dbSearch = modal.querySelector<HTMLInputElement>('[data-mfd-ai-db-search]');
  dbSearch?.addEventListener('input', () => renderDbList(modal, state, dbSearch.value));
  modal.querySelector<HTMLButtonElement>('[data-mfd-ai-db-clear]')?.addEventListener('click', () => {
    state.selectedTables = [];
    renderDbList(modal, state, dbSearch?.value || '');
    renderDbSelectedStrip(modal, state);
    updateDbTabBadge(modal, state);
  });

  // [v20260530-33] Attachments — paste / drag-drop / file picker
  const attachBtn  = modal.querySelector<HTMLButtonElement>('[data-mfd-ai-attach]');
  const fileInput  = modal.querySelector<HTMLInputElement>('[data-mfd-ai-file]');
  const dropArea   = modal.querySelector<HTMLElement>('[data-mfd-ai-droparea]');
  attachBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files) Array.from(fileInput.files).forEach(f => ingestFile(f, state, modal));
    fileInput.value = '';
  });
  // Paste: capture clipboard image/text
  input?.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let consumed = false;
    Array.from(items).forEach(it => {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) { ingestFile(f, state, modal); consumed = true; }
      }
    });
    if (consumed) e.preventDefault();
  });
  // Drag + drop into the input area
  ['dragenter','dragover'].forEach(ev => dropArea?.addEventListener(ev, (e: any) => {
    e.preventDefault(); e.stopPropagation();
    if (dropArea) dropArea.style.outline = '2px dashed #6366f1';
  }));
  ['dragleave','drop'].forEach(ev => dropArea?.addEventListener(ev, (e: any) => {
    e.preventDefault(); e.stopPropagation();
    if (dropArea) dropArea.style.outline = '';
  }));
  dropArea?.addEventListener('drop', (e: any) => {
    const files = e.dataTransfer?.files;
    if (files) Array.from(files).forEach((f: any) => ingestFile(f, state, modal));
  });

  regenBtn?.addEventListener('click', () => {
    if (state.loading) return;
    state.bubbles.push({ role: 'user', text: '🔁 Regenerate — make it different (vary layout, add nicer fields, change theme).' });
    state.loading = true;
    renderBubbles(modal, state);
    updateStatus(modal, '⏳ ' + T('ai.regenerating', 'Regenerating…'));
    callAI('Regenerate the form — vary layout, add nicer fields, maybe try a different theme. Keep the same general purpose.', state.history)
      .then((r) => {
        if (r.schema) {
          state.schema = r.schema; state.explain = r.explain || '';
          state.bubbles.push({ role: 'ai', text: r.explain || T('ai.regenerated', 'Regenerated.') });
          renderPreview(modal, state.schema);
          state.history.push({ role: 'assistant', content: JSON.stringify({ schema: r.schema, explain: r.explain || '' }) });
        } else {
          state.bubbles.push({ role: 'ai', text: r.rawText || '(no new schema)' });
        }
      })
      .catch((e) => state.bubbles.push({ role: 'system', text: 'Error: ' + e.message }))
      .finally(() => {
        state.loading = false;
        renderBubbles(modal, state);
        updateStatus(modal, state.schema ? '✓ ' + T('ai.form_ready_short', 'Form ready') : T('ai.no_form_yet', '(no form yet)'));
      });
  });

  // [UNIFY] Optional auto-send (e.g. builder widget-drop "+ AI Form").
  if (host && host.initialPrompt && input) {
    input.value = host.initialPrompt;
    setTimeout(() => { void doSend(); }, 250);
  }

  buildBtn?.addEventListener('click', () => {
    if (!state.schema) return;
    saveAndRedirect(state.schema, 'builder', modal);
  });
  saveBtn?.addEventListener('click', () => {
    if (!state.schema) return;
    if (isBuilderHost) {
      // Apply the generated/edited schema to the live builder canvas.
      try { Promise.resolve(host!.onApply!(state.schema)); }
      catch (e: any) { state.bubbles.push({ role: 'system', text: 'Apply error: ' + (e?.message || String(e)) }); renderBubbles(modal, state); return; }
      state.bubbles.push({ role: 'ai', text: '✓ ' + T('ai.applied_to_canvas', 'Applied to the form on the canvas.') });
      renderBubbles(modal, state);
      closeModal();
      return;
    }
    saveAndRedirect(state.schema, 'view', modal);
  });
}

// [AiBear 20260617] Resolve the module's /img/ asset base from the loaded bundle
// (Oqtane: /Modules/MegaForm/img/ ; DNN: /DesktopModules/MegaForm/Assets/img/).
function moduleImgBase(): string {
  try {
    const srcs = Array.from(document.querySelectorAll('script[src]')).map((s) => (s as HTMLScriptElement).src);
    const mine = srcs.find((u) => /\/Modules\/MegaForm\/js\//i.test(u)) || srcs.find((u) => /\/DesktopModules\/MegaForm\/Assets\/js\//i.test(u));
    if (mine) return mine.replace(/\/js\/.*$/i, '/img/');
  } catch { /* fall through */ }
  return '/Modules/MegaForm/img/';
}

// [AiBear 20260617] Beary mascot animations (ported from the admin-redesign mock
// app/globals.css). Injected once so the empty-state card matches the mockup.
function ensureBearyKeyframes(): void {
  if (document.getElementById('mfd-beary-kf')) return;
  const st = document.createElement('style');
  st.id = 'mfd-beary-kf';
  st.textContent =
    '@keyframes mfdSlideInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}' +
    '@keyframes mfdGentleBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}' +
    '@keyframes mfdSubtlePulse{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.7)}50%{box-shadow:0 0 0 4px rgba(16,185,129,0)}}' +
    '@keyframes mfdWiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-2deg)}75%{transform:rotate(2deg)}}';
  document.head.appendChild(st);
}

// [AiBear 20260617] "Beary" mascot empty-state — faithful to the admin-redesign
// mock (light blue-gradient welcome card, white avatar tile + ring, bobbing bear,
// pulsing green online dot, name + "✨ AI Assistant" badge, greeting). The avatar
// loads img/megaform-ai-bear.png; until that file exists it falls back to the
// inline robot-bear SVG so the panel is never broken.
function buildBearyHero(greeting: string): HTMLElement {
  ensureBearyKeyframes();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:14px;border-radius:14px;background:linear-gradient(135deg,#eff6ff,#ecfeff);border:1px solid #dbeafe;padding:18px;animation:mfdSlideInUp .5s ease-out;';
  wrap.innerHTML =
    '<div style="display:flex;align-items:center;gap:16px;">' +
      '<div style="position:relative;flex:0 0 auto;animation:mfdGentleBob 3s ease-in-out infinite;">' +
        '<div style="width:64px;height:64px;border-radius:16px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,0.1);outline:1px solid #dbeafe;display:flex;align-items:center;justify-content:center;overflow:hidden;">' +
          '<img src="' + moduleImgBase() + 'megaform-ai-bear.png" alt="Beary" width="56" height="56" style="width:56px;height:56px;object-fit:contain;display:block;" ' +
            'onerror="this.style.display=\'none\';var f=this.nextElementSibling;if(f)f.style.display=\'block\';">' +
          '<div style="display:none;width:56px;height:56px;">' + BEAR_SVG + '</div>' +
        '</div>' +
        '<span style="position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:#10b981;border:2px solid #fff;animation:mfdSubtlePulse 2s cubic-bezier(0.4,0,0.6,1) infinite;"></span>' +
      '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">' +
          '<span style="font-weight:600;font-size:15px;color:#0f172a;">' + T('ai.bear_name', 'Beary') + '</span>' +
          '<span style="display:inline-flex;align-items:center;gap:4px;background:#dbeafe;border:1px solid #bfdbfe;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 8px;border-radius:9999px;animation:mfdWiggle .6s ease-in-out;">✨ ' + T('ai.assistant_badge', 'AI Assistant') + '</span>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:12.5px;line-height:1.55;color:#64748b;">' + escapeHtml(greeting) + '</div>' +
      '</div>' +
    '</div>';
  return wrap;
}

function renderBubbles(modal: HTMLElement, state: any): void {
  const log = modal.querySelector<HTMLElement>('[data-mfd-ai-log]');
  if (!log) return;
  log.innerHTML = '';
  // [AiBear] Before any conversation, show the Beary mascot empty-state instead of a bare bubble.
  const hasUser = (state.bubbles || []).some((b: ChatBubble) => b.role === 'user');
  if (!hasUser && !state.loading) {
    const greet = ((state.bubbles || []).find((b: ChatBubble) => b.role === 'ai') || ({} as any)).text
      || T('ai.bear_greeting', 'Hi there! I\'m here to help you design the perfect form. Ask me to add fields, fix validation, or improve your layout.');
    log.appendChild(buildBearyHero(greet));
    return;
  }
  state.bubbles.forEach((b: ChatBubble) => {
    const wrap = document.createElement('div');
    if (b.role === 'user') {
      wrap.style.cssText = 'align-self:flex-end;max-width:85%;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;padding:9px 13px;border-radius:14px 14px 4px 14px;font-size:13px;line-height:1.45;';
    } else if (b.role === 'ai') {
      wrap.style.cssText = 'align-self:flex-start;max-width:85%;background:#1e293b;color:#e2e8f0;padding:9px 13px;border-radius:14px 14px 14px 4px;font-size:13px;line-height:1.45;border:1px solid #334155;';
    } else {
      wrap.style.cssText = 'align-self:center;max-width:90%;background:#7f1d1d;color:#fecaca;padding:7px 12px;border-radius:8px;font-size:12px;';
    }
    wrap.textContent = b.text;
    log.appendChild(wrap);
  });
  if (state.loading) {
    const tip = document.createElement('div');
    tip.style.cssText = 'align-self:flex-start;font-size:12px;color:#64748b;font-style:italic;display:flex;align-items:center;gap:8px;';
    tip.innerHTML = '<span style="display:inline-block;width:8px;height:8px;background:#6366f1;border-radius:50%;animation:mfdpulse 1.2s ease-in-out infinite;"></span> ' + T('ai.thinking', 'AI thinking…');
    log.appendChild(tip);
  }
  log.scrollTop = log.scrollHeight;
  if (!document.getElementById('mfd-ai-kf')) {
    const st = document.createElement('style');
    st.id = 'mfd-ai-kf';
    st.textContent = '@keyframes mfdpulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}';
    document.head.appendChild(st);
  }
}

function renderPreview(modal: HTMLElement, schema: any): void {
  const host = modal.querySelector<HTMLElement>('[data-mfd-ai-preview]');
  if (!host) return;
  host.innerHTML = '';
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(15,23,42,0.06);padding:20px;max-width:680px;margin:0 auto;';
  if (schema.title) {
    const h = document.createElement('h2');
    h.style.cssText = 'margin:0 0 4px;font-size:20px;color:#0f172a;font-weight:700;';
    h.textContent = String(schema.title);
    card.appendChild(h);
  }
  if (schema.description) {
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 16px;font-size:13px;color:#64748b;';
    p.textContent = String(schema.description);
    card.appendChild(p);
  }
  host.appendChild(card);
  try {
    const Renderer = (window as any).MegaFormRenderer;
    if (Renderer && typeof Renderer.init === 'function') {
      const mount = document.createElement('div');
      mount.id = 'mfd-ai-preview-mount';
      card.appendChild(mount);
      Renderer.init({
        container: mount,
        formId: 0,
        schema,
        submitButtonText: schema.settings?.submitButtonText || 'Submit',
        readonly: false,
      });
    } else {
      // Fallback: render a simple field summary
      const fields = (schema.fields || []) as any[];
      const list = document.createElement('ul');
      list.style.cssText = 'margin:0;padding-left:18px;font-size:13px;color:#1e293b;';
      flattenFieldsLite(fields).forEach((f) => {
        const li = document.createElement('li');
        li.style.cssText = 'margin-bottom:6px;';
        li.innerHTML = '<strong>' + escapeHtml(f.label || f.key) + '</strong> <span style="color:#94a3b8;font-size:11px;">(' + escapeHtml(f.type) + (f.required ? ', required' : '') + ')</span>';
        list.appendChild(li);
      });
      card.appendChild(list);
    }
  } catch (e: any) {
    const err = document.createElement('div');
    err.style.cssText = 'color:#dc2626;font-size:13px;';
    err.textContent = 'Preview failed: ' + e.message;
    card.appendChild(err);
  }
}

function flattenFieldsLite(fields: any[]): Array<{ key: string; label?: string; type: string; required?: boolean }> {
  const out: any[] = [];
  (fields || []).forEach((f) => {
    if (!f) return;
    if (f.type === 'Row' && Array.isArray(f.columns)) {
      f.columns.forEach((c: any) => (c.fields || []).forEach((cf: any) => out.push(cf)));
    } else if (f.type === 'Section') {
      out.push({ key: f.key, label: '── ' + (f.label || 'Section'), type: 'Section' });
    } else {
      out.push(f);
    }
  });
  return out;
}

// [v20260530-33] Read a file the user attached (paste/drop/file-picker).
// Images become data: URLs (sent multimodal to Vision-capable providers).
// Text files (.txt/.md/.json/.csv/.html) become inline text the AI can read.
function ingestFile(f: File, state: any, modal: HTMLElement): void {
  const MAX_IMG = 4 * 1024 * 1024;   // 4 MB
  const MAX_TXT = 200 * 1024;        // 200 KB
  const reader = new FileReader();
  const mime = String(f.type || '').toLowerCase();
  const isImage = mime.indexOf('image/') === 0;
  const isText = /^text\/|application\/(json|xml)|\.(txt|md|json|csv|html)$/i.test(mime + ' ' + f.name);
  if (isImage) {
    if (f.size > MAX_IMG) { alert(T('ai.attach_img_too_large', 'Image too large (max 4 MB):') + ' ' + f.name); return; }
    reader.onload = () => {
      state.attachments.push({ type: 'image', name: f.name, dataUrl: String(reader.result || ''), mediaType: mime, size: f.size });
      renderAttachmentChips(modal, state);
    };
    reader.readAsDataURL(f);
  } else if (isText) {
    if (f.size > MAX_TXT) { alert(T('ai.attach_txt_too_large', 'Text file too large (max 200 KB):') + ' ' + f.name); return; }
    reader.onload = () => {
      state.attachments.push({ type: 'text', name: f.name, content: String(reader.result || ''), mediaType: mime || 'text/plain', size: f.size });
      renderAttachmentChips(modal, state);
    };
    reader.readAsText(f);
  } else {
    alert(T('ai.attach_unsupported', 'Only image/* and text-like files (.txt/.md/.json/.csv/.html) are accepted. Got:') + ' ' + (mime || 'unknown') + ' for ' + f.name);
  }
}

function renderAttachmentChips(modal: HTMLElement, state: any): void {
  const host = modal.querySelector<HTMLElement>('[data-mfd-ai-attachments]');
  if (!host) return;
  if (!state.attachments.length) { host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = 'flex';
  host.innerHTML = '';
  state.attachments.forEach((a: any, idx: number) => {
    const chip = document.createElement('div');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:#1e293b;border:1px solid #334155;color:#cbd5e1;border-radius:6px;padding:4px 6px 4px 8px;font-size:11px;max-width:200px;';
    const icon = a.type === 'image' ? '🖼️' : '📄';
    const label = (a.name || (a.type === 'image' ? 'pasted-image' : 'attachment')).slice(0, 24);
    chip.innerHTML = '<span>' + icon + '</span><span title="' + escapeHtml(a.name || '') + '">' + escapeHtml(label) + '</span>';
    if (a.type === 'image' && a.dataUrl) {
      const img = document.createElement('img');
      img.src = a.dataUrl;
      img.style.cssText = 'width:22px;height:22px;object-fit:cover;border-radius:3px;margin-right:2px;';
      chip.insertBefore(img, chip.firstChild!);
      chip.querySelector('span')?.remove();
    }
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.style.cssText = 'background:transparent;border:0;color:#94a3b8;cursor:pointer;padding:0;width:18px;height:18px;line-height:1;font-size:14px;';
    rm.textContent = '×';
    rm.addEventListener('click', () => { state.attachments.splice(idx, 1); renderAttachmentChips(modal, state); });
    chip.appendChild(rm);
    host.appendChild(chip);
  });
}

function escapeHtml(s: string): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function updateStatus(modal: HTMLElement, text: string): void {
  const el = modal.querySelector<HTMLElement>('[data-mfd-ai-status]');
  if (el) el.textContent = text;
}

function enableActions(modal: HTMLElement, on: boolean): void {
  modal.querySelectorAll<HTMLButtonElement>('[data-mfd-ai-action]').forEach((b) => {
    b.disabled = !on;
    b.style.opacity = on ? '1' : '0.5';
    b.style.cursor = on ? 'pointer' : 'not-allowed';
  });
}

// [B3 fix 2026-06-27] Guarantee a field shape the builder canvas can load. The AI
// often returns lean fields (a Row WITHOUT its columns[], inputs without options[] /
// validation / properties); the builder then does `field.columns.map` /
// `field.options.map` on undefined and the whole form fails to load. Backfill the
// arrays/objects the renderer + builder iterate.
function ensureBuilderSafeField(f: any): any {
  if (!f || typeof f !== 'object') return f;
  if (f.type === 'Row') {
    if (!Array.isArray(f.columns)) f.columns = [];
    f.columns.forEach((c: any) => { if (c && Array.isArray(c.fields)) c.fields.forEach(ensureBuilderSafeField); });
  }
  if (!Array.isArray(f.options)) f.options = [];
  if (f.validation == null || typeof f.validation !== 'object') f.validation = {};
  if (f.properties == null || typeof f.properties !== 'object') f.properties = {};
  if (f.widgetProps == null || typeof f.widgetProps !== 'object') f.widgetProps = {};
  return f;
}

// [B3 fix 2026-06-27] Keep-style field merge. A premium edit must NOT let the AI
// restructure the field tree (it loses Row columns + per-field shape). Start from
// the EXISTING field for any key the AI kept (preserving type / columns / widgetProps),
// overlay only the safe author-editable props, and normalise genuinely-new fields.
function mergeKeepStyleFields(existing: any[], aiFields: any[]): any[] {
  const byKey: Record<string, any> = {};
  for (const f of existing || []) if (f && f.key) byKey[String(f.key)] = f;
  const SAFE = ['label', 'placeholder', 'required', 'helpText', 'defaultValue', 'options'];
  const out: any[] = [];
  for (const af of aiFields || []) {
    if (!af || !af.key) continue;
    const orig = byKey[String(af.key)];
    if (orig) {
      const merged = JSON.parse(JSON.stringify(orig));   // preserve full shape incl Row columns
      for (const k of SAFE) {
        if (af[k] === undefined) continue;
        if (k === 'options' && !Array.isArray(orig.options)) continue;   // don't graft options onto a non-option field
        merged[k] = af[k];
      }
      out.push(ensureBuilderSafeField(merged));
    } else {
      out.push(ensureBuilderSafeField({
        key: af.key, type: af.type || 'Text', label: af.label || af.key,
        required: !!af.required, placeholder: af.placeholder || '', helpText: af.helpText || '',
        options: Array.isArray(af.options) ? af.options : [], defaultValue: af.defaultValue ?? '',
        validation: {}, properties: {}, widgetProps: {},
      }));
    }
  }
  return out;
}

// ─── AI call ──────────────────────────────────────────────────────────────
async function callAI(userText: string, history: any[], attachments?: any[], selectedTables?: string[], builderForm?: any): Promise<{ schema?: any; explain?: string; rawText?: string }> {
  // [B88-fix] Inject the AI provider bundle on demand + apply the shared
  // server AI Settings, so Create-with-AI works without first opening a builder.
  let api: any;
  try {
    api = await ensureMfAi();
  } catch (e: any) {
    throw new Error((e && e.message) || T('ai.provider_not_loaded', 'AI provider not loaded. Open Dashboard → AI Settings and enable a provider.'));
  }
  if (!api || typeof api.chatWithTools !== 'function') {
    throw new Error(T('ai.provider_not_loaded', 'AI provider not loaded. Open Dashboard → AI Settings and enable a provider.'));
  }
  // [v20260530-34] Append selected-table context to the system prompt so the
  // AI builds Select widgets with optionsSql against the user's chosen tables
  // instead of inventing field names.
  let system = AI_SYSTEM_PROMPT;
  // [DDL-dialect 2026-06-12] Prepend the ACTIVE database's CREATE TABLE dialect so app_batch
  // DDL is provider-correct (SQLite/MySQL/Postgres) instead of the MSSQL [dbo]/IDENTITY shape
  // hardcoded in AI_SYSTEM_PROMPT (which 400s on SQLite: "unknown database [dbo]").
  try { const _ddlDialect = await ensureDbDialect(); if (_ddlDialect) system = _ddlDialect + '\n\n' + system; } catch { /* keep the default prompt */ }
  // [i18n] Make the AI write the FORM CONTENT (field labels, placeholders,
  // section titles, option labels, submit text) AND its "explain" reply in the
  // user's selected app language — otherwise an English/Vietnamese form leaks
  // into a German/French/… app. Technical identifiers stay unchanged.
  const _aiLang = aiTargetLanguage();
  if (_aiLang) {
    system += '\n\nOUTPUT LANGUAGE (IMPORTANT): The user\'s app is set to ' + _aiLang +
      '. Write ALL human-readable form text — field labels, placeholders, section/step titles, ' +
      'option labels, helper text, submit/button text — AND your short "explain" message in ' + _aiLang + '. ' +
      'If the user typed their request in another language, still produce the FORM in ' + _aiLang + '. ' +
      'Do NOT translate technical identifiers: field "key"s, SQL, table/column names, and CSS stay as-is.';
  }
  // [AiDesignerBuilder 20260617] Incremental edit context — when the studio runs
  // inside the builder it passes the CURRENT canvas form so the AI modifies it in
  // place instead of regenerating from scratch.
  if (builderForm && Array.isArray(builderForm.fields)) {
    system += '\n\nYOU ARE EDITING AN EXISTING FORM ON THE CANVAS (builder mode). The user wants an INCREMENTAL change. Return the COMPLETE updated form schema = the current fields below WITH the requested change applied (add / remove / modify). PRESERVE every existing field, its "key", order, label, options and settings UNLESS the user explicitly asks to change it. Never drop fields the user did not mention, and never restart from a blank form. If the user asks to "add" something, append it to the existing fields.\nCURRENT FORM ON THE CANVAS (JSON):\n' +
      JSON.stringify({ title: builderForm.title || '', description: builderForm.description || '', fields: builderForm.fields });
  }
  // [B3 2026-06-27] Premium keep-style edit — when the canvas form carries an
  // IMMUTABLE premium shell (customHtml / non-default theme / overrides), the AI
  // must NOT regenerate the design. It returns field/title changes plus text-only
  // htmlTextSwaps to rebrand hardcoded shell copy; we preserve the shell byte-for-
  // byte on apply. ONE mechanism (@shared/html-text-swap) shared with the chat
  // assistant's set_html_text op.
  const _exSettings: any = (builderForm && builderForm.settings) || {};
  const _exTheme = String(_exSettings.theme || '').trim().toLowerCase();
  const isPremiumEdit = !!(builderForm && (
    String(_exSettings.customHtml || '').trim() ||
    (_exTheme && _exTheme !== 'default') ||
    (_exSettings.themeCssOverrides && Object.keys(_exSettings.themeCssOverrides).length)
  ));
  if (isPremiumEdit) {
    const shellTexts = collectHtmlTextNodes(String(_exSettings.customHtml || ''));
    system += '\n\n🔒 PREMIUM KEEP-STYLE EDIT — this form has an IMMUTABLE premium design (customHtml + customCss + theme). You MUST NOT emit customHtml or customCss, and MUST NOT change theme — they are preserved automatically. Return JSON shaped {"schema":{version,title,description,fields,settings},"htmlTextSwaps":[{"find","replace"}],"explain"}.\n'
      + '- ALWAYS set schema.title AND schema.description to the rebranded copy (the form metadata name) so the dashboard + canvas title update too.\n'
      + '- Apply the user request by editing fields (relabel / add / remove / reorder). Keep every other field key/order/options intact.\n'
      + '- In schema.settings put ONLY themeCssOverrides (colour tweaks via the template CSS vars) — OMIT customHtml / customCss / theme entirely.\n'
      + '- To rebrand HARDCODED copy baked into the shell (hero title + subtitle, EVERY stepper label, eyebrow/step numbers, section headings + captions, button text), add {"find":"<exact current text>","replace":"<new text>"} entries to htmlTextSwaps. `find` MUST be one of the SHELL TEXTS below verbatim; `replace` MUST be plain text (no < > tags). Rebrand EVERY shell text that names the OLD theme/brand or topic — do not leave any old-brand wording behind. This rebrands the look WITHOUT changing its structure.\n'
      + '- Change colour ONLY if the user asks, and ONLY via themeCssOverrides.\n'
      + 'SHELL TEXTS (exact current strings you may rebrand): ' + JSON.stringify(shellTexts);
  }
  if (selectedTables && selectedTables.length) {
    system += '\n\nTABLES THE USER PRE-ATTACHED FROM THE DATABASE (DashboardDatabase):\n' +
      selectedTables.map((t) => '- ' + t).join('\n') +
      '\nFor SQL-backed Select / Radio / Checkbox / DataGrid / DataRepeater / DynamicLabel fields, use these table names with a `properties.optionsSql` like `SELECT Id AS value, Name AS label FROM <Table>` or a `widgetProps.masterQuery`. The user has signalled these are the relevant tables for this form. Do NOT invent table names not in this list.';
    if (selectedTables.length >= 2) {
      system += '\n\n🧠 SMART MULTI-TABLE ANALYSIS — when the user attaches 2+ tables, ANALYZE relationships before emitting fields:' +
        '\n  1. If table A has a column matching `<TableB>Id` / `<TableB>ID` / `B_id` → that is a FOREIGN KEY pointing to B. The cascade chain is B → A (parent B drives child A).' +
        '\n  2. Order parent → child: parents (lookup / dimension, usually shorter rows) come FIRST as Selects, children (fact / detail, usually wider rows) come LAST as filtered Selects or DataRepeater / DataGrid.' +
        '\n  3. CANONICAL 3-table chain (parent → middle → detail): Select PARENT (optionsSql=SELECT Id AS value,Name AS label FROM P) → Select MIDDLE (optionsSql=SELECT Id AS value,Name AS label FROM M WHERE ParentId=:parentId, optionsDependsOn:["parent_id"], optionsReloadOnChange:true) → DataRepeater/DataGrid DETAIL (widgetProps.masterQuery=SELECT * FROM D WHERE ParentId=:parentId AND MiddleId=:middleId, queryDependsOn:["parent_id","middle_id"]). NEVER make the middle a DataRepeater (it is display-only — user cannot pick a row to drive the next stage).' +
        '\n  4. Snake_case field keys but camelCase SQL placeholders. Parent field key `country_id` → placeholder `:countryId`. Renderer auto-normalises.' +
        '\n  5. For PURE INPUT forms (user fills new record across 2 related tables, e.g. Customer + Order): use parent Select to PICK the existing parent + plain inputs for the child columns + Hidden field carrying parent_id. No cascade chain needed because user is creating, not browsing.' +
        '\n  6. For PURE BROWSE forms (user explores existing data): full cascade chain ending in DataRepeater/DataGrid for the detail rows.' +
        '\n  7. If the relationship is UNCLEAR from table names alone, default to: parent = the table that looks like a lookup (Categories / Statuses / Users / Players) → child = the table that looks like a fact (Orders / Submissions / Scorecards / Transactions). When in doubt, ASK in the explain field which table is parent vs detail.' +
        '\n  8. Before writing any SQL with a JOIN or WHERE referencing a column on a DIFFERENT table, call out the assumed FK (e.g. "assumes Orders.CustomerId references Customers.Id") in the explain field so the user can verify.';
    }
  }
  const result = await api.chatWithTools({
    system,
    history: history.slice(),
    user: userText,
    attachments: attachments || [],
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 4000,
  });
  const text = String(result.text || '').trim();
  if (!text) return { rawText: '(empty response)' };
  // Try parse as JSON
  let stripped = text;
  if (stripped.indexOf('```') === 0) stripped = stripped.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let obj: any = null;
  try { obj = JSON.parse(stripped); }
  catch {
    // Try extract first {...} that has "schema"
    const m = stripped.match(/\{[\s\S]*"schema"[\s\S]*\}/);
    if (m) try { obj = JSON.parse(m[0]); } catch { /* ignore */ }
  }
  if (obj && obj.schema && typeof obj.schema === 'object' && Array.isArray(obj.schema.fields)) {
    // [B172] The studio (dashboard create + builder onApply) applies this schema
    // directly, NOT through the ops.ts dispatcher, so its composite-alias
    // normalisation does not cover this path. Canonicalise any CompositePhone /
    // CompositeAddress / … alias to {type:"Composite", widgetProps.preset} here,
    // recursively (composites can sit inside Row columns).
    normalizeCompositeFieldsDeep(obj.schema, 0);
    if (isPremiumEdit) {
      // [B3 2026-06-27] Keep-style apply: preserve the immutable premium shell
      // byte-for-byte and apply ONLY the AI's intent. NEVER run normalizeFormChrome
      // / applyDefaultPureGridShell here (they would replace the premium shell with
      // the pure-grid default). Colour goes through themeCssOverrides; brand copy
      // baked into the shell is rebranded via text-only htmlTextSwaps.
      // [B3 fix] Merge the AI's field intent onto the EXISTING field shapes — the AI
      // tends to drop a Row's columns[] / a field's options[], which crashes the
      // builder canvas (undefined .map) when the form is reloaded.
      obj.schema.fields = mergeKeepStyleFields((builderForm && builderForm.fields) || [], obj.schema.fields);
      const sset: any = (obj.schema.settings && typeof obj.schema.settings === 'object') ? obj.schema.settings : (obj.schema.settings = {});
      const aiOverrides = (sset.themeCssOverrides && typeof sset.themeCssOverrides === 'object') ? sset.themeCssOverrides : {};
      let html = String(_exSettings.customHtml || '');
      const swaps = Array.isArray((obj as any).htmlTextSwaps) ? (obj as any).htmlTextSwaps : [];
      if (swaps.length && html) {
        const r = applyHtmlTextSwaps(html, swaps, collectHtmlTextNodes(html));
        html = r.html;
        if (r.rejected.length) console.warn('[B3 keep-style] rejected swaps:', r.rejected);
      }
      // Re-assert the shell from the EXISTING form (byte-identical) so the apply
      // can never drop or mutate customCss / theme.
      sset.customHtml = html;
      sset.customCss = String(_exSettings.customCss || '');
      if (_exSettings.theme) sset.theme = _exSettings.theme;
      if (_exSettings.templateGuideSlug) sset.templateGuideSlug = _exSettings.templateGuideSlug;
      sset.themeCssOverrides = Object.assign({}, _exSettings.themeCssOverrides || {}, aiOverrides);
      // Make sure any NEW field has a {{field:key}} placeholder inside the shell.
      repairCustomHtmlPlaceholders(obj.schema);
    } else {
      repairCustomHtmlPlaceholders(obj.schema);
      normalizeFormChrome(obj.schema, userText);
      // [B266] Default AI output to a full-width pure-grid CUSTOM-SHELL (replaces the old compact-button
      // standard layout). Deterministic + var-driven so builder theme presets recolor it; safe-fallback
      // to the standard schema on any error; skips premium custom-shell (customHtml already set) + wizards.
      applyDefaultPureGridShell(obj.schema);
      repairCustomHtmlPlaceholders(obj.schema);
    }
    // [TASK A] Deterministic SQL proof: cheap models hallucinate table names.
    // Validate every SQL binding against the REAL schema + auto-correct via
    // DryRunValidate suggestions, so SQL-bound forms don't silently break.
    const proof = await proofFormSql(obj.schema);
    // [DB-INSERT-AI 2026-06-22] Single-form AI prompts that ask to persist to a
    // custom table must leave the studio with a populated settings.databaseInsert.
    // If the AI already emitted one we keep it; otherwise we auto-build from the
    // prompt + active DashboardDatabase provider.
    try {
      const providerKey = await getDbProviderKey();
      await ensureSingleFormDatabaseInsert(obj.schema, userText, providerKey);
    } catch { /* never fail schema parsing for DB insert setup */ }
    let explain = String(obj.explain || '');
    if (proof.note) explain += (explain ? '\n\n' : '') + proof.note;
    return { schema: obj.schema, explain };
  }
  // [v20260531-AppBatchDashboard] Detect multi-form ops shape from the AI:
  //   {"ops":[{"op":"app_batch", tables:[...], forms:[...]}], "explain":"..."}
  // OR a bare {"op":"app_batch", ...} object. Dashboard surface dispatches
  // these via the existing MFAI_Ops dispatcher (loaded from the AI assistant
  // bundle) so the same orchestrator runs as in the Builder chat.
  const appBatch = extractAppBatchOp(obj);
  if (appBatch) return { appBatch, explain: String(obj?.explain || '') };
  return { rawText: text };
}

// [TASK A] Deterministic SQL-proof pass for AI-generated schemas. Walks the
// schema for SQL bindings (optionsSql / masterQuery / insertSql / detailQuery),
// calls DryRunValidate, and auto-corrects hallucinated table names using the
// server's fuzzy suggestions. Runs regardless of provider (cheap models can't
// function-call, so we do the proof deterministically on the apply path).
async function proofFormSql(schema: any): Promise<{ note?: string }> {
  try {
    const nodes: Array<{ parent: any; key: string }> = [];
    collectSqlNodes(schema, nodes, 0);
    if (!nodes.length) return {};
    const fixes: string[] = [];
    const unresolved: string[] = [];
    for (const n of nodes) {
      const sql = String(n.parent[n.key] || '');
      if (!sql) continue;
      let res: any = null;
      try { res = await aiPost('DryRunValidate', { sql }); } catch (e) { continue; }
      if (!res || res.ok !== false || !Array.isArray(res.missing) || !res.missing.length) continue;
      let fixed = sql; const applied: string[] = [];
      for (const miss of res.missing) {
        const sug = res.suggestions && res.suggestions[miss];
        if (sug) { fixed = replaceTableName(fixed, miss, sug); applied.push(miss + '→' + sug); }
        else unresolved.push(miss);
      }
      if (applied.length && fixed !== sql) { n.parent[n.key] = fixed; fixes.push(applied.join(', ')); }
    }
    const parts: string[] = [];
    if (fixes.length) parts.push('🔧 SQL: auto-fixed table name(s): ' + fixes.join('; '));
    if (unresolved.length) parts.push('⚠ SQL references table(s) not found on the database: ' + Array.from(new Set(unresolved)).join(', ') + ' — create them (ProposeTableSchema → ExecuteDdl) or fix the query.');
    return parts.length ? { note: parts.join('\n') } : {};
  } catch (e) { return {}; }
}

// [B172] Composite alias → canonical {type:"Composite", widgetProps.preset}.
const COMPOSITE_ALIAS_PRESET: Record<string, string> = {
  compositephone: 'phone', compositename: 'name', compositenameplus: 'name_plus',
  compositeaddress: 'address', compositessn: 'ssn', compositedob: 'dob',
  compositetime: 'time', compositeemailconfirm: 'email_confirm', compositepasswordconfirm: 'password_confirm',
};
function normalizeCompositeFieldsDeep(node: any, depth: number): void {
  if (!node || typeof node !== 'object' || depth > 8) return;
  if (Array.isArray(node)) { node.forEach((v) => normalizeCompositeFieldsDeep(v, depth + 1)); return; }
  const t = String(node.type || '').toLowerCase().replace(/[\s_-]+/g, '');
  const preset = COMPOSITE_ALIAS_PRESET[t];
  if (preset) {
    node.type = 'Composite';
    node.widgetProps = (node.widgetProps && typeof node.widgetProps === 'object') ? node.widgetProps : {};
    if (!node.widgetProps.preset) node.widgetProps.preset = preset;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (v && typeof v === 'object') normalizeCompositeFieldsDeep(v, depth + 1);
  }
}

function collectSqlNodes(obj: any, out: Array<{ parent: any; key: string }>, depth: number): void {
  if (!obj || typeof obj !== 'object' || depth > 8) return;
  if (Array.isArray(obj)) { obj.forEach((v) => collectSqlNodes(v, out, depth + 1)); return; }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string') {
      if (/^(optionssql|mastersql|masterquery|insertsql|sql|query|detailquery|detail1query|detail2query)$/i.test(k)
          && /\b(from|into|update|join)\b/i.test(v) && v.length < 4000) {
        out.push({ parent: obj, key: k });
      }
    } else if (v && typeof v === 'object') {
      collectSqlNodes(v, out, depth + 1);
    }
  }
}

function replaceTableName(sql: string, oldName: string, newName: string): string {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sql.replace(new RegExp('\\b' + esc + '\\b', 'gi'), newName);
}

async function aiPost(action: string, body: any): Promise<any> {
  const tok = (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';
  const r = await fetch(aiBase() + 'AiTools/' + action, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', RequestVerificationToken: tok },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// [B114] Deterministic chrome normalizer. Weak/cheap models often opt into
// "premium custom-shell" mode (settings.theme="custom") but fail to emit the
// customHtml/customCss that mode REQUIRES. The renderer's DoubleCardFix then
// strips the default card (expecting the theme to supply one) → a bare,
// border-less, header-less form. When the custom shell is empty, downgrade to
// the default theme so the standard card + header band render. (The renderer
// also guards this at paint time; this keeps the SAVED schema clean so the
// builder view + exports are consistent too.)
function normalizeFormChrome(schema: any, prompt?: string): void {
  try {
    const s = schema && (schema.settings || (schema.settings = {}));
    if (!s || typeof s !== 'object') return;
    const theme = String(s.theme || s.Theme || '').trim().toLowerCase();
    const customHtml = String(s.customHtml || s.CustomHtml || '').trim();
    const customCss = String(s.customCss || s.CustomCss || '').trim();
    // (1) theme:"custom" with no shell → default (so the default card + header render)
    if (theme === 'custom' && !customHtml) {
      if ('theme' in s) s.theme = 'default'; else s.theme = 'default';
      if ('Theme' in s) s.Theme = 'default';
    }
    // (2) [P2-A] Premium intent but the model produced a PLAIN form (no shell).
    // Give it a colored header banner deterministically — styling the standard
    // .mf-form-header band keeps the layout + 2-col rows intact (no fragile
    // customHtml token-mapping). This is the "compiler supplies the chrome the
    // cheap model couldn't" step.
    if (prompt && isPremiumIntent(prompt) && !customHtml && !customCss) {
      const grad = pickPremiumGradient(prompt);
      s.customCss = premiumHeaderBandCss(grad);
      if (!schema.description && !s.description) schema.description = premiumSubtitle(prompt);
    }
  } catch { /* best-effort */ }
}

function isPremiumIntent(prompt: string): boolean {
  return /\b(premium|branded?|brand|banner|hero|header\s*band|jotform|designer|glassmorph|corporate\s*header|gradient|landing|polished|beautiful|professional\s*look|đẹp|sang\s*tr[oọ]ng|thương\s*hiệu|cao\s*c[aấ]p)\b/i.test(prompt || '');
}

function pickPremiumGradient(prompt: string): string {
  const p = (prompt || '').toLowerCase();
  if (/health|medical|clinic|doctor|patient|y\s*t[eế]|b[eệ]nh/.test(p)) return 'linear-gradient(135deg,#0f766e,#14b8a6)';
  if (/finance|bank|invoice|insurance|t[aà]i\s*ch[ií]nh|ng[aâ]n\s*h[aà]ng/.test(p)) return 'linear-gradient(135deg,#1e293b,#475569)';
  if (/market|sale|promo|event|conference|launch|s[uự]\s*ki[eệ]n/.test(p)) return 'linear-gradient(135deg,#ec4899,#f97316)';
  if (/education|school|course|training|gi[aá]o\s*d[uụ]c|kh[oó]a\s*h[oọ]c/.test(p)) return 'linear-gradient(135deg,#7c3aed,#a855f7)';
  return 'linear-gradient(135deg,#1e3a8a,#3b82f6)'; // default corporate indigo→blue
}

function premiumSubtitle(_prompt: string): string {
  return 'Please fill in the details below.';
}

// Scoped to .mf-form-wrapper so it can't leak to other forms on the page.
// Extends the header band edge-to-edge (cancels the card's 24/28 padding) and
// recolors title/description for contrast on the gradient.
function premiumHeaderBandCss(gradient: string): string {
  return [
    '.mf-form-wrapper .mf-form-header{',
    '  background:' + gradient + ';',
    '  margin:-24px -28px 24px;padding:30px 28px 26px;border-radius:8px 8px 0 0;',
    '}',
    '.mf-form-wrapper .mf-form-title{color:#ffffff;font-size:24px;font-weight:800;margin:0 0 6px;}',
    '.mf-form-wrapper .mf-form-description{color:rgba(255,255,255,0.9);margin:0;}',
    '.mf-form-wrapper .mf-btn-submit{background:#1e3a8a;border:0;}',
    '@media (max-width:600px){.mf-form-wrapper .mf-form-header{margin:-18px -16px 18px;padding:22px 16px;}}',
  ].join('\n');
}

function extractAppBatchOp(obj: any): any | null {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj.ops)) {
    var ab = obj.ops.find((o: any) => o && o.op === 'app_batch');
    if (ab) return ab;
  }
  if (obj.op === 'app_batch') return obj;
  return null;
}

/**
 * [v20260531-AppBatchDashboard] Dispatch an app_batch op from the
 * dashboard "Create form with AI" modal. The Builder chat normally owns
 * MFAI_Ops, but it isn't loaded on the dashboard surface — so we
 * dispatch directly via a stripped-down helper that calls the same
 * /AiTools/ExecuteDdl + /MegaFormApi/Save endpoints. UI rendering takes
 * over the preview area to show a per-form status grid that updates as
 * tables + forms come online; final state is a list of clickable
 * builder links + a "✓ All n forms created" banner.
 */
async function runAppBatchFromDashboard(modal: HTMLElement, state: any, appBatch: any): Promise<void> {
  const preview = modal.querySelector<HTMLElement>('[data-mfd-ai-preview]');
  const statusEl = modal.querySelector<HTMLElement>('[data-mfd-ai-status]');
  if (!preview) return;
  const tables = Array.isArray(appBatch.tables) ? appBatch.tables : [];
  const forms  = Array.isArray(appBatch.forms)  ? appBatch.forms  : [];
  // [DB-INSERT-AI 2026-06-22] Use the active DashboardDatabase provider so INSERT SQL
  // and databaseType match the real backend (SQLite/MySQL/Postgres/MSSQL).
  const providerKey = await getDbProviderKey();

  preview.innerHTML = [
    '<div style="background:#f1f5f9;border-radius:10px;padding:14px 18px;color:#0f172a;font-family:-apple-system,sans-serif;">',
    '  <div style="font-weight:700;font-size:14px;margin-bottom:8px;">⚡ Building app — ' + tables.length + ' tables · ' + forms.length + ' forms</div>',
    '  <div id="mfd-batch-status" style="font-size:12px;color:#475569;line-height:1.7;"></div>',
    '</div>',
  ].join('');
  const statusList = modal.querySelector<HTMLElement>('#mfd-batch-status');
  if (statusEl) statusEl.textContent = '⏳ ' + T('ai.running_app_batch', 'Running app_batch…');

  function pushStatus(line: string) {
    if (!statusList) return;
    const d = document.createElement('div');
    d.innerHTML = line;
    statusList.appendChild(d);
  }

  function antiF(): string {
    return (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';
  }
  async function postJson(url: string, body: any): Promise<any> {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', RequestVerificationToken: antiF() },
      body: JSON.stringify(body || {}),
    });
    const text = await r.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status, payload });
    return payload;
  }

  // Resolve platform-aware base via the file-scope apiBase() helper above
  // (which already handles Oqtane MegaFormPopup alias path + DNN default).
  const apiBaseUrl = apiBase();
  const aiBaseUrl = aiBase(); // [P1-3] AiTools/ExecuteDdl lives under the AI base, not MegaFormPopup
  const summary = { tablesOk: 0, tablesExisted: 0, tablesFailed: 0, forms: [] as Array<{ title: string; formId?: number; ok: boolean; error?: string }> };

  // ── Run DDL ─────────────────────────────────────────────────
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    try {
      const r = await postJson(aiBaseUrl + 'AiTools/ExecuteDdl', { sql: t.ddl, connectionKey: t.connectionKey || 'DashboardDatabase' });
      if (r.alreadyExists) { summary.tablesExisted++; pushStatus('• Table ' + (i + 1) + '/' + tables.length + ': <span style="color:#a16207">already exists (kept)</span>'); }
      else { summary.tablesOk++; pushStatus('• Table ' + (i + 1) + '/' + tables.length + ': <span style="color:#16a34a">created</span>'); }
    } catch (err: any) {
      summary.tablesFailed++;
      pushStatus('• Table ' + (i + 1) + '/' + tables.length + ': <span style="color:#dc2626">failed</span> — ' + escapeHtml(err?.payload?.error || err.message || ''));
    }
  }

  // ── Build child-FK lookup for cascade upgrade ───────────────
  const tablesByCol: Record<string, { parentSchema: string; parentTable: string; parentPk: string; labelCol: string }> = {};
  for (const t of tables) {
    const m = String(t.ddl || '').match(/CREATE\s+TABLE\s+\[?(\w+)\]?\.?\[?(\w+)?\]?\s*\(([\s\S]+)\)/i);
    if (!m) continue;
    const schema = m[2] ? m[1] : 'dbo';
    const table = m[2] || m[1];
    const body = m[3];
    const pk = (body.match(/\[?(\w+)\]?\s+\w+(?:\s*\([^)]+\))?\s+(?:NOT\s+NULL\s+)?(?:IDENTITY[^,]*)?\s*(?:CONSTRAINT[^,]+)?PRIMARY\s+KEY/i)?.[1]) || 'Id';
    const lblMatch = body.match(/\[(Name|FullName|Title|Label|DisplayName)\]/i);
    const labelCol = lblMatch ? lblMatch[1] : (body.match(/\[(\w+)\]\s+N?VARCHAR/i)?.[1] || pk);
    const key = (table.toLowerCase() + 'id').replace(/[_-]/g, '');
    tablesByCol[key] = { parentSchema: schema, parentTable: table, parentPk: pk, labelCol };
    const sing = table.toLowerCase().replace(/s$/, '') + 'id';
    tablesByCol[sing.replace(/[_-]/g, '')] = { parentSchema: schema, parentTable: table, parentPk: pk, labelCol };
  }

  function autoWire(fields: any[]): number {
    let n = 0;
    function walk(arr: any[]) {
      for (const f of arr) {
        if (f.type === 'Row' && Array.isArray(f.columns)) { for (const c of f.columns) walk(c.fields || []); continue; }
        if (!f.key) continue;
        const norm = String(f.key).toLowerCase().replace(/[_-]/g, '');
        const hit = tablesByCol[norm];
        if (!hit) continue;
        f.type = (f.type === 'Radio' || f.type === 'Checkbox') ? f.type : 'Select';
        f.properties = f.properties || {};
        const canonicalSql = 'SELECT [' + hit.parentPk + '] AS value, [' + hit.labelCol + '] AS label FROM [' + hit.parentSchema + '].[' + hit.parentTable + '] ORDER BY [' + hit.labelCol + ']';
        // [v20260531-FixSqlHallucination] Always overwrite if AI emitted
        // a known-bogus shape (e.g. `[INT] AS value`, snake_case PK).
        const existing = String(f.properties.optionsSql || '');
        const looksBogus = !existing
          || /\bAS\s+value\b/i.test(existing) === false
          || /\[INT\]|\[int\]|\bINT\s+AS\s+value\b/i.test(existing)
          || /SELECT\s+\[[a-z_]+\]\s+AS\s+value/.test(existing);
        if (!f.properties.optionsSource || looksBogus) {
          f.properties.optionsSource = 'sql';
          f.properties.optionsType = 'sql';
          f.properties.optionsConnectionKey = 'DashboardDatabase';
          f.properties.optionsSql = providerKey === 'sqlite' || providerKey === 'mysql' || providerKey === 'postgres'
            ? `SELECT ${quoteIdentifierForProvider(hit.parentPk, providerKey)} AS value, ${quoteIdentifierForProvider(hit.labelCol, providerKey)} AS label FROM ${quoteIdentifierForProvider(hit.parentTable, providerKey)} ORDER BY ${quoteIdentifierForProvider(hit.labelCol, providerKey)}`
            : `SELECT [${hit.parentPk}] AS value, [${hit.labelCol}] AS label FROM [${hit.parentSchema}].[${hit.parentTable}] ORDER BY [${hit.labelCol}]`;
          f.options = [];
          n++;
        }
      }
    }
    walk(fields);
    return n;
  }

  // [v20260531-FixInsertColMap] Build INSERT SQL that uses REAL column
  // names (from DDL columns lookup), not AI-guessed snake_case keys.
  const realColsByTable: Record<string, string[]> = {};
  for (const t of tables) {
    const m = String(t.ddl || '').match(/CREATE\s+TABLE\s+\[?(\w+)\]?\.?\[?(\w+)?\]?\s*\(([\s\S]+)\)/i);
    if (!m) continue;
    const schema = m[2] ? m[1] : 'dbo';
    const tbl = m[2] || m[1];
    const body = m[3];
    const cols: string[] = [];
    let depth = 0, buf = '';
    for (const ch of body) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { const cm = buf.trim().match(/^\[?(\w+)\]?\s+\w/); if (cm) cols.push(cm[1]); buf = ''; }
      else buf += ch;
    }
    if (buf.trim()) { const cm = buf.trim().match(/^\[?(\w+)\]?\s+\w/); if (cm) cols.push(cm[1]); }
    realColsByTable[(schema + '.' + tbl).toLowerCase()] = cols;
  }
  function resolveColName(table: string, schema: string, fieldKey: string): string {
    const key = (schema + '.' + table).toLowerCase();
    const real = realColsByTable[key];
    if (!real) return fieldKey;
    const norm = fieldKey.toLowerCase().replace(/[_-]/g, '');
    const hit = real.find(c => c.toLowerCase().replace(/[_-]/g, '') === norm);
    return hit || fieldKey;
  }

  // ── Build INSERT SQL helper (mirror of ops.ts buildInsertSqlFor) ─
  function buildInsertSql(form: any): { insertSql: string; mapping: Record<string, string> } {
    const tableName = form.tableName;
    const schemaName = form.schemaName || 'dbo';
    const p = providerKey || 'mssql';
    const skip = new Set(['Row', 'Section', 'Heading', 'Divider', 'HtmlBlock', 'Image', 'DynamicLabel', 'DataRepeater', 'DataGrid', 'GridRepeater', 'Razor', 'FileUpload', 'File', 'Signature']);
    const flat: { key: string }[] = [];
    function walk(arr: any[]) {
      for (const f of arr) {
        if (f.type === 'Row' && Array.isArray(f.columns)) { for (const c of f.columns) walk(c.fields || []); continue; }
        if (!f.key || skip.has(f.type)) continue;
        flat.push({ key: f.key });
      }
    }
    walk(form.fields || []);
    const userMap = (form.mapping || {}) as Record<string, string>;
    const cols = flat.map(f => userMap[f.key] || resolveColName(tableName, schemaName, f.key));
    const params = flat.map(f => ':' + f.key);
    const insertSql = 'INSERT INTO ' + qualifiedTableForProvider(p, schemaName, tableName) +
      ' (' + cols.map(c => quoteIdentifierForProvider(c, p)).join(', ') + ') VALUES (' + params.join(', ') + ')';
    const mapping: Record<string, string> = {};
    flat.forEach(f => { mapping[':' + f.key] = f.key; });
    return { insertSql, mapping };
  }

  // ── Create forms ────────────────────────────────────────────
  let fkWiredTotal = 0;
  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    if (Array.isArray(f.fields)) fkWiredTotal += autoWire(f.fields);
    const schemaObj: any = { version: '1.0', fields: f.fields || [], settings: f.settings || {} };
    const settingsObj: any = (f.settings && JSON.parse(JSON.stringify(f.settings))) || {};
    if (f.tableName) {
      const { insertSql, mapping } = buildInsertSql(f);
      settingsObj.databaseInsert = {
        enabled: true,
        connectionKey: 'DashboardDatabase',
        databaseType: providerKey === 'mssql' ? 'SqlServer' : providerKey,
        insertSql, parameterMapping: mapping,
      };
      schemaObj.settings = settingsObj;
    }
    const cfg = platformCfg();
    const formInfo = {
      FormId: 0,
      Title: f.title,
      Description: f.description || '',
      Status: 'Draft',
      SchemaJson:   JSON.stringify(schemaObj),
      SettingsJson: JSON.stringify(settingsObj),
      PreserveModuleBindingOnSave: true,
      PortalId: typeof cfg.portalId === 'number' ? cfg.portalId : 0,
      SiteId:   typeof cfg.siteId   === 'number' ? cfg.siteId   : (typeof cfg.portalId === 'number' ? cfg.portalId : 0),
      ModuleId: typeof cfg.moduleId === 'number' ? cfg.moduleId : 0,
    };
    try {
      // [OqtaneFix] Use the same platform-aware endpoint/headers as single-form save.
      const res = await fetch(saveEndpoint(), {
        method: 'POST',
        credentials: 'same-origin',
        headers: buildSaveHeaders(),
        body: JSON.stringify(formInfo),
      });
      const text = await res.text();
      let r: any = null;
      try { r = text ? JSON.parse(text) : null; } catch { r = { raw: text }; }
      if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status, payload: r });
      summary.forms.push({ title: f.title, formId: r.formId, ok: true });
      pushStatus('• Form ' + (i + 1) + '/' + forms.length + ': <a href="/xx?mfFormId=' + r.formId + '#mf-builder" target="_blank" style="color:#0369a1;text-decoration:underline">' + escapeHtml(f.title) + ' (id ' + r.formId + ')</a>');
    } catch (err: any) {
      summary.forms.push({ title: f.title, ok: false, error: err?.payload?.Message || err?.payload?.error || err.message });
      pushStatus('• Form ' + (i + 1) + '/' + forms.length + ': <span style="color:#dc2626">' + escapeHtml(f.title) + ' failed</span> — ' + escapeHtml(String(err?.payload?.Message || err?.payload?.error || err.message)));
    }
  }

  // ── Final summary ──────────────────────────────────────────
  const formsOk = summary.forms.filter(f => f.ok).length;
  const formLinks = summary.forms.filter(f => f.ok)
    .map(f => '<a href="/xx?mfFormId=' + f.formId + '#mf-builder" target="_blank" style="color:#0369a1;text-decoration:underline">' + escapeHtml(f.title) + ' (id ' + f.formId + ')</a>')
    .join(' · ');
  const allOk = summary.tablesFailed === 0 && formsOk === forms.length;
  const summaryHtml = [
    '<div style="background:' + (allOk ? '#ecfdf5' : '#fffbeb') + ';border:1px solid ' + (allOk ? '#6ee7b7' : '#fcd34d') + ';color:' + (allOk ? '#065f46' : '#92400e') + ';padding:14px 18px;border-radius:10px;margin-top:14px;font-family:-apple-system,sans-serif;">',
    '  <div style="font-weight:700;margin-bottom:6px;">' + (allOk ? '✓' : '⚠') + ' App batch ' + (allOk ? 'complete' : 'partial') + '</div>',
    '  <div style="font-size:12px;color:inherit;opacity:.85;">' +
       summary.tablesOk + ' new tables · ' +
       summary.tablesExisted + ' already existed · ' +
       summary.tablesFailed + ' failed · ' +
       formsOk + '/' + forms.length + ' forms · ' +
       fkWiredTotal + ' FK dropdowns auto-wired' +
    '</div>',
    formLinks ? ('<div style="margin-top:10px;font-size:13px;">' + formLinks + '</div>') : '',
    '</div>',
  ].join('');
  preview.insertAdjacentHTML('beforeend', summaryHtml);
  if (statusEl) statusEl.textContent = allOk ? '✓ App ready' : '⚠ Partial — check status above';

  state.bubbles.push({ role: 'ai', text: (allOk ? '✓ ' : '⚠ ') + 'App batch ' + (allOk ? 'complete' : 'partial') + ': ' + formsOk + '/' + forms.length + ' forms created. Click any link in the preview to open in Builder.' });

  // Trigger Dashboard refresh event
  try {
    var createdIds = summary.forms.filter(f => f.ok).map(f => f.formId!);
    window.dispatchEvent(new CustomEvent('mfai:forms-changed', { detail: { source: 'dashboard-app_batch', createdIds } }));
    try { localStorage.setItem('mfai:forms-changed', JSON.stringify({ ts: Date.now(), createdIds, source: 'dashboard-app_batch' })); } catch (_e) {}
  } catch (e) { console.warn('[ai-form-creator] event dispatch failed', e); }
}

/**
 * [v20260530-30 SPLIT-001] When AI emits customHtml without `{{field:KEY}}`
 * placeholders for every declared field, those fields render INVISIBLE at
 * runtime. This auto-recovery scans the customHtml, finds missing field
 * keys, and appends `{{field:KEY}}` placeholders for them at the end of the
 * form column (just before `{{form:submit}}` if present, otherwise at the
 * end of the root `<div class="mfp …">`).
 *
 * Logs to console.warn so the user can see in DevTools that fields were
 * auto-appended. The KB entry `form_pattern-premium-split-layout` explains
 * the rule.
 */
function repairCustomHtmlPlaceholders(schema: any): void {
  try {
    const settings = schema.settings || (schema.settings = {});
    const html = String(settings.customHtml || '');
    if (!html) return;
    // Detect ANY .mfp-prefixed root (canonical layouts mfp-split / mfp-hero-top /
    // mfp-bg-overlay / mfp-header-band + any AI-invented variant like mfp-sidebar /
    // mfp-magazine / mfp-zpattern / mfp-cards / mfp-floating-labels, etc).
    if (!/class\s*=\s*["'][^"']*\bmfp(?:\s|["'])/.test(html)) return;
    // [2026-06-27] Structure-aware sync (Row-rendered sub-fields get NO own token; a
    // new field's token lands INSIDE its data-step panel, not before the shared actions
    // row at the very end; orphans/duplicates dropped). This replaces the old flat
    // "append every missing token before the last actions" logic that duplicated
    // Row sub-fields and collapsed the multi-step wizard onto one cramped page.
    const before = html;
    const patched = syncFieldPlaceholders(html, schema.fields || []);
    if (patched !== before) {
      settings.customHtml = patched;
      const newlyAdded: string[] = [];
      try {
        flattenFieldsLite(schema.fields || []).forEach((f: any) => {
          if (f && f.key && before.indexOf('{{field:' + f.key + '}}') < 0 && patched.indexOf('{{field:' + f.key + '}}') >= 0) newlyAdded.push(f.key);
        });
      } catch { /* ignore */ }
      if (newlyAdded.length) (schema as any).__autoRepairedFields = newlyAdded;
    }
  } catch { /* never fail the parse for a repair attempt */ }
}

// [B266] Var-driven pure-grid shell CSS. Styles ONLY the shell chrome (card / header / sections /
// submit) via var(--mf-*) tokens and leaves the field INPUTS to megaform.css's --mf-* consumers —
// so builder theme presets (which write --mf-*) fully recolor the form, with no hardcoded hex to
// fight (the limitation documented in Docs/ANALYSIS_Premium_Preset_CSS_Limitation.md).
const PURE_GRID_SHELL_CSS =
  '.mfp.mfp-pure-grid{width:100%;max-width:100%;font-family:var(--mf-font-body,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color:var(--mf-text,#1a1a1a)}' +
  '.mfp.mfp-pure-grid .mfp-container{max-width:var(--mf-form-max-width,720px);width:100%;margin:0 auto}' +
  '.mfp.mfp-pure-grid .mfp-card{background:var(--mf-card-bg,#ffffff);border:1px solid var(--mf-input-border-color,#e2e8f0);border-radius:var(--mf-card-radius,12px);box-shadow:var(--mf-card-shadow,0 1px 3px rgba(0,0,0,.06));overflow:hidden}' +
  '.mfp.mfp-pure-grid .mfp-card-header{padding:26px 32px 4px;text-align:center}' +
  '.mfp.mfp-pure-grid .mfp-form-title{font-size:28px;font-weight:700;color:var(--mf-text,#1a1a1a);margin:0 0 8px}' +
  '.mfp.mfp-pure-grid .mfp-form-desc{font-size:15px;color:var(--mf-text-muted,#6b7280);margin:0}' +
  '.mfp.mfp-pure-grid .mfp-card-body{padding:22px 32px 28px;display:flex;flex-direction:column;gap:16px}' +
  '.mfp.mfp-pure-grid .mfp-section{display:flex;flex-direction:column;gap:14px}' +
  '.mfp.mfp-pure-grid .mfp-section-label{font-size:12px;font-weight:600;color:var(--mf-text-muted,#5a5a5a);text-transform:uppercase;letter-spacing:.08em;padding-bottom:8px;border-bottom:1px solid var(--mf-input-border-color,#e2e8f0);margin-bottom:2px}' +
  '.mfp.mfp-pure-grid .mfp-actions{margin-top:6px}' +
  '.mfp.mfp-pure-grid .mfp-submit{width:100%;padding:14px 28px;font-size:16px;font-weight:600;color:var(--mf-btn-fg,#ffffff);background:var(--mf-primary,#4a90d9);border:none;border-radius:var(--mf-input-radius,10px);cursor:pointer;margin-top:4px;transition:filter .15s}' +
  '.mfp.mfp-pure-grid .mfp-submit:hover{filter:brightness(0.94)}' +
  '@media(max-width:640px){.mfp.mfp-pure-grid .mfp-card-header,.mfp.mfp-pure-grid .mfp-card-body{padding-left:20px;padding-right:20px}}';

// [B266] Wrap a STANDARD AI schema (no customHtml) into a full-width pure-grid CUSTOM-SHELL so the AI
// default produces the kept "full-width custom-shell" form type instead of the compact-button
// standard layout. Deterministic (the renderer substitutes {{field:key}} per field) + var-driven
// (PURE_GRID_SHELL_CSS) so presets recolor it. No-op for premium custom-shell (customHtml present),
// wizards (multiPage / pageBreak), or empty schemas. Any error → leaves the standard schema intact.
export function applyDefaultPureGridShell(schema: any): void {
  try {
    if (!schema || typeof schema !== 'object') return;
    const settings = schema.settings || (schema.settings = {});
    if (String(settings.customHtml || settings.CustomHtml || '').trim()) return; // respect premium output
    if (settings.multiPage === true || settings.MultiPage === true) return;       // wizard ≠ custom-shell
    const fields = Array.isArray(schema.fields) ? schema.fields : [];
    if (!fields.length) return;
    if (fields.some((f: any) => f && f.properties && f.properties.pageBreak === true)) return; // wizard

    const esc = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let body = '';
    let inSection = false;
    fields.forEach((f: any) => {
      if (!f || !f.key) return;
      const type = String(f.type || '');
      if (type === 'Section') {
        if (inSection) body += '</div>';
        body += '<div class="mfp-section"><div class="mfp-section-label">' + esc(f.label || '') + '</div>';
        inSection = true;
        return;
      }
      if (type === 'Hidden') return; // the renderer appends hidden inputs itself
      body += '{{field:' + f.key + '}}'; // Row / Composite / plain — renderer expands each token
    });
    if (inSection) body += '</div>';

    settings.customHtml =
      '<div class="mfp mfp-pure-grid"><div class="mfp-container"><div class="mfp-card">' +
      '<div class="mfp-card-header"><h1 class="mfp-form-title">{{form:title}}</h1><p class="mfp-form-desc">{{form:description}}</p></div>' +
      '<div class="mfp-card-body">' + body +
      '<div class="mfp-actions"><button type="submit" class="mfp-submit">{{form:submit}}</button></div>' +
      '</div></div></div></div>';
    settings.customCss = PURE_GRID_SHELL_CSS;
    settings.theme = 'pure-grid-premium'; // gives the B265 card border + the --mf-*→--mfp-* preset bridge
    (schema as any).__defaultedPureGrid = true;
  } catch { /* on any error leave the schema as a standard form (safe fallback) */ }
}

// ─── Database INSERT helpers for single-form AI output ────────────────────
const DB_INSERT_KEYWORDS = /\b(save\s+to\s+(table|db|database)|store\s+in\s+(table|db|database)|lưu\s+vào\s+(bảng|csdl|cơ\s+sở\s+dữ\s+liệu)|insert\s+on\s+submit|database\s+insert|custom\s+table|bảng\s+dữ\s+liệu)\b/i;

function snakeToPascal(k: string): string {
  return String(k || '').split(/[_\s-]+/).map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join('');
}

function quoteIdentifierForProvider(ident: string, provider: string): string {
  const p = String(provider || '').toLowerCase();
  if (p === 'sqlite' || p === 'postgres') return '"' + ident.replace(/"/g, '""') + '"';
  if (p === 'mysql') return '`' + ident.replace(/`/g, '``') + '`';
  return '[' + ident.replace(/\]/g, ']]') + ']';
}

function qualifiedTableForProvider(provider: string, schemaName: string, tableName: string): string {
  const p = String(provider || '').toLowerCase();
  const table = quoteIdentifierForProvider(tableName, provider);
  if (p === 'sqlite' || p === 'mysql' || p === 'postgres') return table;
  const schema = String(schemaName || 'dbo');
  return quoteIdentifierForProvider(schema, provider) + '.' + table;
}

function flatInsertableFieldKeys(fields: any[]): string[] {
  const skip = new Set(['Row', 'Section', 'Heading', 'Divider', 'HtmlBlock', 'Html', 'Image', 'DynamicLabel', 'DataRepeater', 'DataGrid', 'GridRepeater', 'Razor', 'FileUpload', 'File', 'Signature']);
  const keys: string[] = [];
  function walk(arr: any[]) {
    if (!Array.isArray(arr)) return;
    for (const f of arr) {
      if (!f) continue;
      if (f.type === 'Row' && Array.isArray(f.columns)) {
        for (const c of f.columns) walk(c.fields || []);
        continue;
      }
      if (!f.key || skip.has(String(f.type || ''))) continue;
      keys.push(String(f.key));
    }
  }
  walk(fields || []);
  return keys;
}

function buildInsertSqlForFields(fields: any[], tableName: string, schemaName: string, provider: string): { insertSql: string; parameterMapping: Record<string, string> } {
  const keys = flatInsertableFieldKeys(fields);
  const cols = keys.map(k => quoteIdentifierForProvider(snakeToPascal(k), provider));
  const params = keys.map(k => ':' + k);
  const insertSql = 'INSERT INTO ' + qualifiedTableForProvider(provider, schemaName, tableName) +
    ' (' + cols.join(', ') + ') VALUES (' + params.join(', ') + ')';
  const mapping: Record<string, string> = {};
  keys.forEach(k => { mapping[':' + k] = k; });
  return { insertSql, parameterMapping: mapping };
}

function extractTableNameFromPrompt(prompt: string): string | null {
  const p = String(prompt || '');
  // "save to table Registrations" / "lưu vào bảng Registrations" / "store in table [dbo].[Registrations]"
  const m = p.match(/(?:save\s+to|store\s+in|lưu\s+vào)\s+(?:table|bảng|csdl|cơ\s+sở\s+dữ\s+liệu)?\s*(?:\[?dbo\]?\s*\.\s*)?\[?([A-Za-z_][A-Za-z0-9_]*)\]?/i);
  if (m) return m[1];
  // generic "... table X" / "... bảng X"
  const m2 = p.match(/(?:table|bảng)\s+(?:name\s*=\s*)?['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/i);
  if (m2) return m2[1];
  return null;
}

async function ensureSingleFormDatabaseInsert(schema: any, userText: string, providerKey: string): Promise<void> {
  if (!schema || typeof schema !== 'object') return;
  const settings = schema.settings || (schema.settings = {});
  // If the AI already emitted a databaseInsert config, keep it but normalize the type.
  const existing = settings.databaseInsert;
  if (existing && typeof existing === 'object' && (existing.enabled || existing.insertSql)) {
    if (!existing.connectionKey) existing.connectionKey = 'DashboardDatabase';
    if (!existing.databaseType && providerKey) existing.databaseType = providerKey === 'mssql' ? 'SqlServer' : providerKey;
    return;
  }
  // Only auto-wire when the prompt explicitly asks for DB persistence.
  if (!DB_INSERT_KEYWORDS.test(String(userText || ''))) return;
  const tableName = extractTableNameFromPrompt(userText) || snakeToPascal(String(schema.title || 'AIForm'));
  const schemaName = 'dbo';
  const p = providerKey || 'mssql';
  const { insertSql, parameterMapping } = buildInsertSqlForFields(schema.fields, tableName, schemaName, p);
  settings.databaseInsert = {
    enabled: true,
    connectionKey: 'DashboardDatabase',
    databaseType: p === 'mssql' ? 'SqlServer' : p,
    insertSql,
    parameterMapping,
  };
}

// ─── Save + navigate ──────────────────────────────────────────────────────
async function saveAndRedirect(schema: any, mode: 'view' | 'builder', modal: HTMLElement): Promise<void> {
  updateStatus(modal, '💾 ' + T('ai.saving', 'Saving…'));
  enableActions(modal, false);
  try {
    const cfg = platformCfg();
    const title = String(schema.title || 'AI form ' + new Date().toLocaleString());
    const payload: any = {
      FormId: 0,
      Title: title,
      Description: String(schema.description || ''),
      SchemaJson: JSON.stringify({ version: '1.0', fields: schema.fields || [], settings: schema.settings || {} }),
      SettingsJson: JSON.stringify(schema.settings || {}),
      ThemeJson: JSON.stringify({ theme: (schema.settings && schema.settings.theme) || 'default' }),
      Status: 'Draft',
      SubmitButtonText: String(schema.settings?.submitButtonText || 'Submit'),
      SuccessMessage: String(schema.settings?.successMessage || 'Thank you. We received your submission.'),
      PortalId: typeof cfg.portalId === 'number' ? cfg.portalId : 0,
      SiteId:   typeof cfg.siteId   === 'number' ? cfg.siteId   : (typeof cfg.portalId === 'number' ? cfg.portalId : 0),
      ModuleId: typeof cfg.moduleId === 'number' ? cfg.moduleId : 0,
    };
    const url = saveEndpoint();
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: buildSaveHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Save failed: HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const data = await res.json().catch(() => ({} as any));
    const newId = Number(data.formId || data.FormId || data.id || data.Id || 0);
    if (!newId) throw new Error('Save succeeded but no formId returned: ' + JSON.stringify(data).slice(0, 200));
    if (mode === 'builder') {
      window.location.href = builderUrl(newId);
    } else {
      window.location.href = viewUrl(newId);
    }
  } catch (e: any) {
    updateStatus(modal, '❌ ' + e.message);
    enableActions(modal, true);
  }
}

// ─── Public export + badge ───────────────────────────────────────────────
(window as any).MFDashboardAiFormCreator = {
  open: openAiFormCreator,
  badge: BADGE,
  // [P2-A QA hook] Drive the REAL generation pipeline (system prompt +
  // ensureMfAi + normalizeFormChrome) headlessly for visual-QA harnesses.
  _callAI: (userText: string, selectedTables?: string[]) => callAI(userText, [], [], selectedTables),
  _compile: normalizeFormChrome,
  _proofSql: proofFormSql,
};
console.log('[MfAiFormCreator]', BADGE, 'loaded');
