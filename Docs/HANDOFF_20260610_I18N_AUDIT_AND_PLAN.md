# HANDOFF — MegaForm Multi-Language (i18n) Audit + Plan (2026-06-10)

Source: 8-agent audit workflow (`tools` not needed; see run wf_e85b51f6-072). Goal: ≥5 default
languages (NO Vietnamese), pick a language → EVERY widget/control/admin panel translates, no UI
break, code keeps working.

## VERDICT: NOT ready — ~25-30% i18n-capable. Framework exists; coverage + RTL + culture-bridge missing.

## What EXISTS (reuse, don't reinvent)
- **Client engine** `MegaForm.UI/src/i18n/index.ts`: `t(key, params)` (line 357) with 3-step fallback
  (currentLocale → en-US → key), `{param}` interpolation, `loadLocale()` (lazy JSON), `detectLocale()`
  (window.MegaFormLocale → data-mf-locale → navigator.language), `setLocale`, `initI18n`, global
  `window.MegaFormI18n`. en-US catalog (~347 keys) bundled inline = source of truth.
- **Builder wrapper** `builder/core.ts:158` `builderT(key, fallback, params)`; **runtime wrapper**
  `megaform-renderer.ts:19` `trTop()/tr()`. Both bridge to `window.MegaFormI18n`.
- **Server** `MegaForm.Core/i18n/MegaFormStrings.cs` + `JsonLocalizationProvider.cs` (defined but
  largely UNUSED on Oqtane). Endpoint `MegaFormController.cs:805-970` `/api/MegaForm/i18n/Get?id={locale}`.
- **Languages admin page** `src/languages/index.ts` (create/edit/import/export locales).
- **Per-form CONTENT translation ALREADY works at runtime**: `FormSchema` has `Translations` dicts;
  `megaform-renderer.ts:437-474` `applyFieldTranslation()/applyLocaleToSchema()` consume them. GAP = no
  builder authoring UI + Oqtane has no persistence (DNN-only `MF_FieldTranslations`).
- **Locale files**: en-US (inline) + es-ES, ja-JP, ko-KR, vi-VN, zh-CN exist; fr-FR partial.
  `COMMON_LANGS` lists 12 but **de-DE, pt-BR, it-IT, zh-TW, th-TH have NO file** → silently fall back to en.

## What's MISSING / broken
- **Coverage ~1100+ hardcoded strings**: dashboard `index.ts` (~130: modal()/sectionHead()/toast()/
  textContent literals), builder `dom.ts/fields.ts/properties.ts/canvas.ts/gallery.ts` (~600+), runtime
  `validation.ts/renderer/interactive.ts/SubmissionsShell.ts/my-inbox` (~95+), Razor + controller JSON
  (~130+ incl. status enums Published/Draft/Approved). My recent code (My Inbox, GS modals) is hardcoded too.
- **Two divergent stacks** (chrome catalog vs per-form content) unaware of each other → partial translation.
- **Zero RTL**: no `dir` toggle, no `isRTL()`, pervasive physical CSS (builder collapse `right:-16px`;
  tooltips `left:50%/translateX(-50%)`; drawers `translateX(100%)`; submissions `margin-left:auto`; inbox
  `text-align:right`). Arabic would visibly break builder + inbox.
- **No locale formatting**: hardcoded `toLocaleDateString('en-US')`, English `MF_DTP_MONTHS` array, payment
  `currency:'USD'`, no decimal/thousand rules → de-DE/fr-FR see wrong dates/numbers; non-USD merchants
  charged wrong (FUNCTIONAL bug). Latin-only `Inter` font → CJK/Arabic mojibake.
- **Oqtane culture NOT bridged to JS**: `Index.razor` __MF_PLATFORM__ injection omits culture →
  bundles fall back to navigator.language, ignoring site language.
- Leftover hardcoded Vietnamese in some admin/workflow QA surfaces (baseline isn't even clean English).

## ARCHITECTURE DECISION (single pipeline, 2 layers, one resolved culture)
- **Layer A — static chrome** (dev-authored): reuse `t()`/`builderT()`; flat dot-namespace keys
  (dash.*, builder.*, form.*, server.*); en-US inline = source; build-time `i18n:check` gate fails on key
  drift; new C# `IMegaFormLocalizer` shares the SAME JSON key set for server messages.
- **Layer B — per-form content** (end-user authored): the `schema.translations[locale]` path the renderer
  ALREADY consumes; add a builder "Languages" sub-tab to author it; add Oqtane `MF_FieldTranslations`
  parity (or persist in schema JSON both platforms save).
- **Culture resolver**: `Index.razor` injects `window.__MF_PLATFORM__.culture` + `data-mf-locale` from
  PageState/SiteState; `detectLocale()` prioritizes it + BCP-47 fuzzy match (en→en-US, ar→ar-SA);
  `initI18n()` loads locale, sets `dir`, all consumers read one `currentLocale`.
- **No-break**: `isRTL()` + `setDir()` + a single `mf-rtl.css` of `[dir=rtl]` logical-property overrides
  (LTR untouched); ship **de-DE** to force length-robust layouts (flex-wrap, min/max-width, content-sized
  buttons); Noto CJK+Arabic font fallback chain; Intl.* for all date/number/currency + pluralization;
  never paint raw keys (en-US inline fallback + localStorage versioned cache).

## RECOMMENDED LAUNCH LANGUAGES (no Vietnamese)
en-US (base/fallback) + **es-ES, fr-FR, de-DE, pt-BR, ar-SA**. Covers Western Europe + LATAM + MENA;
**Arabic forces RTL** (hardens the hardest case at launch, not later); de-DE = worst overflow (hardens
layout). zh-CN/ja-JP/ko-KR already have partial bundles → cheap bonus adds.

## PHASES (deliverable per phase; MVP = Phases 1-4)
1. **Baseline + culture bridge + lifecycle** (~2-3d): de-Vietnamese the baseline; inject Oqtane culture →
   JS; BCP-47 fuzzy + localStorage cache + missing-key logger; `isRTL()/setDir()`.
2. **Catalog tooling + completeness gate + 6 locale files** (~4-5d): `i18n:check` CI gate; create
   de-DE/pt-BR/ar-SA + bring es/fr to full parity; C# localizer.
3. **Runtime + widgets** (~4-5d): extract ~110 runtime strings; Intl dates/numbers/currency; mf-rtl.css
   on form/inbox/submissions. Prove live on Oqtane formId 2 in ar-SA + de-DE.
4. **Per-form content authoring** (~4-6d): builder "Languages" sub-tab → `schema.translations`; Oqtane
   field-translation parity; end-user form language picker.
5. **Builder chrome (~600) + dashboard (~130) + server/Razor (~130)** (~8-10d): the big extraction;
   [dir=rtl] CSS for builder/dashboard; localize controller JSON + status enums by request culture.
6. **AI/templates/exports + fonts + hardening** (~4-5d): localize AI chat + pass culture to LLM;
   email/PDF/CSV per-locale; Noto font swap; secure Language Dashboard + cache the locale endpoint.

**Effort**: ~26-34 dev-days full (~5-7 wks). MVP (Phases 1-4) ~14-19d (~3 wks) already delivers
"pick a language → runtime form + field content + inbox translate, RTL correct". Locale-file authoring +
mf-rtl.css + dashboard extraction parallelize.

## QUICK WINS (high leverage, do first)
1. Inject `__MF_PLATFORM__.culture` + `data-mf-locale` in Index.razor (~1h) — stops navigator.language fallback.
2. BCP-47 fuzzy match in `detectLocale()` — kills raw-key leakage.
3. Create the 3 MISSING locale files (de-DE/pt-BR/ar-SA) — makes them actually selectable.
4. `isRTL()` + `setDir()` in setLocale/initI18n — Arabic gets correct direction immediately.
5. Swap Inter-only font for Noto/CJK/Arabic fallback chain (1 CSS line) — kills mojibake.
6. `i18n:check` completeness script in CI — stops future drift.
7. Hand-seed `schema.translations` on form 2 — proves end-user field-label translation works TODAY.
