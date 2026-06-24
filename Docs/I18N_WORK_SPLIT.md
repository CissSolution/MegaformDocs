# MegaForm i18n — Parallel Work Split (for multiple AIs / developers)

Goal: en-US (base) + **es-ES, fr-FR, de-DE, pt-BR, ar-SA**; pick a language → EVERY widget / control /
admin panel translates, **zero UI break**, code keeps working. Full plan + audit:
`Docs/HANDOFF_20260610_I18N_AUDIT_AND_PLAN.md`. This doc is the **work partition** so several AIs can run
in parallel **without merge conflicts**.

## The conflict-avoidance rules (READ FIRST — non-negotiable)
1. **Own only your files.** Each stream below lists the EXACT files/dirs it owns. Never edit a file outside
   your stream. If you think you must, STOP and coordinate.
2. **Add catalog keys ONLY to your namespace file** `MegaForm.UI/src/i18n/keys/<your-namespace>.ts`
   (created by Stream 0). Never edit `src/i18n/index.ts` or another stream's keys file. New key naming:
   `dash.*` (dashboard), `builder.*`/`prop.*`/`canvas.*`/`category.*` (builder), `form.*`/`field.*`/
   `widget.*`/`style.*` (runtime), `server.*` (server/Razor), `common.*` (shared buttons: Save/Cancel/…).
3. **Add RTL CSS ONLY in your surface's own `*.css`** as `[dir=rtl] .your-class { … }`. Shared structural
   overrides live in `src/styles/mf-rtl.css` (Stream 0 owns it) — request additions, don't edit it.
4. **Use the shared API, don't reinvent**: client `t(key, params)` / `builderT(key, fallback, params)` /
   `tr(key, fallback, params)`; formatting `formatDate/formatNumber/formatCurrency` from
   `src/i18n/format.ts`; never call `toLocaleDateString('en-US')` or hardcode `$`/`USD`.
5. **Locale JSON is Stream E's** — extraction streams (A–D) add keys to en-US (their keys file); Stream E
   translates them into the 5 other languages. Don't edit `public/i18n/*.json` unless you are Stream E.
6. **Build + deploy + QA your own surface** before declaring done (recipe at the bottom). Never paint raw
   dot-keys to the user (en-US is the inline fallback — keep it complete).
7. **Run `npm run i18n:check`** (Stream 0 tooling) before every commit — it fails if any locale is missing
   any en-US key.

---

## STREAM 0 — FOUNDATION (do FIRST; freezes the contract everyone else builds on)
**Owner: the lead AI (in progress now).** Until this lands + is deployed, Streams A–E are BLOCKED on the
contract (catalog split, engine API, culture bridge, format helpers). After it lands, A–E run in parallel.

Owns / delivers:
- `MegaForm.UI/src/i18n/index.ts` — harden: `__MF_PLATFORM__.culture` becomes top priority in
  `detectLocale()`; BCP-47 fuzzy match (`en`→`en-US`, `ar`→`ar-SA`, `zh`→`zh-CN`); localStorage versioned
  cache for lazy locale JSON; dev-only missing-key logger; `isRTL(locale)`, `setDir(locale)` (toggle
  `dir`/`data-dir` on roots) called from `setLocale`/`initI18n`; expose all on `window.MegaFormI18n`.
- `MegaForm.UI/src/i18n/keys/{common,dashboard,builder,runtime,server}.ts` (NEW) — en-US catalog SPLIT by
  namespace, each `export default { 'key': 'English', … }`; `index.ts` merges them. **This is the key
  enabler for parallel work** (each stream edits only its file).
- `MegaForm.UI/src/i18n/format.ts` (NEW) — `formatDate/formatTime/formatDateTime/formatNumber/formatCurrency(value, locale)`
  via `Intl.*`; a `plural(n, locale, forms)` helper; export the active-locale resolver.
- `MegaForm.UI/src/styles/mf-rtl.css` (NEW) — shared `[dir=rtl]` structural overrides (loaded for RTL
  locales) + the dir-aware `--mf-dir` var convention.
- `MegaForm.Oqtane.Client/Index.razor` + `DashboardView.razor` + `SubmissionsView.razor` + `BuilderView.razor`
  — inject `window.__MF_PLATFORM__.culture` (from `PageState`/`SiteState` culture) + `data-mf-locale` on the
  root (CULTURE INJECTION ONLY — do not touch surface markup; that's Streams C/D).
- `MegaForm.UI/src/styles/megaform-builder-ts.css` (font line only) — swap Inter-only for
  `Inter,'Noto Sans','Noto Sans Arabic','Noto Sans Hebrew','Noto Sans CJK SC',system-ui,sans-serif`.
- `MegaForm.Core/i18n/IMegaFormLocalizer.cs` (NEW interface) + Oqtane impl + DI registration — server reads
  the SAME en-US.json + locale JSONs (Stream D consumes it).
- `MegaForm.UI/tools/i18n-check.cjs` (NEW) — diff every shipped locale JSON vs the inline en-US key set,
  fail on drift; wire `npm run i18n:check`.
- `MegaForm.UI/src/languages/index.ts` (**Language Manager / "copy-from-En → new language" admin tool**) —
  this feature LARGELY EXISTS already: "Create language" (POST `/api/MegaForm/i18n/create` `copyFrom:en-US`),
  "Copy English" button, category TABS (General/Navigation/Validation/**Controls**=field./prop./canvas.,
  **Widgets**=widget., **Builder/Admin**=builder.), English-baseline shown per row, Save/Import/Download/
  AI-translate. **Stream-0 enhancement:** add a **Dashboard** tab (`dash.*`) and **Server** tab (`server.*`)
  to the `TABS` matcher list so the new namespaces are translatable by category; align tab grouping with the
  `keys/*.ts` namespaces; verify create/copy/save/export endpoints round-trip for a brand-new locale (e.g.
  create `de-DE`, Copy English, save, reload → persisted). The categories auto-populate as Streams A–D add
  keys. This is THE UI that satisfies the user's "copy from En + create a new language, detailed for
  dashboard/widgets/controls" requirement — keep it working end-to-end.

**Acceptance:** culture flows server→client (bundles stop using navigator.language); `isRTL/setDir/format.*`
callable; `keys/*.ts` split builds identically to before (no visible change yet); `i18n:check` runs; the
Language Manager can Create a new locale from English with Dashboard/Widgets/Controls/Builder/Server
category tabs, edit, Save and reload it (round-trip proven live).

---

## STREAM A — RUNTIME + WIDGETS (end-user-facing)  ·  ~110 strings + Intl + RTL
**Owns:** `src/renderer/*`, `src/widgets/*` (+ `plugins/*`), `src/submissions/*`, `src/my-inbox/*`,
`src/workflow-inbox/*`, and THEIR CSS (`megaform-submissions-ts.css`, `megaform-my-inbox-ts.css`,
`megaform-workflow-inbox-ts.css`), and `src/i18n/keys/runtime.ts`.
**Work:** replace hardcoded strings (validation.ts `'${label} is required'`/`'Invalid email'`/`'Minimum N…'`,
renderer Submit/Previous/Next/Thank you, interactive.ts date-picker labels + the English `MF_DTP_MONTHS`
array, widget empty-states/search placeholders/tooltips, `SubmissionsShell` headers/status/search, my-inbox
strings) with `tr()/t()` + params; route every date/number/currency through `src/i18n/format.ts`; add
`[dir=rtl]` overrides for the hotspots (submissions `margin-left:auto`, inbox `text-align:right`/`translateX(100%)`).
**Acceptance:** a public form + submissions inbox + My Inbox fully translate (chrome + validation +
dates/numbers/currency), RTL correct in ar-SA, on Oqtane formId 2. Build `submissions`,`my-inbox`,
`workflow-inbox`,`renderer`,`widgets` bundles.

## STREAM B — BUILDER (chrome ~600 + per-form Languages authoring tab)
**Owns:** `src/builder/*` (dom.ts, fields.ts, properties.ts, canvas.ts, gallery.ts, designers, field-plugins),
builder CSS (`megaform-builder-ts.css` except the Stream-0 font line, `megaform-builder-shell.css`),
`src/i18n/keys/builder.ts`.
**Work:** wrap every hardcoded literal via `builderT(key, englishFallback, params)` (wrapper already exists,
core.ts:158) — topbar/tooltips/tab titles+descriptions, ~50 property labels, form-settings + help tips,
designer strings, gallery pagination. Convert builder physical-CSS hotspots (panel collapse `right:-16px`,
tooltips `left:50%`) to `[dir=rtl]`. **Plus** add a "Languages" sub-tab to the right rail (reuse `rightTab`
pattern) that inline-edits `schema.translations[locale]` per field (label/placeholder/help/options) + form
title/description/submit/success — the renderer ALREADY consumes this (megaform-renderer.ts:437-474).
**Acceptance:** builder opens fully translated in de-DE (no overflow) + ar-SA (RTL); author can translate
form 2's fields into es-ES + ar-SA. Build `builder`/`builder-loader`.

## STREAM C — DASHBOARD / ADMIN + AI surfaces (~130 + AI)
**Owns:** `src/dashboard/*` (index.ts, embed-modal.ts, ai-form-creator.ts, chat.ts, submission-report.ts),
`src/config/*`, `megaform-admin-shell.css`, `src/i18n/keys/dashboard.ts`.
**Work:** wrap `modal()`/`sectionHead()`/`toast()`/`btn.textContent`/`infoBox()`/placeholder literals via a
`dash.*` namespace; localize KPI/status `badge()` labels; for AI surfaces, pass the active culture into the
LLM system prompt so replies + AI-generated form headers come back in the user's language. `[dir=rtl]` for
admin-shell hotspots.
**Acceptance:** every settings modal (Database/Payment/Email/Google Sheets/AI/…) + dashboard chrome
translates in de-DE + ar-SA, layout intact. Build `dashboard`.

## STREAM D — SERVER / RAZOR (controllers + Razor + Core)
**Owns:** `MegaForm.Oqtane.Server/Controllers/*.cs` (user-facing JSON `error`/`message` + status enums),
Razor template TEXT in `Index.razor`/`DashboardView.razor`/`SubmissionsView.razor` (NOT the Stream-0 culture
injection), `MegaForm.Core/i18n/*` (server catalog), `MegaForm.Core/i18n/server.*` keys.
**Work:** replace controller `BadRequest/Ok` message literals + status strings (Published/Draft/Approved) +
Razor labels (Module Settings, Loading form…, No form configured) with `IMegaFormLocalizer` (Stream 0) keyed
by request culture. **Provider-aware** (don't break SQLite/PG/MySQL/MSSQL).
**Acceptance:** API error/status responses + Razor chrome localize by request culture. Build Server + Client.

## STREAM E — LOCALE CONTENT (translation, NO code)
**Owns:** `MegaForm.UI/public/i18n/*.json` (+ the deployed copies under
`wwwroot/Modules/MegaForm/js/bundles/i18n/` & `js/builder/i18n/`) for the 6 languages.
**Work:** keep `de-DE.json`, `pt-BR.json`, `ar-SA.json` (newly created by Stream 0) + `es-ES`/`fr-FR` at
100% key parity with the inline en-US as Streams A–D add keys. Pure translation; run `npm run i18n:check`
after each pass. Can split further: one AI per language. Runs CONTINUOUSLY in parallel with A–D.
**Acceptance:** `i18n:check` green for all 6 launch locales; no English leaks when a non-English locale is
selected (except genuinely-missing keys, which fall back gracefully).

---

## Dependency / sequencing
```
Stream 0 (foundation) ──► A, B, C, D start in parallel (file-disjoint)
                          └► E (locale content) trails the keys A–D add (but starts now on the existing ~347)
Phase-6 polish (AI/templates/exports/fonts/hardening) folds into C (AI) + A (exports) once A–D land.
```
Streams A, B, C, D, E touch **disjoint** files → no merge conflicts. The only shared files are
`src/i18n/index.ts`, `keys/*.ts` split boundaries, `mf-rtl.css`, `format.ts`, the Razor culture block, and
`IMegaFormLocalizer` — ALL owned by Stream 0 and FROZEN before A–E start.

## Build / deploy / QA recipe (every stream)
- Build a UI bundle: `cd MegaForm.UI && node scripts/build-entry.cjs <entry>` (auto-syncs to platform dirs).
- Deploy to host: copy `Assets/js/<bundle>.js` + `Assets/css/<file>.css` →
  `E:/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/{js,css}/`.
- .NET: `dotnet build MegaForm.Oqtane.Server` / `…Client` `-c Release`; copy `*.Oqtane.dll`+`MegaForm.Core.dll`
  to the site root; restart `Oqtane.Server.exe --urls http://localhost:5005` (env `MEGAFORM_ALLOW_LOCAL_CLI=1`).
- Bump `?v=` for your bundle in `Index.razor` (Stream 0/D coordinates Index.razor edits — others request a bump).
- Headless QA: `MegaForm.UI/tools/mf-hb.cjs --eval tools/<scn>.cjs` (fresh ctx, host/Minh@2002). Test your
  surface in **de-DE** (overflow) AND **ar-SA** (RTL): set locale via `?` or
  `localStorage`/`window.MegaFormLocale`, screenshot, confirm no overlap/clipping and correct direction.

## Status board (update as streams are claimed/finished)
- Stream 0 — Foundation: **IN PROGRESS (lead AI)**
- Stream A — Runtime+Widgets: UNCLAIMED
- Stream B — Builder: UNCLAIMED
- Stream C — Dashboard/AI: **CLAIMED** (2026-06-10)
- Stream D — Server/Razor: **CLAIMED** (2026-06-10)
- Stream E — Locale content: UNCLAIMED
