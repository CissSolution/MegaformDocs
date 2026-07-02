# Claude Handoff - 2026-07-02 - MegaForm Header First-Paint Jank

## Current State

- Repo: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
- QA site: `http://localhost:5090/`
- Oqtane site path: `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.FreshQA.MSSQL`
- Login used for QA: `host / abc@ABC1024`
- Deployed package: `MegaForm.Oqtane.1.7.56.nupkg`
- Asset version: `20260702-B352`
- Public test form: `FormId=3`, title `asdas`, `hideHeader=false`, custom HTML active.

The site is intentionally left in the header-visible state (`hideHeader=false`) so the fixed behavior can be checked directly: the header is present from first paint and does not push fields down later.

## User-Reported Issue

The previous fix made the page stable when `Hide Form Header` was enabled, but it did not satisfy the real requirement. When the header is enabled, the header/title appeared after the form had already painted, pushing the first fields down and causing a visible jank.

The key user correction was: hiding the header is not enough. With header visible, the header must be server-rendered at the correct height from the first frame.

## Root Cause

The custom shell SSR did render the header container, but the form title token was empty in the initial HTML:

```html
<div class="mfp-card-header">
  <h1 class="mfp-form-title"></h1>
  <p class="mfp-form-desc"></p>
</div>
```

Then the JS renderer/hydration path later substituted `{{form:title}}` with `asdas`. That increased the header height after first paint, moving `Full Name` and the rest of the form down.

This was confirmed by comparing initial root HTML before the final fix:

- `http://localhost:5090/` had `.mfp-card-header`.
- It did not contain `asdas`.
- It contained an empty `<h1 class="mfp-form-title"></h1>`.

Standalone `/api/MegaForm/render/3` had the same underlying problem before the final C# fix.

## Fix Implemented

### 1. FormHtmlRenderer now receives persisted form metadata

File: `MegaForm.Core/Services/FormHtmlRenderer.cs`

`RenderFieldsBody(...)` now accepts optional fallback values:

```csharp
string formTitle = null,
string formDescription = null,
string submitButtonText = null
```

Those values are passed into `RenderCustomHtml(...)`, then into `ResolveFormTranslation(...)`.

Result: custom HTML tokens are filled during SSR:

- `{{form:title}}`
- `{{form:description}}`
- `{{form:submit}}`

Locale translations still override these values when a matching translation exists.

### 2. Oqtane host SSR passes DB form values into Core renderer

File: `MegaForm.Oqtane.Client/Index.razor`

The Oqtane module SSR path now calls:

```csharp
FormHtmlRenderer.RenderFieldsBody(
    schema,
    _formId,
    null,
    _ssrTitle,
    _ssrDescription,
    _ssrSubmitText)
```

This fixes the root module page, where the user saw the jank.

### 3. `/api/MegaForm/render/{id}` passes the same values

File: `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`

The standalone render endpoint now calls `RenderFieldsBody(...)` with:

- `form.Title`
- `form.Description`
- `resolved.SubmitButtonText`

This keeps iframe/fast-render parity with the Oqtane module page.

### 4. Version/package bump

- `MegaForm.Oqtane.Shared/AssetVersion.cs`: `20260702-B352`
- `MegaForm.Oqtane.Client/ModuleInfo.cs`: `1.7.56`
- `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec`: `1.7.56`

Release note added:

`v1.7.56 (20260702) - Custom-shell header first-paint parity...`

## Related Previous Fixes Carried Forward

These are still important and were included in the current source/package:

- `1.7.53/B349`: Oqtane Interactive one-pass SSR hydration. Renderer skips duplicate init once SSR DOM is hydrated; boot locks per container/form.
- `1.7.54/B350`: `hideHeader=true` prevents standard header emission in SSR and fallback renderer.
- `1.7.55/B351`: core CSS hides custom shell header selectors under `.mf-hide-header`:
  - `.mfp-card-header`
  - `.mfp-default-header`
  - `.mfp-header`
  - `.mfp-form-title`
  - `.mfp-form-desc`

## Visual QA Performed

### Build

Commands run:

```powershell
dotnet build 'MegaForm.Oqtane.Server\MegaForm.Oqtane.Server.csproj' -c Release
dotnet build 'MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj' -c Release
```

Both builds succeeded. Warnings are existing package/nullable warnings, not introduced by this fix.

### Package and deploy

Package created:

```text
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.Oqtane.Package\MegaForm.Oqtane.1.7.56.nupkg
```

Package copied to:

```text
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.FreshQA.MSSQL\Packages
```

Site restarted via `Oqtane.Server.exe`; `http://localhost:5090/` returned HTTP 200.

### Initial HTML verification

After deploy, root `http://localhost:5090/` initial response contains:

```html
<h1 class="mfp-form-title">asdas</h1>
```

It no longer contains:

```html
<h1 class="mfp-form-title"></h1>
```

It no longer contains unresolved `{{form:title}}`.

Standalone `/api/MegaForm/render/3` also contains:

```html
<h1 class="mfp-form-title">asdas</h1>
```

### Browser QA

Form state used:

```json
{
  "formId": 3,
  "title": "asdas",
  "hideHeader": false,
  "hasCustomHtml": true
}
```

Public DOM after load:

- `assetB352=true`
- `.mfp-card-header` exists and is visible.
- `.mfp-form-title` visible text is `asdas`.
- loading/skeleton is not visible.
- wrapper class:
  `mf-form-wrapper mf-custom-shell-mode mf-custom-html-mode mf-theme-pure-grid-premium`

Timeline from first `.mf-form-wrapper` attached:

```json
{
  "firstGroupYDelta": 0,
  "headerYDelta": 0,
  "headerVisibleAllSamples": true,
  "noLoadingVisibleAllSamples": true,
  "assetB352AllSamples": true
}
```

Samples:

- `t0`: header visible, title text `asdas`, first field Y `295`
- `t100`: header visible, title text `asdas`, first field Y `295`
- `t250`: header visible, title text `asdas`, first field Y `295`
- `t600`: header visible, title text `asdas`, first field Y `295`
- `t1200`: header visible, title text `asdas`, first field Y `295`
- `t2200`: header visible, title text `asdas`, first field Y `295`

QA artifacts saved in Codex outputs:

```text
C:\Users\Administrator\Documents\Codex\2026-07-02\handoff-cho-codex-claude-handoff-20260702\outputs\qa-5090-form3-b352-header-visible-browser.png
C:\Users\Administrator\Documents\Codex\2026-07-02\handoff-cho-codex-claude-handoff-20260702\outputs\qa-5090-form3-b352-header-t0000.png
C:\Users\Administrator\Documents\Codex\2026-07-02\handoff-cho-codex-claude-handoff-20260702\outputs\qa-5090-form3-b352-header-t2200.png
C:\Users\Administrator\Documents\Codex\2026-07-02\handoff-cho-codex-claude-handoff-20260702\outputs\qa-5090-form3-b352-header-visible-timeline.json
```

## What To Watch Next

1. Do not solve future header jank by hiding or fading header. The requirement is SSR parity: visible header must be present at correct size from first paint.
2. Keep JS role limited to bind-only/hydrate for this path. If JS inserts title/header after first paint, the bug returns.
3. If testing another form, check initial HTML, not just post-load DOM:
   - initial root HTML must contain the final title text inside the custom shell header.
   - there must be no unresolved `{{form:title}}`.
   - there must be no empty `<h1 class="mfp-form-title"></h1>` when the form title is non-empty.
4. Current repo has many unrelated dirty files. This handoff/commit only covers the targeted Oqtane MegaForm header first-paint fix and release bump.

## Current Site State For Claude

- `:5090` is running and HTTP 200.
- FormId `3` is published with header visible (`hideHeader=false`).
- This is deliberate for regression testing.
- Expected public screenshot: white form card shows `asdas` header immediately above `Full Name`; no late push-down.

