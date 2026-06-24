# HANDOFF — Theme & Layout in MegaForm Settings modal (+ 3 fixes)
Date: 2026-06-24 · Site: http://localhost:5070 (host / Minh@2002) · Oqtane.MSSQL3 (net10.0, Kestrel `Oqtane.Server.exe`)

> ⚠️ **OPEN / NOT YET CONFIRMED BY USER:** the theme/CSS change saved from the new modal section is **not yet visually confirmed on a real form in the browser**. Server output is correct (verified via raw HTML), but the Playwright iframe showed a *stale* color on premium forms — suspected browser HTTP-cache and/or the renderer JS re-applying a **cached `/api/MegaForm/Schema/{id}`**. **This is the #1 thing to verify next session** (see "Next session" below).

---

## What shipped this session (ALL deployed to live, ALL uncommitted)

### 1. ⭐ NEW FEATURE — Theme & Layout in the per-module Settings modal  *(focus of next session)*
Surface the Theme Designer's **16 presets** + **Max width** + **Field spacing** inside the *MegaForm Settings* popup. Saves to the **selected form** (`settings.theme` + `settings.themeCssOverrides`) → synced with the Theme Designer (same keys). Save is folded into the existing **"Save module settings"** button.

- **`MegaForm.UI/src/view-designer/settings-popup.ts`**
  - Module-level: `MF_PRESETS` (16, mirrors `builder/theme-left-rail.ts:302-317`), `MF_PRESET_COLOR_VAR_KEYS`, `mfPresetColorVars(p)` (4 swatch colors → full `--mf-*` palette: c0→primary group incl `--mf-primary-light`=c0+`26`, c1→text, c2→form-bg, c3→border, white→inverse), `mfReadPx`.
  - In `open()`: state `themeFormId/themeState/themeOverrides/themeDirty/themeLayoutExpanded`; `await loadFormTheme(current.formId)` on init + in the form-picker `onchange`; `loadFormTheme()`, `setLayoutVar()`, `buildThemeLayoutSection()` (preset grid + Max width select + Field spacing slider). `rerender()` appends it between "Module form" and "Current Form settings".
  - Save button: `if (themeDirty) await saveFormThemeLayout(...)` THEN `saveModuleConfig(...)`.
- **`MegaForm.UI/src/view-designer/shared.ts`**: `getFormThemeLayout(formId)` (GET `/api/MegaForm/Form/{id}`) + `saveFormThemeLayout(formId,theme,overrides)` (POST **`Form/SaveTheme`** `{FormId,ThemeId,ThemeJson,CssOverrides}` — safe patch, preserves schema/fields/title/status).
- **Build/deploy:** `cd MegaForm.UI && node scripts/build-entry.cjs settings-popup` → copies to repo wwwroot → I copied `megaform-settings-popup.js` to live `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\js\` (backup `.bak-pre-theme`). No DLL, no restart.

⭐ **CRITICAL design decision (honored "must actually work"):** Most Theme-Designer Layout vars are **dead** (`--mf-form-padding-y/section-gap/form-align/form-columns/border-show/shadow-show` = **0 CSS consumers**). The real card padding/radius/border/shadow on `.mf-form-inner` are **hardcoded** AND a megaform.css rule **strips card chrome whenever a non-default `mf-theme-*` class is present** ("themed = flat", megaform.css ~735-819). So only **`--mf-form-max-width`** + **`--mf-field-gap`** are reliably var-driven → I exposed only those two layout controls (dropped padding/border/shadow). If you want those to work you must var-ify `.mf-form-inner` AND change the theme-strip rule — risky global CSS change, deferred.

**QA done (5 forms — std: 744 Contact, 715 pt-trainer, 730 festa-italiana-native; premium: 749 patient/pure-grid, 713 rose row-based):**
- All 16 presets save (200) + persist `theme.id` + full `--mf-*` palette ✓
- Save persists on all 5 (incl premium) ✓
- **Server renders the new theme correctly on ALL 5** — verified via RAW `Invoke-WebRequest` of `/api/MegaForm/render/{id}` (e.g. 749 raw HTML = emerald `#10b981` 52×, `mf-theme-emerald`, 0 midnight; 713 raw = rose `#ec4899` 68×) ✓
- Standard forms in the live browser: preset color (submit btn) + max-width (`.mf-form-inner`) + field-gap (`.mf-field-group` margin) all apply ✓
- UI path: click preset tile → "Save module settings" → SaveTheme(form) + saveModuleConfig persisted ✓
- ⚠️ Max-width is overridden when a form's OWN customCss forces full-width (715 has `.mf-form-inner{max-width:none}`) — correct precedence.
- ⚠️ **Premium forms (749/713):** in the Playwright **iframe** `/render`, the browser showed a STALE color (749 midnight, 713 `#4a90d9`) even though the **raw server HTML was correct**. Root not nailed → **NEXT SESSION**: likely (a) browser HTTP-cache of `/render`, or (b) `megaform-renderer.js` runtime re-fetches `/api/MegaForm/Schema/{id}` (possibly cached) and re-applies the OLD theme over the correct SSR. If (b), real users could see stale theme after saving until the Schema cache expires — must confirm + fix.

### 2. B244 — form 749 green→midnight preset-swap flicker  (DONE, deployed: Core+Server+Client DLLs)
New `MegaForm.Core/Services/ThemeFirstPaintCssService.cs` (C# port of renderer theme CSS gen from `settings.themeCssOverrides`) wired into `Index.razor` `TryBuildSsrFormHtml` + `MegaFormController.RenderPage.cs` → SSR first-paint now renders the final theme (no swap). See `project_form749_css_preset_swap_flicker` memory.

### 3. Edit-mode top black gap  (DONE, deployed: Client DLL)
`Index.razor` ~271 edit-mode `<style>`: added `body:has(.fixed-top){padding-top:0!important}` (the OqtaneTheme `body{padding-top:7rem}` reserved space for its fixed navbar, but the edit-mode block makes the header sticky → empty band). See `project_editmode_top_gap_fix` memory.

### 4. AI form "Save & Use Now" HTTP 400  (DONE, deployed JS: megaform-dashboard.js)
`ai-form-creator.ts` `platformCfg()` now recovers `moduleId/siteId/platform` from `#mf-dashboard-root` data-* attrs (a render race left `__MF_PLATFORM__` without them → payload posted 0 → server 400). See `project_ai_form_save_http400_fix` memory.

---

## Live deploy state (what's running on :5070 right now)
- DLLs deployed (net10.0) to site root: `MegaForm.Core.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`, `MegaForm.Oqtane.Client.Oqtane.dll` (backups: `_mf_dll_backup_20260623_B244`, `_mf_dll_backup_20260623_topgap`).
- JS deployed to `…\wwwroot\Modules\MegaForm\js\`: `megaform-dashboard.js` (400 fix), `megaform-settings-popup.js` (theme/layout feature). Backups `.bak-pre-savefix`, `.bak-pre-theme`.
- All QA test forms restored to original themes. Module **1826 rebound to form 748** (the homepage; my earlier 400-fix test had auto-bound it to the deleted form 751 — fixed). Homepage renders 748 OK.

## Uncommitted code changes (branch `master`)
- `MegaForm.Core/Services/ThemeFirstPaintCssService.cs` (NEW)
- `MegaForm.Oqtane.Client/Index.razor` (B244 SSR theme + `_ssrWrapperClass` + edit-mode `body:has(.fixed-top)` gap fix)
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs` (B244 wiring + `JObject` using)
- `MegaForm.UI/src/dashboard/ai-form-creator.ts` (platformCfg DOM fallback)
- `MegaForm.UI/src/view-designer/settings-popup.ts` (Theme & Layout section)
- `MegaForm.UI/src/view-designer/shared.ts` (getFormThemeLayout/saveFormThemeLayout)
- Built JS bundles under `Assets/js/` + mirrored wwwroot copies.

---

## NEXT SESSION — to confirm the CSS/theme change actually works for the user
1. **Reproduce the user's flow in a clean browser** (clear cache / hard reload): open *MegaForm Settings* on a STANDARD form → pick a preset (e.g. Ocean) → Save module settings → page reloads → **confirm the form visibly changes color**. Standard forms should work (QA passed); confirm with the user watching.
2. **Investigate the premium / browser-stale issue:** after saving a theme, watch `megaform-renderer.js` boot on the real page — does it fetch `/api/MegaForm/Schema/{id}` and re-apply an OLD theme over the correct SSR? Check if `/Schema/{id}` (and/or `/render/{id}`) responses are HTTP-cached. The SSR (B244) is already correct; the suspect is the client hydration reading a cached schema. Fix = bust/disable that cache or have the renderer trust the SSR theme.
3. Decide whether to **var-ify `.mf-form-inner` card props** (+ relax the themed-flat strip rule) so padding/border/shadow controls can be added — only if the user wants those layout knobs (currently intentionally omitted).
4. Optional: also surface the same Theme & Layout section in the **builder form Settings tab** (the other option the user considered) if they want it in both places.
5. **Commit** all the above once confirmed (user hasn't asked to commit yet).

## Quick repro commands
- Build settings-popup: `cd MegaForm.UI && node scripts/build-entry.cjs settings-popup`
- Deploy JS: copy `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/megaform-settings-popup.js` → `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\js\`
- Open modal in-page (QA): `window.MFSettings.open({moduleId:1826, siteId:1})` (homepage module = 1826, form 748, SiteId 1)
- Theme save endpoint: `POST /api/MegaForm/Form/SaveTheme?authmoduleid=1826&authsiteid=1` body `{FormId,ThemeId,ThemeJson,CssOverrides}` (headers `X-OQTANE-MODULEID/SITEID`)
- Verify persisted: `GET /api/MegaForm/Form/{id}?authmoduleid=1826&authsiteid=1`
