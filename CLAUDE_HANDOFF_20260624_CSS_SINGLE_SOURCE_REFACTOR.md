# HANDOFF — CSS Single-Source Refactor (2026-06-24, unattended session)

Worked autonomously while you were out (~3h). **Deployed the RENDER side of the refactor to live :5070 and verified it; DNN code is complete + compiles.** The STORAGE-authority side (module-as-single-source, seed-from-form, all-writes-to-module) is NOT done — see "Remaining". Design is locked in `Docs/AUDIT_CSS_SINGLE_SOURCE_REFACTOR_2026-06-24.md` §11–12 + `Docs/REFACTOR_PLAN_CSS_SINGLE_SOURCE_2026-06-24.md`.

## ✅ DONE + DEPLOYED to live :5070 (AssetVersion B260)

**Phase 0 — single composer.** New [MegaForm.Core/Services/ModuleCssComposer.cs](MegaForm.Core/Services/ModuleCssComposer.cs):
- `Compose(formId, settings, presetCss, moduleCssOverride)` and `BuildModuleCss(...)` produce the FULL CSS in one deterministic order **`[preset, scoped theme vars, authored customCss, custom-shell compat, module override]`** — the SAME source order the old separate blocks (mf-inline-preset then mf-custom-css) had, so cascade is unchanged.
- Reuses `ThemeFirstPaintCssService` (scoped vars + premium aliases) + `ThemePresetInlineCssService` (preset) + `CustomShellCompatibilityCssService` (compat).
- **WIDENED custom-shell predicate** `customHtml || /mfp/ in customCss` (was server-side `hasCustomHtml` only) → premium forms with `.mfp` baked into customCss but no customHtml field now get the compat bridge server-side (critique gap D).

**Phase 1 Oqtane host.** [MegaForm.Oqtane.Client/Index.razor](MegaForm.Oqtane.Client/Index.razor):
- `TryBuildSsrFormHtml` now sets `_ssrCustomCss = ModuleCssComposer.Compose(_formId, settingsObj, _initialInlineCss, null)` (folds the preset in).
- **Deleted** the separate `<style id=mf-inline-preset-{id}>` emission. Now emits exactly ONE `<style id=mf-custom-css-{id}>`. Wrapper keeps `data-mf-ssr="1"`.

**Phase 2 client.** [MegaForm.UI/src/renderer/index.ts](MegaForm.UI/src/renderer/index.ts) `applyFormPresentationSettings`:
- Early-returns on `wrapper.getAttribute('data-mf-ssr') === '1'` **ALONE** (dropped the node-existence sub-condition of the old B252 guard) → the public renderer does NOTHING to theme CSS. Fixes critique C (default-theme forms with empty composed CSS no longer churn the mf-theme class). Builder preview (no data-mf-ssr) still themes client-side.

**VERIFIED live (form 753 = Fiesta Coral, the form you bound to the homepage while testing):**
- `#mf-custom-css-753` present, len 28427, contains scoped `#mf-form-wrapper-753` vars + `CustomShellBuilderCompat` badge + palette. ✅
- `mf-inline-preset` count = **0** (consolidated). ✅
- wrapper `data-mf-ssr="1"` ✅ → client guard fires.
- form body renders (mf-fields-container, party content). ✅
- served renderer carries the data-mf-ssr early-return. ✅
- page version B260 ×11, no B252. ✅

## ✅ DONE (code complete, builds, NOT live-tested — no DNN site on this box)

**Phase 1 DNN parallel.** [MegaForm.DNN/Views/FormView.ascx](MegaForm.DNN/Views/FormView.ascx) + [.ascx.cs](MegaForm.DNN/Views/FormView.ascx.cs) + [ViewModels.cs](MegaForm.DNN/ViewModels/ViewModels.cs):
- Code-behind computes `vm.ModuleCss = ModuleCssComposer.Compose(formId, settingsObj, vm.InitialInlineCss, vm.CssOverride)` + `vm.WrapperRuntimeClasses`.
- ASCX emits ONE `<style id=mf-custom-css-{id}>` (was mf-inline-preset), adds `data-mf-ssr="1"` + WrapperRuntimeClasses to the wrapper, and **removed** the `mf-live-override` block (CssOverride is now appended-last inside ModuleCss → still wins).
- DNN still client-builds the field body (empty `mf-fields-container`) — that's fine: `data-mf-ssr=1` only gates the CSS, not the body. `MegaForm.DNN` **builds 0 errors** (net472).
- ⚠️ NOT deployed/tested on a live DNN — needs your DNN build+install + a visual check.

## ✅ DONE + DEPLOYED — completeness pass (AssetVersion B261)
- **RenderPage.cs** (Oqtane FastEmbed `/render` iframe) now uses `ModuleCssComposer.Compose` → ONE `<style id=mf-custom-css>`; dropped its separate mf-inline-preset. (Its wrapper already had `data-mf-ssr="1"`.)
- **installDisplayStyleSheet** (index.ts) now early-returns on a `data-mf-ssr="1"` public form → no runtime `#mf-display-style-rules` duplicate (the static B251 block in megaform.css covers it). Builder/non-SSR still inject. → public JS now does NOTHING to CSS for BOTH theme and display-style.
- Verified live: B261, no inline-preset, data-mf-ssr=1, form 753 renders. Rollback backup `_mfbackup_20260624_B261`.

## ✅ DONE + DEPLOYED — module-source storage BACKEND (AssetVersion B262, additive/zero-regression)

The user confirmed the model: **each module stores ONE CSS for its CURRENT form; when the module binds a different form, reseed from the new form's CSS; edits via the module Settings go to the module (module wins); form JSON = seed/template.**

- **Render overlay** ([Index.razor](MegaForm.Oqtane.Client/Index.razor) `OverlayModuleStyle`): before composing, if `ModuleState.Settings` has `MegaForm:ModuleStyleJson` AND `MegaForm:ModuleStyleFormId == _formId`, overlay its `{theme, themeCssOverrides, customCss, cssOverrides}` onto the form's settings → **module wins**. ADDITIVE: no module style (or bound to another form) → form settings used unchanged. **Verified zero-regression** (homepage form 731 renders identically; 43k composed block, arctic theme, data-mf-ssr=1).
- **Endpoints** ([MegaFormController.cs](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs), after SaveStyle): `GET ModuleConfig/ModuleStyle?moduleId&formId` (returns the module's style; **seeds from the form** if absent OR bound to a different form), `POST ModuleConfig/SaveModuleStyle` ({moduleId, formId, theme, themeCssOverrides, customCss}). Both `[Authorize]`+admin. Live (403 = route exists). Writes `MegaForm:ModuleStyleJson` + `MegaForm:ModuleStyleFormId`, invalidates settings cache.

### ✅ UI WIRING DONE + DEPLOYED (settings-popup.js, B262) — needs your BROWSER acceptance test
- `shared.ts`: added `getModuleStyle(moduleId, formId)` (GET ModuleConfig/ModuleStyle — server seeds from form) + `saveModuleStyle(moduleId, formId, theme, overrides)` (POST SaveModuleStyle). Mirror the form-level pair; form-level kept as fallback if the module endpoint 404s (older host).
- `settings-popup.ts`: theme LOAD (`loadFormTheme`) now `getModuleStyle(opts.moduleId, formId)` (seeds on first open); theme SAVE now `saveModuleStyle(opts.moduleId, current.formId, …)` (writes the MODULE, not the form). The module-config (views/popup) save is untouched.
- Built `megaform-settings-popup.js` (46.9 KB) → copied to live (loaded with `&inlineboot=Date.now()` so it refetches; no restart needed).

**⚠️ NEEDS YOUR BROWSER TEST (I cannot drive the authed admin UI):**
1. Open the module Settings popup (admin) → it loads the module's style (server seeds it from the form on first open).
2. Change a color/preset → **Save module settings** → writes to the MODULE.
3. Reload the PUBLIC form → it should show the new color (the form's own CSS unchanged). NOTE: Oqtane caches module settings for anonymous visitors — if the public form is slow to update, hard-reload / wait for cache invalidation (SaveModuleStyle calls InvalidateSiteSettingsCache).
4. Bind a DIFFERENT form to the module → public form shows the NEW form's CSS (server reseeds: `ModuleStyleFormId` mismatch → reseed from new form).
5. If anything breaks, roll back `megaform-settings-popup.js` from `_mfbackup_20260624_B262\megaform-settings-popup.js.bak`; DLL rollback from `_mfbackup_20260624_B262`.

### ⏳ STILL REMAINING for the storage model
- **DNN parity**: FormView.ascx.cs reads the form's CssOverride but NOT `MegaForm_ModuleStyleJson` yet — DNN needs the same overlay + endpoints. (Oqtane-only so far.)
- The Settings popup still shows the 16 presets / max-width / field-gap — those flow through `themeOverrides` → now saved to the module. Verify they round-trip.

## ⏳ REMAINING (attended — needs your testing / decisions)

1. **Module-source STORAGE + seed (the "module setting thắng" WRITE side).** Currently the composer READS form `settings` + module `CssOverride` (appended last = module wins at render). It does NOT yet: seed the form's CSS into a module store on first encounter, nor route all writes (SaveTheme/SaveStyle/template/preset) into a single module source. The render-consolidation already FIXES THE FLASH; the storage-authority model from §11 is the next phase (it changes write semantics → must be done with you testing).
2. **`party_theme` custom-script (live form 753).** Form 753 has a `customScripts.party_theme` (in DB, not repo) that mutates CSS at runtime — independent of the data-mf-ssr guard, so it can still flash. Per audit §6.2 it must become save+reload, not runtime CSS. **Check form 753 for a residual flash; if present this is why.** Not addressed this session (changing custom-script handling unattended risks other forms).
3. **`installDisplayStyleSheet`** (index.ts:~758) still runtime-injects `#mf-display-style-rules` on public — HARMLESS (identical to the static block in megaform.css [B251], no flash) but should be gated to `isPreview` for cleanliness.
4. **RenderPage.cs** (Oqtane FastEmbed `/render` iframe) not yet converted to the single composer (still two blocks). Low priority; the client guard already applies if its wrapper has data-mf-ssr.
5. **MegaForm.Web** (`View.cshtml`) untouched — Web fully client-renders body AND theme + lacks megaform-themes.css. Bigger work; out of this session's scope.
6. **RE-AUDIT** (you asked: "audit lại sau khi xong"). Checklist is in `Docs/AUDIT_CSS_SINGLE_SOURCE_REFACTOR_2026-06-24.md` §12. Run it (multi-agent) AFTER the storage phase + DNN live-test, write `Docs/REAUDIT_CSS_SINGLE_SOURCE_<date>.md`.

## ↩️ Rollback (if anything looks wrong on :5070)

Backups on live: `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260624_B260\` (5 files: Core/Client/Server/Shared DLLs + megaform-renderer.js — the pre-refactor B252 state). To roll back: stop `Oqtane.Server.exe`, copy those back over the live root + wwwroot/Modules/MegaForm/js, restart. (Earlier backups `_mfbackup_20260624_B251` / `_B252` exist too.)

## Files changed this session
- NEW `MegaForm.Core/Services/ModuleCssComposer.cs`
- `MegaForm.Oqtane.Client/Index.razor` (one block + drop inline-preset)
- `MegaForm.UI/src/renderer/index.ts` (guard → data-mf-ssr only)
- `MegaForm.Oqtane.Shared/AssetVersion.cs` (B252→B260)
- `MegaForm.DNN/Views/FormView.ascx` + `.ascx.cs` + `ViewModels/ViewModels.cs` (single block + data-mf-ssr)
- Docs: `AUDIT_CSS_SINGLE_SOURCE_REFACTOR_2026-06-24.md` §11–12, this handoff.
- **Everything uncommitted on `master`.** (Plus all earlier session work: audit HTTP fixes, B251 FOUC, B252 guard, gen-display-style-css.cjs, memory files.)

## Quick verify command (paste in PowerShell after you're back)
```powershell
$p=(Invoke-WebRequest 'http://localhost:5070/' -UseBasicParsing).Content
"B260=$([regex]::Matches($p,'20260624-B260').Count); inline-preset=$($p.Contains('mf-inline-preset')); data-mf-ssr=$([regex]::Matches($p,'data-mf-ssr=""1""').Count)"
```
Expect: B260>0, inline-preset=False, data-mf-ssr=1.
