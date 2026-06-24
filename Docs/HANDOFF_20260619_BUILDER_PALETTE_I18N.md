# HANDOFF — 2026-06-19 — Builder palette i18n (untranslated tiles) — B199

**Live:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`). Asset version **20260619-B199** (deployed + restarted). This continues the same session as i18n Phase 0 ([[project_20260619_i18n_phase0_gate_and_catalog]]).

## 1. PROBLEM (user, Hindi UI screenshot)
With the builder UI switched to Hindi, ~36 palette **tiles stayed English** (Money/Amount, Measurement, Price Range, Date Range, Address, Contact Block, Row/Columns, Flex Grid, the whole **Widgets** tab, etc.) while the mapped basic tiles WERE translated (दिनांक, ड्रॉपडाउन…). Asked to "làm 1 vòng kiểm tra và bổ sung" — find + fill all untranslated builder strings.

## 2. ROOT CAUSE
- Palette tile labels resolve via `MegaForm.UI/src/builder/core.ts` → `getLocalizedControlLabel(type, fallback)` which looked up a STATIC map `FIELD_I18N_KEYS` (only 16 basic types). Composites (`CompositeMoney`…), layout (`Row`/`FlexGrid`), and ALL widget-tab types had **no key → English fallback**.
- `Row`/`FlexGrid` had custom `renderPaletteItem` (field-plugins/_index.ts) with **hardcoded** labels (bypassed i18n).
- `Payment` tile rendered by a SECOND palette renderer in `canvas.ts` (~line 1223) with **hardcoded `"Payment"`** (ignored the already-localized `label`).

## 3. FIX (all deployed)
- **core.ts** `getLocalizedControlLabel`: when a type isn't in `FIELD_I18N_KEYS`, **derive `field.<snake(type)>`** (e.g. `CompositeMoney`→`field.composite_money`, `FlexGrid`→`field.flex_grid`) and `builderT(key, fallback)`. Falls back to English when the key is absent → zero regression; enables translation by just adding the catalog key. Propagates to canvas + property labels too.
- **field-plugins/_index.ts**: Row + FlexGrid `renderPaletteItem` now call `getLocalizedControlLabel`.
- **canvas.ts** (~1223): Payment tile uses `${label}` instead of hardcoded `"Payment"`.
- **Catalog**: added **36 `field.*` tile keys** to `en-US.json` (1153→**1189**) + translated into the **11 maintained locales** (workflow, 11 agents → 396 strings; validated placeholders, decoded entities). Acronyms kept (CAPTCHA/QR/PDF/OSM/BYOM/Razor). +3 hi-IN loanwords hand-fixed (ईमेल + पुष्टि, फ्लेक्स ग्रिड (12-कॉलम), मानचित्र (OSM)).
- **Cache busting (the tricky part):**
  - Locales lazy-load via `loadLocale()` which caches in **localStorage** keyed by `I18N_CACHE_VERSION` (was `20260612-3`) — checked BEFORE any network fetch. Bumped → **`20260619-4`** (`MegaForm.UI/src/i18n/index.ts`) so stale localStorage is dropped. This lives in the **separate `megaform-i18n.js`** bundle (used via `window.MegaFormI18n`), NOT the builder bundle.
  - `megaform-i18n.js` is loaded `?v=OqtaneCoreAssetVersion`. Bumped **B198→B199** (`Index.razor`) so warm browsers refetch it → new cache version → drop stale localStorage → fetch fresh JSON. Also bumped `BUILDER_BUNDLE_VERSION`→B199 (loader).
- **i18n gate stays GREEN** (`node tools/i18n-check.cjs` PASS, en-US=1189; 11 required locales full).

## 4. DEPLOYED TO LIVE (B199, restarted single :5070 PID)
- DLL: `MegaForm.Oqtane.Client.Oqtane.dll` (B199).
- Bundles (`wwwroot/Modules/MegaForm/js`): `bundles/megaform-builder.js` (derivation + Payment fix), `megaform-builder-loader.js` (B199), `megaform-i18n.js` (cache 20260619-4), `megaform-renderer.js`, `megaform-dashboard.js`, `megaform-submissions.js` (all rebuilt via full `npm run build`).
- Locale JSON synced to **9 dirs incl live** `builder/i18n` + `bundles/i18n` (en-US=1189; ar=1193).
- **Verified live (file + curl):** builder bundle has 0 hardcoded `mf-pi-label">Payment`; hi-IN.json serves धनराशि / रकम, भुगतान, फ्लेक्स ग्रिड, मानचित्र, ईमेल + पुष्टि, QR कोड.

## 5. VERIFICATION STATE
- **Browser QA (mid-task, hi-IN, after clearing stale localStorage):** palette went from 36 English → **46/50 Hindi**; remaining 4 were Payment (bypass) + 3 hi loanwords — **all fixed + deployed since**.
- ⬜ **Final visual reload PENDING** — right after the restart the builder page was slow to load (Blazor warm-up + a pre-existing `Form/Get?formId=494` 404 retry, unrelated to i18n) and the MCP browser timed out at 60s. File/curl verification is solid; **next session: open the builder in Hindi, NORMAL reload, confirm all tiles translated incl Payment.** (Warm browsers should now get it on a normal reload because B199 busts `megaform-i18n.js`; if not, one Ctrl+Shift+R.)

## 6. FOLLOW-UPS
- ⬜ DNN (`/DesktopModules/MegaForm/i18n` — different fetch path) + Umbraco i18n copies NOT synced (inactive platforms; need their own build/deploy).
- ⬜ Other maintained locales (de/pt/it/…) may keep a few English loanwords for these tiles (only **hi-IN** was spot-checked/fixed, since that's what the user viewed). Optional polish.
- ⬜ The pre-existing `Form/Get?formId=494` 404 in the builder console is unrelated to i18n (form-load endpoint) — worth a look separately.
- New tooling reusable: `tools/i18n-apply-patch.cjs`, `tools/i18n-sync-platforms.cjs`, `tools/git-hooks/pre-commit`, npm `i18n:check`.

## 7. SOURCE CHANGED (uncommitted)
`MegaForm.UI/src/builder/core.ts`, `builder/field-plugins/_index.ts`, `builder/canvas.ts`, `src/i18n/index.ts`, `src/loader/index.ts`, `public/i18n/{en-US + 11 locales}.json`, `MegaForm.Oqtane.Client/Index.razor`, rebuilt bundles in `Assets/js/**`.
