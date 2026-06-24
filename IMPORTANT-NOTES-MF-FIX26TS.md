# MegaForm — Important Notes (Fix26ts Series)

> **Rule**: Vite TS / C# only. Never patch compiled JS directly — always rebuild from source.
> Check badge exists in bundle JS before delivering zip. MINIMAL CHANGE. CORE single trust.

---

## [TD-savefix] Theme Designer SaveTheme returns 400 on cross-form ?formid=N pages

**Symptom:** User edits CSS in Theme Designer, clicks Save — CSS appears in live preview but
is lost after page reload. No error shown to user.

**Root cause:**
- Theme Designer is opened on a DNN page (e.g. `/M2?formid=36`) where the module renders
  a *different* form than its own (via `?formid=N` query param).
- `window.__MF_PLATFORM__.platform` may not be set to `'dnn'` in this context.
- The original code only adds DNN antiforgery headers (`RequestVerificationToken`, `TabId`,
  `ModuleId`) when `platform === 'dnn'`.
- Without these headers DNN WebAPI `[ValidateAntiForgeryToken]` rejects the request → **400**.
- `setDirty(false)` is never called → "Unsaved changes" warning on back navigation.

**Fix (TD-20260410-savefix01)** in `MegaForm.UI/src/theme-designer/index.ts`:
```
// Before: only applied auth headers if platform === 'dnn'
// After: also applies if jQuery.ServicesFramework is available (DOM fallback)
// moduleId resolved from: __MF_PLATFORM__ → mf-dnn-host el → [data-module-id] in DOM
```

**Key logic:**
```ts
const moduleId = mfp?.moduleId || parseInt(
  document.getElementById('mf-dnn-host')?.dataset.moduleId ||
  document.querySelector('[data-module-id]')?.dataset.moduleId || '0', 10
) || 0;
if ((platform === 'dnn' || jq?.ServicesFramework) && moduleId && jq?.ServicesFramework) {
  // apply antiforgery headers
}
```

**Note:** `SaveTheme` C# endpoint (`MegaFormApiController`) saves by `FormId` (correct —
form-scoped, not module-scoped). The failure was purely in the TS auth header layer.

---

## [PB-embedfix] PersonaBar sidebar visible in embedded iframe (DNN)

**Symptom:** Dark 80px sidebar appears inside MegaForm iframe when embedded on external pages,
even when logged out.

**Root cause:** `#personaBar-iframe` is `position:fixed` inside the subdomain page.
The `body > *` selector in `mf-embed-host-style` doesn't reach it because it's nested
inside `#ctl01_PersonaBarPanel > #Form`.

**Fix (ChromelessEmbedHost v20260410-01)** in `megaform-renderer.ts` → `activateHostedEmbedMode()`:
```css
#personaBar-iframe,.personaBarContainer,#ctl01_PersonaBarPanel,
[id*="personaBar"],[class*="personaBar"] { display:none!important; width:0!important; min-width:0!important; }
```
Also resets `body.mf-embed-host-route { margin-left: 0 }` to remove the 80px DNN sidebar offset.

---

## [ES-themefix] Theme Designer CSS overridden by embed shell — visual props stripped

**Symptom:** Theme Designer CSS (background, shadow, radius) saved correctly but lost on reload
when form uses a custom HTML template (`mf-custom-html-mode`).

**Root cause:** `bindSubmit()` in `megaform-renderer.ts` — when `settings.customHtml` is set,
injects `formEl.style.cssText += ';background:none;box-shadow:none;border:none;border-radius:0'`
as inline style. Inline style beats CSS vars → theme appears reset.

**Fix (ChromelessEmbedHost v20260410-02)** — MINIMAL CHANGE:
```ts
// Before:
formEl.style.cssText += ';padding:0;margin:0;background:none;box-shadow:none;border:none;border-radius:0;'
// After (layout only, visual props preserved):
formEl.style.cssText += ';padding:0;margin:0;'
```
Custom HTML template CSS handles its own visual styling — renderer must not override it.

---

## [ES-embedshell] embed shell overwrites Theme Designer background/shadow on wrapper

**Symptom:** Form background color and box-shadow set via Theme Designer not visible in
embed/chromeless mode.

**Root cause:** `mf-embed-host-style` CSS block:
```css
[data-mf-embed-shell] { background:transparent!important; box-shadow:none!important; }
[data-mf-embed-shell] .mf-form-wrapper { background:transparent!important; box-shadow:none!important; border-radius:0!important; }
```
These `!important` rules win over CSS vars set by Theme Designer.

**Fix (ChromelessEmbedHost v20260410-02):**
- Removed `background:transparent!important` and `box-shadow:none!important` from
  `[data-mf-embed-shell]` and `.mf-form-wrapper` rules.
- `body.mf-embed-host-route { background:transparent }` intentionally kept — body itself
  should be transparent so iframe blends with parent page background.

---

## [SC-iframescroll] Embed iframe snippet (from embed modal) causes scrollbar

**Symptom:** Plain `<iframe>` snippet from the "Get embed code" modal shows scrollbar inside
the iframe because no auto-resize handler is attached.

**Fix (Iframe resize v20260410-02)** in `MegaForm.UI/src/dashboard/embed-modal.ts`:
- `getIframeCode()` replaced plain `<iframe>` with `<div>` wrapper + `scrolling="no"` +
  inline `<script>` listening to `mf:resize` postMessage.
- Message type must be `mf:resize` (colon), NOT `mf-resize` (hyphen).
- Guard: `e.source !== iframe.contentWindow` prevents cross-iframe pollution.

---

## Badge Reference Table (as of v20260410)

| File | Badge | Value |
|---|---|---|
| `megaform-renderer.ts` | `CHROMELESS_EMBED_HOST_BADGE` | `ChromelessEmbedHost v20260410-03` |
| `theme-designer/index.ts` | `BUILD_MARKER` | `TD-20260410-savefix01` |
| `dashboard/embed-modal.ts` | `IFRAME_RESIZE_BADGE` | `Iframe resize v20260410-02` |

---

## Build Rule Checklist (before delivering zip)

1. `grep` canonical badge in **TS source** — must match expected new value.
2. `grep` canonical badge in **ALL bundle JS copies** — must still show OLD value (untouched).
3. Only then repack zip.
4. After user runs `npm run build`, new JS bundles will reflect TS changes.

---

## [CS-coretrust] FormField C# model drops unknown TS properties — DNN schema serialize bug

**Symptom:** Builder settings like `optionColumns` (Checkbox/Radio column layout) are saved
correctly to DB but have no effect on rendered form. Also affects any future TS field property
not explicitly modelled in C#.

**Root cause (2 layers):**

1. `FormField` C# class had no `[JsonExtensionData]` — unknown JSON properties were silently
   dropped on `JsonConvert.DeserializeObject<FormSchema>()`.

2. `FormView.ascx` passed `JsonConvert.SerializeObject(ViewModel.Schema)` (C# object) to
   `MegaFormRenderer.init({ schema })` — this serialized only C#-known properties, losing
   everything else. **DNN-specific bug** — Oqtane/Web already used raw `resolvedRenderModel.SchemaJson`.

**Fix (C# only — 4 files):**

`MegaForm.Core/Models/FormSchema.cs`:
```csharp
// Explicit property
[JsonProperty("optionColumns")]
public int OptionColumns { get; set; }

// Future-proof: preserve ALL unknown TS field properties (CORE single trust)
[Newtonsoft.Json.JsonExtensionData]
public Dictionary<string, Newtonsoft.Json.Linq.JToken> ExtensionData { get; set; }
```

`MegaForm.DNN/ViewModels/ViewModels.cs`:
```csharp
// Raw JSON from RenderModelResolver — use this instead of serializing Schema C# object
public string ResolvedSchemaJson { get; set; }
```

`MegaForm.DNN/Views/FormView.ascx.cs`:
```csharp
vm.ResolvedSchemaJson = resolvedRenderModel?.SchemaJson ?? form.SchemaJson ?? "{}";
```

`MegaForm.DNN/Views/FormView.ascx` (both renderer init and view init):
```javascript
// Before: schema: <%= JsonConvert.SerializeObject(ViewModel.Schema) %>
// After:
schema: JSON.parse('<%= HttpUtility.JavaScriptStringEncode(ViewModel.ResolvedSchemaJson) %>'),
```

**Principle:** `resolvedRenderModel.SchemaJson` is the canonical schema — it goes through
`JObject` (not C# model), so ALL JSON properties are preserved. C# object is for server-side
logic only (validation, spam, workflow); renderer always gets the raw JSON.

**Audit result:** Only `optionColumns` found as builder-saves + renderer-reads but not in C# model.
`[JsonExtensionData]` prevents this class of bugs for all future TS-added field properties.

---

## [CS-extdata-warning] JsonExtensionData REMOVED — caused dashboard data to return {}

**Symptom:** After deploying the C# patch with `[JsonExtensionData]` on `FormField`,
the `data-dashboard` attribute was rendered as `"{}"` — all forms disappeared from
the MegaForm dashboard, Locked Forms pane gone, Recent Forms showed "0 total".

**Root cause of rollback:** `BuildDashboardJson()` has a bare `catch { return "{}"; }`.
The `[Newtonsoft.Json.JsonExtensionData]` attribute on `FormField` with
`Dictionary<string, Newtonsoft.Json.Linq.JToken>` type caused a runtime serialization
exception that was silently swallowed by that catch block.

**Decision:** `[JsonExtensionData]` was removed. `OptionColumns` explicit property
(safe, no side effects) was retained.

**Future note:** If `[JsonExtensionData]` is needed in future, add it ONLY to the
net8.0/net9.0 target framework (not net472) OR add specific try/catch logging in
`BuildDashboardJson` first to surface the actual exception.

---

## [CS-dashboard-earlyreturn] Dashboard dữ liệu rỗng khi module không có form cấu hình

**Symptom:** `data-dashboard-json="{}"` — Dashboard hiển thị "0 total", "No forms yet",
Locked Forms pane không xuất hiện. Nhưng `data-forms-json` vẫn có đủ forms.

**Root cause:** Trong `FormView.ascx.cs`, `BuildDashboardJson(vm)` được gọi sau
`if (form == null) return vm;` (early return). Khi module không có form được config
(ví dụ module 390 trên Default.aspx dùng làm admin panel), `form = null` → early return
→ `DashboardJson` không bao giờ được set → ở lại `"{}"`.

`data-forms-json` được set trước early return nên vẫn có data.

**KHÔNG phải do patches C# của fix26ts** — đây là bug cũ trong code gốc.

**Fix (MINIMAL):** Move `if (vm.IsAdmin) DashboardJson = BuildDashboardJson(vm);` lên
TRƯỚC `if (form == null) return vm;`. Dashboard data dùng `GetFormsByPortal(PortalId)`
nên portal-scoped, không phụ thuộc vào form của module cụ thể.

**Scope:** Chỉ ảnh hưởng DNN. Web/Oqtane dùng API riêng.
