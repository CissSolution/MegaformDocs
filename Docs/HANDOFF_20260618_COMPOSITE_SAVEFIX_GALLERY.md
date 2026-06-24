# HANDOFF — 2026-06-18 — Composite unify · Save-fix · dev.lock · Gallery bulk-create/upload

Live host: `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3` → http://localhost:5070 (host / `abc@ABC1024`).
Deploy/restart recipe: build → Stop-Process the MSSQL3 `Oqtane.Server.exe` PID only → copy DLLs to host ROOT + js to `wwwroot\Modules\MegaForm\js{,\bundles}` → `Start-Process Oqtane.Server.exe -WorkingDirectory <MSSQL3>` (binds :5070 in ~8s).
QA login: localhost (not 127.0.0.1), Playwright type creds slowly + real Login click (synthetic dispatch fails Blazor bind).

---

## CURRENT DEPLOY STATE (read first)

| Feature | Status | Asset ver |
|---|---|---|
| Composite unification (text-input family → `type:'Composite'`+presets) | ✅ DEPLOYED + verified live | B186 |
| Save button keeps form published | ✅ DEPLOYED + verified live | B187 |
| `dev.lock` markers created | ✅ done (host root + wwwroot) | — |
| Gallery: drag-drop upload + bulk-create button + `DevLockStatus` endpoint | ✅ DEPLOYED + live | **B189** |
| **B190 fix** (bulk-create made functional + SAFE) | ⚠️ **BUILT, NOT DEPLOYED** (user paused) | B190 (source) |

**Live = B189.** Source is ahead: `BUILDER_BUNDLE_VERSION` + `OqtaneCoreAssetVersion` are bumped to **B190** in source; `MegaForm.Oqtane.Server` DLL + `megaform-builder.js` for B190 are **built** (0 errors) but **not copied to the host / no restart done**.

⚠️ **Two live issues to be aware of:**
1. **The "Dev: Bulk Create Forms" button on B189 returns HTTP 400** ("requires a valid moduleId and siteId") on click — it is therefore HARMLESS (creates nothing). The B190 fix makes it actually work AND safe. Do not worry about the button on B189.
2. **Forms 16 ("Donor Interest Form") + 17 ("EuroYouth 2026 Application") were re-bound to the home module (ModuleId=1826)** by a QA `fetch()` against the *buggy* B189 endpoint (sent the headers manually). Result: the **home page now renders form 17 (EuroYouth)** instead of the Donor form, and form 16's schema was overwritten with the "Donor Interest Form" gallery-template content. User confirmed they have the original ("ko sao, tôi có form gốc"). **Restore steps in §5.**

---

## 1. Composite unification (B186) — DONE + LIVE

Folded the text-input control family into ONE composite engine, **each keeping its own separate palette tile** (user requirement: "Name/Email vẫn tách riêng control nhưng bản chất là composite"). User OVERRODE the research verdict ("don't collapse") and chose the full fold WITH compensation.

- `MegaForm.UI/src/renderer/helpers.ts`: 5 new single-part presets in `COMPOSITE_PRESETS` — `text/textarea/email/number/url`, scalar-safe `combine:(v)=>v.<key>||''`; `COMPOSITE_PRESET_META` rows (aliases `CompositeText/Textarea/Email/Number/Url`, same labels/icons/colors/sortOrder as old native plugins); `SCALAR_PRESET_BASETYPE` + `scalarPresetBaseType()`; `compositePartsFor` injects field placeholder + number min/max into the lone part.
- `src/builder/field-plugins/_index.ts`: native `Text/Textarea/Email/Number/Url` plugins → `category:'hidden'` (kept registered → legacy fields still render + get props); `Composite` plugin `settingsGroups` += `'validation'`.
- `src/renderer/inputs.ts`: single-part scalar composite seeds the part with `val` (prefill/edit fix); textarea part honours `p.rows`.
- `src/renderer/validation.ts`: `effectiveFieldType()` → scalar-preset Composite validates Email/Url format like its base type.
- SERVER C# compensation (so SDK/raw POST keep coverage):
  - `MegaForm.Core/Services/FormValidationService.cs` `case "Composite"`: validates combined value by preset (email/url/number incl numeric min/max) when `__mf_parts` absent.
  - `SubmissionIndexerService.cs` `EffectiveIndexType`: Composite preset `number`→ValueNumber, `dob`→ValueDate.
  - `AntiSpamService.cs` `IsScalarComposite`: preset `email`→disposable-email scoring, `textarea`→all-caps.
- **Value-format invariant preserved**: every field stores ONE scalar under `field.key` (combine→hidden `<input name=key>`; `__mf_parts` stripped before persist). Legacy native paths UNTOUCHED.
- Verified live: each palette tile → `createFieldFromTemplate` → `{type:'Composite',preset:'text'/…}`; native plugins hidden; B186 served. Empirical public-submit was blocked because the QA form (id 16) uses customHtml (bypasses schema render) — value-format is code-verified.
- Research report: `Docs/RESEARCH_20260618_COMPOSITE_UNIFY.md`. Memory: `project_20260618_composite_unify_research`.

## 2. Save button no longer unpublishes (B187) — DONE + LIVE

`MegaForm.UI/src/builder/toolbar.ts`: the "Save" button was hard-wired `saveForm('Draft')` → unpublished live forms. Fix: `currentFormStatus()` reads `#mf-builder-root[data-form-status]` (set on load by `dom.ts updateBuilderMeta`); Save now `saveForm(currentFormStatus(), {returnAfter:false, toast:'Saved!'})` — published stays published, never redirects; only Publish promotes+redirects. `saveForm(status, opts?)` gained `opts.returnAfter` (gates the publish redirect) + `opts.toast`. Verified live: Save on the published Donor form → reload `formStatus:'published'`, public has no "not published" banner. Memory: `project_20260618_save_keeps_published_fix`.

## 3. dev.lock — DONE

`AiFeatureGate.IsEnabled(webRoot, contentRoot)` checks those paths + `AppDomain.BaseDirectory`. Created:
- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\dev.lock` (host root = contentRoot/BaseDirectory) → enables AI assistant (powers app_batch/bulk **form** creation via chat) + verbose mode.
- `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\dev.lock` (for client-side `/dev.lock` fetch on Web; Oqtane can't serve it though — see §4).
⚠️ **Caveat**: on Oqtane the AI "Enabled" toggle (Dashboard→AI Settings), if explicitly saved, WINS over dev.lock (`AiAssistantController` line ~149). dev.lock is only the default-when-unsaved. If AI doesn't appear, toggle Enabled ON.

## 4. Gallery: upload + bulk-create (B188/B189 deployed, B190 fix built)

Two user reports on the New-Form template gallery (`?mfpanel=builder&new=1`):

### 4a. "Can't upload template" → ROOT CAUSE = OS file dialog opens BEHIND the fullscreen builder
The endpoint `POST /api/MegaForm/BuilderTemplates/UploadJson` EXISTS + works on Oqtane (`MegaFormController:885`, EditModule). The failure is purely the file picker opening behind the fullscreen builder window (clicking it N times = N stacked dialogs; matched the 9 stuck file-choosers seen in Playwright).
**FIX (B189, DEPLOYED): drag-and-drop zone.** `gallery.ts`: extracted `processTemplateUploadFile(file, cleanup)` (shared by picker + drop); `installTemplateDropZone(#tpl-gallery)` (dragenter/over/leave/drop, `.mf-tpl-dropover` dashed overlay injected once). Verified live: `dropZoneWired:true`, style injected. **Drop a .json/.zip on the gallery → uploads, no OS dialog.**

### 4b. "Don't see bulk create" → was platform-gated off + no dev.lock detection on Oqtane
- `gallery.ts supportsDevBulkCreate()` excluded oqtane → button never built. **FIX**: added `oqtane` (B188).
- Oqtane can't be probed for dev.lock: `/dev.lock` returns **404** (no `.lock` MIME), no `data-dev-lock` attr, no `__MF_PLATFORM__.ai`. **FIX (B189, DEPLOYED)**: new `GET /api/MegaForm/DevLockStatus` (`MegaFormController`, EditModule) returns `{devLock: AiFeatureGate.IsEnabled(...)}`; `gallery.ts hasDevLock()` special-cases oqtane to probe it. Verified live: `DevLockStatus → 200 {"devLock":true}`, button now **visible**.
- `POST /api/MegaForm/BuilderTemplates/DevBulkCreateForms` (`MegaFormController`) ported from DNN: per server-catalog template (`_templateCatalog.List()` = only the App_Data/MegaForm/Templates uploads, NOT the client-side preset cards), find-or-create + `_formRepo.SaveForm`.

### 4c. ⚠️ THE B190 FIX (built, NOT deployed — finish this next)
Two bugs in the B188/B189 bulk endpoint, found in QA:
1. **Gallery didn't send moduleId/siteId** → endpoint 400 (host's `AuthEntityId` returns 0). **FIX** `gallery.ts runDevBulkCreate()`: read `#mf-builder-root[data-module-id/data-site-id]`, send as `X-OQTANE-MODULEID`/`X-OQTANE-SITEID` headers (endpoint reads them as fallback) + body.
2. **Endpoint clobbered real forms + hijacked the module** (the §0 form-16/17 breakage): it titled seeds by the template DISPLAY title + matched existing forms by that title (→ matched real form 16) + set `entity.ModuleId = currentModule` (→ both forms bound to home module). **FIX** (mirrors `MegaForm.DNN BuilderTemplatesController.ApplyDevBulkTemplateToForm`): seeds are titled by **filename** (e.g. `donor.json`), carry a `settings.devBulkSeed.sourceFile` marker, matched via new `IsDevSeedMatch(FormInfo, sourceFile)` (marker first, else `Title==filename`), and saved **UNBOUND** (`entity.ModuleId = 0`). A real form (display title, no marker) is now NEVER matched/overwritten and seeds never hijack a module.

**B190 build state**: `megaform-builder.js` (gallery) ✅ built+synced; `MegaForm.Oqtane.Server` DLL ✅ built (0 err, confirms `FormInfo.SettingsJson` exists); `BUILDER_BUNDLE_VERSION`+`OqtaneCoreAssetVersion` bumped to B190 in source. **NOT built yet for B190**: loader bundle (run `npm run build:loader`) + Client DLL (`dotnet build MegaForm.Oqtane.Client -c Release`). **NOT deployed**: nothing copied to host, no restart.

---

## 5. TO RESTORE form 16 + the home page

The home module (ModuleId 1826) currently renders form 17 (EuroYouth) because both 16 & 17 got `ModuleId=1826`. User has the original form 16 backup.
Options (pick one):
- **User restores form 16 from their backup** (re-import via gallery upload or form import) and re-publishes it on the home module → re-binds + restores content. (User's stated plan.)
- **Or** unbind form 17 from module 1826 (set its ModuleId off 1826) so only form 16 claims the home module, then restore form 16's content. (Re-binding mechanism: opening a form in the builder + Publish auto-binds the module to it — `MegaFormController.SaveForm` ~line 420.)
- The **B190 safe endpoint does NOT touch 16/17** (no marker, not titled by filename), so future bulk-create runs won't worsen this.

---

## 6. NEXT STEPS (when resuming)

1. Finish B190 build: `npm run build:loader` + `dotnet build MegaForm.Oqtane.Client -c Release`.
2. Deploy B190: backup → stop MSSQL3 PID → copy `MegaForm.Oqtane.Server.Oqtane.dll` + `MegaForm.Oqtane.Client.Oqtane.dll` (both `bin/Release/net10.0`) to host root + `megaform-builder.js` + `megaform-builder-loader.js` (from `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js`) to host `wwwroot/Modules/MegaForm/js{,/bundles}` → restart.
3. QA the SAFE bulk-create: click "Dev: Bulk Create Forms" → confirm dialog → expect seeds titled by FILENAME, `ModuleId=0`, real forms (incl. 16/17) untouched, home unaffected. Verify drag-drop upload imports a .json.
4. Restore form 16 / home per §5.
5. Empirically submit-test the composite unified controls on a NON-customHtml form (the only composite QA gap — value-format is code-verified).

## Key gotchas learned this session
- Form 16 renders via **customHtml** → schema fields are bypassed on the public page; the builder `Save`/`buildPayload` rebuilds from canvas, so splicing `B.state.schema.fields` does NOT persist — delete fields via the canvas trash button (`.mf-canvas-field[data-key] .mf-delete-field`) then Save.
- Oqtane static server **404s `/dev.lock`** (no `.lock` MIME) — use the `DevLockStatus` API to detect dev mode client-side, not a file fetch.
- Oqtane resolves the module's form partly by `form.ModuleId` — setting it on multiple forms hijacks the module. Seeded/utility forms must be `ModuleId=0`.
- A builder bundle change needs BOTH `BUILDER_BUNDLE_VERSION` (loader requests builder at this `?v=`) AND `OqtaneCoreAssetVersion` (browser requests the loader at this `?v=`) bumped, + rebuild loader + Client DLL, else warm browsers keep the old loader→old builder.
- Playwright file-chooser events for an Oqtane fullscreen `<input type=file>` get STUCK in the MCP modal queue across navigations — cancel each with `browser_file_upload {paths:[]}`.
